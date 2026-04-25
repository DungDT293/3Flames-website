"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Facebook, Layers, ListChecks, Loader2, ShoppingCart, Youtube } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/stores/auth-store";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { fetchOrders } from "@/lib/api/orders";
import { getToken } from "@/lib/api/client";
import { formatDisplayMoney } from "@/lib/utils/currency";
import { localizeServiceText, servicePlatform } from "@/lib/utils/service-copy";
import type { Order } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import Link from "next/link";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

const ORDER_STATUSES = [
  "PENDING",
  "PROCESSING",
  "IN_PROGRESS",
  "COMPLETED",
  "PARTIAL",
  "CANCELED",
  "REFUNDED",
  "ERROR",
] as const;

function getStatusVariant(
  status: string,
): "success" | "warning" | "secondary" | "destructive" | "default" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "PROCESSING":
    case "IN_PROGRESS":
      return "warning";
    case "PENDING":
      return "secondary";
    case "CANCELED":
    case "PARTIAL":
    case "ERROR":
    case "REFUNDED":
      return "destructive";
    default:
      return "default";
  }
}

function formatDate(iso: string, isVietnamese: boolean): string {
  const d = new Date(iso);
  return d.toLocaleDateString(isVietnamese ? "vi-VN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string, isVietnamese: boolean): string {
  if (!isVietnamese) return status.replace("_", " ");
  const labels: Record<string, string> = {
    PENDING: "Đang chờ",
    PROCESSING: "Đang xử lý",
    IN_PROGRESS: "Đang chạy",
    COMPLETED: "Hoàn tất",
    PARTIAL: "Một phần",
    CANCELED: "Đã huỷ",
    REFUNDED: "Đã hoàn tiền",
    ERROR: "Lỗi",
  };
  return labels[status] || status;
}

function truncateUrl(url: string, maxLen: number = 30): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname + parsed.pathname;
    return display.length > maxLen ? display.slice(0, maxLen) + "..." : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "..." : url;
  }
}

export default function OrderHistoryPage() {
  const balance = useAuthStore((s) => s.balance);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const currency = usePreferencesStore((s) => s.currency);
  const language = usePreferencesStore((s) => s.language);
  const isVietnamese = language === "vi";
  const rate = useExchangeRateStore((s) => s.rate);

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const loadOrders = useCallback(
    async (page: number, status?: string) => {
      setIsLoading(true);
      try {
        const res = await fetchOrders(
          page,
          pagination.limit,
          status || undefined,
        );
        setOrders(res.data);
        setPagination(res.pagination);
      } catch {
        setOrders([]);
        setPagination((prev) => ({ ...prev, page: 1, total: 0, totalPages: 0 }));
      } finally {
        setIsLoading(false);
      }
    },
    [pagination.limit],
  );

  useEffect(() => {
    loadOrders(pagination.page, statusFilter);
  }, [pagination.page, statusFilter]);

  const activeTrackingCount = orders.filter((order) =>
    ["PENDING", "PROCESSING", "IN_PROGRESS"].includes(order.status),
  ).length;

  // SSE real-time updates
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/orders/stream`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (
              line.startsWith("data: ") &&
              currentEvent === "order_update"
            ) {
              try {
                const data = JSON.parse(line.slice(6));
                setOrders((prev) =>
                  prev.map((o) =>
                    o.id === data.orderId
                      ? {
                          ...o,
                          status: data.status,
                          remains: data.remains ?? o.remains,
                        }
                      : o,
                  ),
                );

                if (data.refundAmount) {
                  toast.success(
                    `${isVietnamese ? "Đơn hàng đã hoàn tiền" : "Order refunded"}: ${formatDisplayMoney(data.refundAmount, currency, rate?.rate)}`,
                    { duration: 5000 },
                  );
                  if (data.newBalance) {
                    updateBalance(data.newBalance);
                  }
                }
              } catch {
                // ignore parse errors
              }
              currentEvent = "";
            } else if (line === "") {
              currentEvent = "";
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    })();

    return () => {
      controller.abort();
    };
  }, [updateBalance, currency, rate?.rate]);

  function handleStatusChange(nextStatus: string) {
    setStatusFilter(nextStatus);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  function handlePrevPage() {
    if (pagination.page > 1) {
      setPagination((prev) => ({ ...prev, page: prev.page - 1 }));
    }
  }

  function handleNextPage() {
    if (pagination.page < pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: prev.page + 1 }));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-app-border bg-app-card p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-app-fg">
              <ListChecks className="h-6 w-6 text-brand-500" />
              {isVietnamese ? "Trạng thái đơn hàng" : "Order Status"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-app-muted">
              {isVietnamese ? "Theo dõi mọi đơn hàng từ lúc đặt đến khi hoàn tất, kèm cập nhật trạng thái trực tiếp, thông báo hoàn tiền và chi tiết dịch vụ." : "Follow every order from placement to completion with live status updates, refund notices, and service details in one place."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-72">
            <div className="rounded-xl border border-app-border bg-app-elevated/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-app-muted">{isVietnamese ? "Tổng đơn" : "Total"}</p>
              <p className="mt-1 text-xl font-bold text-app-fg">{pagination.total}</p>
            </div>
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-300">{isVietnamese ? "Đang theo dõi" : "Tracking"}</p>
              <p className="mt-1 text-xl font-bold text-brand-400">{activeTrackingCount}</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">
            {isVietnamese ? "Lọc theo trạng thái" : "Filter by status"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <button
              type="button"
              onClick={() => handleStatusChange("")}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${statusFilter === "" ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-app-border bg-app-elevated/50 text-app-muted hover:border-brand-500/40 hover:text-app-fg"}`}
            >
              <span>{isVietnamese ? "Tất cả trạng thái" : "All statuses"}</span>
              <span className="rounded-full bg-app-card px-2 py-0.5 text-xs tabular-nums text-app-muted">{pagination.total}</span>
            </button>
            {ORDER_STATUSES.map((s) => {
              const count = orders.filter((order) => order.status === s).length;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleStatusChange(s)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${statusFilter === s ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-app-border bg-app-elevated/50 text-app-muted hover:border-brand-500/40 hover:text-app-fg"}`}
                >
                  <span>{statusLabel(s, isVietnamese)}</span>
                  <span className="rounded-full bg-app-card px-2 py-0.5 text-xs tabular-nums text-app-muted">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-app-border bg-app-card/60 py-20 text-center">
          <ShoppingCart className="mb-4 h-12 w-12 text-app-muted" />
          <p className="text-lg font-medium text-app-fg">
            {statusFilter
              ? statusLabel(statusFilter, isVietnamese)
              : isVietnamese ? "Bạn chưa có dịch vụ nào" : "You do not have any services yet"}
          </p>
          <p className="mt-1 max-w-md text-sm text-app-muted">
            {statusFilter
              ? isVietnamese
                ? `Không có đơn hàng nào ở trạng thái ${statusLabel(statusFilter, isVietnamese).toLowerCase()} trong lịch sử của bạn.`
                : `No orders with ${statusLabel(statusFilter, isVietnamese).toLowerCase()} status in your history.`
              : isVietnamese ? "Bạn chưa có dịch vụ nào hãy sử dụng dịch vụ bất kì để có thể xem trạng thái đơn hàng." : "Use any service first so you can view order status here."}
          </p>
          <Link href="/dashboard">
            <Button variant="default" className="mt-4">
              <ShoppingCart className="mr-2 h-4 w-4" />
              {isVietnamese ? "Bắt đầu đặt dịch vụ" : "Start an order"}
            </Button>
          </Link>
        </div>
      )}

      {/* Table */}
      {!isLoading && orders.length > 0 && (
        <>
          <div className="overflow-hidden rounded-2xl border border-app-border bg-app-card shadow-xl shadow-black/10">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{isVietnamese ? "Mã đơn" : "Order ID"}</TableHead>
                  <TableHead>{isVietnamese ? "Dịch vụ" : "Service"}</TableHead>
                  <TableHead className="hidden md:table-cell">{isVietnamese ? "Liên kết" : "Link"}</TableHead>
                  <TableHead className="text-right">{isVietnamese ? "SL" : "Qty"}</TableHead>
                  <TableHead className="text-right">{isVietnamese ? "Phí" : "Charge"}</TableHead>
                  <TableHead>{isVietnamese ? "Trạng thái" : "Status"}</TableHead>
                  <TableHead className="hidden lg:table-cell">{isVietnamese ? "Ngày tạo" : "Date"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const platform = servicePlatform(`${order.service.category} ${order.service.name}`);
                  const PlatformIcon = platform === "facebook" ? Facebook : platform === "youtube" ? Youtube : Layers;

                  return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs text-zinc-500">
                      {order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="mt-0.5 rounded-lg border border-app-border bg-app-elevated p-1 text-app-muted">
                          <PlatformIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-[200px] truncate text-sm text-zinc-200">
                            {localizeServiceText(order.service.name, language)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {localizeServiceText(order.service.category, language)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <a
                        href={order.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-brand-500 transition-colors max-w-[180px]"
                        title={order.link}
                      >
                        <span className="truncate">
                          {truncateUrl(order.link)}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {order.quantity.toLocaleString(isVietnamese ? "vi-VN" : "en-US")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDisplayMoney(order.charge, currency, rate?.rate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.status)}>
                        {statusLabel(order.status, isVietnamese)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-zinc-500 whitespace-nowrap">
                      {formatDate(order.createdAt, isVietnamese)}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                {isVietnamese ? `Trang ${pagination.page} / ${pagination.totalPages}` : `Page ${pagination.page} of ${pagination.totalPages}`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {isVietnamese ? "Trước" : "Previous"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  {isVietnamese ? "Tiếp" : "Next"}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
