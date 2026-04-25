import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AppPreferencesProvider } from "@/components/providers/app-preferences-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "3Flames - SMM Panel",
  description: "Premium Social Media Marketing Services",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <AppPreferencesProvider>{children}</AppPreferencesProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#1a1a1f",
              color: "#e4e4e7",
              border: "1px solid #2e2e3a",
            },
            success: {
              iconTheme: { primary: "#f97316", secondary: "#fff" },
            },
            error: {
              iconTheme: { primary: "#ef4444", secondary: "#fff" },
            },
          }}
        />
      </body>
    </html>
  );
}
