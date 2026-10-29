"use client";

import Link from "next/link";
import type { SyncDatotekaKljuc } from "@/lib/syncDatoteke";
import { useSync } from "./SyncProvider";
import { OPIS_STANJA_DATOTEKE, PikaStanja, casSync } from "./SyncGlava";

/**
 * Vir podatkov strani (desno zgoraj, namesto polj za uvoz): za vsako datoteko krogec stanja,
 * naslov in čas zadnjega uvoza. Klik odpre stran Podatki (sync iz mape na serverju).
 */
export function PodatkiVir({ kljuci }: { kljuci: SyncDatotekaKljuc[] }) {
  const { datoteke } = useSync();
  const prikazane = datoteke.filter((d) => kljuci.includes(d.kljuc));
  return (
    <Link
      href="/podatki"
      title="Odpri sync podatkov iz ERP"
      className="fp-card flex w-full flex-col gap-1 px-3 py-2 text-xs transition-colors hover:border-ink-400 hover:bg-ink-50 sm:w-72"
    >
      <span className="font-semibold text-ink-600">Podatki iz ERP · uvoženo</span>
      {prikazane.map((d) => (
        <span key={d.kljuc} className="flex items-center gap-2" title={`${d.datoteka} · ${OPIS_STANJA_DATOTEKE[d.stanje]}`}>
          <PikaStanja stanje={d.stanje} />
          <span className="min-w-0 flex-1 truncate text-ink-800">{d.naslov}</span>
          <span className="shrink-0 tabular-nums text-ink-500">{d.uvozeno ? casSync(d.uvozeno) : "ni uvoza"}</span>
        </span>
      ))}
    </Link>
  );
}
