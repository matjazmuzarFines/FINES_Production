"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { VARIANTS } from "./Button";
import { FilterPolje } from "./Filtri";
import { useToast } from "./Toast";

/** En format izvoza (npr. Excel, PDF, Word). */
export type IzvozFormat = {
  koda: string;
  /** Ime v izbiri, npr. "Excel (.xlsx)". */
  label: string;
  /** Hover tekst gumba Prenesi za ta format - kaj prenese. */
  hint: string;
  akcija: () => void | Promise<void>;
  disabled?: boolean;
  /** Hover tekst, ko je format onemogočen (npr. "Najprej shrani spremembe"). */
  zakaj?: string;
  /** Modra za funkcije zunaj aplikacije (e-mail), sicer oranžna. */
  variant?: "primary" | "sync";
};

const SPOMIN = "fp-izvoz-";

/**
 * Standardni izvoz (app_instructions → Gumbi izvoza): naslov "Izvoz", izbira formata in en gumb Prenesi.
 * Z enim formatom je samo gumb z imenom formata. Izbran format si brskalnik zapomni (`spomin`).
 * `kompakten`: gumb samo z ikono (telefon).
 */
export function Izvoz({
  formati,
  spomin,
  kompakten,
  label = "Izvoz",
  className = "",
}: {
  formati: IzvozFormat[];
  spomin?: string;
  kompakten?: boolean;
  label?: string | null;
  className?: string;
}) {
  const notify = useToast();
  // Izvoz je na straneh, ki se prikažejo šele po nalaganju podatkov - branje localStorage ob inicializaciji je varno
  const [izbran, setIzbran] = useState(() => {
    try {
      if (spomin && typeof window !== "undefined") return localStorage.getItem(SPOMIN + spomin) ?? formati[0]?.koda ?? "";
    } catch {
      // brez shrambe ostane prvi format
    }
    return formati[0]?.koda ?? "";
  });
  const [delam, setDelam] = useState(false);

  const f = formati.find((x) => x.koda === izbran) ?? formati[0];
  if (!f) return null;
  const vec = formati.length > 1;

  function izberi(koda: string) {
    setIzbran(koda);
    if (!spomin) return;
    try {
      localStorage.setItem(SPOMIN + spomin, koda);
    } catch {
      // ni pomembno
    }
  }

  async function prenesi() {
    setDelam(true);
    try {
      await f.akcija();
    } catch (e) {
      notify("error", `Izvoz ni uspel: ${(e as Error).message}`, 10000);
    } finally {
      setDelam(false);
    }
  }

  const hint = f.disabled ? (f.zakaj ?? f.hint) : f.hint;
  return (
    <FilterPolje label={label ?? undefined} className={className}>
      <div className="flex">
        {vec && (
          <select
            value={f.koda}
            title="Izberi format izvoza"
            aria-label="Format izvoza"
            onChange={(e) => izberi(e.target.value)}
            className="h-10 min-w-0 rounded-l-lg border border-r-0 border-ink-200 bg-white px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
          >
            {formati.map((x) => (
              <option key={x.koda} value={x.koda}>
                {x.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          title={hint}
          aria-label={hint}
          disabled={f.disabled || delam}
          onClick={prenesi}
          className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            vec ? "rounded-r-lg" : "rounded-lg"
          } ${kompakten ? "w-10" : "px-4 text-sm"} ${VARIANTS[f.variant ?? "primary"]}`}
        >
          {delam ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          ) : (
            <Download className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {!kompakten && (vec ? "Prenesi" : f.label)}
        </button>
      </div>
    </FilterPolje>
  );
}
