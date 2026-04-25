"use client";

import { useEffect, useState } from "react";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { KeyRound, Loader2, Lock, ReceiptText, Save, UserRound } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { changePassword, fetchTransactions, updateProfile } from "@/lib/api/auth";
import { formatDisplayMoney } from "@/lib/utils/currency";
import type { ApiError, Transaction } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function transactionVariant(type: string): "success" | "warning" | "secondary" | "destructive" | "default" {
  switch (type) {
    case "DEPOSIT":
    case "REFUND":
    case "ADMIN_CREDIT":
      return "success";
    case "PURCHASE":
    case "ADMIN_DEBIT":
      return "warning";
    default:
      return "secondary";
  }
}

function roleLabel(role: string | undefined): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN":
      return "Quản trị";
    case "SUPPORT":
      return "Hỗ trợ";
    case "USER":
      return "Khách hàng";
    default:
      return "—";
  }
}

export default function AccountPage() {
  const { user, balance, loadProfile } = useAuthStore();
  const currency = usePreferencesStore((s) => s.currency);
  const rate = useExchangeRateStore((s) => s.rate);

  const [email, setEmail] = useState(user?.email ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);

  useEffect(() => {
    setEmail(user?.email ?? "");
    setUsername(user?.username ?? "");
  }, [user?.email, user?.username]);

  useEffect(() => {
    let cancelled = false;
    fetchTransactions(1, 8)
      .then((res) => {
        if (!cancelled) setTransactions(res.data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Không thể tải lịch sử giao dịch");
      })
      .finally(() => {
        if (!cancelled) setTransactionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await updateProfile({ email, username });
      await loadProfile();
      toast.success("Đã cập nhật tài khoản");
    } catch (error) {
      const err = error as AxiosError<ApiError>;
      toast.error(err.response?.data?.error || "Không thể cập nhật tài khoản");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Đã đổi mật khẩu");
    } catch (error) {
      const err = error as AxiosError<ApiError>;
      toast.error(err.response?.data?.error || "Không thể đổi mật khẩu");
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-500">
          <UserRound className="h-4 w-4" /> Tài khoản
        </div>
        <h1 className="text-2xl font-bold text-app-fg sm:text-3xl">Quản lý tài khoản</h1>
        <p className="mt-2 max-w-2xl text-sm text-app-muted">
          Cập nhật thông tin đăng nhập, bảo mật và theo dõi các giao dịch gần đây.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin cá nhân</CardTitle>
              <CardDescription>Email và tên hiển thị dùng cho đăng nhập và hỗ trợ tài khoản.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="username">Tên người dùng</Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      minLength={3}
                      maxLength={30}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" disabled={isSavingProfile}>
                  {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Lưu thay đổi
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bảo mật</CardTitle>
              <CardDescription>Đổi mật khẩu định kỳ để bảo vệ tài khoản của bạn.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Mật khẩu mới</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  Đổi mật khẩu
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tổng quan</CardTitle>
              <CardDescription>Trạng thái hiện tại của tài khoản.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-app-border bg-app-elevated p-4">
                <p className="text-sm text-app-muted">Số dư</p>
                <p className="mt-1 text-3xl font-bold text-brand-500">
                  {formatDisplayMoney(balance, currency, rate?.rate)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-app-border p-3">
                  <p className="text-app-muted">Vai trò</p>
                  <p className="mt-1 font-semibold text-app-fg">{roleLabel(user?.role)}</p>
                </div>
                <div className="rounded-lg border border-app-border p-3">
                  <p className="text-app-muted">Trạng thái</p>
                  <p className="mt-1 font-semibold text-emerald-400">{user?.status === "ACTIVE" ? "Hoạt động" : user?.status}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5 text-brand-500" /> Giao dịch gần đây
              </CardTitle>
              <CardDescription>8 biến động số dư mới nhất.</CardDescription>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-app-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-500" /> Đang tải giao dịch...
                </div>
              ) : transactions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
                  Chưa có giao dịch nào.
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="rounded-lg border border-app-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Badge variant={transactionVariant(tx.type)}>{tx.type}</Badge>
                          <p className="mt-2 line-clamp-1 text-sm font-medium text-app-fg">{tx.description}</p>
                          <p className="mt-1 text-xs text-app-muted">{formatDate(tx.createdAt)}</p>
                        </div>
                        <p className="whitespace-nowrap text-sm font-bold text-brand-500">
                          {formatDisplayMoney(tx.amount, currency, rate?.rate)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
