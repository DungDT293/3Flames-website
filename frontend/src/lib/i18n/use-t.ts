"use client";

import { translations, type TranslationKey } from "./translations";
import { usePreferencesStore } from "@/lib/stores/preferences-store";

export function useT() {
  const language = usePreferencesStore((state) => state.language);

  return (key: TranslationKey): string => {
    const [group, item] = key.split(".") as [keyof typeof translations.vi, string];
    const dictionary = translations[language] as Record<string, Record<string, string>>;
    return dictionary[group]?.[item] ?? key;
  };
}
