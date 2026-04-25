"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { History, Loader2, ExternalLink, ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/stores/auth-store";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { fetchOrders } from "@/lib/api/orders";
import { getToken } from "@/lib/api/client";
import { formatDisplayMoney } from "@/lib/utils/currency";
import type { Order } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const currency = usePreferencesStore((s) => s.currency);
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
  const [error, setError] = useState<string | null>(null);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const loadOrders = useCallback(
    async (page: number, status?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetchOrders(
          page,
          pagination.limit,
          status || undefined,
        );
        setOrders(res.data);
        setPagination(res.pagination);
      } catch {
        setError("Failed to load orders. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [pagination.limit],
  );

  useEffect(() => {
    loadOrders(pagination.page, statusFilter);
  }, [pagination.page, statusFilter]);

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
                    `Order refunded: ${formatDisplayMoney(data.refundAmount, currency, rate?.rate)}`,
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

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(e.target.value);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <History className="h-6 w-6 text-brand-500" />
            Order History
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {pagination.total} total order{pagination.total !== 1 && "s"}
          </p>
        </div>

        <div className="w-full sm:w-48">
          <Select
            value={statusFilter}
            onChange={handleStatusChange}
            placeholder="All Statuses"
          >
            <option value="">All Statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShoppingCart className="h-12 w-12 text-zinc-600 mb-4" />
          <p className="text-lg font-medium text-zinc-400">No orders yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Place your first order to get started
          </p>
          <Link href="/dashboard">
            <Button variant="default" className="mt-4">
              <ShoppingCart className="mr-2 h-4 w-4" />
              New Order
            </Button>
          </Link>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && orders.length > 0 && (
        <>
          <div className="rounded-lg border border-surface-500 bg-surface-800">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Order ID</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="hidden md:table-cell">Link</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Charge</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs text-zinc-500">
                      {order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-200 max-w-[200px]">
                          {order.service.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {order.service.category}
                        </p>
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
                      {order.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDisplayMoney(order.charge, currency, rate?.rate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.status)}>
                        {order.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-zinc-500 whitespace-nowrap">
                      {formatDate(order.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  Next
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
