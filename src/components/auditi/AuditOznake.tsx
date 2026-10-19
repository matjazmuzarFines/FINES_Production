"use client";

import { Check } from "lucide-react";
import { oddelekPoKodi } from "@/lib/auditSifranti";
import { VRSTA, pomenAkcije, type AuditAkcija, type Prioriteta, type Vrsta } from "@/lib/auditi";
import type { IsoDate } from "@/lib/dates";
import { AkcijaZnacka } from "@/components/produktivnost/Akcije";
import { useSifranti } from "./Sifranti";

/** Pika in ime oddelka. */
export function OddelekOznaka({ koda }: { koda: string | null }) {
  const { s } = useSifranti();
  const o = oddelekPoKodi(s, koda);
  if (!o) return <span className="text-ink-400">{koda || "-"}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={o.opis}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.barva }} />
      {o.naziv}
    </span>
  );
}

/** Pika in kratko ime vrste ugotovitve. */
export function VrstaOznaka({ vrsta }: { vrsta: Vrsta }) {
  const v = VRSTA[vrsta];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={v.hint}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: v.barva }} />
      {v.kratko}
    </span>
  );
}

const PRIO_CLS: Record<Prioriteta, string> = {
  A: "bg-nok-500 text-white",
  B: "bg-warn-400 text-ink-900",
  C: "bg-ink-200 text-ink-700",
};

/** Okrogla značka prioritete A / B / C. */
export function PrioritetaZnacka({ p }: { p: Prioriteta | null }) {
  if (!p) return <span className="text-ink-400">-</span>;
  return (
    <span
      title={p === "A" ? "Prioriteta A - nujno" : p === "B" ? "Prioriteta B - kmalu" : "Prioriteta C - ko bo mogoče"}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${PRIO_CLS[p]}`}
    >
      {p}
    </span>
  );
}

/** Pomen = velikost napake × pomembnost (1-25). */
export function PomenZnacka({ a }: { a: Pick<AuditAkcija, "resnost" | "pomembnost"> }) {
  const p = pomenAkcije(a);
  if (p === null) return <span className="text-ink-400">-</span>;
  const cls = p >= 15 ? "bg-fines-600 text-white" : p >= 8 ? "bg-fines-100 text-fines-700" : "bg-ink-100 text-ink-700";
  return (
    <span
      title={`Pomen ${p} / 25 = velikost napake ${a.resnost ?? "?"} × pomembnost ${a.pomembnost ?? "?"}`}
      className={`inline-flex min-w-7 justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${cls}`}
    >
      {p}
    </span>
  );
}

/** Status akcije; dobra praksa ni akcija in ima svojo značko. */
export function StatusAkcije({ a, danes }: { a: AuditAkcija; danes: IsoDate }) {
  if (a.vrsta === "DOBRA_PRAKSA") {
    return (
      <span title={VRSTA.DOBRA_PRAKSA.hint} className="whitespace-nowrap rounded-full bg-ok-500 px-2.5 py-0.5 text-xs font-bold text-white">
        Dobra praksa
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <AkcijaZnacka a={a} danes={danes} />
      {a.reseno_na_mestu && (
        <span title="Rešeno na mestu med auditom" className="whitespace-nowrap rounded-full border border-ok-500 px-2 py-0.5 text-[11px] font-bold text-ok-600">
          na mestu
        </span>
      )}
    </span>
  );
}

export type Moznost<V extends string> = { value: V; label: string; hint: string; barva?: string; opis?: string };

/**
 * Velik izbirnik za telefon (gumbi 44 px v mreži): izbran oranžen poln, ali z barvno obrobo,
 * če ima možnost svojo barvo (npr. vrsta ugotovitve). Neizbran bel z obrobo, hover siv.
 */
export function Izbirnik<V extends string>({
  label,
  value,
  moznosti,
  onChange,
  stolpci = "grid-cols-2 sm:grid-cols-3",
}: {
  label: string;
  value: V | null;
  moznosti: Moznost<V>[];
  onChange: (v: V) => void;
  stolpci?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`grid gap-2 ${stolpci}`}>
      {moznosti.map((m) => {
        const izbran = m.value === value;
        const barvna = !!m.barva;
        return (
          <button
            key={m.value}
            type="button"
            title={m.hint}
            aria-pressed={izbran}
            onClick={() => onChange(m.value)}
            className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm font-semibold transition-colors ${
              izbran
                ? barvna
                  ? "border-2 bg-white text-ink-900"
                  : "border-fines-500 bg-fines-500 text-white"
                : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
            }`}
            style={izbran && barvna ? { borderColor: m.barva, background: `${m.barva}14` } : undefined}
          >
            {barvna && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.barva }} />}
            <span className="min-w-0 flex-1 leading-tight">
              {m.label}
              {m.opis && <span className={`block text-[11px] font-normal ${izbran && !barvna ? "text-white/80" : "text-ink-500"}`}>{m.opis}</span>}
            </span>
            {izbran && <Check className="h-4 w-4 shrink-0" style={barvna ? { color: m.barva } : undefined} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
