"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { useT } from "@/lib/i18n/use-t";

interface PreferencesControlsProps {
  compact?: boolean;
  className?: string;
}

export function PreferencesControls({ compact = false, className }: PreferencesControlsProps) {
  const { theme, language, currency, toggleTheme, setLanguage, setCurrency } =
    usePreferencesStore();
  const t = useT();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-app-border bg-app-card px-3 text-sm text-app-muted transition-colors hover:text-app-fg"
        aria-label={t("common.theme")}
      >
        {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        {!compact && <span>{theme === "dark" ? t("common.dark") : t("common.light")}</span>}
      </button>

      <button
        type="button"
        onClick={() => setLanguage(language === "vi" ? "en" : "vi")}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-app-border bg-app-card px-3 text-sm text-app-muted transition-colors hover:text-app-fg"
        aria-label={t("common.language")}
      >
        <Languages className="h-4 w-4" />
        <span>{language === "vi" ? "VI" : "EN"}</span>
      </button>

      <button
        type="button"
        onClick={() => setCurrency(currency === "VND" ? "USD" : "VND")}
        className="inline-flex h-9 items-center rounded-full border border-app-border bg-app-card px-3 text-sm font-semibold text-app-muted transition-colors hover:text-app-fg"
        aria-label={t("common.currency")}
      >
        {currency}
      </button>
    </div>
  );
}
