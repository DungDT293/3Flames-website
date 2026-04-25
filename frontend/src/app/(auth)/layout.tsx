"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { ArrowLeft, Flame } from "lucide-react";
import { PreferencesControls } from "@/components/preferences/preferences-controls";
import { useT } from "@/lib/i18n/use-t";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, loadProfile } = useAuthStore();
  const t = useT();

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(user?.role === "USER" ? "/dashboard" : "/admin");
    }
  }, [isAuthenticated, isLoading, user?.role, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg">
        <div className="flex flex-col items-center gap-3">
          <Flame className="h-10 w-10 text-brand-500 animate-pulse" />
          <p className="text-sm text-app-muted">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-app-bg px-4 py-12">
      <div className="absolute right-4 top-4">
        <PreferencesControls compact />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Flame className="h-8 w-8 text-brand-500" />
            <h1 className="text-2xl font-bold text-app-fg">3Flames</h1>
          </div>
          <p className="text-sm text-app-muted">Nền tảng SMM cao cấp</p>
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-app-border bg-app-card px-4 py-2 text-sm font-medium text-app-muted transition-colors hover:border-brand-500/40 hover:text-app-fg"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.backHome")}
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
