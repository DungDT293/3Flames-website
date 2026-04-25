"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Flame } from "lucide-react";
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
          <p className="text-sm text-app-muted">Premium SMM Panel</p>
        </div>
        {children}
      </div>
    </div>
  );
}
