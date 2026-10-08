"use client";

/**
 * Enotna izbirnika (glej app_instructions.md → Lestvice in DA/NE):
 * - DaNe: dva gumba 40 px, izbran DA zelen, izbran NE rdeč, neizbran bel z obrobo.
 * - Lestvica: gumbi 40 px v eni skupini z obrobo, izbrane vse stopnje do izbrane (oranžno),
 *   desno kratek opis izbrane ocene. Zaklenjena lestvica je siva in ima hover tekst, zakaj.
 */

export type DaNeVrednost = "DA" | "NE";

export function DaNe({
  value,
  subject,
  onChange,
  disabled,
}: {
  value: DaNeVrednost | null;
  /** Kaj se ocenjuje - uporabljeno v hover tekstu. */
  subject: string;
  onChange: (v: DaNeVrednost) => void;
  disabled?: boolean;
}) {
  const opcije: { v: DaNeVrednost; izbran: string }[] = [
    { v: "DA", izbran: "border-ok-500 bg-ok-500 text-white" },
    { v: "NE", izbran: "border-nok-500 bg-nok-500 text-white" },
  ];
  return (
    <div className="flex gap-2">
      {opcije.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            title={`${subject}: ${o.v}`}
            aria-label={`${subject}: ${o.v}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={`h-10 min-w-16 rounded-lg border px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active ? o.izbran : "border-ink-200 bg-white text-ink-600 hover:bg-ink-100"
            }`}
          >
            {o.v}
          </button>
        );
      })}
    </div>
  );
}

export type Stopnja = {
  value: number;
  /** Kratek opis ocene - prikazan desno od lestvice, ko je izbrana. */
  opis: string;
};

export function Lestvica({
  value,
  stopnje,
  subject,
  onChange,
  zaklenjena,
}: {
  value: number | null;
  stopnje: Stopnja[];
  subject: string;
  onChange: (v: number) => void;
  /** Razlog, zakaj je lestvica zaklenjena (hover tekst); prazno = odklenjena. */
  zaklenjena?: string;
}) {
  const izbrana = stopnje.find((s) => s.value === value);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className={`inline-flex overflow-hidden rounded-lg border border-ink-200 ${zaklenjena ? "opacity-50" : ""}`}
        title={zaklenjena}
      >
        {stopnje.map((s, i) => {
          const obarvana = value !== null && s.value <= value;
          return (
            <button
              key={s.value}
              type="button"
              title={zaklenjena ?? `${subject}: ${s.value} - ${s.opis}`}
              aria-label={`${subject}: ${s.value} - ${s.opis}`}
              aria-pressed={value === s.value}
              disabled={!!zaklenjena}
              onClick={() => onChange(s.value)}
              className={`h-10 min-w-10 px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed ${
                i > 0 ? "border-l border-ink-200" : ""
              } ${
                zaklenjena
                  ? "bg-ink-100 text-ink-500"
                  : obarvana
                    ? "bg-fines-500 text-white"
                    : "bg-white text-ink-600 hover:bg-fines-50"
              }`}
            >
              {s.value}
            </button>
          );
        })}
      </div>
      {izbrana && !zaklenjena && <span className="text-sm text-ink-600">{izbrana.opis}</span>}
    </div>
  );
}

/** Ocena 1-5 (ocena 1-2 pomeni odstopanje). */
export const OCENE_1_5: Stopnja[] = [
  { value: 1, opis: "Zelo slabo - odstopanje" },
  { value: 2, opis: "Slabo - odstopanje" },
  { value: 3, opis: "Sprejemljivo" },
  { value: 4, opis: "Dobro" },
  { value: 5, opis: "Odlično" },
];
