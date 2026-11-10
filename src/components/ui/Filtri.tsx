"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { InfoNamig } from "./InfoNamig";

/**
 * Standardna vrstica filtrov: vsi gumbi / polja so poravnani spodaj (enaka višina 40 px),
 * naslovi so v svoji vrstici nad njimi. Predolg naslov se prelomi navzgor, polje ostane v isti vrsti.
 */
export function FilterVrstica({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-end gap-3 ${className}`}>{children}</div>;
}

/** Naslov nad poljem (vedno enak slog). `info` doda ikono "i" s pojasnilom na konec naslova. */
export function FilterNaslov({ children, info, skrijTelefon }: { children: ReactNode; info?: ReactNode; skrijTelefon?: boolean }) {
  return (
    <span className={`mb-1 block text-xs font-semibold leading-tight text-ink-600 ${skrijTelefon ? "max-sm:sr-only" : ""}`}>
      {children}
      {info && <> <InfoNamig naslov={String(children)}>{info}</InfoNamig></>}
    </span>
  );
}

/**
 * Polje filtra z naslovom nad njim. Brez naslova se polje vseeno poravna z ostalimi (spodaj).
 * `skrijNaslovTelefon`: na telefonu je naslov skrit (samo za bralnike zaslona) - stran za telefon, kjer šteje vsaka vrstica;
 * polje mora imeti placeholder, ki pove, kaj se vpiše.
 */
export function FilterPolje({
  label,
  info,
  children,
  className = "",
  skrijNaslovTelefon,
}: {
  label?: string;
  info?: ReactNode;
  children: ReactNode;
  className?: string;
  skrijNaslovTelefon?: boolean;
}) {
  return (
    <div className={`flex flex-col justify-end ${className}`}>
      {label && (
        <FilterNaslov info={info} skrijTelefon={skrijNaslovTelefon}>
          {label}
        </FilterNaslov>
      )}
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
  info,
  telefon,
  skrijNaslovTelefon,
  className = "w-full sm:w-72",
}: {
  label?: string;
  /** Na telefonu brez naslova nad poljem (placeholder pove, kaj se vpiše). */
  skrijNaslovTelefon?: boolean;
  /** Na telefonu 44 px in pisava 16 px (stran za delo na telefonu - iPhone ob vnosu ne poveča strani). */
  telefon?: boolean;
  /** Daljše pojasnilo za ikono "i". */
  info?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint: string;
  className?: string;
}) {
  return (
    <FilterPolje label={label} info={info} className={className} skrijNaslovTelefon={skrijNaslovTelefon}>
      <span className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Tipka "Išči" na tipkovnici telefona zapre tipkovnico, rezultat ostane viden
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          title={hint}
          aria-label={label}
          className={`${telefon ? "h-11 text-base sm:h-10 sm:text-sm" : "h-10 text-sm"} w-full min-w-0 rounded-lg border border-ink-200 bg-white pl-8 ${value ? "pr-9" : "pr-2"} focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 [&::-webkit-search-cancel-button]:hidden`}
        />
        {value && (
          <button
            type="button"
            title={`Počisti polje ${label}`}
            aria-label={`Počisti ${label}`}
            // Ne vzame fokusa polju - tipkovnica na telefonu ostane odprta
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            className="absolute right-0.5 top-1/2 flex h-9 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
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
  info,
  telefon,
  skrijNaslovTelefon,
  className = "",
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  /** Na telefonu 44 px in pisava 16 px, izbira se raztegne čez širino polja. */
  telefon?: boolean;
  /** Na telefonu brez naslova nad poljem. */
  skrijNaslovTelefon?: boolean;
  /** Daljše pojasnilo za ikono "i". */
  info?: ReactNode;
  onChange: (v: V) => void;
  hint: string;
  className?: string;
}) {
  return (
    <FilterPolje label={label} info={info} className={className} skrijNaslovTelefon={skrijNaslovTelefon}>
      <select
        value={value}
        title={hint}
        aria-label={label}
        onChange={(e) => {
          const izbrana = options.find((o) => String(o.value) === e.target.value);
          if (izbrana) onChange(izbrana.value);
        }}
        className={`${telefon ? "h-11 w-full min-w-0 text-base sm:h-10 sm:text-sm" : "h-10 text-sm"} rounded-lg border border-ink-200 bg-white px-2 focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100`}
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
  info,
}: {
  label: string;
  /** Neobvezen naslov nad okvirjem. */
  naslov?: string;
  /** Pojasnilo za ikono "i": na koncu naslova, brez naslova v okvirju takoj za besedilom. */
  info?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint: string;
}) {
  return (
    <FilterPolje label={naslov} info={naslov ? info : undefined}>
      <label
        title={hint}
        className={`inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
          checked ? "border-fines-500 bg-fines-50 text-ink-900" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-100"
        }`}
      >
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-fines-500" />
        {label}
        {info && !naslov && <InfoNamig naslov={label}>{info}</InfoNamig>}
      </label>
    </FilterPolje>
  );
}

/**
 * Preklopnik z enim izborom (2-4 možnosti) - namesto dveh checkboxov, ki se izključujeta
 * (npr. Normativ: Vsi / Brez normativa / Z normativom). Gumbi 40 px v eni skupini z obrobo,
 * izbran oranžen polni, neizbran bel, hover siv. Neobvezno število v oklepaju za oznako.
 */
export function FilterPreklopnik<V extends string>({
  label,
  value,
  options,
  onChange,
  info,
}: {
  label: string;
  value: V;
  options: { value: V; label: string; hint: string; stevilo?: number }[];
  onChange: (v: V) => void;
  /** Daljše pojasnilo za ikono "i". */
  info?: ReactNode;
}) {
  const skupina = useRef<HTMLDivElement>(null);
  const [raztegni, setRaztegni] = useState(false);

  // Sam v vrstici (npr. v oknu): ozek ostane naravne širine, nad 60 % prostora se raztegne. V vrsti filtrov vedno naravna širina.
  useLayoutEffect(() => {
    const el = skupina.current;
    const polje = el?.parentElement;
    const okvir = polje?.parentElement;
    if (!el || !polje || !okvir) return;
    const s = getComputedStyle(okvir);
    if (s.display.includes("flex") && s.flexDirection.startsWith("row")) return;
    const preveri = () => {
      const prej = el.style.width;
      el.style.width = "max-content";
      const naravna = el.offsetWidth;
      el.style.width = prej;
      setRaztegni(naravna > polje.clientWidth * 0.6);
    };
    preveri();
    const ro = new ResizeObserver(preveri);
    ro.observe(polje);
    return () => ro.disconnect();
  }, [options.length]);

  return (
    <FilterPolje label={label} info={info} className="min-w-0 max-w-full">
      <div ref={skupina} className={`flex h-10 max-w-full overflow-x-auto rounded-lg border border-ink-200 ${raztegni ? "w-full" : "w-fit"}`} role="group" aria-label={label}>
        {options.map((o, i) => {
          const izbran = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              title={o.hint}
              aria-pressed={izbran}
              onClick={() => onChange(o.value)}
              className={`whitespace-nowrap px-3 text-sm font-semibold transition-colors ${raztegni ? "flex-1" : ""} ${i > 0 ? "border-l border-ink-200" : ""} ${
                izbran ? "bg-fines-500 text-white" : "bg-white text-ink-600 hover:bg-ink-100"
              }`}
            >
              {o.label}
              {o.stevilo !== undefined && (
                <span className={`ml-1 font-normal tabular-nums ${izbran ? "text-white/80" : "text-ink-400"}`}>({o.stevilo})</span>
              )}
            </button>
          );
        })}
      </div>
    </FilterPolje>
  );
}
