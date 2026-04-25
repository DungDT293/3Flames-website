"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth-store";
import { PreferencesControls } from "@/components/preferences/preferences-controls";
import { useT } from "@/lib/i18n/use-t";
import {
  Flame,
  BarChart3,
  Users,
  Activity,
  ClipboardList,
  Tags,
  ArrowLeft,
  Menu,
  X,
  Shield,
  ChevronDown,
  LogOut,
  User,
} from "lucide-react";

const ROLE_RANK = {
  USER: 0,
  SUPPORT: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
} as const;

const ADMIN_NAV = [
  { href: "/admin", label: "Tổng quan", icon: BarChart3, minRole: "SUPPORT" },
  { href: "/admin/users", label: "Người dùng", icon: Users, minRole: "SUPPORT" },
  { href: "/admin/logs", label: "Nhật ký", icon: ClipboardList, minRole: "ADMIN" },
  { href: "/admin/pricing", label: "Giá dịch vụ", icon: Tags, minRole: "ADMIN" },
  { href: "/admin/system", label: "Hệ thống", icon: Activity, minRole: "ADMIN" },
] as const;

function hasRoleAtLeast(role: string | undefined, minRole: keyof typeof ROLE_RANK): boolean {
  if (!role) return false;
  return (ROLE_RANK[role as keyof typeof ROLE_RANK] ?? -1) >= ROLE_RANK[minRole];
}

function roleBadge(role: string | undefined): string {
  if (role === "SUPER_ADMIN") return "SUPER ADMIN";
  if (role === "ADMIN") return "ADMIN";
  if (role === "SUPPORT") return "HỖ TRỢ";
  return "USER";
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, loadProfile, logout } =
    useAuthStore();
  const t = useT();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!isLoading && isAuthenticated && !hasRoleAtLeast(user?.role, "SUPPORT")) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, user, router]);

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

  if (!isAuthenticated || !hasRoleAtLeast(user?.role, "SUPPORT")) return null;

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
          <span className="ml-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400">
            Admin
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-md p-1 text-app-muted hover:text-app-fg lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {ADMIN_NAV.filter((item) => hasRoleAtLeast(user?.role, item.minRole)).map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
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
                <item.icon
                  className={`h-5 w-5 ${isActive ? "text-brand-500" : ""}`}
                />
                {item.label}
              </Link>
            );
          })}

          <div className="my-4 border-t border-app-border" />

          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-app-muted hover:bg-app-elevated hover:text-app-fg transition-all duration-200"
          >
            <ArrowLeft className="h-5 w-5" />
            {t("dashboard.backDashboard")}
          </Link>
        </nav>
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
            <span className="font-bold text-app-fg">Admin</span>
          </div>

          <div className="flex-1" />

          <PreferencesControls compact className="hidden md:flex" />

          {/* Admin badge */}
          <div className="hidden sm:flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5">
            <Shield className="h-4 w-4 text-red-400" />
            <span className="text-xs font-semibold text-red-400">
              {roleBadge(user?.role)}
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
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                <User className="h-4 w-4" />
              </div>
              <span className="hidden sm:inline max-w-[120px] truncate">
                {user?.username}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-app-border bg-app-card py-1 shadow-xl shadow-black/30">
                <div className="border-b border-app-border px-4 py-2.5">
                  <p className="text-sm font-medium text-app-fg truncate">
                    {user?.username}
                  </p>
                  <p className="text-xs text-app-muted truncate">
                    {user?.email}
                  </p>
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
