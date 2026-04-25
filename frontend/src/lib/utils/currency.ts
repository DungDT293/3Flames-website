/**
 * Safe decimal math for currency — avoids JS floating-point errors.
 * Backend monetary values are USD decimal strings (Decimal(16,6)).
 */

function normalizeDecimal(value: string, scale = 6): bigint {
  const clean = value || "0";
  const parts = clean.split(".");
  const intPart = parts[0] || "0";
  const fracPart = (parts[1] || "").padEnd(scale, "0").slice(0, scale);
  return BigInt(intPart) * 10n ** BigInt(scale) + BigInt(fracPart || "0");
}

export function calcCharge(quantity: number, sellingPricePerK: string): string {
  const priceInMicro = normalizeDecimal(sellingPricePerK);
  const chargeInMicro = (priceInMicro * BigInt(quantity)) / 1000n;

  const wholePart = chargeInMicro / 1000000n;
  const fracPartResult = chargeInMicro % 1000000n;
  const fracStr = fracPartResult.toString().padStart(6, "0");

  return `${wholePart}.${fracStr}`;
}

export function formatUsd(value: string, decimals: number = 2): string {
  const parts = value.split(".");
  const intPart = parts[0] || "0";
  const fracPart = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);

  const formatted = Number(intPart).toLocaleString("en-US");
  return `$${formatted}.${fracPart}`;
}

export function usdToVnd(valueUsd: string, rate: string): number {
  const usdMicro = normalizeDecimal(valueUsd);
  const rateMicro = normalizeDecimal(rate);
  const vndMicro = (usdMicro * rateMicro) / 1000000n;
  return Number(vndMicro / 1000000n);
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatVndFromUsd(valueUsd: string, rate: string): string {
  return formatVnd(usdToVnd(valueUsd, rate));
}

export function formatDisplayMoney(
  valueUsd: string,
  currency: "USD" | "VND",
  rate?: string,
  decimals = 2,
): string {
  if (currency === "VND") {
    return formatVndFromUsd(valueUsd, rate || "25000");
  }
  return formatUsd(valueUsd, decimals);
}

export function formatCurrency(value: string, decimals: number = 2): string {
  return formatUsd(value, decimals);
}

export function compareCurrency(a: string, b: string): number {
  const bigA = normalizeDecimal(a);
  const bigB = normalizeDecimal(b);
  if (bigA < bigB) return -1;
  if (bigA > bigB) return 1;
  return 0;
}
