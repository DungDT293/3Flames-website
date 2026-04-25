"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import {
  Wallet,
  QrCode,
  Copy,
  Check,
  ArrowLeft,
  Clock,
  Loader2,
  Banknote,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useExchangeRateStore } from "@/lib/stores/exchange-rate-store";
import { createPaymentQR, type CreateQrResponse } from "@/lib/api/payments";
import { getToken } from "@/lib/api/client";
import type { ApiError } from "@/types/api";
import { formatDisplayMoney, formatVnd } from "@/lib/utils/currency";
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

const depositSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Enter a valid amount" })
    .int("Amount must be a whole number")
    .positive("Amount must be positive")
    .min(10_000, "Minimum deposit is 10,000 VND"),
});

type DepositFormValues = z.infer<typeof depositSchema>;

const QUICK_AMOUNTS = [
  { label: "50K", value: 50_000 },
  { label: "100K", value: 100_000 },
  { label: "200K", value: 200_000 },
  { label: "500K", value: 500_000 },
  { label: "1M", value: 1_000_000 },
];

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

const EXPIRY_SECONDS = 5 * 60;

export default function AddFundsPage() {
  const updateBalance = useAuthStore((s) => s.updateBalance);
  const balance = useAuthStore((s) => s.balance);
  const currency = usePreferencesStore((s) => s.currency);
  const rate = useExchangeRateStore((s) => s.rate);

  const [step, setStep] = useState<1 | 2>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrData, setQrData] = useState<CreateQrResponse | null>(null);
  const [memoCopied, setMemoCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(EXPIRY_SECONDS);

  const eventSourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<DepositFormValues>({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: undefined as unknown as number },
    mode: "onChange",
  });

  const watchedAmount = watch("amount");

  // Cleanup SSE + timer on unmount or step change
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Countdown timer for Step 2
  useEffect(() => {
    if (step !== 2) return;

    setTimeLeft(EXPIRY_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleCancel();
          toast.error("Payment session expired. Please generate a new QR code.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [step]);

  // SSE listener for Step 2
  useEffect(() => {
    if (step !== 2) return;

    const token = getToken();
    if (!token) return;

    const url = `${API_BASE_URL}/users/stream`;
    const es = new EventSource(url, { withCredentials: false });

    // EventSource doesn't support custom headers natively.
    // We close it immediately and use a fetch-based SSE reader instead.
    es.close();

    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(url, {
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
            } else if (line.startsWith("data: ") && currentEvent === "deposit_success") {
              try {
                const data = JSON.parse(line.slice(6));
                updateBalance(data.newBalance);
                toast.success(
                  `Deposit successful! +${formatVnd(qrData?.amount || 0)}`,
                  { duration: 6000 },
                );
                cleanup();
                setStep(1);
                setQrData(null);
                reset();
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

    eventSourceRef.current = { close: () => controller.abort() } as EventSource;

    return () => {
      controller.abort();
    };
  }, [step, qrData, updateBalance, cleanup, reset]);

  async function onSubmit(data: DepositFormValues) {
    setIsGenerating(true);
    try {
      const res = await createPaymentQR(data.amount);
      setQrData(res);
      setStep(2);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      const msg =
        axiosErr.response?.data?.message ||
        axiosErr.response?.data?.error ||
        "Failed to generate QR code.";
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleCancel() {
    cleanup();
    setStep(1);
    setQrData(null);
    reset();
  }

  async function handleCopyMemo() {
    if (!qrData) return;
    try {
      await navigator.clipboard.writeText(qrData.memo);
      setMemoCopied(true);
      toast.success("Memo copied to clipboard");
      setTimeout(() => setMemoCopied(false), 2000);
    } catch {
      toast.error("Failed to copy memo");
    }
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-brand-500" />
          Add Funds
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Current balance:{" "}
          <span className="text-brand-500 font-semibold">
            {formatDisplayMoney(balance, currency, rate?.rate)}
          </span>
          {rate && (
            <span className="ml-2 text-xs text-zinc-500">
              1 USD ≈ {formatVnd(Number(rate.rate))}
            </span>
          )}
        </p>
      </div>

      {/* ─── Step 1: Amount Input ─────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Banknote className="h-5 w-5 text-brand-500" />
              Deposit Amount
            </CardTitle>
            <CardDescription>
              Select or enter the amount you want to deposit (VND)
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Quick select buttons */}
              <div className="space-y-2">
                <Label>Quick Select</Label>
                <div className="grid grid-cols-5 gap-2">
                  {QUICK_AMOUNTS.map((qa) => (
                    <button
                      key={qa.value}
                      type="button"
                      onClick={() =>
                        setValue("amount", qa.value, { shouldValidate: true })
                      }
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                        watchedAmount === qa.value
                          ? "border-brand-500 bg-brand-500/10 text-brand-500"
                          : "border-surface-500 bg-surface-700 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">Custom Amount (VND)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount (min 10,000)"
                  {...register("amount", { valueAsNumber: true })}
                  error={errors.amount?.message}
                  min={10_000}
                  step={1000}
                  disabled={isGenerating}
                />
                {watchedAmount >= 10_000 && (
                  <p className="text-xs text-zinc-500">
                    {formatVnd(watchedAmount)}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={isGenerating}
                disabled={isGenerating || !watchedAmount}
              >
                <QrCode className="mr-2 h-5 w-5" />
                Generate Payment QR
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 2: QR Display + SSE Listening ──────────── */}
      {step === 2 && qrData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <QrCode className="h-5 w-5 text-brand-500" />
                Scan to Pay
              </CardTitle>
              <div className="flex items-center gap-1.5 rounded-lg bg-surface-700 px-3 py-1.5">
                <Clock className="h-4 w-4 text-brand-500" />
                <span
                  className={`text-sm font-mono font-semibold ${
                    timeLeft <= 60 ? "text-red-400" : "text-zinc-300"
                  }`}
                >
                  {minutes}:{seconds.toString().padStart(2, "0")}
                </span>
              </div>
            </div>
            <CardDescription>
              Open your banking app and scan this QR code
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* QR Image */}
            <div className="flex justify-center">
              <div className="rounded-xl bg-white p-4">
                <img
                  src={qrData.qrUrl}
                  alt="VietQR Payment Code"
                  className="h-64 w-64 object-contain"
                />
              </div>
            </div>

            {/* Payment Details */}
            <div className="space-y-3 rounded-lg border border-surface-500 bg-surface-700 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Amount</span>
                <span className="text-lg font-bold text-brand-500">
                  {formatVnd(qrData.amount)}
                </span>
              </div>

              <div className="border-t border-surface-500" />

              <div className="space-y-1.5">
                <span className="text-sm text-zinc-400">Transfer Content (Memo)</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-surface-600 px-3 py-2 text-sm font-mono text-zinc-100">
                    {qrData.memo}
                  </code>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handleCopyMemo}
                    title="Copy memo"
                  >
                    {memoCopied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="rounded-lg bg-brand-500/5 border border-brand-500/20 p-4 space-y-2">
              <p className="text-sm text-zinc-300 font-medium">Instructions:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-zinc-400">
                <li>Open your banking app and scan the QR code above</li>
                <li>
                  <span className="text-red-400 font-medium">Do not</span> change
                  the transfer content (memo)
                </li>
                <li>Confirm the payment in your banking app</li>
                <li>Your balance will update automatically within 1-3 minutes</li>
              </ol>
            </div>

            {/* Waiting indicator */}
            <div className="flex items-center justify-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
              <span className="text-sm text-zinc-400">
                Waiting for payment confirmation...
              </span>
            </div>

            {/* Cancel button */}
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleCancel}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel and go back
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
