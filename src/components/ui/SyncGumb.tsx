"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { preveriSync, sinhroniziraj, type SyncDatoteka, type SyncStanje } from "@/lib/sync";
import type { SyncDatotekaKljuc } from "@/lib/syncDatoteke";
import { Button } from "./Button";

type Skupno = "sinhronizirano" | "v_teku" | "ni_sinhronizirano";

const PIKA: Record<Skupno | SyncStanje, string> = {
  sinhronizirano: "bg-ok-500",
  v_teku: "bg-sync-500 animate-pulse",
  ni_sinhronizirano: "bg-nok-500",
  napaka: "bg-nok-500",
};

const OPIS: Record<SyncStanje, string> = {
  sinhronizirano: "Sinhronizirano",
  ni_sinhronizirano: "Nova datoteka - ni sinhronizirano",
  napaka: "Ni dosegljivo",
};

const casTxt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("sl-SI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "–";

/**
 * Ikona sync za stran: krogec pove stanje datotek s serverja (zelena = sinhronizirano, modra = sync v teku,
 * rdeča = ni sinhronizirano). Klik odpre seznam datotek strani in gumb Sync.
 * `samodejno` = ob prihodu na stran sinhronizira nove datoteke brez klika.
 */
export function SyncGumb({
  datoteke,
  samodejno = false,
  onSync,
}: {
  datoteke: SyncDatotekaKljuc[];
  samodejno?: boolean;
  /** Po uspešnem uvozu (npr. ponovno nalaganje podatkov strani). */
  onSync?: () => void;
}) {
  const [stanje, setStanje] = useState<SyncDatoteka[]>([]);
  const [delam, setDelam] = useState<"preverjam" | "sinhroniziram" | null>("preverjam");
  const [napaka, setNapaka] = useState<string | null>(null);
  const [rezultati, setRezultati] = useState<Partial<Record<SyncDatotekaKljuc, string>>>({});
  const [odprt, setOdprt] = useState(false);
  const okvir = useRef<HTMLDivElement>(null);
  const kljuci = datoteke.join(",");

  async function sinhronizirajVse(izbrane: SyncDatotekaKljuc[]) {
    setDelam("sinhroniziram");
    const nove: Partial<Record<SyncDatotekaKljuc, string>> = {};
    for (const k of izbrane) {
      try {
        nove[k] = `Uvoženo: ${await sinhroniziraj(k)}`;
      } catch (e) {
        nove[k] = `Napaka: ${(e as Error).message}`;
      }
    }
    setRezultati((r) => ({ ...r, ...nove }));
    try {
      setStanje(await preveriSync(datoteke));
    } catch (e) {
      setNapaka((e as Error).message);
    }
    setDelam(null);
    onSync?.();
  }

  // Ob prihodu na stran: preveri stanje (in po želji takoj sinhroniziraj nove datoteke)
  useEffect(() => {
    let preklicano = false;
    preveriSync(kljuci.split(",") as SyncDatotekaKljuc[])
      .then((s) => {
        if (preklicano) return;
        setStanje(s);
        setNapaka(null);
        const nove = s.filter((d) => d.stanje === "ni_sinhronizirano").map((d) => d.kljuc);
        if (samodejno && nove.length) sinhronizirajVse(nove);
        else setDelam(null);
      })
      .catch((e: Error) => {
        if (preklicano) return;
        setNapaka(e.message);
        setDelam(null);
      });
    return () => {
      preklicano = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- samo ob prihodu na stran / spremembi datotek
  }, [kljuci, samodejno]);

  // Klik izven okna ga zapre
  useEffect(() => {
    if (!odprt) return;
    const zapri = (e: MouseEvent) => {
      if (okvir.current && !okvir.current.contains(e.target as Node)) setOdprt(false);
    };
    document.addEventListener("mousedown", zapri);
    return () => document.removeEventListener("mousedown", zapri);
  }, [odprt]);

  const niSinhronizirano = stanje.filter((d) => d.stanje !== "sinhronizirano");
  const skupno: Skupno = delam ? "v_teku" : napaka || niSinhronizirano.length ? "ni_sinhronizirano" : "sinhronizirano";
  const hint =
    skupno === "v_teku"
      ? delam === "preverjam"
        ? "Preverjam datoteke na serverju"
        : "Sync v teku"
      : skupno === "sinhronizirano"
        ? "Vse datoteke so sinhronizirane"
        : `Ni sinhronizirano: ${napaka ? "server ni dosegljiv" : niSinhronizirano.map((d) => d.naslov).join(", ")}`;

  return (
    <div ref={okvir} className="relative inline-block">
      <button
        type="button"
        title={hint}
        aria-label={hint}
        aria-expanded={odprt}
        onClick={() => setOdprt(!odprt)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-white text-sync-600 shadow-sm transition-colors hover:bg-sync-50"
      >
        <RefreshCw className={`h-5 w-5 ${delam === "sinhroniziram" ? "animate-spin" : ""}`} aria-hidden />
        <span className={`absolute right-0 top-0 h-3 w-3 rounded-full ring-2 ring-white ${PIKA[skupno]}`} aria-hidden />
      </button>

      {odprt && (
        <div className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-ink-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-ink-900">Datoteke s serverja</span>
            <span className="text-xs text-ink-500">{hint}</span>
          </div>
          {napaka && <p className="mb-2 rounded-lg bg-nok-50 px-2 py-1.5 text-xs font-semibold text-nok-600">{napaka}</p>}
          <ul className="flex flex-col divide-y divide-ink-100">
            {stanje.map((d) => (
              <li key={d.kljuc} className="flex gap-2 py-2 text-xs">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${PIKA[d.stanje]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-ink-900">{d.naslov}</span>
                    <span className="font-mono text-ink-500">{d.datoteka}</span>
                  </div>
                  <div className={d.stanje === "sinhronizirano" ? "text-ok-600" : "font-semibold text-nok-600"}>
                    {d.napaka ?? OPIS[d.stanje]}
                  </div>
                  <div className="text-ink-600">
                    Izvoz na serverju: {casTxt(d.spremenjena)} · uvoženo: {d.uvozeno ? casTxt(d.uvozeno) : "še ni uvoza"}
                  </div>
                  {rezultati[d.kljuc] && <div className="text-ink-500">{rezultati[d.kljuc]}</div>}
                </div>
              </li>
            ))}
            {stanje.length === 0 && !delam && <li className="py-2 text-xs text-ink-500">Ni podatkov o datotekah.</li>}
          </ul>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              hint="Ponovno uvozi vse datoteke s serverja"
              variant="sync"
              disabled={!!delam || stanje.every((d) => !d.obstaja)}
              onClick={() => sinhronizirajVse(stanje.filter((d) => d.obstaja).map((d) => d.kljuc))}
            >
              Uvozi vse znova
            </Button>
            <Button
              hint="Uvozi nove datoteke s serverja"
              variant="sync"
              icon={RefreshCw}
              disabled={!!delam || niSinhronizirano.every((d) => !d.obstaja)}
              onClick={() => sinhronizirajVse(niSinhronizirano.filter((d) => d.obstaja).map((d) => d.kljuc))}
            >
              Sync
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
