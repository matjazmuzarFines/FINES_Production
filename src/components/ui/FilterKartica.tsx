"use client";

import { CheckCircle2, Circle } from "lucide-react";

/** Barve kartice (polni razredi zaradi Tailwinda). */
export type KarticaBarva = {
  /** Barvni trak na levi, npr. "bg-nok-500". */
  trak: string;
  /** Obroba + ozadje, ko je kartica vklopljena, npr. "border-nok-500 bg-nok-50". */
  aktivna: string;
  /** Barva kljukice, npr. "text-nok-500". */
  ikona: string;
};

/**
 * Standardna kartica-filter (vklop/izklop s klikom).
 * Izklopljena: belo ozadje, siv tekst, bled trak, prazen krožec.
 * Hover: sivo ozadje in temnejša obroba.
 * Vklopljena: obroba in svetlo ozadje v barvi kartice, kljukica v desnem zgornjem kotu.
 */
export function FilterKartica({
  aktivna,
  onClick,
  hint,
  barva,
  naslov,
  podnaslov,
}: {
  aktivna: boolean;
  onClick: () => void;
  hint: string;
  barva: KarticaBarva;
  naslov: string;
  podnaslov?: string;
}) {
  const Ikona = aktivna ? CheckCircle2 : Circle;
  return (
    <button
      type="button"
      aria-pressed={aktivna}
      title={hint}
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-xl border-2 p-3 pr-8 text-left shadow-sm transition-colors ${
        aktivna ? `${barva.aktivna} hover:brightness-95` : "border-ink-200 bg-white hover:border-ink-400 hover:bg-ink-100"
      }`}
    >
      <Ikona className={`absolute right-2 top-2 h-5 w-5 ${aktivna ? barva.ikona : "text-ink-300"}`} aria-hidden />
      <span className={`h-10 w-2 shrink-0 rounded-full ${barva.trak} ${aktivna ? "" : "opacity-30"}`} />
      <span className="min-w-0">
        <span className={`block text-sm font-bold ${aktivna ? "text-ink-900" : "text-ink-500"}`}>{naslov}</span>
        {podnaslov && (
          <span className={`block text-xs tabular-nums ${aktivna ? "text-ink-700" : "text-ink-400"}`}>{podnaslov}</span>
        )}
      </span>
    </button>
  );
}
