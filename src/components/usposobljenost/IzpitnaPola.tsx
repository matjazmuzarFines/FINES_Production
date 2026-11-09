"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Save, Trash2 } from "lucide-react";
import { toIso } from "@/lib/dates";
import {
  MATRIKE,
  STOPNJE,
  casZaVnos,
  formatCas,
  imeZaposlenega,
  izbrisiOceno,
  oznakaTermina,
  shraniOceno,
  terminNaDan,
  trenutneOcene,
  type Ocena,
  type Podatki,
  type Stolpec,
  type Termin,
  type Zaposleni,
} from "@/lib/usposobljenost";
import { Button } from "@/components/ui/Button";
import { DaNe, Lestvica, type DaNeVrednost } from "@/components/ui/Choice";
import { FilterPolje } from "@/components/ui/Filtri";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CelicaStopnje } from "./Finesek";

const POLJE =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 sm:text-sm";

export type VnosPole = { zaposleni: Zaposleni; stolpec: Stolpec; termin?: Termin | null };

const STOPNJE_LESTVICE = STOPNJE.map((s) => ({ value: s.value, opis: `${s.naziv} - ${s.opis.toLowerCase()}` }));

function Stopnja({ vrednost }: { vrednost: number | null }) {
  return <CelicaStopnje stopnja={vrednost} sirina={112} />;
}

function Glava({ zaposleni, stolpec, termin }: { zaposleni: string; stolpec: Stolpec; termin: string }) {
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-lg bg-ink-50 p-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-ink-500">Zaposleni</dt>
        <dd className="font-bold text-ink-900">{zaposleni}</dd>
      </div>
      <div>
        <dt className="text-xs text-ink-500">{MATRIKE[stolpec.matrika].label}</dt>
        <dd className="font-bold text-ink-900">{stolpec.naziv}</dd>
      </div>
      <div>
        <dt className="text-xs text-ink-500">Termin</dt>
        <dd className="font-bold text-ink-900">{termin}</dd>
      </div>
    </dl>
  );
}

/** Izpitna pola: nova ocena zaposlenega za delovno mesto ali družino. */
export function IzpitnaPola({ vnos, podatki, onClose, onShranjeno }: { vnos: VnosPole; podatki: Podatki; onClose: () => void; onShranjeno: () => void }) {
  const notify = useToast();
  const { zaposleni, stolpec } = vnos;
  const trenutna = trenutneOcene(podatki.ocene).za(zaposleni.id, stolpec.id);
  const prej = trenutna?.ocena ?? null;
  const [cas, setCas] = useState(() => casZaVnos());
  const [ocenjevalec, setOcenjevalec] = useState(podatki.ime);
  const [rezultat, setRezultat] = useState<DaNeVrednost | null>(null);
  const [ocena, setOcena] = useState<number | null>(null);
  const [razlogi, setRazlogi] = useState("");
  const [komentar, setKomentar] = useState("");
  const [delam, setDelam] = useState(false);

  const termin = vnos.termin ?? (cas ? terminNaDan(zaposleni.id, stolpec.id, podatki.termini, toIso(new Date(cas))) : null);
  const ni = rezultat === "NE";
  const nova = ni ? prej : ocena;
  const manjka = !cas
    ? "Vpiši čas izpita"
    : !ocenjevalec.trim()
      ? "Vpiši ocenjevalca"
      : !rezultat
        ? "Izberi rezultat izpita"
        : !ni && ocena === null
          ? "Izberi stopnjo"
          : ni && !razlogi.trim()
            ? "Vpiši razloge za neopravljen izpit"
            : null;

  async function shrani() {
    setDelam(true);
    try {
      await shraniOceno({
        zaposleni: zaposleni.id,
        stolpec: stolpec.id,
        termin: termin?.id ?? null,
        cas: new Date(cas).toISOString(),
        ocenjevalec,
        opravil: !ni,
        ocena: ni ? null : ocena,
        razlogi,
        komentar,
      });
      notify("success", "Ocena je shranjena.");
      onShranjeno();
    } catch (e) {
      notify("error", (e as Error).message, 10000);
      setDelam(false);
    }
  }

  async function izbrisi() {
    if (!trenutna || !window.confirm(`Izbrišem oceno ${prej} za ${imeZaposlenega(zaposleni)} (${stolpec.naziv})?`)) return;
    setDelam(true);
    try {
      await izbrisiOceno(trenutna.id);
      notify("success", "Ocena je izbrisana.");
      onShranjeno();
    } catch (e) {
      notify("error", (e as Error).message, 10000);
      setDelam(false);
    }
  }

  return (
    <Modal
      open
      title="Izpitna pola"
      onClose={onClose}
      sirina="max-w-2xl"
      noga={
        <div className="flex flex-wrap justify-end gap-2">
          {trenutna && (
            <Button variant="danger" icon={Trash2} disabled={delam} hint="Izbriši trenutno oceno te osebe" className="mr-auto" onClick={izbrisi}>
              Izbriši oceno
            </Button>
          )}
          <Button variant="neutral" hint="Zapri brez shranjevanja" onClick={onClose}>
            Prekliči
          </Button>
          <Button variant="success" icon={Save} disabled={!!manjka || delam} hint={manjka ?? "Shrani oceno v zgodovino izobraževanj"} onClick={shrani}>
            Shrani oceno
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Glava zaposleni={imeZaposlenega(zaposleni)} stolpec={stolpec} termin={termin ? oznakaTermina(termin) : "Izven termina"} />

        <div className="grid gap-3 sm:grid-cols-2">
          <FilterPolje label="Čas izpita *">
            <input type="datetime-local" value={cas} onChange={(e) => setCas(e.target.value)} title="Datum in ura izpita" className={POLJE} />
          </FilterPolje>
          <FilterPolje label="Ocenjevalec *">
            <input value={ocenjevalec} onChange={(e) => setOcenjevalec(e.target.value)} title="Kdo je izvedel ocenjevanje" className={POLJE} />
          </FilterPolje>
        </div>

        <FilterPolje label="Rezultat - izpit opravljen? *">
          <DaNe value={rezultat} subject="Izpit opravljen" onChange={setRezultat} />
        </FilterPolje>

        <FilterPolje label="Nova stopnja *">
          <Lestvica value={nova} stopnje={STOPNJE_LESTVICE} subject="Stopnja" onChange={setOcena} zaklenjena={ni ? "Pri neopravljenem izpitu stopnja ostane enaka" : undefined} />
        </FilterPolje>

        <div className="flex items-center justify-center gap-4 rounded-lg border border-ink-200 p-3" title="Primerjava trenutne in nove stopnje">
          <span className="flex flex-col items-center gap-1 text-xs text-ink-500">
            Trenutno <Stopnja vrednost={prej} />
          </span>
          <ArrowRight className="h-6 w-6 text-fines-500" aria-hidden />
          <span className="flex flex-col items-center gap-1 text-xs text-ink-500">
            Po izpitu <Stopnja vrednost={nova} />
          </span>
        </div>

        <FilterPolje label={ni ? "Razlogi *" : "Razlogi za oceno"}>
          <textarea value={razlogi} onChange={(e) => setRazlogi(e.target.value)} rows={3} title="Zakaj je zaposleni dobil to oceno" className={POLJE} />
        </FilterPolje>
        <FilterPolje label="Komentar">
          <textarea value={komentar} onChange={(e) => setKomentar(e.target.value)} rows={2} title="Dodatne opombe k izpitu" className={POLJE} />
        </FilterPolje>
      </div>
    </Modal>
  );
}

function Vrstica({ naslov, children }: { naslov: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-ink-500">{naslov}</div>
      <div className="whitespace-pre-wrap text-sm text-ink-900">{children}</div>
    </div>
  );
}

/** Ogled izpitne pole iz zgodovine (zapisi se ne spreminjajo; popravek je nova ocena). */
export function IzpitnaPolaOgled({ ocena, podatki, onClose, onIzbrisano }: { ocena: Ocena; podatki: Podatki; onClose: () => void; onIzbrisano: () => void }) {
  const notify = useToast();
  const [delam, setDelam] = useState(false);
  const z = podatki.zaposleni.find((x) => x.id === ocena.zaposleni_id);
  const s = podatki.stolpci.find((x) => x.id === ocena.stolpec_id);
  const t = podatki.termini.find((x) => x.id === ocena.termin_id);
  async function izbrisi() {
    if (!window.confirm("Izbrišem to oceno iz zgodovine?")) return;
    setDelam(true);
    try {
      await izbrisiOceno(ocena.id);
      notify("success", "Ocena je izbrisana.");
      onIzbrisano();
    } catch (e) {
      notify("error", (e as Error).message, 10000);
      setDelam(false);
    }
  }

  return (
    <Modal
      open
      title="Izpitna pola"
      onClose={onClose}
      sirina="max-w-2xl"
      noga={
        <Button variant="danger" icon={Trash2} disabled={delam} hint="Izbriši to oceno iz zgodovine" onClick={izbrisi}>
          Izbriši oceno
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {s && <Glava zaposleni={z ? imeZaposlenega(z) : "-"} stolpec={s} termin={t ? oznakaTermina(t) : "Izven termina"} />}
        <div className="flex items-center justify-center gap-4 rounded-lg border border-ink-200 p-3">
          <span className="flex flex-col items-center gap-1 text-xs text-ink-500">
            Prej <Stopnja vrednost={ocena.prejsnja_ocena} />
          </span>
          <ArrowRight className="h-6 w-6 text-fines-500" aria-hidden />
          <span className="flex flex-col items-center gap-1 text-xs text-ink-500">
            Po izpitu <Stopnja vrednost={ocena.ocena} />
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Vrstica naslov="Čas">{formatCas(ocena.cas)}</Vrstica>
          <Vrstica naslov="Ocenjevalec">{ocena.ocenjevalec}</Vrstica>
          <Vrstica naslov="Rezultat">{ocena.opravil ? "Opravil" : "Ni opravil"}</Vrstica>
        </div>
        <Vrstica naslov="Razlogi">{ocena.razlogi || "-"}</Vrstica>
        <Vrstica naslov="Komentar">{ocena.komentar || "-"}</Vrstica>
      </div>
    </Modal>
  );
}
