"use client";

import type { LucideIcon } from "lucide-react";

export type Zavihek<K extends string> = { koda: K; label: string; hint: string; icon?: LucideIcon };

/**
 * Standardni zavihki (pogledi strani). Stojijo nad elementom, ki ga preklapljajo:
 * izbran zavihek je bel z oranžno črto zgoraj in se zlije s kartico pod njim (rounded-tl-none).
 */
export function Zavihki<K extends string>({
  zavihki,
  value,
  onChange,
  label,
}: {
  zavihki: Zavihek<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mb-px flex gap-1 overflow-x-auto">
      {zavihki.map((z) => {
        const izbran = z.koda === value;
        return (
          <button
            key={z.koda}
            type="button"
            role="tab"
            aria-selected={izbran}
            title={z.hint}
            onClick={() => onChange(z.koda)}
            className={`flex shrink-0 items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2.5 text-sm font-semibold transition-colors ${
              izbran
                ? "relative z-10 border-ink-200 border-t-fines-500 bg-white text-fines-600 shadow-[inset_0_3px_0_var(--color-fines-500)]"
                : "border-transparent bg-ink-200 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            }`}
          >
            {z.icon && <z.icon className="h-4 w-4" aria-hidden />}
            {z.label}
          </button>
        );
      })}
    </div>
  );
}
