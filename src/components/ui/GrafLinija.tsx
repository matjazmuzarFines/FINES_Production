"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Barve serije: osnovna (točke, legenda), svetla = raste, temna = pada. */
export type BarvaSerije = { osnovna: string; raste: string; pada: string };

export const BARVE_SERIJ = {
  zelena: { osnovna: "#16a34a", raste: "#4ade80", pada: "#14532d" },
  oranzna: { osnovna: "#e36f1e", raste: "#f59a4a", pada: "#9a3d0a" },
  modra: { osnovna: "#1f6fb8", raste: "#4aa3f0", pada: "#0b3a66" },
  vijolicna: { osnovna: "#7c4dcc", raste: "#a383e6", pada: "#4b2a8a" },
  rdeca: { osnovna: "#be123c", raste: "#f43f5e", pada: "#7f1d1d" },
} satisfies Record<string, BarvaSerije>;

const BARVA_RAVNO = "#8a8a92";

export type Serija = { naziv: string; barva: BarvaSerije; vrednosti: (number | null)[] };

/** Robovi risbe: običajni in kompaktni (majhne KPI kartice, več grafov v vrsti). */
const ROBOVI = {
  obicajno: { ZGORAJ: 18, SPODAJ: 40, LEVO: 40, DESNO: 56, ODMIK_X: 16 },
  kompaktno: { ZGORAJ: 10, SPODAJ: 22, LEVO: 30, DESNO: 34, ODMIK_X: 8 },
};

/** "Lep" korak mreže (1, 2, 5 × 10^n). */
function korakMreze(razpon: number) {
  const grob = razpon / 5;
  const p = 10 ** Math.floor(Math.log10(grob || 1));
  return [1, 2, 5, 10].map((k) => k * p).find((k) => k >= grob) ?? p * 10;
}

/**
 * Standardni KPI linijski graf (app_instructions → Graf napredka): sivo ozadje s prelivom,
 * črte s senco, točke z vrednostjo, odsek raste = svetel, pada = temen črtkan, ravno = siv.
 * Cilj: črtkana vodoravna črta z oznako desno. Hover / tap: navpična črta + tooltip.
 */
export function GrafLinija({
  serije,
  xOznake,
  cilj,
  ciljOznaka = "Cilj",
  format,
  formatTocka = (n) => Math.round(n).toLocaleString("sl-SI"),
  opisi,
  naziv,
  visina = 200,
  kompakten = false,
}: {
  serije: Serija[];
  /** Oznake osi x (dolžina = število točk). */
  xOznake: string[];
  cilj?: number;
  ciljOznaka?: string;
  /** Oblika vrednosti (točke, os, tooltip). */
  format: (n: number) => string;
  /** Kratka oblika vrednosti v točki (privzeto zaokroženo število). */
  formatTocka?: (n: number) => string;
  /** Dodaten opis točke x v tooltipu. */
  opisi?: string[];
  naziv: string;
  visina?: number;
  /** Majhen graf: manjši robovi in pisava, cilj samo z vrednostjo, brez legende. */
  kompakten?: boolean;
}) {
  const { ZGORAJ, SPODAJ, LEVO, DESNO, ODMIK_X } = kompakten ? ROBOVI.kompaktno : ROBOVI.obicajno;
  const pisava = kompakten ? "text-[9px]" : "text-[11px]";
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [sirina, setSirina] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const izmeri = () => setSirina(el.clientWidth);
    const raf = requestAnimationFrame(izmeri);
    const ro = new ResizeObserver(izmeri);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const n = Math.max(1, xOznake.length);
  const vse = serije.flatMap((s) => s.vrednosti.filter((v): v is number => v !== null));
  const maxV = Math.max(cilj ?? 0, ...vse, 0);
  const minV = Math.min(0, ...vse);
  const korak = korakMreze(maxV - minV || 1);
  const yMax = Math.max(korak, Math.ceil(maxV / korak) * korak);
  const yMin = Math.floor(minV / korak) * korak;

  const notri = Math.max(1, sirina - LEVO - DESNO - ODMIK_X);
  const korakX = n > 1 ? notri / (n - 1) : notri;
  const x = (i: number) => LEVO + ODMIK_X + i * korakX;
  const y = (v: number) => ZGORAJ + ((yMax - v) / (yMax - yMin || 1)) * (visina - ZGORAJ - SPODAJ);
  const r = Math.max(4, Math.min(11, korakX * 0.32));
  const zNapisom = r >= 9;
  const vsakiX = Math.max(1, Math.ceil(40 / korakX));

  const mreza: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += korak) mreza.push(Math.round(v * 1000) / 1000);

  function premik(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const i = Math.round((clientX - el.getBoundingClientRect().left - LEVO - ODMIK_X) / korakX);
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={ref}
        className="relative w-full touch-pan-y select-none overflow-visible rounded-xl shadow-[0_2px_8px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.8)]"
        style={{ height: visina }}
        onPointerMove={(e) => premik(e.clientX)}
        onPointerDown={(e) => premik(e.clientX)}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={naziv}
      >
        {sirina > 0 && (
          <svg width={sirina} height={visina} className="block">
            <defs>
              <linearGradient id={`${id}-oz`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f7f7f8" />
                <stop offset="100%" stopColor="#dcdce0" />
              </linearGradient>
              <filter id={`${id}-senca`} x="-10%" y="-10%" width="120%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#000" floodOpacity="0.28" />
              </filter>
            </defs>
            <rect x={0} y={0} width={sirina} height={visina} rx={12} fill={`url(#${id}-oz)`} />

            {mreza.map((v) => (
              <g key={v}>
                <line
                  x1={LEVO}
                  x2={sirina - DESNO}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={v === 0 ? "#3a3a3f" : "#c4c4ca"}
                  strokeWidth={v === 0 ? 2 : 1}
                />
                <text x={LEVO - (kompakten ? 4 : 8)} y={y(v) + 4} textAnchor="end" className={`fill-ink-600 ${pisava} tabular-nums`}>
                  {v.toLocaleString("sl-SI")}
                </text>
              </g>
            ))}
            {xOznake.map((o, i) =>
              i % vsakiX === 0 ? (
                <text key={i} x={x(i)} y={visina - (kompakten ? 7 : 12)} textAnchor="middle" className={`fill-ink-600 ${pisava} tabular-nums`}>
                  {o}
                </text>
              ) : null,
            )}

            {cilj !== undefined && cilj > 0 && (
              <>
                <line x1={LEVO} x2={sirina - DESNO} y1={y(cilj)} y2={y(cilj)} stroke="#3a3a3f" strokeWidth={1.5} strokeDasharray="6 4" />
                {kompakten ? (
                  <text x={sirina - DESNO + 3} y={y(cilj) + 3} className={`fill-ink-800 ${pisava} font-bold`}>
                    {formatTocka(cilj)}
                  </text>
                ) : (
                  <text x={sirina - DESNO + 6} y={y(cilj) - 1} className="fill-ink-800 text-[11px] font-bold">
                    <tspan>{ciljOznaka}</tspan>
                    <tspan x={sirina - DESNO + 6} dy={12}>
                      {format(cilj)}
                    </tspan>
                  </text>
                )}
              </>
            )}

            {serije.map((s) => (
              <g key={s.naziv} filter={`url(#${id}-senca)`}>
                {s.vrednosti.map((v, i) => {
                  if (i === 0 || v === null) return null;
                  // poveži z zadnjo prejšnjo točko z vrednostjo
                  let j = i - 1;
                  while (j >= 0 && s.vrednosti[j] === null) j--;
                  if (j < 0) return null;
                  const prej = s.vrednosti[j]!;
                  const d = v - prej;
                  return (
                    <line
                      key={i}
                      x1={x(j)}
                      y1={y(prej)}
                      x2={x(i)}
                      y2={y(v)}
                      stroke={d > 0 ? s.barva.raste : d < 0 ? s.barva.pada : BARVA_RAVNO}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      strokeDasharray={d < 0 ? "7 5" : undefined}
                    />
                  );
                })}
              </g>
            ))}

            {serije.map((s) =>
              s.vrednosti.map((v, i) =>
                v === null ? null : (
                  <g key={`${s.naziv}-${i}`} filter={`url(#${id}-senca)`}>
                    <circle cx={x(i)} cy={y(v)} r={r} fill={s.barva.osnovna} stroke="#fff" strokeWidth={2} />
                    {zNapisom && (
                      <text x={x(i)} y={y(v) + r * 0.32} textAnchor="middle" fill="#fff" fontSize={r * 0.8} fontWeight={700}>
                        {formatTocka(v)}
                      </text>
                    )}
                  </g>
                ),
              ),
            )}

            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={ZGORAJ} y2={visina - SPODAJ} stroke="#6b6b72" strokeWidth={1} pointerEvents="none" />
            )}
          </svg>
        )}

        {hover !== null && (
          <div
            className={`pointer-events-none absolute top-2 z-20 ${kompakten ? "w-48" : "w-60"} rounded-lg border border-ink-200 bg-white p-2.5 text-xs shadow-lg ${
              x(hover) > sirina / 2 ? "-translate-x-full" : ""
            }`}
            style={{ left: x(hover) + (x(hover) > sirina / 2 ? -10 : 10) }}
          >
            <div className="mb-1 font-bold text-ink-900">{xOznake[hover]}</div>
            {serije.map((s) => {
              const v = s.vrednosti[hover];
              return (
                <div key={s.naziv} className="flex items-center gap-1.5 border-t border-ink-100 py-1 font-semibold text-ink-800">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.barva.osnovna }} />
                  <span className="flex-1">{s.naziv}</span>
                  <span className="tabular-nums">{v === null || v === undefined ? "-" : format(v)}</span>
                </div>
              );
            })}
            {opisi?.[hover] && <div className="border-t border-ink-100 pt-1 text-ink-600">{opisi[hover]}</div>}
          </div>
        )}
      </div>

      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600 ${kompakten ? "hidden" : ""}`}
        title="Svetla črta = rast · temna črtkana = padec · siva = brez spremembe"
      >
        {serije.map((s) => (
          <span key={s.naziv} className="inline-flex items-center gap-1.5">
            <span className="h-1 w-5 rounded-full" style={{ background: s.barva.osnovna }} />
            <span className="font-semibold text-ink-800">{s.naziv}</span>
          </span>
        ))}
        {cilj !== undefined && cilj > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-ink-700" />
            {ciljOznaka}
          </span>
        )}
      </div>
    </div>
  );
}
