"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import {
  getCircuitBreaker,
  resetCircuitBreaker,
  type CircuitBreakerStatus,
} from "@/lib/api/admin";
import type { ApiError } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function SystemHealthPage() {
  const [status, setStatus] = useState<CircuitBreakerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getCircuitBreaker();
      setStatus(data);
    } catch {
      setError("Không thể tải trạng thái hệ thống.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleReset() {
    setIsResetting(true);
    try {
      const res = await resetCircuitBreaker();
      toast.success(res.message);
      await loadStatus();
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      toast.error(
        axiosErr.response?.data?.error || "Không thể reset hệ thống.",
      );
    } finally {
      setIsResetting(false);
    }
  }

  function formatTTL(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="h-6 w-6 text-brand-500" />
            System Health
          </h1>
        </div>
        <div className="rounded-md bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  const isOpen = status?.isOpen ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="h-6 w-6 text-brand-500" />
            System Health
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Provider circuit breaker & order intake status
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={loadStatus}
          disabled={isLoading}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Status Card */}
      <Card
        className={
          isOpen
            ? "border-red-500/40 bg-red-500/5"
            : "border-green-500/40 bg-green-500/5"
        }
      >
        <CardHeader>
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                isOpen ? "bg-red-500/20" : "bg-green-500/20"
              }`}
            >
              {isOpen ? (
                <ShieldAlert className="h-7 w-7 text-red-400" />
              ) : (
                <ShieldCheck className="h-7 w-7 text-green-400" />
              )}
            </div>
            <div>
              <CardTitle
                className={`text-xl ${isOpen ? "text-red-400" : "text-green-400"}`}
              >
                {isOpen ? "MAINTENANCE MODE" : "SYSTEM HEALTHY"}
              </CardTitle>
              <CardDescription>
                {isOpen
                  ? "Circuit breaker is TRIPPED — order intake is paused"
                  : "All systems operational — orders are flowing normally"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Metrics */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-surface-500 bg-surface-800 p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-zinc-500" />
                <span className="text-sm text-zinc-400">Recent Failures</span>
              </div>
              <p
                className={`text-2xl font-bold ${
                  (status?.recentFailures ?? 0) > 0
                    ? "text-red-400"
                    : "text-zinc-100"
                }`}
              >
                {status?.recentFailures ?? 0}
              </p>
            </div>

            {isOpen && (
              <div className="rounded-lg border border-surface-500 bg-surface-800 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-zinc-500" />
                  <span className="text-sm text-zinc-400">
                    Auto-recovery in
                  </span>
                </div>
                <p className="text-2xl font-bold text-brand-500 font-mono">
                  {formatTTL(status?.ttlSeconds ?? 0)}
                </p>
              </div>
            )}
          </div>

          {/* Reset Button */}
          {isOpen && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <p className="text-sm text-zinc-300 mb-3">
                Force reset the circuit breaker to immediately re-enable order
                intake. Only do this if you are confident the provider has
                recovered.
              </p>
              <Button
                variant="destructive"
                size="lg"
                className="w-full"
                onClick={handleReset}
                isLoading={isResetting}
              >
                <ShieldAlert className="mr-2 h-5 w-5" />
                Force Reset Circuit Breaker
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
