"use client";

import { useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { Eye, EyeOff, KeyRound, Mail, Search, ShieldCheck } from "lucide-react";
import { forgotPassword, lookupAccount, resetPassword } from "@/lib/api/auth";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import type { ApiError } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AccountLookupResult {
  email: string;
  username: string;
  phone?: string | null;
  isEmailVerified: boolean;
}

export default function RecoverAccountPage() {
  const isVietnamese = usePreferencesStore((state) => state.language === "vi");

  const [identifier, setIdentifier] = useState("");
  const [lookupResult, setLookupResult] = useState<AccountLookupResult | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resetError, setResetError] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLookup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (identifier.trim().length < 3) {
      setLookupError(isVietnamese ? "Nhập email, tên người dùng hoặc số điện thoại" : "Enter an email, username, or phone number");
      return;
    }

    setIsLookingUp(true);
    setLookupError("");
    setLookupResult(null);

    try {
      const res = await lookupAccount({ identifier: identifier.trim() });
      setLookupResult(res.account);
      setResetEmail(res.account.email);
    } catch (error) {
      const err = error as AxiosError<ApiError>;
      setLookupError(err.response?.data?.error || (isVietnamese ? "Không tìm thấy tài khoản phù hợp" : "No matching account found"));
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleSendOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim())) {
      setResetError(isVietnamese ? "Email không hợp lệ" : "Invalid email address");
      return;
    }

    setIsSendingOtp(true);
    setResetError("");

    try {
      const res = await forgotPassword({ email: resetEmail.trim() });
      setDevOtp(res.devOtp || null);
      if (res.devOtp) setOtp(res.devOtp);
      toast.success(isVietnamese ? "Mã đặt lại mật khẩu đã được gửi" : "Password reset code sent");
    } catch (error) {
      const err = error as AxiosError<ApiError>;
      setResetError(err.response?.data?.error || (isVietnamese ? "Không thể gửi mã đặt lại" : "Could not send reset code"));
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp.trim())) {
      setResetError(isVietnamese ? "Nhập mã OTP gồm 6 chữ số" : "Enter the 6-digit OTP code");
      return;
    }
    if (newPassword.length < 8) {
      setResetError(isVietnamese ? "Mật khẩu mới phải có ít nhất 8 ký tự" : "New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError(isVietnamese ? "Mật khẩu xác nhận không khớp" : "Passwords do not match");
      return;
    }

    setIsResetting(true);
    setResetError("");

    try {
      await resetPassword({ email: resetEmail.trim(), otp: otp.trim(), password: newPassword });
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setDevOtp(null);
      toast.success(isVietnamese ? "Đã đổi mật khẩu. Bạn có thể đăng nhập lại." : "Password changed. You can sign in now.");
    } catch (error) {
      const err = error as AxiosError<ApiError>;
      setResetError(err.response?.data?.error || (isVietnamese ? "Không thể đổi mật khẩu" : "Could not reset password"));
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isVietnamese ? "Tìm lại tài khoản" : "Find your account"}</CardTitle>
          <CardDescription>
            {isVietnamese
              ? "Nhập email, tên người dùng hoặc số điện thoại đã thêm vào tài khoản."
              : "Enter the email, username, or phone number linked to your account."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLookup}>
          <CardContent className="space-y-4">
            {lookupError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {lookupError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="identifier">{isVietnamese ? "Thông tin tài khoản" : "Account info"}</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={isVietnamese ? "email, username hoặc số điện thoại" : "email, username, or phone"}
                disabled={isLookingUp}
              />
            </div>
            {lookupResult && (
              <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-brand-400" />
                  <div className="space-y-1">
                    <p className="font-semibold text-app-fg">{isVietnamese ? "Đã tìm thấy tài khoản" : "Account found"}</p>
                    <p className="text-app-muted">Email: <span className="text-app-fg">{lookupResult.email}</span></p>
                    <p className="text-app-muted">Username: <span className="text-app-fg">{lookupResult.username}</span></p>
                    <p className="text-app-muted">
                      {isVietnamese ? "Xác thực email" : "Email verification"}: {lookupResult.isEmailVerified ? (isVietnamese ? "Đã xác thực" : "Verified") : (isVietnamese ? "Chưa xác thực" : "Not verified")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button type="submit" className="w-full" isLoading={isLookingUp}>
              <Search className="mr-2 h-4 w-4" />
              {isVietnamese ? "Tìm tài khoản" : "Find account"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isVietnamese ? "Quên mật khẩu" : "Forgot password"}</CardTitle>
          <CardDescription>
            {isVietnamese
              ? "Gửi mã OTP tới email, sau đó nhập mã để đặt mật khẩu mới."
              : "Send an OTP code to your email, then enter it to set a new password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {resetError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {resetError}
            </div>
          )}
          {devOtp && (
            <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                {isVietnamese ? "Mã OTP môi trường test" : "Development OTP"}
              </p>
              <p className="mt-2 font-mono text-3xl font-black tracking-[0.35em] text-brand-400">{devOtp}</p>
            </div>
          )}

          <form onSubmit={handleSendOtp} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">Email</Label>
              <Input
                id="resetEmail"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isSendingOtp}
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" isLoading={isSendingOtp}>
              <Mail className="mr-2 h-4 w-4" />
              {isVietnamese ? "Gửi mã đặt lại" : "Send reset code"}
            </Button>
          </form>

          <form onSubmit={handleResetPassword} className="space-y-3 border-t border-app-border pt-5">
            <div className="space-y-2">
              <Label htmlFor="otp">OTP</Label>
              <Input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                disabled={isResetting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{isVietnamese ? "Mật khẩu mới" : "New password"}</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  disabled={isResetting}
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute right-3 top-2.5 text-app-muted transition-colors hover:text-app-fg disabled:opacity-50"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={isResetting}
                  aria-label={showPassword ? (isVietnamese ? "Ẩn mật khẩu" : "Hide password") : (isVietnamese ? "Hiện mật khẩu" : "Show password")}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{isVietnamese ? "Xác nhận mật khẩu mới" : "Confirm new password"}</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                disabled={isResetting}
              />
            </div>
            <Button type="submit" className="w-full" isLoading={isResetting}>
              <KeyRound className="mr-2 h-4 w-4" />
              {isVietnamese ? "Đặt mật khẩu mới" : "Set new password"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="w-full text-center text-sm text-app-muted">
            {isVietnamese ? "Đã nhớ tài khoản?" : "Remembered your account?"} {" "}
            <Link href="/login" className="text-brand-500 transition-colors hover:text-brand-400">
              {isVietnamese ? "Đăng nhập" : "Sign in"}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
