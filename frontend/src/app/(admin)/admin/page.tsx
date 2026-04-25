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
import { formatCurrency } from "@/lib/utils/currency";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
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
      {Math.abs(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%
    </span>
  );
}

function Bars({ data, metric }: { data: AnalyticsSeriesPoint[]; metric: "revenue" | "profit" | "deposits" }) {
  const values = data.map((item) => Number(item[metric] || 0));
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-48 items-end gap-1 rounded-xl border border-app-border bg-app-card p-4">
      {data.map((item, idx) => {
        const height = Math.max(4, (values[idx] / max) * 100);
        return (
          <div key={item.bucket} className="group flex flex-1 flex-col items-center justify-end gap-2">
            <div className="relative w-full rounded-t bg-brand-500/80 transition-colors group-hover:bg-brand-400" style={{ height: `${height}%` }}>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white group-hover:block">
                {item.bucket}: {formatCurrency(values[idx].toString())}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Lines({ data }: { data: AnalyticsSeriesPoint[] }) {
  const width = 800;
  const height = 220;
  const max = Math.max(...data.map((item) => Math.max(item.orders, item.users)), 1);
  const points = (key: "orders" | "users") => data.map((item, idx) => {
    const x = data.length <= 1 ? 0 : (idx / (data.length - 1)) * width;
    const y = height - (item[key] / max) * (height - 20) - 10;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="rounded-xl border border-app-border bg-app-card p-4">
      <div className="mb-3 flex gap-4 text-xs text-app-muted">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-500" />Orders</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-400" />Users</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-visible">
        <polyline points={points("orders")} fill="none" stroke="rgb(249 115 22)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={points("users")} fill="none" stroke="rgb(74 222 128)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function AdminOverviewPage() {
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
        setError("Failed to load analytics.");
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
        value: formatCurrency(analytics.summary.revenue.current),
        previous: formatCurrency(analytics.summary.revenue.previous),
        change: analytics.summary.revenue.changePercent,
        icon: DollarSign,
        color: "text-brand-500",
      },
      {
        label: "Lợi nhuận",
        value: formatCurrency(analytics.summary.profit.current),
        previous: formatCurrency(analytics.summary.profit.previous),
        change: analytics.summary.profit.changePercent,
        icon: TrendingUp,
        color: "text-red-400",
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
        value: formatCurrency(analytics.summary.deposits.current),
        previous: formatCurrency(analytics.summary.deposits.previous),
        change: analytics.summary.deposits.changePercent,
        icon: Wallet,
        color: "text-emerald-400",
      },
    ];
  }, [analytics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-app-muted">{m.label}</CardTitle>
              <m.icon className={`h-5 w-5 ${m.color}`} />
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

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-app-fg">Doanh thu theo kỳ</h2>
          <Bars data={analytics.series} metric="revenue" />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-app-fg">Đơn hàng và user mới</h2>
          <Lines data={analytics.series} />
        </div>
      </div>

      <div className="rounded-lg border border-app-border bg-app-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-app-border text-left text-app-muted">
            <tr>
              <th className="px-4 py-3">Kỳ</th>
              <th className="px-4 py-3 text-right">Doanh thu</th>
              <th className="px-4 py-3 text-right">Lợi nhuận</th>
              <th className="px-4 py-3 text-right">Đơn</th>
              <th className="px-4 py-3 text-right">User mới</th>
              <th className="px-4 py-3 text-right">Nạp tiền</th>
            </tr>
          </thead>
          <tbody>
            {analytics.series.map((row) => (
              <tr key={row.bucket} className="border-b border-app-border last:border-0">
                <td className="px-4 py-3 text-app-fg">{row.bucket}</td>
                <td className="px-4 py-3 text-right text-app-fg">{formatCurrency(row.revenue)}</td>
                <td className="px-4 py-3 text-right text-app-fg">{formatCurrency(row.profit)}</td>
                <td className="px-4 py-3 text-right text-app-fg">{formatNumber(row.orders)}</td>
                <td className="px-4 py-3 text-right text-app-fg">{formatNumber(row.users)}</td>
                <td className="px-4 py-3 text-right text-app-fg">{formatCurrency(row.deposits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
