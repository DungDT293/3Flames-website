"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Facebook,
  Flame,
  Gauge,
  Globe2,
  KeyRound,
  Layers3,
  LockKeyhole,
  Package,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
  Youtube,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PreferencesControls } from "@/components/preferences/preferences-controls";
import { getToken } from "@/lib/api/client";
import { fetchServices, type ServicesResponse } from "@/lib/api/services";
import { useT } from "@/lib/i18n/use-t";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { formatDisplayMoney } from "@/lib/utils/currency";
import { cleanServiceText } from "@/lib/utils/service-copy";
import type { Service } from "@/types/api";

const stats = [
  { labelKey: "landing.activeUsers", value: "10K+", icon: Users },
  { labelKey: "landing.ordersProcessed", value: "5M+", icon: Package },
  { labelKey: "landing.uptime", value: "99.9%", icon: Activity },
  { labelKey: "landing.liveCatalog", value: "75+", icon: Layers3 },
] as const;

const features = [
  {
    icon: Zap,
    titleKey: "landing.featureAuto",
    descriptionKey: "landing.featureAutoDesc",
  },
  {
    icon: WalletCards,
    titleKey: "landing.featureDeposit",
    descriptionKey: "landing.featureDepositDesc",
  },
  {
    icon: Code2,
    titleKey: "landing.featureOps",
    descriptionKey: "landing.featureOpsDesc",
  },
] as const;

const fallbackServices = [
  {
    platform: "YouTube",
    icon: Youtube,
    title: "YouTube Subscribers",
    match: ["subscriber", "subs"],
    metric: "High retention",
    accent: "from-red-500/20 to-brand-500/10",
  },
  {
    platform: "YouTube",
    icon: Youtube,
    title: "YouTube Real Views",
    match: ["native views", "real views", "views direct"],
    metric: "Never drop",
    accent: "from-brand-500/20 to-red-500/10",
  },
  {
    platform: "Facebook",
    icon: Facebook,
    title: "Facebook Page Likes",
    match: ["page likes", "facebook likes", "fb likes"],
    metric: "Profile quality",
    accent: "from-blue-500/20 to-brand-500/10",
  },
  {
    platform: "YouTube",
    icon: Youtube,
    title: "YouTube Watch Hours",
    match: ["watch time", "watch hours"],
    metric: "Monetization ready",
    accent: "from-amber-500/20 to-brand-500/10",
  },
];

const pipeline = [
  { label: "Nạp tiền", value: "VietQR / Crypto", icon: WalletCards },
  { label: "Đặt dịch vụ", value: "Dashboard thông minh", icon: Gauge },
  { label: "Theo dõi", value: "Cập nhật trực tiếp", icon: Radio },
  { label: "Mở rộng", value: "Tăng trưởng an toàn", icon: TrendingUp },
];

const terminalLines = [
  { key: "status", value: "order.accepted", tone: "text-emerald-400" },
  { key: "service", value: "youtube.real_views" },
  { key: "quantity", value: "10,000" },
  { key: "delivery", value: "processing", tone: "text-brand-400" },
  { key: "webhook", value: "live_status_stream", tone: "text-sky-400" },
];

type LandingService = (typeof fallbackServices)[number] & {
  service?: Service;
};

function findMatchingService(data: ServicesResponse | null, match: readonly string[]): Service | undefined {
  if (!data) return undefined;

  const services = Object.values(data.services).flat();
  return services.find((service) => {
    const name = cleanServiceText(service.name).toLowerCase();
    const category = cleanServiceText(service.category).toLowerCase();
    return match.some((term) => name.includes(term) || category.includes(term));
  });
}

export default function LandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [serviceData, setServiceData] = useState<ServicesResponse | null>(null);
  const t = useT();
  const currency = usePreferencesStore((state) => state.currency);
  const rate = useExchangeRateStore((state) => state.rate);
  const loadRate = useExchangeRateStore((state) => state.loadRate);

  useEffect(() => {
    setIsAuthenticated(Boolean(getToken()));
    loadRate();

    fetchServices()
      .then(setServiceData)
      .catch(() => setServiceData(null));
  }, [loadRate]);

  const landingServices = useMemo<LandingService[]>(
    () => fallbackServices.map((service) => ({
      ...service,
      service: findMatchingService(serviceData, service.match),
    })),
    [serviceData],
  );

  return (
    <main className="min-h-screen overflow-hidden bg-surface-900 text-app-fg">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(249,115,22,0.22),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.14),transparent_30%),radial-gradient(circle_at_50%_70%,rgba(245,158,11,0.08),transparent_35%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_top,black,transparent_70%)]" />

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-surface-900/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 shadow-lg shadow-brand-500/20">
              <Flame className="h-6 w-6 text-brand-400" />
              <div className="absolute inset-0 rounded-xl bg-brand-500/20 blur-xl" />
            </div>
            <span className="text-xl font-black tracking-tight">
              3<span className="text-brand-500">Flames</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-app-muted md:flex">
            <a href="#features" className="transition-colors hover:text-app-fg">Features</a>
            <a href="#services" className="transition-colors hover:text-app-fg">Services</a>
            <a href="#operations" className="transition-colors hover:text-app-fg">System</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <PreferencesControls compact className="hidden sm:flex" />
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button className="rounded-full px-5">
                  {t("common.dashboard")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" className="rounded-full px-4">{t("common.login")}</Button>
                </Link>
                <Link href="/register">
                  <Button className="rounded-full px-5 shadow-xl shadow-brand-500/25">{t("common.getStarted")}</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="relative px-4 pb-20 pt-32 sm:px-6 sm:pb-28 sm:pt-40 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative z-10">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-4 py-2 text-sm text-brand-200 shadow-lg shadow-brand-500/10">
              <Sparkles className="h-4 w-4 text-brand-400" />
              {t("landing.badge")}
            </div>

            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl">
              {t("landing.headlineA")} {" "}
              <span className="relative inline-block bg-gradient-to-r from-brand-300 via-brand-500 to-red-500 bg-clip-text text-transparent">
                {t("landing.headlineB")}
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-app-muted sm:text-xl">
              {t("landing.subheadline")}
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="h-14 rounded-full px-8 text-base shadow-2xl shadow-brand-500/30">
                  {t("landing.start")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#services">
                <Button variant="outline" size="lg" className="h-14 rounded-full px-8 text-base">
                  {t("landing.explore")}
                  <ChevronRight className="ml-1 h-5 w-5" />
                </Button>
              </a>
            </div>

            <div className="mt-9 flex flex-wrap gap-3 text-sm text-app-muted">
              {[
                t("landing.noManual"),
                t("landing.realtime"),
                t("landing.secure"),
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 lg:pl-4">
            <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-brand-500/20 via-red-500/10 to-transparent blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-surface-800/80 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="h-3 w-3 rounded-full bg-amber-500" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                </div>
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  {t("landing.liveEngine")}
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <div className="mb-5 grid grid-cols-2 gap-3">
                  {stats.slice(0, 4).map((stat) => (
                    <div key={t(stat.labelKey)} className="rounded-2xl border border-white/10 bg-surface-900/70 p-4">
                      <stat.icon className="mb-3 h-5 w-5 text-brand-400" />
                      <p className="text-2xl font-black">{stat.value}</p>
                      <p className="mt-1 text-xs text-app-muted">{t(stat.labelKey)}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-sm shadow-inner shadow-black/40">
                  <div className="mb-4 flex items-center justify-between text-xs text-app-muted">
                    <span>3flames.order.stream</span>
                    <span className="flex items-center gap-2 text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" /> SSE
                    </span>
                  </div>
                  <div className="space-y-3">
                    {terminalLines.map((line) => (
                      <div key={line.key} className="flex justify-between gap-4">
                        <span className="text-app-muted">{line.key}</span>
                        <span className={line.tone || "text-zinc-200"}>{line.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-brand-500/20 bg-gradient-to-r from-brand-500/10 to-red-500/10 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Revenue dashboard</p>
                      <p className="text-sm text-app-muted">Last 24 hours</p>
                    </div>
                    <BarChart3 className="h-6 w-6 text-brand-400" />
                  </div>
                  <div className="flex h-24 items-end gap-2">
                    {[38, 52, 44, 70, 58, 86, 74, 96, 82, 100].map((height, i) => (
                      <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand-600 to-brand-300" style={{ height: `${height}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-y border-white/10 bg-white/[0.025] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={t(stat.labelKey)} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-surface-800/60 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                <stat.icon className="h-6 w-6 text-brand-400" />
              </div>
              <div>
                <p className="text-2xl font-black">{stat.value}</p>
                <p className="text-sm text-app-muted">{t(stat.labelKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 max-w-3xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-brand-400">3Flames</p>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl">{t("landing.whyTitle")}</h2>
            <p className="mt-5 text-lg leading-8 text-app-muted">{t("landing.whyDesc")}</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.titleKey} className="group relative overflow-hidden rounded-3xl border border-white/10 bg-surface-800/70 p-8 shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-brand-500/10">
                <div className="absolute right-0 top-0 h-32 w-32 translate-x-10 -translate-y-10 rounded-full bg-brand-500/10 blur-3xl transition-opacity group-hover:opacity-100" />
                <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/10">
                  <feature.icon className="h-7 w-7 text-brand-400" />
                </div>
                <h3 className="text-2xl font-bold">{t(feature.titleKey)}</h3>
                <p className="mt-4 leading-7 text-app-muted">{t(feature.descriptionKey)}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
            <div id="operations" className="rounded-3xl border border-white/10 bg-gradient-to-br from-surface-800 to-surface-900 p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10">
                  <KeyRound className="h-6 w-6 text-brand-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Hệ thống vận hành thông minh</h3>
                  <p className="text-app-muted">Đặt dịch vụ nhanh, theo dõi rõ ràng</p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-5 font-mono text-sm text-app-fg">
                <p><span className="text-brand-400">ORDER</span> 3FL-2026-0001</p>
                <p className="mt-3 text-app-muted">service: youtube.real_views</p>
                <p className="mt-3 text-emerald-400">{`{ "status": "PROCESSING", "tracking": "LIVE" }`}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-surface-800/70 p-8">
              <LockKeyhole className="mb-6 h-10 w-10 text-brand-400" />
              <h3 className="text-2xl font-bold">Protected by design</h3>
              <p className="mt-4 leading-7 text-app-muted">Rate limits, admin controls, circuit breaker protection, and balance ledger invariants.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="relative bg-white/[0.025] px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-brand-400">Top services</p>
              <h2 className="text-4xl font-black tracking-tight sm:text-5xl">{t("landing.servicesTitle")}</h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-app-muted">{t("landing.servicesDesc")}</p>
            </div>
            <Link href="/register">
              <Button size="lg" className="h-14 rounded-full px-8">{t("landing.unlock")}</Button>
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {landingServices.map((service) => (
              <div key={service.title} className="group relative overflow-hidden rounded-3xl border border-white/10 bg-surface-800/80 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40">
                <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${service.accent} to-transparent`} />
                <div className="relative">
                  <div className="mb-8 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
                      <service.icon className="h-6 w-6 text-brand-300" />
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-app-muted">{service.platform}</span>
                  </div>
                  <h3 className="text-xl font-bold">{service.title}</h3>
                  <p className="mt-2 text-sm text-app-muted">{service.metric}</p>
                  <div className="mt-8 flex items-end justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-app-muted">Starting at</p>
                      <p className="mt-1 text-2xl font-black text-brand-400">
                        {service.service
                          ? `${formatDisplayMoney(service.service.sellingPrice, currency, rate?.rate, 4)} / 1K`
                          : "—"}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-brand-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-4">
            {pipeline.map((step, index) => (
              <div key={step.label} className="relative rounded-3xl border border-white/10 bg-surface-800/70 p-6">
                <div className="mb-6 flex items-center justify-between">
                  <step.icon className="h-8 w-8 text-brand-400" />
                  <span className="text-5xl font-black text-white/[0.04]">0{index + 1}</span>
                </div>
                <h3 className="text-xl font-bold">{step.label}</h3>
                <p className="mt-2 text-app-muted">{step.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-brand-500/20 bg-gradient-to-br from-brand-500/15 via-surface-800 to-red-500/10 p-8 text-center shadow-2xl shadow-brand-500/10 sm:p-14 lg:p-20">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15">
            <BadgeCheck className="h-8 w-8 text-brand-300" />
          </div>
          <h2 className="mx-auto max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">{t("landing.ctaTitle")}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-app-fg">{t("landing.ctaDesc")}</p>
          <div className="mt-9 flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="h-14 rounded-full px-9 text-base">{t("landing.createAccount")}</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="h-14 rounded-full px-9 text-base">{t("common.login")}</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative border-t border-white/10 bg-surface-900/90 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Flame className="h-6 w-6 text-brand-500" />
              <span className="text-lg font-black">3<span className="text-brand-500">Flames</span></span>
            </div>
            <p className="mt-3 max-w-md text-sm text-app-muted">{t("landing.footerDesc")}</p>
          </div>

          <div className="flex flex-wrap gap-5 text-sm text-app-muted">
            <Link href="/terms" className="transition-colors hover:text-app-fg">{t("common.terms")}</Link>
            <a href="mailto:support@3flames.com" className="transition-colors hover:text-app-fg">{t("common.support")}</a>
          </div>

          <p className="text-sm text-zinc-600">© {new Date().getFullYear()} 3Flames. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
