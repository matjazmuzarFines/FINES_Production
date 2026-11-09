"use client";

import { STOPNJE, opisStopnje } from "@/lib/usposobljenost";

const RAZMERJE = 265 / 400;

/** Glava Fineska z obrazom stopnje 1-5 (public/finesek/stopnja-N.png), številka je v kotu. */
export function FinesekStopnja({ stopnja, sirina = 88, title }: { stopnja: number; sirina?: number; title?: string }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: sirina, height: sirina * RAZMERJE }} title={title ?? `Stopnja ${stopnja}: ${opisStopnje(stopnja)}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/finesek/stopnja-${stopnja}.png`} alt={`Stopnja ${stopnja}`} width={sirina} height={sirina * RAZMERJE} draggable={false} className="block" />
      <span className="absolute -bottom-1 -right-1 flex h-[23px] w-[23px] items-center justify-center rounded-full bg-fines-500 text-[14px] font-bold leading-none text-white ring-2 ring-white">
        {stopnja}
      </span>
    </span>
  );
}

/** Prazen kvadratek = še ni ocene. */
export function PrazenKvadratek({ sirina = 88, title = "Še ni ocenjen" }: { sirina?: number; title?: string }) {
  return <span title={title} className="block shrink-0 rounded-lg border-2 border-ink-200 bg-white" style={{ width: sirina * RAZMERJE, height: sirina * RAZMERJE }} />;
}

/** Stopnja ali prazen kvadratek. */
export function CelicaStopnje({ stopnja, sirina, title }: { stopnja: number | null; sirina?: number; title?: string }) {
  return stopnja === null ? <PrazenKvadratek sirina={sirina} title={title} /> : <FinesekStopnja stopnja={stopnja} sirina={sirina} title={title} />;
}

/** Legenda stopenj: vsaka višja stopnja ima boljšo voljo, stopnja 5 še značko mentorja. */
export function LegendaStopenj() {
  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 p-2" title="Prazen kvadratek pomeni, da ocene še ni">
        <span className="flex w-[84px] shrink-0 justify-center">
          <PrazenKvadratek sirina={84} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-ink-900">Brez ocene</span>
          <span className="block text-xs text-ink-600">Še ni ocenjen</span>
        </span>
      </div>
      {STOPNJE.map((s) => (
        <div key={s.value} className="flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 p-2" title={`Stopnja ${s.value}: ${s.opis}`}>
          <FinesekStopnja stopnja={s.value} sirina={84} />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink-900">
              {s.value} · {s.naziv}
            </span>
            <span className="block text-xs text-ink-600">{s.opis}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
