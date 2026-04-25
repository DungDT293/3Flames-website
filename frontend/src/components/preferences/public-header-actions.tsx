"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PreferencesControls } from "./preferences-controls";
import { useT } from "@/lib/i18n/use-t";

export function PublicHeaderActions() {
  const t = useT();

  return (
    <div className="flex items-center gap-2">
      <PreferencesControls compact />
      <Link href="/">
        <Button variant="outline" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.backHome")}
        </Button>
      </Link>
    </div>
  );
}
