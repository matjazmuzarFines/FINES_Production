"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { addDays, formatDatumUra, formatDayMonth, formatShort, isoWeek, mondayOf, toIso, type IsoDate } from "@/lib/dates";
import { naloziDruzine, naloziNormative, type Normativ, type OddelekKoda } from "@/lib/normativi";
import { imaNeshranjeno, lahkoZapustim, useNeshranjeno } from "@/lib/neshranjeno";
import { PodatkiVir } from "@/components/PodatkiVir";
import { usePoSyncu } from "@/components/SyncProvider";
import {
  delezNapredka,
  izvoziPlanXlsx,
  napredekPostavitve,
  pretvoriStarePostavitve,
  pripraviWorkflow,
  jeDelovniDan,
  kosiKrovnega,
  naloziCelice,
  naloziPostavitve,
  naloziZaposlene,
  nalogiPostavitve,
  razporedi,
  shraniPlan,
  shraniPrivzetoCelice,
  stanjeKrovnega,
  jeZaklenjena,
  ureNalogov,
  urePoKosu,
  urePostavitve,
  zdruziKrovne,
  type Celica,
  type Krovni,
  type KosNaloga,
  type Napredek,
  type Postavitev,
  type Razpored,
  type StanjeKrovnega,
  type ZaposleniDan,
} from "@/lib/plan";
import { naloziMaterial, type Material } from "@/lib/material";
import {
  izracunajPrioritete,
  naloziZadnjiOdpUvoz,
  naloziZadnjiPriUvoz,
  odpremePoNalogih,
  preberiNastavitvePrioritet,
  type Odprema,
  type Postavka,
  type PostavkaIzracun,
  type PriUvoz,
} from "@/lib/prioritete";
import { kontrolaPlana } from "@/lib/kontrolaPlana";
import { naloziSyncCase, type SyncCasi } from "@/lib/syncMapa";
import { SYNC_DATOTEKE, type SyncDatotekaKljuc } from "@/lib/syncDatoteke";
import { zamudePlana } from "@/lib/zamudePlana";
import { formatNum, formatUre, formatVnos, parseNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import {
  izracunajNaloge,
  naloziZadnjiUvoz,
  naloziZasOddelke,
  type Nalog,
  type NalogIzracun,
  type Uvoz,
  type ZasOddelek,
} from "@/lib/zasedenost";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Izvoz } from "@/components/ui/Izvoz";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { Zavihki } from "@/components/ui/Zavihki";
import { SortTh, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { SaveBar } from "@/components/rutina/SaveBar";
import { KontrolaPlana } from "./KontrolaPlana";
import { ZamudeDobav } from "./ZamudeDobav";

const DAN_IME = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];
const SIRINA_IMENA = 170; // px - stolpec z imenom delovnega mesta
const MIN_DAN = 78; // px - najmanjša širina dneva
const VISINA_PASU = 38; // px - en pas postavitev
const TEDNI_IZBIRA = [1, 2, 4] as const;
const KONTROLA_KLJUC = "fp-delovni-plan-kontrola"; // panel Kontrola plana odprt (brskalnik)
const PRAZEN_MATERIAL = new Map<string, Material>();

type Pogled = "plan" | "zamude";
/** Hatch za dni nad 100 %: oranžno-rdeče črte. */
const PRESEZEK_CRTE = "bg-[repeating-linear-gradient(-45deg,var(--color-nok-500)_0_4px,var(--color-fines-500)_4px_8px)]";
/** Ozadje traku na dneh nad 100 %: rdeče poševne črte čez oranžno (besedilo traku ostane nad njimi). */
const PRESEZEK_TRAK = "bg-[repeating-linear-gradient(-45deg,var(--color-nok-500)_0_5px,transparent_5px_10px)]";
/** Kateri izvozi se gledajo za opozorilo "novejši podatki". */
const IZVOZI_PRI: SyncDatotekaKljuc[] = ["narocila", "odpreme", "material"];

type Vlecenje = { tip: "krovni"; kljuc: string } | { tip: "postavitev"; id: number };
type FilterKrovnih = "nerazporejeni" | "z_urami" | "vsi";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Barva obremenitve: do 85 % zelena, do 100 % rumena, nad 100 % rdeča (enako kot Pregled zasedenosti). */
function obremenitev(potrebno: number, naVoljo: number) {
  const pct = naVoljo > 0 ? (potrebno / naVoljo) * 100 : potrebno > 0 ? Infinity : 0;
  const cls = pct > 100 ? "bg-nok-500" : pct > 85 ? "bg-warn-400" : "bg-ok-500";
  const txt = pct > 100 ? "text-nok-600" : pct > 85 ? "text-warn-700" : "text-ok-600";
  return { pct, cls, txt };
}

const fmtPct = (pct: number) => (Number.isFinite(pct) ? `${Math.round(pct)} %` : "∞");

type Podatki = {
  oddelki: ZasOddelek[];
  uvoz: Uvoz | null;
  nalogi: Nalog[];
  normativi: Normativ[];
  celice: Celica[];
  postavitve: Postavitev[];
  zaposleni: ZaposleniDan[];
};

/** Podatki za kontrolo plana (isti kot na Prioritetah); naložijo se ob prvem odprtju panela. */
type PriPodatki = { uvoz: PriUvoz | null; postavke: Postavka[]; odpreme: Odprema[]; material: Map<string, Material> };

async function naloziPriPodatke(): Promise<PriPodatki> {
  const [pri, odp, mat] = await Promise.all([
    naloziZadnjiPriUvoz(),
    naloziZadnjiOdpUvoz().catch(() => ({ odpreme: [] as Odprema[] })),
    naloziMaterial().catch(() => ({ material: new Map<string, Material>() })),
  ]);
  return { uvoz: pri.uvoz, postavke: pri.postavke, odpreme: odp.odpreme, material: mat.material };
}

function preberiKontrolo() {
  try {
    return localStorage.getItem(KONTROLA_KLJUC) === "1";
  } catch {
    return false;
  }
}

async function naloziPodatke(): Promise<Podatki> {
  const danes = toIso(new Date());
  const [oddelki, u, normativi, celice, postavitve, zaposleni] = await Promise.all([
    naloziZasOddelke(),
    naloziZadnjiUvoz(),
    naloziNormative(true),
    naloziCelice(danes),
    naloziPostavitve(),
    naloziZaposlene(addDays(danes, -180), addDays(danes, 400)),
  ]);
  return { oddelki, uvoz: u.uvoz, nalogi: u.nalogi, normativi, celice, postavitve, zaposleni };
}

export function DelovniPlan({ koda }: { koda: OddelekKoda }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <DelovniPlanInner koda={koda} />;
}

function DelovniPlanInner({ koda }: { koda: OddelekKoda }) {
  const notify = useToast();
  const [podatki, setPodatki] = useState<Podatki | null>(null);
  const [verzija, setVerzija] = useState(0);
  // Pogled ostane ob menjavi oddelka in po shranjevanju
  const [zacetek, setZacetek] = useState<IsoDate>(() => mondayOf(toIso(new Date())));
  const [stTednov, setStTednov] = useState<number>(2);
  // Kontrola plana (desni panel); stran pokaže Loading, dokler podatki niso naloženi - branje localStorage je varno
  const [kontrola, setKontrola] = useState(preberiKontrolo);
  const [pri, setPri] = useState<PriPodatki | null>(null);
  const [zamikDni] = useState(() => preberiNastavitvePrioritet().zamikDni);
  const [pogled, setPogled] = useState<Pogled>("plan");
  /** Prioritete potrebujeta kontrola plana in zavihek Zamude dobav. */
  const potrebujePri = kontrola || pogled === "zamude";
  // Časi uvozov: ob nalaganju (prikazani podatki) in zadnje preverjanje v bazi - za opozorilo "novejši podatki"
  const [casiPlan, setCasiPlan] = useState<SyncCasi | null>(null);
  const [casiPri, setCasiPri] = useState<SyncCasi | null>(null);
  const [casiZdaj, setCasiZdaj] = useState<SyncCasi | null>(null);

  useEffect(() => {
    let preklic = false;
    Promise.all([naloziPodatke(), naloziSyncCase()])
      .then(([p, c]) => {
        if (preklic) return;
        setPodatki(p);
        setCasiPlan(c);
        setCasiZdaj(c);
      })
      .catch((e) => notify("error", `Napaka pri nalaganju delovnega plana: ${e.message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [notify]);

  useEffect(() => {
    if (!potrebujePri || pri) return;
    let preklic = false;
    Promise.all([naloziPriPodatke(), naloziSyncCase()])
      .then(([p, c]) => {
        if (preklic) return;
        setPri(p);
        setCasiPri(c);
      })
      .catch((e) => notify("error", `Napaka pri nalaganju prioritet: ${e.message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [potrebujePri, pri, notify]);

  // Ali je kdo (tudi na drugem računalniku) medtem uvozil novejše podatke: ob vrnitvi na stran in vsake 3 min
  useEffect(() => {
    const preveri = () => {
      if (document.visibilityState !== "visible") return;
      naloziSyncCase()
        .then((c) => c && setCasiZdaj(c))
        .catch(() => {});
    };
    const t = setInterval(preveri, 3 * 60 * 1000);
    document.addEventListener("visibilitychange", preveri);
    window.addEventListener("focus", preveri);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", preveri);
      window.removeEventListener("focus", preveri);
    };
  }, []);
  const novejse = (k: SyncDatotekaKljuc, ob: SyncCasi | null) => {
    const zdaj = casiZdaj?.[k]?.uvozeno;
    const prej = ob?.[k]?.uvozeno;
    return !!zdaj && !!prej && zdaj > prej;
  };
  const novejsi: SyncDatotekaKljuc[] = [
    ...(novejse("nalogi", casiPlan) ? (["nalogi"] as const) : []),
    ...(pri ? IZVOZI_PRI.filter((k) => novejse(k, casiPri)) : []),
  ];

  function preklopiKontrolo() {
    setKontrola(!kontrola);
    try {
      localStorage.setItem(KONTROLA_KLJUC, kontrola ? "0" : "1");
    } catch {
      // brskalnik ne dovoli shranjevanja - velja do osvežitve
    }
  }

  // Prioritete kot na strani Prioritete (potrjena naročila, samo izdelki)
  const prioritete = useMemo<PostavkaIzracun[] | null>(
    () =>
      pri && podatki
        ? izracunajPrioritete(
            pri.postavke,
            podatki.nalogi,
            { danes: toIso(new Date()), zamikDni, vkljuciNepotrjena: false, samoIzdelki: true },
            pri.odpreme,
            pri.material,
          ).postavke
        : null,
    [pri, podatki, zamikDni],
  );

  const izracun = useMemo(
    () => (podatki ? izracunajNaloge(podatki.nalogi, podatki.normativi) : []),
    [podatki],
  );
  const krovni = useMemo(() => zdruziKrovne(izracun, koda), [izracun, koda]);

  async function osvezi() {
    const [p, c] = await Promise.all([naloziPodatke(), naloziSyncCase()]);
    setPodatki(p);
    setCasiPlan(c);
    setCasiZdaj(c);
    setVerzija((v) => v + 1);
  }

  /** Opozorilo "novejši podatki": znova naloži plan in prioritete. */
  function osveziVse() {
    setPri(null);
    osvezi().catch((e) => notify("error", `Napaka pri nalaganju delovnega plana: ${(e as Error).message}`, 10000));
  }

  // Po syncu podatkov iz ERP: nalogi (in podatki kontrole plana) se znova naložijo - razen ob neshranjenih spremembah
  usePoSyncu(() => {
    if (imaNeshranjeno()) {
      notify("info", "Uvoženi so novi podatki iz ERP - shrani spremembe plana in osveži stran, da jih vidiš.", 10000);
      return;
    }
    setPri(null);
    osvezi().catch((e) => notify("error", `Napaka pri nalaganju delovnega plana: ${(e as Error).message}`, 10000));
  });

  async function osveziCelice() {
    const celice = await naloziCelice(toIso(new Date()));
    setPodatki((p) => (p ? { ...p, celice } : p));
  }

  if (!podatki) return <Loading />;
  const oddelek = podatki.oddelki.find((o) => o.koda === koda);

  return (
    <div className="flex flex-col gap-4 [&>[role=tablist]]:-mb-4">
      {/* ============ GLAVA ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-xl font-bold text-ink-900">Delovni plan</h2>
          <p className="text-sm text-ink-500">
            Krovne naloge povleci na delovno mesto in dan · trajanje se izračuna iz delovnih ur in števila zaposlenih
          </p>
        </div>
        {/* Kontrola plana uporablja še naročila, odpreme in material (kot Prioritete) */}
        <PodatkiVir kljuci={potrebujePri ? ["nalogi", "narocila", "odpreme", "material"] : ["nalogi"]} />
      </div>

      {/* ============ ODDELKI ============ */}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Oddelki">
          {podatki.oddelki.map((o) => {
            const aktiven = o.koda === koda;
            return (
              <Link
                key={o.koda}
                href={`/proizvodnja/zasedenost/plan?oddelek=${o.koda}`}
                role="tab"
                aria-selected={aktiven}
                title={`Odpri delovni plan: ${o.naziv}`}
                onClick={(e) => {
                  if (!aktiven && !lahkoZapustim()) e.preventDefault();
                }}
                className={`flex h-10 items-center rounded-lg border-2 px-4 text-sm font-bold transition-colors ${
                  aktiven
                    ? "border-fines-500 bg-fines-500 text-white"
                    : "border-ink-200 bg-white text-ink-700 hover:border-fines-500 hover:text-fines-500"
                }`}
              >
                {o.naziv}
              </Link>
            );
          })}
        </div>
        {pogled === "plan" && (
          <Button
            hint={kontrola ? "Zapri kontrolo plana in pokaži krovne naloge" : "Odpri kontrolo plana: naročila po prioritetah s kljukicami"}
            variant={kontrola ? "primary" : "neutral"}
            icon={kontrola ? PanelRightClose : PanelRightOpen}
            aria-pressed={kontrola}
            onClick={preklopiKontrolo}
            className="ml-auto"
          >
            Kontrola plana
          </Button>
        )}
      </div>

      {/* ============ NOVEJŠI PODATKI V BAZI ============ */}
      {novejsi.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-[min(100%,16rem)] flex-1">
            Na voljo so novejši podatki:{" "}
            <strong>
              {novejsi.map((k) => `${SYNC_DATOTEKE[k].naslov} (uvoženo ${formatDatumUra(casiZdaj![k]!.uvozeno!)})`).join(", ")}
            </strong>
            . Plan in kontrola še kažeta podatke ob odprtju strani.
          </span>
          <Button
            hint={imaNeshranjeno() ? "Najprej shrani spremembe plana" : "Naloži novejše podatke iz baze"}
            variant="sync"
            icon={RefreshCw}
            disabled={imaNeshranjeno()}
            onClick={osveziVse}
          >
            Osveži podatke
          </Button>
        </div>
      )}

      {/* ============ POGLEDI ============ */}
      <Zavihki<Pogled>
        label="Pogled delovnega plana"
        value={pogled}
        onChange={setPogled}
        zavihki={[
          { koda: "plan", label: "Plan", hint: "Delovni plan po delovnih mestih in dnevih", icon: CalendarRange },
          { koda: "zamude", label: "Zamude dobav", hint: "Odpreme, ki jih plan nad 100 % ne pokrije", icon: AlertTriangle },
        ]}
      />

      {!oddelek ? (
        <div className="fp-card p-8 text-center text-ink-600">Oddelek ni najden.</div>
      ) : (
        <PlanOddelka
          key={`${koda}-${verzija}`}
          oddelek={oddelek}
          celice={podatki.celice.filter((c) => c.oddelek_id === oddelek.id)}
          krovni={krovni}
          nalogi={podatki.nalogi}
          normativi={podatki.normativi}
          imaUvoz={!!podatki.uvoz}
          postavitve={podatki.postavitve.filter((p) => p.oddelek_id === oddelek.id)}
          zaposleni={podatki.zaposleni}
          zacetek={zacetek}
          onZacetek={setZacetek}
          stTednov={stTednov}
          onStTednov={setStTednov}
          onShranjeno={osvezi}
          onCeliceSpremenjene={osveziCelice}
          kontrola={kontrola}
          pogled={pogled}
          prioritete={potrebujePri ? prioritete : null}
          priUvoz={pri?.uvoz ?? null}
          casVD200={casiPri?.narocila ?? null}
          material={pri?.material ?? PRAZEN_MATERIAL}
          zamikDni={zamikDni}
        />
      )}
    </div>
  );
}

// =====================================================================
// PLAN ENEGA ODDELKA
// =====================================================================

function PlanOddelka({
  oddelek,
  celice,
  krovni,
  nalogi,
  normativi,
  imaUvoz,
  postavitve,
  zaposleni,
  zacetek,
  onZacetek,
  stTednov,
  onStTednov,
  onShranjeno,
  onCeliceSpremenjene,
  kontrola,
  pogled,
  prioritete,
  priUvoz,
  casVD200,
  material,
  zamikDni,
}: {
  pogled: Pogled;
  /** Čas izvoza in uvoza naročil VD200 (za kontrolo plana). */
  casVD200: { izvoz: number | null; uvozeno: number | null } | null;
  oddelek: ZasOddelek;
  celice: Celica[];
  krovni: Krovni[];
  /** Vsi nalogi zadnjega uvoza (za FIFO dodelitev odprem v workflowu). */
  nalogi: Nalog[];
  /** Normativi (družina po identu za PDF pregled). */
  normativi: Normativ[];
  imaUvoz: boolean;
  postavitve: Postavitev[];
  zaposleni: ZaposleniDan[];
  zacetek: IsoDate;
  onZacetek: (d: IsoDate) => void;
  stTednov: number;
  onStTednov: (n: number) => void;
  onShranjeno: () => Promise<void>;
  onCeliceSpremenjene: () => Promise<void>;
  /** Odprt panel Kontrola plana (namesto seznama krovnih). */
  kontrola: boolean;
  /** Postavke prioritet; null = še se nalagajo. */
  prioritete: PostavkaIzracun[] | null;
  priUvoz: PriUvoz | null;
  /** Izpis materiala (za stanje artikla v kontroli). */
  material: Map<string, Material>;
  zamikDni: number;
}) {
  const notify = useToast();
  const danes = toIso(new Date());

  // Postavitve iz časa zaporednega razporeda: plan ostane enak (dejanski začetek, zaklenjena vsebina) - shraniti jih je treba
  const [zacetne] = useState(() => {
    const zap = new Map(zaposleni.map((z) => [`${z.delovno_mesto_id}|${z.datum}`, z.st_zaposlenih]));
    const cel = new Map(celice.map((c) => [c.id, c]));
    const kap = (id: number, d: IsoDate) =>
      jeDelovniDan(d) ? (zap.get(`${id}|${d}`) ?? cel.get(id)?.privzeto_zaposlenih ?? 0) * oddelek.ure_na_dan : 0;
    return pretvoriStarePostavitve(postavitve, new Map(krovni.map((k) => [k.kljuc, k])), oddelek.koda, kap);
  });
  // Lokalna kopija plana - spremembe se shranijo z gumbom Shrani plan
  const [lokalne, setLokalne] = useState<Postavitev[]>(zacetne.postavitve);
  const [zapEdits, setZapEdits] = useState<Record<string, number>>({});
  const [inputVerzija, setInputVerzija] = useState(0);
  const [shranjujem, setShranjujem] = useState(false);

  const [izbranKrovni, setIzbranKrovni] = useState<string | null>(null); // za postavitev s klikom (tablica)
  const [poudarjen, setPoudarjen] = useState<string | null>(null);
  const [vlecem, setVlecem] = useState(false);
  const [nadDnem, setNadDnem] = useState<string | null>(null);
  const [urejamId, setUrejamId] = useState<number | null>(null);
  const [nastavitveOdprte, setNastavitveOdprte] = useState(false);
  const [oznacen, setOznacen] = useState<string | null>(null); // krovni, poudarjen iz kontrole plana
  const [novaNalogaCelica, setNovaNalogaCelica] = useState<number | null>(null); // mesto Dodatno delo za novo prosto nalogo

  const vlecenje = useRef<Vlecenje | null>(null);
  const naslednjiId = useRef(-1);

  // ---------- spremembe ----------
  const originali = useMemo(() => new Map(postavitve.map((p) => [p.id, p])), [postavitve]);
  const lokalneIds = new Set(lokalne.map((p) => p.id));
  const nove = lokalne.filter((p) => p.id < 0);
  const spremenjene = lokalne.filter((p) => {
    const o = originali.get(p.id);
    return (
      p.id > 0 &&
      !!o &&
      (zacetne.pretvorjene.has(p.id) ||
        o.delovno_mesto_id !== p.delovno_mesto_id ||
        o.krovni_dn !== p.krovni_dn ||
        o.datum_zacetka !== p.datum_zacetka ||
        o.ure !== p.ure ||
        (o.opomba ?? "") !== (p.opomba ?? "") ||
        o.rocne_ure !== p.rocne_ure ||
        !o.nalogi !== !p.nalogi ||
        (o.nalogi ?? []).join(",") !== (p.nalogi ?? []).join(",") ||
        JSON.stringify(o.kosi ?? null) !== JSON.stringify(p.kosi ?? null))
    );
  });
  const odstranjene = postavitve.filter((p) => !lokalneIds.has(p.id)).map((p) => p.id);
  const steviloSprememb = nove.length + spremenjene.length + odstranjene.length + Object.keys(zapEdits).length;
  useNeshranjeno(steviloSprememb > 0);

  // ---------- kapaciteta in razpored ----------
  const zapMap = useMemo(
    () => new Map(zaposleni.map((z) => [`${z.delovno_mesto_id}|${z.datum}`, z.st_zaposlenih])),
    [zaposleni],
  );
  const celicaPoId = useMemo(() => new Map(celice.map((c) => [c.id, c])), [celice]);

  const steviloZaposlenih = useCallback(
    (celicaId: number, d: IsoDate) =>
      zapEdits[`${celicaId}|${d}`] ?? zapMap.get(`${celicaId}|${d}`) ?? celicaPoId.get(celicaId)?.privzeto_zaposlenih ?? 0,
    [zapEdits, zapMap, celicaPoId],
  );
  const kapaciteta = useCallback(
    (celicaId: number, d: IsoDate) => (jeDelovniDan(d) ? steviloZaposlenih(celicaId, d) * oddelek.ure_na_dan : 0),
    [steviloZaposlenih, oddelek.ure_na_dan],
  );

  // ---------- krovni ----------
  const krovniPoKljucu = useMemo(() => new Map(krovni.map((k) => [k.kljuc, k])), [krovni]);
  /** Krovni postavitve; prosta naloga (Dodatno delo) nima krovnega. */
  const krovniZa = useCallback(
    (p: Postavitev) => (p.prosta ? undefined : krovniPoKljucu.get(p.krovni_dn)),
    [krovniPoKljucu],
  );
  // Planirani kosi nalogov po postavitvah (izdelani kosi iz uvoza se odštejejo od najzgodnejših)
  const kosiPostavitev = useMemo(() => {
    const m = new Map<number, Map<string, number>>();
    const vPlanu = new Set(lokalne.map((p) => p.krovni_dn));
    for (const k of krovni) if (vPlanu.has(k.kljuc)) for (const [id, kosi] of kosiKrovnega(k, lokalne)) m.set(id, kosi);
    return m;
  }, [krovni, lokalne]);
  // Ure postavitev: ročne ali vsota ur planiranih kosov vključenih nalogov iz zadnjega uvoza
  const zUrami = useCallback(
    (p: Postavitev) => ({ ...p, ure: urePostavitve(p, krovniZa(p), oddelek.koda, kosiPostavitev.get(p.id)) }),
    [krovniZa, oddelek.koda, kosiPostavitev],
  );
  const efektivne = useMemo(() => lokalne.map(zUrami), [lokalne, zUrami]);
  const stanja = useMemo(
    () => new Map(krovni.map((k) => [k.kljuc, stanjeKrovnega(k, lokalne, oddelek.koda)])),
    [krovni, lokalne, oddelek.koda],
  );
  const nerazporejeno = (k: Krovni) => stanja.get(k.kljuc)?.ostane ?? 0;

  const { razpored, zasedeno } = useMemo(() => razporedi(efektivne, kapaciteta), [efektivne, kapaciteta]);

  // ---------- kontrola plana: planirani kosi in konec plana po nalogih ----------
  const planNalogov = useMemo(() => {
    const kos = new Map<string, number>();
    const konec = new Map<string, IsoDate>();
    const nastaviKonec = (st: string, d: IsoDate | null | undefined) => {
      const prej = konec.get(st);
      if (d && (!prej || d > prej)) konec.set(st, d);
    };
    for (const [id, kosi] of kosiPostavitev)
      for (const [st, k] of kosi) {
        if (k <= 0) continue;
        kos.set(st, (kos.get(st) ?? 0) + k);
        nastaviKonec(st, razpored.get(id)?.do);
      }
    // Postavitve po urah (brez izbire nalogov): krovni z razporejenimi vsemi urami šteje kot v celoti planiran
    for (const p of lokalne) {
      if (p.prosta || p.nalogi || !p.rocne_ure) continue;
      const k = krovniPoKljucu.get(p.krovni_dn);
      if (!k || (stanja.get(k.kljuc)?.ostane ?? 1) > 0) continue;
      for (const n of k.nalogi) {
        kos.set(n.st_naloga, Math.max(kos.get(n.st_naloga) ?? 0, n.preostala));
        nastaviKonec(n.st_naloga, razpored.get(p.id)?.do);
      }
    }
    return { kos, konec };
  }, [kosiPostavitev, razpored, lokalne, krovniPoKljucu, stanja]);

  const nalogiPoSt = useMemo(() => new Map(krovni.flatMap((k) => k.nalogi.map((n) => [n.st_naloga, n] as const))), [krovni]);
  const vrsticeKontrole = useMemo(
    () =>
      prioritete
        ? kontrolaPlana({
            postavke: prioritete,
            nalogi: nalogiPoSt,
            koda: oddelek.koda,
            planKos: (st) => planNalogov.kos.get(st) ?? 0,
            konecNaloga: (st) => planNalogov.konec.get(st) ?? null,
          })
        : null,
    [prioritete, nalogiPoSt, oddelek.koda, planNalogov],
  );

  // Zavihek Zamude dobav: isti plan, nad 100 % se naredi samo kapaciteta celice
  const izracunajZamude = useCallback(
    (doDatuma: IsoDate) =>
      zamudePlana({
        postavke: prioritete ?? [],
        nalogi: nalogiPoSt,
        krovni: krovniPoKljucu,
        koda: oddelek.koda,
        postavitve: efektivne,
        razpored,
        zasedeno,
        preostaliKosi: kosiPostavitev,
        kapaciteta,
        danes,
        doDatuma,
      }),
    [prioritete, nalogiPoSt, krovniPoKljucu, oddelek.koda, efektivne, razpored, zasedeno, kosiPostavitev, kapaciteta, danes],
  );

  // Nalogi krovnega, ki niso na planu (npr. vodja je dodal nov nalog v krovni) - značka na zadnji postavitvi krovnega
  const zadnjaPostavitev = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of [...lokalne].sort((a, b) => a.datum_zacetka.localeCompare(b.datum_zacetka)))
      if (!p.prosta) m.set(p.krovni_dn, p.id);
    return m;
  }, [lokalne]);
  const novoVKrovnem = (p: Postavitev) => {
    if (p.prosta || zadnjaPostavitev.get(p.krovni_dn) !== p.id) return null;
    const st = stanja.get(p.krovni_dn);
    if (!st || st.poUrah || st.ostane <= 0) return null;
    return { ure: st.ostane, nalogi: st.ostali.filter((n) => (st.prostiKosi.get(n.st_naloga) ?? 0) > 0).map((n) => n.st_naloga) };
  };

  /** Klik na krovni v kontroli: nerazporejen se izbere za postavitev s klikom, sicer se poudari na planu. */
  function izKontrole(kljuc: string) {
    const k = krovniPoKljucu.get(kljuc);
    if (k && k.ure > 0 && nerazporejeno(k) > 0) {
      setIzbranKrovni(izbranKrovni === kljuc ? null : kljuc);
      setOznacen(null);
    } else {
      setIzbranKrovni(null);
      setOznacen(oznacen === kljuc ? null : kljuc);
    }
  }

  const dnevi = useMemo(
    () =>
      Array.from({ length: stTednov }, (_, w) => Array.from({ length: 5 }, (_, i) => addDays(zacetek, w * 7 + i))).flat(),
    [zacetek, stTednov],
  );

  // ---------- akcije ----------
  function postavi(kljuc: string, celicaId: number, datum: IsoDate) {
    const k = krovniPoKljucu.get(kljuc);
    if (!k) return;
    if (k.ure <= 0) {
      notify("warning", `Krovni ${kljuc} nima ur za ${oddelek.naziv.toLowerCase()} (ni normativa ali je izdelan).`);
      return;
    }
    const st = stanja.get(kljuc);
    if (!st || st.ostane <= 0) {
      notify("warning", `Krovni ${kljuc} je že v celoti razporejen. Naloge in ure spremeniš s klikom na postavitev.`);
      return;
    }
    // Postavitev zajame vse še nerazporejene naloge in kose krovnega (po urah, če je krovni razporejen ročno).
    // Vsebina se zaklene: nalogi, ki jih vodja kasneje doda v krovni, se ne dodajo sami (pokažejo se kot nerazporejeni).
    const prosti = (n: NalogIzracun) => st.prostiKosi.get(n.st_naloga) ?? n.preostala;
    const vzeti = st.ostali.filter((n) => prosti(n) > 0);
    const izbira: Pick<Postavitev, "nalogi" | "kosi" | "rocne_ure" | "ure"> = st.poUrah
      ? { nalogi: null, kosi: {}, rocne_ure: true, ure: st.ostane }
      : {
          nalogi: vzeti.map((n) => n.st_naloga),
          kosi: Object.fromEntries(vzeti.map((n) => [n.st_naloga, { kos: prosti(n), od: n.preostala }])),
          rocne_ure: false,
          ure: st.ostane,
        };
    const id = naslednjiId.current--;
    setLokalne((l) => [
      ...l,
      { id, oddelek_id: oddelek.id, delovno_mesto_id: celicaId, krovni_dn: kljuc, datum_zacetka: datum, opomba: null, prosta: false, ...izbira },
    ]);
    setIzbranKrovni(null);
  }

  /** Prosta naloga (ni iz uvoza) na mestu Dodatno delo, npr. pakiranje elektronik. */
  function dodajProsto(p: Pick<Postavitev, "delovno_mesto_id" | "krovni_dn" | "datum_zacetka" | "ure" | "opomba">) {
    const id = naslednjiId.current--;
    setLokalne((l) => [...l, { id, oddelek_id: oddelek.id, nalogi: null, kosi: {}, rocne_ure: true, prosta: true, ...p }]);
    setNovaNalogaCelica(null);
  }

  function premakni(id: number, celicaId: number, datum: IsoDate) {
    setLokalne((l) => l.map((p) => (p.id === id ? { ...p, delovno_mesto_id: celicaId, datum_zacetka: datum } : p)));
  }

  function zacniVlecenje(e: DragEvent, v: Vlecenje) {
    vlecenje.current = v;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", v.tip === "krovni" ? v.kljuc : String(v.id));
    // Ko se vlečenje začne, naj spust pade na dan pod postavitvami
    setTimeout(() => setVlecem(true), 0);
  }

  function koncajVlecenje() {
    vlecenje.current = null;
    setVlecem(false);
    setNadDnem(null);
  }

  function spusti(celicaId: number, datum: IsoDate) {
    const v = vlecenje.current;
    koncajVlecenje();
    if (!v) return;
    if (v.tip === "krovni") postavi(v.kljuc, celicaId, datum);
    else premakni(v.id, celicaId, datum);
  }

  async function shrani() {
    setShranjujem(true);
    try {
      await shraniPlan({
        // Shrani zadnje znane ure (ostanejo, če krovnega ni več v uvozu)
        nove: nove.map(zUrami),
        spremenjene: spremenjene.map(zUrami),
        odstranjene,
        zaposleni: Object.entries(zapEdits).map(([kljuc, st_zaposlenih]) => {
          const [id, datum] = kljuc.split("|");
          return { delovno_mesto_id: Number(id), datum, st_zaposlenih };
        }),
      });
      notify("success", "Delovni plan je shranjen.");
      objaviNaTv();
      await onShranjeno();
    } catch (e) {
      notify("error", `Napaka pri shranjevanju: ${(e as Error).message}`, 10000);
      setShranjujem(false);
    }
  }

  function izvozi() {
    const vrstice = efektivne
      .map((p) => ({
        celica: celicaPoId.get(p.delovno_mesto_id),
        postavitev: p,
        razpored: razpored.get(p.id),
        krovni: krovniZa(p),
        kosi: kosiPostavitev.get(p.id),
      }))
      .sort(
        (a, b) =>
          (a.celica?.vrstni_red ?? 0) - (b.celica?.vrstni_red ?? 0) ||
          (a.razpored?.od ?? a.postavitev.datum_zacetka).localeCompare(b.razpored?.od ?? b.postavitev.datum_zacetka),
      )
      .map((v) => ({ ...v, celica: v.celica?.naziv ?? "" }));
    izvoziPlanXlsx(vrstice, `delovni_plan_${oddelek.naziv.toLowerCase().replace(/\s+/g, "_")}_${zacetek}.xlsx`);
  }

  /**
   * Workflow za PDF / Word: prikazano obdobje, po delovnih mestih. Datumi odprem po nalogih:
   * naročila VD200 razdeljena FIFO na zalogo in naloge (kot na Prioritetah); ob napaki brez odprem.
   */
  const odpremeNalogov = () =>
    Promise.all([
      naloziZadnjiPriUvoz(),
      naloziZadnjiOdpUvoz().catch(() => ({ odpreme: [] })),
      naloziMaterial().catch(() => ({ material: new Map<string, Material>() })),
    ])
      .then(([pri, odp, mat]) => odpremePoNalogih(pri.postavke, nalogi, odp.odpreme, mat.material))
      .catch(() => new Map<string, IsoDate[]>());
  const planZaDneve = (dn: IsoDate[], odpreme: Map<string, IsoDate[]>) =>
    pripraviWorkflow({
      oddelek: oddelek.naziv,
      celice,
      postavitve: efektivne,
      razpored,
      krovniPoKljucu,
      kosiPostavitev,
      dnevi: dn,
      ureNaDan: oddelek.ure_na_dan,
      zaposleni: steviloZaposlenih,
      odpreme,
    });
  const workflow = async () => planZaDneve(dnevi, await odpremeNalogov());

  /**
   * FIN:TV: workflow in pregled plana za vsak teden od tekočega do konca plana (vsak teden svoj PDF, TV kaže tekoči
   * teden). Teče v ozadju po shranjevanju - podatki so posnetek ob kliku Shrani plan.
   */
  function objaviNaTv() {
    const zadnjiDan = efektivne.reduce<IsoDate | null>((m, p) => {
      const d = razpored.get(p.id)?.do;
      return d && (!m || d > m) ? d : m;
    }, null);
    void (async () => {
      const [odpreme, druzine] = await Promise.all([odpremeNalogov(), druzineNormativov()]);
      const { objaviPlanNaTv } = await import("@/lib/tvObjava");
      return objaviPlanNaTv({
        oddelek: oddelek.koda,
        nazivOddelka: oddelek.naziv,
        planTedna: (dn) => planZaDneve(dn, odpreme),
        druzine,
        zadnjiDan,
        napredek: (t, vseh) => {
          if (t === 1 && vseh > 1) notify("info", `FIN:TV: objavljam plan za ${vseh} tednov - tekoči teden bo na TV v pol minute, ostali sledijo. Production pusti odprt.`, 8000);
        },
      });
    })()
      .then((izid) => {
        if (!izid?.length) return; // prazno ali prekinjeno z novejšim Shrani plan
        const tedni = (n: number) => `${n} ${n === 1 ? "teden" : n === 2 ? "tedna" : n <= 4 ? "tedni" : "tednov"}`;
        notify("success", `FIN:TV: plan objavljen - ${izid.map((d) => `${d.ime} ${tedni(d.tednov)}, ${d.strani} str.`).join(" · ")}.`);
      })
      .catch((e) => notify("warning", `Plan je shranjen, objava na FIN:TV ni uspela: ${(e as Error).message}`, 10000));
  }
  /** Družine za PDF pregled: ident -> družina iz normativov, stolpci = vse družine (šifrant, sicer iz normativov). */
  const druzineNormativov = async () => {
    const sifrant = await naloziDruzine().catch(() => []);
    return {
      poIdentu: new Map<string, string>(normativi.filter((n) => n.druzina).map((n) => [n.ident, n.druzina])),
      vse: sifrant.length ? sifrant.map((d) => d.koda) : [...new Set(normativi.map((n) => n.druzina).filter(Boolean))] as string[],
    };
  };
  const vObdobju = efektivne.some((p) => {
    const r = razpored.get(p.id);
    return !!r?.od && !!r.do && r.od <= dnevi[dnevi.length - 1] && r.do >= dnevi[0];
  });

  // ---------- povzetek oddelka po dnevih (brez mest Dodatno delo) ----------
  const oddelekDan = (d: IsoDate) => {
    let kap = 0;
    let plan = 0;
    for (const c of celice) {
      if (c.dodatno_delo) continue;
      kap += kapaciteta(c.id, d);
      plan += zasedeno.get(`${c.id}|${d}`) ?? 0;
    }
    return { kap, plan };
  };

  const potrebnoSkupaj = krovni.reduce((s, k) => s + k.ure, 0);
  const razporejenoSkupaj = krovni.reduce((s, k) => s + Math.max(0, k.ure - nerazporejeno(k)), 0);

  const urejana = urejamId !== null ? lokalne.find((p) => p.id === urejamId) ?? null : null;
  /** Stanje krovnega brez urejane postavitve: nalogi in kosi v drugih postavitvah. */
  const drugjeRazporejeni = (p: Postavitev) => {
    const k = krovniZa(p);
    return k ? stanjeKrovnega(k, lokalne.filter((x) => x.id !== p.id), oddelek.koda) : null;
  };
  const stolpci = `${SIRINA_IMENA}px repeat(${dnevi.length}, minmax(${MIN_DAN}px, 1fr))`;
  const minSirina = SIRINA_IMENA + dnevi.length * MIN_DAN;
  const jeTaTeden = zacetek === mondayOf(danes);

  return (
    <>
      {zacetne.pretvorjene.size > 0 && steviloSprememb > 0 && (
        <WarningText className="mt-4">
          Delovni plan ne premika več postavitev samodejno: postavitve se med seboj ne čakajo, prekrivanje na celici pokaže
          presežek nad 100 %. {zacetne.pretvorjene.size} obstoječih postavitev je pretvorjenih tako, da plan ostane enak (začetek =
          dejanski začetek, nalogi in kosi so zaklenjeni) - preglej plan in ga shrani.
        </WarningText>
      )}
      {pogled === "zamude" ? (
        <div className="fp-card rounded-tl-none p-3 sm:p-4">
          <ZamudeDobav
            izracunaj={izracunajZamude}
            nalaganje={!prioritete}
            celice={celice}
            ureNaDan={oddelek.ure_na_dan}
            oddelek={oddelek.naziv}
            danes={danes}
          />
        </div>
      ) : (
      <div className={`grid gap-4 ${kontrola ? "xl:grid-cols-[minmax(0,1fr)_440px]" : "xl:grid-cols-[340px_minmax(0,1fr)]"}`}>
        {/* ============ KROVNI NALOGI ============ */}
        {!kontrola && (
          <KrovniSeznam
            krovni={krovni}
            imaUvoz={imaUvoz}
            oddelek={oddelek}
            nerazporejeno={nerazporejeno}
            stanje={(k) => stanja.get(k)}
            potrebnoSkupaj={potrebnoSkupaj}
            razporejenoSkupaj={razporejenoSkupaj}
            izbran={izbranKrovni}
            onIzberi={(k) => setIzbranKrovni(izbranKrovni === k ? null : k)}
            onPoudari={setPoudarjen}
            onZacniVlecenje={(e, k) => zacniVlecenje(e, { tip: "krovni", kljuc: k })}
            onKoncajVlecenje={koncajVlecenje}
          />
        )}

        {/* ============ KOLEDAR DELOVNIH MEST ============ */}
        <div className="fp-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-2">
            <IconButton hint="Premakni plan en teden nazaj" variant="neutral" icon={ChevronLeft} onClick={() => onZacetek(addDays(zacetek, -7))} />
            <IconButton hint="Premakni plan en teden naprej" variant="neutral" icon={ChevronRight} onClick={() => onZacetek(addDays(zacetek, 7))} />
            <Button hint="Začni plan s tekočim tednom" variant="neutral" disabled={jeTaTeden} onClick={() => onZacetek(mondayOf(danes))}>
              Ta teden
            </Button>
            <div className="flex gap-1" role="group" aria-label="Število prikazanih tednov">
              {TEDNI_IZBIRA.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={stTednov === n}
                  title={`Prikaži ${n} ${n === 1 ? "teden" : n === 2 ? "tedna" : "tedne"}`}
                  onClick={() => onStTednov(n)}
                  className={`h-9 rounded-full border px-3 text-sm font-semibold transition-colors ${
                    stTednov === n
                      ? "border-fines-500 bg-fines-500 text-white"
                      : "border-ink-200 bg-white text-ink-600 hover:border-fines-500 hover:text-fines-500"
                  }`}
                >
                  {n} {n === 1 ? "teden" : n === 2 ? "tedna" : "tedni"}
                </button>
              ))}
            </div>
            <span className="ml-auto self-center text-xs text-ink-500">{formatNum(oddelek.ure_na_dan)} h/dan na osebo</span>
            <IconButton
              hint="Nastavi privzeto število zaposlenih na mestih"
              variant="neutral"
              icon={Settings}
              onClick={() => setNastavitveOdprte(true)}
            />
            <Izvoz
              spomin="delovni-plan"
              formati={[
                {
                  koda: "pdf",
                  label: "PDF - workflow",
                  hint: "Workflow po delovnih mestih za prikazane tedne (PDF za tisk)",
                  disabled: !vObdobju,
                  zakaj: "V prikazanih tednih ni postavitev",
                  akcija: async () => (await import("@/lib/planPdf")).prenesiPlanPdf(await workflow()),
                },
                {
                  koda: "pdf-pregled",
                  label: "PDF - pregled (roki)",
                  hint: "Časovnica po celicah: krovni nalogi od začetka do roka (PDF za obešanje / FIN:TV)",
                  disabled: !vObdobju,
                  zakaj: "V prikazanih tednih ni postavitev",
                  akcija: async () => (await import("@/lib/planPregledPdf")).prenesiPlanPregledPdf(await workflow(), await druzineNormativov()),
                },
                {
                  koda: "docx",
                  label: "Word - workflow",
                  hint: "Workflow po delovnih mestih za prikazane tedne (Word za urejanje)",
                  disabled: !vObdobju,
                  zakaj: "V prikazanih tednih ni postavitev",
                  akcija: async () => (await import("@/lib/planWord")).prenesiPlanDocx(await workflow()),
                },
                {
                  koda: "xlsx",
                  label: "Excel (.xlsx)",
                  hint: "Vse postavitve oddelka v Excel",
                  disabled: lokalne.length === 0,
                  zakaj: "Plan oddelka je prazen",
                  akcija: izvozi,
                },
              ]}
            />
          </div>

          {izbranKrovni && (
            <div className="flex items-center gap-2 rounded-lg bg-fines-50 px-3 py-2 text-sm text-fines-700">
              <MousePointerClick className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">
                Izbran krovni <strong className="font-mono">{izbranKrovni}</strong> - klikni dan na delovnem mestu, kjer naj se začne.
              </span>
              <IconButton hint="Prekliči izbiro krovnega naloga" variant="neutral" icon={X} onClick={() => setIzbranKrovni(null)} />
            </div>
          )}

          {celice.length === 0 ? (
            <div className="p-8 text-center text-ink-600">
              Oddelek nima aktivnih delovnih mest. Delovna mesta so ista kot v rutini (fp_delovna_mesta).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: minSirina }} className="flex flex-col gap-2.5">
                {/* ---------- glava dni ---------- */}
                <div className="grid gap-x-0" style={{ gridTemplateColumns: stolpci }}>
                  <div className="flex items-end px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Delovno mesto
                  </div>
                  {dnevi.map((d, i) => {
                    const ponedeljek = i % 5 === 0;
                    const jeDanes = d === danes;
                    return (
                      <div
                        key={d}
                        className={`px-1 pb-1 text-center ${ponedeljek ? "border-l-2 border-ink-300" : "border-l border-ink-100"}`}
                      >
                        <div className="h-4 text-[10px] font-bold uppercase text-ink-400">{ponedeljek ? `${isoWeek(d)}. teden` : ""}</div>
                        <div
                          className={`rounded-md py-0.5 text-xs font-bold ${jeDanes ? "bg-sync-500 text-white" : "text-ink-800"}`}
                          title={formatShort(d)}
                        >
                          {DAN_IME[i % 5]} {formatDayMonth(d)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ---------- oddelek skupaj ---------- */}
                <div className="grid rounded-lg bg-ink-800 text-white" style={{ gridTemplateColumns: stolpci }}>
                  <div className="px-2 py-2 text-sm font-bold" title="Skupaj vsa delovna mesta oddelka brez dodatnega dela">
                    {oddelek.naziv} skupaj
                  </div>
                  {dnevi.map((d, i) => {
                    const { kap, plan } = oddelekDan(d);
                    const ob = obremenitev(plan, kap);
                    return (
                      <div
                        key={d}
                        className={`px-1 py-2 text-center text-xs tabular-nums ${i % 5 === 0 ? "border-l-2 border-ink-600" : ""}`}
                        title={`${oddelek.naziv}, ${formatShort(d)}: planirano ${formatUre(plan)} h od ${formatUre(kap)} h`}
                      >
                        <div>
                          <strong>{formatUre(plan)}</strong>/{formatUre(kap)} h
                        </div>
                        <div className={`font-bold ${ob.pct > 100 ? "text-nok-500" : ob.pct > 85 ? "text-warn-400" : "text-ok-500"}`}>
                          {kap > 0 ? fmtPct(ob.pct) : "–"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ---------- delovna mesta ---------- */}
                {celice.map((c) => (
                  <CelicaVrstica
                    key={c.id}
                    celica={c}
                    dnevi={dnevi}
                    stolpci={stolpci}
                    danes={danes}
                    postavitve={efektivne.filter((p) => p.delovno_mesto_id === c.id)}
                    razpored={razpored}
                    zasedeno={zasedeno}
                    krovniPoKljucu={krovniPoKljucu}
                    kosiPostavitev={kosiPostavitev}
                    napredek={(p) => napredekPostavitve(p, krovniZa(p))}
                    novoVKrovnem={novoVKrovnem}
                    kapaciteta={kapaciteta}
                    steviloZaposlenih={steviloZaposlenih}
                    spremenjeniZaposleni={(d) => zapEdits[`${c.id}|${d}`] !== undefined}
                    inputVerzija={inputVerzija}
                    onZaposleni={(d, v) => setZapEdits((z) => ({ ...z, [`${c.id}|${d}`]: v }))}
                    vlecem={vlecem}
                    izbranKrovni={izbranKrovni}
                    poudarjen={poudarjen ?? izbranKrovni ?? oznacen}
                    nadDnem={nadDnem}
                    onNadDnem={setNadDnem}
                    onSpusti={(d) => spusti(c.id, d)}
                    onKlikDan={(d) => izbranKrovni && postavi(izbranKrovni, c.id, d)}
                    onZacniVlecenje={(e, id) => zacniVlecenje(e, { tip: "postavitev", id })}
                    onKoncajVlecenje={koncajVlecenje}
                    onUredi={setUrejamId}
                    onNovaNaloga={c.dodatno_delo ? () => setNovaNalogaCelica(c.id) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
            <Legenda cls="bg-ok-500" label="do 85 %" />
            <Legenda cls="bg-warn-400" label="85–100 %" />
            <Legenda cls={PRESEZEK_CRTE} label="nad 100 % (postavitve se prekrivajo, trak je na teh dneh črtast)" />
            <span className="flex items-center gap-1.5">
              <span className="relative inline-block h-2.5 w-5 overflow-hidden rounded-sm bg-fines-500">
                <span className="absolute bottom-0 left-0 h-0.5 w-3 bg-ok-500" />
              </span>
              črtica: izdelano od razpisanih kosov nalogov (1 peč od 100 = 1 %)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="rounded bg-warn-400 px-1 text-[10px] font-bold text-ink-900">+h</span>
              nalogi krovnega, ki niso na planu
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-5 rounded-sm bg-fines-500 ring-2 ring-nok-500" />
              konec plana po roku izdelave
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-5 rounded-sm bg-ink-600" />
              dodatno delo (ni iz uvoza)
            </span>
            <span>Kapaciteta = zaposleni × ure na dan · 0 zaposlenih = celica ta dan ne dela · Dodatno delo ni v seštevku oddelka</span>
          </div>
        </div>

        {/* ============ KONTROLA PLANA ============ */}
        {kontrola && (
          <KontrolaPlana
            vrstice={vrsticeKontrole}
            uvoz={priUvoz}
            postavke={prioritete ?? []}
            material={material}
            nalogi={[...nalogiPoSt.values()]}
            zamikDni={zamikDni}
            oddelek={oddelek.naziv}
            oznacen={izbranKrovni ?? oznacen}
            onKrovni={izKontrole}
            casVD200={casVD200}
          />
        )}
      </div>
      )}

      <SaveBar
        steviloSprememb={steviloSprememb}
        shranjujem={shranjujem}
        onSave={shrani}
        onReset={() => {
          setLokalne(zacetne.postavitve);
          setZapEdits({});
          setInputVerzija((v) => v + 1);
        }}
        shraniLabel="Shrani plan"
        shraniHint="Shrani delovni plan oddelka"
      />

      {urejana && (
        <UrediPostavitev
          key={urejana.id}
          postavitev={urejana}
          razpored={razpored.get(urejana.id)}
          krovni={krovniZa(urejana)}
          celice={celice}
          koda={oddelek.koda}
          drugje={drugjeRazporejeni(urejana)}
          kosiZdaj={kosiPostavitev.get(urejana.id)}
          napredek={napredekPostavitve(urejana, krovniZa(urejana))}
          onPotrdi={(p) => {
              setLokalne((l) => l.map((x) => (x.id === p.id ? p : x)));
              setUrejamId(null);
            }}
            onOdstrani={() => {
              setLokalne((l) => l.filter((x) => x.id !== urejana.id));
              setUrejamId(null);
            }}
          onPreklici={() => setUrejamId(null)}
        />
      )}

      {novaNalogaCelica !== null && (
        <NovaNaloga
          celicaId={novaNalogaCelica}
          celice={celice}
          zacetek={dnevi.includes(danes) ? danes : dnevi[0]}
          onDodaj={dodajProsto}
          onPreklici={() => setNovaNalogaCelica(null)}
        />
      )}

      <Modal open={nastavitveOdprte} title={`Privzeti zaposleni: ${oddelek.naziv}`} onClose={() => setNastavitveOdprte(false)}>
        <CeliceNastavitve
          celice={celice}
          onShranjeno={async () => {
            setNastavitveOdprte(false);
            notify("success", "Privzeto število zaposlenih je shranjeno.");
            await onCeliceSpremenjene();
          }}
          onNapaka={(m) => notify("error", m)}
        />
      </Modal>
    </>
  );
}

// =====================================================================
// VRSTICA DELOVNEGA MESTA (Gantt)
// =====================================================================

function CelicaVrstica({
  celica,
  dnevi,
  stolpci,
  danes,
  postavitve,
  razpored,
  zasedeno,
  krovniPoKljucu,
  kosiPostavitev,
  napredek,
  novoVKrovnem,
  kapaciteta,
  steviloZaposlenih,
  spremenjeniZaposleni,
  inputVerzija,
  onZaposleni,
  vlecem,
  izbranKrovni,
  poudarjen,
  nadDnem,
  onNadDnem,
  onSpusti,
  onKlikDan,
  onZacniVlecenje,
  onKoncajVlecenje,
  onUredi,
  onNovaNaloga,
}: {
  celica: Celica;
  dnevi: IsoDate[];
  stolpci: string;
  danes: IsoDate;
  postavitve: Postavitev[];
  razpored: Map<number, Razpored>;
  zasedeno: Map<string, number>;
  krovniPoKljucu: Map<string, Krovni>;
  kosiPostavitev: Map<number, Map<string, number>>;
  /** Planirani in izdelani kosi zaklenjene postavitve. */
  napredek: (p: Postavitev) => Napredek | null;
  /** Nalogi krovnega, ki niso na planu (samo na zadnji postavitvi krovnega). */
  novoVKrovnem: (p: Postavitev) => { ure: number; nalogi: string[] } | null;
  kapaciteta: (celicaId: number, d: IsoDate) => number;
  steviloZaposlenih: (celicaId: number, d: IsoDate) => number;
  spremenjeniZaposleni: (d: IsoDate) => boolean;
  inputVerzija: number;
  onZaposleni: (d: IsoDate, v: number) => void;
  vlecem: boolean;
  izbranKrovni: string | null;
  poudarjen: string | null;
  nadDnem: string | null;
  onNadDnem: (k: string | null) => void;
  onSpusti: (d: IsoDate) => void;
  onKlikDan: (d: IsoDate) => void;
  onZacniVlecenje: (e: DragEvent, id: number) => void;
  onKoncajVlecenje: () => void;
  onUredi: (id: number) => void;
  /** Samo na mestu Dodatno delo: dodaj prosto nalogo. */
  onNovaNaloga?: () => void;
}) {
  const prvi = dnevi[0];
  const zadnji = dnevi[dnevi.length - 1];

  // Postavitve, vidne v obdobju, razporejene v pasove (brez prekrivanja)
  const pasovi: number[] = []; // zadnji zaseden indeks v pasu
  const vidne = postavitve
    .map((p) => ({ p, r: razpored.get(p.id) }))
    .filter((x): x is { p: Postavitev; r: Razpored } => !!x.r?.od && !!x.r.do && x.r.od <= zadnji && x.r.do >= prvi)
    .sort((a, b) => a.r.od!.localeCompare(b.r.od!))
    .map(({ p, r }) => {
      const zac = dnevi.findIndex((d) => d >= r.od!);
      const kon = dnevi.length - 1 - [...dnevi].reverse().findIndex((d) => d <= r.do!);
      let pas = pasovi.findIndex((z) => z < zac);
      if (pas < 0) pas = pasovi.push(kon) - 1;
      else pasovi[pas] = kon;
      return { p, r, zac, kon, pas, odrezanZac: r.od! < prvi, odrezanKon: r.do! > zadnji };
    });
  // Postavitve brez kapacitete (npr. 0 zaposlenih) - pokaži opozorilo
  const brezKapacitete = postavitve.filter((p) => (razpored.get(p.id)?.nerazporejeno ?? 0) > 0);

  const stPasov = Math.max(1, pasovi.length);
  /** Dan, ko je celica nad 100 % (postavitve se prekrivajo). */
  const presezen = (d: IsoDate) => {
    const kap = kapaciteta(celica.id, d);
    return kap > 0 && (zasedeno.get(`${celica.id}|${d}`) ?? 0) > kap + 0.01;
  };
  const vrsticaVse = `1 / span ${stPasov + 2}`;
  const vsotaKap = dnevi.reduce((s, d) => s + kapaciteta(celica.id, d), 0);
  const vsotaPlan = dnevi.reduce((s, d) => s + (zasedeno.get(`${celica.id}|${d}`) ?? 0), 0);
  const obSkupaj = obremenitev(vsotaPlan, vsotaKap);

  return (
    <div
      className="grid rounded-lg border border-ink-200 bg-white"
      style={{ gridTemplateColumns: stolpci, gridTemplateRows: `auto repeat(${stPasov}, ${VISINA_PASU}px) auto` }}
    >
      {/* ime + povzetek */}
      <div
        className={`flex flex-col justify-center gap-1 rounded-l-lg border-r border-ink-200 px-2.5 py-3 ${celica.dodatno_delo ? "bg-ink-50" : ""}`}
        style={{ gridColumn: 1, gridRow: vrsticaVse }}
      >
        <div className="text-sm font-bold leading-tight text-ink-800">{celica.naziv}</div>
        {celica.dodatno_delo && <div className="text-[11px] italic text-ink-500">izven redne proizvodnje</div>}
        <div className="text-[11px] text-ink-500">privzeto {formatNum(celica.privzeto_zaposlenih)} oseb</div>
        <div className={`text-[11px] font-bold tabular-nums ${obSkupaj.txt}`} title="Obremenitev v prikazanem obdobju">
          {formatUre(vsotaPlan)}/{formatUre(vsotaKap)} h · {vsotaKap > 0 ? fmtPct(obSkupaj.pct) : "–"}
        </div>
        {brezKapacitete.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-nok-600" title="Postavitve brez dovolj kapacitete v obzorju">
            <AlertTriangle className="h-3 w-3" aria-hidden /> ni kapacitete
          </div>
        )}
        {onNovaNaloga && (
          <button
            type="button"
            title="Dodaj nalogo izven redne proizvodnje (npr. pakiranje)"
            onClick={onNovaNaloga}
            className="mt-1 flex h-8 items-center justify-center gap-1 self-start rounded-lg bg-ok-500 px-2.5 text-xs font-bold text-white transition-colors hover:bg-ok-600"
          >
            <Plus className="h-4 w-4" aria-hidden /> Naloga
          </button>
        )}
      </div>

      {/* dnevi - cilj za spust / klik */}
      {dnevi.map((d, i) => {
        const kljuc = `${celica.id}|${d}`;
        const kap = kapaciteta(celica.id, d);
        return (
          <div
            key={d}
            style={{ gridColumn: i + 2, gridRow: vrsticaVse }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (nadDnem !== kljuc) onNadDnem(kljuc);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onSpusti(d);
            }}
            onClick={() => onKlikDan(d)}
            className={`${i % 5 === 0 ? "border-l-2 border-ink-300" : "border-l border-ink-100"} ${
              nadDnem === kljuc
                ? "bg-fines-100"
                : izbranKrovni
                  ? "cursor-pointer hover:bg-fines-50"
                  : kap === 0
                    ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--color-ink-100)_4px,var(--color-ink-100)_8px)]"
                    : d === danes
                      ? "bg-ink-50"
                      : ""
            }`}
          />
        );
      })}

      {/* zaposleni po dnevih */}
      {dnevi.map((d, i) => (
        <div
          key={`z-${d}`}
          style={{ gridColumn: i + 2, gridRow: 1 }}
          className={`relative z-10 flex items-center justify-center gap-1 px-1 pb-1 pt-2 ${vlecem ? "pointer-events-none" : ""}`}
        >
          <ZaposleniInput
            key={`${celica.id}-${d}-${inputVerzija}`}
            value={steviloZaposlenih(celica.id, d)}
            spremenjeno={spremenjeniZaposleni(d)}
            hint={`Število zaposlenih: ${celica.naziv}, ${formatShort(d)}`}
            onCommit={(v) => onZaposleni(d, v)}
          />
          <span className="text-[10px] text-ink-400">os.</span>
        </div>
      ))}

      {/* postavitve */}
      {vidne.map(({ p, r, zac, kon, pas, odrezanZac, odrezanKon }) => {
        const k = p.prosta ? undefined : krovniPoKljucu.get(p.krovni_dn);
        const poRoku = !!(k?.rok && r.do && r.do > k.rok);
        const jePoudarjen = !p.prosta && poudarjen === p.krovni_dn;
        // Delni krovni: koliko nalogov od vseh je v postavitvi; * = pri nekaterih nalogih samo del kosov
        const kosi = kosiPostavitev.get(p.id);
        const delniKosi = k ? nalogiPostavitve(p, k).filter((n) => (kosi?.get(n.st_naloga) ?? n.preostala) < n.preostala) : [];
        const delni = k && p.nalogi ? `${nalogiPostavitve(p, k).length}/${k.nalogi.length}${delniKosi.length ? "*" : ""}` : null;
        // Napredek: zelena črtica na dnu traku = izdelano od razpisanih kosov nalogov postavitve
        const nap = napredek(p);
        const delez = nap ? delezNapredka(nap) : 0;
        const novo = novoVKrovnem(p);
        // Dnevi traku nad 100 % (samo dnevi, ko postavitev dela)
        const crtasti = dnevi.slice(zac, kon + 1).map((d) => presezen(d) && (r.dnevi.get(d) ?? 0) > 0);
        const imaPresezek = crtasti.some(Boolean);
        const opis = [
          p.prosta ? `Dodatno delo: ${p.krovni_dn}` : `Krovni ${p.krovni_dn}`,
          p.prosta ? null : !k ? "ni v zadnjem uvozu" : delni ? `${delni} nalogov (${p.nalogi!.join(", ")})` : `${k.nalogi.length} nalogov`,
          delniKosi.length
            ? `delni kosi: ${delniKosi.map((n) => `${n.st_naloga} ${formatNum(kosi?.get(n.st_naloga) ?? 0)}/${formatNum(n.preostala)}`).join(", ")}`
            : null,
          p.rocne_ure ? "ročne ure" : null,
          `${formatUre(p.ure)} h`,
          `plan ${formatShort(r.od!)} – ${formatShort(r.do!)}`,
          k?.rok ? `rok ${formatShort(k.rok)}` : null,
          poRoku ? "KONEC PO ROKU!" : null,
          r.nerazporejeno > 0 ? `${formatUre(r.nerazporejeno)} h brez kapacitete` : null,
          nap
            ? `${nap.razpisano > 0 ? `izdelano ${formatNum(nap.izdelano)}/${formatNum(nap.razpisano)} kos (${Math.round(delez * 100)} %)` : "nalogi zaključeni"}: ${nap.nalogi
                .map((n) => `${n.st} ${n.zakljucen ? "zaključen" : `${formatNum(n.izdelano)}/${formatNum(n.razpisano)}`}`)
                .join(", ")}`
            : null,
          novo ? `NI NA PLANU: ${formatUre(novo.ure)} h krovnega (${novo.nalogi.join(", ")})` : null,
          p.opomba,
          "Klik: uredi · povleci: premakni",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={p.id}
            type="button"
            draggable
            title={opis}
            onDragStart={(e) => onZacniVlecenje(e, p.id)}
            onDragEnd={onKoncajVlecenje}
            onClick={(e) => {
              e.stopPropagation();
              onUredi(p.id);
            }}
            style={{ gridColumn: `${zac + 2} / ${kon + 3}`, gridRow: pas + 2 }}
            className={`relative z-10 mx-1 my-1 flex min-w-0 cursor-grab items-center gap-1.5 overflow-hidden px-2 text-left text-[13px] font-semibold text-white shadow-sm active:cursor-grabbing ${
              odrezanZac ? "rounded-l-none" : "rounded-l-md"
            } ${odrezanKon ? "rounded-r-none" : "rounded-r-md"} ${
              p.prosta ? "bg-ink-600 hover:bg-ink-700" : !k ? "bg-ink-400" : jePoudarjen ? "bg-ink-800" : "bg-fines-500 hover:bg-fines-600"
            } ${poRoku || r.nerazporejeno > 0 ? "ring-2 ring-inset ring-nok-500" : ""} ${vlecem ? "pointer-events-none opacity-60" : ""} ${
              imaPresezek ? "[text-shadow:0_1px_2px_rgb(0_0_0/0.45)]" : ""
            }`}
          >
            {imaPresezek && (
              <span className="pointer-events-none absolute inset-0 -z-10 flex" aria-hidden>
                {crtasti.map((c, i) => (
                  <span key={i} className={`h-full flex-1 ${c ? PRESEZEK_TRAK : ""}`} />
                ))}
              </span>
            )}
            {odrezanZac && <ChevronLeft className="h-3 w-3 shrink-0" aria-hidden />}
            {(poRoku || r.nerazporejeno > 0) && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />}
            <span className={`truncate ${p.prosta ? "" : "font-mono"}`}>{p.krovni_dn}</span>
            {delni && <span className="shrink-0 rounded bg-white/25 px-1 font-normal">{delni}</span>}
            <span className="shrink-0 font-normal opacity-90">{formatUre(p.ure)} h</span>
            {novo && <span className="shrink-0 rounded bg-warn-400 px-1 text-[11px] font-bold text-ink-900">+{formatUre(novo.ure)} h</span>}
            {odrezanKon && <ChevronRight className="ml-auto h-3 w-3 shrink-0" aria-hidden />}
            {nap && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/25" aria-hidden>
                <span
                  className="block h-full bg-ok-500"
                  style={{ width: `${delez * 100}%` }}
                />
              </span>
            )}
          </button>
        );
      })}

      {/* obremenitev po dnevih */}
      {dnevi.map((d, i) => {
        const kap = kapaciteta(celica.id, d);
        const plan = zasedeno.get(`${celica.id}|${d}`) ?? 0;
        const ob = obremenitev(plan, kap);
        return (
          <div
            key={`o-${d}`}
            style={{ gridColumn: i + 2, gridRow: stPasov + 2 }}
            className={`pointer-events-none relative z-10 px-1.5 pb-2 pt-1`}
            title={`${formatUre(plan)} h od ${formatUre(kap)} h`}
          >
            {kap > 0 ? (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div className={`h-full ${ob.pct > 100 ? PRESEZEK_CRTE : ob.cls}`} style={{ width: `${Math.min(100, ob.pct)}%` }} />
                </div>
                <div className={`text-right font-bold tabular-nums ${ob.pct > 100 ? "text-xs" : "text-[11px]"} ${plan > 0 ? ob.txt : "text-ink-400"}`}>
                  {fmtPct(ob.pct)}
                </div>
              </>
            ) : (
              <div className="text-center text-[11px] text-ink-400">ne dela</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ZaposleniInput({
  value,
  onCommit,
  hint,
  spremenjeno,
}: {
  value: number;
  onCommit: (v: number) => void;
  hint: string;
  spremenjeno: boolean;
}) {
  return (
    <input
      defaultValue={formatVnos(value)}
      inputMode="decimal"
      title={hint}
      aria-label={hint}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const n = parseNum(e.target.value);
        if (n === null || n < 0 || n > 99) {
          e.target.value = formatVnos(value);
          return;
        }
        if (n !== value) onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`h-8 w-11 rounded-md border px-1 text-center text-sm font-semibold tabular-nums focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 ${
        spremenjeno ? "border-warn-400 bg-warn-50" : value === 0 ? "border-ink-200 bg-ink-50 text-ink-400" : "border-ink-200 bg-white"
      }`}
    />
  );
}

/** Vnos planiranih kosov naloga (0 = nalog ni v postavitvi, največ max). */
function KosInput({
  value,
  max,
  delni,
  hint,
  onCommit,
}: {
  value: number;
  max: number;
  delni: boolean;
  hint: string;
  onCommit: (v: number) => void;
}) {
  return (
    <span className="inline-flex flex-col items-end">
      <input
        defaultValue={formatVnos(value)}
        inputMode="decimal"
        title={hint}
        aria-label={hint}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          const n = parseNum(e.target.value);
          if (n === null || n < 0) {
            e.target.value = formatVnos(value);
            return;
          }
          const v = Math.min(n, max);
          if (v !== value) onCommit(v);
          else e.target.value = formatVnos(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`h-8 w-16 rounded-md border px-1.5 text-right text-xs font-semibold tabular-nums focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 ${
          delni ? "border-fines-500 bg-fines-50 text-fines-700" : value === 0 ? "border-ink-200 bg-ink-50 text-ink-400" : "border-ink-200 bg-white"
        }`}
      />
      {value !== max && <span className="text-[10px] text-ink-400">od {formatNum(max)}</span>}
    </span>
  );
}

function Legenda({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

// =====================================================================
// SEZNAM KROVNIH NALOGOV
// =====================================================================

function KrovniSeznam({
  krovni,
  imaUvoz,
  oddelek,
  nerazporejeno,
  stanje,
  potrebnoSkupaj,
  razporejenoSkupaj,
  izbran,
  onIzberi,
  onPoudari,
  onZacniVlecenje,
  onKoncajVlecenje,
}: {
  krovni: Krovni[];
  imaUvoz: boolean;
  oddelek: ZasOddelek;
  nerazporejeno: (k: Krovni) => number;
  stanje: (kljuc: string) => StanjeKrovnega | undefined;
  potrebnoSkupaj: number;
  razporejenoSkupaj: number;
  izbran: string | null;
  onIzberi: (kljuc: string) => void;
  onPoudari: (kljuc: string | null) => void;
  onZacniVlecenje: (e: DragEvent, kljuc: string) => void;
  onKoncajVlecenje: () => void;
}) {
  const [iskanje, setIskanje] = useState("");
  const [filter, setFilter] = useState<FilterKrovnih>("nerazporejeni");
  const [odprti, setOdprti] = useState<Set<string>>(new Set());

  const q = iskanje.trim().toLowerCase();
  const vrstice = krovni
    .filter((k) => (filter === "vsi" ? true : filter === "z_urami" ? k.ure > 0 : nerazporejeno(k) > 0))
    .filter(
      (k) =>
        !q ||
        k.kljuc.toLowerCase().includes(q) ||
        (k.narocnik ?? "").toLowerCase().includes(q) ||
        k.nalogi.some((n) =>
          [n.st_naloga, n.koda_artikla, n.naziv_artikla, n.skupina_dn].some((v) => String(v ?? "").toLowerCase().includes(q)),
        ),
    );

  const FILTRI: { v: FilterKrovnih; label: string; hint: string }[] = [
    { v: "nerazporejeni", label: "Nerazporejeni", hint: "Prikaži krovne z nerazporejenimi urami" },
    { v: "z_urami", label: "Z urami", hint: "Prikaži vse krovne z urami oddelka" },
    { v: "vsi", label: "Vsi", hint: "Prikaži vse krovne naloge" },
  ];

  return (
    <div className="fp-card flex min-h-0 flex-col gap-3 p-3 sm:p-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-7rem)]">
      <div>
        <h3 className="text-lg font-bold text-ink-900">Krovni nalogi</h3>
        <p className="text-xs text-ink-500">
          Povleci na delovno mesto ali klikni in nato izberi dan. Ure: {oddelek.naziv.toLowerCase()}.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Povzetek label="potrebno" vrednost={`${formatUre(potrebnoSkupaj)} h`} />
        <Povzetek label="razporejeno" vrednost={`${formatUre(razporejenoSkupaj)} h`} cls="text-ok-600" />
        <Povzetek
          label="ostane"
          vrednost={`${formatUre(Math.max(0, potrebnoSkupaj - razporejenoSkupaj))} h`}
          cls="text-fines-500"
        />
      </div>

      <label className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-ink-400" aria-hidden />
        <input
          value={iskanje}
          onChange={(e) => setIskanje(e.target.value)}
          placeholder="Išči krovni, nalog, kodo, naročnika ..."
          title="Išči med krovnimi nalogi"
          className="h-10 w-full rounded-lg border border-ink-200 pl-8 pr-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
        />
      </label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter krovnih nalogov">
        {FILTRI.map((f) => (
          <button
            key={f.v}
            type="button"
            aria-pressed={filter === f.v}
            title={f.hint}
            onClick={() => setFilter(f.v)}
            className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
              filter === f.v
                ? "border-fines-500 bg-fines-500 text-white"
                : "border-ink-200 bg-white text-ink-600 hover:border-fines-500 hover:text-fines-500"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-ink-500">{vrstice.length}</span>
      </div>

      <div className="-mx-1 flex max-h-[60vh] min-h-0 flex-col gap-2 overflow-y-auto px-1 pb-1 xl:max-h-none xl:flex-1">
        {!imaUvoz && (
          <p className="p-4 text-center text-sm text-ink-500">
            Ni uvoženih nalogov. Uvozi jih z gumbom Sync v glavi ali na strani{" "}
            <Link href="/podatki" title="Odpri sync podatkov iz ERP" className="font-semibold text-fines-500 hover:underline">
              Podatki
            </Link>
            .
          </p>
        )}
        {imaUvoz && vrstice.length === 0 && <p className="p-4 text-center text-sm text-ink-500">Ni krovnih nalogov.</p>}
        {vrstice.map((k) => {
          const ostane = nerazporejeno(k);
          const delez = k.ure > 0 ? Math.min(100, ((k.ure - ostane) / k.ure) * 100) : 0;
          const odprt = odprti.has(k.kljuc);
          const jeIzbran = izbran === k.kljuc;
          const st = stanje(k.kljuc);
          const vPlanu = st?.razporejeni;
          return (
            <div
              key={k.kljuc}
              draggable={ostane > 0}
              onDragStart={(e) => onZacniVlecenje(e, k.kljuc)}
              onDragEnd={onKoncajVlecenje}
              onMouseEnter={() => onPoudari(k.kljuc)}
              onMouseLeave={() => onPoudari(null)}
              className={`rounded-lg border-2 bg-white p-2 transition-colors ${
                jeIzbran ? "border-fines-500 bg-fines-50" : "border-ink-200 hover:border-fines-200"
              } ${ostane > 0 ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <button
                type="button"
                title={ostane > 0 ? "Izberi krovni za postavitev s klikom" : "Krovni je v celoti razporejen"}
                onClick={() => ostane > 0 && onIzberi(k.kljuc)}
                className="flex w-full items-start gap-1.5 text-left"
              >
                <GripVertical className={`mt-0.5 h-4 w-4 shrink-0 ${ostane > 0 ? "text-ink-400" : "text-ink-200"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-mono text-sm font-bold text-ink-900">{k.kljuc}</span>
                    {k.brezNormativa > 0 && (
                      <span title={`${k.brezNormativa} nalogov nima normativa`}>
                        <AlertTriangle className="h-3.5 w-3.5 text-warn-700" aria-hidden />
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-sm font-bold tabular-nums text-ink-800">{formatUre(k.ure)} h</span>
                  </div>
                  <div className="truncate text-[11px] text-ink-500">
                    {vPlanu && vPlanu.size > 0 && vPlanu.size < k.nalogi.length
                      ? `ostane ${k.nalogi.length - vPlanu.size}/${k.nalogi.length} nalogov`
                      : `${k.nalogi.length} nalogov`}{" "}
                    · rok {k.rok ? formatShort(k.rok) : "–"}
                    {k.narocnik ? ` · ${k.narocnik}` : ""}
                  </div>
                </div>
              </button>
              {k.ure > 0 && (
                <div className="mt-1.5 flex items-center gap-2 pl-5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full bg-ok-500" style={{ width: `${delez}%` }} />
                  </div>
                  <span className={`text-[11px] font-semibold tabular-nums ${ostane > 0 ? "text-fines-500" : "text-ok-600"}`}>
                    {ostane > 0 ? `ostane ${formatUre(ostane)} h` : "razporejeno"}
                  </span>
                </div>
              )}
              <button
                type="button"
                title={odprt ? "Skrij naloge krovnega naloga" : "Prikaži naloge krovnega naloga"}
                onClick={() =>
                  setOdprti((s) => {
                    const n = new Set(s);
                    if (n.has(k.kljuc)) n.delete(k.kljuc);
                    else n.add(k.kljuc);
                    return n;
                  })
                }
                className="mt-1 flex items-center gap-1 pl-5 text-[11px] font-semibold text-ink-500 hover:text-fines-500"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${odprt ? "rotate-180" : ""}`} aria-hidden />
                Nalogi
              </button>
              {odprt && (
                <table className="mt-1 w-full text-[11px]">
                  <tbody>
                    {k.nalogi.map((n) => (
                      <tr
                        key={n.st_naloga}
                        className={`border-t border-ink-100 ${n.normativ ? "" : "bg-warn-50"} ${vPlanu?.has(n.st_naloga) ? "text-ink-400" : ""}`}
                      >
                        <td className="py-0.5 pr-1 font-mono">
                          <span
                            className="inline-flex items-center gap-0.5"
                            title={vPlanu?.has(n.st_naloga) ? "Nalog je že v planu" : "Nalog še ni v planu"}
                          >
                            {vPlanu?.has(n.st_naloga) && <Check className="h-3 w-3 text-ok-600" aria-hidden />}
                            {n.st_naloga}
                          </span>
                        </td>
                        <td className="max-w-32 truncate py-0.5 pr-1" title={`${n.koda_artikla} · ${n.naziv_artikla ?? ""}`}>
                          {n.naziv_artikla ?? n.koda_artikla}
                        </td>
                        <td className="py-0.5 pr-1 text-right tabular-nums">
                          {(st?.planKosi.get(n.st_naloga) ?? 0) > 0 && !vPlanu?.has(n.st_naloga) ? (
                            <span className="font-semibold text-fines-500" title="Planirani kosi / preostali kosi naloga">
                              {formatNum(st!.planKosi.get(n.st_naloga)!)}/{formatNum(n.preostala)} kos
                            </span>
                          ) : (
                            `${formatNum(n.preostala)} kos`
                          )}
                        </td>
                        <td className="py-0.5 text-right font-semibold tabular-nums">
                          {n.normativ ? `${formatUre(n.ure[oddelek.koda])} h` : <span className="text-warn-700">ni norm.</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Povzetek({ label, vrednost, cls = "text-ink-800" }: { label: string; vrednost: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-ink-50 px-1 py-1.5">
      <div className={`text-sm font-bold tabular-nums ${cls}`}>{vrednost}</div>
      <div className="text-[10px] text-ink-500">{label}</div>
    </div>
  );
}

// =====================================================================
// MODALI
// =====================================================================

type NalogStolpec = "nalog" | "ident" | "artikel" | "izdelano" | "drugje" | "plan" | "rok" | "ure";

function UrediPostavitev({
  postavitev,
  razpored,
  krovni,
  celice,
  koda,
  drugje,
  kosiZdaj,
  napredek,
  onPotrdi,
  onOdstrani,
  onPreklici,
}: {
  /** Planirani in izdelani kosi (zaklenjena postavitev). */
  napredek: Napredek | null;
  postavitev: Postavitev;
  razpored?: Razpored;
  krovni?: Krovni;
  celice: Celica[];
  koda: OddelekKoda;
  /** Stanje krovnega v drugih postavitvah (nalogi in kosi). */
  drugje: StanjeKrovnega | null;
  /** Trenutno planirani kosi nalogov v tej postavitvi. */
  kosiZdaj?: Map<string, number>;
  onPotrdi: (p: Postavitev) => void;
  onOdstrani: () => void;
  onPreklici: () => void;
}) {
  const [celicaId, setCelicaId] = useState(postavitev.delovno_mesto_id);
  const [datum, setDatum] = useState(postavitev.datum_zacetka);
  const [rocne, setRocne] = useState(postavitev.rocne_ure);
  const [ure, setUre] = useState(formatVnos(postavitev.ure));
  const [opomba, setOpomba] = useState(postavitev.opomba ?? "");
  const [naziv, setNaziv] = useState(postavitev.krovni_dn);
  const prosta = postavitev.prosta;

  const vsi = krovni?.nalogi ?? [];
  /** Največ kosov naloga v tej postavitvi: preostali, ki niso v drugih postavitvah. */
  const najvec = (n: NalogIzracun) => drugje?.prostiKosi.get(n.st_naloga) ?? n.preostala;
  // Planirani kosi po nalogih; 0 = nalog ni v tej postavitvi
  const [kos, setKos] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      vsi
        .filter((n) => !postavitev.nalogi || postavitev.nalogi.includes(n.st_naloga))
        .map((n) => [n.st_naloga, kosiZdaj?.get(n.st_naloga) ?? najvec(n)]),
    ),
  );
  // Zaklenjena postavitev obdrži vsebino in ure, dokler ne spremeniš nalogov ali kosov
  const zaklenjena = jeZaklenjena(postavitev);
  const [kosSpremenjen, setKosSpremenjen] = useState(false);
  const spremeniKos = (f: (k: Record<string, number>) => Record<string, number>) => {
    setKos(f);
    setKosSpremenjen(true);
  };
  const vkljucen = (st: string) => (kos[st] ?? 0) > 0;
  const izbrani = vsi.filter((n) => vkljucen(n.st_naloga));
  /** Nespremenjen vnos šteje s planiranimi kosi (izdelani ne skrajšajo plana). */
  const kosZaUre = (st: string) => {
    const prej = postavitev.kosi?.[st];
    return prej && kosiZdaj?.get(st) === kos[st] ? prej.kos : (kos[st] ?? 0);
  };
  const ureIzNalogov = ureNalogov(izbrani, koda, kosZaUre);
  const ureVsebine = !kosSpremenjen && zaklenjena ? postavitev.ure : krovni ? ureIzNalogov : postavitev.ure;
  // Vključeni nalogi, ki jih ni več v uvozu (zaključeni) - ostanejo v postavitvi
  const brezUvoza = postavitev.nalogi?.filter((st) => !vsi.some((n) => n.st_naloga === st)) ?? [];
  const vseVkljuceno = vsi.every((n) => (kos[n.st_naloga] ?? 0) >= najvec(n));

  const preklopi = (n: NalogIzracun) => spremeniKos((k) => ({ ...k, [n.st_naloga]: vkljucen(n.st_naloga) ? 0 : najvec(n) }));
  const vkljuciVse = () => spremeniKos(() => Object.fromEntries(vsi.map((n) => [n.st_naloga, najvec(n)])));

  /**
   * Izbrani nalogi in kosi za shranjevanje - vedno izrecno (zaklenjeno): nalogi, ki jih vodja kasneje doda v krovni,
   * se ne vključijo sami. Brez spremembe nalogov / kosov ostane vsebina, kot je bila.
   */
  function izbira(): Pick<Postavitev, "nalogi" | "kosi"> {
    if (!krovni || (!kosSpremenjen && (zaklenjena || (postavitev.rocne_ure && !postavitev.nalogi))))
      return { nalogi: postavitev.nalogi, kosi: postavitev.kosi ?? {} };
    const kosi: Record<string, KosNaloga> = {};
    for (const n of izbrani) {
      const v = kos[n.st_naloga];
      // Nespremenjen vpis obdrži prvotne kose in preostalo količino (za štetje izdelanih kosov)
      const prej = postavitev.kosi?.[n.st_naloga];
      kosi[n.st_naloga] = prej && kosiZdaj?.get(n.st_naloga) === v ? prej : { kos: v, od: n.preostala };
    }
    for (const st of brezUvoza) kosi[st] = postavitev.kosi?.[st] ?? { kos: 0, od: 0 };
    return { nalogi: [...izbrani.map((n) => n.st_naloga), ...brezUvoza], kosi };
  }

  const sort = useRazvrscanje<NalogIzracun, NalogStolpec>({
    nalog: (n) => n.st_naloga,
    ident: (n) => n.koda_artikla,
    artikel: (n) => n.naziv_artikla ?? n.koda_artikla,
    izdelano: (n) => n.izdelana_kolicina,
    drugje: (n) => drugje?.planKosi.get(n.st_naloga) ?? 0,
    plan: (n) => kos[n.st_naloga] ?? 0,
    rok: (n) => n.rok_izdelave,
    ure: (n) => n.ure[koda],
  });

  const ureNum = parseNum(ure);
  const veljavno =
    !!datum && (!prosta || !!naziv.trim()) && (rocne ? ureNum !== null && ureNum > 0 : !krovni || ureVsebine > 0);
  const polje =
    "h-10 w-full rounded-lg border border-ink-200 px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 disabled:bg-ink-50 disabled:text-ink-500";

  return (
    <Modal
      open
      title={prosta ? `Dodatno delo: ${postavitev.krovni_dn}` : `Krovni ${postavitev.krovni_dn}`}
      onClose={onPreklici}
      sirina="max-w-3xl"
      noga={
        <div className="flex flex-wrap justify-end gap-2">
          <Button hint={prosta ? "Odstrani nalogo iz plana" : "Odstrani krovni nalog iz plana"} variant="danger" icon={Trash2} onClick={onOdstrani} className="mr-auto">
            Odstrani
          </Button>
          <Button hint="Zapri brez sprememb" variant="neutral" onClick={onPreklici}>
            Prekliči
          </Button>
          <Button
            hint="Potrdi spremembe postavitve"
            variant="success"
            disabled={!veljavno}
            onClick={() =>
              onPotrdi({
                ...postavitev,
                krovni_dn: prosta ? naziv.trim() : postavitev.krovni_dn,
                delovno_mesto_id: celicaId,
                datum_zacetka: datum,
                ...izbira(),
                rocne_ure: rocne,
                ure: rocne ? round2(ureNum ?? postavitev.ure) : ureVsebine > 0 ? ureVsebine : postavitev.ure,
                opomba: opomba.trim() || null,
              })
            }
          >
            Potrdi
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {prosta && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-600">Naloga</span>
            <input
              value={naziv}
              onChange={(e) => setNaziv(e.target.value)}
              title="Kratek opis dela, npr. pakiranje elektronik"
              className={`${polje} ${naziv.trim() ? "" : "border-nok-500"}`}
            />
          </label>
        )}
        <div className={`grid gap-2 text-center ${prosta ? "grid-cols-1" : "grid-cols-3"}`}>
          {!prosta && <Povzetek label="nalogov v planu" vrednost={krovni ? `${izbrani.length}/${vsi.length}` : "–"} />}
          <Povzetek label="ure oddelka" vrednost={`${formatUre(rocne ? (ureNum ?? 0) : ureVsebine)} h`} />
          {!prosta && <Povzetek label="rok izdelave" vrednost={krovni?.rok ? formatShort(krovni.rok) : "–"} />}
        </div>
        {!krovni && !prosta && (
          <p className="rounded-lg bg-warn-50 px-3 py-2 text-warn-700">Krovni nalog ni v zadnjem uvozu (morda je že zaključen).</p>
        )}
        {napredek && napredek.razpisano > 0 && (
          <p className="text-ink-600">
            Izdelano <strong className="text-ok-600">{formatNum(napredek.izdelano)}</strong> od {formatNum(napredek.razpisano)} kosov nalogov
            postavitve ({Math.round(delezNapredka(napredek) * 100)} %).
          </p>
        )}
        {zaklenjena && (
          <p className="text-xs text-ink-500">
            Postavitev je zaklenjena: nalogi, ki jih vodja kasneje doda v krovni, se ne dodajo sami (na planu so označeni z +h),
            izdelani kosi ne skrajšajo plana. Ure se preračunajo, ko spremeniš naloge ali kose.
          </p>
        )}
        {razpored?.od && (
          <p className="text-ink-600">
            Trenutni plan: <strong>{formatShort(razpored.od)}</strong> – <strong>{razpored.do ? formatShort(razpored.do) : "–"}</strong>
            {razpored.nerazporejeno > 0 && (
              <span className="text-nok-600"> · {formatUre(razpored.nerazporejeno)} h brez kapacitete</span>
            )}
          </p>
        )}

        {krovni && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-end gap-2">
              <div className="mr-auto">
                <div className="text-xs font-semibold text-ink-600">Nalogi krovnega</div>
                <div className="text-[11px] text-ink-500">
                  Izdelano = izdelano / razpisano · Drugje = v drugih postavitvah krovnega · Plan kos = koliko jih delamo v tej postavitvi
                  (največ razpisano - izdelano - drugje) · X = nalog ne delamo
                </div>
              </div>
              <Button
                hint="Vključi vse naloge, ki niso v drugih postavitvah"
                variant="success"
                icon={Plus}
                disabled={vseVkljuceno}
                onClick={vkljuciVse}
              >
                Vključi vse
              </Button>
            </div>
            <div className="max-h-[40vh] overflow-auto rounded-lg pb-3">
              <table className="w-full text-xs">
                <thead className="fp-thead">
                  <tr>
                    <SortTh sort={sort} kljuc="nalog">Nalog</SortTh>
                    <SortTh sort={sort} kljuc="ident">Ident</SortTh>
                    <SortTh sort={sort} kljuc="artikel">Artikel</SortTh>
                    <SortTh sort={sort} kljuc="izdelano" desno hint="Izdelano / razpisano (izpis delovnih nalogov)">Izdelano</SortTh>
                    <SortTh sort={sort} kljuc="drugje" desno hint="Kosi naloga v drugih postavitvah krovnega">Drugje</SortTh>
                    <SortTh sort={sort} kljuc="plan" desno>Plan kos</SortTh>
                    <SortTh sort={sort} kljuc="rok">Rok</SortTh>
                    <SortTh sort={sort} kljuc="ure" desno>Ure</SortTh>
                    <th className="w-11 px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="border-ink-100">
                  {sort.razvrsti(vsi).map((n) => {
                    const vkl = vkljucen(n.st_naloga);
                    const vDrugi = !vkl && !!drugje?.razporejeni.has(n.st_naloga);
                    const max = najvec(n);
                    return (
                      <tr
                        key={n.st_naloga}
                        className={`border-b border-ink-100 ${vkl ? "hover:bg-ink-50" : "bg-ink-50 text-ink-400"} ${
                          !vkl && !vDrugi ? "line-through" : ""
                        }`}
                      >
                        <td className="px-2 py-1 font-mono">{n.st_naloga}</td>
                        <td className="whitespace-nowrap px-2 py-1 font-mono">{n.koda_artikla}</td>
                        <td className="max-w-40 truncate px-2 py-1" title={n.naziv_artikla ?? ""}>
                          {n.naziv_artikla ?? n.koda_artikla}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1 text-right tabular-nums"
                          title={`Izdelano ${formatNum(n.izdelana_kolicina)} od ${formatNum(n.razpisana_kolicina)} · ostane ${formatNum(n.preostala)}`}
                        >
                          <span className={n.izdelana_kolicina > 0 ? "font-bold text-ok-600" : ""}>{formatNum(n.izdelana_kolicina)}</span>/
                          {formatNum(n.razpisana_kolicina)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {(drugje?.planKosi.get(n.st_naloga) ?? 0) > 0 ? (
                            formatNum(drugje!.planKosi.get(n.st_naloga)!)
                          ) : (
                            <span className="text-ink-300">–</span>
                          )}
                        </td>
                        <td className="px-1 py-0.5 text-right no-underline">
                          {!vDrugi && (
                            <KosInput
                              key={`${n.st_naloga}-${kos[n.st_naloga] ?? 0}`}
                              value={kos[n.st_naloga] ?? 0}
                              max={max}
                              delni={vkl && (kos[n.st_naloga] ?? 0) < n.preostala}
                              hint={`Planirani kosi naloga ${n.st_naloga} (največ ${formatNum(max)})`}
                              onCommit={(v) => spremeniKos((k) => ({ ...k, [n.st_naloga]: v }))}
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums" title={n.rok_izdelave ? formatShort(n.rok_izdelave) : undefined}>
                          {n.rok_izdelave ? formatDayMonth(n.rok_izdelave) : "–"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">
                          {n.normativ ? `${formatUre(vkl ? urePoKosu(n, koda) * kos[n.st_naloga] : n.ure[koda])} h` : <span className="text-warn-700">ni norm.</span>}
                        </td>
                        <td className="px-1 py-0.5 text-right no-underline">
                          {vDrugi ? (
                            <span className="text-[10px] italic" title="Nalog je v drugi postavitvi tega krovnega naloga">
                              drugje
                            </span>
                          ) : (
                            <IconButton
                              hint={vkl ? "Izključi nalog iz te postavitve" : "Vključi nalog v to postavitev"}
                              variant={vkl ? "danger" : "success"}
                              icon={vkl ? X : Plus}
                              onClick={() => preklopi(n)}
                              className="!h-9 !w-9 [&>svg]:!h-[18px] [&>svg]:!w-[18px]"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {brezUvoza.length > 0 && (
              <p className="text-xs text-ink-500">{brezUvoza.length} vključenih nalogov ni več v uvozu (zaključeni).</p>
            )}
            {!rocne && izbrani.length > 0 && ureIzNalogov <= 0 && (
              <p className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-700">
                Izbrani nalogi nimajo ur tega oddelka (ni normativa ali so izdelani) - vpiši ročne ure.
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-600">Delovno mesto</span>
          <select value={celicaId} onChange={(e) => setCelicaId(Number(e.target.value))} title="Izberi delovno mesto postavitve" className={polje}>
            {celice.map((c) => (
              <option key={c.id} value={c.id}>
                {c.naziv}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-600">Začetek</span>
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} title="Dan začetka dela" className={polje} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-600">Delovne ure</span>
            <input
              value={rocne ? ure : formatVnos(ureVsebine)}
              disabled={!rocne}
              inputMode="decimal"
              onChange={(e) => setUre(e.target.value)}
              title={rocne ? "Ročno vpisane ure postavitve" : "Ure = vsota ur vključenih nalogov"}
              className={`${polje} text-right ${rocne && (ureNum === null || ureNum <= 0) ? "border-nok-500" : ""}`}
            />
          </label>
        </div>
        {!prosta && (
          <label
            title="Vklopljeno: ure vpišeš sam; izklopljeno: ure se računajo iz vključenih nalogov"
            className={`inline-flex h-10 cursor-pointer select-none items-center gap-2 self-start rounded-lg border px-3 text-sm transition-colors ${
              rocne ? "border-fines-500 bg-fines-50 text-ink-900" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-100"
            }`}
          >
            <input
              type="checkbox"
              checked={rocne}
              onChange={(e) => {
                setRocne(e.target.checked);
                if (e.target.checked && krovni) setUre(formatVnos(ureIzNalogov > 0 ? ureIzNalogov : postavitev.ure));
              }}
              className="h-4 w-4 accent-fines-500"
            />
            Ročno vpisane ure
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-600">Opomba</span>
          <input value={opomba} onChange={(e) => setOpomba(e.target.value)} title="Opomba k postavitvi" className={polje} />
        </label>
        <p className="text-xs text-ink-500">Spremembe se zapišejo v bazo z gumbom Shrani plan.</p>
      </div>
    </Modal>
  );
}

function NovaNaloga({
  celicaId,
  celice,
  zacetek,
  onDodaj,
  onPreklici,
}: {
  celicaId: number;
  celice: Celica[];
  zacetek: IsoDate;
  onDodaj: (p: Pick<Postavitev, "delovno_mesto_id" | "krovni_dn" | "datum_zacetka" | "ure" | "opomba">) => void;
  onPreklici: () => void;
}) {
  const [celica, setCelica] = useState(celicaId);
  const [naziv, setNaziv] = useState("");
  const [datum, setDatum] = useState(zacetek);
  const [ure, setUre] = useState("");
  const [opomba, setOpomba] = useState("");

  const ureNum = parseNum(ure);
  const veljavno = !!naziv.trim() && !!datum && ureNum !== null && ureNum > 0;
  const polje =
    "h-10 w-full rounded-lg border border-ink-200 px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

  return (
    <Modal
      open
      title="Nova naloga - dodatno delo"
      onClose={onPreklici}
      noga={
        <div className="flex flex-wrap justify-end gap-2">
          <Button hint="Zapri brez dodajanja" variant="neutral" onClick={onPreklici}>
            Prekliči
          </Button>
          <Button
            hint="Dodaj nalogo v plan"
            variant="success"
            icon={Plus}
            disabled={!veljavno}
            onClick={() =>
              onDodaj({
                delovno_mesto_id: celica,
                krovni_dn: naziv.trim(),
                datum_zacetka: datum,
                ure: round2(ureNum ?? 0),
                opomba: opomba.trim() || null,
              })
            }
          >
            Dodaj
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-600">
          Delo izven redne proizvodnje (npr. pakiranje elektronik, povezovalni kompleti). Ne šteje v seštevek oddelka.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-600">Naloga</span>
          <input
            autoFocus
            value={naziv}
            onChange={(e) => setNaziv(e.target.value)}
            placeholder="npr. Pakiranje elektronik"
            title="Kratek opis dela, npr. pakiranje elektronik"
            className={polje}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-600">Delovno mesto</span>
          <select value={celica} onChange={(e) => setCelica(Number(e.target.value))} title="Izberi delovno mesto naloge" className={polje}>
            {celice.map((c) => (
              <option key={c.id} value={c.id}>
                {c.naziv}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-600">Začetek</span>
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} title="Dan začetka dela" className={polje} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-600">Delovne ure</span>
            <input
              value={ure}
              inputMode="decimal"
              onChange={(e) => setUre(e.target.value)}
              title="Ocena delovnih ur za nalogo"
              className={`${polje} text-right`}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-600">Opomba</span>
          <input value={opomba} onChange={(e) => setOpomba(e.target.value)} title="Opomba k nalogi" className={polje} />
        </label>
        <p className="text-xs text-ink-500">Naloga se zapiše v bazo z gumbom Shrani plan.</p>
      </div>
    </Modal>
  );
}

function CeliceNastavitve({
  celice,
  onShranjeno,
  onNapaka,
}: {
  celice: Celica[];
  onShranjeno: () => void;
  onNapaka: (m: string) => void;
}) {
  const [vrednosti, setVrednosti] = useState<Record<number, string>>(
    Object.fromEntries(celice.map((c) => [c.id, formatNum(c.privzeto_zaposlenih)])),
  );
  const [shranjujem, setShranjujem] = useState(false);

  async function shrani() {
    setShranjujem(true);
    try {
      for (const c of celice) {
        const v = parseNum(vrednosti[c.id]);
        if (v === null || v < 0 || v > 99) throw new Error(`Neveljavna vrednost pri delovnem mestu ${c.naziv}.`);
        if (v !== c.privzeto_zaposlenih) await shraniPrivzetoCelice(c.id, v);
      }
      onShranjeno();
    } catch (e) {
      onNapaka((e as Error).message);
    } finally {
      setShranjujem(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink-600">Privzeto število zaposlenih velja za vse dni, kjer ni vpisano posebej.</p>
      <table className="w-full">
        <tbody>
          {celice.map((c) => (
            <tr key={c.id} className="border-t border-ink-100">
              <td className="py-2 font-semibold">{c.naziv}</td>
              <td className="py-2 text-right">
                <input
                  value={vrednosti[c.id]}
                  inputMode="decimal"
                  title={`Privzeto število zaposlenih: ${c.naziv}`}
                  onChange={(e) => setVrednosti((v) => ({ ...v, [c.id]: e.target.value }))}
                  className="h-9 w-24 rounded-md border border-ink-200 px-2 text-right focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button hint="Shrani privzeto število zaposlenih" variant="success" disabled={shranjujem} onClick={shrani} className="self-end">
        {shranjujem ? "Shranjujem ..." : "Shrani"}
      </Button>
    </div>
  );
}
