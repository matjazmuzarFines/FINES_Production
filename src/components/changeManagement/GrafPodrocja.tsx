"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatDayMonth } from "@/lib/dates";
import {
  BARVA_RAVNO,
  barvaVodje,
  formatPct,
  tedenObdobje,
  type CmTocka,
  type CmVodja,
} from "@/lib/changeManagement";

export type SerijaVodje = { vodja: CmVodja; tocke: CmTocka[] };

const VISINA = 180;
const LEVO = 30;
const DESNO = 52; // prostor za oznako cilja
const ZGORAJ = 18;
const SPODAJ = 40;
const ODMIK_X = 18; // prostor med osjo y in prvo točko (da točka ne prekrije oznak)

const fmtVrednost = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 1 });

/**
 * Graf napredka področja: ena črta na vodjo (seštevek sprememb od začetka = 0 %).
 * Barva črte: osnovna barva vodje; odsek, ki raste = svetel, pada = temen in črtkan, brez spremembe = siv.
 * Ozadje sivo s prelivom; črtkano: cilj (npr. 40 %) in pričakovan tempo do cilja v načrtovanem obdobju.
 */
export function GrafPodrocja({
  serije,
  tednov,
  nacrtovanoTednov,
  cilj,
  zacetek,
  naziv,
}: {
  serije: SerijaVodje[];
  /** Dolžina osi x (vsaj načrtovano obdobje). */
  tednov: number;
  /** Načrtovano obdobje (do cilja), npr. 13 tednov. */
  nacrtovanoTednov: number;
  cilj: number;
  zacetek: string;
  naziv: string;
}) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [sirina, setSirina] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const izmeri = () => setSirina(el.clientWidth);
    const raf = requestAnimationFrame(izmeri); // začetna meritev
    const ro = new ResizeObserver(izmeri);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const vse = serije.flatMap((s) => s.tocke.map((t) => t.skupaj));
  const korakY = Math.max(cilj, ...vse) > 60 ? 20 : 10;
  const yMax = Math.max(korakY, Math.ceil(Math.max(cilj, ...vse) / korakY) * korakY);
  const yMin = Math.min(0, Math.floor(Math.min(0, ...vse) / 5) * 5);

  const notri = Math.max(1, sirina - LEVO - DESNO - ODMIK_X);
  const korakX = notri / tednov;
  const x = (n: number) => LEVO + ODMIK_X + n * korakX;
  const y = (v: number) => ZGORAJ + ((yMax - v) / (yMax - yMin)) * (VISINA - ZGORAJ - SPODAJ);
  const r = Math.max(4, Math.min(11, korakX * 0.32));
  const zNapisom = r >= 8;

  const mreza: number[] = [];
  for (let v = Math.ceil(yMin / korakY) * korakY; v <= yMax; v += korakY) mreza.push(v);
  const vsakiX = korakX < 22 ? 2 : 1;
  const zadnjiTeden = Math.max(0, ...serije.map((s) => s.tocke[s.tocke.length - 1].teden));

  /** Vodoravni zamik točk, kadar imata vodji v istem tednu enako vrednost (da se ne prekrijeta). */
  function zamik(si: number, t: CmTocka) {
    const enaki = serije
      .map((s, i) => ({ i, t: s.tocke.find((x) => x.teden === t.teden) }))
      .filter((o) => o.t?.ocena && o.t.skupaj === t.skupaj);
    if (enaki.length < 2) return 0;
    const k = enaki.findIndex((o) => o.i === si);
    return (k - (enaki.length - 1) / 2) * r * 1.2;
  }

  function premik(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const n = Math.round((clientX - el.getBoundingClientRect().left - LEVO - ODMIK_X) / korakX);
    setHover(Math.max(0, Math.min(Math.max(zadnjiTeden, 0), n)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={ref}
        className="relative w-full touch-pan-y select-none overflow-visible rounded-xl shadow-[0_2px_8px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.8)]"
        style={{ height: VISINA }}
        onPointerMove={(e) => premik(e.clientX)}
        onPointerDown={(e) => premik(e.clientX)}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${naziv}: ${serije.map((s) => `${s.vodja.naziv} ${formatPct(s.tocke[s.tocke.length - 1].skupaj)}`).join(", ")}; cilj ${cilj} %`}
      >
        {sirina > 0 && (
          <svg width={sirina} height={VISINA} className="block">
            <defs>
              <linearGradient id={`${id}-oz`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f7f7f8" />
                <stop offset="100%" stopColor="#dcdce0" />
              </linearGradient>
              <filter id={`${id}-senca`} x="-10%" y="-10%" width="120%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#000" floodOpacity="0.28" />
              </filter>
            </defs>
            <rect x={0} y={0} width={sirina} height={VISINA} rx={12} fill={`url(#${id}-oz)`} />

            {/* mreža + os y */}
            {mreza.map((v) => (
              <g key={v}>
                <line x1={LEVO} x2={sirina - DESNO} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#3a3a3f" : "#c4c4ca"} strokeWidth={v === 0 ? 2 : 1} />
                <text x={LEVO - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-600 text-[11px] tabular-nums">
                  {v}
                </text>
              </g>
            ))}
            {/* os x: tedni */}
            {Array.from({ length: tednov + 1 }, (_, n) => n)
              .filter((n) => n % vsakiX === 0)
              .map((n) => (
                <text key={n} x={x(n)} y={VISINA - 12} textAnchor="middle" className="fill-ink-600 text-[11px] tabular-nums">
                  {n === 0 ? formatDayMonth(zacetek) : n}
                </text>
              ))}

            {/* cilj + pričakovan tempo */}
            <line x1={LEVO} x2={sirina - DESNO} y1={y(cilj)} y2={y(cilj)} stroke="#3a3a3f" strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={sirina - DESNO + 6} y={y(cilj) - 1} className="fill-ink-800 text-[11px] font-bold">
              <tspan>Cilj</tspan>
              <tspan x={sirina - DESNO + 6} dy={12}>
                {fmtVrednost.format(cilj)} %
              </tspan>
            </text>
            <line
              x1={x(0)}
              y1={y(0)}
              x2={x(nacrtovanoTednov)}
              y2={y(cilj)}
              stroke="#9a9aa1"
              strokeWidth={1.5}
              strokeDasharray="3 4"
            />

            {/* črte vodij: vsak odsek po smeri */}
            {serije.map((s) => {
              const b = barvaVodje(s.vodja.koda);
              return (
                <g key={s.vodja.id} filter={`url(#${id}-senca)`}>
                  {s.tocke.slice(1).map((t, i) => {
                    const prej = s.tocke[i];
                    const d = t.skupaj - prej.skupaj;
                    return (
                      <line
                        key={t.teden}
                        x1={x(prej.teden)}
                        y1={y(prej.skupaj)}
                        x2={x(t.teden)}
                        y2={y(t.skupaj)}
                        stroke={d > 0 ? b.raste : d < 0 ? b.pada : BARVA_RAVNO}
                        strokeWidth={3.5}
                        strokeLinecap="round"
                        strokeDasharray={d < 0 ? "7 5" : undefined}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* skupna začetna točka */}
            <g filter={`url(#${id}-senca)`}>
              <circle cx={x(0)} cy={y(0)} r={r} fill={BARVA_RAVNO} stroke="#fff" strokeWidth={2} />
              {zNapisom && (
                <text x={x(0)} y={y(0) + r * 0.32} textAnchor="middle" fill="#fff" fontSize={r * 0.85} fontWeight={700}>
                  0
                </text>
              )}
            </g>

            {/* točke vpisov z vrednostjo */}
            {serije.map((s, si) => {
              const b = barvaVodje(s.vodja.koda);
              return s.tocke
                .filter((t) => t.ocena)
                .map((t) => {
                  const cx = x(t.teden) + zamik(si, t);
                  const cy = y(t.skupaj);
                  return (
                    <g key={`${s.vodja.id}-${t.teden}`} filter={`url(#${id}-senca)`}>
                      <circle cx={cx} cy={cy} r={r} fill={b.osnovna} stroke="#fff" strokeWidth={2} />
                      {zNapisom && (
                        <text x={cx} y={cy + r * 0.32} textAnchor="middle" fill="#fff" fontSize={r * 0.8} fontWeight={700}>
                          {fmtVrednost.format(t.skupaj)}
                        </text>
                      )}
                    </g>
                  );
                });
            })}

            {/* hover */}
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={ZGORAJ} y2={VISINA - SPODAJ} stroke="#6b6b72" strokeWidth={1} pointerEvents="none" />
            )}
          </svg>
        )}

        {hover !== null && (
          <div
            className={`pointer-events-none absolute top-2 z-20 w-64 rounded-lg border border-ink-200 bg-white p-2.5 text-xs shadow-lg ${
              x(hover) > sirina / 2 ? "-translate-x-full" : ""
            }`}
            style={{ left: x(hover) + (x(hover) > sirina / 2 ? -10 : 10) }}
          >
            {hover === 0 ? (
              <div className="font-bold text-ink-900">Začetek · {formatDayMonth(zacetek)} · 0 %</div>
            ) : (
              <>
                <div className="mb-1 font-bold text-ink-900">
                  {hover}. teden <span className="font-normal text-ink-500">({tedenObdobje(zacetek, hover)})</span>
                </div>
                {serije.map((s) => {
                  const t = s.tocke.find((x) => x.teden === hover) ?? s.tocke[s.tocke.length - 1];
                  return (
                    <div key={s.vodja.id} className="border-t border-ink-100 py-1">
                      <div className="flex items-center gap-1.5 font-semibold text-ink-800">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: barvaVodje(s.vodja.koda).osnovna }} />
                        <span className="flex-1">{s.vodja.naziv}</span>
                        <span className="tabular-nums">{formatPct(t.skupaj)}</span>
                      </div>
                      <div className="pl-4 text-ink-600">
                        {t.teden === hover && t.ocena ? (
                          <>
                            <span className="font-semibold tabular-nums">{formatPct(t.ocena.sprememba)}</span> · {t.ocena.komentar}
                          </>
                        ) : (
                          "brez vpisa"
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* legenda */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600"
        title="Svetla črta = napredek · temna črtkana = nazadovanje · siva = brez spremembe"
      >
        {serije.map((s) => (
          <span key={s.vodja.id} className="inline-flex items-center gap-1.5">
            <span className="h-1 w-5 rounded-full" style={{ background: barvaVodje(s.vodja.koda).osnovna }} />
            <span className="font-semibold text-ink-800">{s.vodja.naziv}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-ink-700" />
          Cilj
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dotted border-ink-400" />
          Pričakovan tempo
        </span>
      </div>
    </div>
  );
}
