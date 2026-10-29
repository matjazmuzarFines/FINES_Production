"use client";

import { FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { SYNC_MAPA } from "@/lib/syncDatoteke";
import { formatNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import { useSync, type SyncDatoteka } from "@/components/SyncProvider";
import { OPIS_STANJA_DATOTEKE, PikaStanja, casSync } from "@/components/SyncGlava";
import { Button } from "@/components/ui/Button";
import { FilterCheckbox, FilterPolje, FilterVrstica } from "@/components/ui/Filtri";
import { ConfigMissing, ErrorText, SuccessText, WarningText } from "@/components/ui/Notice";
import { UvozDropzone } from "@/components/ui/UvozDropzone";

const RAMKA: Record<SyncDatoteka["stanje"], string> = {
  sinhronizirano: "border-ok-500",
  novo: "border-nok-500",
  ni_datoteke: "border-nok-500",
  napaka: "border-nok-500",
  uvazam: "border-sync-500",
  neznano: "border-ink-200",
};

export function PodatkiSync() {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <PodatkiSyncInner />;
}

function PodatkiSyncInner() {
  const sync = useSync();
  // Brez povezane mape (Firefox) sync odpre izbiro mape, zato je vedno na voljo
  const povezana = !sync.mapa.podprto || (!!sync.mapa.ime && sync.mapa.dovoljenje !== "denied");
  const novih = sync.datoteke.filter((d) => d.stanje === "novo").length;

  return (
    <div className="flex flex-col gap-4">
      {/* ============ GLAVA ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Sync podatkov iz ERP</h2>
          <p className="text-sm text-ink-500">
            Worker vsakih nekaj ur shrani izvoze v mapo na serverju; aplikacija jih prebere iz mape in uvozi. Datoteka je
            sinhronizirana, ko je zadnji uvoz novejši od datoteke v mapi.
          </p>
        </div>
      </div>

      {/* ============ OPOZORILA ============ */}
      {!sync.mapa.podprto && (
        <WarningText>
          Ta brskalnik si mape ne zapomni: ob vsakem <b>Sync</b> se odpre izbira mape - izberi{" "}
          <code className="rounded bg-white px-1">{SYNC_MAPA}</code> in potrdi (brskalnik lahko vpraša, ali naj datoteke naloži -
          potrdi). Samodejni sync in stanje datotek brez klika delujeta samo v <b>Edge</b> ali <b>Chrome</b>.
        </WarningText>
      )}
      {sync.mapa.podprto && !sync.mapa.ime && (
        <WarningText>
          Mapa z izvozi še ni povezana. Klikni <b>Poveži mapo</b> in v oknu v naslovno vrstico vpiši{" "}
          <code className="rounded bg-white px-1">{SYNC_MAPA}</code> (Enter), nato <b>Izberi mapo</b> in dovoli branje. Brskalnik
          si mapo zapomni.
        </WarningText>
      )}
      {sync.mapa.ime && sync.mapa.dovoljenje === "prompt" && (
        <WarningText>
          Brskalnik ob prvem syncu v seji vpraša za dovoljenje branja mape {sync.mapa.ime}. Izberi »Dovoli ob vsakem obisku«, da
          vprašanja ne bo več.
        </WarningText>
      )}

      {sync.brezZaklepa && (
        <WarningText>
          Zaklep uvoza še ni nastavljen - če dva uporabnika hkrati kliknete Sync, se lahko ista datoteka uvozi dvakrat. V Supabase
          SQL editorju zaženi <code className="rounded bg-white px-1">supabase/migrations/025_sync_stanje.sql</code>.
        </WarningText>
      )}

      {/* ============ UKAZI ============ */}
      <div className="fp-card p-3 sm:p-4">
        <FilterVrstica>
          <FilterPolje label="Mapa z izvozi">
            <div className="flex h-10 items-center gap-2 text-sm text-ink-700" title={SYNC_MAPA}>
              <FolderOpen className="h-4 w-4 text-ink-400" aria-hidden />
              {sync.mapa.ime ?? (sync.mapa.podprto ? "ni povezana" : "izbereš jo ob syncu")}
            </div>
          </FilterPolje>
          <FilterPolje label="Preverjeno">
            <div
              className="flex h-10 items-center text-sm tabular-nums text-ink-700"
              title="Kdaj so bile nazadnje prebrane datoteke v mapi"
            >
              {sync.preverjeno ? casSync(sync.preverjeno) : "še ne"}
            </div>
          </FilterPolje>
          {sync.mapa.podprto && (
            <FilterPolje label="Povezava">
              <Button hint="Izberi mapo z izvozi na serverju" variant="sync" icon={FolderOpen} onClick={sync.poveziMapo}>
                {sync.mapa.ime ? "Zamenjaj mapo" : "Poveži mapo"}
              </Button>
            </FilterPolje>
          )}
          <FilterPolje label="Sync">
            <Button
              hint={sync.mapa.podprto ? "Uvozi vse nove datoteke iz mape" : "Izberi mapo z izvozi in uvozi nove"}
              variant="sync"
              icon={sync.delam ? Loader2 : RefreshCw}
              disabled={!povezana || sync.delam}
              onClick={sync.syncVse}
            >
              Sync vse{novih ? ` (${novih})` : ""}
            </Button>
          </FilterPolje>
          {sync.mapa.podprto && (
            <FilterCheckbox
              naslov="Ta brskalnik"
              label="Samodejni sync vsakih 5 min"
              checked={sync.samodejno}
              onChange={sync.setSamodejno}
              hint="Nove datoteke uvozi samodejno (npr. zaslon v skladišču)"
            />
          )}
          <FilterPolje label="Prikaz">
            <Button hint="Znova preveri datoteke in zadnje uvoze" variant="neutral" onClick={sync.preveri}>
              Osveži stanje
            </Button>
          </FilterPolje>
        </FilterVrstica>
      </div>

      {/* ============ UVOZ VEČ DATOTEK ============ */}
      <div className="fp-card flex flex-col gap-2 p-3 sm:p-4">
        <div>
          <h3 className="font-bold text-ink-900">Uvoz več datotek naenkrat</h3>
          <p className="text-sm text-ink-500">
            Povleci sem poljubne izvoze (npr. vse datoteke iz mape). Aplikacija jih razporedi po imenu, uvozi samo novejše od
            zadnjega uvoza, datoteke, ki jih ne pozna, pa prezre.
          </p>
        </div>
        <UvozDropzone
          naslov="Povleci več izvozov naenkrat"
          hint="Povleci sem izvoze iz ERP ali klikni za izbiro"
          enota=""
          uvoz={null}
          nalagam={sync.delam}
          onemogoceno={sync.delam}
          onFiles={sync.uvoziVec}
        />
      </div>

      {/* ============ DATOTEKE ============ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sync.datoteke.map((d) => (
          <KvadratekDatoteke key={d.kljuc} d={d} povezana={povezana} />
        ))}
      </div>
    </div>
  );
}

function KvadratekDatoteke({ d, povezana }: { d: SyncDatoteka; povezana: boolean }) {
  const sync = useSync();
  return (
    <section className={`fp-card flex flex-col gap-3 border-l-4 p-3 ${RAMKA[d.stanje]}`} aria-label={d.naslov}>
      <div className="flex items-start gap-2">
        <PikaStanja stanje={d.stanje} className="mt-1" />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-ink-900">{d.naslov}</h3>
          <p className="truncate font-mono text-xs text-ink-500" title={d.datoteka}>
            {d.datoteka}
          </p>
          <p className="text-xs text-ink-500">Uporabljajo: {d.strani}</p>
        </div>
        <Button
          hint={`Uvozi ${d.naslov.toLowerCase()} iz mape`}
          variant="sync"
          icon={d.stanje === "uvazam" ? Loader2 : RefreshCw}
          disabled={!povezana || sync.delam}
          onClick={() => sync.syncEna(d.kljuc)}
        >
          Sync
        </Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-ink-500">Stanje</dt>
        <dd className="font-semibold text-ink-800">{OPIS_STANJA_DATOTEKE[d.stanje]}</dd>
        <dt className="text-ink-500">V mapi</dt>
        <dd className="tabular-nums" title="Čas zadnje spremembe datoteke v mapi">
          {casSync(d.naServerju)}
          {d.velikost !== null && <span className="text-ink-500"> · {formatNum(Math.round(d.velikost / 1024))} kB</span>}
        </dd>
        <dt className="text-ink-500">Uvoženo</dt>
        <dd className="tabular-nums" title="Zadnji aktivni uvoz v aplikaciji">
          {casSync(d.uvozeno)}
        </dd>
        <dt className="text-ink-500">Uvožena datoteka</dt>
        <dd className="tabular-nums" title="Čas datoteke, ki je bila nazadnje uvožena - primerja se s časom datoteke v mapi">
          {casSync(d.uvozenIzvoz)}
        </dd>
      </dl>

      {d.rezultat &&
        (d.rezultat.ok ? (
          <SuccessText>
            {casSync(d.rezultat.cas.getTime())} uvoženo: {d.rezultat.opis}
            {d.rezultat.opozorila.length > 0 && (
              <details className="mt-1 text-warn-700">
                <summary className="cursor-pointer">{d.rezultat.opozorila.length} opozoril</summary>
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                  {d.rezultat.opozorila.slice(0, 100).map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </details>
            )}
          </SuccessText>
        ) : (
          <ErrorText>{d.rezultat.opis}</ErrorText>
        ))}

      <UvozDropzone
        naslov="Ročni uvoz"
        hint={`Povleci sem ${d.datoteka} ali klikni`}
        enota=""
        uvoz={null}
        nalagam={d.stanje === "uvazam"}
        onemogoceno={sync.delam}
        onFile={(f) => sync.uvoziRocno(d.kljuc, f)}
      />
    </section>
  );
}
