"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { CheckCircle2, Eye, EyeOff, FileText, MailCheck, Phone, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { registerUser, resendOtp, verifyEmail } from "@/lib/api/auth";
import type { ApiError } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n/use-t";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

type RegisterStep = "STEP_1_FORM" | "STEP_2_OTP";

const termsContent = {
  vi: {
    title: "Điều khoản dịch vụ",
    description: "Vui lòng đọc kỹ trước khi tạo tài khoản 3Flames.",
    updated: "Cập nhật lần cuối: 24/04/2026",
    close: "Đã hiểu",
    sections: [
      ["Chấp nhận điều khoản", "Khi tạo tài khoản hoặc đặt dịch vụ trên 3Flames, bạn đồng ý tuân thủ các điều khoản này và chính sách của từng nền tảng."],
      ["Sử dụng dịch vụ", "Dịch vụ được cung cấp cho mục đích quảng bá hợp lệ. Bạn chịu trách nhiệm về liên kết, nội dung và chiến dịch của mình."],
      ["Thanh toán và số dư", "Khoản nạp được cộng vào số dư sau khi xác minh. Mọi thay đổi số dư đều được ghi nhận trong lịch sử giao dịch."],
      ["Xử lý đơn hàng", "Đơn hàng được xử lý tự động. Tốc độ hoàn thành, bảo hành và hỗ trợ huỷ đơn có thể khác nhau tuỳ từng dịch vụ."],
      ["Hoàn tiền", "Đơn bị huỷ được hoàn lại toàn bộ phí vào số dư. Đơn hoàn thành một phần được hoàn theo số lượng chưa xử lý."],
      ["An toàn tài khoản", "Tài khoản liên quan đến lạm dụng, gian lận hoặc tranh chấp thanh toán có thể bị tạm ngưng để xem xét."],
    ],
  },
  en: {
    title: "Terms of Service",
    description: "Please review before creating your 3Flames account.",
    updated: "Last updated: April 24, 2026",
    close: "Got it",
    sections: [
      ["Acceptance", "By creating an account or placing an order on 3Flames, you agree to these terms and applicable platform policies."],
      ["Service usage", "Services are provided for legitimate promotional use. You are responsible for your links, content, and campaigns."],
      ["Payments and balance", "Deposits are credited after verification. Every balance change is recorded in the transaction history."],
      ["Order processing", "Orders are processed automatically. Delivery speed, refill eligibility, and cancellation support vary by service."],
      ["Refunds", "Canceled orders receive a full balance refund. Partial orders are refunded based on the unprocessed quantity."],
      ["Account safety", "Accounts involved in abuse, fraud, or payment disputes may be suspended for review."],
    ],
  },
} as const;

interface FormErrors {
  email?: string;
  username?: string;
  phone?: string;
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
  const isVietnamese = usePreferencesStore((state) => state.language === "vi");

  const [step, setStep] = useState<RegisterStep>("STEP_1_FORM");
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTos, setAcceptTos] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const terms = termsContent[isVietnamese ? "vi" : "en"];

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
      next.email = isVietnamese ? "Vui lòng nhập email" : "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = isVietnamese ? "Email không hợp lệ" : "Invalid email format";
    }

    if (!username.trim()) {
      next.username = isVietnamese ? "Vui lòng nhập tên người dùng" : "Username is required";
    } else if (username.trim().length < 3) {
      next.username = isVietnamese ? "Tên người dùng phải có ít nhất 3 ký tự" : "Username must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      next.username = isVietnamese ? "Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới" : "Username can only contain letters, numbers, and underscores";
    }

    if (phone.trim() && !/^\+?[0-9]{8,15}$/.test(phone.trim())) {
      next.phone = isVietnamese ? "Số điện thoại không hợp lệ" : "Invalid phone number";
    }

    if (!password) {
      next.password = isVietnamese ? "Vui lòng nhập mật khẩu" : "Password is required";
    } else if (password.length < 8) {
      next.password = isVietnamese ? "Mật khẩu phải có ít nhất 8 ký tự" : "Password must be at least 8 characters";
    }

    if (!confirmPassword) {
      next.confirmPassword = isVietnamese ? "Vui lòng xác nhận mật khẩu" : "Please confirm your password";
    } else if (password !== confirmPassword) {
      next.confirmPassword = isVietnamese ? "Mật khẩu xác nhận không khớp" : "Passwords do not match";
    }

    if (!acceptTos) {
      next.acceptTos = isVietnamese ? "Bạn cần đồng ý với Điều khoản dịch vụ để đăng ký" : "You must accept the Terms of Service to register";
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
        phone: phone.trim() || undefined,
        password,
        accept_tos: true,
      });
      setPendingEmail(res.email);
      setOtp(res.devOtp || "");
      setDevOtp(res.devOtp || null);
      setCooldown(60);
      setStep("STEP_2_OTP");
      toast.success(isVietnamese ? "Mã xác thực đã được gửi tới email" : "Verification code sent to your email");
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      const data = axiosErr.response?.data;
      const msg = data?.message || data?.error || (isVietnamese ? "Đăng ký thất bại. Vui lòng thử lại." : "Registration failed. Please try again.");

      if (data?.field === "email") {
        setErrors({ email: msg });
      } else if (data?.field === "username") {
        setErrors({ username: msg });
      } else if (data?.field === "phone") {
        setErrors({ phone: msg });
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
      const msg = axiosErr.response?.data?.message || axiosErr.response?.data?.error || (isVietnamese ? "Mã xác thực không hợp lệ hoặc đã hết hạn." : "Invalid or expired verification code.");
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
      const res = await resendOtp({ email: pendingEmail });
      setDevOtp(res.devOtp || null);
      if (res.devOtp) setOtp(res.devOtp);
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

            {devOtp && (
              <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                  {isVietnamese ? "Mã xác thực môi trường test" : "Development verification code"}
                </p>
                <p className="mt-2 font-mono text-3xl font-black tracking-[0.35em] text-brand-400">{devOtp}</p>
                <p className="mt-2 text-xs leading-5 text-app-muted">
                  {isVietnamese ? "SMTP đang ở chế độ test nên mã được hiển thị trực tiếp tại đây." : "SMTP is in test mode, so the code is shown here directly."}
                </p>
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
                setDevOtp(null);
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
    <>
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
            <Label htmlFor="username">{isVietnamese ? "Tên người dùng" : "Username"}</Label>
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
            <Label htmlFor="phone">{isVietnamese ? "Số điện thoại (tuỳ chọn)" : "Phone number (optional)"}</Label>
            <div className="relative">
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder={isVietnamese ? "Ví dụ: 0987654321" : "Example: 0987654321"}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={errors.phone}
                autoComplete="tel"
                disabled={isSubmitting}
                className="pl-10"
              />
              <Phone className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-app-muted" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{isVietnamese ? "Mật khẩu" : "Password"}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={isVietnamese ? "Tối thiểu 8 ký tự" : "Minimum 8 characters"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                autoComplete="new-password"
                disabled={isSubmitting}
                className="pr-11"
              />
              <button
                type="button"
                className="absolute right-3 top-2.5 text-app-muted transition-colors hover:text-app-fg disabled:opacity-50"
                onClick={() => setShowPassword((value) => !value)}
                disabled={isSubmitting}
                aria-label={showPassword ? (isVietnamese ? "Ẩn mật khẩu" : "Hide password") : (isVietnamese ? "Hiện mật khẩu" : "Show password")}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">{isVietnamese ? "Xác nhận mật khẩu" : "Confirm Password"}</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder={isVietnamese ? "Nhập lại mật khẩu" : "Re-enter your password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
                autoComplete="new-password"
                disabled={isSubmitting}
                className="pr-11"
              />
              <button
                type="button"
                className="absolute right-3 top-2.5 text-app-muted transition-colors hover:text-app-fg disabled:opacity-50"
                onClick={() => setShowConfirmPassword((value) => !value)}
                disabled={isSubmitting}
                aria-label={showConfirmPassword ? (isVietnamese ? "Ẩn mật khẩu" : "Hide password") : (isVietnamese ? "Hiện mật khẩu" : "Show password")}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <Checkbox
            checked={acceptTos}
            onChange={(e) => setAcceptTos(e.target.checked)}
            label={
              <>
                {isVietnamese ? "Tôi đồng ý với " : "I agree to the "}
                <button
                  type="button"
                  className="text-brand-500 transition-colors hover:text-brand-400"
                  onClick={() => setShowTerms(true)}
                >
                  {isVietnamese ? "Điều khoản dịch vụ (v1.0)" : "Terms of Service (v1.0)"}
                </button>
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
          <Link href="/recover" className="text-sm text-brand-500 transition-colors hover:text-brand-400">
            {isVietnamese ? "Tìm lại tài khoản hoặc quên mật khẩu" : "Find account or reset password"}
          </Link>
        </CardFooter>
      </form>
    </Card>

    <Dialog open={showTerms} onOpenChange={setShowTerms}>
      <DialogContent
        className="max-h-[88vh] max-w-3xl overflow-hidden rounded-2xl border-brand-500/20 bg-app-card p-0 shadow-2xl shadow-brand-950/40"
        onClose={() => setShowTerms(false)}
      >
        <div className="relative overflow-hidden border-b border-app-border bg-gradient-to-br from-brand-500/20 via-app-elevated to-app-card px-6 py-6 pr-14 sm:px-8">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <DialogHeader className="mb-0 max-w-xl space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                {isVietnamese ? "Cam kết minh bạch" : "Transparent policy"}
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight text-app-fg sm:text-3xl">
                {terms.title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-app-muted sm:text-base">
                {terms.description} {isVietnamese ? "Các điểm quan trọng được tóm tắt rõ ràng để bạn nắm quyền lợi, thanh toán và quy trình xử lý đơn hàng trước khi tiếp tục." : "Key points are summarized clearly so you understand usage, payments, refunds, and account safety before continuing."}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border border-app-border bg-app-card/80 p-4 text-center shadow-xl shadow-black/20">
              <FileText className="mx-auto h-6 w-6 text-brand-400" />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
                {isVietnamese ? "Phiên bản" : "Version"}
              </p>
              <p className="mt-1 text-sm font-bold text-app-fg">v1.0</p>
            </div>
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-6 py-5 sm:px-8">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {[
              isVietnamese ? "Nạp tiền minh bạch" : "Clear deposits",
              isVietnamese ? "Theo dõi đơn realtime" : "Live order tracking",
              isVietnamese ? "Bảo vệ tài khoản" : "Account protection",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl border border-app-border bg-app-elevated/50 px-3 py-2 text-sm font-medium text-app-fg">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-400" />
                {item}
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {terms.sections.map(([title, body], index) => (
              <section key={title} className="rounded-2xl border border-app-border bg-app-elevated/40 p-4 transition-colors hover:border-brand-500/30 hover:bg-app-elevated/70">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-300">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-app-fg">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-app-muted">{body}</p>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-0 border-t border-app-border bg-app-elevated/50 px-6 py-4 sm:px-8">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-app-muted">
              {terms.updated}. {isVietnamese ? "Bạn có thể xem lại điều khoản bất cứ lúc nào trước khi đăng ký." : "You can review these terms anytime before creating your account."}
            </p>
            <Button type="button" className="min-w-32" onClick={() => setShowTerms(false)}>
              {terms.close}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
