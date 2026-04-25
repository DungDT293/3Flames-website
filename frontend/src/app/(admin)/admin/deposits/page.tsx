"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { CheckCircle2, Clock3, Loader2, RefreshCw, Search, WalletCards, XCircle } from "lucide-react";
import {
  confirmAdminDeposit,
  fetchAdminDeposits,
  rejectAdminDeposit,
  type AdminDepositRequest,
  type DepositStatus,
} from "@/lib/api/admin";
import { formatVnd } from "@/lib/utils/currency";
import type { ApiError } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_OPTIONS: Array<{ value: DepositStatus | ""; label: string }> = [
  { value: "", label: "Tất cả" },
  { value: "PENDING", label: "Đang chờ" },
  { value: "CONFIRMED", label: "Đã cộng" },
  { value: "FAILED", label: "Từ chối" },
  { value: "EXPIRED", label: "Hết hạn" },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: DepositStatus): string {
  switch (status) {
    case "PENDING":
      return "Đang chờ";
    case "CONFIRMED":
      return "Đã cộng";
    case "FAILED":
      return "Từ chối";
    case "EXPIRED":
      return "Hết hạn";
  }
}

function statusVariant(status: DepositStatus): "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "CONFIRMED":
      return "success";
    case "PENDING":
      return "warning";
    case "FAILED":
      return "destructive";
    case "EXPIRED":
      return "secondary";
  }
}

export default function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<AdminDepositRequest[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DepositStatus | "">("PENDING");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDeposit, setSelectedDeposit] = useState<AdminDepositRequest | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [providerPaymentId, setProviderPaymentId] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadDeposits = useCallback(async (page = pagination.page) => {
    setIsLoading(true);
    try {
      const res = await fetchAdminDeposits({ page, limit: pagination.limit, search: search.trim(), status });
      setDeposits(res.data);
      setPagination(res.pagination);
    } catch (error) {
      const err = error as AxiosError<ApiError>;
      toast.error(err.response?.data?.error || "Không thể tải danh sách nạp tiền");
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit, pagination.page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadDeposits(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadDeposits]);

  const summary = useMemo(() => {
    return deposits.reduce(
      (acc, deposit) => {
        const amount = Number(deposit.amountVnd);
        if (deposit.status === "PENDING") {
          acc.pendingCount += 1;
          acc.pendingAmount += amount;
        }
        if (deposit.status === "CONFIRMED") acc.confirmedCount += 1;
        if (deposit.status === "FAILED" || deposit.status === "EXPIRED") acc.closedCount += 1;
        return acc;
      },
      { pendingCount: 0, pendingAmount: 0, confirmedCount: 0, closedCount: 0 },
    );
  }, [deposits]);

  function openConfirm(deposit: AdminDepositRequest) {
    setSelectedDeposit(deposit);
    setProviderPaymentId(deposit.providerPaymentId || "");
    setNote("");
    setConfirmOpen(true);
  }

  function openReject(deposit: AdminDepositRequest) {
    setSelectedDeposit(deposit);
    setReason("");
    setRejectOpen(true);
  }

  async function handleConfirm() {
    if (!selectedDeposit) return;
    setIsSubmitting(true);
    try {
      await confirmAdminDeposit(selectedDeposit.id, {
        providerPaymentId: providerPaymentId.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success("Đã xác nhận và cộng tiền cho user");
      setConfirmOpen(false);
      await loadDeposits();
    } catch (error) {
      const err = error as AxiosError<ApiError>;
      toast.error(err.response?.status === 409 ? "Giao dịch đã được xử lý bởi admin khác" : err.response?.data?.error || "Không thể xác nhận nạp tiền");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReject() {
    if (!selectedDeposit) return;
    if (!reason.trim()) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }
    setIsSubmitting(true);
    try {
      await rejectAdminDeposit(selectedDeposit.id, reason.trim());
      toast.success("Đã từ chối yêu cầu nạp tiền");
      setRejectOpen(false);
      await loadDeposits();
    } catch (error) {
      const err = error as AxiosError<ApiError>;
      toast.error(err.response?.status === 409 ? "Giao dịch đã được xử lý bởi admin khác" : err.response?.data?.error || "Không thể từ chối nạp tiền");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-500">
            <WalletCards className="h-4 w-4" /> Nạp tiền
          </div>
          <h1 className="text-2xl font-bold text-app-fg sm:text-3xl">Theo dõi nạp tiền VietQR</h1>
          <p className="mt-2 max-w-2xl text-sm text-app-muted">
            Đối soát memo chuyển khoản và chỉ cộng số dư sau khi tiền đã về tài khoản ngân hàng.
          </p>
        </div>
        <Button variant="outline" onClick={() => loadDeposits()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Tải lại
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Đang chờ</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-400">{summary.pendingCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Tổng tiền chờ</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold text-brand-500">{formatVnd(summary.pendingAmount)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Đã cộng</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-400">{summary.confirmedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Đã đóng</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold text-app-fg">{summary.closedCount}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách yêu cầu</CardTitle>
          <CardDescription>Nhập memo, email hoặc username để tìm nhanh giao dịch cần đối soát.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-app-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm memo, email, username..."
                className="pl-10"
              />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value as DepositStatus | "")}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "ALL"} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-app-muted">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-brand-500" /> Đang tải yêu cầu nạp tiền...
            </div>
          ) : deposits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-app-border py-16 text-center text-sm text-app-muted">
              Chưa có yêu cầu nạp tiền phù hợp bộ lọc.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Memo</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Số tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Tạo lúc</TableHead>
                    <TableHead>Hết hạn</TableHead>
                    <TableHead>Mã NH</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deposits.map((deposit) => (
                    <TableRow key={deposit.id}>
                      <TableCell className="font-mono text-sm font-semibold text-app-fg">{deposit.memo}</TableCell>
                      <TableCell>
                        <div className="min-w-44">
                          <p className="font-medium text-app-fg">{deposit.user.username}</p>
                          <p className="text-xs text-app-muted">{deposit.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-brand-500">{formatVnd(Number(deposit.amountVnd))}</TableCell>
                      <TableCell><Badge variant={statusVariant(deposit.status)}>{statusLabel(deposit.status)}</Badge></TableCell>
                      <TableCell className="text-sm text-app-muted">{formatDate(deposit.createdAt)}</TableCell>
                      <TableCell className="text-sm text-app-muted">{formatDate(deposit.expiresAt)}</TableCell>
                      <TableCell className="max-w-36 truncate text-sm text-app-muted">{deposit.providerPaymentId || "—"}</TableCell>
                      <TableCell className="max-w-36 truncate text-sm text-app-muted">{deposit.transactionId || "—"}</TableCell>
                      <TableCell>
                        {deposit.status === "PENDING" ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => openConfirm(deposit)}>
                              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Xác nhận
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => openReject(deposit)}>
                              <XCircle className="mr-1.5 h-4 w-4" /> Từ chối
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end text-xs text-app-muted">
                            <Clock3 className="mr-1 h-4 w-4" /> Đã xử lý
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-app-border pt-4 text-sm text-app-muted">
            <span>Trang {pagination.page} / {Math.max(1, pagination.totalPages)} • {pagination.total} yêu cầu</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1 || isLoading} onClick={() => loadDeposits(pagination.page - 1)}>
                Trước
              </Button>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => loadDeposits(pagination.page + 1)}>
                Sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận cộng tiền</DialogTitle>
          </DialogHeader>
          {selectedDeposit && (
            <div className="space-y-4">
              <div className="rounded-xl border border-app-border bg-app-elevated p-4 text-sm">
                <p>Memo: <span className="font-mono font-semibold text-app-fg">{selectedDeposit.memo}</span></p>
                <p>User: <span className="font-semibold text-app-fg">{selectedDeposit.user.username}</span> · {selectedDeposit.user.email}</p>
                <p>Số tiền: <span className="font-semibold text-brand-500">{formatVnd(selectedDeposit.amountVnd)}</span></p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="providerPaymentId">Mã giao dịch ngân hàng (tuỳ chọn)</Label>
                <Input id="providerPaymentId" value={providerPaymentId} onChange={(e) => setProviderPaymentId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note">Ghi chú đối soát (tuỳ chọn)</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>Huỷ</Button>
            <Button onClick={handleConfirm} isLoading={isSubmitting}>Xác nhận và cộng tiền</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối yêu cầu nạp tiền</DialogTitle>
          </DialogHeader>
          {selectedDeposit && (
            <div className="space-y-4">
              <div className="rounded-xl border border-app-border bg-app-elevated p-4 text-sm">
                <p>Memo: <span className="font-mono font-semibold text-app-fg">{selectedDeposit.memo}</span></p>
                <p>Số tiền: <span className="font-semibold text-brand-500">{formatVnd(selectedDeposit.amountVnd)}</span></p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Lý do từ chối</Label>
                <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: chưa nhận được tiền / sai nội dung chuyển khoản" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={isSubmitting}>Huỷ</Button>
            <Button variant="destructive" onClick={handleReject} isLoading={isSubmitting}>Từ chối</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
