"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  calendarWorkdays,
  formatMonth,
  formatShort,
  monthStart,
  toIso,
  type IsoDate,
} from "@/lib/dates";
import type { DanPovzetek, DanStatus } from "@/lib/rutina";
import { Button, IconButton } from "@/components/ui/Button";

const DNEVI = ["PON", "TOR", "SRE", "ČET", "PET"];

export const STATUS_STYLE: Record<DanStatus, { cls: string; label: string }> = {
  OK: { cls: "bg-ok-500 text-white border-ok-500", label: "Izpolnjeno, brez odstopanj" },
  NOK: { cls: "bg-nok-500 text-white border-nok-500", label: "Izpolnjeno, z odstopanji" },
  NEIZPOLNJENO: { cls: "bg-warn-50 text-warn-700 border-warn-400", label: "Neizpolnjeno" },
  PRIHODNJE: { cls: "bg-white text-ink-500 border-ink-200", label: "Prihodnji dan" },
  PRAZNO: { cls: "bg-ink-100 text-ink-400 border-ink-200", label: "Ni aktivnih postavk" },
};

const DANES_CLS = "bg-sync-500 text-white border-sync-600";

/** Majhna pika s statusom (prikazana na današnjem - modrem - dnevu). */
const STATUS_PIKA: Record<DanStatus, string> = {
  OK: "bg-ok-500",
  NOK: "bg-nok-500",
  NEIZPOLNJENO: "bg-warn-400",
  PRIHODNJE: "bg-white",
  PRAZNO: "bg-ink-300",
};

export function MonthCalendar({
  mesec,
  povzetki,
  hrefZaDan,
  onMonthChange,
  nalagam,
}: {
  mesec: IsoDate;
  povzetki: DanPovzetek[];
  hrefZaDan: (d: IsoDate) => string;
  onMonthChange: (m: IsoDate) => void;
  nalagam?: boolean;
}) {
  // Pravi današnji datum (tudi če je vikend - takrat ni obarvan noben dan).
  const danes = toIso(new Date());
  const dnevi = calendarWorkdays(mesec);
  const poDnevu = new Map(povzetki.map((p) => [p.datum, p]));
  const ms = monthStart(mesec);
  const jeTaMesec = monthStart(danes) === ms;

  return (
    <div className="fp-card p-3 sm:p-5">
      {/* Navigacija koledarja */}
      <div className="mb-4 flex items-center gap-2">
        <IconButton hint="Prikaži prejšnji mesec" variant="neutral" icon={ChevronLeft} onClick={() => onMonthChange(addMonths(mesec, -1))} />
        <h2 className="flex-1 text-center text-lg font-bold text-ink-800 sm:text-xl" suppressHydrationWarning>
          {formatMonth(mesec)}
        </h2>
        <IconButton hint="Prikaži naslednji mesec" variant="neutral" icon={ChevronRight} onClick={() => onMonthChange(addMonths(mesec, 1))} />
        <Button
          hint="Prikaži trenutni mesec"
          variant="neutral"
          disabled={jeTaMesec}
          onClick={() => onMonthChange(monthStart(danes))}
        >
          Danes
        </Button>
      </div>

      <div className={`grid grid-cols-5 gap-1.5 sm:gap-2 ${nalagam ? "opacity-50" : ""}`}>
        {DNEVI.map((d) => (
          <div key={d} className="text-center text-xs font-bold text-ink-500">
            {d}
          </div>
        ))}
        {dnevi.map((d) => {
          if (d.slice(0, 7) !== ms.slice(0, 7)) return <div key={d} />;
          const p = poDnevu.get(d);
          const status = p?.status ?? "PRAZNO";
          const jeDanes = d === danes;
          const st = STATUS_STYLE[status];
          return (
            <Link
              key={d}
              href={hrefZaDan(d)}
              title={`Odpri rutino za ${formatShort(d)}${jeDanes ? " (danes)" : ""} - ${st.label}${
                p && p.aktivnih ? ` (${p.izpolnjenih}/${p.aktivnih})` : ""
              }`}
              className={`relative flex h-14 flex-col items-center justify-center rounded-lg border-2 text-base font-bold transition-transform hover:scale-105 hover:shadow-md sm:h-20 sm:text-lg ${
                jeDanes ? DANES_CLS : st.cls
              }`}
            >
              {Number(d.slice(8))}
              {p && p.aktivnih > 0 && (
                <span className="text-[10px] font-semibold opacity-90 sm:text-xs">
                  {p.izpolnjenih}/{p.aktivnih}
                </span>
              )}
              {jeDanes && (
                <span
                  className={`absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-white ${STATUS_PIKA[status]}`}
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded border-2 ${DANES_CLS}`} />
          Danes
        </span>
        {(["OK", "NOK", "NEIZPOLNJENO", "PRIHODNJE"] as DanStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded border-2 ${STATUS_STYLE[s].cls}`} />
            {STATUS_STYLE[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}
