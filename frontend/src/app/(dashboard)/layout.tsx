"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth-store";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { useT } from "@/lib/i18n/use-t";
import { formatDisplayMoney } from "@/lib/utils/currency";
import { PreferencesControls } from "@/components/preferences/preferences-controls";
import {
  Flame,
  ShoppingCart,
  History,
  Layers,
  Wallet,
  Settings,
  Shield,
  Menu,
  X,
  ChevronDown,
  LogOut,
  User,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "dashboard.newOrder", icon: ShoppingCart },
  { href: "/dashboard/orders", labelKey: "dashboard.orderHistory", icon: History },
  { href: "/dashboard/services", labelKey: "dashboard.services", icon: Layers },
  { href: "/dashboard/add-funds", labelKey: "dashboard.addFunds", icon: Wallet },
  { href: "/dashboard/account", labelKey: "dashboard.account", icon: Settings },
] as const;

const ROLE_RANK = {
  USER: 0,
  SUPPORT: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
} as const;

function hasRoleAtLeast(role: string | undefined, minRole: keyof typeof ROLE_RANK): boolean {
  if (!role) return false;
  return (ROLE_RANK[role as keyof typeof ROLE_RANK] ?? -1) >= ROLE_RANK[minRole];
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, balance, isAuthenticated, isLoading, loadProfile, logout } =
    useAuthStore();
  const { currency } = usePreferencesStore();
  const { rate, loadRate } = useExchangeRateStore();
  const t = useT();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    loadProfile();
    loadRate();
  }, [loadProfile, loadRate]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = useCallback(() => {
    logout();
    router.replace("/login");
  }, [logout, router]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const close = () => setUserMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [userMenuOpen]);

  const displayBalance = formatDisplayMoney(balance, currency, rate?.rate);

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

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-app-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-app-border bg-app-card transition-transform duration-300
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Sidebar header */}
        <div className="flex h-16 items-center gap-2.5 border-b border-app-border px-6">
          <Flame className="h-7 w-7 text-brand-500" />
          <span className="text-lg font-bold text-app-fg">3Flames</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-md p-1 text-app-muted hover:text-app-fg lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {hasRoleAtLeast(user?.role, "SUPPORT") && (
            <Link
              href="/admin"
              className="mb-3 flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/15"
            >
              <Shield className="h-5 w-5" />
              {t("dashboard.adminPanel")}
            </Link>
          )}

          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200
                  ${
                    isActive
                      ? "bg-brand-500/10 text-brand-500"
                      : "text-app-muted hover:bg-app-elevated hover:text-app-fg"
                  }
                `}
              >
                <item.icon className={`h-5 w-5 ${isActive ? "text-brand-500" : ""}`} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-app-border p-4">
          <div className="rounded-lg bg-app-elevated p-3">
            <p className="text-xs text-app-muted">{t("common.balance")}</p>
            <p className="text-lg font-bold text-brand-500">
              {displayBalance}
            </p>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-app-border bg-app-card/80 backdrop-blur-sm px-4 lg:px-6">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-app-muted hover:text-app-fg lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <Flame className="h-5 w-5 text-brand-500" />
            <span className="font-bold text-app-fg">3Flames</span>
          </div>

          <div className="flex-1" />

          <PreferencesControls compact className="hidden md:flex" />

          {/* Balance (topbar) */}
          <div className="hidden sm:flex items-center gap-2 rounded-lg bg-app-elevated px-4 py-2">
            <Wallet className="h-4 w-4 text-brand-500" />
            <span className="text-sm font-semibold text-brand-500">
              {displayBalance}
            </span>
          </div>

          {/* User dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUserMenuOpen((prev) => !prev);
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-app-fg hover:bg-app-elevated transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/20 text-brand-500">
                <User className="h-4 w-4" />
              </div>
              <span className="hidden sm:inline max-w-[120px] truncate">
                {user?.username}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-app-border bg-app-card py-1 shadow-xl shadow-black/30">
                <div className="border-b border-app-border px-4 py-2.5">
                  <p className="text-sm font-medium text-app-fg truncate">
                    {user?.username}
                  </p>
                  <p className="text-xs text-app-muted truncate">{user?.email}</p>
                </div>
                <Link
                  href="/dashboard/account"
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-app-fg hover:bg-app-elevated transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  {t("dashboard.account")}
                </Link>
                <div className="py-1 sm:hidden">
                  <div className="flex items-center gap-2 px-4 py-2 text-sm">
                    <Wallet className="h-4 w-4 text-brand-500" />
                    <span className="text-brand-500 font-semibold">
                      {displayBalance}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-app-elevated transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  {t("common.logout")}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
