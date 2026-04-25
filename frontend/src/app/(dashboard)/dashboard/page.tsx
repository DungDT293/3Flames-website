"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import {
  AlertTriangle,
  Facebook,
  Hash,
  Info,
  Layers,
  Link as LinkIcon,
  Loader2,
  ShoppingCart,
  Youtube,
  Zap,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { fetchServices, type ServicesResponse } from "@/lib/api/services";
import { placeOrder } from "@/lib/api/orders";
import type { ApiError, Service } from "@/types/api";
import { calcCharge, compareCurrency, formatDisplayMoney } from "@/lib/utils/currency";
import { localizeServiceText, sanitizeServiceDescription, servicePlatform } from "@/lib/utils/service-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

function buildSchema(min: number, max: number) {
  return z.object({
    category: z.string().min(1, "Vui lòng chọn danh mục"),
    service_id: z.string().uuid("Vui lòng chọn dịch vụ"),
    link: z.string().url("Link không hợp lệ").max(2000, "Link quá dài"),
    quantity: z
      .number({ invalid_type_error: "Nhập số lượng hợp lệ" })
      .int("Số lượng phải là số nguyên")
      .min(min, `Tối thiểu ${min.toLocaleString("vi-VN")}`)
      .max(max, `Tối đa ${max.toLocaleString("vi-VN")}`),
  });
}

type OrderFormValues = z.infer<ReturnType<typeof buildSchema>>;

export default function NewOrderPage() {
  const balance = useAuthStore((s) => s.balance);
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const currency = usePreferencesStore((s) => s.currency);
  const language = usePreferencesStore((s) => s.language);
  const isVietnamese = language === "vi";
  const rate = useExchangeRateStore((s) => s.rate);

  const [servicesData, setServicesData] = useState<ServicesResponse | null>(null);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const currentMin = selectedService?.minQuantity ?? 1;
  const currentMax = selectedService?.maxQuantity ?? 1000000;

  const schema = useMemo(
    () => buildSchema(currentMin, currentMax),
    [currentMin, currentMax],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OrderFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: "",
      service_id: "",
      link: "",
      quantity: undefined as unknown as number,
    },
    mode: "onChange",
  });

  const watchedQuantity = watch("quantity");
  const watchedServiceId = watch("service_id");

  // Fetch services on mount
  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    fetchServices()
      .then((data) => {
        if (!cancelled) {
          setServicesData(data);
          setServicesError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setServicesError("Không thể tải danh mục dịch vụ. Vui lòng tải lại trang.");
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Categories list
  const categories = useMemo(
    () => (servicesData ? Object.keys(servicesData.services).sort() : []),
    [servicesData],
  );

  // Filtered services by category
  const filteredServices = useMemo(
    () =>
      selectedCategory && servicesData
        ? servicesData.services[selectedCategory] || []
        : [],
    [selectedCategory, servicesData],
  );

  // Sync selectedService when service_id changes
  useEffect(() => {
    if (!watchedServiceId || !filteredServices.length) {
      setSelectedService(null);
      return;
    }
    const svc = filteredServices.find((s) => s.id === watchedServiceId) || null;
    setSelectedService(svc);
  }, [watchedServiceId, filteredServices]);

  // Live charge calculation (BigInt-based, no floating-point)
  const charge = useMemo(() => {
    if (!selectedService || !watchedQuantity || watchedQuantity <= 0) return null;
    return calcCharge(watchedQuantity, selectedService.sellingPrice);
  }, [watchedQuantity, selectedService]);

  // Insufficient balance check
  const insufficientBalance = useMemo(() => {
    if (!charge) return false;
    return compareCurrency(charge, balance) > 0;
  }, [charge, balance]);

  const selectedDescription = sanitizeServiceDescription(selectedService?.description, language);

  // Category change handler
  function handleCategoryChange(cat: string) {
    setSelectedCategory(cat);
    setValue("category", cat, { shouldValidate: true });
    setValue("service_id", "", { shouldValidate: false });
    setValue("quantity", undefined as unknown as number, { shouldValidate: false });
    setSelectedService(null);
  }

  // Service change handler
  function handleServiceChange(serviceId: string) {
    setValue("service_id", serviceId, { shouldValidate: true });
    const svc = filteredServices.find((s) => s.id === serviceId);
    if (svc) {
      setSelectedService(svc);
      setValue("quantity", svc.minQuantity, { shouldValidate: true });
    }
  }

  async function onSubmit(data: OrderFormValues) {
    setIsSubmitting(true);
    try {
      const res = await placeOrder({
        service_id: data.service_id,
        link: data.link,
        quantity: data.quantity,
      });

      updateBalance(res.newBalance);
      toast.success(`Đặt dịch vụ thành công. Phí: ${formatDisplayMoney(res.order.charge, currency, rate?.rate)}`);
      reset();
      setSelectedCategory("");
      setSelectedService(null);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError & { balance?: string; required?: string }>;
      const status = axiosErr.response?.status;
      const data = axiosErr.response?.data;

      if (status === 503) {
        toast.error(
          "Hệ thống đang bảo trì tạm thời. Vui lòng thử lại sau.",
          { duration: 6000 },
        );
      } else if (status === 402) {
        if (data?.balance) {
          updateBalance(data.balance);
        }
        toast.error(
          `Số dư không đủ. Cần: ${data?.required ? formatDisplayMoney(data.required, currency, rate?.rate) : "N/A"}. Vui lòng nạp thêm tiền.`,
          { duration: 6000 },
        );
      } else if (status === 451) {
        toast.error(
          "Vui lòng chấp nhận điều khoản dịch vụ mới nhất trước khi đặt dịch vụ.",
          { duration: 6000 },
        );
      } else {
        toast.error(data?.message || data?.error || "Không thể đặt dịch vụ.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-fg flex items-center gap-2">
          <ShoppingCart className="h-6 w-6 text-brand-500" />
          Đặt dịch vụ
        </h1>
        <p className="mt-1 text-sm text-app-muted">
          Chọn dịch vụ, nhập link và hệ thống sẽ xử lý tự động.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-brand-500" />
            Thông tin đơn hàng
          </CardTitle>
          <CardDescription>
            Chọn danh mục, dịch vụ, link mục tiêu và số lượng cần đặt.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {servicesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
              <span className="ml-2 text-sm text-app-muted">Đang tải dịch vụ...</span>
            </div>
          ) : servicesError ? (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {servicesError}
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Category Selection */}
              <div className="space-y-2">
                <Label>{isVietnamese ? "Danh mục" : "Category"}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {categories.map((cat) => {
                    const platform = servicePlatform(cat);
                    const Icon = platform === "facebook" ? Facebook : platform === "youtube" ? Youtube : Layers;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryChange(cat)}
                        className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${selectedCategory === cat ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-app-border bg-app-elevated/50 text-app-muted hover:border-brand-500/40 hover:text-app-fg"}`}
                        disabled={isSubmitting}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{localizeServiceText(cat, language)}</span>
                      </button>
                    );
                  })}
                </div>
                {errors.category?.message && (
                  <p className="text-sm text-red-400">{errors.category.message}</p>
                )}
              </div>

              {/* Service Selection */}
              <div className="space-y-2">
                <Label>{isVietnamese ? "Dịch vụ" : "Service"}</Label>
                {!selectedCategory ? (
                  <div className="rounded-xl border border-dashed border-app-border bg-app-elevated/30 px-4 py-6 text-center text-sm text-app-muted">
                    {isVietnamese ? "Chọn danh mục trước để xem dịch vụ phù hợp." : "Choose a category first to see matching services."}
                  </div>
                ) : (
                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {filteredServices.map((svc) => {
                      const platform = servicePlatform(`${svc.category} ${svc.name}`);
                      const Icon = platform === "facebook" ? Facebook : platform === "youtube" ? Youtube : Layers;
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => handleServiceChange(svc.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${watchedServiceId === svc.id ? "border-brand-500 bg-brand-500/15" : "border-app-border bg-app-elevated/50 hover:border-brand-500/40"}`}
                          disabled={isSubmitting}
                        >
                          <div className="flex items-start gap-3">
                            <span className="rounded-lg border border-app-border bg-app-card p-2 text-app-muted">
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm font-medium text-app-fg">
                                {localizeServiceText(svc.name, language)}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                                <span>{formatDisplayMoney(svc.sellingPrice, currency, rate?.rate, 4)} / {isVietnamese ? "1.000" : "1K"}</span>
                                <span>•</span>
                                <span>{isVietnamese ? "Tối thiểu" : "Min"}: {svc.minQuantity.toLocaleString(isVietnamese ? "vi-VN" : "en-US")}</span>
                                <span>•</span>
                                <span>{isVietnamese ? "Tối đa" : "Max"}: {svc.maxQuantity.toLocaleString(isVietnamese ? "vi-VN" : "en-US")}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.service_id?.message && (
                  <p className="text-sm text-red-400">{errors.service_id.message}</p>
                )}
                {selectedDescription && (
                  <p className="flex items-start gap-1.5 text-xs text-app-muted">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {selectedDescription}
                  </p>
                )}
              </div>

              {/* Target Link */}
              <div className="space-y-2">
                <Label htmlFor="link">
                  <span className="flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5" />
                    Link mục tiêu
                  </span>
                </Label>
                <Input
                  id="link"
                  type="url"
                  placeholder="https://example.com/your-post"
                  {...register("link")}
                  error={errors.link?.message}
                  disabled={isSubmitting}
                />
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    Số lượng
                  </span>
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  placeholder={
                    selectedService
                      ? `${selectedService.minQuantity.toLocaleString()} - ${selectedService.maxQuantity.toLocaleString()}`
                      : "Chọn dịch vụ trước"
                  }
                  {...register("quantity", { valueAsNumber: true })}
                  error={errors.quantity?.message}
                  disabled={!selectedService || isSubmitting}
                  min={selectedService?.minQuantity}
                  max={selectedService?.maxQuantity}
                />
                {selectedService && (
                  <p className="text-xs text-zinc-500">
                    Tối thiểu: {selectedService.minQuantity.toLocaleString("vi-VN")} — Tối đa:{" "}
                    {selectedService.maxQuantity.toLocaleString("vi-VN")}
                  </p>
                )}
              </div>

              {/* Live Charge Calculation */}
              {charge && (
                <div
                  className={`rounded-lg border p-4 ${
                    insufficientBalance
                      ? "border-red-500/50 bg-red-500/5"
                      : "border-brand-500/30 bg-brand-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-app-muted">Tổng phí</span>
                    <span
                      className={`text-xl font-bold ${
                        insufficientBalance ? "text-red-400" : "text-brand-500"
                      }`}
                    >
                      {formatDisplayMoney(charge, currency, rate?.rate)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                    <span>Số dư hiện tại</span>
                    <span>{formatDisplayMoney(balance, currency, rate?.rate)}</span>
                  </div>

                  {insufficientBalance && (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">
                        Số dư không đủ. Vui lòng nạp thêm tiền.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={isSubmitting}
                disabled={
                  isSubmitting ||
                  insufficientBalance ||
                  !selectedService ||
                  !charge
                }
              >
                <ShoppingCart className="mr-2 h-5 w-5" />
                Đặt dịch vụ
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
