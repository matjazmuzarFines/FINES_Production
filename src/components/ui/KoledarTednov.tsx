"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { formatDayMonth, isoWeek, isoWeekYear, mesecTedna, tedniLeta, type IsoDate } from "@/lib/dates";

const MESECI = ["Januar", "Februar", "Marec", "April", "Maj", "Junij", "Julij", "Avgust", "September", "Oktober", "November", "December"];
export const TA_TEDEN_CLS = "bg-sync-500 text-white border-sync-600";

export type CelicaTedna = {
  /** Barva stanja (ozadje, besedilo, obroba). */
  cls: string;
  title: string;
  /** Klik odpre stran (href) ali okno (onClick); brez obeh celica ni klikljiva. */
  href?: string;
  onClick?: () => void;
  /** Značke v kotih celice. */
  oznake?: ReactNode;
};

/**
 * Standardni koledar tednov po mesecih (Produktivnost, Izobraževanja). Stran poda stanje vsakega tedna (`celica`).
 * Telefon: razprt samo trenutni mesec, ostali se razprejo s klikom. Od sm naprej so vsi razprti.
 */
export function KoledarTednov({
  leto,
  taTeden,
  oznaciMesec,
  celica,
  legenda,
}: {
  leto: number;
  taTeden: IsoDate;
  /** Mesec iz povezave ("2026-10"): poudarjen in na telefonu razprt. */
  oznaciMesec?: string;
  celica: (pon: IsoDate) => CelicaTedna;
  /** Vrstice legende pod koledarjem. */
  legenda?: ReactNode;
}) {
  const tedni = tedniLeta(leto);
  const meseci = Array.from({ length: 12 }, (_, m) => ({ m, tedni: tedni.filter((t) => mesecTedna(t) === m) }));
  const [razprti, setRazprti] = useState<Set<number>>(() => {
    if (oznaciMesec?.startsWith(`${leto}-`) && oznaciMesec !== `${leto}-01`) return new Set([Number(oznaciMesec.slice(5, 7)) - 1]);
    return new Set([isoWeekYear(taTeden) === leto ? mesecTedna(taTeden) : 0]);
  });
  const preklopi = (m: number) =>
    setRazprti((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {meseci.map(({ m, tedni: tm }) => {
          const odprt = razprti.has(m);
          return (
            <div key={m} className={`rounded-lg p-1.5 ${oznaciMesec === `${leto}-${String(m + 1).padStart(2, "0")}` ? "bg-fines-50 ring-1 ring-fines-200" : ""}`}>
              <div className="mb-1 hidden text-xs font-bold uppercase tracking-wide text-ink-500 sm:block">{MESECI[m]}</div>
              {/* Telefon: glava meseca je gumb za razpiranje; zložen mesec pokaže stanje tednov kot pike. */}
              <button
                type="button"
                onClick={() => preklopi(m)}
                aria-expanded={odprt}
                title={`${odprt ? "Skrij" : "Prikaži"} tedne meseca ${MESECI[m].toLowerCase()}`}
                className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left sm:hidden ${
                  odprt ? "mb-1.5 border-fines-200 bg-fines-50" : "border-ink-200 bg-white hover:bg-ink-100"
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wide text-ink-700">{MESECI[m]}</span>
                {!odprt && (
                  <span className="flex gap-1" aria-hidden>
                    {tm.map((t) => (
                      <span key={t} className={`h-3 w-3 rounded-full border-2 ${t === taTeden ? TA_TEDEN_CLS : celica(t).cls}`} />
                    ))}
                  </span>
                )}
                <ChevronDown size={16} className={`ml-auto text-ink-500 transition-transform ${odprt ? "rotate-180" : ""}`} aria-hidden />
              </button>
              <div className={`grid-cols-5 gap-1.5 sm:grid ${odprt ? "grid" : "hidden"}`}>
                {tm.map((t) => {
                  const c = celica(t);
                  const cls = `relative flex h-14 flex-col items-center justify-center rounded-lg border-2 font-bold transition-transform ${t === taTeden ? TA_TEDEN_CLS : c.cls}`;
                  const vsebina = (
                    <>
                      <span className="text-sm leading-tight">T{isoWeek(t)}</span>
                      <span className="text-[10px] font-semibold leading-tight opacity-90">{formatDayMonth(t)}</span>
                      {c.oznake}
                    </>
                  );
                  if (c.href)
                    return (
                      <Link key={t} href={c.href} title={c.title} className={`${cls} hover:scale-105 hover:shadow-md`}>
                        {vsebina}
                      </Link>
                    );
                  return (
                    <button key={t} type="button" title={c.title} disabled={!c.onClick} onClick={c.onClick} className={`${cls} enabled:hover:scale-105 enabled:hover:shadow-md`}>
                      {vsebina}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {legenda}
    </div>
  );
}

/** Ena postavka legende koledarja. */
export function LegendaKoledarja({ cls, children }: { cls: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded border-2 ${cls}`} />
      {children}
    </span>
  );
}
