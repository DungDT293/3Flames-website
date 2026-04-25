"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { MailCheck, RefreshCw, UserPlus } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { registerUser, resendOtp, verifyEmail } from "@/lib/api/auth";
import type { ApiError } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n/use-t";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type RegisterStep = "STEP_1_FORM" | "STEP_2_OTP";

interface FormErrors {
  email?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
  acceptTos?: string;
  otp?: string;
  general?: string;
}

export function RegisterForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const t = useT();
  const isVietnamese = t("dashboard.newOrder") === "Đặt dịch vụ";

  const [step, setStep] = useState<RegisterStep>("STEP_1_FORM");
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTos, setAcceptTos] = useState(false);
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyEmailParam = params.get("email");
    if (params.get("verify") === "1" && verifyEmailParam) {
      setEmail(verifyEmailParam);
      setPendingEmail(verifyEmailParam);
      setStep("STEP_2_OTP");
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function validateRegistration(): boolean {
    const next: FormErrors = {};

    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Invalid email format";
    }

    if (!username.trim()) {
      next.username = "Username is required";
    } else if (username.trim().length < 3) {
      next.username = "Username must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      next.username = "Username can only contain letters, numbers, and underscores";
    }

    if (!password) {
      next.password = "Password is required";
    } else if (password.length < 8) {
      next.password = "Password must be at least 8 characters";
    }

    if (!confirmPassword) {
      next.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match";
    }

    if (!acceptTos) {
      next.acceptTos = "You must accept the Terms of Service to register";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateOtp(): boolean {
    const next: FormErrors = {};
    if (!/^\d{6}$/.test(otp.trim())) {
      next.otp = isVietnamese ? "Nhập mã xác thực gồm 6 chữ số" : "Enter the 6-digit verification code";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!validateRegistration()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const res = await registerUser({
        email: email.trim(),
        username: username.trim(),
        password,
        accept_tos: true,
      });
      setPendingEmail(res.email);
      setOtp("");
      setCooldown(60);
      setStep("STEP_2_OTP");
      toast.success(isVietnamese ? "Mã xác thực đã được gửi tới email" : "Verification code sent to your email");
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      const data = axiosErr.response?.data;
      const msg = data?.message || data?.error || "Registration failed. Please try again.";

      if (data?.field === "email") {
        setErrors({ email: msg });
      } else if (data?.field === "username") {
        setErrors({ username: msg });
      } else {
        setErrors({ general: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!validateOtp()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const res = await verifyEmail({ email: pendingEmail, otp: otp.trim() });
      login(res.user, res.token);
      toast.success(isVietnamese ? "Xác thực email thành công" : "Email verified successfully");
      router.push("/dashboard");
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      const msg = axiosErr.response?.data?.message || axiosErr.response?.data?.error || "Invalid or expired verification code.";
      setErrors({ otp: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !pendingEmail) return;

    setIsResending(true);
    setErrors({});

    try {
      await resendOtp({ email: pendingEmail });
      setCooldown(60);
      toast.success(isVietnamese ? "Mã mới đã được gửi" : "A new code has been sent");
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      const msg = axiosErr.response?.data?.message || axiosErr.response?.data?.error || "Could not resend verification code.";
      setErrors({ general: msg });
    } finally {
      setIsResending(false);
    }
  }

  if (step === "STEP_2_OTP") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{isVietnamese ? "Xác thực email" : "Verify your email"}</CardTitle>
          <CardDescription>
            {isVietnamese
              ? `Nhập mã 6 chữ số đã gửi tới ${pendingEmail}`
              : `Enter the 6-digit code sent to ${pendingEmail}`}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleVerify}>
          <CardContent className="space-y-4">
            {errors.general && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                {errors.general}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="otp">{isVietnamese ? "Mã xác thực" : "Verification code"}</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                error={errors.otp}
                autoComplete="one-time-code"
                disabled={isSubmitting}
              />
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-4">
            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              <MailCheck className="mr-2 h-4 w-4" />
              {isVietnamese ? "Xác thực và vào dashboard" : "Verify and continue"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={cooldown > 0 || isResending}
              isLoading={isResending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {cooldown > 0
                ? isVietnamese
                  ? `Gửi lại sau ${cooldown}s`
                  : `Resend in ${cooldown}s`
                : isVietnamese
                  ? "Gửi lại mã"
                  : "Resend code"}
            </Button>
            <button
              type="button"
              className="text-sm text-app-muted hover:text-brand-500"
              onClick={() => {
                setStep("STEP_1_FORM");
                setErrors({});
              }}
            >
              {isVietnamese ? "Đổi email đăng ký" : "Use a different email"}
            </button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("common.register")}</CardTitle>
        <CardDescription>{isVietnamese ? "Tạo tài khoản để bắt đầu tăng trưởng với 3Flames" : "Get started with 3Flames"}</CardDescription>
      </CardHeader>
      <form onSubmit={handleRegister}>
        <CardContent className="space-y-4">
          {errors.general && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {errors.general}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={errors.username}
              autoComplete="username"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          </div>

          <Checkbox
            checked={acceptTos}
            onChange={(e) => setAcceptTos(e.target.checked)}
            label={
              <>
                I agree to the{" "}
                <Link href="/terms" className="text-brand-500 hover:text-brand-400 transition-colors">
                  Terms of Service (v1.0)
                </Link>
              </>
            }
            error={errors.acceptTos}
            disabled={isSubmitting}
          />
        </CardContent>

        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t("common.register")}
          </Button>
          <p className="text-sm text-app-muted">
            {isVietnamese ? "Đã có tài khoản?" : "Already have an account?"}{" "}
            <Link href="/login" className="text-brand-500 hover:text-brand-400 transition-colors">
              {t("common.login")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
