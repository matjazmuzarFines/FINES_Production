"use client";

import { useState } from "react";
import { FilterCheckbox } from "@/components/ui/Filtri";
import { SyncGumb } from "@/components/ui/SyncGumb";
import { SYNC_DATOTEKE, type SyncDatotekaKljuc } from "@/lib/syncDatoteke";

const DATOTEKE = Object.keys(SYNC_DATOTEKE) as SyncDatotekaKljuc[];

/** Testna stran: sync izvozov iz mape na serverju podjetja (nalogi, naročila, odpreme za Prioritete). */
export function TestSync() {
  const [samodejno, setSamodejno] = useState(false);
  const [zadnjiSync, setZadnjiSync] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-xl font-bold text-ink-900">Test sync s serverja</h2>
          <p className="text-sm text-ink-500">Izvozi iz administrativnega sistema v mapi na serverju → uvoz v aplikacijo</p>
        </div>
        <SyncGumb datoteke={DATOTEKE} samodejno={samodejno} onSync={() => setZadnjiSync(new Date().toLocaleTimeString("sl-SI"))} />
      </div>

      <div className="fp-card flex flex-col gap-3 p-4 text-sm text-ink-700">
        <p>
          Ikona sync desno zgoraj pokaže stanje datotek za to stran: <b className="text-ok-600">zelena</b> = sinhronizirano,{" "}
          <b className="text-sync-600">modra</b> = sync v teku, <b className="text-nok-600">rdeča</b> = na serverju je nova datoteka ali
          server ni dosegljiv. Klik na ikono odpre seznam datotek in gumb Sync.
        </p>
        <p>
          Datoteka je sinhronizirana, če je bil zadnji uvoz v bazo narejen po času izvoza (lastnost Excela &quot;Spremenjeno&quot;). Sync
          uvozi datoteke enako kot ročni uvoz v Prioritetah - podatki v Prioritetah in Zasedenosti se zamenjajo.
        </p>
        <p className="font-mono text-xs text-ink-500">
          \\rokadasrv\RISPSQL$\Dokumentacija\Podatki za aplikacije\ · {DATOTEKE.map((k) => SYNC_DATOTEKE[k].datoteka).join(", ")}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <FilterCheckbox
            checked={samodejno}
            onChange={setSamodejno}
            label="Samodejni sync ob prihodu na stran"
            hint="Ob odprtju strani uvozi nove datoteke"
          />
          {zadnjiSync && <span className="pb-2.5 text-xs text-ink-500">Zadnji sync: {zadnjiSync}</span>}
        </div>
      </div>
    </div>
  );
}
