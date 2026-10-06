"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  MousePointerClick,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { addDays, formatDayMonth, formatShort, isoWeek, mondayOf, toIso, type IsoDate } from "@/lib/dates";
import { naloziNormative, type Normativ, type OddelekKoda } from "@/lib/normativi";
import { lahkoZapustim, useNeshranjeno } from "@/lib/neshranjeno";
import {
  izvoziPlanXlsx,
  jeDelovniDan,
  naloziCelice,
  naloziPostavitve,
  naloziZaposlene,
  razporedi,
  shraniPlan,
  shraniPrivzetoCelice,
  zdruziKrovne,
  type Celica,
  type Krovni,
  type Postavitev,
  type Razpored,
  type ZaposleniDan,
} from "@/lib/plan";
import { formatNum, formatUre, parseNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import {
  izracunajNaloge,
  naloziZadnjiUvoz,
  naloziZasOddelke,
  type Nalog,
  type Uvoz,
  type ZasOddelek,
} from "@/lib/zasedenost";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfigMissing, Loading } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { SaveBar } from "@/components/rutina/SaveBar";

const DAN_IME = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];
const SIRINA_IMENA = 170; // px - stolpec z imenom delovnega mesta
const MIN_DAN = 78; // px - najmanjša širina dneva
const VISINA_PASU = 30; // px - en pas postavitev
const TEDNI_IZBIRA = [1, 2, 4] as const;

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

  useEffect(() => {
    let preklic = false;
    naloziPodatke()
      .then((p) => {
        if (!preklic) setPodatki(p);
      })
      .catch((e) => notify("error", `Napaka pri nalaganju delovnega plana: ${e.message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [notify]);

  const izracun = useMemo(
    () => (podatki ? izracunajNaloge(podatki.nalogi, podatki.normativi) : []),
    [podatki],
  );
  const krovni = useMemo(() => zdruziKrovne(izracun, koda), [izracun, koda]);

  async function osvezi() {
    setPodatki(await naloziPodatke());
    setVerzija((v) => v + 1);
  }

  async function osveziCelice() {
    const celice = await naloziCelice(toIso(new Date()));
    setPodatki((p) => (p ? { ...p, celice } : p));
  }

  if (!podatki) return <Loading />;
  const oddelek = podatki.oddelki.find((o) => o.koda === koda);

  return (
    <div className="flex flex-col gap-4">
      {/* ============ GLAVA ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-xl font-bold text-ink-900">Delovni plan</h2>
          <p className="text-sm text-ink-500">
            Krovne naloge povleci na delovno mesto in dan · trajanje se izračuna iz delovnih ur in števila zaposlenih
          </p>
        </div>
        <Link
          href="/proizvodnja/zasedenost"
          title="Uvoz nalogov je na Pregledu zasedenosti"
          onClick={(e) => {
            if (!lahkoZapustim()) e.preventDefault();
          }}
          className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-600 hover:border-fines-500"
        >
          <Upload className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          {podatki.uvoz ? (
            <span>
              <strong className="text-ink-800">{podatki.uvoz.st_nalogov} nalogov</strong> · uvoz{" "}
              {formatShort(toIso(new Date(podatki.uvoz.created_at)))}
            </span>
          ) : (
            <span>Ni uvoza nalogov</span>
          )}
        </Link>
      </div>

      {/* ============ ODDELKI ============ */}
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

      {!oddelek ? (
        <div className="fp-card p-8 text-center text-ink-600">Oddelek ni najden.</div>
      ) : (
        <PlanOddelka
          key={`${koda}-${verzija}`}
          oddelek={oddelek}
          celice={podatki.celice.filter((c) => c.oddelek_id === oddelek.id)}
          krovni={krovni}
          imaUvoz={!!podatki.uvoz}
          postavitve={podatki.postavitve.filter((p) => p.oddelek_id === oddelek.id)}
          zaposleni={podatki.zaposleni}
          zacetek={zacetek}
          onZacetek={setZacetek}
          stTednov={stTednov}
          onStTednov={setStTednov}
          onShranjeno={osvezi}
          onCeliceSpremenjene={osveziCelice}
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
  imaUvoz,
  postavitve,
  zaposleni,
  zacetek,
  onZacetek,
  stTednov,
  onStTednov,
  onShranjeno,
  onCeliceSpremenjene,
}: {
  oddelek: ZasOddelek;
  celice: Celica[];
  krovni: Krovni[];
  imaUvoz: boolean;
  postavitve: Postavitev[];
  zaposleni: ZaposleniDan[];
  zacetek: IsoDate;
  onZacetek: (d: IsoDate) => void;
  stTednov: number;
  onStTednov: (n: number) => void;
  onShranjeno: () => Promise<void>;
  onCeliceSpremenjene: () => Promise<void>;
}) {
  const notify = useToast();
  const danes = toIso(new Date());

  // Lokalna kopija plana - spremembe se shranijo z gumbom Shrani plan
  const [lokalne, setLokalne] = useState<Postavitev[]>(postavitve);
  const [zapEdits, setZapEdits] = useState<Record<string, number>>({});
  const [inputVerzija, setInputVerzija] = useState(0);
  const [shranjujem, setShranjujem] = useState(false);

  const [izbranKrovni, setIzbranKrovni] = useState<string | null>(null); // za postavitev s klikom (tablica)
  const [poudarjen, setPoudarjen] = useState<string | null>(null);
  const [vlecem, setVlecem] = useState(false);
  const [nadDnem, setNadDnem] = useState<string | null>(null);
  const [urejamId, setUrejamId] = useState<number | null>(null);
  const [nastavitveOdprte, setNastavitveOdprte] = useState(false);

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
      (o.delovno_mesto_id !== p.delovno_mesto_id ||
        o.datum_zacetka !== p.datum_zacetka ||
        o.ure !== p.ure ||
        (o.opomba ?? "") !== (p.opomba ?? ""))
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

  const { razpored, zasedeno } = useMemo(() => razporedi(lokalne, kapaciteta), [lokalne, kapaciteta]);

  const dnevi = useMemo(
    () =>
      Array.from({ length: stTednov }, (_, w) => Array.from({ length: 5 }, (_, i) => addDays(zacetek, w * 7 + i))).flat(),
    [zacetek, stTednov],
  );

  // ---------- krovni ----------
  const krovniPoKljucu = useMemo(() => new Map(krovni.map((k) => [k.kljuc, k])), [krovni]);
  const planiranoKrovni = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of lokalne) m.set(p.krovni_dn, (m.get(p.krovni_dn) ?? 0) + p.ure);
    return m;
  }, [lokalne]);
  const nerazporejeno = (k: Krovni) => Math.max(0, round2(k.ure - (planiranoKrovni.get(k.kljuc) ?? 0)));

  // ---------- akcije ----------
  function postavi(kljuc: string, celicaId: number, datum: IsoDate) {
    const k = krovniPoKljucu.get(kljuc);
    if (!k) return;
    if (k.ure <= 0) {
      notify("warning", `Krovni ${kljuc} nima ur za ${oddelek.naziv.toLowerCase()} (ni normativa ali je izdelan).`);
      return;
    }
    const ure = nerazporejeno(k);
    if (ure <= 0) {
      notify("warning", `Krovni ${kljuc} je že v celoti razporejen. Ure spremeniš s klikom na postavitev.`);
      return;
    }
    const id = naslednjiId.current--;
    setLokalne((l) => [
      ...l,
      { id, oddelek_id: oddelek.id, delovno_mesto_id: celicaId, krovni_dn: kljuc, datum_zacetka: datum, ure, opomba: null },
    ]);
    setIzbranKrovni(null);
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
        nove,
        spremenjene,
        odstranjene,
        zaposleni: Object.entries(zapEdits).map(([kljuc, st_zaposlenih]) => {
          const [id, datum] = kljuc.split("|");
          return { delovno_mesto_id: Number(id), datum, st_zaposlenih };
        }),
      });
      notify("success", "Delovni plan je shranjen.");
      await onShranjeno();
    } catch (e) {
      notify("error", `Napaka pri shranjevanju: ${(e as Error).message}`, 10000);
      setShranjujem(false);
    }
  }

  function izvozi() {
    const vrstice = lokalne
      .map((p) => ({
        celica: celicaPoId.get(p.delovno_mesto_id),
        postavitev: p,
        razpored: razpored.get(p.id),
        krovni: krovniPoKljucu.get(p.krovni_dn),
      }))
      .sort(
        (a, b) =>
          (a.celica?.vrstni_red ?? 0) - (b.celica?.vrstni_red ?? 0) ||
          (a.razpored?.od ?? a.postavitev.datum_zacetka).localeCompare(b.razpored?.od ?? b.postavitev.datum_zacetka),
      )
      .map((v) => ({ ...v, celica: v.celica?.naziv ?? "" }));
    izvoziPlanXlsx(vrstice, `delovni_plan_${oddelek.naziv.toLowerCase().replace(/\s+/g, "_")}_${zacetek}.xlsx`);
  }

  // ---------- povzetek oddelka po dnevih ----------
  const oddelekDan = (d: IsoDate) => {
    let kap = 0;
    let plan = 0;
    for (const c of celice) {
      kap += kapaciteta(c.id, d);
      plan += zasedeno.get(`${c.id}|${d}`) ?? 0;
    }
    return { kap, plan };
  };

  const potrebnoSkupaj = krovni.reduce((s, k) => s + k.ure, 0);
  const razporejenoSkupaj = krovni.reduce((s, k) => s + Math.min(k.ure, planiranoKrovni.get(k.kljuc) ?? 0), 0);

  const urejana = urejamId !== null ? lokalne.find((p) => p.id === urejamId) ?? null : null;
  const stolpci = `${SIRINA_IMENA}px repeat(${dnevi.length}, minmax(${MIN_DAN}px, 1fr))`;
  const minSirina = SIRINA_IMENA + dnevi.length * MIN_DAN;
  const jeTaTeden = zacetek === mondayOf(danes);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ============ KROVNI NALOGI ============ */}
        <KrovniSeznam
          krovni={krovni}
          imaUvoz={imaUvoz}
          oddelek={oddelek}
          nerazporejeno={nerazporejeno}
          potrebnoSkupaj={potrebnoSkupaj}
          razporejenoSkupaj={razporejenoSkupaj}
          izbran={izbranKrovni}
          onIzberi={(k) => setIzbranKrovni(izbranKrovni === k ? null : k)}
          onPoudari={setPoudarjen}
          onZacniVlecenje={(e, k) => zacniVlecenje(e, { tip: "krovni", kljuc: k })}
          onKoncajVlecenje={koncajVlecenje}
        />

        {/* ============ KOLEDAR DELOVNIH MEST ============ */}
        <div className="fp-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton hint="Premakni plan en teden nazaj" icon={ChevronLeft} onClick={() => onZacetek(addDays(zacetek, -7))} />
            <IconButton hint="Premakni plan en teden naprej" icon={ChevronRight} onClick={() => onZacetek(addDays(zacetek, 7))} />
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
            <span className="ml-auto text-xs text-ink-500">{formatNum(oddelek.ure_na_dan)} h/dan na osebo</span>
            <IconButton
              hint="Privzeto število zaposlenih na delovnih mestih"
              icon={Settings}
              onClick={() => setNastavitveOdprte(true)}
            />
            <Button hint="Izvozi delovni plan oddelka v Excel" variant="neutral" icon={Download} disabled={lokalne.length === 0} onClick={izvozi}>
              Izvoz
            </Button>
          </div>

          {izbranKrovni && (
            <div className="flex items-center gap-2 rounded-lg bg-fines-50 px-3 py-2 text-sm text-fines-700">
              <MousePointerClick className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">
                Izbran krovni <strong className="font-mono">{izbranKrovni}</strong> - klikni dan na delovnem mestu, kjer naj se začne.
              </span>
              <IconButton hint="Prekliči izbiro krovnega naloga" icon={X} onClick={() => setIzbranKrovni(null)} />
            </div>
          )}

          {celice.length === 0 ? (
            <div className="p-8 text-center text-ink-600">
              Oddelek nima aktivnih delovnih mest. Delovna mesta so ista kot v rutini (fp_delovna_mesta).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: minSirina }} className="flex flex-col gap-1">
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
                  <div className="px-2 py-1.5 text-sm font-bold">{oddelek.naziv} skupaj</div>
                  {dnevi.map((d, i) => {
                    const { kap, plan } = oddelekDan(d);
                    const ob = obremenitev(plan, kap);
                    return (
                      <div
                        key={d}
                        className={`px-1 py-1.5 text-center text-[11px] tabular-nums ${i % 5 === 0 ? "border-l-2 border-ink-600" : ""}`}
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
                    postavitve={lokalne.filter((p) => p.delovno_mesto_id === c.id)}
                    razpored={razpored}
                    zasedeno={zasedeno}
                    krovniPoKljucu={krovniPoKljucu}
                    kapaciteta={kapaciteta}
                    steviloZaposlenih={steviloZaposlenih}
                    spremenjeniZaposleni={(d) => zapEdits[`${c.id}|${d}`] !== undefined}
                    inputVerzija={inputVerzija}
                    onZaposleni={(d, v) => setZapEdits((z) => ({ ...z, [`${c.id}|${d}`]: v }))}
                    vlecem={vlecem}
                    izbranKrovni={izbranKrovni}
                    poudarjen={poudarjen ?? izbranKrovni}
                    nadDnem={nadDnem}
                    onNadDnem={setNadDnem}
                    onSpusti={(d) => spusti(c.id, d)}
                    onKlikDan={(d) => izbranKrovni && postavi(izbranKrovni, c.id, d)}
                    onZacniVlecenje={(e, id) => zacniVlecenje(e, { tip: "postavitev", id })}
                    onKoncajVlecenje={koncajVlecenje}
                    onUredi={setUrejamId}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
            <Legenda cls="bg-ok-500" label="do 85 %" />
            <Legenda cls="bg-warn-400" label="85–100 %" />
            <Legenda cls="bg-nok-500" label="nad 100 %" />
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-5 rounded-sm bg-fines-500 ring-2 ring-nok-500" />
              konec plana po roku izdelave
            </span>
            <span>Kapaciteta = zaposleni × ure na dan · 0 zaposlenih = celica ta dan ne dela</span>
          </div>
        </div>
      </div>

      <SaveBar
        steviloSprememb={steviloSprememb}
        shranjujem={shranjujem}
        onSave={shrani}
        onReset={() => {
          setLokalne(postavitve);
          setZapEdits({});
          setInputVerzija((v) => v + 1);
        }}
        shraniLabel="Shrani plan"
        shraniHint="Shrani delovni plan oddelka"
      />

      <Modal open={!!urejana} title={`Krovni ${urejana?.krovni_dn ?? ""}`} onClose={() => setUrejamId(null)}>
        {urejana && (
          <UrediPostavitev
            postavitev={urejana}
            razpored={razpored.get(urejana.id)}
            krovni={krovniPoKljucu.get(urejana.krovni_dn)}
            celice={celice}
            nerazporejeno={(k) => nerazporejeno(k)}
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
      </Modal>

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
}: {
  celica: Celica;
  dnevi: IsoDate[];
  stolpci: string;
  danes: IsoDate;
  postavitve: Postavitev[];
  razpored: Map<number, Razpored>;
  zasedeno: Map<string, number>;
  krovniPoKljucu: Map<string, Krovni>;
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
      <div className="flex flex-col justify-center gap-0.5 border-r border-ink-200 px-2 py-2" style={{ gridColumn: 1, gridRow: vrsticaVse }}>
        <div className="text-sm font-bold leading-tight text-ink-800">{celica.naziv}</div>
        <div className="text-[11px] text-ink-500">privzeto {formatNum(celica.privzeto_zaposlenih)} oseb</div>
        <div className={`text-[11px] font-bold tabular-nums ${obSkupaj.txt}`} title="Obremenitev v prikazanem obdobju">
          {formatUre(vsotaPlan)}/{formatUre(vsotaKap)} h · {vsotaKap > 0 ? fmtPct(obSkupaj.pct) : "–"}
        </div>
        {brezKapacitete.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-nok-600" title="Postavitve brez dovolj kapacitete v obzorju">
            <AlertTriangle className="h-3 w-3" aria-hidden /> ni kapacitete
          </div>
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
          className={`relative z-10 flex items-center justify-center gap-1 px-1 py-1 ${vlecem ? "pointer-events-none" : ""}`}
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
        const k = krovniPoKljucu.get(p.krovni_dn);
        const poRoku = !!(k?.rok && r.do && r.do > k.rok);
        const jePoudarjen = poudarjen === p.krovni_dn;
        const opis = [
          `Krovni ${p.krovni_dn}`,
          k ? `${k.nalogi.length} nalogov` : "ni v zadnjem uvozu",
          `${formatUre(p.ure)} h`,
          `plan ${formatShort(r.od!)} – ${formatShort(r.do!)}`,
          k?.rok ? `rok ${formatShort(k.rok)}` : null,
          poRoku ? "KONEC PO ROKU!" : null,
          r.nerazporejeno > 0 ? `${formatUre(r.nerazporejeno)} h brez kapacitete` : null,
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
            className={`relative z-10 mx-0.5 my-0.5 flex min-w-0 cursor-grab items-center gap-1 overflow-hidden px-2 text-left text-xs font-semibold text-white shadow-sm active:cursor-grabbing ${
              odrezanZac ? "rounded-l-none" : "rounded-l-md"
            } ${odrezanKon ? "rounded-r-none" : "rounded-r-md"} ${
              !k ? "bg-ink-400" : jePoudarjen ? "bg-ink-800" : "bg-fines-500 hover:bg-fines-600"
            } ${poRoku || r.nerazporejeno > 0 ? "ring-2 ring-inset ring-nok-500" : ""} ${vlecem ? "pointer-events-none opacity-60" : ""}`}
          >
            {odrezanZac && <ChevronLeft className="h-3 w-3 shrink-0" aria-hidden />}
            {(poRoku || r.nerazporejeno > 0) && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />}
            <span className="truncate font-mono">{p.krovni_dn}</span>
            <span className="shrink-0 font-normal opacity-90">{formatUre(p.ure)} h</span>
            {odrezanKon && <ChevronRight className="ml-auto h-3 w-3 shrink-0" aria-hidden />}
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
            className={`pointer-events-none relative z-10 px-1.5 pb-1.5 pt-0.5`}
            title={`${formatUre(plan)} h od ${formatUre(kap)} h`}
          >
            {kap > 0 ? (
              <>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className={`h-full ${ob.cls}`} style={{ width: `${Math.min(100, ob.pct)}%` }} />
                </div>
                <div className={`text-right text-[10px] font-bold tabular-nums ${plan > 0 ? ob.txt : "text-ink-400"}`}>
                  {fmtPct(ob.pct)}
                </div>
              </>
            ) : (
              <div className="text-center text-[10px] text-ink-400">ne dela</div>
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
      defaultValue={formatNum(value)}
      inputMode="decimal"
      title={hint}
      aria-label={hint}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const n = parseNum(e.target.value);
        if (n === null || n < 0 || n > 99) {
          e.target.value = formatNum(value);
          return;
        }
        if (n !== value) onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`h-7 w-10 rounded-md border px-1 text-center text-xs font-semibold tabular-nums focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 ${
        spremenjeno ? "border-warn-400 bg-warn-50" : value === 0 ? "border-ink-200 bg-ink-50 text-ink-400" : "border-ink-200 bg-white"
      }`}
    />
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
            Ni uvoženih nalogov. Uvozi jih na{" "}
            <Link href="/proizvodnja/zasedenost" title="Odpri pregled zasedenosti" className="font-semibold text-fines-500 hover:underline">
              Pregledu zasedenosti
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
                    {k.nalogi.length} nalogov · rok {k.rok ? formatShort(k.rok) : "–"}
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
                      <tr key={n.st_naloga} className={`border-t border-ink-100 ${n.normativ ? "" : "bg-warn-50"}`}>
                        <td className="py-0.5 pr-1 font-mono">{n.st_naloga}</td>
                        <td className="max-w-32 truncate py-0.5 pr-1" title={`${n.koda_artikla} · ${n.naziv_artikla ?? ""}`}>
                          {n.naziv_artikla ?? n.koda_artikla}
                        </td>
                        <td className="py-0.5 pr-1 text-right tabular-nums">{formatNum(n.preostala)} kos</td>
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

function UrediPostavitev({
  postavitev,
  razpored,
  krovni,
  celice,
  nerazporejeno,
  onPotrdi,
  onOdstrani,
  onPreklici,
}: {
  postavitev: Postavitev;
  razpored?: Razpored;
  krovni?: Krovni;
  celice: Celica[];
  nerazporejeno: (k: Krovni) => number;
  onPotrdi: (p: Postavitev) => void;
  onOdstrani: () => void;
  onPreklici: () => void;
}) {
  const [celicaId, setCelicaId] = useState(postavitev.delovno_mesto_id);
  const [datum, setDatum] = useState(postavitev.datum_zacetka);
  const [ure, setUre] = useState(formatNum(postavitev.ure));
  const [opomba, setOpomba] = useState(postavitev.opomba ?? "");

  const ureNum = parseNum(ure);
  const ostane = krovni ? nerazporejeno(krovni) : 0;
  const veljavno = ureNum !== null && ureNum > 0 && !!datum;
  const polje =
    "h-10 w-full rounded-lg border border-ink-200 px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Povzetek label="nalogov" vrednost={krovni ? String(krovni.nalogi.length) : "–"} />
        <Povzetek label="ure oddelka" vrednost={krovni ? `${formatUre(krovni.ure)} h` : "–"} />
        <Povzetek label="rok izdelave" vrednost={krovni?.rok ? formatShort(krovni.rok) : "–"} />
      </div>
      {!krovni && (
        <p className="rounded-lg bg-warn-50 px-3 py-2 text-warn-700">Krovni nalog ni v zadnjem uvozu (morda je že zaključen).</p>
      )}
      {razpored?.od && (
        <p className="text-ink-600">
          Trenutni plan: <strong>{formatShort(razpored.od)}</strong> – <strong>{razpored.do ? formatShort(razpored.do) : "–"}</strong>
          {razpored.nerazporejeno > 0 && (
            <span className="text-nok-600"> · {formatUre(razpored.nerazporejeno)} h brez kapacitete</span>
          )}
        </p>
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
            value={ure}
            inputMode="decimal"
            onChange={(e) => setUre(e.target.value)}
            title="Ure, ki jih ta postavitev porabi"
            className={`${polje} text-right ${ureNum === null || ureNum <= 0 ? "border-nok-500" : ""}`}
          />
        </label>
      </div>
      {krovni && ostane > 0 && (
        <button
          type="button"
          title="Prištej nerazporejene ure tej postavitvi"
          onClick={() => setUre(formatNum(round2((ureNum ?? 0) + ostane)))}
          className="self-start text-xs font-semibold text-fines-500 hover:underline"
        >
          + dodaj nerazporejene ure ({formatUre(ostane)} h)
        </button>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-ink-600">Opomba</span>
        <input value={opomba} onChange={(e) => setOpomba(e.target.value)} title="Opomba k postavitvi" className={polje} />
      </label>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button hint="Odstrani krovni nalog iz plana" variant="danger" icon={Trash2} onClick={onOdstrani} className="mr-auto">
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
              delovno_mesto_id: celicaId,
              datum_zacetka: datum,
              ure: round2(ureNum ?? postavitev.ure),
              opomba: opomba.trim() || null,
            })
          }
        >
          Potrdi
        </Button>
      </div>
      <p className="text-xs text-ink-500">Spremembe se zapišejo v bazo z gumbom Shrani plan.</p>
    </div>
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
