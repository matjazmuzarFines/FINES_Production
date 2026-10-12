"use client";

// Skupni gradniki pregleda zasedenosti po tednih (Zasedenost, Prioritete > Zasedenost naročil).

import type { IsoDate } from "@/lib/dates";
import { formatUre } from "@/lib/stevila";
import type { ZasOddelek } from "@/lib/zasedenost";

/** Barva obremenitve: do 85 % zelena, do 100 % rumena, nad 100 % rdeča. */
export function obremenitev(potrebno: number, naVoljo: number) {
  const pct = naVoljo > 0 ? (potrebno / naVoljo) * 100 : potrebno > 0 ? Infinity : 0;
  const cls = pct > 100 ? "bg-nok-500" : pct > 85 ? "bg-warn-400" : "bg-ok-500";
  const txt = pct > 100 ? "text-nok-600" : pct > 85 ? "text-warn-700" : "text-ok-600";
  return { pct, cls, txt };
}

export function TedenGlava({
  naslov,
  podnaslov,
  stevilo,
  izbran,
  trenutni,
  rdeca,
  onClick,
}: {
  naslov: string;
  podnaslov: string;
  /** Npr. "12 nalogov" */
  stevilo: string;
  izbran: boolean;
  trenutni?: boolean;
  rdeca?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={`Prikaži: ${naslov} (${podnaslov})`}
      onClick={onClick}
      className={`w-full rounded-lg border-2 px-2 py-1.5 text-center transition-colors ${
        izbran
          ? "border-fines-500 bg-fines-500 text-white"
          : trenutni
            ? "border-sync-500 bg-white text-sync-600 hover:bg-ink-50"
            : "border-ink-200 bg-white text-ink-800 hover:border-fines-500"
      }`}
    >
      <div className={`text-sm font-bold ${rdeca && !izbran ? "text-nok-600" : ""}`}>{naslov}</div>
      <div className="text-[11px] font-normal opacity-80">{podnaslov}</div>
      <div className="text-[11px] font-semibold opacity-90">{stevilo}</div>
    </button>
  );
}

/** Potrebno / razpoložljivo, pas obremenitve, % in razlika v urah. */
export function ObremenitevVsebina({ potrebno, naVoljo }: { potrebno: number; naVoljo: number }) {
  const ob = obremenitev(potrebno, naVoljo);
  return (
    <>
      <div
        className="mt-1.5 text-xs tabular-nums text-ink-700"
        title={`Potrebno ${formatUre(potrebno)} h od razpoložljivih ${formatUre(naVoljo)} h`}
      >
        <strong>{formatUre(potrebno)}</strong> / {formatUre(naVoljo)} h
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full ${ob.cls}`} style={{ width: `${Math.min(100, ob.pct)}%` }} />
      </div>
      <div className={`mt-0.5 text-right text-xs font-bold tabular-nums ${ob.txt}`}>
        {Number.isFinite(ob.pct) ? `${Math.round(ob.pct)} %` : "∞"}
        <span className="ml-1 font-normal text-ink-500">
          ({naVoljo - potrebno >= 0 ? "+" : ""}
          {formatUre(naVoljo - potrebno)} h)
        </span>
      </div>
    </>
  );
}

/** Celica "Zapadlo / Prej" - samo potrebne ure. */
export function ZapadloCelica({ ure, rdeca }: { ure: number; rdeca: boolean }) {
  return (
    <td className="rounded-lg bg-ink-50 p-2 text-center align-middle">
      <div className={`text-base font-bold tabular-nums ${ure > 0 && rdeca ? "text-nok-600" : "text-ink-700"}`}>{formatUre(ure)} h</div>
      <div className="text-[11px] text-ink-500">potrebno</div>
    </td>
  );
}

export function SkupajVrstica({
  oddelki,
  tedni,
  potrebno,
  kapaciteta,
}: {
  oddelki: ZasOddelek[];
  tedni: IsoDate[];
  /** Ključ `${koda}|${teden}` oz. `${koda}|zapadlo` */
  potrebno: Map<string, number>;
  kapaciteta: (o: ZasOddelek, t: IsoDate) => { ure: number };
}) {
  const zap = oddelki.reduce((s, o) => s + (potrebno.get(`${o.koda}|zapadlo`) ?? 0), 0);
  return (
    <tr>
      <th className="pr-2 text-right text-sm font-bold text-ink-900">Skupaj</th>
      <td className="rounded-lg bg-ink-800 p-2 text-center text-sm font-bold tabular-nums text-white">{formatUre(zap)} h</td>
      {tedni.map((t) => {
        const pot = oddelki.reduce((s, o) => s + (potrebno.get(`${o.koda}|${t}`) ?? 0), 0);
        const kap = oddelki.reduce((s, o) => s + kapaciteta(o, t).ure, 0);
        const ob = obremenitev(pot, kap);
        return (
          <td key={t} className="rounded-lg bg-ink-800 p-2 text-center text-xs tabular-nums text-white">
            <strong>{formatUre(pot)}</strong> / {formatUre(kap)} h
            <div className={`font-bold ${ob.pct > 100 ? "text-nok-500" : ob.pct > 85 ? "text-warn-400" : "text-ok-500"}`}>
              {Number.isFinite(ob.pct) ? `${Math.round(ob.pct)} %` : "∞"}
            </div>
            <div className="text-[11px] font-normal text-ink-200">
              {kap - pot >= 0 ? "+" : ""}
              {formatUre(kap - pot)} h
            </div>
          </td>
        );
      })}
    </tr>
  );
}

export function LegendaObremenitve() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
      <Legenda cls="bg-ok-500" label="do 85 %" />
      <Legenda cls="bg-warn-400" label="85–100 %" />
      <Legenda cls="bg-nok-500" label="nad 100 % (preobremenjeno)" />
      <span>Razpoložljivo = zaposleni × ure na dan × delovni dnevi</span>
    </div>
  );
}

function Legenda({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}
