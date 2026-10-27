"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Printer } from "lucide-react";
import { formatShort, type IsoDate } from "@/lib/dates";
import { ujemaIskanje } from "@/lib/iskanje";
import { naloziMaterial, preberiMaterialXlsx, shraniMaterialUvoz, type Material, type MaterialUvoz, type MaterialUvozPregled } from "@/lib/material";
import {
  BARVE_LISTOV,
  IME_KATEGORIJE,
  KATEGORIJE,
  NASTAVITVE_PAKIRANJA,
  PRIVZETO_PDF,
  PRIVZETO_SKLADISCE,
  barvaPoKodi,
  naloziPrintano,
  shraniPrintano,
  odpremeZaPakiranje,
  skladisceTxt,
  skupinePostavk,
  steviloListov,
  type Kategorija,
  type BarvaLista,
  type ListiLokacije,
  type NastavitvePdf,
  type NastavitveSkladisca,
  type OdpremaPak,
  type PostavkaPak,
  type Printano,
} from "@/lib/pakiranje";
import {
  danesIso,
  naloziZadnjiOdpUvoz,
  preberiVd300Xlsx,
  shraniOdpUvoz,
  type OdpUvoz,
  type OdpUvozPregled,
  type Odprema,
} from "@/lib/prioritete";
import { formatNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { FilterKartica, type KarticaBarva } from "@/components/ui/FilterKartica";
import { FilterCheckbox, FilterIskanje, FilterPolje, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { Izvoz } from "@/components/ui/Izvoz";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { TxtSporocilo } from "@/components/ui/TxtSporocilo";
import { UvozDropzone } from "@/components/ui/UvozDropzone";

type Kljuc = "stevilka" | "partner" | "lokacija" | "datum" | "status" | "peci" | "postavk" | "zaloga" | "printano";
type PeciFilter = "vsi" | "s" | "brez";
type ZalogaFilter = "vsi" | "manjka" | "ok";

const STATUS_BARVE: Record<string, KarticaBarva> = {
  odprt: { trak: "bg-ink-500", aktivna: "border-ink-500 bg-ink-100", ikona: "text-ink-600" },
  priprava: { trak: "bg-sync-500", aktivna: "border-sync-500 bg-sync-50", ikona: "text-sync-500" },
  pripravljena: { trak: "bg-ok-500", aktivna: "border-ok-500 bg-ok-50", ikona: "text-ok-500" },
  ostalo: { trak: "bg-warn-500", aktivna: "border-warn-500 bg-warn-50", ikona: "text-warn-500" },
};
const barvaStatusa = (s: string) => {
  const t = s.toLowerCase();
  return STATUS_BARVE[t.includes("pripravljena") ? "pripravljena" : t.includes("priprava") ? "priprava" : t.includes("odprt") ? "odprt" : "ostalo"];
};
const BREZ_STATUSA = "Brez statusa";

/** Napaka, ko tabele v bazi še niso ustvarjene. */
const niTabel = (m: string) => /fp_pri_|spl_material|does not exist|schema cache/i.test(m);

async function pridobiPodatke() {
  const odp = await naloziZadnjiOdpUvoz().then(
    (x) => ({ ...x, niTabel: false }),
    (e: Error) => {
      if (!niTabel(e.message)) throw e;
      return { uvoz: null, odpreme: [] as Odprema[], pakiranje: true, niTabel: true };
    },
  );
  const mat = await naloziMaterial().then(
    (x) => ({ ...x, niTabel: false }),
    (e: Error) => {
      if (!niTabel(e.message)) throw e;
      return { uvoz: null, material: new Map<string, Material>(), niTabel: true };
    },
  );
  // Tabela natisnjenih odprem (SQL 022) - brez nje stran deluje, stolpec Printano ostane prazen
  const printano = await naloziPrintano().then(
    (m) => ({ m, niTabele: false }),
    (e: Error) => {
      if (!/fp_pak_printano|does not exist|schema cache/i.test(e.message)) throw e;
      return { m: new Map<string, Printano>(), niTabele: true };
    },
  );
  return { odp, mat, printano };
}
type Podatki = Awaited<ReturnType<typeof pridobiPodatke>>;

function preberiNastavitve(): NastavitvePdf {
  try {
    const s = JSON.parse(localStorage.getItem(NASTAVITVE_PAKIRANJA) ?? "null") as Partial<NastavitvePdf> | null;
    return { ...PRIVZETO_PDF, ...(s ?? {}) };
  } catch {
    return PRIVZETO_PDF;
  }
}

export function Pakiranje() {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <PakiranjeInner />;
}

function PakiranjeInner() {
  const notify = useToast();
  const danes = danesIso();

  const [nalozeno, setNalozeno] = useState(false);
  const [odpUvoz, setOdpUvoz] = useState<OdpUvoz | null>(null);
  const [odpreme, setOdpreme] = useState<Odprema[]>([]);
  const [stolpciPakiranja, setStolpciPakiranja] = useState(true);
  const [niOdpremTabel, setNiOdpremTabel] = useState(false);
  const [matUvoz, setMatUvoz] = useState<MaterialUvoz | null>(null);
  const [material, setMaterial] = useState<Map<string, Material>>(new Map());
  const [niMaterialTabel, setNiMaterialTabel] = useState(false);
  const [printano, setPrintano] = useState<Map<string, Printano>>(new Map());
  const [niPrintanoTabele, setNiPrintanoTabele] = useState(false);

  // Filtri
  const [iskanje, setIskanje] = useState("");
  const [kupci, setKupci] = useState<string[]>([]);
  const [datumi, setDatumi] = useState<string[]>([]);
  const [izkljuceniStatusi, setIzkljuceniStatusi] = useState<string[]>([]);
  const [peciFilter, setPeciFilter] = useState<PeciFilter>("vsi");
  const [zalogaFilter, setZalogaFilter] = useState<ZalogaFilter>("vsi");

  const [izbrane, setIzbrane] = useState<Set<string>>(new Set());
  const [razprte, setRazprte] = useState<Set<string>>(new Set());
  const [pdfOdprt, setPdfOdprt] = useState(false);
  const [skladisceOdprt, setSkladisceOdprt] = useState(false);
  // Stran pokaže Loading, dokler podatki niso naloženi - branje localStorage ob inicializaciji je varno
  const [nastPdf, setNastPdf] = useState<NastavitvePdf>(() => preberiNastavitve());
  const [nastSkl, setNastSkl] = useState<NastavitveSkladisca>(PRIVZETO_SKLADISCE);
  /** Barva lista za posamezno odpremo (izbere jo vodja v oknu PDF); privzeto prva razpoložljiva barva. */
  const [barveOdprem, setBarveOdprem] = useState<Record<string, string>>({});

  // Uvoz
  const [vd300Pregled, setVd300Pregled] = useState<(OdpUvozPregled & { datoteka: string }) | null>(null);
  const [matPregled, setMatPregled] = useState<(MaterialUvozPregled & { datoteka: string }) | null>(null);
  const [uvazam, setUvazam] = useState<"vd300" | "material" | null>(null);

  function uporabi(p: Podatki) {
    setOdpUvoz(p.odp.uvoz);
    setOdpreme(p.odp.odpreme);
    setStolpciPakiranja(p.odp.pakiranje);
    setNiOdpremTabel(p.odp.niTabel);
    setMatUvoz(p.mat.uvoz);
    setMaterial(p.mat.material);
    setNiMaterialTabel(p.mat.niTabel);
    setPrintano(p.printano.m);
    setNiPrintanoTabele(p.printano.niTabele);
  }

  const naloziVse = async () => uporabi(await pridobiPodatke());

  useEffect(() => {
    let preklic = false;
    pridobiPodatke()
      .then((p) => !preklic && uporabi(p))
      .catch((e) => notify("error", `Napaka pri nalaganju odprem: ${(e as Error).message}`, 10000))
      .finally(() => !preklic && setNalozeno(true));
    return () => {
      preklic = true;
    };
  }, [notify]);

  const vse = useMemo(() => odpremeZaPakiranje(odpreme, material), [odpreme, material]);

  const sort = useRazvrscanje<OdpremaPak, Kljuc>({
    stevilka: (d) => d.stevilka,
    partner: (d) => d.partner,
    lokacija: (d) => d.lokacija,
    datum: (d) => d.datum,
    status: (d) => d.status,
    peci: (d) => d.peci,
    postavk: (d) => d.stPostavk,
    zaloga: (d) => (d.vseIzdano ? -1 : d.manjka),
    printano: (d) => printano.get(d.stevilka)?.zadnjic_at ?? null,
  });

  /** Po prenosu PDF: zapiši barvo lista za vsako natisnjeno odpremo. */
  async function zapisiPrintano(odpremeTiska: OdpremaPak[], barva: (d: OdpremaPak) => BarvaLista) {
    if (niPrintanoTabele) return;
    try {
      const vrstice = await shraniPrintano(
        odpremeTiska.map((d) => ({ stevilka: d.stevilka, barva: barva(d).koda })),
        printano,
      );
      setPrintano((m) => {
        const n = new Map(m);
        for (const v of vrstice) n.set(v.stevilka, v);
        return n;
      });
    } catch (e) {
      notify("error", `PDF je prenesen, oznaka Printano ni shranjena: ${(e as Error).message}`, 10000);
    }
  }

  function shraniNastPdf(n: Partial<NastavitvePdf>) {
    const nove = { ...nastPdf, ...n };
    setNastPdf(nove);
    try {
      localStorage.setItem(NASTAVITVE_PAKIRANJA, JSON.stringify(nove));
    } catch {
      // brez shrambe velja do osvežitve
    }
  }

  async function izberiVd300(f: File) {
    try {
      setVd300Pregled({ ...(await preberiVd300Xlsx(f)), datoteka: f.name });
    } catch (e) {
      notify("error", (e as Error).message, 10000);
    }
  }

  async function izberiMaterial(f: File) {
    try {
      setMatPregled({ ...(await preberiMaterialXlsx(f)), datoteka: f.name });
    } catch (e) {
      notify("error", (e as Error).message, 10000);
    }
  }

  async function potrdi(tip: "vd300" | "material") {
    setUvazam(tip);
    try {
      if (tip === "vd300" && vd300Pregled) {
        await shraniOdpUvoz(vd300Pregled.datoteka, vd300Pregled.odpreme);
        notify("success", `Uvoženih postavk odprem: ${vd300Pregled.odpreme.length} (velja tudi za Prioritete).`);
        setVd300Pregled(null);
      } else if (tip === "material" && matPregled) {
        await shraniMaterialUvoz(matPregled.datoteka, matPregled.material);
        notify("success", `Uvoženih artiklov materiala: ${matPregled.material.length}.`);
        setMatPregled(null);
      }
      await naloziVse();
    } catch (e) {
      notify("error", `Napaka pri uvozu: ${(e as Error).message}`, 10000);
    } finally {
      setUvazam(null);
    }
  }

  if (!nalozeno) return <Loading />;

  // ---- filtri
  const statusOdpreme = (d: OdpremaPak) => d.status ?? BREZ_STATUSA;
  const vsiStatusi = [...new Set(vse.map(statusOdpreme))].sort();
  const vsiKupci = [...new Set(vse.map((d) => d.partner ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "sl"));
  const datumTxt = (iso: IsoDate | null) => (iso ? formatShort(iso) : "Brez datuma");
  const vsiDatumi = [...new Set(vse.map((d) => d.datum ?? ""))].sort().map((x) => datumTxt(x || null));

  const osnova = vse.filter(
    (d) =>
      (kupci.length === 0 || kupci.includes(d.partner ?? "")) &&
      (datumi.length === 0 || datumi.includes(datumTxt(d.datum))) &&
      (peciFilter === "vsi" || (peciFilter === "s" ? d.peci > 0 : d.peci === 0)) &&
      (zalogaFilter === "vsi" || (zalogaFilter === "manjka" ? d.manjka > 0 : d.manjka === 0)) &&
      ujemaIskanje(iskanje, [d.stevilka, d.partner, d.lokacija, d.narocilo, d.kupcevo_narocilo, ...d.postavke.flatMap((p) => [p.ident, p.opis])]),
  );
  const prikazane = sort.razvrsti(osnova.filter((d) => !izkljuceniStatusi.includes(statusOdpreme(d))));

  // Izbrane odpreme v vrstnem redu tabele (skrite s filtri na koncu) - ta vrstni red velja za barve in PDF
  const izbraneOdpreme = [...prikazane.filter((d) => izbrane.has(d.stevilka)), ...sort.razvrsti(vse).filter((d) => izbrane.has(d.stevilka) && !prikazane.includes(d))];
  const skritihIzbranih = izbraneOdpreme.filter((d) => !prikazane.includes(d)).length;
  const barvaOdpreme = (d: OdpremaPak): BarvaLista =>
    barvaPoKodi(nastPdf.barve.includes(barveOdprem[d.stevilka]) ? barveOdprem[d.stevilka] : nastPdf.barve[0]);
  const peciIzbranih = izbraneOdpreme.reduce((s, d) => s + d.peci, 0);
  const vsePrikazaneIzbrane = prikazane.length > 0 && prikazane.every((d) => izbrane.has(d.stevilka));

  const preklopi = (set: Set<string>, k: string) => {
    const n = new Set(set);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  };

  const brezLokacij = stolpciPakiranja && vse.length > 0 && vse.every((d) => !d.lokacija) && vse.every((d) => d.postavke.every((p) => !p.oddelek));
  const zalogaIz = matUvoz ? "izpis materiala" : "izvoz VD300";

  return (
    <div className="flex flex-col gap-4">
      {/* ============ GLAVA + UVOZ ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Pakiranje odprem</h2>
          <p className="text-sm text-ink-500">
            Odprte odpreme VD300 · označi odpreme in natisni navodila za pakiranje (checklista + list z lokacijo) ali
            pripravi povzetek za skladišče
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <div className="sm:w-72">
            <UvozDropzone
              naslov="Odpreme VD300 (.xlsx)"
              hint={niOdpremTabel ? "Najprej zaženi SQL 009 (tabele odprem)" : "Povleci sem celoten izvoz odprem VD300 ali klikni"}
              enota="postavk"
              uvoz={odpUvoz ? { ...odpUvoz, stevilo: odpUvoz.st_postavk } : null}
              nalagam={uvazam === "vd300"}
              onemogoceno={niOdpremTabel || uvazam !== null}
              onFile={izberiVd300}
            />
          </div>
          <div className="sm:w-72">
            <UvozDropzone
              naslov="Material (.xlsx)"
              hint={niMaterialTabel ? "Najprej zaženi SQL 018 (tabela materiala)" : "Povleci sem izpis materiala (zaloge) ali klikni"}
              enota="artiklov"
              uvoz={matUvoz ? { ...matUvoz, stevilo: matUvoz.st_postavk } : null}
              nalagam={uvazam === "material"}
              onemogoceno={niMaterialTabel || uvazam !== null}
              onFile={izberiMaterial}
            />
          </div>
        </div>
      </div>

      {/* ============ OPOZORILA ============ */}
      {!stolpciPakiranja && (
        <WarningText>
          V bazi še ni stolpcev za pakiranje (lokacija, skupine). V Supabase SQL editorju zaženi{" "}
          <code className="rounded bg-white px-1">supabase/migrations/021_odpreme_pakiranje.sql</code> in znova uvozi odpreme VD300.
        </WarningText>
      )}
      {niPrintanoTabele && (
        <WarningText>
          Za stolpec Printano v Supabase SQL editorju zaženi{" "}
          <code className="rounded bg-white px-1">supabase/migrations/022_pakiranje_printano.sql</code> in osveži stran.
        </WarningText>
      )}
      {brezLokacij && (
        <WarningText>Zadnji uvoz odprem nima lokacij in skupin postavk - odpreme VD300 uvozi znova.</WarningText>
      )}

      {!odpUvoz ? (
        <div className="fp-card p-8 text-center text-ink-600">
          Ni uvoza odprem. Povleci izvoz odprem VD300 v polje desno zgoraj (isti uvoz kot na Prioritetah).
        </div>
      ) : (
        <>
          {/* ============ KARTICE: STATUS ODPREME ============ */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {vsiStatusi.map((s) => {
              const xs = osnova.filter((d) => statusOdpreme(d) === s);
              const aktivna = !izkljuceniStatusi.includes(s);
              return (
                <FilterKartica
                  key={s}
                  aktivna={aktivna}
                  onClick={() => setIzkljuceniStatusi((v) => (aktivna ? [...v, s] : v.filter((x) => x !== s)))}
                  hint={`${aktivna ? "Skrij" : "Prikaži"} odpreme s statusom ${s}`}
                  barva={barvaStatusa(s)}
                  naslov={s}
                  podnaslov={`${xs.length} odprem · ${formatNum(xs.reduce((a, d) => a + d.peci, 0))} peči`}
                />
              );
            })}
          </div>

          {/* ============ FILTRI + IZVOZ ============ */}
          <div className="fp-card flex flex-col gap-3 p-3 sm:p-4">
            <FilterVrstica>
              <FilterIskanje
                value={iskanje}
                onChange={setIskanje}
                placeholder="Odprema, kupec, lokacija, ident ..."
                hint="Išči po odpremi, kupcu, lokaciji, artiklu"
              />
              <div className="w-full sm:w-60">
                <MultiSelect label="Kupec" options={vsiKupci} value={kupci} onChange={setKupci} hint="Filtriraj odpreme po kupcu" />
              </div>
              <div className="w-full sm:w-48">
                <MultiSelect label="Datum odpreme" options={vsiDatumi} value={datumi} onChange={setDatumi} hint="Filtriraj po datumu odpreme" />
              </div>
              <FilterPreklopnik
                label="Peči"
                value={peciFilter}
                onChange={setPeciFilter}
                options={[
                  { value: "vsi", label: "Vse", hint: "Prikaži vse odpreme" },
                  { value: "s", label: "S pečmi", hint: "Samo odpreme, ki imajo peči" },
                  { value: "brez", label: "Brez peči", hint: "Samo odpreme brez peči" },
                ]}
              />
              <FilterPreklopnik
                label={`Zaloga (${zalogaIz})`}
                value={zalogaFilter}
                onChange={setZalogaFilter}
                options={[
                  { value: "vsi", label: "Vse", hint: "Prikaži vse odpreme" },
                  { value: "manjka", label: "Manjka", hint: "Odpreme, kjer zaloga ne pokrije vsega" },
                  { value: "ok", label: "Na zalogi", hint: "Odpreme, ki jih zaloga v celoti pokrije" },
                ]}
              />
              <FilterPolje label="Prikaz">
                <Button
                  hint="Ponastavi vse filtre na privzete"
                  variant="neutral"
                  onClick={() => {
                    setIskanje("");
                    setKupci([]);
                    setDatumi([]);
                    setIzkljuceniStatusi([]);
                    setPeciFilter("vsi");
                    setZalogaFilter("vsi");
                  }}
                >
                  Ponastavi filtre
                </Button>
              </FilterPolje>
            </FilterVrstica>

            <div className="flex flex-wrap items-end gap-3 border-t border-ink-100 pt-3">
              <FilterPolje label="Izbor">
                <div className="flex flex-wrap gap-2">
                  <Button
                    hint={vsePrikazaneIzbrane ? "Odznači vse prikazane odpreme" : "Označi vse prikazane odpreme"}
                    variant="neutral"
                    disabled={prikazane.length === 0}
                    onClick={() =>
                      setIzbrane((s) => {
                        const n = new Set(s);
                        for (const d of prikazane) {
                          if (vsePrikazaneIzbrane) n.delete(d.stevilka);
                          else n.add(d.stevilka);
                        }
                        return n;
                      })
                    }
                  >
                    {vsePrikazaneIzbrane ? "Odznači prikazane" : "Izberi prikazane"}
                  </Button>
                  <Button hint="Počisti izbor vseh odprem" variant="neutral" disabled={izbrane.size === 0} onClick={() => setIzbrane(new Set())}>
                    Počisti izbor
                  </Button>
                </div>
              </FilterPolje>
              <div className="mr-auto self-center text-sm text-ink-700" title="Število izbranih odprem in peči">
                Izbranih: <b className="tabular-nums">{izbraneOdpreme.length}</b> odprem · <b className="tabular-nums">{formatNum(peciIzbranih)}</b> peči
                {skritihIzbranih > 0 && <span className="text-warn-700"> (od tega {skritihIzbranih} skritih s filtri)</span>}
              </div>
              <Izvoz
                spomin="pakiranje"
                formati={[
                  {
                    koda: "pdf",
                    label: "PDF - navodila za pakiranje",
                    hint: "Natisni checkliste in liste z lokacijo",
                    akcija: () => setPdfOdprt(true),
                    disabled: izbraneOdpreme.length === 0,
                    zakaj: "Najprej označi odpreme v tabeli",
                  },
                  {
                    koda: "txt",
                    label: "TXT - povzetek za skladišče",
                    hint: "Pripravi seznam za nabiranje v skladišču",
                    akcija: () => setSkladisceOdprt(true),
                    disabled: izbraneOdpreme.length === 0,
                    zakaj: "Najprej označi odpreme v tabeli",
                  },
                ]}
              />
            </div>
          </div>

          {/* ============ TABELA ODPREM ============ */}
          <div className="fp-card p-3 sm:p-4">
            <TabelaOkvir>
              <table className="w-full min-w-[960px] text-sm">
                <thead className="fp-thead">
                  <tr className="text-left text-xs font-bold">
                    <th className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={vsePrikazaneIzbrane}
                        disabled={prikazane.length === 0}
                        onChange={() =>
                          setIzbrane((s) => {
                            const n = new Set(s);
                            for (const d of prikazane) {
                              if (vsePrikazaneIzbrane) n.delete(d.stevilka);
                              else n.add(d.stevilka);
                            }
                            return n;
                          })
                        }
                        title="Označi / odznači vse prikazane odpreme"
                        aria-label="Označi vse prikazane"
                        className="h-4 w-4 accent-fines-500"
                      />
                    </th>
                    <th className="w-8 px-1 py-2" aria-label="Razpri" />
                    <SortTh sort={sort} kljuc="stevilka">Odprema</SortTh>
                    <SortTh sort={sort} kljuc="datum">Datum</SortTh>
                    <SortTh sort={sort} kljuc="partner">Kupec</SortTh>
                    <SortTh sort={sort} kljuc="lokacija">Lokacija</SortTh>
                    <SortTh sort={sort} kljuc="status">Status</SortTh>
                    <SortTh sort={sort} kljuc="peci" desno>Peči</SortTh>
                    <SortTh sort={sort} kljuc="postavk" desno>Postavk</SortTh>
                    <SortTh sort={sort} kljuc="zaloga" hint="Razvrsti po številu postavk, ki jih ni na zalogi">Zaloga</SortTh>
                    <SortTh sort={sort} kljuc="printano" hint="Razvrsti po času zadnjega tiska PDF">Printano</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {prikazane.map((d) => {
                    const izbrana = izbrane.has(d.stevilka);
                    const razprta = razprte.has(d.stevilka);
                    const zapadla = !!d.datum && d.datum < danes;
                    return (
                      <Fragment key={d.stevilka}>
                        <tr
                          className={`cursor-pointer border-b border-ink-100 ${izbrana ? "bg-fines-50 hover:bg-fines-100" : "hover:bg-ink-50"}`}
                          onClick={() => setIzbrane((s) => preklopi(s, d.stevilka))}
                          title={izbrana ? "Odstrani odpremo iz izbora" : "Dodaj odpremo v izbor"}
                        >
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={izbrana}
                              onChange={() => setIzbrane((s) => preklopi(s, d.stevilka))}
                              title={izbrana ? "Odstrani odpremo iz izbora" : "Dodaj odpremo v izbor"}
                              aria-label={`Izberi odpremo ${d.stevilka}`}
                              className="h-4 w-4 accent-fines-500"
                            />
                          </td>
                          <td className="px-1 py-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              title={razprta ? "Skrij postavke odpreme" : "Pokaži postavke odpreme"}
                              aria-expanded={razprta}
                              onClick={() => setRazprte((s) => preklopi(s, d.stevilka))}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-fines-500"
                            >
                              {razprta ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                            </button>
                          </td>
                          <td className="px-2 py-2 font-mono">{d.stevilka}</td>
                          <td className={`whitespace-nowrap px-2 py-2 tabular-nums ${zapadla ? "font-semibold text-nok-600" : ""}`} title={zapadla ? "Datum odpreme je že mimo" : undefined}>
                            {datumTxt(d.datum)}
                          </td>
                          <td className="px-2 py-2">{d.partner ?? "–"}</td>
                          <td className="px-2 py-2 font-semibold">{d.lokacija ?? <span className="text-xs font-normal text-warn-700" title="V VD300 ni vpisane lokacije">ni vpisana</span>}</td>
                          <td className="px-2 py-2">
                            <StatusZnacka status={statusOdpreme(d)} />
                          </td>
                          <td className="px-2 py-2 text-right font-bold tabular-nums">{d.peci ? formatNum(d.peci) : <span className="font-normal text-ink-400">–</span>}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{d.stPostavk}</td>
                          <td className="px-2 py-2">
                            <ZalogaZnacka d={d} />
                          </td>
                          <td className="px-2 py-2">
                            <PrintanoKvadratek p={printano.get(d.stevilka)} />
                          </td>
                        </tr>
                        {razprta && (
                          <tr className="border-b border-ink-200 bg-ink-50">
                            <td colSpan={11} className="px-3 py-3 sm:pl-12">
                              <Postavke d={d} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {prikazane.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-8 text-center text-ink-500">
                        Ni odprem za izbrane filtre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TabelaOkvir>
          </div>
          <p className="text-xs text-ink-500">
            Prikazane so odpreme, ki niso zaključene ali stornirane. Zaloga je iz zadnjega uvoza ({zalogaIz}) in se razdeli po datumu
            odpreme (najzgodnejša odprema najprej); postavke z dobavnico so že izdane iz skladišča. Storitve (npr. montaža) se ne pakirajo.
          </p>
        </>
      )}

      {/* ============ PDF ============ */}
      <Modal open={pdfOdprt} title="Navodila za pakiranje (PDF)" onClose={() => setPdfOdprt(false)} sirina="max-w-2xl" noga={
        <div className="flex justify-end gap-2">
          <Button hint="Zapri okno brez tiska" variant="neutral" onClick={() => setPdfOdprt(false)}>
            Prekliči
          </Button>
          <PrenosPdf
            odpreme={izbraneOdpreme}
            nast={nastPdf}
            barva={barvaOdpreme}
            danes={danes}
            onKoncano={() => {
              setPdfOdprt(false);
              zapisiPrintano(izbraneOdpreme, barvaOdpreme);
            }}
          />
        </div>
      }>
        {pdfOdprt && (
          <PdfNastavitve
            odpreme={izbraneOdpreme}
            nast={nastPdf}
            onChange={shraniNastPdf}
            barva={barvaOdpreme}
            onBarva={(d, koda) => setBarveOdprem((b) => ({ ...b, [d.stevilka]: koda }))}
          />
        )}
      </Modal>

      {/* ============ SKLADIŠČE ============ */}
      <Modal open={skladisceOdprt} title="Povzetek za skladišče (TXT)" onClose={() => setSkladisceOdprt(false)} sirina="max-w-4xl">
        {skladisceOdprt && <SkladisceOkno odpreme={izbraneOdpreme} nast={nastSkl} onChange={setNastSkl} danes={danes} />}
      </Modal>

      {/* ============ PREGLED UVOZA ============ */}
      <Modal open={!!vd300Pregled} title={`Uvoz odprem: ${vd300Pregled?.datoteka ?? ""}`} onClose={() => !uvazam && setVd300Pregled(null)}>
        {vd300Pregled && (
          <UvozPotrditev
            vrstice={[
              ["Vrstic v datoteki", vd300Pregled.vseh],
              ["Izločenih (zaključena naročila, starejša od 30 dni)", vd300Pregled.izlocenih],
              ["Postavk odprem za uvoz", vd300Pregled.odpreme.length],
              ["Odpremnih dokumentov", new Set(vd300Pregled.odpreme.map((o) => o.stevilka)).size],
              ["Postavk z lokacijo", vd300Pregled.odpreme.filter((o) => o.lokacija).length],
            ]}
            opomba="Isti uvoz odprem kot na Prioritetah - velja za obe strani."
            opozorila={vd300Pregled.opozorila}
            uvazam={uvazam !== null}
            onPreklici={() => setVd300Pregled(null)}
            onPotrdi={() => potrdi("vd300")}
          />
        )}
      </Modal>
      <Modal open={!!matPregled} title={`Uvoz materiala: ${matPregled?.datoteka ?? ""}`} onClose={() => !uvazam && setMatPregled(null)}>
        {matPregled && (
          <UvozPotrditev
            vrstice={[
              ["Artiklov", matPregled.material.length],
              ["Z zalogo (matično)", matPregled.material.filter((m) => m.zaloga > 0).length],
            ]}
            opomba="Material se shrani v splošno tabelo materiala (velja za vse strani)."
            opozorila={matPregled.opozorila}
            uvazam={uvazam !== null}
            onPreklici={() => setMatPregled(null)}
            onPotrdi={() => potrdi("material")}
          />
        )}
      </Modal>
    </div>
  );
}

// =====================================================================
// ZNAČKE IN POSTAVKE
// =====================================================================

function StatusZnacka({ status }: { status: string }) {
  const b = barvaStatusa(status);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-ink-700" title={`Status odpreme: ${status}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${b.trak}`} aria-hidden />
      {status}
    </span>
  );
}

const casTxt = (iso: string) =>
  new Date(iso).toLocaleString("sl-SI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Kvadratek barve zadnjega tiska PDF; prazno, dokler odprema ni natisnjena. */
function PrintanoKvadratek({ p }: { p: Printano | undefined }) {
  if (!p) return null;
  const b = barvaPoKodi(p.barva);
  const hint = `Printano ${casTxt(p.zadnjic_at)} (${b.label})${p.prvic_at !== p.zadnjic_at ? ` · prvič ${casTxt(p.prvic_at)}` : ""}${p.uporabnik ? ` · ${p.uporabnik}` : ""}`;
  return <span className="block h-5 w-8 rounded border border-ink-400" style={{ backgroundColor: b.hex }} title={hint} aria-label={hint} />;
}

function ZalogaZnacka({ d }: { d: OdpremaPak }) {
  const [cls, t, hint] = d.vseIzdano
    ? ["bg-ok-500 text-white", "Izdano", "Vse postavke imajo dobavnico"]
    : d.manjka > 0
      ? ["bg-nok-500 text-white", `Manjka ${d.manjka}`, `${d.manjka} postavk zaloga ne pokrije v celoti`]
      : d.neznano > 0
        ? ["bg-warn-400 text-ink-900", `? ${d.neznano}`, `${d.neznano} postavk nima podatka o zalogi`]
        : ["bg-ok-50 text-ok-600 border border-ok-500", "Na zalogi", "Vse postavke so na zalogi"];
  return (
    <span title={hint} className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>
      {t}
    </span>
  );
}

function stanjePostavke(p: PostavkaPak): { t: string; cls: string } {
  if (p.kategorija === "storitev") return { t: "storitev - se ne pakira", cls: "text-ink-400" };
  if (p.izdano) return { t: `izdano (${p.dokument})`, cls: "text-ok-600" };
  if (p.pokrito === null) return { t: "ni podatka o zalogi", cls: "text-warn-700" };
  if (p.pokrito >= p.kolicina) return { t: `na zalogi (${formatNum(p.zaloga)})`, cls: "text-ok-600" };
  return { t: p.pokrito > 0 ? `na zalogi samo ${formatNum(p.pokrito)}` : "ni na zalogi", cls: "font-semibold text-nok-600" };
}

type PostavkaKljuc = "zap" | "ident" | "opis" | "kategorija" | "kolicina" | "stanje";

function Postavke({ d }: { d: OdpremaPak }) {
  const sort = useRazvrscanje<PostavkaPak, PostavkaKljuc>({
    zap: (p) => p.zap,
    ident: (p) => p.ident,
    opis: (p) => p.opis,
    kategorija: (p) => IME_KATEGORIJE[p.kategorija].label,
    kolicina: (p) => p.kolicina,
    stanje: (p) => stanjePostavke(p).t,
  });
  const skupine = skupinePostavk(d.postavke);
  return (
    <div className="flex flex-col gap-2">
      {d.opombe.length > 0 && <WarningText>{d.opombe.join(" · ")}</WarningText>}
      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full text-sm">
          {/* Tabela znotraj razprte vrstice: glava se ne lepi (prilepila bi se čez glavo glavne tabele) */}
          <thead className="fp-thead" style={{ position: "static" }}>
            <tr className="text-left text-xs font-bold">
              <SortTh sort={sort} kljuc="zap" desno>Zap</SortTh>
              <SortTh sort={sort} kljuc="ident">Ident</SortTh>
              <SortTh sort={sort} kljuc="opis">Naziv</SortTh>
              <SortTh sort={sort} kljuc="kategorija">Vrsta</SortTh>
              <SortTh sort={sort} kljuc="kolicina" desno>Kol</SortTh>
              <SortTh sort={sort} kljuc="stanje">Zaloga</SortTh>
            </tr>
          </thead>
          <tbody>
            {skupine.map((sk) => (
              <Fragment key={sk.naslov ?? ""}>
                {(sk.naslov || skupine.length > 1) && (
                  <tr className="border-l-4 border-ink-600 bg-ink-200">
                    <td colSpan={6} className="px-3 py-1.5 text-base font-bold text-ink-900">
                      {sk.naslov ?? "Ostale postavke"}
                      <span className="ml-2 text-sm font-normal text-ink-600">
                        {sk.postavke.length} postavk
                        {(() => {
                          const peci = sk.postavke.filter((p) => p.kategorija === "pec").reduce((s, p) => s + p.kolicina, 0);
                          return peci ? ` · ${formatNum(peci)} peči` : "";
                        })()}
                      </span>
                    </td>
                  </tr>
                )}
                {sort.razvrsti(sk.postavke).map((p) => {
                  const st = stanjePostavke(p);
                  return (
                    <tr key={p.kljuc} className={`border-b border-ink-100 ${p.kategorija === "storitev" ? "text-ink-400" : ""}`}>
                      <td className="px-2 py-1.5 text-right tabular-nums text-ink-500">{p.zap ?? ""}</td>
                      <td className="px-2 py-1.5 font-mono">{p.ident}</td>
                      <td className={`px-2 py-1.5 ${p.kategorija === "pec" ? "font-semibold" : ""}`}>{p.opis}</td>
                      <td className="px-2 py-1.5 text-xs">{IME_KATEGORIJE[p.kategorija].label}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                        {formatNum(p.kolicina)} <span className="text-xs text-ink-500">{p.em.toLowerCase()}</span>
                      </td>
                      <td className={`px-2 py-1.5 text-xs ${st.cls}`}>{st.t}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =====================================================================
// PDF
// =====================================================================

function PdfNastavitve({
  odpreme,
  nast,
  onChange,
  barva,
  onBarva,
}: {
  odpreme: OdpremaPak[];
  nast: NastavitvePdf;
  onChange: (n: Partial<NastavitvePdf>) => void;
  barva: (d: OdpremaPak) => BarvaLista;
  onBarva: (d: OdpremaPak, koda: string) => void;
}) {
  const listov = odpreme.reduce((s, d) => s + steviloListov(d, nast.listi), 0);
  const peci = odpreme.reduce((s, d) => s + d.peci, 0);
  const brezLokacije = odpreme.filter((d) => !d.lokacija).length;
  const izbire = BARVE_LISTOV.filter((b) => nast.barve.includes(b.koda));
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-ink-600">
        Za vsako odpremo se natisne <b>checklista</b> (kaj gre na odpremo, s kvadratki za kljukanje in poljem za opombo) in{" "}
        <b>list z lokacijo</b> (A4 ležeče, lokacija iz VD300 velika na barvnem ozadju). Pri »1 na paleto« je vsaka peč na svoji
        paleti: checklista ima za vsako paleto svojo tabelo, ostale količine (npr. pladnji) so razdeljene med palete.
      </p>

      <FilterPolje label="Barve na izbiro">
        <div className="flex flex-wrap gap-2">
          {BARVE_LISTOV.map((b) => {
            const izbrana = nast.barve.includes(b.koda);
            return (
              <button
                key={b.koda}
                type="button"
                aria-pressed={izbrana}
                title={`${izbrana ? "Odstrani" : "Dodaj"} barvo na izbiro: ${b.label}`}
                onClick={() => {
                  const nove = izbrana ? nast.barve.filter((x) => x !== b.koda) : [...nast.barve, b.koda];
                  // vrstni red kot v seznamu barv (bela prva)
                  onChange({ barve: nove.length ? BARVE_LISTOV.filter((x) => nove.includes(x.koda)).map((x) => x.koda) : [b.koda] });
                }}
                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 transition-colors ${
                  izbrana ? "border-fines-500 bg-fines-50 text-ink-900" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-100"
                }`}
              >
                <span className="h-5 w-5 rounded border border-ink-300" style={{ backgroundColor: b.hex }} aria-hidden />
                {b.label}
              </button>
            );
          })}
        </div>
      </FilterPolje>

      <FilterPreklopnik<ListiLokacije>
        label="Listi z lokacijo"
        value={nast.listi}
        onChange={(listi) => onChange({ listi })}
        options={[
          { value: "odprema", label: "1 na odpremo", hint: "En list z lokacijo za vsako odpremo", stevilo: odpreme.length },
          {
            value: "pec",
            label: "1 na paleto (peč)",
            hint: "Vsaka peč svoja paleta, količine razdeljene",
            stevilo: odpreme.reduce((s, d) => s + steviloListov(d, "pec"), 0),
          },
          { value: "brez", label: "Brez", hint: "Natisni samo checkliste" },
        ]}
      />

      {brezLokacije > 0 && (
        <WarningText>
          {brezLokacije} {brezLokacije === 1 ? "odprema nima" : "odprem nima"} vpisane lokacije v VD300 - na listu bo napisano »Lokacija ni
          vpisana«.
        </WarningText>
      )}

      <div className="rounded-lg border border-ink-200">
        <div className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600">
          {odpreme.length} odprem · {formatNum(peci)} peči · {listov} listov z lokacijo · barvo izberi za vsako odpremo
        </div>
        <ul className="max-h-72 divide-y divide-ink-100 overflow-y-auto">
          {odpreme.map((d) => {
            const b = barva(d);
            return (
              <li key={d.stevilka} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                <BarvaIzbirnik
                  barva={b}
                  izbire={izbire}
                  hint={`Barva lista za odpremo ${d.stevilka}: ${b.label}`}
                  onChange={(koda) => onBarva(d, koda)}
                />
                <span className="font-mono text-xs text-ink-500">{d.stevilka}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.lokacija ?? <span className="text-warn-700">lokacija ni vpisana</span>}</span>
                  <span className="block truncate text-xs text-ink-500">{d.partner}</span>
                </span>
                <span className="text-xs tabular-nums text-ink-500">{d.peci ? `${d.peci} ${d.peci === 1 ? "peč" : "peči"}` : ""}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Majhen kvadratek z barvo; klik odpre izbiro med izbranimi barvami (samo barve, brez besedila). */
function BarvaIzbirnik({
  barva,
  izbire,
  hint,
  onChange,
}: {
  barva: BarvaLista;
  izbire: BarvaLista[];
  hint: string;
  onChange: (koda: string) => void;
}) {
  const [poz, setPoz] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!poz) return;
    const zapri = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setPoz(null);
    };
    document.addEventListener("mousedown", zapri);
    window.addEventListener("resize", zapri);
    document.addEventListener("scroll", zapri, true);
    return () => {
      document.removeEventListener("mousedown", zapri);
      window.removeEventListener("resize", zapri);
      document.removeEventListener("scroll", zapri, true);
    };
  }, [poz]);

  return (
    <div ref={ref} className="shrink-0">
      <button
        type="button"
        title={hint}
        aria-label={hint}
        aria-expanded={!!poz}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPoz(poz ? null : { x: r.left, y: r.bottom + 4 });
        }}
        className="block h-7 w-10 rounded border border-ink-300 shadow-sm transition hover:ring-2 hover:ring-fines-200"
        style={{ backgroundColor: barva.hex }}
      />
      {poz && (
        // fixed: seznam odprem v oknu drsi in bi izbiro odrezal
        <div className="fixed z-[70] flex gap-1.5 rounded-lg border border-ink-200 bg-white p-1.5 shadow-lg" style={{ left: poz.x, top: poz.y }}>
          {izbire.map((x) => (
            <button
              key={x.koda}
              type="button"
              title={`Izberi barvo: ${x.label}`}
              aria-label={`Izberi barvo: ${x.label}`}
              aria-pressed={x.koda === barva.koda}
              onClick={() => {
                onChange(x.koda);
                setPoz(null);
              }}
              className={`h-8 w-8 rounded border ${x.koda === barva.koda ? "border-fines-500 ring-2 ring-fines-500" : "border-ink-300 hover:ring-2 hover:ring-fines-200"}`}
              style={{ backgroundColor: x.hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PrenosPdf({
  odpreme,
  nast,
  barva,
  danes,
  onKoncano,
}: {
  odpreme: OdpremaPak[];
  nast: NastavitvePdf;
  barva: (d: OdpremaPak) => BarvaLista;
  danes: IsoDate;
  onKoncano: () => void;
}) {
  const notify = useToast();
  const [delam, setDelam] = useState(false);
  async function prenesi() {
    setDelam(true);
    try {
      const { prenesiNavodilaPdf } = await import("@/lib/pakiranjePdf");
      const kupci = [...new Set(odpreme.map((d) => d.partner ?? ""))];
      await prenesiNavodilaPdf(odpreme, nast, barva, `pakiranje_${kupci.length === 1 ? `${kupci[0]}_` : ""}${danes}`);
      onKoncano();
    } catch (e) {
      notify("error", `PDF ni uspel: ${(e as Error).message}`, 10000);
    } finally {
      setDelam(false);
    }
  }
  return (
    <Button hint="Prenesi PDF z navodili za pakiranje" variant="primary" icon={delam ? undefined : Printer} disabled={delam || odpreme.length === 0} onClick={prenesi}>
      {delam && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      Prenesi PDF
    </Button>
  );
}

// =====================================================================
// SKLADIŠČE
// =====================================================================

function SkladisceOkno({
  odpreme,
  nast,
  onChange,
  danes,
}: {
  odpreme: OdpremaPak[];
  nast: NastavitveSkladisca;
  onChange: (n: NastavitveSkladisca) => void;
  danes: IsoDate;
}) {
  const kosov = (k: Kategorija) =>
    odpreme.reduce((s, d) => s + d.postavke.filter((p) => p.kategorija === k && !(nast.brezIzdanih && p.izdano)).reduce((a, p) => a + p.kolicina, 0), 0);
  const kategorije = KATEGORIJE.filter((k) => k.koda !== "storitev" && kosov(k.koda) > 0);
  const besedilo = skladisceTxt(odpreme, nast, danes);
  const preklopi = (k: Kategorija) =>
    onChange({ ...nast, kategorije: nast.kategorije.includes(k) ? nast.kategorije.filter((x) => x !== k) : [...nast.kategorije, k] });

  return (
    <div className="flex flex-col gap-4">
      <FilterPolje label="Kaj naj skladišče nabere in pošlje v montažo">
        <div className="flex flex-wrap gap-2">
          {kategorije.map((k) => (
            <FilterCheckbox
              key={k.koda}
              label={`${k.mnozina} (${formatNum(kosov(k.koda))})`}
              checked={nast.kategorije.includes(k.koda)}
              onChange={() => preklopi(k.koda)}
              hint={`${nast.kategorije.includes(k.koda) ? "Odstrani" : "Dodaj"} ${k.mnozina.toLowerCase()} v povzetek`}
            />
          ))}
          {kategorije.length === 0 && <span className="text-sm text-ink-500">Izbrane odpreme nimajo postavk za nabiranje.</span>}
        </div>
      </FilterPolje>
      <FilterVrstica>
        <FilterCheckbox
          naslov="Zaloga"
          label="Samo kar je na zalogi"
          checked={nast.samoNaZalogi}
          onChange={(v) => onChange({ ...nast, samoNaZalogi: v })}
          hint="Kar ni na zalogi, je v ločenem razdelku"
        />
        <FilterCheckbox
          naslov="Dobavnica"
          label="Brez že izdanih"
          checked={nast.brezIzdanih}
          onChange={(v) => onChange({ ...nast, brezIzdanih: v })}
          hint="Izpusti postavke, ki že imajo dobavnico"
        />
        <FilterPreklopnik
          label="Prikaz"
          value={nast.prikaz}
          onChange={(prikaz) => onChange({ ...nast, prikaz })}
          options={[
            { value: "skupaj", label: "Skupaj", hint: "Seštej enake artikle vseh odprem" },
            { value: "po_odpremah", label: "Po odpremah", hint: "Seznam ločeno za vsako odpremo" },
          ]}
        />
      </FilterVrstica>
      <TxtSporocilo
        opis="Seznam materiala za izbrane odpreme, ki ga skladišče nabere in pošlje v montažo."
        besedilo={besedilo}
        ime={`skladisce_nabiranje_${danes}.txt`}
        visina="h-[40vh]"
      />
    </div>
  );
}

// =====================================================================
// UVOZ
// =====================================================================

function UvozPotrditev({
  vrstice,
  opomba,
  opozorila,
  uvazam,
  onPreklici,
  onPotrdi,
}: {
  vrstice: [string, number][];
  opomba?: string;
  opozorila: string[];
  uvazam: boolean;
  onPreklici: () => void;
  onPotrdi: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {vrstice.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-ink-600">{k}</dt>
            <dd className="text-right font-bold tabular-nums">{formatNum(v)}</dd>
          </Fragment>
        ))}
      </dl>
      {opomba && <p className="text-ink-600">{opomba}</p>}
      {opozorila.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg bg-warn-50 p-2 text-xs text-warn-700">
          {opozorila.map((o, i) => (
            <div key={i}>{o}</div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button hint="Prekliči uvoz datoteke" variant="neutral" onClick={onPreklici} disabled={uvazam}>
          Prekliči
        </Button>
        <Button hint="Shrani uvoz kot zadnje podatke" variant="success" onClick={onPotrdi} disabled={uvazam}>
          {uvazam ? "Uvažam ..." : "Uvozi"}
        </Button>
      </div>
    </div>
  );
}
