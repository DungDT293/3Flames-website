import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/database';
import { logger } from '../../../shared/infrastructure/logger';

// ─────────────────────────────────────────────────────────────
// BALANCE SERVICE
//
// ALL balance mutations flow through this service.
// Uses Pessimistic Locking (SELECT ... FOR UPDATE) inside
// a SERIALIZABLE transaction to guarantee:
//   1. No double-spend under concurrent requests
//   2. balanceAfter in transactions is always accurate
//   3. Every mutation is logged in the ledger
// ─────────────────────────────────────────────────────────────

export interface BalanceMutationResult {
  previousBalance: Prisma.Decimal;
  newBalance: Prisma.Decimal;
  transactionId: string;
}

export class BalanceService {
  /**
   * Deduct balance for a service purchase.
   *
   * RACE CONDITION STRATEGY:
   * ────────────────────────
   * We use PostgreSQL's row-level locking with FOR UPDATE.
   * Inside an ISOLATION LEVEL SERIALIZABLE transaction:
   *
   *   1. SELECT balance FROM users WHERE id = $1 FOR UPDATE
   *      → This acquires an exclusive row lock. Any concurrent
   *        transaction trying to read the same row's balance
   *        will BLOCK here until this transaction commits/rolls back.
   *
   *   2. Validate: balance >= amount (in application code)
   *      → If insufficient, throw immediately (lock released on rollback).
   *
   *   3. UPDATE users SET balance = balance - $amount WHERE id = $1
   *      → Deduct using arithmetic on the locked value.
   *
   *   4. INSERT into transactions (ledger entry)
   *      → Record the mutation with balanceAfter for audit trail.
   *
   *   5. COMMIT → lock released, next queued transaction proceeds.
   *
   * WHY FOR UPDATE and not optimistic locking (version column)?
   * At 10k+ concurrent users, optimistic locking causes excessive
   * retry storms. Pessimistic locking serializes access per-user
   * (not globally) so throughput remains high — different users'
   * transactions execute in parallel, only same-user operations queue.
   */
  async deduct(
    userId: string,
    amount: Prisma.Decimal,
    orderId: string,
    description: string,
  ): Promise<BalanceMutationResult> {
    return prisma.$transaction(
      async (tx) => {
        // Step 1: Lock the user row for this transaction
        const [user] = await tx.$queryRaw<[{ id: string; balance: Prisma.Decimal }]>`
          SELECT id, balance FROM users WHERE id = ${userId}::uuid FOR UPDATE
        `;

        if (!user) {
          throw new Error(`User ${userId} not found`);
        }

        const currentBalance = new Prisma.Decimal(user.balance.toString());

        // Step 2: Validate sufficient balance
        if (currentBalance.lessThan(amount)) {
          throw new InsufficientBalanceError(userId, currentBalance, amount);
        }

        // Step 3: Deduct
        const newBalance = currentBalance.minus(amount);

        await tx.$executeRaw`
          UPDATE users SET balance = ${newBalance}::decimal, updated_at = NOW()
          WHERE id = ${userId}::uuid
        `;

        // Step 4: Ledger entry
        const transaction = await tx.transaction.create({
          data: {
            userId,
            type: TransactionType.PURCHASE,
            amount: amount.negated(),
            balanceAfter: newBalance,
            orderId,
            description,
          },
        });

        logger.info('Balance deducted', {
          userId,
          amount: amount.toString(),
          newBalance: newBalance.toString(),
          transactionId: transaction.id,
        });

        return {
          previousBalance: currentBalance,
          newBalance,
          transactionId: transaction.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      },
    );
  }

  /**
   * Credit balance (deposits, refunds, admin adjustments).
   * Same locking strategy — even credits must be serialized
   * per-user to keep balanceAfter accurate in the ledger.
   */
  async credit(
    userId: string,
    amount: Prisma.Decimal,
    type: TransactionType,
    description: string,
    orderId?: string,
  ): Promise<BalanceMutationResult> {
    return prisma.$transaction(
      async (tx) => {
        const [user] = await tx.$queryRaw<[{ id: string; balance: Prisma.Decimal }]>`
          SELECT id, balance FROM users WHERE id = ${userId}::uuid FOR UPDATE
        `;

        if (!user) {
          throw new Error(`User ${userId} not found`);
        }

        const currentBalance = new Prisma.Decimal(user.balance.toString());
        const newBalance = currentBalance.plus(amount);

        await tx.$executeRaw`
          UPDATE users SET balance = ${newBalance}::decimal, updated_at = NOW()
          WHERE id = ${userId}::uuid
        `;

        const transaction = await tx.transaction.create({
          data: {
            userId,
            type,
            amount,
            balanceAfter: newBalance,
            orderId,
            description,
          },
        });

        logger.info('Balance credited', {
          userId,
          amount: amount.toString(),
          type,
          newBalance: newBalance.toString(),
          transactionId: transaction.id,
        });

        return {
          previousBalance: currentBalance,
          newBalance,
          transactionId: transaction.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      },
    );
  }
}

export class InsufficientBalanceError extends Error {
  constructor(
    public readonly userId: string,
    public readonly currentBalance: Prisma.Decimal,
    public readonly requestedAmount: Prisma.Decimal,
  ) {
    super(
      `Insufficient balance: user ${userId} has ${currentBalance.toString()} but needs ${requestedAmount.toString()}`,
    );
    this.name = 'InsufficientBalanceError';
  }
}
