"use client";

import { useEffect, useState } from "react";
import { usePreferencesStore } from "@/lib/stores/preferences-store";

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { theme, language } = usePreferencesStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.lang = language;
  }, [theme, language]);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.lang = language;
  }, [mounted, theme, language]);

  return <>{children}</>;
}
