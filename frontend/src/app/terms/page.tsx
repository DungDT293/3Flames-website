"use client";

import Link from "next/link";
import { Flame, ShieldCheck } from "lucide-react";
import { PublicHeaderActions } from "@/components/preferences/public-header-actions";
import { usePreferencesStore } from "@/lib/stores/preferences-store";

const content = {
  vi: {
    badge: "Pháp lý & Tuân thủ",
    title: "Điều khoản dịch vụ",
    updated: "Cập nhật lần cuối: 24/04/2026. Trang này tóm tắt các quy định vận hành khi sử dụng 3Flames.",
    support: "Nếu cần hỗ trợ hoặc yêu cầu xem xét tài khoản, vui lòng liên hệ support@3flames.com.",
    sections: [
      {
        title: "1. Chấp nhận điều khoản",
        body: "Khi tạo tài khoản hoặc đặt dịch vụ trên 3Flames, bạn đồng ý tuân thủ Điều khoản dịch vụ này và các quy định liên quan của từng nền tảng.",
      },
      {
        title: "2. Sử dụng dịch vụ",
        body: "3Flames cung cấp dịch vụ tăng trưởng mạng xã hội cho mục đích quảng bá hợp lệ. Bạn chịu trách nhiệm đảm bảo liên kết, chiến dịch và nội dung của mình không vi phạm chính sách nền tảng.",
      },
      {
        title: "3. Thanh toán và số dư",
        body: "Khoản nạp được cộng vào số dư tài khoản sau khi xác minh thành công. Mọi thay đổi số dư đều được ghi nhận trong lịch sử giao dịch để đảm bảo minh bạch.",
      },
      {
        title: "4. Xử lý đơn hàng",
        body: "Đơn hàng được xử lý tự động trong hệ thống 3Flames. Tốc độ hoàn thành, khả năng bảo hành và hỗ trợ huỷ đơn có thể khác nhau tuỳ từng dịch vụ.",
      },
      {
        title: "5. Hoàn tiền",
        body: "Đơn hàng bị huỷ sẽ được hoàn lại toàn bộ phí vào số dư. Đơn hàng hoàn thành một phần sẽ được hoàn tiền theo phần số lượng chưa được xử lý.",
      },
      {
        title: "6. An toàn tài khoản",
        body: "Tài khoản liên quan đến lạm dụng, gian lận, tranh chấp thanh toán hoặc vi phạm chính sách có thể bị tạm ngưng. Tài khoản bị tạm ngưng không thể đặt đơn mới cho đến khi được xem xét.",
      },
    ],
  },
  en: {
    badge: "Legal & Compliance",
    title: "Terms of Service",
    updated: "Last updated: April 24, 2026. This page summarizes the operating rules for using 3Flames.",
    support: "For support or account review requests, contact support@3flames.com.",
    sections: [
      {
        title: "1. Acceptance of Terms",
        body: "By creating an account or placing an order on 3Flames, you agree to follow these Terms of Service and all applicable platform rules.",
      },
      {
        title: "2. Service Usage",
        body: "3Flames provides social media marketing services for legitimate promotional use. You are responsible for ensuring that your links, campaigns, and content comply with each platform's policies.",
      },
      {
        title: "3. Payments and Balance",
        body: "Deposits are credited to your account balance after verification. All balance changes are recorded in the transaction ledger for transparency.",
      },
      {
        title: "4. Order Processing",
        body: "Orders are processed automatically through the 3Flames fulfillment system. Delivery speed, refill eligibility, and cancellation support may vary by service.",
      },
      {
        title: "5. Refunds",
        body: "Canceled orders receive a full balance refund. Partial orders receive a proportional refund based on the undelivered quantity.",
      },
      {
        title: "6. Account Safety",
        body: "Accounts involved in abuse, fraud, chargebacks, or policy violations may be suspended. Suspended accounts cannot place new orders until reviewed.",
      },
    ],
  },
};

export default function TermsPage() {
  const language = usePreferencesStore((state) => state.language);
  const copy = content[language];

  return (
    <main className="min-h-screen bg-surface-900 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.14),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(239,68,68,0.08),transparent_30%)]" />
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Flame className="h-7 w-7 text-brand-500" />
            <span className="text-xl font-bold">3<span className="text-brand-500">Flames</span></span>
          </Link>
          <PublicHeaderActions />
        </div>

        <section className="rounded-2xl border border-surface-500 bg-surface-800/80 p-6 shadow-2xl shadow-black/30 sm:p-10">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-sm text-brand-300">
            <ShieldCheck className="h-4 w-4" /> {copy.badge}
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 text-zinc-400">{copy.updated}</p>

          <div className="mt-10 space-y-6">
            {copy.sections.map((section) => (
              <div key={section.title} className="rounded-xl border border-surface-500 bg-surface-900/60 p-5">
                <h2 className="text-lg font-semibold text-zinc-100">{section.title}</h2>
                <p className="mt-2 leading-relaxed text-zinc-400">{section.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-sm text-zinc-500">{copy.support}</p>
        </section>
      </div>
    </main>
  );
}
