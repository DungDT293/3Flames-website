"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { getAuditLogs, type AuditActorRoleTab, type AuditLog } from "@/lib/api/admin";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { UserRole } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const ROLE_TABS: Array<{ value: AuditActorRoleTab; label: string }> = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPPORT", label: "Support" },
  { value: "USER", label: "User" },
  { value: "SYSTEM", label: "System" },
];

const ROLE_RANK: Record<UserRole, number> = {
  USER: 0,
  SUPPORT: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

function canViewRole(currentRole: UserRole | undefined, tabRole: AuditActorRoleTab): boolean {
  if (tabRole === "SYSTEM") return true;
  if (!currentRole) return false;
  return ROLE_RANK[currentRole] >= ROLE_RANK[tabRole];
}

function defaultLogRole(currentRole: UserRole | undefined): AuditActorRoleTab {
  if (!currentRole) return "SYSTEM";
  return currentRole;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    UPDATE_ROLE: "Đổi vai trò",
    ADD_BALANCE: "Cộng tiền",
    DEDUCT_BALANCE: "Trừ tiền",
    SUSPEND_USER: "Tạm khóa",
    UNSUSPEND_USER: "Mở khóa",
    RESET_CIRCUIT_BREAKER: "Reset hệ thống",
    UPDATE_GLOBAL_MARGIN: "Đổi margin chung",
    UPDATE_SERVICE_MARGIN: "Đổi margin dịch vụ",
    RESET_SERVICE_MARGIN: "Reset margin dịch vụ",
  };
  return labels[action] || action;
}

function actionVariant(action: string): "warning" | "secondary" | "destructive" | "success" {
  if (action.includes("DEDUCT") || action.includes("SUSPEND")) return "destructive";
  if (action.includes("ADD") || action.includes("UNSUSPEND")) return "success";
  if (action.includes("MARGIN") || action.includes("ROLE")) return "warning";
  return "secondary";
}

function formatChange(log: AuditLog): string {
  const oldData = asRecord(log.oldData);
  const newData = asRecord(log.newData);
  if (oldData?.role || newData?.role) return `${oldData?.role ?? "—"} → ${newData?.role ?? "—"}`;
  if (oldData?.status || newData?.status) return `${oldData?.status ?? "—"} → ${newData?.status ?? "—"}`;
  if (oldData?.balance || newData?.balance) {
    const amount = newData?.amount ? ` (${newData.amount})` : "";
    return `${oldData?.balance ?? "—"} → ${newData?.balance ?? "—"}${amount}`;
  }
  if (oldData?.margin || newData?.margin) return `${oldData?.margin ?? "—"}% → ${newData?.margin ?? "—"}%`;
  if (newData?.reset) return "Reset thành công";
  return JSON.stringify({ old: log.oldData, new: log.newData });
}

export default function AdminLogsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const tabs = useMemo(
    () => ROLE_TABS.filter((tab) => canViewRole(currentUser?.role, tab.value)),
    [currentUser?.role],
  );
  const [actorRole, setActorRole] = useState<AuditActorRoleTab>(() => defaultLogRole(currentUser?.role));
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async (page: number, role: AuditActorRoleTab) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getAuditLogs(page, pagination.limit, role);
      setLogs(res.data);
      setPagination(res.pagination);
    } catch {
      setError("Không thể tải nhật ký hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit]);

  useEffect(() => {
    const fallbackRole = defaultLogRole(currentUser?.role);
    if (!canViewRole(currentUser?.role, actorRole)) {
      setActorRole(fallbackRole);
      setPagination((prev) => ({ ...prev, page: 1 }));
      return;
    }
    loadLogs(pagination.page, actorRole);
  }, [pagination.page, actorRole, currentUser?.role, loadLogs]);

  function switchTab(role: AuditActorRoleTab) {
    setActorRole(role);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-app-fg">
          <ClipboardList className="h-6 w-6 text-brand-500" />
          Nhật ký kiểm toán
        </h1>
        <p className="mt-1 text-sm text-app-muted">
          Tách nhật ký theo cấp actor để dễ rà soát hành động quản trị.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => switchTab(tab.value)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              actorRole === tab.value
                ? "border-brand-500 bg-brand-500/10 text-brand-500"
                : "border-app-border bg-app-card text-app-muted hover:text-app-fg"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="rounded-lg border border-app-border bg-app-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Thay đổi</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-app-muted">{formatDate(log.createdAt)}</TableCell>
                    <TableCell>
                      {log.actor ? (
                        <div>
                          <p className="text-sm font-medium text-app-fg">{log.actor.username}</p>
                          <p className="text-xs text-app-muted">{log.actor.email}</p>
                          <p className="mt-1 text-xs text-brand-500">{log.actor.role}</p>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-app-fg">System</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionVariant(log.action)}>{actionLabel(log.action)}</Badge>
                      <p className="mt-1 text-xs text-app-muted">{log.entity}</p>
                    </TableCell>
                    <TableCell>
                      {log.target ? (
                        <div>
                          <p className="text-sm font-medium text-app-fg">{log.target.username}</p>
                          <p className="text-xs text-app-muted">{log.target.email}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-app-muted">System</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm text-sm text-app-fg">{formatChange(log)}</TableCell>
                    <TableCell className="text-sm text-app-muted">{log.ipAddress || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {logs.length === 0 && (
            <div className="rounded-lg border border-app-border bg-app-card px-4 py-10 text-center text-sm text-app-muted">
              Chưa có nhật ký cho tab này.
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-app-muted">
              Trang {pagination.page} / {pagination.totalPages || 1} • {pagination.total.toLocaleString("vi-VN")} bản ghi
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                Tiếp
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
