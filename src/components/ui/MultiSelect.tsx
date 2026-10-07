"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FilterNaslov } from "./Filtri";

/** Spustni seznam z večkratnim izborom (checkboxi + Izberi vse). */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  hint: string;
}) {
  const [odprt, setOdprt] = useState(false);
  const [iskanje, setIskanje] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!odprt) return;
    const zapri = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOdprt(false);
    };
    document.addEventListener("mousedown", zapri);
    return () => document.removeEventListener("mousedown", zapri);
  }, [odprt]);

  const vidne = options.filter((o) => o.toLowerCase().includes(iskanje.toLowerCase()));
  const vseIzbrane = vidne.length > 0 && vidne.every((o) => value.includes(o));
  const povzetek = value.length === 0 ? "Vse" : value.length <= 2 ? value.join(", ") : `${value.length} izbranih`;

  function preklopi(o: string) {
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  }

  return (
    <div ref={ref} className="relative">
      <FilterNaslov>{label}</FilterNaslov>
      <button
        type="button"
        title={hint}
        aria-expanded={odprt}
        onClick={() => setOdprt((o) => !o)}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm ${
          value.length ? "border-fines-500 text-ink-900" : "border-ink-200 text-ink-600"
        }`}
      >
        <span className="truncate">{povzetek}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      {odprt && (
        <div className="absolute z-30 mt-1 w-full min-w-56 rounded-lg border border-ink-200 bg-white p-2 shadow-lg">
          <input
            autoFocus
            value={iskanje}
            onChange={(e) => setIskanje(e.target.value)}
            placeholder="Išči ..."
            title="Išči med možnostmi"
            className="mb-2 h-9 w-full rounded-md border border-ink-200 px-2 text-sm focus:border-fines-500 focus:outline-none"
          />
          <div className="mb-1 flex gap-2 border-b border-ink-100 pb-2 text-xs">
            <button
              type="button"
              title="Izberi vse prikazane možnosti"
              className="font-semibold text-fines-500 hover:underline"
              onClick={() => onChange(vseIzbrane ? value.filter((v) => !vidne.includes(v)) : [...new Set([...value, ...vidne])])}
            >
              {vseIzbrane ? "Odznači vse" : "Izberi vse"}
            </button>
            {value.length > 0 && (
              <button
                type="button"
                title="Počisti izbor (prikaži vse)"
                className="ml-auto font-semibold text-ink-500 hover:underline"
                onClick={() => onChange([])}
              >
                Počisti
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {vidne.map((o) => {
              const izbrana = value.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  title={`${izbrana ? "Odstrani" : "Dodaj"} filter: ${o}`}
                  onClick={() => preklopi(o)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-ink-50"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      izbrana ? "border-fines-500 bg-fines-500 text-white" : "border-ink-300"
                    }`}
                  >
                    {izbrana && <Check className="h-3 w-3" aria-hidden />}
                  </span>
                  {o}
                </button>
              );
            })}
            {vidne.length === 0 && <p className="px-2 py-1 text-sm text-ink-400">Ni zadetkov</p>}
          </div>
        </div>
      )}
    </div>
  );
}
