"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Users, Search, Loader2, MoreHorizontal, DollarSign, Ban, CheckCircle, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import {
  getUsers,
  adjustBalance,
  suspendUser,
  unsuspendUser,
  updateUserRole,
  type AdminUser,
} from "@/lib/api/admin";
import type { ApiError, UserRole } from "@/types/api";
import { useAuthStore } from "@/lib/stores/auth-store";
import { formatCurrency } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function getStatusVariant(status: string): "success" | "destructive" | "secondary" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED" || status === "BANNED") return "destructive";
  return "secondary";
}

function getRoleBadge(role: string): "warning" | "secondary" | "destructive" | "success" {
  if (role === "SUPER_ADMIN") return "destructive";
  if (role === "ADMIN") return "warning";
  if (role === "SUPPORT") return "success";
  return "secondary";
}

function roleLabel(role: string): string {
  switch (role) {
    case "SUPER_ADMIN": return "Super Admin";
    case "ADMIN": return "Admin";
    case "SUPPORT": return "Hỗ trợ";
    default: return "Khách hàng";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "ACTIVE": return "Hoạt động";
    case "SUSPENDED": return "Tạm khóa";
    case "BANNED": return "Cấm";
    default: return status;
  }
}

function canManageRole(actorRole: string | undefined, targetRole: string): boolean {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "ADMIN") return targetRole === "USER" || targetRole === "SUPPORT";
  return false;
}

function canAssignRole(actorRole: string | undefined, role: UserRole): boolean {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "ADMIN") return role === "USER" || role === "SUPPORT";
  return false;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(value));
}

export default function UserManagementPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [statusFilter, setStatusFilter] = useState<AdminUser["status"] | "">("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [balanceDialog, setBalanceDialog] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [balanceForm, setBalanceForm] = useState({ amount: "", type: "ADD" as "ADD" | "DEDUCT", description: "" });
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [suspendDialog, setSuspendDialog] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [suspendReason, setSuspendReason] = useState("");
  const [isSuspending, setIsSuspending] = useState(false);
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; user: AdminUser | null; role: UserRole | null }>({ open: false, user: null, role: null });
  const [unsuspendDialog, setUnsuspendDialog] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUsers = useCallback(async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getUsers({ page, limit: pagination.limit, search: searchQuery || undefined, role: roleFilter, status: statusFilter });
      setUsers(res.data);
      setPagination(res.pagination);
    } catch {
      setError("Không thể tải danh sách người dùng.");
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit, roleFilter, searchQuery, statusFilter]);

  useEffect(() => { loadUsers(pagination.page); }, [pagination.page, pagination.limit, roleFilter, statusFilter]);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  const summary = useMemo(() => {
    const active = users.filter((u) => u.status === "ACTIVE").length;
    const suspended = users.filter((u) => u.status !== "ACTIVE").length;
    const pageBalance = users.reduce((sum, u) => sum + Number(u.balance), 0);
    return { active, suspended, pageBalance };
  }, [users]);

  const estimatedBalance = useMemo(() => {
    const current = Number(balanceDialog.user?.balance || 0);
    const amount = Number(balanceForm.amount || 0);
    return balanceForm.type === "ADD" ? current + amount : current - amount;
  }, [balanceDialog.user?.balance, balanceForm.amount, balanceForm.type]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }));
      loadUsers(1);
    }, 400);
  }

  function openBalanceDialog(user: AdminUser) {
    setBalanceDialog({ open: true, user });
    setBalanceForm({ amount: "", type: "ADD", description: "" });
    setOpenMenuId(null);
  }

  async function handleAdjustBalance() {
    if (!balanceDialog.user) return;
    const amt = parseFloat(balanceForm.amount);
    if (!amt || amt <= 0) return toast.error("Nhập số tiền hợp lệ.");
    if (!balanceForm.description.trim()) return toast.error("Description is required.");
    if (balanceForm.type === "DEDUCT" && amt > Number(balanceDialog.user.balance)) return toast.error("Không thể trừ quá số dư hiện tại.");
    setIsAdjusting(true);
    try {
      const res = await adjustBalance(balanceDialog.user.id, amt, balanceForm.type, balanceForm.description.trim());
      toast.success(res.message);
      setBalanceDialog({ open: false, user: null });
      loadUsers(pagination.page);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      toast.error(axiosErr.response?.data?.error || "Không thể điều chỉnh số dư.");
    } finally {
      setIsAdjusting(false);
    }
  }

  function openSuspendDialog(user: AdminUser) {
    setSuspendDialog({ open: true, user });
    setSuspendReason("");
    setOpenMenuId(null);
  }

  async function handleSuspend() {
    if (!suspendDialog.user) return;
    if (!suspendReason.trim()) return toast.error("Reason is required.");
    setIsSuspending(true);
    try {
      const res = await suspendUser(suspendDialog.user.id, suspendReason.trim());
      toast.success(res.message);
      setSuspendDialog({ open: false, user: null });
      loadUsers(pagination.page);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      toast.error(axiosErr.response?.data?.error || "Không thể tạm khóa người dùng.");
    } finally {
      setIsSuspending(false);
    }
  }

  async function confirmRoleChange() {
    if (!roleDialog.user || !roleDialog.role) return;
    try {
      const res = await updateUserRole(roleDialog.user.id, roleDialog.role);
      toast.success(res.message);
      setRoleDialog({ open: false, user: null, role: null });
      loadUsers(pagination.page);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      toast.error(axiosErr.response?.data?.error || "Không thể cập nhật vai trò.");
    }
  }

  async function confirmUnsuspend() {
    if (!unsuspendDialog.user) return;
    try {
      const res = await unsuspendUser(unsuspendDialog.user.id);
      toast.success(res.message);
      setUnsuspendDialog({ open: false, user: null });
      loadUsers(pagination.page);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      toast.error(axiosErr.response?.data?.error || "Không thể mở khóa người dùng.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-fg flex items-center gap-2"><Users className="h-6 w-6 text-brand-500" />Quản lý người dùng</h1>
        <p className="mt-1 text-sm text-app-muted">{pagination.total.toLocaleString("vi-VN")} tài khoản khớp bộ lọc</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm text-app-muted">Tổng khớp lọc</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-app-fg">{pagination.total}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-app-muted">Active trên trang</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-400">{summary.active}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-app-muted">Bị khóa trên trang</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-400">{summary.suspended}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-app-muted">Số dư trang này</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-brand-500">{formatCurrency(summary.pageBalance.toString())}</p></CardContent></Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_120px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
          <Input placeholder="Tìm username hoặc email..." value={searchQuery} onChange={handleSearchChange} className="pl-10" />
        </div>
        <Select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as UserRole | ""); setPagination((p) => ({ ...p, page: 1 })); }}>
          <option value="">Tất cả vai trò</option>
          <option value="SUPER_ADMIN">Super Admin</option><option value="ADMIN">Admin</option><option value="SUPPORT">Hỗ trợ</option><option value="USER">Khách hàng</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as AdminUser["status"] | ""); setPagination((p) => ({ ...p, page: 1 })); }}>
          <option value="">Tất cả trạng thái</option><option value="ACTIVE">Hoạt động</option><option value="SUSPENDED">Tạm khóa</option><option value="BANNED">Cấm</option>
        </Select>
        <Select value={String(pagination.limit)} onChange={(e) => setPagination((p) => ({ ...p, page: 1, limit: Number(e.target.value) }))}>
          <option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option>
        </Select>
      </div>

      {error && <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>}
      {isLoading && <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div>}

      {!isLoading && !error && users.length > 0 && (
        <>
          <div className="rounded-lg border border-app-border bg-app-card">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Người dùng</TableHead><TableHead>Hoạt động</TableHead><TableHead className="text-right">Số dư</TableHead><TableHead>Trạng thái</TableHead><TableHead>Vai trò</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
              <TableBody>
                {users.map((u) => {
                  const manageable = canManageRole(currentUser?.role, u.role);
                  return (
                    <TableRow key={u.id}>
                      <TableCell><div><p className="text-sm font-medium text-app-fg">{u.username}</p><p className="text-xs text-app-muted">{u.email}</p><p className="mt-1 text-xs text-app-muted">Tạo: {formatDate(u.createdAt)}</p></div></TableCell>
                      <TableCell><p className="text-sm text-app-fg">{u.totalOrders} đơn</p><p className="text-xs text-app-muted">{u.totalTransactions} giao dịch</p></TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-app-fg">{formatCurrency(u.balance)}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(u.status)}>{statusLabel(u.status)}</Badge></TableCell>
                      <TableCell><Badge variant={getRoleBadge(u.role)}>{roleLabel(u.role)}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="relative inline-block">
                          <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === u.id ? null : u.id); }} className="rounded-md p-1.5 text-app-muted hover:text-app-fg hover:bg-app-elevated transition-colors"><MoreHorizontal className="h-4 w-4" /></button>
                          {openMenuId === u.id && (
                            <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-app-border bg-app-card py-1 shadow-xl shadow-black/30">
                              {manageable && <button onClick={() => openBalanceDialog(u)} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-app-fg hover:bg-app-elevated"><DollarSign className="h-4 w-4" />Điều chỉnh số dư</button>}
                              {manageable && canAssignRole(currentUser?.role, "SUPER_ADMIN") && u.role !== "SUPER_ADMIN" && <button onClick={() => { setRoleDialog({ open: true, user: u, role: "SUPER_ADMIN" }); setOpenMenuId(null); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-app-elevated"><ShieldAlert className="h-4 w-4" />Đặt Super Admin</button>}
                              {manageable && canAssignRole(currentUser?.role, "ADMIN") && u.role !== "ADMIN" && <button onClick={() => { setRoleDialog({ open: true, user: u, role: "ADMIN" }); setOpenMenuId(null); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-brand-400 hover:bg-app-elevated"><Users className="h-4 w-4" />Đặt Admin</button>}
                              {manageable && canAssignRole(currentUser?.role, "SUPPORT") && u.role !== "SUPPORT" && <button onClick={() => { setRoleDialog({ open: true, user: u, role: "SUPPORT" }); setOpenMenuId(null); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-app-fg hover:bg-app-elevated"><Users className="h-4 w-4" />Đặt Hỗ trợ</button>}
                              {manageable && canAssignRole(currentUser?.role, "USER") && u.role !== "USER" && <button onClick={() => { setRoleDialog({ open: true, user: u, role: "USER" }); setOpenMenuId(null); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-app-fg hover:bg-app-elevated"><Users className="h-4 w-4" />Chuyển Khách hàng</button>}
                              {manageable && <div className="my-1 border-t border-app-border" />}
                              {manageable && (u.status === "SUSPENDED" ? <button onClick={() => { setUnsuspendDialog({ open: true, user: u }); setOpenMenuId(null); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-green-400 hover:bg-app-elevated"><CheckCircle className="h-4 w-4" />Mở khóa</button> : <button onClick={() => openSuspendDialog(u)} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-app-elevated"><Ban className="h-4 w-4" />Tạm khóa</button>)}
                              {!manageable && <p className="px-4 py-2 text-sm text-app-muted">Không có quyền thao tác</p>}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between"><p className="text-sm text-app-muted">Trang {pagination.page} / {pagination.totalPages || 1}</p><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))} disabled={pagination.page <= 1}>Trước</Button><Button variant="secondary" size="sm" onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))} disabled={pagination.page >= pagination.totalPages}>Tiếp</Button></div></div>
        </>
      )}

      {!isLoading && !error && users.length === 0 && <div className="flex flex-col items-center justify-center py-20"><Users className="h-12 w-12 text-app-muted mb-4" /><p className="text-lg font-medium text-app-fg">Không tìm thấy người dùng</p><p className="mt-1 text-sm text-app-muted">Thử bộ lọc khác</p></div>}

      <Dialog open={balanceDialog.open} onOpenChange={(open) => !open && setBalanceDialog({ open: false, user: null })}>
        <DialogContent onClose={() => setBalanceDialog({ open: false, user: null })}>
          <DialogHeader><DialogTitle>Điều chỉnh số dư</DialogTitle><DialogDescription>Điều chỉnh số dư cho @{balanceDialog.user?.username}. Số dư hiện tại: <span className="text-brand-500 font-semibold">{formatCurrency(balanceDialog.user?.balance || "0")}</span></DialogDescription></DialogHeader>
          <div className="space-y-4"><div className="space-y-2"><Label>Loại</Label><Select value={balanceForm.type} onChange={(e) => setBalanceForm((f) => ({ ...f, type: e.target.value as "ADD" | "DEDUCT" }))}><option value="ADD">Cộng tiền</option><option value="DEDUCT">Trừ tiền</option></Select></div><div className="space-y-2"><Label htmlFor="bal-amount">Số tiền</Label><Input id="bal-amount" type="number" placeholder="Nhập số tiền" value={balanceForm.amount} onChange={(e) => setBalanceForm((f) => ({ ...f, amount: e.target.value }))} min={0} step="0.01" /></div><div className="rounded-lg border border-app-border bg-app-elevated p-3 text-sm"><p className="text-app-muted">Số dư sau điều chỉnh</p><p className={`mt-1 text-lg font-bold ${estimatedBalance < 0 ? "text-red-400" : "text-app-fg"}`}>{formatCurrency(estimatedBalance.toString())}</p></div><div className="space-y-2"><Label htmlFor="bal-description">Adjustment description</Label><Input id="bal-description" placeholder="Mô tả lý do điều chỉnh" value={balanceForm.description} onChange={(e) => setBalanceForm((f) => ({ ...f, description: e.target.value }))} maxLength={500} /></div></div>
          <DialogFooter><Button variant="secondary" onClick={() => setBalanceDialog({ open: false, user: null })} disabled={isAdjusting}>Hủy</Button><Button variant={balanceForm.type === "DEDUCT" ? "destructive" : "default"} onClick={handleAdjustBalance} isLoading={isAdjusting}>{balanceForm.type === "ADD" ? "Xác nhận cộng tiền" : "Xác nhận trừ tiền"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspendDialog.open} onOpenChange={(open) => !open && setSuspendDialog({ open: false, user: null })}>
        <DialogContent onClose={() => setSuspendDialog({ open: false, user: null })}><DialogHeader><DialogTitle>Tạm khóa người dùng</DialogTitle><DialogDescription>Tạm khóa @{suspendDialog.user?.username}. Người dùng sẽ bị chặn dashboard và API access ngay lập tức.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="suspend-reason">Reason</Label><Input id="suspend-reason" placeholder="Lý do tạm khóa" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} maxLength={500} /></div><DialogFooter><Button variant="secondary" onClick={() => setSuspendDialog({ open: false, user: null })} disabled={isSuspending}>Hủy</Button><Button variant="destructive" onClick={handleSuspend} isLoading={isSuspending}>Tạm khóa</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={roleDialog.open} onOpenChange={(open) => !open && setRoleDialog({ open: false, user: null, role: null })}>
        <DialogContent onClose={() => setRoleDialog({ open: false, user: null, role: null })}><DialogHeader><DialogTitle>Đổi vai trò</DialogTitle><DialogDescription>Đổi @{roleDialog.user?.username} từ {roleDialog.user ? roleLabel(roleDialog.user.role) : ""} sang {roleDialog.role ? roleLabel(roleDialog.role) : ""}. {roleDialog.role === "SUPER_ADMIN" ? "Quyền Super Admin có toàn quyền hệ thống." : ""}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setRoleDialog({ open: false, user: null, role: null })}>Hủy</Button><Button variant={roleDialog.role === "SUPER_ADMIN" ? "destructive" : "default"} onClick={confirmRoleChange}>Xác nhận</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={unsuspendDialog.open} onOpenChange={(open) => !open && setUnsuspendDialog({ open: false, user: null })}>
        <DialogContent onClose={() => setUnsuspendDialog({ open: false, user: null })}><DialogHeader><DialogTitle>Mở khóa người dùng</DialogTitle><DialogDescription>Mở lại quyền truy cập dashboard và API cho @{unsuspendDialog.user?.username}?</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setUnsuspendDialog({ open: false, user: null })}>Hủy</Button><Button onClick={confirmUnsuspend}>Mở khóa</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
