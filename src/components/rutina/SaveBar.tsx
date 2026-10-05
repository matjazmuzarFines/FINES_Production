"use client";

import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Spodnja lepljiva vrstica s številom sprememb in gumbom Shrani. */
export function SaveBar({
  steviloSprememb,
  shranjujem,
  onSave,
  onReset,
  shraniLabel = "Shrani rutino",
  shraniHint = "Shrani rutino za izbrani dan",
}: {
  steviloSprememb: number;
  shranjujem: boolean;
  onSave: () => void;
  onReset: () => void;
  shraniLabel?: string;
  shraniHint?: string;
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-3 mt-4 border-t border-ink-200 bg-white/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm text-ink-600">
          {steviloSprememb > 0 ? (
            <strong className="text-warn-700">Neshranjene spremembe: {steviloSprememb}</strong>
          ) : (
            "Ni neshranjenih sprememb"
          )}
        </span>
        <Button
          hint="Zavrzi neshranjene spremembe"
          variant="neutral"
          icon={RotateCcw}
          disabled={steviloSprememb === 0 || shranjujem}
          onClick={onReset}
        >
          <span className="hidden sm:inline">Prekliči</span>
        </Button>
        <Button
          hint={shraniHint}
          variant="success"
          size="lg"
          icon={Save}
          disabled={steviloSprememb === 0 || shranjujem}
          onClick={onSave}
        >
          {shranjujem ? "Shranjujem ..." : shraniLabel}
        </Button>
      </div>
    </div>
  );
}
