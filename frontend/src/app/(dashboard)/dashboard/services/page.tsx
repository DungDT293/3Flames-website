"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { fetchServices, type ServicesResponse } from "@/lib/api/services";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { formatDisplayMoney } from "@/lib/utils/currency";
import { cleanServiceText, sanitizeServiceDescription } from "@/lib/utils/service-copy";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function ServicesPage() {
  const currency = usePreferencesStore((s) => s.currency);
  const rate = useExchangeRateStore((s) => s.rate);

  const [data, setData] = useState<ServicesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchServices()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Không thể tải danh mục dịch vụ. Vui lòng thử lại.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () => (data ? Object.keys(data.services).sort() : []),
    [data],
  );

  const services = useMemo(() => {
    if (!data) return [];

    const selectedCategories = category ? [category] : categories;
    const search = query.trim().toLowerCase();

    return selectedCategories
      .flatMap((cat) => data.services[cat] ?? [])
      .filter((service) => {
        if (!search) return true;
        return (
          cleanServiceText(service.name).toLowerCase().includes(search) ||
          cleanServiceText(service.category).toLowerCase().includes(search)
        );
      });
  }, [categories, category, data, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-500">
            <Layers className="h-4 w-4" /> Danh mục dịch vụ
          </div>
          <h1 className="text-2xl font-bold text-app-fg sm:text-3xl">Bảng giá dịch vụ</h1>
          <p className="mt-2 max-w-2xl text-sm text-app-muted">
            Xem toàn bộ dịch vụ YouTube và Facebook đang hoạt động, giá hiển thị theo tiền tệ bạn chọn.
          </p>
        </div>
        <Link href="/dashboard">
          <Button>Đặt dịch vụ</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
          <CardDescription>Tìm nhanh dịch vụ theo tên hoặc nhóm dịch vụ.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[1fr_280px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm YouTube views, Facebook likes..."
                className="pl-9"
              />
            </div>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Tất cả danh mục</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cleanServiceText(cat)}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-app-border bg-app-card">
          <div className="flex items-center gap-3 text-app-muted">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" /> Đang tải dịch vụ...
          </div>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center text-red-400">{error}</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-app-muted">
            <span>{services.length.toLocaleString("vi-VN")} dịch vụ</span>
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> {categories.length.toLocaleString("vi-VN")} danh mục
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => {
              const description = sanitizeServiceDescription(service.description);

              return (
                <Card key={service.id} className="overflow-hidden">
                  <CardHeader>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <Badge variant="secondary" className="max-w-[220px] truncate">
                        {cleanServiceText(service.category)}
                      </Badge>
                      <Badge>{service.type}</Badge>
                    </div>
                    <CardTitle className="line-clamp-2 text-base">{cleanServiceText(service.name)}</CardTitle>
                    {description && (
                      <CardDescription className="line-clamp-2">{description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-app-border bg-app-elevated p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-app-muted">Giá từ</p>
                      <p className="mt-1 text-2xl font-bold text-brand-500">
                        {formatDisplayMoney(service.sellingPrice, currency, rate?.rate, 4)}
                        <span className="text-sm font-medium text-app-muted"> / 1K</span>
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-app-muted">Tối thiểu</p>
                        <p className="font-semibold text-app-fg">{service.minQuantity.toLocaleString("vi-VN")}</p>
                      </div>
                      <div>
                        <p className="text-app-muted">Tối đa</p>
                        <p className="font-semibold text-app-fg">{service.maxQuantity.toLocaleString("vi-VN")}</p>
                      </div>
                    </div>
                    <Link href="/dashboard" className="block">
                      <Button className="w-full">Chọn dịch vụ</Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
