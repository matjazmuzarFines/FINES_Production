"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

/** Višina glave aplikacije (h-16 + 4 px oranžna črta) - pod njo se prilepi glava tabele. */
const GLAVA_APLIKACIJE = "68px";

/**
 * Standardni okvir tabele. Glava tabele (<thead className="fp-thead">) se pri drsenju strani
 * prilepi pod glavo aplikacije. Če je tabela širša od zaslona (telefon, tablica), tabela dobi
 * lastni drsnik (vodoravno in navpično) in glava se prilepi na vrh okvirja.
 */
export function TabelaOkvir({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [preozko, setPreozko] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const preveri = () => {
      const tabela = el.querySelector("table");
      setPreozko(!!tabela && tabela.offsetWidth > el.clientWidth + 1);
    };
    const ro = new ResizeObserver(preveri);
    ro.observe(el);
    const tabela = el.querySelector("table");
    if (tabela) ro.observe(tabela);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${preozko ? "max-h-[calc(100dvh-6rem)] overflow-auto" : ""} ${className}`}
      style={{ "--fp-thead-top": preozko ? "0px" : GLAVA_APLIKACIJE } as CSSProperties}
    >
      {children}
    </div>
  );
}

// =====================================================================
// RAZVRŠČANJE
// =====================================================================

export type Smer = "asc" | "desc";
type Vrednost = string | number | null | undefined;

export type Razvrscanje<T, K extends string> = {
  kljuc: K | null;
  smer: Smer;
  klik: (k: K) => void;
  /** Razvrsti seznam po izbranem stolpcu (brez izbire vrne nespremenjen vrstni red). */
  razvrsti: (vrstice: T[]) => T[];
};

const prazno = (v: Vrednost) => v === null || v === undefined || v === "";
const primerjaj = (a: Vrednost, b: Vrednost) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "sl", { numeric: true, sensitivity: "base" });
};

/**
 * Razvrščanje tabele s klikom na glavo: 1. klik naraščajoče, 2. klik padajoče, 3. klik privzeti vrstni red.
 * Prazne vrednosti so vedno na koncu.
 */
export function useRazvrscanje<T, K extends string>(vrednosti: Record<K, (r: T) => Vrednost>): Razvrscanje<T, K> {
  const [stanje, setStanje] = useState<{ kljuc: K; smer: Smer } | null>(null);
  return {
    kljuc: stanje?.kljuc ?? null,
    smer: stanje?.smer ?? "asc",
    klik: (k) =>
      setStanje((s) => (!s || s.kljuc !== k ? { kljuc: k, smer: "asc" } : s.smer === "asc" ? { kljuc: k, smer: "desc" } : null)),
    razvrsti: (vrstice) => {
      if (!stanje) return vrstice;
      const f = vrednosti[stanje.kljuc];
      const m = stanje.smer === "asc" ? 1 : -1;
      return vrstice
        .map((r, i) => ({ r, i, v: f(r) }))
        .sort((a, b) => {
          if (prazno(a.v) || prazno(b.v)) return prazno(a.v) === prazno(b.v) ? a.i - b.i : prazno(a.v) ? 1 : -1; // prazne vedno na koncu
          return m * primerjaj(a.v, b.v) || a.i - b.i;
        })
        .map((x) => x.r);
    },
  };
}

/** Celica glave, ki na klik razvrsti tabelo po stolpcu. */
export function SortTh<T, K extends string>({
  sort,
  kljuc,
  children,
  desno,
  className = "",
  hint,
}: {
  sort: Razvrscanje<T, K>;
  kljuc: K;
  children: ReactNode;
  desno?: boolean;
  className?: string;
  /** Hover tekst; privzeto "Razvrsti po stolpcu". */
  hint?: string;
}) {
  const aktiven = sort.kljuc === kljuc;
  const Ikona = !aktiven ? ChevronsUpDown : sort.smer === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-2 py-2 ${desno ? "text-right" : ""} ${className}`}
      aria-sort={aktiven ? (sort.smer === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        title={hint ?? "Razvrsti po stolpcu (naraščajoče / padajoče)"}
        onClick={() => sort.klik(kljuc)}
        className={`group inline-flex items-center gap-1 uppercase tracking-wide hover:text-white ${
          desno ? "flex-row-reverse" : ""
        } ${aktiven ? "text-fines-200" : ""}`}
      >
        <span>{children}</span>
        <Ikona className={`h-3.5 w-3.5 shrink-0 ${aktiven ? "" : "opacity-30 group-hover:opacity-80"}`} aria-hidden />
      </button>
    </th>
  );
}
