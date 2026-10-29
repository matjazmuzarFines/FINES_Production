"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { useSync, type SkupnoStanje, type StanjeDatoteke, type SyncDatoteka } from "./SyncProvider";
import { Button } from "./ui/Button";

// =====================================================================
// SKUPNO: barve stanja in zapis časa
// =====================================================================

export const PIKA_STANJA: Record<StanjeDatoteke | SkupnoStanje, string> = {
  sinhronizirano: "bg-ok-500",
  novo: "bg-nok-500",
  ni_sinhronizirano: "bg-nok-500",
  ni_datoteke: "bg-nok-500",
  napaka: "bg-nok-500",
  uvazam: "bg-sync-500 animate-pulse",
  v_teku: "bg-sync-500 animate-pulse",
  neznano: "bg-ink-300",
};

export const OPIS_STANJA_DATOTEKE: Record<StanjeDatoteke, string> = {
  sinhronizirano: "Sinhronizirano",
  novo: "Nova datoteka - ni uvožena",
  ni_datoteke: "Datoteke ni v mapi",
  neznano: "Mapa ni povezana - stanje ni znano",
  uvazam: "Uvažam ...",
  napaka: "Napaka pri uvozu",
};

const OPIS_SKUPNO: Record<SkupnoStanje, string> = {
  sinhronizirano: "Vsi podatki so sinhronizirani",
  v_teku: "Sync v teku",
  ni_sinhronizirano: "Nekateri podatki niso sinhronizirani",
  neznano: "Mapa izvozov ni povezana",
};

/** "28. 10. 15:21" iz ISO ali ms; "–" če ni časa. */
export function casSync(t: string | number | null): string {
  if (t === null) return "–";
  const d = new Date(t);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Krogec stanja 12 px z belim robom. */
export function PikaStanja({ stanje, className = "" }: { stanje: StanjeDatoteke | SkupnoStanje; className?: string }) {
  return (
    <span
      className={`inline-block h-3 w-3 shrink-0 rounded-full border-2 border-white ${PIKA_STANJA[stanje]} ${className}`}
      aria-hidden
    />
  );
}

// =====================================================================
// GUMB SYNC V GLAVI
// =====================================================================

/** Okrogel gumb Sync levo od "i": krogec stanja, klik odpre seznam datotek in Sync vse. */
export function SyncGlava() {
  const sync = useSync();
  const [odprt, setOdprt] = useState(false);
  const okvir = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!odprt) return;
    const klik = (e: MouseEvent) => {
      if (okvir.current && !okvir.current.contains(e.target as Node)) setOdprt(false);
    };
    const tipka = (e: KeyboardEvent) => e.key === "Escape" && setOdprt(false);
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", tipka);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", tipka);
    };
  }, [odprt]);

  const nesinhronizirane = sync.datoteke.filter((d) => d.stanje !== "sinhronizirano").map((d) => d.naslov);
  const hint =
    sync.skupno === "ni_sinhronizirano" ? `Ni sinhronizirano: ${nesinhronizirane.join(", ")}` : OPIS_SKUPNO[sync.skupno];

  return (
    <div ref={okvir} className="relative">
      <button
        type="button"
        title={hint}
        aria-label="Sync podatkov iz ERP"
        aria-expanded={odprt}
        onClick={() => setOdprt((o) => !o)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-white text-sync-500 transition-colors hover:bg-sync-50"
      >
        <RefreshCw className={`h-5 w-5 ${sync.skupno === "v_teku" ? "animate-spin" : ""}`} aria-hidden />
        <PikaStanja stanje={sync.skupno} className="absolute -right-0.5 -top-0.5" />
      </button>
      {odprt && (
        <div className="fp-card fixed inset-x-2 top-[68px] z-50 flex flex-col gap-3 p-3 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[26rem]">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-bold text-ink-900">Podatki iz ERP</h3>
            <span className="truncate text-xs text-ink-500" title="Kdaj so bile nazadnje preverjene datoteke v mapi">
              {sync.preverjeno
                ? `preverjeno ${casSync(sync.preverjeno)}`
                : sync.mapa.ime
                  ? `mapa: ${sync.mapa.ime}`
                  : "mapa ni preverjena"}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-ink-100 text-sm">
            {sync.datoteke.map((d) => (
              <VrsticaDatoteke key={d.kljuc} d={d} />
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/podatki"
              onClick={() => setOdprt(false)}
              title="Odpri stran s podrobnostmi synca"
              className="inline-flex h-10 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-bold text-ink-700 hover:bg-ink-100"
            >
              Podrobnosti
            </Link>
            {sync.mapa.podprto && (!sync.mapa.ime || sync.mapa.dovoljenje === "denied") ? (
              <Button hint="Izberi mapo z izvozi na serverju" variant="sync" icon={FolderOpen} onClick={sync.poveziMapo}>
                Poveži mapo
              </Button>
            ) : (
              <Button
                hint={sync.mapa.podprto ? "Uvozi vse nove datoteke iz mape" : "Izberi mapo z izvozi in uvozi nove"}
                variant="sync"
                icon={sync.delam ? Loader2 : RefreshCw}
                disabled={sync.delam}
                onClick={sync.syncVse}
              >
                Sync vse
              </Button>
            )}
          </div>
          {!sync.mapa.podprto && (
            <p className="text-xs text-ink-500">
              Ta brskalnik si mape ne zapomni - ob vsakem syncu izberi mapo z izvozi. Edge ali Chrome jo zapomnita in znata tudi
              samodejni sync.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function VrsticaDatoteke({ d }: { d: SyncDatoteka }) {
  return (
    <li className="flex items-center gap-2 py-1.5" title={`${d.datoteka} · ${OPIS_STANJA_DATOTEKE[d.stanje]}`}>
      <PikaStanja stanje={d.stanje} />
      <span className="min-w-0 flex-1 truncate font-semibold text-ink-800">{d.naslov}</span>
      <span className="shrink-0 text-right text-xs tabular-nums text-ink-500">
        <span title="Čas datoteke v mapi">{casSync(d.naServerju)}</span>
        <span className="mx-1 text-ink-300">→</span>
        <span title="Čas datoteke, ki je nazadnje uvožena (sicer čas uvoza)">{casSync(d.uvozenIzvoz ?? d.uvozeno)}</span>
      </span>
    </li>
  );
}
