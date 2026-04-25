"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Users,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Loader2,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { getAnalytics, type AdminAnalytics, type AnalyticsPeriod, type AnalyticsSeriesPoint } from "@/lib/api/admin";
import { formatDisplayMoney } from "@/lib/utils/currency";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function formatNumber(value: number): string {
  return value.toLocaleString("vi-VN");
}

function metricColor(change: number): string {
  if (change > 0) return "text-green-400";
  if (change < 0) return "text-red-400";
  return "text-app-muted";
}

function ChangeBadge({ value }: { value: number }) {
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${metricColor(value)}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
    </span>
  );
}

// ── Revenue/Deposits bar chart ─────────────────────────────────────────────
function BarChart({
  data,
  metric,
  color,
  currency,
  rate,
}: {
  data: AnalyticsSeriesPoint[];
  metric: "revenue" | "profit" | "deposits";
  color: string;
  currency: "USD" | "VND";
  rate: string;
}) {
  const values = data.map((item) => Number(item[metric] || 0));
  const max = Math.max(...values, 0.01);
  const hasData = values.some((v) => v > 0);

  return (
    <div className="relative flex h-40 items-end gap-[2px]">
      {/* baseline */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 border-b border-app-border" />

      {data.map((item, idx) => {
        const pct = hasData ? Math.max(2, (values[idx] / max) * 100) : 2;
        return (
          <div key={item.bucket} className="group relative flex flex-1 flex-col items-center justify-end">
            {/* tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-app-border bg-app-card px-2.5 py-1.5 text-xs shadow-lg group-hover:block">
              <p className="font-medium text-app-fg">{item.bucket}</p>
              <p className={color}>{formatDisplayMoney(values[idx].toString(), currency, rate)}</p>
            </div>
            <div
              className={`w-full rounded-t-sm transition-all duration-300 group-hover:opacity-80 ${color.replace("text-", "bg-")}/70 group-hover:${color.replace("text-", "bg-")}`}
              style={{ height: `${pct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── SVG area chart for orders + users ────────────────────────────────────
function AreaChart({ data }: { data: AnalyticsSeriesPoint[] }) {
  const W = 800;
  const H = 160;
  const PAD = 8;

  const maxOrders = Math.max(...data.map((d) => d.orders), 1);
  const maxUsers = Math.max(...data.map((d) => d.users), 1);

  const pts = (key: "orders" | "users", maxVal: number) =>
    data
      .map((item, idx) => {
        const x = data.length <= 1 ? W / 2 : (idx / (data.length - 1)) * W;
        const y = H - PAD - ((item[key]) / maxVal) * (H - PAD * 2);
        return `${x},${y}`;
      })
      .join(" ");

  const area = (key: "orders" | "users", maxVal: number) => {
    if (data.length === 0) return "";
    const first = data.length <= 1 ? W / 2 : 0;
    const last = data.length <= 1 ? W / 2 : W;
    return `${first},${H} ${pts(key, maxVal)} ${last},${H}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(249 115 22)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(249 115 22)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(74 222 128)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(74 222 128)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area("orders", maxOrders)} fill="url(#gradOrders)" />
      <polygon points={area("users", maxUsers)} fill="url(#gradUsers)" />
      <polyline points={pts("orders", maxOrders)} fill="none" stroke="rgb(249 115 22)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts("users", maxUsers)} fill="none" stroke="rgb(74 222 128)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── X-axis bucket labels (show every N-th to avoid crowding) ─────────────
function XLabels({ data }: { data: AnalyticsSeriesPoint[] }) {
  const step = data.length > 20 ? Math.ceil(data.length / 10) : 1;
  return (
    <div className="mt-1 flex">
      {data.map((item, idx) => (
        <div key={item.bucket} className="flex-1 text-center">
          {idx % step === 0 && (
            <span className="text-[10px] text-app-muted">{item.bucket.slice(-5)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AdminOverviewPage() {
  const currency = usePreferencesStore((s) => s.currency);
  const rateObj = useExchangeRateStore((s) => s.rate);
  const rate = rateObj?.rate ?? "25000";
  const [period, setPeriod] = useState<AnalyticsPeriod>("day");
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getAnalytics(period);
        setAnalytics(data);
      } catch {
        setError("Không thể tải dữ liệu thống kê.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [period]);

  const metrics = useMemo(() => {
    if (!analytics) return [];
    return [
      {
        label: "Doanh thu",
        value: formatDisplayMoney(analytics.summary.revenue.current, currency, rate),
        previous: formatDisplayMoney(analytics.summary.revenue.previous, currency, rate),
        change: analytics.summary.revenue.changePercent,
        icon: DollarSign,
        color: "text-brand-500",
      },
      {
        label: "Lợi nhuận",
        value: formatDisplayMoney(analytics.summary.profit.current, currency, rate),
        previous: formatDisplayMoney(analytics.summary.profit.previous, currency, rate),
        change: analytics.summary.profit.changePercent,
        icon: TrendingUp,
        color: "text-violet-400",
      },
      {
        label: "Đơn hàng",
        value: formatNumber(analytics.summary.orders.current),
        previous: formatNumber(analytics.summary.orders.previous),
        change: analytics.summary.orders.changePercent,
        icon: ShoppingCart,
        color: "text-blue-400",
      },
      {
        label: "User mới",
        value: formatNumber(analytics.summary.newUsers.current),
        previous: formatNumber(analytics.summary.newUsers.previous),
        change: analytics.summary.newUsers.changePercent,
        icon: Users,
        color: "text-green-400",
      },
      {
        label: "Nạp tiền",
        value: formatDisplayMoney(analytics.summary.deposits.current, currency, rate),
        previous: formatDisplayMoney(analytics.summary.deposits.previous, currency, rate),
        change: analytics.summary.deposits.changePercent,
        icon: Wallet,
        color: "text-emerald-400",
      },
    ];
  }, [analytics, currency, rate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-brand-500" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
        {error}
      </div>
    );
  }

  const series = analytics.series;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-fg flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-brand-500" />
            Tổng quan vận hành
          </h1>
          <p className="mt-1 text-sm text-app-muted">
            So sánh doanh thu, lợi nhuận, đơn hàng, user và nạp tiền theo ngày/tháng.
          </p>
        </div>
        <div className="flex rounded-lg border border-app-border bg-app-card p-1">
          <Button size="sm" variant={period === "day" ? "default" : "ghost"} onClick={() => setPeriod("day")}>30 ngày</Button>
          <Button size="sm" variant={period === "month" ? "default" : "ghost"} onClick={() => setPeriod("month")}>12 tháng</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((m) => (
          <Card key={m.label} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-app-muted">{m.label}</CardTitle>
              <div className={`rounded-lg p-2 ${m.color.replace("text-", "bg-")}/10`}>
                <m.icon className={`h-4 w-4 ${m.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-app-fg">{m.value}</p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-app-muted">Kỳ trước: {m.previous}</span>
                <ChangeBadge value={m.change} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row 1: revenue bars + orders/users area */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-app-fg">Doanh thu theo kỳ</p>
              <p className="text-xs text-app-muted mt-0.5">Hover vào cột để xem chi tiết</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-brand-500">
              <span className="h-2 w-2 rounded-full bg-brand-500" /> Doanh thu
            </span>
          </div>
          <BarChart data={series} metric="revenue" color="text-brand-500" currency={currency} rate={rate} />
          <XLabels data={series} />
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-app-fg">Đơn hàng & User mới</p>
              <p className="text-xs text-app-muted mt-0.5">Xu hướng theo kỳ</p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 text-app-muted">
                <span className="h-2 w-2 rounded-full bg-brand-500" /> Đơn
              </span>
              <span className="inline-flex items-center gap-1.5 text-app-muted">
                <span className="h-2 w-2 rounded-full bg-green-400" /> User
              </span>
            </div>
          </div>
          <AreaChart data={series} />
          <XLabels data={series} />
        </Card>
      </div>

      {/* Charts row 2: profit + deposits bars */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-app-fg">Lợi nhuận theo kỳ</p>
              <p className="text-xs text-app-muted mt-0.5">Margin sau khi trừ giá gốc</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-violet-400">
              <span className="h-2 w-2 rounded-full bg-violet-400" /> Lợi nhuận
            </span>
          </div>
          <BarChart data={series} metric="profit" color="text-violet-400" currency={currency} rate={rate} />
          <XLabels data={series} />
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-app-fg">Nạp tiền theo kỳ</p>
              <p className="text-xs text-app-muted mt-0.5">Tổng tiền nạp confirmed</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Nạp tiền
            </span>
          </div>
          <BarChart data={series} metric="deposits" color="text-emerald-400" currency={currency} rate={rate} />
          <XLabels data={series} />
        </Card>
      </div>

      {/* Data table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-app-border">
          <p className="text-sm font-semibold text-app-fg">Chi tiết từng kỳ</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-app-muted bg-app-elevated">
              <tr>
                <th className="px-5 py-3 font-medium">Kỳ</th>
                <th className="px-5 py-3 text-right font-medium">Doanh thu</th>
                <th className="px-5 py-3 text-right font-medium">Lợi nhuận</th>
                <th className="px-5 py-3 text-right font-medium">Đơn</th>
                <th className="px-5 py-3 text-right font-medium">User mới</th>
                <th className="px-5 py-3 text-right font-medium">Nạp tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {series.map((row) => (
                <tr key={row.bucket} className="hover:bg-app-elevated/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-app-fg">{row.bucket}</td>
                  <td className="px-5 py-3 text-right text-brand-500">{formatDisplayMoney(row.revenue, currency, rate)}</td>
                  <td className="px-5 py-3 text-right text-violet-400">{formatDisplayMoney(row.profit, currency, rate)}</td>
                  <td className="px-5 py-3 text-right text-app-fg">{formatNumber(row.orders)}</td>
                  <td className="px-5 py-3 text-right text-green-400">{formatNumber(row.users)}</td>
                  <td className="px-5 py-3 text-right text-emerald-400">{formatDisplayMoney(row.deposits, currency, rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
