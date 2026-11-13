"use client";

import { useEffect, useState } from "react";
import { Tv } from "lucide-react";
import { formatDatumUra } from "@/lib/dates";
import type { StanjeTvKomponente } from "@/lib/tvObjava";
import { Modal } from "@/components/ui/Modal";

/** En izpis strani, ki se objavlja na FIN:TV (opis za okno TvPovezava). */
export type TvIzpis = {
  /** Ime izpisa, npr. "Delo - prejšnji dan". */
  naslov: string;
  /** Koda komponente v FinOS za izbran oddelek (fos_tv_viri.koda). */
  koda: string;
  /** Kaj je na strani TV. */
  vsebina: string;
  /** Oblika (PDF, velikost strani, koliko strani). */
  format: string;
  /** Kdaj se objavi (sync, Shrani …). */
  kdaj: string;
  /** Koliko časa ga TV kaže. */
  velja: string;
  /** Kje na strani se prenese isti PDF. */
  prenos: string;
};

/**
 * Povezava strani s FIN:TV (desno zgoraj, ob `PodatkiVir`): bel kvadratek z utripajočo ikono TV. Klik odpre okno,
 * ki pove, kateri izpisi strani gredo na TV, v kakšni obliki, kdaj se objavijo, koliko časa veljajo, kje se prenese
 * isti PDF ter stanje komponente v FinOS (vklopljena, zadnja objava). `oddelek` = ime izbranega oddelka.
 */
export function TvPovezava({ izpisi, oddelek }: { izpisi: TvIzpis[]; oddelek?: string }) {
  const [odprto, setOdprto] = useState(false);
  const hint = `Ta stran je povezana s FIN:TV (${izpisi.length} ${izpisi.length === 1 ? "izpis" : izpisi.length === 2 ? "izpisa" : "izpisi"}) - klikni za opis`;
  return (
    <>
      <button
        type="button"
        title={hint}
        aria-label={hint}
        onClick={() => setOdprto(true)}
        className="fp-card flex min-h-16 w-20 shrink-0 flex-col items-center justify-center gap-1 self-stretch px-2 py-2 text-xs transition-colors hover:border-ink-400 hover:bg-ink-50"
      >
        <Tv className="h-6 w-6 animate-pulse text-sync-500" aria-hidden />
        <span className="font-semibold text-ink-600">FIN:TV</span>
      </button>
      {odprto && <OknoTv izpisi={izpisi} oddelek={oddelek} onClose={() => setOdprto(false)} />}
    </>
  );
}

function OknoTv({ izpisi, oddelek, onClose }: { izpisi: TvIzpis[]; oddelek?: string; onClose: () => void }) {
  const [stanje, setStanje] = useState<StanjeTvKomponente[] | null>(null);
  const [napaka, setNapaka] = useState(false);
  useEffect(() => {
    let ziv = true;
    import("@/lib/tvObjava")
      .then(({ stanjeTvKomponent }) => stanjeTvKomponent(izpisi.map((i) => i.koda)))
      .then((s) => ziv && setStanje(s))
      .catch(() => ziv && setNapaka(true));
    return () => {
      ziv = false;
    };
  }, [izpisi]);

  return (
    <Modal open title={`FIN:TV${oddelek ? ` · ${oddelek}` : ""}`} onClose={onClose} sirina="max-w-2xl">
      <div className="flex flex-col gap-4 text-sm text-ink-700">
        <p>
          Izpisi te strani, ki se samodejno objavljajo na televizorjih FIN:TV. Vsak oddelek ima svojo komponento; vklopiš jo v{" "}
          <strong>FinOS → Administracija → FIN:TV → Komponente</strong> in jo tam dodaš v okno televizorja. Izklopljena komponenta se ne
          objavi. Objava = strani PDF kot slike 4K (3840 px), TV pokaže samo strani, ki veljajo danes.
        </p>
        {izpisi.map((iz) => {
          const s = stanje?.find((x) => x.koda === iz.koda);
          return (
            <section key={iz.koda} className="flex flex-col gap-2 rounded-xl border border-ink-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Tv className="h-4 w-4 text-sync-500" aria-hidden />
                <h3 className="mr-auto text-base font-bold text-ink-900">{iz.naslov}</h3>
                <Znacka s={s} nalagam={!stanje && !napaka} />
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                <Vrsta oznaka="Vsebina">{iz.vsebina}</Vrsta>
                <Vrsta oznaka="Oblika">{iz.format}</Vrsta>
                <Vrsta oznaka="Objava">{iz.kdaj}</Vrsta>
                <Vrsta oznaka="Na TV">{iz.velja}</Vrsta>
                <Vrsta oznaka="Prenos PDF">{iz.prenos}</Vrsta>
                <Vrsta oznaka="Zadnja objava">
                  {s?.zadnja ? `${formatDatumUra(s.zadnja.cas)} · ${s.zadnja.strani} ${s.zadnja.strani === 1 ? "stran" : "strani"} · ${s.zadnja.izvor}` : stanje ? "še ni objave" : "…"}
                </Vrsta>
                <Vrsta oznaka="Komponenta">
                  <span className="font-mono text-xs">{iz.koda}</span>
                </Vrsta>
              </dl>
            </section>
          );
        })}
        {napaka && <p className="text-xs text-ink-500">Stanja komponent ni mogoče prebrati (ni dostopa do FinOS).</p>}
      </div>
    </Modal>
  );
}

function Vrsta({ oznaka, children }: { oznaka: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-ink-500">{oznaka}</dt>
      <dd className="text-ink-800">{children}</dd>
    </>
  );
}

function Znacka({ s, nalagam }: { s: StanjeTvKomponente | undefined; nalagam: boolean }) {
  if (nalagam) return <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-500">…</span>;
  if (!s || s.vklopljena === null)
    return (
      <span className="rounded-full bg-nok-500 px-2 py-0.5 text-xs font-bold text-white" title="Komponente ni v FinOS (manjka migracija) ali ni dostopa">
        ni v FinOS
      </span>
    );
  return s.vklopljena ? (
    <span className="rounded-full bg-ok-500 px-2 py-0.5 text-xs font-bold text-white" title="Komponenta je vklopljena - objavlja se">
      vklopljena
    </span>
  ) : (
    <span className="rounded-full bg-ink-400 px-2 py-0.5 text-xs font-bold text-white" title="Komponenta je izklopljena v FinOS - nič se ne objavi">
      izklopljena
    </span>
  );
}
