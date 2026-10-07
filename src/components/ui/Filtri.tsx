"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";

/**
 * Standardna vrstica filtrov: vsi gumbi / polja so poravnani spodaj (enaka višina 40 px),
 * naslovi so v svoji vrstici nad njimi. Predolg naslov se prelomi navzgor, polje ostane v isti vrsti.
 */
export function FilterVrstica({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-end gap-3 ${className}`}>{children}</div>;
}

/** Naslov nad poljem (vedno enak slog). */
export function FilterNaslov({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs font-semibold leading-tight text-ink-600">{children}</span>;
}

/** Polje filtra z naslovom nad njim. Brez naslova se polje vseeno poravna z ostalimi (spodaj). */
export function FilterPolje({ label, children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col justify-end ${className}`}>
      {label && <FilterNaslov>{label}</FilterNaslov>}
      {children}
    </div>
  );
}

/** Iskalno polje (40 px, lupa levo). */
export function FilterIskanje({
  label = "Iskanje",
  value,
  onChange,
  placeholder,
  hint,
  className = "w-full sm:w-72",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint: string;
  className?: string;
}) {
  return (
    <FilterPolje label={label} className={className}>
      <span className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-ink-400" aria-hidden />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          title={hint}
          aria-label={label}
          className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-8 pr-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
        />
      </span>
    </FilterPolje>
  );
}

/** Spustni seznam z enojnim izborom (40 px). */
export function FilterIzbira<V extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
  className = "",
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  hint: string;
  className?: string;
}) {
  return (
    <FilterPolje label={label} className={className}>
      <select
        value={value}
        title={hint}
        aria-label={label}
        onChange={(e) => {
          const izbrana = options.find((o) => String(o.value) === e.target.value);
          if (izbrana) onChange(izbrana.value);
        }}
        className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </FilterPolje>
  );
}

/**
 * Checkbox v okvirju iste višine kot ostala polja (40 px), da je poravnan z njimi.
 * Vklopljen: oranžna obroba in svetlo oranžno ozadje.
 */
export function FilterCheckbox({
  label,
  naslov,
  checked,
  onChange,
  hint,
}: {
  label: string;
  /** Neobvezen naslov nad okvirjem. */
  naslov?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint: string;
}) {
  return (
    <FilterPolje label={naslov}>
      <label
        title={hint}
        className={`inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
          checked ? "border-fines-500 bg-fines-50 text-ink-900" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-100"
        }`}
      >
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-fines-500" />
        {label}
      </label>
    </FilterPolje>
  );
}
