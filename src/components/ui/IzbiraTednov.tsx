"use client";

import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, formatMonth, formatShort, fromIso, isoWeek, mondayOf, monthEnd, monthStart, toIso, type IsoDate } from "@/lib/dates";
import { Button, IconButton } from "./Button";

const DNEVI = ["PON", "TOR", "SRE", "ČET", "PET"];

function Tocka({ naslov, teden, datum }: { naslov: string; teden: IsoDate | null; datum: IsoDate | null }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-ink-500">{naslov}</div>
      {teden && datum ? (
        <>
          <div className="text-xl font-bold leading-tight text-fines-600">T{isoWeek(teden)}</div>
          <div className="text-xs tabular-nums text-ink-600">{formatShort(datum)}</div>
        </>
      ) : (
        <div className="text-xl font-bold leading-tight text-ink-300">-</div>
      )}
    </div>
  );
}

/**
 * Koledarska izbira obdobja v tednih: 1. klik izbere prvi teden, 2. klik zadnjega. Vrstica je cel teden s številko tedna.
 * `od` in `do_` sta ponedeljka izbranih tednov. Pod koledarjem je povzetek izbranega obdobja.
 */
export function IzbiraTednov({ od, do_, onChange }: { od: IsoDate | null; do_: IsoDate | null; onChange: (od: IsoDate, do_: IsoDate) => void }) {
  const danes = toIso(new Date());
  const [mesec, setMesec] = useState(() => monthStart(od ?? danes));
  const [cakaKonec, setCakaKonec] = useState(false);

  const tedni: IsoDate[] = [];
  for (let t = mondayOf(monthStart(mesec)); t <= monthEnd(mesec); t = addDays(t, 7)) tedni.push(t);
  const taTeden = mondayOf(danes);
  const stTednov = od && do_ ? Math.round((fromIso(do_).getTime() - fromIso(od).getTime()) / (7 * 86400000)) + 1 : 0;

  function klik(t: IsoDate) {
    if (cakaKonec && od) {
      if (t < od) onChange(t, od);
      else onChange(od, t);
      setCakaKonec(false);
    } else {
      onChange(t, t);
      setCakaKonec(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-ink-200 p-2 sm:p-3">
        <div className="mb-2 flex items-center gap-2">
          <IconButton hint="Prikaži prejšnji mesec" variant="neutral" icon={ChevronLeft} onClick={() => setMesec(addMonths(mesec, -1))} />
          <h3 className="flex-1 text-center text-base font-bold text-ink-800" suppressHydrationWarning>
            {formatMonth(mesec)}
          </h3>
          <IconButton hint="Prikaži naslednji mesec" variant="neutral" icon={ChevronRight} onClick={() => setMesec(addMonths(mesec, 1))} />
          <Button hint="Prikaži trenutni mesec" variant="neutral" disabled={monthStart(danes) === mesec} onClick={() => setMesec(monthStart(danes))}>
            Danes
          </Button>
        </div>

        <div className="grid grid-cols-[3rem_repeat(5,1fr)] px-1 text-center text-[11px] font-bold text-ink-500">
          <span>TEDEN</span>
          {DNEVI.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 flex flex-col gap-1">
          {tedni.map((t) => {
            const rob = t === od || t === do_;
            const vmes = od && do_ && t > od && t < do_;
            return (
              <button
                key={t}
                type="button"
                onClick={() => klik(t)}
                title={`Izberi ${isoWeek(t)}. teden kot ${cakaKonec ? "zadnji" : "prvi"} teden`}
                aria-pressed={rob || !!vmes}
                className={`grid h-10 grid-cols-[3rem_repeat(5,1fr)] items-center rounded-lg border px-1 text-center text-sm tabular-nums transition-colors ${
                  rob ? "border-fines-500 bg-fines-500 text-white" : vmes ? "border-fines-200 bg-fines-100 text-ink-900" : t === taTeden ? "border-sync-500 bg-white text-ink-800 hover:bg-fines-50" : "border-transparent bg-white text-ink-800 hover:bg-fines-50"
                }`}
              >
                <span className="font-bold">T{isoWeek(t)}</span>
                {DNEVI.map((d, i) => {
                  const dan = addDays(t, i);
                  return (
                    <span key={d} className={dan.slice(0, 7) === mesec.slice(0, 7) ? "" : "opacity-40"}>
                      {fromIso(dan).getDate()}
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-fines-200 bg-fines-50 px-3 py-2">
        <Tocka naslov="Od" teden={od} datum={od} />
        <ArrowRight className="h-5 w-5 shrink-0 text-fines-500" aria-hidden />
        <Tocka naslov="Do" teden={do_} datum={do_ ? addDays(do_, 6) : null} />
        <span className="ml-auto whitespace-nowrap rounded-full bg-fines-500 px-3 py-1 text-xs font-bold text-white">
          {stTednov === 0 ? "Izberi tedne" : stTednov === 1 ? "1 teden" : stTednov === 2 ? "2 tedna" : stTednov <= 4 ? `${stTednov} tedni` : `${stTednov} tednov`}
        </span>
      </div>
    </div>
  );
}
