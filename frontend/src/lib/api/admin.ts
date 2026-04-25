import { api } from "./client";
import type { PaginatedResponse, UserRole } from "@/types/api";

export interface AdminStats {
  users: { total: number; active30d: number };
  orders: { total: number; completed: number };
  financials: {
    totalRevenue: string;
    totalProfit: string;
    totalDeposits: string;
  };
}

export type AnalyticsPeriod = "day" | "month";
export type AuditActorRoleTab = UserRole | "SYSTEM";

export interface AnalyticsMetricString {
  current: string;
  previous: string;
  changePercent: number;
}

export interface AnalyticsMetricNumber {
  current: number;
  previous: number;
  changePercent: number;
}

export interface AnalyticsSeriesPoint {
  bucket: string;
  revenue: string;
  profit: string;
  orders: number;
  users: number;
  deposits: string;
}

export interface AdminAnalytics {
  period: AnalyticsPeriod;
  range: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
  };
  summary: {
    revenue: AnalyticsMetricString;
    profit: AnalyticsMetricString;
    orders: AnalyticsMetricNumber;
    newUsers: AnalyticsMetricNumber;
    deposits: AnalyticsMetricString;
  };
  series: AnalyticsSeriesPoint[];
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  phone?: string | null;
  balance: string;
  role: UserRole;
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  createdAt: string;
  totalOrders: number;
  totalTransactions: number;
}

export interface AuditLogUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  targetId: string | null;
  action: string;
  entity: string;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: AuditLogUser | null;
  target: AuditLogUser | null;
}

export interface AdjustBalanceResponse {
  message: string;
  userId: string;
  adjustment: { type: "ADD" | "DEDUCT"; amount: string };
  previousBalance: string;
  newBalance: string;
  transactionId: string;
}

export interface CircuitBreakerStatus {
  isOpen: boolean;
  recentFailures: number;
  ttlSeconds: number;
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole | "";
  status?: AdminUser["status"] | "";
}

export type DepositStatus = "PENDING" | "CONFIRMED" | "EXPIRED" | "FAILED";

export interface AdminDepositRequest {
  id: string;
  userId: string;
  memo: string;
  amountVnd: number;
  status: DepositStatus;
  providerPaymentId: string | null;
  transactionId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  user: Pick<AdminUser, "id" | "email" | "username" | "balance" | "role" | "status">;
}

export interface GetDepositsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: DepositStatus | "";
}

export interface ConfirmDepositResponse {
  message: string;
  depositId: string;
  userId: string;
  amount: string;
  previousBalance: string;
  newBalance: string;
  transactionId: string;
}

export interface AdminUserDetail {
  user: AdminUser & {
    acceptedTosVersion: string;
    isEmailVerified: boolean;
    updatedAt: string;
    totalDeposits: number;
  };
  orders: Array<{
    id: string;
    link: string;
    quantity: number;
    charge: string;
    cost: string;
    status: string;
    startCount: number | null;
    remains: number | null;
    apiOrderId: string | null;
    createdAt: string;
    updatedAt: string;
    service: { id: string; name: string; category: string; type: string };
  }>;
  deposits: Array<{
    id: string;
    memo: string;
    amountVnd: number;
    status: DepositStatus;
    providerPaymentId: string | null;
    transactionId: string | null;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: string;
    balanceAfter: string;
    orderId: string | null;
    description: string;
    createdAt: string;
  }>;
  activity: AuditLog[];
}

export interface AdminPricingService {
  id: string;
  providerServiceId: string;
  name: string;
  category: string;
  originalPrice: string;
  sellingPrice: string;
  profitMargin: string;
  isMarginOverride: boolean;
  minQuantity: number;
  maxQuantity: number;
  isActive: boolean;
  updatedAt: string;
}

export interface AdminPricingResponse extends PaginatedResponse<AdminPricingService> {
  globalDefaultMargin: string;
}

export interface GetPricingParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  overrideOnly?: boolean;
  active?: boolean | "";
}

export async function getAuditLogs(
  page: number = 1,
  limit: number = 20,
  actorRole?: AuditActorRoleTab,
): Promise<PaginatedResponse<AuditLog>> {
  const res = await api.get<PaginatedResponse<AuditLog>>("/admin/logs", {
    params: { page, limit, actorRole },
  });
  return res.data;
}

export async function getStats(): Promise<AdminStats> {
  const res = await api.get<AdminStats>("/admin/stats");
  return res.data;
}

export async function getAnalytics(period: AnalyticsPeriod): Promise<AdminAnalytics> {
  const res = await api.get<AdminAnalytics>("/admin/analytics", {
    params: { period },
  });
  return res.data;
}

export async function getUsers(params: GetUsersParams = {}): Promise<PaginatedResponse<AdminUser>> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  };
  if (params.search) query.search = params.search;
  if (params.role) query.role = params.role;
  if (params.status) query.status = params.status;
  const res = await api.get<PaginatedResponse<AdminUser>>("/admin/users", { params: query });
  return res.data;
}

export async function fetchAdminDeposits(params: GetDepositsParams = {}): Promise<PaginatedResponse<AdminDepositRequest>> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  };
  if (params.search) query.search = params.search;
  if (params.status) query.status = params.status;
  const res = await api.get<PaginatedResponse<AdminDepositRequest>>("/admin/deposits", { params: query });
  return res.data;
}

export async function confirmAdminDeposit(
  depositId: string,
  payload: { providerPaymentId?: string; note?: string } = {},
): Promise<ConfirmDepositResponse> {
  const res = await api.post<ConfirmDepositResponse>(`/admin/deposits/${depositId}/confirm`, payload);
  return res.data;
}

export async function rejectAdminDeposit(depositId: string, reason: string): Promise<{ message: string; depositId: string; status: DepositStatus }> {
  const res = await api.post<{ message: string; depositId: string; status: DepositStatus }>(
    `/admin/deposits/${depositId}/reject`,
    { reason },
  );
  return res.data;
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  const res = await api.get<AdminUserDetail>(`/admin/users/${userId}`);
  return res.data;
}

export async function adjustBalance(
  userId: string,
  amount: number,
  type: "ADD" | "DEDUCT",
  description: string,
): Promise<AdjustBalanceResponse> {
  const res = await api.post<AdjustBalanceResponse>(
    `/admin/users/${userId}/balance`,
    { amount, type, description },
  );
  return res.data;
}

export async function suspendUser(
  userId: string,
  reason: string,
): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>(
    `/admin/users/${userId}/suspend`,
    { reason },
  );
  return res.data;
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<{ message: string; user: Pick<AdminUser, "id" | "username" | "role"> }> {
  const res = await api.post<{ message: string; user: Pick<AdminUser, "id" | "username" | "role"> }>(
    `/admin/users/${userId}/role`,
    { role },
  );
  return res.data;
}

export async function unsuspendUser(
  userId: string,
): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>(
    `/admin/users/${userId}/unsuspend`,
  );
  return res.data;
}

export async function deleteUser(userId: string): Promise<{ message: string; user: Pick<AdminUser, "id" | "username" | "email" | "status"> }> {
  const res = await api.delete<{ message: string; user: Pick<AdminUser, "id" | "username" | "email" | "status"> }>(`/admin/users/${userId}`);
  return res.data;
}

export async function getPricingServices(params: GetPricingParams = {}): Promise<AdminPricingResponse> {
  const query: Record<string, string | number | boolean> = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  };
  if (params.search) query.search = params.search;
  if (params.category) query.category = params.category;
  if (params.overrideOnly) query.overrideOnly = params.overrideOnly;
  if (params.active !== undefined && params.active !== "") query.active = params.active;
  const res = await api.get<AdminPricingResponse>("/admin/pricing", { params: query });
  return res.data;
}

export async function updateGlobalMargin(margin: number): Promise<{ message: string; margin: string; affectedServices: number }> {
  const res = await api.patch<{ message: string; margin: string; affectedServices: number }>(
    "/admin/pricing/default",
    { margin },
  );
  return res.data;
}

export async function updateServiceMargin(
  serviceId: string,
  margin: number,
): Promise<{ message: string; service: AdminPricingService }> {
  const res = await api.patch<{ message: string; service: AdminPricingService }>(
    `/admin/services/${serviceId}/pricing`,
    { margin },
  );
  return res.data;
}

export async function resetServiceMargin(serviceId: string): Promise<{ message: string; service: AdminPricingService }> {
  const res = await api.post<{ message: string; service: AdminPricingService }>(
    `/admin/services/${serviceId}/pricing/reset`,
  );
  return res.data;
}

export async function getCircuitBreaker(): Promise<CircuitBreakerStatus> {
  const res = await api.get<CircuitBreakerStatus>("/admin/circuit-breaker");
  return res.data;
}

export async function resetCircuitBreaker(): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>(
    "/admin/circuit-breaker/reset",
  );
  return res.data;
}
