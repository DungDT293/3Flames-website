"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import toast from "react-hot-toast";
import { LogIn } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { loginUser } from "@/lib/api/auth";
import type { ApiError } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/use-t";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const t = useT();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const next: FormErrors = {};

    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Invalid email format";
    }

    if (!password) {
      next.password = "Password is required";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const res = await loginUser({ email: email.trim(), password });
      login(res.user, res.token);
      toast.success("Welcome back!");
      router.push(res.user.role === "USER" ? "/dashboard" : "/admin");
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      const msg =
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        "Login failed. Please try again.";

      if (axiosErr.response?.data?.requiresOtp) {
        setErrors({ general: msg });
        router.push(`/register?email=${encodeURIComponent(axiosErr.response.data.email || email.trim())}&verify=1`);
      } else if (axiosErr.response?.status === 403) {
        setErrors({ general: "Account suspended. Contact support." });
      } else {
        setErrors({ general: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("common.login")}</CardTitle>
        <CardDescription>{t("dashboard.newOrder") === "Đặt dịch vụ" ? "Đăng nhập để tiếp tục sử dụng 3Flames" : "Enter your credentials to continue"}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            <LogIn className="mr-2 h-4 w-4" />
            {t("common.login")}
          </Button>
          <p className="text-sm text-app-muted">
            {t("dashboard.newOrder") === "Đặt dịch vụ" ? "Chưa có tài khoản?" : "Don&apos;t have an account?"}{" "}
            <Link href="/register" className="text-brand-500 hover:text-brand-400 transition-colors">
              {t("common.register")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
