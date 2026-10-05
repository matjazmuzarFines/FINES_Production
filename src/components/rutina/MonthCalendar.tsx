"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  calendarWorkdays,
  formatMonth,
  formatShort,
  monthStart,
  todayWorkday,
  type IsoDate,
} from "@/lib/dates";
import type { DanPovzetek, DanStatus } from "@/lib/rutina";
import { IconButton } from "@/components/ui/Button";

const DNEVI = ["PON", "TOR", "SRE", "ČET", "PET"];

export const STATUS_STYLE: Record<DanStatus, { cls: string; label: string }> = {
  OK: { cls: "bg-ok-500 text-white border-ok-500", label: "Izpolnjeno, brez odstopanj" },
  NOK: { cls: "bg-nok-500 text-white border-nok-500", label: "Izpolnjeno, z odstopanji" },
  NEIZPOLNJENO: { cls: "bg-warn-50 text-warn-700 border-warn-400", label: "Neizpolnjeno" },
  PRIHODNJE: { cls: "bg-white text-ink-500 border-ink-200", label: "Prihodnji dan" },
  PRAZNO: { cls: "bg-ink-100 text-ink-400 border-ink-200", label: "Ni aktivnih postavk" },
};

export function MonthCalendar({
  mesec,
  izbran,
  povzetki,
  onSelect,
  onMonthChange,
}: {
  mesec: IsoDate;
  izbran: IsoDate;
  povzetki: DanPovzetek[];
  onSelect: (d: IsoDate) => void;
  onMonthChange: (m: IsoDate) => void;
}) {
  const danes = todayWorkday();
  const dnevi = calendarWorkdays(mesec);
  const poDnevu = new Map(povzetki.map((p) => [p.datum, p]));
  const ms = monthStart(mesec);

  return (
    <div className="fp-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <IconButton hint="Prejšnji mesec" icon={ChevronLeft} onClick={() => onMonthChange(addMonths(mesec, -1))} />
        <h2 className="text-lg font-bold text-ink-800">{formatMonth(mesec)}</h2>
        <IconButton hint="Naslednji mesec" icon={ChevronRight} onClick={() => onMonthChange(addMonths(mesec, 1))} />
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {DNEVI.map((d) => (
          <div key={d} className="text-center text-xs font-bold text-ink-500">
            {d}
          </div>
        ))}
        {dnevi.map((d) => {
          const vMesecu = d.slice(0, 7) === ms.slice(0, 7);
          if (!vMesecu) return <div key={d} />;
          const p = poDnevu.get(d);
          const st = STATUS_STYLE[p?.status ?? "PRAZNO"];
          const jeIzbran = d === izbran;
          return (
            <button
              key={d}
              type="button"
              title={`${formatShort(d)} - ${st.label}${p && p.aktivnih ? ` (${p.izpolnjenih}/${p.aktivnih})` : ""}`}
              onClick={() => onSelect(d)}
              className={`flex h-12 flex-col items-center justify-center rounded-lg border-2 text-sm font-bold transition-transform hover:scale-105 sm:h-14 ${st.cls} ${
                jeIzbran ? "ring-4 ring-fines-500 ring-offset-1" : ""
              } ${d === danes ? "underline decoration-2 underline-offset-4" : ""}`}
            >
              {Number(d.slice(8))}
              {p && p.aktivnih > 0 && (
                <span className="text-[10px] font-semibold opacity-80">
                  {p.izpolnjenih}/{p.aktivnih}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
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
