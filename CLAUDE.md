# 3Flames SMM Panel

## Overview
SMM Panel Reseller web application. Middleman platform reselling social media services via TheYTlab provider API. Designed for 10,000+ concurrent users.

## Tech Stack
- **Runtime:** Node.js 20+ / TypeScript
- **Framework:** Express 5
- **Database:** PostgreSQL (Prisma ORM)
- **Job Queue:** BullMQ + Redis
- **Auth:** JWT + bcrypt
- **Validation:** Zod
- **Static Assets:** Cloudflare R2

## Architecture
Clean Architecture with modular domain boundaries:
```
src/
├── config/             # Environment & app configuration
├── modules/            # Domain modules (user, service, order, transaction, provider)
│   └── <module>/
│       ├── domain/         # Interfaces, entities, value objects
│       ├── application/    # Use cases, business logic
│       ├── infrastructure/ # DB repos, external API clients
│       └── presentation/   # HTTP controllers, routes, DTOs
├── shared/             # Cross-cutting: DB client, queue, logger
└── workers/            # Background jobs (sync-services, sync-orders, scheduler)
```

## Key Commands
```bash
npm run dev              # Start backend dev server on port 3000
npm run build            # Compile backend TypeScript
npm run db:migrate       # Run Prisma migrations
npm run db:generate      # Regenerate Prisma client
npm run db:seed          # Seed database
npm run worker:sync-services  # Manual service sync
npm run worker:sync-orders    # Manual order sync
npm --prefix frontend run dev -- --port 3001  # Start Next.js frontend
npm --prefix frontend run build               # Build Next.js frontend
```

## Verification / Runtime Rules
- The repo root is the backend. The Next.js UI lives in `frontend/`; run frontend commands with `npm --prefix frontend ...` or from that directory.
- Do not claim a frontend fix from `npm run build` alone; that only verifies the backend TypeScript build.
- For UI work, verify the running browser page at `http://localhost:3001` after starting the frontend with `npm --prefix frontend run dev -- --port 3001`.
- If `localhost:3001` renders plain unstyled HTML, first inspect the running process and `/_next/static/css/...` responses. A stale/corrupt `.next` cache can make CSS return a 404/500 page; clear `frontend/.next` and restart the frontend before changing Tailwind code.
- Do not run `npm --prefix frontend run build` while relying on an already-running Next dev server; the build rewrites `.next`. After a frontend build, restart `npm --prefix frontend run dev -- --port 3001` before browser verification.
- Run backend and frontend builds separately before reporting completion: `npm run build` and `npm --prefix frontend run build`.


## API Routes
```
PUBLIC:
  GET  /health                     — Health check
  POST /api/v1/auth/register       — Create account (rate limited: 10/15min)
  POST /api/v1/auth/login          — Get JWT token (rate limited: 10/15min)
  GET  /api/v1/services            — List active services (originalPrice hidden)

PROTECTED (JWT or X-Api-Key):
  GET  /api/v1/users/me            — User profile + balance
  GET  /api/v1/users/me/transactions — Transaction history (paginated)
  POST /api/v1/orders              — Place order (rate limited: 30/min)
  GET  /api/v1/orders              — Order history (paginated, ?status= filter)
  GET  /api/v1/orders/:id          — Single order detail
  GET  /api/v1/orders/stream       — SSE real-time order status updates
  POST /api/v1/upload              — Upload file to Cloudflare R2

WEBHOOK (Signature-verified, no JWT):
  POST /api/v1/webhooks/payment    — Crypto payment gateway callback (HMAC-SHA256)

ADMIN (JWT + ADMIN role):
  GET  /api/v1/admin/users         — List users (paginated, search, filter)
  POST /api/v1/admin/users/:id/balance — Manual balance adjust (via BalanceService)
  POST /api/v1/admin/users/:id/suspend — Suspend user (freezes all access)
  POST /api/v1/admin/users/:id/unsuspend — Reactivate suspended user
  GET  /api/v1/admin/stats         — System-wide revenue, profit, active users
  GET  /api/v1/admin/circuit-breaker — View circuit breaker status
  POST /api/v1/admin/circuit-breaker/reset — Manually re-enable order intake
```

## Rate Limits (Redis-backed)
- Global: 100 req/min per IP
- Auth endpoints: 10 req/15min per IP
- Order placement: 30 req/min per IP

## Circuit Breaker (Provider Downtime Protection)
- Tracks provider 5xx/timeout failures in Redis sorted set (sliding 2-min window)
- 5 failures in 2 minutes → trips breaker → sets `3f:maintenance:orders` flag with 30-min TTL
- `maintenanceGuard` middleware on POST /orders returns white-labeled 503
- Auto-recovers when TTL expires; admin can force reset via `/admin/circuit-breaker/reset`

## ToS Enforcement
- Users must accept ToS at registration (`accept_tos: true` required in Zod schema)
- `accepted_tos_version` stored on user record
- `requireCurrentTos` middleware on POST /orders blocks users with outdated ToS
- Bump `CURRENT_TOS_VERSION` env var to force re-acceptance system-wide

## Critical Invariants
1. **Balance mutations** use `SELECT ... FOR UPDATE` with `SERIALIZABLE` isolation — never modify balance outside `BalanceService`.
2. **Every balance change** MUST create a `Transaction` ledger entry with accurate `balanceAfter`.
3. **Selling price** = `originalPrice * (1 + profitMargin/100)` — recalculated automatically when provider prices change.
4. **Canceled orders** get full auto-refund. **Partial orders** get `(charge/quantity) * remains` refunded.
