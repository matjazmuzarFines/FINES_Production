"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, PanelRightClose, PanelRightOpen, Tv } from "lucide-react";
import {
  addDays,
  addMonths,
  formatDayMonth,
  formatMonth,
  formatShort,
  isoWeek,
  mondayOf,
  monthEnd,
  monthStart,
  toIso,
  weekday,
  type IsoDate,
} from "@/lib/dates";
import { naloziNormative, type Normativ, type OddelekKoda } from "@/lib/normativi";
import { delezNapredka, naloziCelice, naloziPostavitve, naloziZaposlene, zdruziKrovne, type Celica, type Postavitev, type ZaposleniDan } from "@/lib/plan";
import {
  naloziKoseNalogov,
  naloziNalogeKrovnih,
  naloziPorocano,
  naloziPorocanoNalogov,
  zadnjiPorocanoUvoz,
  type NalogKrovnega,
  type PorocanoDelo,
} from "@/lib/porocanoDelo";
import {
  KATEGORIJE,
  NERAZPOREJENO,
  PREVERI_NAD,
  PREVERI_POD,
  dneviObdobja,
  izracunajPlanOddelka,
  izracunajProduktivnost,
  izracunajZakljucene,
  izvoziDeloXlsx,
  izvoziKontroloXlsx,
  kljucDneva,
  labelKategorije,
  nalogiPlana,
  porabaDneva,
  zakljuceniKandidati,
  type DanCelice,
  type Kategorija,
  type KontrolaPostavitve,
  type KrovniZakljucen,
  type PripisanoDelo,
} from "@/lib/produktivnostPlana";
import { formatNum, formatRazlikaUr, formatUre } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import { izracunajNaloge, naloziZadnjiUvoz, naloziZasOddelke, type Nalog, type ZasOddelek } from "@/lib/zasedenost";
import { PodatkiVir } from "@/components/PodatkiVir";
import { usePoSyncu } from "@/components/SyncProvider";
import { Button, IconButton } from "@/components/ui/Button";
import { FilterCheckbox, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { Izvoz } from "@/components/ui/Izvoz";
import { Modal } from "@/components/ui/Modal";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";

const DAN_IME = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];
const SIRINA_IMENA = 150; // px
const VISINA_GRAFA = 128; // px - stolpci enega delovnega mesta

type Obdobje = "teden" | "mesec";
type Pogled = "plan" | "zakljuceni";
/** Zaključeni krovni: koliko dni nazaj (datum zaključka). */
const DNI_ZAKLJUCENI = 30;

/** Barve kategorij poročanega dela (stolpec desno od plana). */
const BARVA: Record<Kategorija, string> = {
  plan: "bg-ok-500",
  pred: "bg-sync-500",
  po: "bg-warn-400",
  izven: "bg-ink-400",
  rezija: "bg-ink-300",
};
const BARVA_PRESEZEK = "bg-nok-500";

/** Produktivnost (zasluženo / poročano): 100 % in več zelena, do 85 % rumena, pod 85 % rdeča. */
const barvaProduktivnosti = (p: number | null) =>
  p === null ? "text-ink-400" : p >= 0.995 ? "text-ok-600" : p >= 0.85 ? "text-warn-700" : "text-nok-600";
/**
 * Barva ur proti planu (poročano / plan): do +5 % zelena (v planu), čez rdeča (več ur kot plan), pod 85 % rumena (plan ni delan).
 * Številka se kaže v URAH (formatRazlikaUr) - procent je rezerviran za produktivnost.
 */
const barvaPorabe = (p: number | null, temno = false) =>
  p === null ? "text-ink-400" : p > 1.05 ? (temno ? "text-nok-500" : "text-nok-600") : p >= 0.85 ? (temno ? "text-ok-500" : "text-ok-600") : temno ? "text-warn-400" : "text-warn-700";
const fmtPct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)} %`);
const ura = (cas: string | null) => (cas ? cas.slice(11, 16) : "");

const PANEL_KLJUC = "fp-produktivnost-kontrola"; // desni panel Kontrola produktivnosti odprt (brskalnik)
function preberiPanel() {
  try {
    return localStorage.getItem(PANEL_KLJUC) !== "0"; // privzeto odprt
  } catch {
    return true;
  }
}

type Osnova = {
  oddelki: ZasOddelek[];
  nalogi: Nalog[];
  normativi: Normativ[];
  celice: Celica[];
  postavitve: Postavitev[];
  zaposleni: ZaposleniDan[];
  /** null = tabel poročanega dela ni (skripta 036); "" = ni uvoza */
  porUvoz: string | null;
};

async function naloziOsnovo(): Promise<Osnova> {
  const danes = toIso(new Date());
  const [oddelki, u, normativi, celice, postavitve, zaposleni, por] = await Promise.all([
    naloziZasOddelke(),
    naloziZadnjiUvoz(),
    naloziNormative(true),
    naloziCelice(danes),
    naloziPostavitve(),
    naloziZaposlene(addDays(danes, -400), addDays(danes, 400)),
    zadnjiPorocanoUvoz().then(
      (x) => x?.created_at ?? "",
      () => null,
    ),
  ]);
  return { oddelki, nalogi: u.nalogi, normativi, celice, postavitve, zaposleni, porUvoz: por };
}

export function Produktivnost({ koda }: { koda: OddelekKoda }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <ProduktivnostInner koda={koda} />;
}

function ProduktivnostInner({ koda }: { koda: OddelekKoda }) {
  const notify = useToast();
  const danes = toIso(new Date());
  const [osnova, setOsnova] = useState<Osnova | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [obdobje, setObdobje] = useState<Obdobje>("teden");
  const [zacetek, setZacetek] = useState<IsoDate>(() => mondayOf(danes));
  const [zgodovina, setZgodovina] = useState<NalogKrovnega[] | null>(null);
  const [porPlana, setPorPlana] = useState<PorocanoDelo[] | null>(null);
  const [porObdobja, setPorObdobja] = useState<{ kljuc: string; vrstice: PorocanoDelo[] } | null>(null);
  const [odprtDan, setOdprtDan] = useState<DanCelice | null>(null);
  const [odprtKrovni, setOdprtKrovni] = useState<KontrolaPostavitve | null>(null);
  const [samoObdobje, setSamoObdobje] = useState(true);
  // Desni panel; stran pokaže Loading, dokler podatki niso naloženi - branje localStorage je varno
  const [panel, setPanel] = useState(preberiPanel);
  const [naTv, setNaTv] = useState(false);
  const [pogled, setPogled] = useState<Pogled>("plan");
  const [zakPodatki, setZakPodatki] = useState<{ porocano: PorocanoDelo[]; kosi: Map<string, number> } | null>(null);

  /** FIN:TV "Delo - prejšnji dan" ročno (sicer se objavi sama ob uvozu poročanega dela). */
  async function objaviNaTv() {
    setNaTv(true);
    try {
      const { objaviDeloNaTv } = await import("@/lib/tvObjava");
      const izid = await objaviDeloNaTv("ročna objava");
      if (izid.oddelki.length) notify("success", `FIN:TV: delo ${formatShort(izid.datum)} objavljeno - ${izid.oddelki.join(", ")}.`, 8000);
      else notify("warning", "FIN:TV: komponenta Delo - prejšnji dan ni vklopljena (ali ni dostopa do FIN:TV).", 10000);
    } catch (e) {
      notify("error", `FIN:TV: ${(e as Error).message}`, 10000);
    } finally {
      setNaTv(false);
    }
  }

  function preklopiPanel() {
    setPanel(!panel);
    try {
      localStorage.setItem(PANEL_KLJUC, panel ? "0" : "1");
    } catch {
      // brskalnik ne dovoli shranjevanja - velja do osvežitve
    }
  }

  const od = obdobje === "teden" ? zacetek : monthStart(zacetek);
  const doo = obdobje === "teden" ? addDays(zacetek, 6) : monthEnd(zacetek);

  useEffect(() => {
    let preklic = false;
    naloziOsnovo()
      .then((o) => !preklic && setOsnova(o))
      .catch((e) => notify("error", `Napaka pri nalaganju: ${(e as Error).message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [notify, verzija]);

  usePoSyncu(() => {
    setZgodovina(null);
    setPorPlana(null);
    setPorObdobja(null);
    setZakPodatki(null);
    setVerzija((v) => v + 1);
  });

  const oddelek = osnova?.oddelki.find((o) => o.koda === koda) ?? null;
  const celice = useMemo(() => (osnova && oddelek ? osnova.celice.filter((c) => c.oddelek_id === oddelek.id) : []), [osnova, oddelek]);
  const postavitve = useMemo(
    () => (osnova && oddelek ? osnova.postavitve.filter((p) => p.oddelek_id === oddelek.id) : []),
    [osnova, oddelek],
  );
  const krovni = useMemo(() => (osnova ? zdruziKrovne(izracunajNaloge(osnova.nalogi, osnova.normativi), koda) : []), [osnova, koda]);
  const plan = useMemo(
    () => (osnova && oddelek ? izracunajPlanOddelka({ oddelek, celice, postavitve, zaposleni: osnova.zaposleni, krovni }) : null),
    [osnova, oddelek, celice, postavitve, krovni],
  );
  const imaTabele = !!osnova && osnova.porUvoz !== null;

  // Nalogi krovnih iz vseh uvozov, nato vse poročano delo na nalogih plana (za kontrolo krovnih)
  useEffect(() => {
    if (!imaTabele || !plan) return;
    let preklic = false;
    (async () => {
      const zg = await naloziNalogeKrovnih(plan.postavitve.filter((p) => !p.prosta).map((p) => p.krovni_dn));
      if (preklic) return;
      setZgodovina(zg);
      const por = await naloziPorocanoNalogov(nalogiPlana(plan.postavitve, krovni, zg));
      if (!preklic) setPorPlana(por);
    })().catch((e) => notify("error", `Napaka pri nalaganju poročanega dela: ${(e as Error).message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [imaTabele, plan, krovni, notify]);

  // Vse poročano delo v prikazanem obdobju (tudi izven plana)
  const kljucObdobja = `${od}|${doo}|${verzija}`;
  useEffect(() => {
    if (!imaTabele) return;
    let preklic = false;
    naloziPorocano(od, doo)
      .then((vrstice) => !preklic && setPorObdobja({ kljuc: kljucObdobja, vrstice }))
      .catch((e) => notify("error", `Napaka pri nalaganju poročanega dela: ${(e as Error).message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [imaTabele, od, doo, kljucObdobja, notify]);

  const rezultat = useMemo(() => {
    if (!plan || !zgodovina || !porPlana || !porObdobja) return null;
    return izracunajProduktivnost({ koda, celice, plan, krovni, zgodovina, porocano: [...porPlana, ...porObdobja.vrstice] });
  }, [koda, celice, plan, krovni, zgodovina, porPlana, porObdobja]);

  // Zaključeni krovni: štempljanje (vsi datumi) in kosi nalogov zaključenih krovnih iz plana - naloži se ob prvem ogledu
  const odprti = useMemo(() => new Set(osnova?.nalogi.map((n) => n.st_naloga) ?? []), [osnova]);
  const odZakljucenih = addDays(danes, -DNI_ZAKLJUCENI);
  useEffect(() => {
    if (pogled !== "zakljuceni" || zakPodatki || !plan || !zgodovina) return;
    let preklic = false;
    const nalogi = zakljuceniKandidati(plan.postavitve, odprti, zgodovina).flatMap((k) => k.nalogi.map((n) => n.st_naloga));
    Promise.all([naloziPorocanoNalogov(nalogi), naloziKoseNalogov(nalogi)])
      .then(([porocano, kosi]) => !preklic && setZakPodatki({ porocano, kosi }))
      .catch((e) => notify("error", `Napaka pri nalaganju zaključenih krovnih: ${(e as Error).message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [pogled, zakPodatki, plan, zgodovina, odprti, notify]);
  const zakljuceni = useMemo(
    () =>
      plan && zgodovina && zakPodatki && osnova
        ? izracunajZakljucene({
            koda,
            postavitve: plan.postavitve,
            razpored: plan.razpored,
            odprti,
            zgodovina,
            porocano: zakPodatki.porocano,
            normativi: osnova.normativi,
            kosiNalogov: zakPodatki.kosi,
            od: odZakljucenih,
          })
        : null,
    [koda, plan, zgodovina, zakPodatki, osnova, odprti, odZakljucenih],
  );

  if (!osnova) return <Loading />;

  const nalagam = imaTabele && (!rezultat || porObdobja?.kljuc !== kljucObdobja);
  const kontrolaObdobja = rezultat
    ? samoObdobje
      ? rezultat.kontrola.filter((k) => (k.od && k.do && k.od <= doo && k.do >= od) || k.delo.some((v) => v.datum >= od && v.datum <= doo))
      : rezultat.kontrola
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* ============ GLAVA ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Produktivnost</h2>
          <p className="text-sm text-ink-500">
            Planirane ure delovnega plana proti poročanim uram (štempljanje na naloge) po delovnih mestih in dnevih
          </p>
        </div>
        <PodatkiVir kljuci={["nalogi", "porocano"]} />
      </div>

      {/* ============ ODDELKI ============ */}
      <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Oddelki">
        {osnova.oddelki.map((o) => {
          const aktiven = o.koda === koda;
          return (
            <Link
              key={o.koda}
              href={`/proizvodnja/zasedenost/produktivnost?oddelek=${o.koda}`}
              role="tab"
              aria-selected={aktiven}
              title={`Pokaži produktivnost: ${o.naziv}`}
              className={`flex h-10 items-center rounded-lg border-2 px-4 text-sm font-bold transition-colors ${
                aktiven ? "border-fines-500 bg-fines-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-fines-500 hover:text-fines-500"
              }`}
            >
              {o.naziv}
            </Link>
          );
        })}
      </div>
        <div className="ml-auto">
          <FilterPreklopnik<Pogled>
            label="Pogled"
            value={pogled}
            onChange={setPogled}
            options={[
              { value: "plan", label: "Plan in ure", hint: "Planirane proti štempljanim uram po delovnih mestih in dnevih" },
              {
                value: "zakljuceni",
                label: "Zaključeni krovni",
                hint: `Produktivnost krovnih nalogov, zaključenih v zadnjih ${DNI_ZAKLJUCENI} dneh`,
              },
            ]}
          />
        </div>
        {pogled === "plan" && (
        <Button
          hint={panel ? "Zapri kontrolo produktivnosti" : "Odpri kontrolo produktivnosti: krovni nalogi s planiranimi in štempljanimi urami"}
          variant={panel ? "primary" : "neutral"}
          icon={panel ? PanelRightClose : PanelRightOpen}
          aria-pressed={panel}
          onClick={preklopiPanel}
          className="self-end"
        >
          Kontrola produktivnosti
        </Button>
        )}
        <Button
          hint="Objavi delo prejšnjega dne na FIN:TV"
          variant="sync"
          icon={naTv ? Loader2 : Tv}
          disabled={naTv || !imaTabele}
          onClick={objaviNaTv}
          className={`self-end ${naTv ? "[&>svg]:animate-spin" : ""}`}
        >
          Na TV
        </Button>
      </div>

      {!imaTabele && (
        <WarningText>
          Tabele poročanega dela še ni v bazi - v Supabase zaženi skripto <strong>036_porocano_delo.sql</strong>, nato na strani Podatki uvozi
          Porocano_delo.xlsx.
        </WarningText>
      )}
      {imaTabele && osnova.porUvoz === "" && (
        <WarningText>Poročano delo še ni uvoženo - na strani Podatki uvozi Porocano_delo.xlsx (Sync ali ročni uvoz).</WarningText>
      )}

      {!oddelek ? (
        <div className="fp-card p-8 text-center text-ink-600">Oddelek ni najden.</div>
      ) : pogled === "zakljuceni" ? (
        <ZakljuceniKrovni celice={celice} krovni={zakljuceni} od={odZakljucenih} oddelek={oddelek.naziv} />
      ) : (
        <>
          <div className={`grid items-start gap-4 ${panel ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
          {/* ============ ČASOVNICA ============ */}
          <div className="fp-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
            <FilterVrstica>
              <div className="flex items-end gap-2">
                <IconButton
                  hint={obdobje === "teden" ? "Pokaži prejšnji teden" : "Pokaži prejšnji mesec"}
                  variant="neutral"
                  icon={ChevronLeft}
                  onClick={() => setZacetek(obdobje === "teden" ? addDays(zacetek, -7) : addMonths(monthStart(zacetek), -1))}
                />
                <IconButton
                  hint={obdobje === "teden" ? "Pokaži naslednji teden" : "Pokaži naslednji mesec"}
                  variant="neutral"
                  icon={ChevronRight}
                  onClick={() => setZacetek(obdobje === "teden" ? addDays(zacetek, 7) : addMonths(monthStart(zacetek), 1))}
                />
                <Button
                  hint={obdobje === "teden" ? "Pokaži tekoči teden" : "Pokaži tekoči mesec"}
                  variant="neutral"
                  onClick={() => setZacetek(obdobje === "teden" ? mondayOf(danes) : monthStart(danes))}
                >
                  {obdobje === "teden" ? "Ta teden" : "Ta mesec"}
                </Button>
              </div>
              <FilterPreklopnik<Obdobje>
                label="Prikaz"
                value={obdobje}
                onChange={(v) => {
                  setObdobje(v);
                  setZacetek(v === "teden" ? mondayOf(od <= danes && danes <= doo ? danes : od) : monthStart(zacetek));
                }}
                options={[
                  { value: "teden", label: "Teden", hint: "Pokaži en teden po dnevih" },
                  { value: "mesec", label: "Mesec", hint: "Pokaži cel mesec po dnevih" },
                ]}
              />
              <div className="flex h-10 items-center self-end text-sm font-bold text-ink-800">
                {obdobje === "teden" ? `${isoWeek(od)}. teden · ${formatShort(od)} - ${formatShort(addDays(od, 4))}` : formatMonth(od)}
              </div>
              <Izvoz
                className="ml-auto"
                spomin="produktivnost-delo"
                formati={[
                  {
                    koda: "xlsx",
                    label: "Excel (.xlsx)",
                    hint: "Poročano delo prikazanega obdobja v Excel",
                    disabled: !rezultat,
                    zakaj: "Podatki se še nalagajo",
                    akcija: () =>
                      izvoziDeloXlsx(
                        rezultat!.delo.filter((v) => v.datum >= od && v.datum <= doo).sort((a, b) => a.datum.localeCompare(b.datum)),
                        new Map(celice.map((c) => [c.id, c.naziv])),
                        `Porocano_delo_${koda}_${od}_${doo}.xlsx`,
                      ),
                  },
                ]}
              />
            </FilterVrstica>

            <Legenda />

            {nalagam || !rezultat ? (
              <Loading />
            ) : (
              <Casovnica
                celice={celice}
                dnevi={dneviObdobja(od, doo, rezultat.delo.filter((v) => v.datum >= od && v.datum <= doo))}
                rezultat={rezultat.dnevi}
                ureNaDan={oddelek.ure_na_dan}
                danes={danes}
                siroko={obdobje === "teden"}
                onOdpri={setOdprtDan}
              />
            )}
          </div>

          {/* ============ KONTROLA PRODUKTIVNOSTI - desni panel ============ */}
          {panel && (
            <PanelProduktivnosti
              vrstice={rezultat && !nalagam ? kontrolaObdobja : null}
              samoObdobje={samoObdobje}
              onSamoObdobje={setSamoObdobje}
              onOdpri={setOdprtKrovni}
            />
          )}
          </div>

          {/* ============ KONTROLA PRODUKTIVNOSTI - tabela ============ */}
          {rezultat && (
            <KontrolaProduktivnosti
              vrstice={kontrolaObdobja}
              samoObdobje={samoObdobje}
              onSamoObdobje={setSamoObdobje}
              onOdpri={setOdprtKrovni}
              ime={`Kontrola_produktivnosti_${koda}_${samoObdobje ? `${od}_${doo}` : "vse"}.xlsx`}
            />
          )}
        </>
      )}

      {odprtDan && (
        <PodrobnostiDneva
          dan={odprtDan}
          celica={odprtDan.celicaId === NERAZPOREJENO ? "Nerazporejeno" : (celice.find((c) => c.id === odprtDan.celicaId)?.naziv ?? "")}
          onClose={() => setOdprtDan(null)}
        />
      )}
      {odprtKrovni && <PodrobnostiKrovnega k={odprtKrovni} onClose={() => setOdprtKrovni(null)} />}
    </div>
  );
}

// =====================================================================
// ZAKLJUČENI KROVNI - stolpci po celicah (en krovni = en stolpec čez celo višino)
// =====================================================================

/** Ozadje in rob glave stolpca po produktivnosti (iste meje kot barvaProduktivnosti). */
const tonProduktivnosti = (p: number | null) =>
  p === null ? "border-ink-300 bg-ink-50" : p >= 0.995 ? "border-ok-500 bg-ok-50" : p >= 0.85 ? "border-warn-400 bg-warn-50" : "border-nok-500 bg-nok-50";
const besediloNalogov = (n: number) => `${n} ${n === 1 ? "nalog" : n === 2 ? "naloga" : n <= 4 ? "nalogi" : "nalogov"}`;

function ZakljuceniKrovni({ celice, krovni, od, oddelek }: { celice: Celica[]; krovni: KrovniZakljucen[] | null; od: IsoDate; oddelek: string }) {
  const skupine = [...celice.map((c) => ({ id: c.id, naziv: c.naziv })), { id: NERAZPOREJENO, naziv: "Brez delovnega mesta" }]
    .map((c) => ({ ...c, krovni: (krovni ?? []).filter((k) => k.celicaId === c.id) }))
    .filter((c) => c.krovni.length > 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="fp-card flex flex-col gap-2 p-3 sm:p-4">
        <div>
          <h3 className="text-base font-bold text-ink-900">Zaključeni krovni nalogi · {oddelek}</h3>
          <p className="text-xs text-ink-500">
            Krovni iz delovnega plana, pri katerih so zaključeni vsi nalogi, zadnje štempljanje od {formatShort(od)} naprej. Krovni se vedno
            upošteva v celoti (vse ure, tudi starejše). Štejejo samo ure na operacijah oddelka; zaključen nalog = narejena razpisana količina.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700">
          <span title="Normativne ure (kosi × normativ oddelka) deljeno s štempljanimi urami">
            <strong className="uppercase tracking-wide">Produktivnost</strong> = normativne ure ÷ štempljane ure × 100
          </span>
          <span className="font-semibold text-ok-600" title="Narejeno v manj urah, kot predvideva normativ">
            ≥ 100 % · manj ur od normativa
          </span>
          <span className="font-semibold text-warn-700" title="Malo več ur od normativa">
            85–99 %
          </span>
          <span className="font-semibold text-nok-600" title="Bistveno več ur od normativa">
            pod 85 %
          </span>
          <span className="rounded-full bg-nok-50 px-2 font-semibold text-nok-600" title="Verjetno napaka pri štempljanju - vodja naj preveri in popravi">
            preveri: pod {Math.round(PREVERI_POD * 100)} % ali nad {Math.round(PREVERI_NAD * 100)} %
          </span>
        </div>
      </div>

      {krovni === null ? (
        <div className="fp-card p-4">
          <Loading />
        </div>
      ) : skupine.length === 0 ? (
        <div className="fp-card p-8 text-center text-ink-600">V zadnjih {DNI_ZAKLJUCENI} dneh ni zaključenih krovnih iz delovnega plana.</div>
      ) : (
        skupine.map((c) => (
          <section key={c.id} className="fp-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-lg font-bold text-ink-900">{c.naziv}</h3>
              <span className="text-sm text-ink-500">
                {c.krovni.length} {c.krovni.length === 1 ? "zaključen krovni" : "zaključenih krovnih"} · po datumu zaključka
              </span>
            </div>
            <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
              {c.krovni.map((k) => (
                <StolpecKrovnega key={k.krovni} k={k} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function StolpecKrovnega({ k }: { k: KrovniZakljucen }) {
  const steti = k.nalogi.filter((n) => !n.izlocen);
  const izloceni = k.nalogi.filter((n) => n.izlocen);
  const hoverKrovnega = [
    `Krovni ${k.krovni}`,
    `Normativ ${formatUre(k.normUre)} h · štempljano ${formatUre(k.ure)} h`,
    k.prviDan ? `Štempljanje v oddelku od ${formatShort(k.prviDan)}, zaključen ${formatShort(k.zakljucen)}` : `Zaključen ${formatShort(k.zakljucen)}`,
  ].join("\n");
  return (
    <div className="flex min-w-[15rem] max-w-[24rem] flex-1 shrink-0 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white">
      {/* krovni: velik prikaz produktivnosti */}
      <div className={`border-b-4 px-3 py-3 ${tonProduktivnosti(k.produktivnost)}`} title={hoverKrovnega}>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-base font-bold text-ink-900">{k.krovni}</span>
          <span className="ml-auto text-xs text-ink-500">zaključen {formatDayMonth(k.zakljucen)}</span>
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">Produktivnost</div>
        <div className={`text-4xl font-bold leading-tight tabular-nums ${barvaProduktivnosti(k.produktivnost)}`}>{fmtPct(k.produktivnost)}</div>
        <div className="text-xs tabular-nums text-ink-600">
          normativ {formatUre(k.normUre)} h · štempljano {formatUre(k.ure)} h
        </div>
        {k.ureBrezNormativa > 0.05 && (
          <div className="text-[11px] text-ink-500" title="Ure na nalogih brez normativa za oddelek - niso v produktivnosti">
            + {formatUre(k.ureBrezNormativa)} h na nalogih brez normativa
          </div>
        )}
      </div>

      {/* nalogi: manjši prikaz ob besedilu naloga */}
      <ul className="flex flex-col divide-y divide-ink-100">
        {steti.map((n) => (
          <li
            key={n.st}
            className="px-3 py-2"
            title={
              n.normUre === null
                ? `Nalog ${n.st}: ni normativa za oddelek - štempljane ure brez izračuna produktivnosti`
                : `Nalog ${n.st}: normativ ${formatUre(n.normUre)} h (${formatNum(n.kos)} kos), štempljano ${formatUre(n.ure)} h`
            }
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-ink-900">{n.st}</span>
              <span className={`ml-auto text-base font-bold tabular-nums ${n.normUre === null ? "text-ink-400" : barvaProduktivnosti(n.produktivnost)}`}>
                {n.normUre === null ? "–" : fmtPct(n.produktivnost)}
              </span>
            </div>
            {n.naziv && <div className="text-xs text-ink-700">{n.naziv}</div>}
            <div className="text-[11px] tabular-nums text-ink-500">
              {n.normUre === null ? (
                <span className="italic">ni normativa · štempljano {formatUre(n.ure)} h</span>
              ) : (
                <>
                  {formatNum(n.kos)} kos · normativ {formatUre(n.normUre)} h · štempljano {formatUre(n.ure)} h
                </>
              )}
            </div>
            {n.preveri && (
              <span
                className="mt-1 inline-block rounded-full bg-nok-50 px-2 py-0.5 text-[11px] font-semibold text-nok-600"
                title="Produktivnost pod 50 % ali nad 150 % je verjetno napaka pri štempljanju - vodja naj preveri"
              >
                preveri štempljanje
              </span>
            )}
          </li>
        ))}
      </ul>
      {izloceni.length > 0 && (
        <div
          className="mt-auto border-t border-ink-100 bg-ink-50 px-3 py-2 text-[11px] text-ink-500"
          title={izloceni.map((n) => `${n.st}: ${n.izlocen === "brez_stempljanja" ? "brez štempljanja v oddelku" : "brez kosov"}`).join("\n")}
        >
          {besediloNalogov(izloceni.length)} ni štetih (brez štempljanja v oddelku ali brez kosov)
        </div>
      )}
    </div>
  );
}

// =====================================================================
// LEGENDA
// =====================================================================

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
      <span className="flex items-center gap-1.5" title="Planirane ure delovnega plana (zaposleni × ure na dan)">
        <span className="h-3 w-3 rounded-sm bg-fines-500" aria-hidden /> Plan
      </span>
      {KATEGORIJE.map((k) => (
        <span key={k.koda} className="flex items-center gap-1.5" title={k.opis}>
          <span className={`h-3 w-3 rounded-sm ${BARVA[k.koda]}`} aria-hidden /> {k.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5" title="Poročane ure nad planiranimi urami dneva">
        <span className={`h-3 w-3 rounded-sm ${BARVA_PRESEZEK}`} aria-hidden /> Nad planom
      </span>
      <span className="text-ink-500" title="Vse poročane ure na delovnem mestu proti planiranim uram dneva. + = več ur kot plan, − = manj.">
        Pod stolpcem = <strong>ure</strong> proti planu (+ čez plan) · <strong>%</strong> je vedno produktivnost
      </span>
    </div>
  );
}

// =====================================================================
// ČASOVNICA
// =====================================================================

function Casovnica({
  celice,
  dnevi,
  rezultat,
  ureNaDan,
  danes,
  siroko,
  onOdpri,
}: {
  celice: Celica[];
  dnevi: IsoDate[];
  rezultat: Map<string, DanCelice>;
  ureNaDan: number;
  danes: IsoDate;
  siroko: boolean;
  onOdpri: (d: DanCelice) => void;
}) {
  const sirinaDneva = siroko ? 120 : 52;
  const stolpci = `${SIRINA_IMENA}px repeat(${dnevi.length}, minmax(${sirinaDneva}px, 1fr))`;
  const minSirina = SIRINA_IMENA + dnevi.length * sirinaDneva;
  const imaNerazporejeno = dnevi.some((d) => rezultat.has(kljucDneva(NERAZPOREJENO, d)));
  const vrstice: { id: number; naziv: string; opis?: string }[] = [
    ...celice.map((c) => ({ id: c.id, naziv: c.naziv })),
    ...(imaNerazporejeno
      ? [{ id: NERAZPOREJENO, naziv: "Nerazporejeno", opis: "Delo ljudi oddelka na nalogih izven plana, ki ga ni mogoče pripisati celici" }]
      : []),
  ];

  // Oddelek skupaj (brez Nerazporejeno pri planu - plan ga nima)
  const skupaj = (d: IsoDate) => {
    let plan = 0;
    let por = 0;
    for (const v of vrstice) {
      const x = rezultat.get(kljucDneva(v.id, d));
      plan += x?.planUre ?? 0;
      por += x?.porocano ?? 0;
    }
    return { plan, por };
  };

  if (!celice.length) return <div className="p-8 text-center text-ink-600">Oddelek nima aktivnih delovnih mest.</div>;

  return (
    <div className="overflow-x-auto pb-2">
      <div style={{ minWidth: minSirina }} className="flex flex-col gap-2">
        {/* ---------- glava dni ---------- */}
        <div className="grid" style={{ gridTemplateColumns: stolpci }}>
          <div className="sticky left-0 z-10 flex items-end bg-white px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Delovno mesto
          </div>
          {dnevi.map((d, i) => {
            const ponedeljek = weekday(d) === 1 || i === 0;
            return (
              <div key={d} className={`px-0.5 pb-1 text-center ${ponedeljek ? "border-l-2 border-ink-300" : "border-l border-ink-100"}`}>
                <div className="h-4 text-[10px] font-bold uppercase text-ink-400">{ponedeljek && siroko ? `${isoWeek(d)}. teden` : ponedeljek ? `T${isoWeek(d)}` : ""}</div>
                <div className={`rounded-md py-0.5 text-xs font-bold ${d === danes ? "bg-sync-500 text-white" : weekday(d) > 5 ? "text-ink-400" : "text-ink-800"}`} title={formatShort(d)}>
                  {siroko ? `${DAN_IME[weekday(d) - 1]} ${formatDayMonth(d)}` : formatDayMonth(d)}
                </div>
              </div>
            );
          })}
        </div>

        {/* ---------- oddelek skupaj ---------- */}
        <div className="grid rounded-lg bg-ink-800 text-white" style={{ gridTemplateColumns: stolpci }}>
          <div className="sticky left-0 z-10 rounded-l-lg bg-ink-800 px-2 py-2 text-sm font-bold" title="Skupaj vsa delovna mesta oddelka">
            Oddelek skupaj
          </div>
          {dnevi.map((d, i) => {
            const { plan, por } = skupaj(d);
            const p = porabaDneva(plan, por);
            return (
              <div
                key={d}
                className={`px-0.5 py-1.5 text-center text-xs tabular-nums ${weekday(d) === 1 || i === 0 ? "border-l-2 border-ink-600" : ""}`}
                title={`Oddelek, ${formatShort(d)}: plan ${formatUre(plan)} h, poročano ${formatUre(por)} h, razlika ${formatRazlikaUr(por - plan)}`}
              >
                <div>
                  {formatUre(plan)}/<strong>{formatUre(por)}</strong>
                  {siroko ? " h" : ""}
                </div>
                <div className={`font-bold ${barvaPorabe(p, true)}`}>{p === null ? "–" : formatRazlikaUr(por - plan)}</div>
              </div>
            );
          })}
        </div>

        {/* ---------- delovna mesta ---------- */}
        {vrstice.map((c) => {
          const dneviCelice = dnevi.map((d) => rezultat.get(kljucDneva(c.id, d)) ?? null);
          // Merilo vrstice: največ planiranih ali poročanih ur v prikazanih dneh (vsaj ena oseba)
          const max = Math.max(ureNaDan, ...dneviCelice.map((x) => Math.max(x?.planUre ?? 0, x?.porocano ?? 0)));
          const planSkupaj = dneviCelice.reduce((s, x) => s + (x?.planUre ?? 0), 0);
          const porSkupaj = dneviCelice.reduce((s, x) => s + (x?.porocano ?? 0), 0);
          const p = porabaDneva(planSkupaj, porSkupaj);
          return (
            <div key={c.id} className="grid rounded-lg border border-ink-200" style={{ gridTemplateColumns: stolpci }}>
              <div className="sticky left-0 z-10 flex flex-col justify-center gap-1 rounded-l-lg bg-ink-50 px-2 py-2" title={c.opis ?? c.naziv}>
                <span className="text-sm font-bold text-ink-900">{c.naziv}</span>
                <span className="text-xs tabular-nums text-ink-600">
                  {formatUre(planSkupaj)} / {formatUre(porSkupaj)} h
                </span>
                <span className={`text-sm font-bold ${barvaPorabe(p)}`} title="Ure obdobja: poročane proti planiranim (+ = čez plan)">
                  {p === null ? "–" : formatRazlikaUr(porSkupaj - planSkupaj)}
                </span>
                <span className="text-[10px] text-ink-400">merilo {formatUre(max)} h</span>
              </div>
              {dnevi.map((d, i) => (
                <StolpecDneva
                  key={d}
                  dan={dneviCelice[i]}
                  datum={d}
                  celica={c.naziv}
                  max={max}
                  ureNaDan={ureNaDan}
                  siroko={siroko}
                  meja={weekday(d) === 1 || i === 0}
                  danes={d === danes}
                  onOdpri={onOdpri}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VRSTNI_RED: Kategorija[] = ["plan", "pred", "po", "izven", "rezija"];

function StolpecDneva({
  dan,
  datum,
  celica,
  max,
  ureNaDan,
  siroko,
  meja,
  danes,
  onOdpri,
}: {
  dan: DanCelice | null;
  datum: IsoDate;
  celica: string;
  max: number;
  ureNaDan: number;
  siroko: boolean;
  meja: boolean;
  danes: boolean;
  onOdpri: (d: DanCelice) => void;
}) {
  const okvir = `relative flex flex-col items-stretch px-1 pt-2 ${meja ? "border-l-2 border-ink-300" : "border-l border-ink-100"} ${danes ? "bg-sync-50" : ""}`;
  if (!dan || (dan.planUre <= 0 && dan.porocano <= 0)) {
    return (
      <div className={okvir}>
        <div style={{ height: VISINA_GRAFA }} />
        <div className="h-5" />
      </div>
    );
  }
  const h = (ure: number) => (ure / max) * VISINA_GRAFA;
  const p = porabaDneva(dan.planUre, dan.porocano);

  // Poročano: kategorije zložene od spodaj; del nad planom je rdeč
  const segmenti: { kat: Kategorija; od: number; do: number; nad: boolean }[] = [];
  let kum = 0;
  for (const kat of VRSTNI_RED) {
    const u = dan.ure[kat];
    if (u <= 0) continue;
    const zacetek = kum;
    const konec = kum + u;
    if (zacetek < dan.planUre) segmenti.push({ kat, od: zacetek, do: Math.min(konec, dan.planUre), nad: false });
    if (konec > dan.planUre) segmenti.push({ kat, od: Math.max(zacetek, dan.planUre), do: konec, nad: true });
    kum = konec;
  }

  const planOseb = ureNaDan > 0 ? dan.planUre / ureNaDan : 0;
  const hover = [
    `${celica} · ${DAN_IME[weekday(datum) - 1]} ${formatShort(datum)}`,
    `Plan: ${formatUre(dan.planUre)} h (${formatNum(Math.round(planOseb * 10) / 10)} os.)${dan.plan.length ? ` - ${dan.plan.map((x) => `${x.krovni} ${formatUre(x.ure)} h`).join(", ")}` : ""}`,
    `Poročano: ${formatUre(dan.porocano)} h (${dan.osebe.length} os.)`,
    ...VRSTNI_RED.filter((k) => dan.ure[k] > 0).map((k) => `  ${labelKategorije(k)}: ${formatUre(dan.ure[k])} h`),
    `Razlika do plana: ${p === null ? "ni plana" : formatRazlikaUr(dan.porocano - dan.planUre)}`,
    "Klik: podrobnosti poročanega dela",
  ].join("\n");

  return (
    <button type="button" title={hover} onClick={() => onOdpri(dan)} className={`${okvir} group text-left hover:bg-fines-50`}>
      <div className="relative w-full" style={{ height: VISINA_GRAFA }}>
        {/* plan - oranžen stolpec, en del za vsak krovni */}
        <div className="absolute bottom-0 left-[8%] flex w-[52%] flex-col-reverse overflow-hidden rounded-t-md">
          {dan.plan.map((x, i) => (
            <div
              key={x.postavitevId}
              className={`flex items-center justify-center overflow-hidden border-t border-white/70 text-[10px] font-bold text-white ${i % 2 ? "bg-fines-300" : "bg-fines-500"}`}
              style={{ height: h(x.ure) }}
            >
              {siroko && h(x.ure) >= 14 ? x.krovni : ""}
            </div>
          ))}
        </div>
        {/* poročano - ožji stolpec desno ob planu */}
        <div className="absolute bottom-0 left-[62%] w-[26%]" style={{ height: h(dan.porocano) }}>
          {segmenti.map((s, i) => (
            <div
              key={i}
              className={`absolute left-0 right-0 ${s.nad ? BARVA_PRESEZEK : BARVA[s.kat]} ${i === segmenti.length - 1 ? "rounded-t-sm" : ""}`}
              style={{ bottom: h(s.od), height: Math.max(1, h(s.do - s.od)) }}
            />
          ))}
        </div>
        {/* črta plana */}
        {dan.planUre > 0 && <div className="absolute left-[4%] right-[4%] border-t-2 border-dashed border-ink-700/60" style={{ bottom: h(dan.planUre) }} />}
      </div>
      <div className={`flex h-5 items-center justify-center text-xs font-bold tabular-nums ${barvaPorabe(p)}`}>
        {p === null ? (
          "–"
        ) : siroko ? (
          <span>
            {formatRazlikaUr(dan.porocano - dan.planUre)} <span className="font-normal text-ink-500">· {formatUre(dan.porocano)} h</span>
          </span>
        ) : (
          formatRazlikaUr(dan.porocano - dan.planUre).replace(" h", "")
        )}
      </div>
    </button>
  );
}

// =====================================================================
// KONTROLA PRODUKTIVNOSTI - DESNI PANEL (pregled krovnih s premicama ur)
// =====================================================================

type RazvrstitevPanela = "zacetek" | "odstopanje";

/**
 * Za vsak krovni dve premici na istem merilu: zgoraj planirane ure (oranžno, številka nad njo), spodaj štempljane
 * ure na nalogih krovnega - zeleno, dokler jih je manj ali enako kot plan, rdeče, ko jih je več.
 */
function PanelProduktivnosti({
  vrstice,
  samoObdobje,
  onSamoObdobje,
  onOdpri,
}: {
  /** null = podatki se še nalagajo */
  vrstice: KontrolaPostavitve[] | null;
  samoObdobje: boolean;
  onSamoObdobje: (v: boolean) => void;
  onOdpri: (k: KontrolaPostavitve) => void;
}) {
  const [razvrstitev, setRazvrstitev] = useState<RazvrstitevPanela>("zacetek");
  const vse = vrstice ?? [];
  const prikaz =
    razvrstitev === "zacetek" ? vse : [...vse].sort((a, b) => b.porocano - b.planUre - (a.porocano - a.planUre));
  const plan = vse.reduce((s, k) => s + k.planUre, 0);
  const por = vse.reduce((s, k) => s + k.porocano, 0);
  const cez = vse.filter((k) => k.porocano > k.planUre + 1e-6).length;

  const RAZVRSTITVE: { v: RazvrstitevPanela; label: string; hint: string }[] = [
    { v: "zacetek", label: "Po začetku", hint: "Razvrsti krovne po začetku plana" },
    { v: "odstopanje", label: "Največ čez plan", hint: "Razvrsti krovne po urah nad planom (največ zgoraj)" },
  ];

  return (
    <div className="fp-card flex min-h-0 flex-col gap-3 p-3 sm:p-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-7rem)]">
      <div>
        <h3 className="text-lg font-bold text-ink-900">Kontrola produktivnosti</h3>
        <p className="text-xs text-ink-500">
          Krovni nalogi plana · zgoraj planirane ure, spodaj štempljane ure na nalogih krovnega (zeleno do plana, rdeče čez plan)
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Razvrstitev krovnih">
        {RAZVRSTITVE.map((r) => (
          <button
            key={r.v}
            type="button"
            aria-pressed={razvrstitev === r.v}
            title={r.hint}
            onClick={() => setRazvrstitev(r.v)}
            className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
              razvrstitev === r.v
                ? "border-fines-500 bg-fines-500 text-white"
                : "border-ink-200 bg-white text-ink-600 hover:border-fines-500 hover:text-fines-500"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-auto">
          <FilterCheckbox
            label="Samo v obdobju"
            checked={samoObdobje}
            onChange={onSamoObdobje}
            hint="Pokaži samo krovne, planirane ali delane v prikazanem obdobju"
          />
        </span>
      </div>

      {vrstice === null ? (
        <Loading />
      ) : (
        <>
          {/* skupaj */}
          <div className="rounded-lg bg-ink-50 px-3 py-2" title="Vsi prikazani krovni skupaj">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-semibold text-ink-700">
                Skupaj {vse.length} krovnih{cez > 0 && <span className="text-nok-600"> · {cez} čez plan</span>}
              </span>
            </div>
            <Premici plan={plan} porocano={por} />
          </div>

          <div className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1 max-xl:max-h-[70vh] xl:flex-1">
            {prikaz.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-500">Ni krovnih nalogov za izbrano obdobje.</p>
            ) : (
              prikaz.map((k) => (
                <button
                  key={k.postavitev.id}
                  type="button"
                  onClick={() => onOdpri(k)}
                  title={[
                    `Krovni ${k.postavitev.krovni_dn} · ${k.celica}`,
                    `Plan ${formatUre(k.planUre)} h, štempljano ${formatUre(k.porocano)} h (${formatRazlikaUr(k.porocano - k.planUre)} do plana)`,
                    k.zasluzeno !== null ? `Zasluženo ${formatUre(k.zasluzeno)} h · produktivnost ${fmtPct(k.produktivnost)}` : "Prosta naloga - brez napredka",
                    "Klik: poročano delo na nalogih krovnega",
                  ].join("\n")}
                  className="flex flex-col gap-1 rounded-lg border border-ink-200 px-3 py-2 text-left transition-colors hover:border-fines-500 hover:bg-fines-50"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-bold text-ink-900">{k.postavitev.krovni_dn}</span>
                    <span className="ml-auto truncate text-[11px] text-ink-500">{k.celica}</span>
                  </div>
                  <div className="flex items-baseline gap-2 text-xs tabular-nums text-ink-600">
                    <span>{k.od && k.do ? `${formatShort(k.od)} - ${formatShort(k.do)}` : "ni razporejen"}</span>
                    {k.napredek && <span className="ml-auto text-ink-500">izdelano {Math.round(delezNapredka(k.napredek) * 100)} %</span>}
                  </div>
                  <Premici plan={k.planUre} porocano={k.porocano} />
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Dve premici na skupnem merilu: plan (zgoraj, številka nad njo) in štempljano (spodaj, zeleno / rdeče). */
function Premici({ plan, porocano }: { plan: number; porocano: number }) {
  const max = Math.max(plan, porocano);
  const w = (u: number) => (max > 0 ? `${(u / max) * 100}%` : "0%");
  const cez = porocano > plan + 1e-6;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-xs font-bold tabular-nums text-ink-800">{formatUre(plan)} h</div>
      <div className="h-2.5 w-full rounded-sm bg-ink-100">
        <div className="h-full rounded-sm bg-fines-500" style={{ width: w(plan) }} />
      </div>
      <div className="h-2.5 w-full rounded-sm bg-ink-100">
        <div className={`h-full rounded-sm ${cez ? "bg-nok-500" : "bg-ok-500"}`} style={{ width: w(porocano) }} />
      </div>
      <div className={`text-xs font-semibold tabular-nums ${cez ? "text-nok-600" : "text-ok-600"}`}>
        {formatUre(porocano)} h štempljano
        {cez && <span className="font-normal"> · +{formatUre(porocano - plan)} h</span>}
      </div>
    </div>
  );
}

// =====================================================================
// KONTROLA PRODUKTIVNOSTI (krovni nalogi plana)
// =====================================================================

type KolonaK = "celica" | "krovni" | "od" | "do" | "plan" | "izdelano" | "zasluzeno" | "porocano" | "osebe" | "produktivnost";

function KontrolaProduktivnosti({
  vrstice,
  samoObdobje,
  onSamoObdobje,
  onOdpri,
  ime,
}: {
  vrstice: KontrolaPostavitve[];
  samoObdobje: boolean;
  onSamoObdobje: (v: boolean) => void;
  onOdpri: (k: KontrolaPostavitve) => void;
  ime: string;
}) {
  const sort = useRazvrscanje<KontrolaPostavitve, KolonaK>({
    celica: (k) => k.celica,
    krovni: (k) => k.postavitev.krovni_dn,
    od: (k) => k.od,
    do: (k) => k.do,
    plan: (k) => k.planUre,
    izdelano: (k) => (k.napredek ? delezNapredka(k.napredek) : null),
    zasluzeno: (k) => k.zasluzeno,
    porocano: (k) => k.porocano,
    osebe: (k) => k.osebe.length,
    produktivnost: (k) => k.produktivnost,
  });
  const prikaz = sort.razvrsti(vrstice);
  const vsota = (f: (k: KontrolaPostavitve) => number | null) => vrstice.reduce((s, k) => s + (f(k) ?? 0), 0);
  const zasluzeno = vsota((k) => k.zasluzeno);
  const porocano = vsota((k) => (k.zasluzeno === null ? 0 : k.porocano));

  return (
    <div className="fp-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <FilterVrstica>
        <div className="mr-auto min-w-[min(100%,18rem)] flex-1 self-center">
          <h3 className="text-base font-bold text-ink-900">Kontrola produktivnosti</h3>
          <p className="text-xs text-ink-500">
            Krovni nalogi plana po začetku. Zasluženo = planirane ure × delež izdelanih kosov (koliko ur je po normativu vredno
            tisto, kar je narejeno). Produktivnost = zasluženo / poročano (100 % = delajo po normativu).
          </p>
        </div>
        <FilterCheckbox
          label="Samo v prikazanem obdobju"
          checked={samoObdobje}
          onChange={onSamoObdobje}
          hint="Pokaži samo krovne, planirane ali delane v obdobju"
        />
        <Izvoz
          spomin="produktivnost-kontrola"
          formati={[
            {
              koda: "xlsx",
              label: "Excel (.xlsx)",
              hint: "Kontrolo produktivnosti v Excel",
              disabled: !vrstice.length,
              zakaj: "Ni krovnih nalogov",
              akcija: () => izvoziKontroloXlsx(prikaz, ime),
            },
          ]}
        />
      </FilterVrstica>
      <TabelaOkvir>
        <table className="w-full text-sm">
          <thead className="fp-thead">
            <tr>
              <SortTh sort={sort} kljuc="celica">Delovno mesto</SortTh>
              <SortTh sort={sort} kljuc="krovni">Krovni</SortTh>
              <SortTh sort={sort} kljuc="od">Plan od</SortTh>
              <SortTh sort={sort} kljuc="do">Plan do</SortTh>
              <SortTh sort={sort} kljuc="plan" desno>Plan h</SortTh>
              <SortTh sort={sort} kljuc="izdelano" desno>Izdelano</SortTh>
              <SortTh sort={sort} kljuc="zasluzeno" desno hint="Planirane ure × delež izdelanih kosov">Zasluženo h</SortTh>
              <SortTh sort={sort} kljuc="porocano" desno>Poročano h</SortTh>
              <SortTh sort={sort} kljuc="osebe" desno>Osebe</SortTh>
              <SortTh sort={sort} kljuc="produktivnost" desno hint="Zaslužene / poročane ure">Produktivnost</SortTh>
            </tr>
          </thead>
          <tbody>
            {prikaz.map((k) => (
              <tr
                key={k.postavitev.id}
                className="cursor-pointer border-b border-ink-100 hover:bg-ink-50"
                onClick={() => onOdpri(k)}
                title="Klik: poročano delo na nalogih krovnega"
              >
                <td className="px-2 py-1.5">{k.celica}</td>
                <td className="px-2 py-1.5 font-mono font-semibold">{k.postavitev.krovni_dn}</td>
                <td className="px-2 py-1.5">{k.od ? formatShort(k.od) : ""}</td>
                <td className="px-2 py-1.5">{k.do ? formatShort(k.do) : ""}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatUre(k.planUre)}</td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  title={
                    !k.napredek
                      ? "Prosta naloga - brez napredka"
                      : k.napredek.razpisano > 0
                        ? `${formatNum(k.napredek.izdelano)}/${formatNum(k.napredek.razpisano)} kos`
                        : "Vsi nalogi zaključeni (niso več v uvozu)"
                  }
                >
                  {k.napredek ? `${Math.round(delezNapredka(k.napredek) * 100)} %` : "–"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{k.zasluzeno === null ? "–" : formatUre(k.zasluzeno)}</td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  title={`V planu ${formatUre(k.ure.plan)} h · pred planom ${formatUre(k.ure.pred)} h · po planu ${formatUre(k.ure.po)} h`}
                >
                  <strong>{formatUre(k.porocano)}</strong>
                  {(k.ure.pred > 0 || k.ure.po > 0) && (
                    <div className="text-[11px] text-ink-500">
                      {k.ure.pred > 0 && <span className="text-sync-600">pred {formatUre(k.ure.pred)} </span>}
                      {k.ure.po > 0 && <span className="text-warn-700">po {formatUre(k.ure.po)}</span>}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" title={k.osebe.join(", ")}>
                  {k.osebe.length}
                </td>
                <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${barvaProduktivnosti(k.produktivnost)}`}>{fmtPct(k.produktivnost)}</td>
              </tr>
            ))}
            {prikaz.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-6 text-center text-ink-500">
                  Ni krovnih nalogov za izbrane filtre.
                </td>
              </tr>
            )}
          </tbody>
          {prikaz.length > 0 && (
            <tfoot>
              <tr className="bg-ink-100 font-bold">
                <td className="px-2 py-2" colSpan={4}>
                  Skupaj ({prikaz.length})
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{formatUre(vsota((k) => k.planUre))}</td>
                <td />
                <td className="px-2 py-2 text-right tabular-nums">{formatUre(zasluzeno)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatUre(vsota((k) => k.porocano))}</td>
                <td />
                <td className={`px-2 py-2 text-right tabular-nums ${barvaProduktivnosti(porocano > 0 ? zasluzeno / porocano : null)}`} title="Zaslužene / poročane ure (brez prostih nalog)">
                  {fmtPct(porocano > 0 ? zasluzeno / porocano : null)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </TabelaOkvir>
    </div>
  );
}

// =====================================================================
// PODROBNOSTI
// =====================================================================

function PodrobnostiDneva({ dan, celica, onClose }: { dan: DanCelice; celica: string; onClose: () => void }) {
  const p = porabaDneva(dan.planUre, dan.porocano);
  return (
    <Modal open title={`${celica} · ${DAN_IME[weekday(dan.datum) - 1]} ${formatShort(dan.datum)}`} onClose={onClose} sirina="max-w-5xl">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stevilka label="Plan" vrednost={`${formatUre(dan.planUre)} h`} opis={dan.plan.map((x) => `${x.krovni}: ${formatUre(x.ure)} h`).join(" · ") || "ni plana"} />
          <Stevilka label="Poročano" vrednost={`${formatUre(dan.porocano)} h`} opis={`${dan.osebe.length} oseb`} />
          <Stevilka label="V planu" vrednost={`${formatUre(dan.ure.plan)} h`} opis={`izven / drugo ${formatUre(dan.porocano - dan.ure.plan)} h`} />
          <Stevilka label="Razlika do plana" vrednost={p === null ? "–" : formatRazlikaUr(dan.porocano - dan.planUre)} opis="poročano − plan (+ = čez plan)" cls={barvaPorabe(p)} />
        </div>
        <OsebeTabela delo={dan.delo} />
        <DeloTabela delo={dan.delo} />
      </div>
    </Modal>
  );
}

function PodrobnostiKrovnega({ k, onClose }: { k: KontrolaPostavitve; onClose: () => void }) {
  return (
    <Modal open title={`Krovni ${k.postavitev.krovni_dn} · ${k.celica}`} onClose={onClose} sirina="max-w-5xl">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stevilka label="Plan" vrednost={`${formatUre(k.planUre)} h`} opis={k.od && k.do ? `${formatShort(k.od)} - ${formatShort(k.do)}` : "ni razporejen"} />
          <Stevilka
            label="Zasluženo"
            vrednost={k.zasluzeno === null ? "–" : `${formatUre(k.zasluzeno)} h`}
            opis={k.napredek ? `izdelano ${formatNum(k.napredek.izdelano)}/${formatNum(k.napredek.razpisano)} kos` : ""}
          />
          <Stevilka
            label="Poročano"
            vrednost={`${formatUre(k.porocano)} h`}
            opis={k.prviDan && k.zadnjiDan ? `${formatShort(k.prviDan)} - ${formatShort(k.zadnjiDan)} · ${k.osebe.length} oseb` : "ni poročanega dela"}
          />
          <Stevilka label="Produktivnost" vrednost={fmtPct(k.produktivnost)} opis="zasluženo / poročano" cls={barvaProduktivnosti(k.produktivnost)} />
        </div>
        <OsebeTabela delo={k.delo} />
        <DeloTabela delo={k.delo} zDatumom />
      </div>
    </Modal>
  );
}

function Stevilka({ label, vrednost, opis, cls = "text-ink-900" }: { label: string; vrednost: string; opis: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2" title={opis}>
      <div className="text-xs font-semibold text-ink-600">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${cls}`}>{vrednost}</div>
      <div className="truncate text-xs text-ink-500">{opis}</div>
    </div>
  );
}

type OsebaVrstica = { ime: string; ure: number } & Record<Kategorija, number>;
type KolonaO = "ime" | "ure" | Kategorija;

function OsebeTabela({ delo }: { delo: PripisanoDelo[] }) {
  const osebe = useMemo(() => {
    const m = new Map<string, OsebaVrstica>();
    for (const v of delo) {
      const ime = v.ime_delavca ?? v.delavec;
      const o = m.get(ime) ?? { ime, ure: 0, plan: 0, pred: 0, po: 0, izven: 0, rezija: 0 };
      o.ure += v.ure;
      o[v.kategorija] += v.ure;
      m.set(ime, o);
    }
    return [...m.values()].sort((a, b) => b.ure - a.ure);
  }, [delo]);
  const sort = useRazvrscanje<OsebaVrstica, KolonaO>({
    ime: (o) => o.ime,
    ure: (o) => o.ure,
    plan: (o) => o.plan,
    pred: (o) => o.pred,
    po: (o) => o.po,
    izven: (o) => o.izven,
    rezija: (o) => o.rezija,
  });
  if (!osebe.length) return null;
  return (
    <TabelaOkvir>
      <table className="w-full text-sm">
        <thead className="fp-thead">
          <tr>
            <SortTh sort={sort} kljuc="ime">Oseba</SortTh>
            <SortTh sort={sort} kljuc="ure" desno>Skupaj h</SortTh>
            {KATEGORIJE.map((k) => (
              <SortTh key={k.koda} sort={sort} kljuc={k.koda} desno hint={k.opis}>
                {k.label}
              </SortTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {sort.razvrsti(osebe).map((o) => (
            <tr key={o.ime} className="border-b border-ink-100 hover:bg-ink-50">
              <td className="px-2 py-1.5 font-semibold">{o.ime}</td>
              <td className="px-2 py-1.5 text-right font-bold tabular-nums">{formatUre(o.ure)}</td>
              {KATEGORIJE.map((k) => (
                <td key={k.koda} className="px-2 py-1.5 text-right tabular-nums text-ink-700">
                  {o[k.koda] > 0 ? formatUre(o[k.koda]) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TabelaOkvir>
  );
}

type KolonaD = "datum" | "kategorija" | "krovni" | "nalog" | "opis" | "delavec" | "operacija" | "cas" | "ure";

const ZNACKA: Record<Kategorija, string> = {
  plan: "bg-ok-500 text-white",
  pred: "bg-sync-500 text-white",
  po: "bg-warn-400 text-ink-900",
  izven: "bg-ink-400 text-white",
  rezija: "bg-ink-200 text-ink-700",
};

function DeloTabela({ delo, zDatumom }: { delo: PripisanoDelo[]; zDatumom?: boolean }) {
  const sort = useRazvrscanje<PripisanoDelo, KolonaD>({
    datum: (v) => v.datum,
    kategorija: (v) => VRSTNI_RED.indexOf(v.kategorija),
    krovni: (v) => v.krovni,
    nalog: (v) => v.st_naloga,
    opis: (v) => v.opis,
    delavec: (v) => v.ime_delavca ?? v.delavec,
    operacija: (v) => v.naziv_operacije,
    cas: (v) => v.zacetek,
    ure: (v) => v.ure,
  });
  const privzeto = useMemo(
    () => [...delo].sort((a, b) => a.datum.localeCompare(b.datum) || (a.zacetek ?? "").localeCompare(b.zacetek ?? "")),
    [delo],
  );
  if (!delo.length) return <div className="py-6 text-center text-sm text-ink-500">Ni poročanega dela.</div>;
  return (
    <TabelaOkvir>
      <table className="w-full text-sm">
        <thead className="fp-thead">
          <tr>
            {zDatumom && <SortTh sort={sort} kljuc="datum">Datum</SortTh>}
            <SortTh sort={sort} kljuc="kategorija">Kategorija</SortTh>
            <SortTh sort={sort} kljuc="krovni">Krovni</SortTh>
            <SortTh sort={sort} kljuc="nalog">Nalog</SortTh>
            <SortTh sort={sort} kljuc="opis">Opis</SortTh>
            <SortTh sort={sort} kljuc="delavec">Delavec</SortTh>
            <SortTh sort={sort} kljuc="operacija">Operacija</SortTh>
            <SortTh sort={sort} kljuc="cas">Čas</SortTh>
            <SortTh sort={sort} kljuc="ure" desno>Ure</SortTh>
          </tr>
        </thead>
        <tbody>
          {sort.razvrsti(privzeto).map((v) => (
            <tr key={v.id} className="border-b border-ink-100 hover:bg-ink-50">
              {zDatumom && <td className="whitespace-nowrap px-2 py-1.5">{formatShort(v.datum)}</td>}
              <td className="px-2 py-1.5">
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${ZNACKA[v.kategorija]}`}>{labelKategorije(v.kategorija)}</span>
              </td>
              <td className="px-2 py-1.5 font-mono">{v.krovni ?? ""}</td>
              <td className="px-2 py-1.5 font-mono">{v.st_naloga}</td>
              <td className="px-2 py-1.5" title={v.ident ?? ""}>
                {v.opis}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5">{v.ime_delavca ?? v.delavec}</td>
              <td className="px-2 py-1.5">{v.naziv_operacije ?? v.operacija}</td>
              <td className="whitespace-nowrap px-2 py-1.5 tabular-nums" title={v.st_vnosov > 1 ? `${v.st_vnosov} vnosov` : undefined}>
                {ura(v.zacetek)}-{ura(v.konec)}
              </td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatUre(v.ure)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabelaOkvir>
  );
}
