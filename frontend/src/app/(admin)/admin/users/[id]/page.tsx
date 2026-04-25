"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AxiosError } from "axios";
import { ArrowLeft, Clock3, ExternalLink, Loader2, ReceiptText, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { getUserDetail, type AdminUserDetail } from "@/lib/api/admin";
import { formatCurrency, formatDisplayMoney, formatVnd } from "@/lib/utils/currency";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { localizeServiceText } from "@/lib/utils/service-copy";
import type { ApiError } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function roleLabel(role: string): string {
  switch (role) {
    case "SUPER_ADMIN": return "Super Admin";
    case "ADMIN": return "Admin";
    case "SUPPORT": return "Hỗ trợ";
    default: return "Khách hàng";
  }
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    ADD_BALANCE: "Cộng số dư",
    DEDUCT_BALANCE: "Trừ số dư",
    SUSPEND_USER: "Tạm khóa tài khoản",
    UNSUSPEND_USER: "Mở khóa tài khoản",
    DELETE_USER: "Xóa tài khoản",
    UPDATE_ROLE: "Đổi vai trò",
    CONFIRM_DEPOSIT: "Xác nhận nạp tiền",
    REJECT_DEPOSIT: "Từ chối nạp tiền",
    RESET_CIRCUIT_BREAKER: "Reset Circuit Breaker",
    UPDATE_GLOBAL_MARGIN: "Cập nhật margin toàn cục",
    UPDATE_SERVICE_MARGIN: "Cập nhật margin dịch vụ",
    RESET_SERVICE_MARGIN: "Reset margin dịch vụ",
  };
  return map[action] ?? action;
}

function statusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (["ACTIVE", "CONFIRMED", "COMPLETED"].includes(status)) return "success";
  if (["PENDING", "PROCESSING", "IN_PROGRESS", "PARTIAL"].includes(status)) return "warning";
  if (["SUSPENDED", "BANNED", "FAILED", "ERROR", "CANCELED"].includes(status)) return "destructive";
  return "secondary";
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const currency = usePreferencesStore((s) => s.currency);
  const rateObj = useExchangeRateStore((s) => s.rate);
  const rate = rateObj?.rate ?? "25000";
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getUserDetail(params.id)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: AxiosError<ApiError>) => {
        if (!cancelled) setError(err.response?.data?.error || "Không thể tải chi tiết người dùng");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const totals = useMemo(() => {
    if (!data) return { depositVnd: 0, orderSpend: 0 };
    return {
      depositVnd: data.deposits.filter((deposit) => deposit.status === "CONFIRMED").reduce((sum, deposit) => sum + deposit.amountVnd, 0),
      orderSpend: data.orders.reduce((sum, order) => sum + Number(order.charge), 0),
    };
  }, [data]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-24 text-app-muted"><Loader2 className="mr-2 h-5 w-5 animate-spin text-brand-500" /> Đang tải chi tiết user...</div>;
  }

  if (error || !data) {
    return <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error || "Không tìm thấy user"}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link href="/admin/users" className="mb-4 inline-flex items-center gap-2 text-sm text-app-muted transition-colors hover:text-brand-500">
            <ArrowLeft className="h-4 w-4" /> Quay lại quản lý user
          </Link>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-500">
            <UserRound className="h-4 w-4" /> Chi tiết user
          </div>
          <h1 className="text-2xl font-bold text-app-fg sm:text-3xl">@{data.user.username}</h1>
          <p className="mt-2 text-sm text-app-muted">{data.user.email} · {data.user.phone || "Chưa thêm số điện thoại"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(data.user.status)}>{data.user.status}</Badge>
          <Badge variant="warning">{roleLabel(data.user.role)}</Badge>
          <Badge variant={data.user.isEmailVerified ? "success" : "secondary"}>{data.user.isEmailVerified ? "Email đã xác thực" : "Email chưa xác thực"}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Số dư hiện tại</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-brand-500">{formatDisplayMoney(data.user.balance, currency, rate)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Tổng đơn hàng</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-app-fg">{data.user.totalOrders}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Đã nạp confirmed</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-emerald-400">{formatVnd(totals.depositVnd)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Chi tiêu đơn gần đây</CardDescription></CardHeader><CardContent><p className="text-2xl font-bold text-app-fg">{formatDisplayMoney(totals.orderSpend.toString(), currency, rate)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-500" /> Thông tin tài khoản</CardTitle>
          <CardDescription>Thông tin định danh, ToS và thời gian cập nhật.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg border border-app-border p-3"><p className="text-app-muted">User ID</p><p className="mt-1 break-all font-mono text-xs text-app-fg">{data.user.id}</p></div>
          <div className="rounded-lg border border-app-border p-3"><p className="text-app-muted">ToS version</p><p className="mt-1 font-semibold text-app-fg">v{data.user.acceptedTosVersion}</p></div>
          <div className="rounded-lg border border-app-border p-3"><p className="text-app-muted">Ngày tạo</p><p className="mt-1 font-semibold text-app-fg">{formatDate(data.user.createdAt)}</p></div>
          <div className="rounded-lg border border-app-border p-3"><p className="text-app-muted">Lần cuối đăng nhập</p><p className="mt-1 font-semibold text-app-fg">{data.user.lastLoginAt ? formatDate(data.user.lastLoginAt) : "Chưa đăng nhập"}</p></div>
          <div className="rounded-lg border border-app-border p-3"><p className="text-app-muted">Cập nhật lần cuối</p><p className="mt-1 font-semibold text-app-fg">{formatDate(data.user.updatedAt)}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-brand-500" /> Lịch sử dịch vụ / đơn hàng</CardTitle>
          <CardDescription>50 đơn gần nhất, bao gồm link user đã áp vào dịch vụ.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.orders.length === 0 ? <Empty text="User chưa đặt đơn nào." /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Dịch vụ</TableHead><TableHead>Link</TableHead><TableHead>SL</TableHead><TableHead>Charge</TableHead><TableHead>Trạng thái</TableHead><TableHead>Ngày tạo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell><p className="font-medium text-app-fg">{localizeServiceText(order.service.name, "vi")}</p><p className="text-xs text-app-muted">{localizeServiceText(order.service.category, "vi")}</p></TableCell>
                      <TableCell className="max-w-80"><a href={order.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-sm text-brand-500 hover:text-brand-400">{order.link}<ExternalLink className="h-3 w-3 shrink-0" /></a></TableCell>
                      <TableCell>{order.quantity.toLocaleString("vi-VN")}</TableCell>
                      <TableCell className="font-semibold text-app-fg">{formatDisplayMoney(order.charge, currency, rate)}</TableCell>
                      <TableCell><Badge variant={statusVariant(order.status)}>{order.status}</Badge></TableCell>
                      <TableCell className="text-sm text-app-muted">{formatDate(order.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-brand-500" /> Lịch sử nạp tiền</CardTitle>
            <CardDescription>50 yêu cầu VietQR gần nhất của user.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.deposits.length === 0 ? <Empty text="User chưa tạo yêu cầu nạp tiền." /> : (
              <div className="space-y-3">
                {data.deposits.map((deposit) => (
                  <div key={deposit.id} className="rounded-lg border border-app-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-mono font-semibold text-app-fg">{deposit.memo}</p><p className="mt-1 text-xs text-app-muted">{formatDate(deposit.createdAt)}</p></div>
                      <div className="text-right"><p className="font-bold text-brand-500">{formatVnd(deposit.amountVnd)}</p><Badge variant={statusVariant(deposit.status)}>{deposit.status}</Badge></div>
                    </div>
                    <p className="mt-2 line-clamp-1 text-xs text-app-muted">NH: {deposit.providerPaymentId || "—"} · TX: {deposit.transactionId || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-brand-500" /> Hoạt động / audit</CardTitle>
            <CardDescription>50 hoạt động audit gần nhất liên quan tới user này.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? <Empty text="Chưa có hoạt động audit." /> : (
              <div className="space-y-3">
                {data.activity.map((log) => {
                  const isSelf = log.actorId === data.user.id;
                  const actorName = log.actor ? `@${log.actor.username}` : "SYSTEM";
                  const actorRole = log.actor ? roleLabel(log.actor.role) : "Hệ thống";
                  const targetName = log.target ? `@${log.target.username}` : null;
                  return (
                    <div key={log.id} className="rounded-lg border border-app-border p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-sm text-app-fg">{actionLabel(log.action)}</p>
                        <p className="whitespace-nowrap text-xs text-app-muted shrink-0">{formatDate(log.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-app-muted">
                        <span>
                          Thực hiện bởi:{" "}
                          <span className={isSelf ? "text-brand-400 font-medium" : "text-app-fg font-medium"}>
                            {actorName}
                          </span>
                          {" "}({actorRole})
                        </span>
                        {targetName && targetName !== actorName && (
                          <span>Tác động lên: <span className="text-app-fg font-medium">{targetName}</span></span>
                        )}
                        <span>Entity: <span className="text-app-fg">{log.entity}</span></span>
                        {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-app-border p-6 text-center text-sm text-app-muted">{text}</div>;
}
