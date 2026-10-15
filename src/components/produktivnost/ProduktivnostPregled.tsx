"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Boxes, CalendarDays, Camera, ChartLine, ChevronDown, ChevronLeft, ChevronRight, Gauge, ListChecks, PiggyBank, Save, Settings, TrendingDown, X } from "lucide-react";
import { formatDayMonth, formatShort, isoWeek, mondayOf, toIso, weekday, type IsoDate } from "@/lib/dates";
import { IZGUBE, izgubaPoKodi } from "@/lib/gembaVodic";
import {
  akcijaIzvedena,
  akcijaOdprta,
  akcijaZamuja,
  ciljiLeta,
  formatEur,
  formatH,
  kpiLeta,
  letoTedna,
  mesecTedna,
  naloziAkcije,
  naloziCilje,
  naloziGembe,
  naloziNastavitve,
  naloziPosnetke,
  naloziStanjePosnetka,
  naloziTrenutneNormative,
  obdobjeTedna,
  prihranekAkcije,
  primerjajNormative,
  shraniCilje,
  shraniDruzine,
  shraniUrnoPostavko,
  tedniLeta,
  ustvariPosnetek,
  zacetekGemb,
  type Akcija,
  type Gemba,
  type KpiPovzetek,
  type LetniCilji,
  type Nastavitve,
  type NormStanje,
  type Posnetek,
} from "@/lib/produktivnost";
import { formatNum, formatVnos, parseNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import { Button, IconButton } from "@/components/ui/Button";
import { FilterPolje, FilterPreklopnik } from "@/components/ui/Filtri";
import { BARVE_SERIJ, GrafLinija, type BarvaSerije } from "@/components/ui/GrafLinija";
import { Modal } from "@/components/ui/Modal";
import { ConfigMissing, ErrorText, Loading, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { Zavihki } from "@/components/ui/Zavihki";
import { AkcijaOkno, AkcijeTabela } from "./Akcije";

const OSNOVA = "/proizvodnja/rutina/produktivnost";
const MESECI = ["Januar", "Februar", "Marec", "April", "Maj", "Junij", "Julij", "Avgust", "September", "Oktober", "November", "December"];

type Podatki = {
  gembe: Gemba[];
  akcije: Akcija[];
  nastavitve: Nastavitve;
  cilji: LetniCilji[];
  posnetki: { p: Posnetek; stanje: NormStanje[] }[];
  zdaj: NormStanje[];
};

async function naloziVse(): Promise<Podatki> {
  const [gembe, akcije, nastavitve, cilji, posnetki, zdaj] = await Promise.all([
    naloziGembe(),
    naloziAkcije(),
    naloziNastavitve(),
    naloziCilje(),
    naloziPosnetke(),
    naloziTrenutneNormative(),
  ]);
  const stanja = await Promise.all(posnetki.map((p) => naloziStanjePosnetka(p.id)));
  return { gembe, akcije, nastavitve, cilji, posnetki: posnetki.map((p, i) => ({ p, stanje: stanja[i] })), zdaj };
}

const fmtPct = (n: number) => `${formatNum(Math.round(n * 10) / 10)} %`;
const fmtFaktor = (n: number) => `${formatNum(Math.round(n * 100) / 100)}×`;
const kSkrajsano = (n: number) => (Math.abs(n) >= 1000 ? `${formatNum(Math.round(n / 100) / 10)}k` : String(Math.round(n)));

export function ProduktivnostPregled({ zacetniMesec }: { zacetniMesec?: string }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <Pregled zacetniMesec={zacetniMesec} />;
}

function Pregled({ zacetniMesec }: { zacetniMesec?: string }) {
  const notify = useToast();
  const [podatki, setPodatki] = useState<Podatki | null>(null);
  const [leto, setLeto] = useState<number | null>(
    zacetniMesec && /^\d{4}-\d{2}$/.test(zacetniMesec) ? Number(zacetniMesec.slice(0, 4)) : null,
  );
  const [okno, setOkno] = useState<"NASTAVITVE" | "DRUZINE" | "POSNETEK" | null>(null);
  const [akcija, setAkcija] = useState<Akcija | null>(null);
  const [filter, setFilter] = useState<"ODPRTE" | "VSE">("ODPRTE");
  const [pogled, setPogled] = useState<"KOLEDAR" | "KPI">("KOLEDAR");

  const nalozi = () =>
    naloziVse()
      .then(setPodatki)
      .catch((e) => notify("error", `Napaka pri nalaganju: ${e.message}`, 10000));

  useEffect(() => {
    let preklic = false;
    naloziVse()
      .then((p) => !preklic && setPodatki(p))
      .catch((e) => notify("error", `Napaka pri nalaganju: ${e.message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [notify]);

  const danes = toIso(new Date());
  const taTeden = mondayOf(danes);
  const prikazanoLeto = leto ?? letoTedna(taTeden);

  const kpi = useMemo(
    () => (podatki ? kpiLeta(prikazanoLeto, podatki.gembe, podatki.akcije, podatki.nastavitve, podatki.cilji, danes) : null),
    [podatki, prikazanoLeto, danes],
  );

  // KPI 4: vsak posnetek in trenutno stanje proti izhodišču (prvi posnetek)
  const normativi = useMemo(() => {
    if (!podatki || !podatki.posnetki.length) return null;
    const [izh, ...ostali] = podatki.posnetki;
    const tocke = [
      { oznaka: formatDayMonth(izh.p.datum), opis: `${izh.p.opis ?? "Posnetek"} · ${formatShort(izh.p.datum)}`, pct: 0 },
      ...ostali.map((x) => ({
        oznaka: formatDayMonth(x.p.datum),
        opis: `${x.p.opis ?? "Posnetek"} · ${formatShort(x.p.datum)}`,
        pct: primerjajNormative(izh.stanje, x.stanje).skupajPct,
      })),
      { oznaka: "Zdaj", opis: "Trenutno aktivni normativi", pct: primerjajNormative(izh.stanje, podatki.zdaj).skupajPct },
    ];
    return { izhodisce: izh, tocke };
  }, [podatki]);

  if (!podatki || !kpi) return <Loading />;

  const { gembe, akcije, nastavitve, cilji } = podatki;
  const c = kpi.cilji;
  const prikazaneAkcije = filter === "ODPRTE" ? akcije.filter(akcijaOdprta) : akcije;
  const odgovorni = [...new Set(akcije.map((a) => a.odgovoren).filter((x): x is string => !!x))].sort();
  const odprtih = akcije.filter(akcijaOdprta).length;
  const zamuja = akcije.filter((a) => akcijaZamuja(a, danes)).length;
  const zadnjiNorm = normativi?.tocke[normativi.tocke.length - 1].pct ?? 0;

  function zamenjajLeto(l: number) {
    setLeto(l);
    window.history.replaceState(null, "", `?mesec=${l}-01`);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold">Produktivnost - tedenski Gemba walk</h2>
          <p className="text-sm text-ink-500">Klik na teden odpre zapisnik gembe. KPI-ji leta so v zavihku KPI.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton hint="Prikaži prejšnje leto" variant="neutral" icon={ChevronLeft} onClick={() => zamenjajLeto(prikazanoLeto - 1)} />
          <span className="min-w-14 text-center text-lg font-bold text-ink-800">{prikazanoLeto}</span>
          <IconButton hint="Prikaži naslednje leto" variant="neutral" icon={ChevronRight} onClick={() => zamenjajLeto(prikazanoLeto + 1)} />
          <Link
            href={`${OSNOVA}/${taTeden}`}
            title="Odpri zapisnik tega tedna"
            className="inline-flex h-10 items-center rounded-lg bg-sync-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sync-600"
          >
            Ta teden
          </Link>
          <Button hint="Letne količine in cilji po družinah" variant="neutral" icon={Boxes} onClick={() => setOkno("DRUZINE")}>
            Družine
          </Button>
          <Button hint="Cilji leta in urna postavka" variant="neutral" icon={Settings} onClick={() => setOkno("NASTAVITVE")}>
            Nastavitve
          </Button>
        </div>
      </div>

      <section className="flex flex-col">
        <Zavihki
          label="Pogled produktivnosti"
          value={pogled}
          onChange={setPogled}
          zavihki={[
            { koda: "KOLEDAR", label: "Koledar", hint: "Koledar gemb in tabla izboljšav", icon: CalendarDays },
            { koda: "KPI", label: "KPI", hint: "KPI-ji leta in statistika", icon: ChartLine },
          ]}
        />

        {pogled === "KOLEDAR" ? (
          <div className="fp-card flex flex-col gap-5 rounded-tl-none p-3 sm:p-4">
            <KoledarTednov key={prikazanoLeto} leto={prikazanoLeto} gembe={gembe} akcije={akcije} taTeden={taTeden} zacetek={zacetekGemb(cilji)} oznaciMesec={zacetniMesec} />

            <div className="flex flex-col gap-3 border-t border-ink-200 pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-ink-900">Tabla izboljšav</h3>
                  <p className="text-sm text-ink-500">Povzetek akcij vseh gemb. Klik na vrstico odpre akcijo; nove akcije dodajaš v zapisniku tedna.</p>
                </div>
                <FilterPreklopnik
                  label="Prikaz"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "ODPRTE", label: "Odprte", hint: "Prikaži samo odprte akcije in akcije v delu", stevilo: odprtih },
                    { value: "VSE", label: "Vse", hint: "Prikaži vse akcije", stevilo: akcije.length },
                  ]}
                />
              </div>
              <AkcijeTabela
                skupine={[{ naslov: "Akcije", opis: "", akcije: [...prikazaneAkcije].reverse() }]}
                danes={danes}
                nastavitve={nastavitve}
                onOdpri={setAkcija}
                prazno={filter === "ODPRTE" ? "Ni odprtih akcij." : "Ni še akcij. Odpri teden v koledarju in zapiši prvo gembo."}
              />
            </div>
          </div>
        ) : (
          <div className="fp-card flex flex-col gap-4 rounded-tl-none p-3 sm:p-4">
            {/* 5 KPI v eni vrsti (monitor) */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <KpiKartica
                st={1}
                barva={BARVE_SERIJ.modra}
                naslov="Izvedene gembe"
                geslo="delež tedenskih gemb"
                vrednost={kpi.doslednostPct !== null ? fmtPct(kpi.doslednostPct) : "-"}
                podvrednost={`${kpi.izvedenih} / ${kpi.doZdaj} tednov`}
                napredek={kpi.doslednostPct !== null && c.cilj_doslednost_pct ? kpi.doslednostPct / c.cilj_doslednost_pct : null}
                spodaj={`Cilj ${fmtPct(c.cilj_doslednost_pct)} · plan ${kpi.tedni.length} gemb${kpi.tedni.length ? ` od T${isoWeek(kpi.tedni[0])}` : ""}`}
              >
                <KpiGraf
                  kpi={kpi}
                  naziv="Delež izvedenih gemb"
                  barva={BARVE_SERIJ.modra}
                  vrednosti={kpi.doslednost}
                  cilj={c.cilj_doslednost_pct}
                  format={fmtPct}
                  formatTocka={(n) => String(Math.round(n))}
                />
              </KpiKartica>

              <KpiKartica
                st={2}
                barva={BARVE_SERIJ.zelena}
                naslov="Prihranek"
                geslo="€/leto izvedenih akcij"
                vrednost={formatEur(kpi.eurLeto)}
                podvrednost={c.cilj_eur_leto ? `${fmtPct((kpi.eurLeto / c.cilj_eur_leto) * 100)} cilja` : ""}
                napredek={c.cilj_eur_leto ? kpi.eurLeto / c.cilj_eur_leto : null}
                spodaj={
                  <>
                    Cilj {formatEur(c.cilj_eur_leto)} · potencial {formatEur(kpi.potencialEur)}
                    {kpi.brezKolicine > 0 && <span className="block font-semibold text-warn-700">{kpi.brezKolicine} akcij brez letne količine</span>}
                  </>
                }
              >
                <KpiGraf kpi={kpi} naziv="Prihranek EUR na leto" barva={BARVE_SERIJ.zelena} vrednosti={kpi.eur} cilj={c.cilj_eur_leto} format={formatEur} formatTocka={kSkrajsano} />
              </KpiKartica>

              <KpiKartica
                st={3}
                barva={BARVE_SERIJ.oranzna}
                naslov="Prihranek dela"
                geslo="h/leto izvedenih akcij"
                vrednost={formatH(kpi.hLeto)}
                podvrednost={c.cilj_h_leto ? `${fmtPct((kpi.hLeto / c.cilj_h_leto) * 100)} cilja` : ""}
                napredek={c.cilj_h_leto ? kpi.hLeto / c.cilj_h_leto : null}
                spodaj={`Cilj ${formatH(c.cilj_h_leto)} · potencial ${formatH(kpi.potencialH)}`}
              >
                <KpiGraf kpi={kpi} naziv="Prihranek ur dela na leto" barva={BARVE_SERIJ.oranzna} vrednosti={kpi.h} cilj={c.cilj_h_leto} format={formatH} formatTocka={kSkrajsano} />
              </KpiKartica>

              <KpiKartica
                st={4}
                barva={BARVE_SERIJ.vijolicna}
                naslov="Normativi"
                geslo="zmanjšanje proti izhodišču"
                vrednost={normativi ? fmtPct(zadnjiNorm) : "-"}
                podvrednost={normativi ? `od ${formatShort(normativi.izhodisce.p.datum)}` : ""}
                napredek={normativi && c.cilj_normativ_pct ? zadnjiNorm / c.cilj_normativ_pct : null}
                spodaj={
                  <span className="flex items-center justify-between gap-2">
                    <span>Cilj -{fmtPct(c.cilj_normativ_pct)}</span>
                    <button
                      type="button"
                      title="Shrani trenutno stanje normativov kot posnetek"
                      onClick={() => setOkno("POSNETEK")}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-ok-500 px-2 text-xs font-semibold text-white hover:bg-ok-600"
                    >
                      <Camera className="h-3.5 w-3.5" aria-hidden /> Posnetek
                    </button>
                  </span>
                }
              >
                {normativi ? (
                  <GrafLinija
                    kompakten
                    visina={VISINA_GRAFA}
                    naziv="Zmanjšanje normativov po posnetkih"
                    xOznake={normativi.tocke.map((t) => t.oznaka)}
                    opisi={normativi.tocke.map((t) => t.opis)}
                    serije={[
                      { naziv: "Zmanjšanje", barva: BARVE_SERIJ.vijolicna, vrednosti: normativi.tocke.map((t) => Math.round(t.pct * 10) / 10) },
                    ]}
                    cilj={c.cilj_normativ_pct}
                    format={fmtPct}
                    formatTocka={(n) => formatNum(Math.round(n * 10) / 10)}
                  />
                ) : (
                  <PrazenGraf>Ni posnetka normativov (migracija 012).</PrazenGraf>
                )}
              </KpiKartica>

              <KpiKartica
                st={5}
                barva={BARVE_SERIJ.rdeca}
                naslov="Faktor investicije"
                geslo="€/leto prihranka na 1 € investicije"
                vrednost={kpi.faktor !== null ? fmtFaktor(kpi.faktor) : "-"}
                podvrednost={`investirano ${formatEur(kpi.investirano)}`}
                napredek={kpi.faktor !== null && c.cilj_faktor_inv ? kpi.faktor / c.cilj_faktor_inv : null}
                spodaj={`Cilj ${fmtFaktor(c.cilj_faktor_inv)} (100 € → ${formatEur(c.cilj_faktor_inv * 100)} / leto)`}
              >
                <KpiGraf
                  kpi={kpi}
                  naziv="Faktor investicije"
                  barva={BARVE_SERIJ.rdeca}
                  vrednosti={kpi.faktorTedni}
                  cilj={c.cilj_faktor_inv}
                  format={fmtFaktor}
                  formatTocka={(n) => formatNum(Math.round(n * 10) / 10)}
                />
              </KpiKartica>
            </div>

            {/* statistika */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kazalnik
                ikona={PiggyBank}
                barva="border-t-sync-500"
                naslov="Potencial odprtih akcij"
                vrednost={`${formatEur(kpi.potencialEur)} / leto`}
                opis={`${formatH(kpi.potencialH)} dela / leto`}
                hint="Ocena prihranka akcij, ki še niso izvedene"
              />
              <Kazalnik
                ikona={ListChecks}
                barva="border-t-fines-500"
                naslov="Akcije"
                vrednost={`${odprtih} odprtih`}
                opis={`${akcije.filter(akcijaIzvedena).length} izvedenih${zamuja ? ` · ${zamuja} zamuja` : ""}`}
                hint="Odprte, izvedene in zamujene akcije"
                opozorilo={zamuja > 0}
              />
              <Kazalnik
                ikona={Gauge}
                barva="border-t-ink-600"
                naslov="Doslednost"
                vrednost={`${kpi.izvedenih} / ${kpi.doZdaj} tednov`}
                opis={`plan leta ${kpi.tedni.length} gemb`}
                hint="Zaključene gembe glede na pretečene tedne"
              />
              <Kazalnik
                ikona={TrendingDown}
                barva="border-t-ok-500"
                naslov="Strošek vseh ukrepov"
                vrednost={formatEur(kpi.strosekEur)}
                opis={kpi.strosekEur && kpi.eurLeto ? `povračilo v ${formatNum(Math.round((kpi.strosekEur / kpi.eurLeto) * 120) / 10)} mes.` : "enkratni stroški akcij"}
                hint="Seštevek enkratnih stroškov vseh (tudi odprtih) akcij"
              />
            </div>

            <PoIzgubah akcije={akcije} nastavitve={nastavitve} />
          </div>
        )}
      </section>

      {akcija && (
        <AkcijaOkno
          akcija={akcija}
          odgovorni={odgovorni}
          nastavitve={nastavitve}
          pridobiGembaId={() => Promise.resolve(akcija.gemba_id)}
          onClose={() => setAkcija(null)}
          onShranjeno={() => {
            setAkcija(null);
            nalozi();
          }}
        />
      )}
      {okno === "NASTAVITVE" && (
        <NastavitveOkno
          urnaPostavka={nastavitve.urnaPostavka}
          cilji={ciljiLeta(cilji, prikazanoLeto)}
          onClose={() => setOkno(null)}
          onShranjeno={() => {
            setOkno(null);
            nalozi();
          }}
        />
      )}
      {okno === "DRUZINE" && (
        <DruzineOkno
          nastavitve={nastavitve}
          izhodisce={normativi?.izhodisce.stanje ?? null}
          zdaj={podatki.zdaj}
          ciljLeta={c.cilj_normativ_pct}
          onClose={() => setOkno(null)}
          onShranjeno={() => {
            setOkno(null);
            nalozi();
          }}
        />
      )}
      {okno === "POSNETEK" && (
        <PosnetekOkno
          identov={podatki.zdaj.length}
          onClose={() => setOkno(null)}
          onShranjeno={() => {
            setOkno(null);
            nalozi();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// KPI KARTICA (kompaktna: 5 v vrsti na monitorju)
// Standard: 4 px črta in svetla glava v barvi KPI, okrogla številka, naslov v barvi, geslo,
// vrednost + pas napredka do cilja, graf, cilj v sivem polju.
// ---------------------------------------------------------------------

const VISINA_GRAFA = 120;

function KpiKartica({
  st,
  barva,
  naslov,
  geslo,
  vrednost,
  podvrednost,
  napredek,
  children,
  spodaj,
}: {
  st: number;
  barva: BarvaSerije;
  naslov: string;
  geslo: string;
  vrednost: string;
  podvrednost: string;
  /** Delež cilja (1 = 100 %). */
  napredek: number | null;
  children: ReactNode;
  spodaj: ReactNode;
}) {
  const b = barva.osnovna;
  const pct = napredek === null ? null : Math.max(0, napredek * 100);
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-ink-200 bg-white shadow-sm" style={{ borderTop: `4px solid ${b}` }}>
      <header className="flex items-center gap-2 rounded-t-lg px-3 py-2" style={{ background: `${b}12` }}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: b }}>
          {st}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold leading-tight" style={{ color: b }}>
            {naslov}
          </h3>
          <p className="truncate text-[11px] leading-tight text-ink-500" title={geslo}>
            {geslo}
          </p>
        </div>
      </header>
      <div className="flex items-baseline justify-between gap-2 px-3 pt-2">
        <span className="truncate text-xl font-bold tabular-nums text-ink-900">{vrednost}</span>
        <span className="shrink-0 text-xs text-ink-600">{podvrednost}</span>
      </div>
      <div className="mx-3 mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" title={pct === null ? "Ni podatkov" : `${fmtPct(pct)} cilja`}>
        {pct !== null && <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: b }} />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {children}
        <div className="mt-auto rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-700">{spodaj}</div>
      </div>
    </article>
  );
}

/** Kompaktni graf KPI po tednih gemb v letu. */
function KpiGraf({
  kpi,
  naziv,
  barva,
  vrednosti,
  cilj,
  format,
  formatTocka,
}: {
  kpi: KpiPovzetek;
  naziv: string;
  barva: BarvaSerije;
  vrednosti: (number | null)[];
  cilj: number;
  format: (n: number) => string;
  formatTocka?: (n: number) => string;
}) {
  if (!kpi.tedni.length) return <PrazenGraf>V tem letu ni planiranih gemb.</PrazenGraf>;
  return (
    <GrafLinija
      kompakten
      visina={VISINA_GRAFA}
      naziv={naziv}
      xOznake={kpi.tedni.map((t) => `T${isoWeek(t)}`)}
      opisi={kpi.tedni.map((t) => obdobjeTedna(t))}
      serije={[{ naziv, barva, vrednosti }]}
      cilj={cilj}
      format={format}
      formatTocka={formatTocka}
    />
  );
}

function PrazenGraf({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-center rounded-xl bg-ink-50 px-3 text-center text-xs text-ink-500" style={{ height: VISINA_GRAFA }}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------
// STATISTIKA: akcije po vrsti izgube
// ---------------------------------------------------------------------

type IzgubaVrstica = { koda: string; naziv: string; barva: string; akcij: number; izvedenih: number; eurLeto: number; hLeto: number };

function PoIzgubah({ akcije, nastavitve }: { akcije: Akcija[]; nastavitve: Nastavitve }) {
  const vrstice: IzgubaVrstica[] = [...IZGUBE, { koda: "", naziv: "Brez izgube", barva: "#9a9aa1" }]
    .map((i) => {
      const sez = akcije.filter((a) => (a.kategorija ?? "") === i.koda && a.status !== "OPUSCENO");
      const izv = sez.filter(akcijaIzvedena).map((a) => prihranekAkcije(a, nastavitve));
      return {
        koda: i.koda,
        naziv: i.naziv,
        barva: i.barva,
        akcij: sez.length,
        izvedenih: izv.length,
        eurLeto: izv.reduce((s, p) => s + (p.eurLeto ?? 0), 0),
        hLeto: izv.reduce((s, p) => s + (p.hLeto ?? 0), 0),
      };
    })
    .filter((v) => v.akcij > 0);
  const sort = useRazvrscanje({
    naziv: (v: IzgubaVrstica) => v.naziv,
    akcij: (v: IzgubaVrstica) => v.akcij,
    izvedenih: (v: IzgubaVrstica) => v.izvedenih,
    eur: (v: IzgubaVrstica) => v.eurLeto,
    h: (v: IzgubaVrstica) => v.hLeto,
  });
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-ink-900">Akcije po vrsti izgube</h3>
      <TabelaOkvir>
        <table className="w-full text-sm">
          <thead className="fp-thead">
            <tr>
              <SortTh sort={sort} kljuc="naziv" className="pl-3">Izguba</SortTh>
              <SortTh sort={sort} kljuc="akcij" desno>Akcij</SortTh>
              <SortTh sort={sort} kljuc="izvedenih" desno>Izvedenih</SortTh>
              <SortTh sort={sort} kljuc="eur" desno hint="Letni prihranek izvedenih akcij">€/leto</SortTh>
              <SortTh sort={sort} kljuc="h" desno className="pr-3" hint="Letni prihranek ur izvedenih akcij">h/leto</SortTh>
            </tr>
          </thead>
          <tbody>
            {vrstice.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-500">
                  Ni še akcij.
                </td>
              </tr>
            )}
            {sort.razvrsti(vrstice).map((v) => (
              <tr key={v.koda} className="border-b border-ink-100 hover:bg-ink-50">
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.barva }} />
                    {v.naziv}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{v.akcij}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{v.izvedenih}</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatEur(v.eurLeto)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatH(v.hLeto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaOkvir>
    </div>
  );
}

function Kazalnik({
  ikona: Ikona,
  barva,
  naslov,
  vrednost,
  opis,
  hint,
  opozorilo,
}: {
  ikona: typeof PiggyBank;
  barva: string;
  naslov: string;
  vrednost: string;
  opis: string;
  hint: string;
  opozorilo?: boolean;
}) {
  return (
    <div title={hint} className={`fp-card flex flex-col gap-1 border-t-4 p-3 sm:p-4 ${barva}`}>
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
        <Ikona className="h-4 w-4" aria-hidden />
        {naslov}
      </span>
      <span className="text-lg font-bold tabular-nums text-ink-900 sm:text-xl">{vrednost}</span>
      <span className={`text-xs ${opozorilo ? "font-semibold text-fines-600" : "text-ink-500"}`}>{opis}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// KOLEDAR TEDNOV
// ---------------------------------------------------------------------

const STIL = {
  ZAKLJUCEN: { cls: "bg-ok-500 text-white border-ok-500", label: "Gemba izvedena, zapisnik zaključen" },
  V_DELU: { cls: "bg-warn-50 text-warn-700 border-warn-400", label: "Zapisnik začet, ni zaključen" },
  MANJKA: { cls: "bg-nok-50 text-nok-600 border-nok-500", label: "Gemba ni bila izvedena" },
  PRIHODNJE: { cls: "bg-white text-ink-500 border-ink-200", label: "Prihodnji teden" },
  PREJ: { cls: "bg-ink-100 text-ink-400 border-ink-200", label: "Pred začetkom gemb" },
};
const TA_TEDEN_CLS = "bg-sync-500 text-white border-sync-600";

function KoledarTednov({
  leto,
  gembe,
  akcije,
  taTeden,
  zacetek,
  oznaciMesec,
}: {
  leto: number;
  gembe: Gemba[];
  akcije: Akcija[];
  taTeden: IsoDate;
  /** Prvi teden gemb; tedni pred njim ne štejejo. */
  zacetek: IsoDate | null;
  oznaciMesec?: string;
}) {
  const tedni = tedniLeta(leto);
  const poTednu = new Map(gembe.map((g) => [g.teden, g]));
  const meseci = Array.from({ length: 12 }, (_, m) => ({ m, tedni: tedni.filter((t) => mesecTedna(t) === m) }));
  // Telefon: razprt samo trenutni mesec (ali mesec iz povezave), ostali se razprejo s klikom. Od sm naprej so vsi razprti.
  const [razprti, setRazprti] = useState<Set<number>>(() => {
    if (oznaciMesec?.startsWith(`${leto}-`) && oznaciMesec !== `${leto}-01`) return new Set([Number(oznaciMesec.slice(5, 7)) - 1]);
    return new Set([letoTedna(taTeden) === leto ? mesecTedna(taTeden) : 0]);
  });
  const preklopi = (m: number) =>
    setRazprti((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });

  function status(t: IsoDate): keyof typeof STIL {
    const g = poTednu.get(t);
    if (g) return g.status === "ZAKLJUCEN" ? "ZAKLJUCEN" : "V_DELU";
    if (t >= taTeden) return "PRIHODNJE";
    if (zacetek && t < zacetek) return "PREJ";
    return "MANJKA";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {meseci.map(({ m, tedni: tm }) => {
          const odprt = razprti.has(m);
          return (
            <div
              key={m}
              className={`rounded-lg p-1.5 ${oznaciMesec === `${leto}-${String(m + 1).padStart(2, "0")}` ? "bg-fines-50 ring-1 ring-fines-200" : ""}`}
            >
              <div className="mb-1 hidden text-xs font-bold uppercase tracking-wide text-ink-500 sm:block">{MESECI[m]}</div>
              {/* Telefon: glava meseca je gumb za razpiranje; zložen mesec pokaže stanje tednov kot pike. */}
              <button
                type="button"
                onClick={() => preklopi(m)}
                aria-expanded={odprt}
                title={`${odprt ? "Skrij" : "Prikaži"} tedne meseca ${MESECI[m].toLowerCase()}`}
                className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left sm:hidden ${
                  odprt ? "mb-1.5 border-fines-200 bg-fines-50" : "border-ink-200 bg-white hover:bg-ink-100"
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wide text-ink-700">{MESECI[m]}</span>
                {!odprt && (
                  <span className="flex gap-1" aria-hidden>
                    {tm.map((t) => (
                      <span key={t} className={`h-3 w-3 rounded-full border-2 ${t === taTeden ? TA_TEDEN_CLS : STIL[status(t)].cls}`} />
                    ))}
                  </span>
                )}
                <ChevronDown size={16} className={`ml-auto text-ink-500 transition-transform ${odprt ? "rotate-180" : ""}`} aria-hidden />
              </button>
              <div className={`grid-cols-5 gap-1.5 sm:grid ${odprt ? "grid" : "hidden"}`}>
                {tm.map((t) => {
                  const s = status(t);
                  const g = poTednu.get(t);
                  const nAkcij = g ? akcije.filter((a) => a.gemba_id === g.id).length : 0;
                  const jeTa = t === taTeden;
                  const tema = izgubaPoKodi(g?.tema);
                  return (
                    <Link
                      key={t}
                      href={`${OSNOVA}/${t}`}
                      title={`Odpri gembo ${isoWeek(t)}. tedna (${obdobjeTedna(t)})${jeTa ? " - ta teden" : ""} - ${STIL[s].label}${
                        tema ? ` · tema: ${tema.naziv}` : ""
                      }${nAkcij ? ` · ${nAkcij} akcij` : ""}${g?.datum ? ` · izvedena ${formatShort(g.datum)}` : ""}`}
                      className={`relative flex h-14 flex-col items-center justify-center rounded-lg border-2 font-bold transition-transform hover:scale-105 hover:shadow-md ${
                        jeTa ? TA_TEDEN_CLS : STIL[s].cls
                      }`}
                    >
                      <span className="text-sm leading-tight">T{isoWeek(t)}</span>
                      <span className="text-[10px] font-semibold leading-tight opacity-90">{formatDayMonth(t)}</span>
                      {tema && (
                        <span className="absolute left-1 top-1 h-2 w-2 rounded-full border border-white" style={{ background: tema.barva }} aria-hidden />
                      )}
                      {nAkcij > 0 && (
                        <span className="absolute right-0.5 top-0.5 rounded-full bg-ink-800 px-1 text-[9px] leading-tight text-white" aria-hidden>
                          {nAkcij}
                        </span>
                      )}
                      {jeTa && g && (
                        <span
                          className={`absolute bottom-1 right-1 h-2 w-2 rounded-full border border-white ${g.status === "ZAKLJUCEN" ? "bg-ok-500" : "bg-warn-400"}`}
                          aria-hidden
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded border-2 ${TA_TEDEN_CLS}`} />
          Ta teden
        </span>
        {(["ZAKLJUCEN", "V_DELU", "MANJKA", "PRIHODNJE", "PREJ"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded border-2 ${STIL[s].cls}`} />
            {STIL[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-ink-800 px-1 text-[9px] text-white">2</span>
          število akcij
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        <span className="font-semibold text-ink-700">Tema tedna (krogec levo zgoraj):</span>
        {IZGUBE.map((i) => (
          <span key={i.koda} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: i.barva }} />
            {i.naziv}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// NASTAVITVE: urna postavka + cilji leta
// ---------------------------------------------------------------------

const POLJE =
  "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm tabular-nums focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

function NastavitveOkno({
  urnaPostavka,
  cilji,
  onClose,
  onShranjeno,
}: {
  urnaPostavka: number;
  cilji: LetniCilji;
  onClose: () => void;
  onShranjeno: () => void;
}) {
  const notify = useToast();
  const [f, setF] = useState({
    urna: formatVnos(urnaPostavka),
    zacetni: cilji.zacetni_teden ?? "",
    doslednost: formatVnos(cilji.cilj_doslednost_pct),
    eur: formatVnos(cilji.cilj_eur_leto),
    h: formatVnos(cilji.cilj_h_leto),
    normativ: formatVnos(cilji.cilj_normativ_pct),
    faktor: formatVnos(cilji.cilj_faktor_inv),
  });
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);
  const stevila: { k: "urna" | "doslednost" | "eur" | "h" | "normativ" | "faktor"; label: string; hint: string }[] = [
    { k: "doslednost", label: "KPI 1: cilj izvedenih gemb (%)", hint: "Delež izvedenih tedenskih gemb" },
    { k: "eur", label: "KPI 2: cilj prihranka (EUR/leto)", hint: "Letni učinek izvedenih akcij v EUR" },
    { k: "h", label: "KPI 3: cilj prihranka dela (h/leto)", hint: "Letni prihranek ur dela" },
    { k: "normativ", label: "KPI 4: cilj zmanjšanja normativov (%)", hint: "Skupni cilj; po družinah v oknu Družine" },
    { k: "faktor", label: "KPI 5: cilj faktorja investicije (€/leto na 1 €)", hint: "1,5 = 150 € letnega prihranka na 100 € investicije" },
    { k: "urna", label: "Strošek ure dela (EUR/h) - za vsa leta", hint: "Čas × urna postavka = prihranek v EUR" },
  ];

  async function shrani() {
    const v = Object.fromEntries(stevila.map((s) => [s.k, parseNum(f[s.k])])) as Record<(typeof stevila)[number]["k"], number | null>;
    if (Object.values(v).some((x) => x === null || x < 0)) return setNapaka("Vse vrednosti morajo biti pozitivna števila.");
    if (f.zacetni && weekday(f.zacetni) !== 1) return setNapaka("Začetni teden mora biti ponedeljek.");
    setShranjujem(true);
    try {
      await Promise.all([
        shraniUrnoPostavko(v.urna!),
        shraniCilje({
          leto: cilji.leto,
          zacetni_teden: f.zacetni || null,
          cilj_doslednost_pct: v.doslednost!,
          cilj_eur_leto: v.eur!,
          cilj_h_leto: v.h!,
          cilj_normativ_pct: v.normativ!,
          cilj_faktor_inv: v.faktor!,
        }),
      ]);
      notify("success", "Nastavitve so shranjene.");
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  return (
    <Modal open title={`Cilji ${cilji.leto} in nastavitve`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <FilterPolje label="Začetni teden gemb v letu (ponedeljek; prazno = od začetka leta)">
          <input
            type="date"
            value={f.zacetni}
            onChange={(e) => setF({ ...f, zacetni: e.target.value })}
            title="Tedni pred tem ne štejejo v KPI 1"
            className={POLJE}
          />
        </FilterPolje>
        {stevila.map((p) => (
          <FilterPolje key={p.k} label={p.label}>
            <input value={f[p.k]} onChange={(e) => setF({ ...f, [p.k]: e.target.value })} inputMode="decimal" title={p.hint} className={`${POLJE} text-right`} />
          </FilterPolje>
        ))}
        <p className="text-xs text-ink-500">
          Prihranek je ocena letnega učinka izvedenih akcij (prihranek na kos × letna količina družine). Finančni učinek nastane, ko se izognemo
          naduram ali z isto ekipo naredimo več.
        </p>
        {napaka && <ErrorText>{napaka}</ErrorText>}
        <div className="flex justify-end gap-2 border-t border-ink-200 pt-3">
          <Button hint="Zapri okno brez shranjevanja" variant="neutral" icon={X} onClick={onClose}>
            Prekliči
          </Button>
          <Button hint="Shrani cilje in nastavitve" variant="success" icon={Save} disabled={shranjujem} onClick={shrani}>
            Shrani
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// DRUŽINE: letna količina, cilj normativa, stanje normativov
// ---------------------------------------------------------------------

type DruzinaVrstica = {
  druzina_id: number;
  koda: string;
  identov: number;
  izhodisce: number | null;
  zdaj: number | null;
  zmanjsanjePct: number | null;
  /** Prihranek ur na leto zaradi nižjega normativa (razlika × letna količina). */
  hLeto: number | null;
};

function DruzineOkno({
  nastavitve,
  izhodisce,
  zdaj,
  ciljLeta,
  onClose,
  onShranjeno,
}: {
  nastavitve: Nastavitve;
  izhodisce: NormStanje[] | null;
  zdaj: NormStanje[];
  ciljLeta: number;
  onClose: () => void;
  onShranjeno: () => void;
}) {
  const notify = useToast();
  const [vnos, setVnos] = useState<Record<number, { kol: string; cilj: string }>>(() =>
    Object.fromEntries(
      nastavitve.druzine.map((d) => [
        d.druzina_id,
        { kol: d.kolicina_leto !== null ? formatVnos(d.kolicina_leto) : "", cilj: d.cilj_normativ_pct !== null ? formatVnos(d.cilj_normativ_pct) : "" },
      ]),
    ),
  );
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);

  const vrstice = useMemo<DruzinaVrstica[]>(() => {
    const prim = izhodisce ? primerjajNormative(izhodisce, zdaj).druzine : [];
    return nastavitve.druzine.map((d) => {
      const p = prim.find((x) => x.druzina_id === d.druzina_id);
      const zd = zdaj.filter((x) => x.druzina_id === d.druzina_id);
      const kol = d.kolicina_leto;
      return {
        druzina_id: d.druzina_id,
        koda: d.koda,
        identov: zd.length,
        izhodisce: p ? p.povprecjeIzhodisce : null,
        zdaj: zd.length ? zd.reduce((s, x) => s + x.normativ_skupni, 0) / zd.length : null,
        zmanjsanjePct: p ? p.zmanjsanjePct : null,
        hLeto: p && kol ? (p.povprecjeIzhodisce - p.povprecjeZdaj) * kol : null,
      };
    });
  }, [nastavitve, izhodisce, zdaj]);

  const sort = useRazvrscanje({
    koda: (r: DruzinaVrstica) => r.koda,
    identov: (r: DruzinaVrstica) => r.identov,
    izhodisce: (r: DruzinaVrstica) => r.izhodisce,
    zdaj: (r: DruzinaVrstica) => r.zdaj,
    zmanjsanje: (r: DruzinaVrstica) => r.zmanjsanjePct,
    hLeto: (r: DruzinaVrstica) => r.hLeto,
    kol: (r: DruzinaVrstica) => parseNum(vnos[r.druzina_id]?.kol),
  });

  async function shrani() {
    const spremenjene = [];
    for (const d of nastavitve.druzine) {
      const v = vnos[d.druzina_id];
      const kol = parseNum(v.kol);
      const cilj = parseNum(v.cilj);
      if ((v.kol && (kol === null || kol < 0)) || (v.cilj && (cilj === null || cilj < 0))) {
        return setNapaka(`Družina ${d.koda}: količina in cilj morata biti pozitivni števili.`);
      }
      if (kol !== d.kolicina_leto || cilj !== d.cilj_normativ_pct) {
        spremenjene.push({ druzina_id: d.druzina_id, kolicina_leto: kol, cilj_normativ_pct: cilj });
      }
    }
    setShranjujem(true);
    try {
      await shraniDruzine(spremenjene);
      notify("success", `Shranjeno: ${spremenjene.length} družin.`);
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  const vnosPolje = "h-9 w-24 rounded-lg border border-ink-200 bg-white px-2 text-right text-sm tabular-nums focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";
  const st = (n: number | null, d = 2) => (n === null ? "-" : formatNum(Math.round(n * 10 ** d) / 10 ** d));

  return (
    <Modal open title="Družine: letna količina in normativi" onClose={onClose} sirina="max-w-5xl">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-600">
          <strong>Letna količina</strong> (ocena kosov na leto) pretvori prihranek na kos v €/leto in h/leto (KPI 2, 3).{" "}
          <strong>Normativ</strong> je povprečje skupnega normativa (h/kos) identov družine; zmanjšanje se računa ident z identom proti izhodiščnemu
          posnetku (KPI 4). Prazen cilj = skupni cilj leta ({fmtPct(ciljLeta)}).
        </p>
        {!izhodisce && <WarningText>Ni izhodiščnega posnetka normativov - zaženi migracijo 012.</WarningText>}
        <TabelaOkvir>
          <table className="w-full text-sm">
            <thead className="fp-thead">
              <tr>
                <SortTh sort={sort} kljuc="koda" className="pl-3">Družina</SortTh>
                <SortTh sort={sort} kljuc="identov" desno>Identov</SortTh>
                <SortTh sort={sort} kljuc="izhodisce" desno hint="Povprečni normativ ob izhodišču (h/kos)">Izhodišče h</SortTh>
                <SortTh sort={sort} kljuc="zdaj" desno hint="Povprečni trenutni normativ (h/kos)">Zdaj h</SortTh>
                <SortTh sort={sort} kljuc="zmanjsanje" desno>Zmanjšanje</SortTh>
                <SortTh sort={sort} kljuc="hLeto" desno hint="Razlika normativa × letna količina">h/leto</SortTh>
                <SortTh sort={sort} kljuc="kol" desno>Količina / leto</SortTh>
                <th className="px-2 py-2 text-right">Cilj %</th>
              </tr>
            </thead>
            <tbody>
              {sort.razvrsti(vrstice).map((r) => {
                const cilj = parseNum(vnos[r.druzina_id]?.cilj) ?? ciljLeta;
                return (
                  <tr key={r.druzina_id} className="border-b border-ink-100 hover:bg-ink-50">
                    <td className="px-3 py-1.5 font-mono font-semibold text-ink-900">{r.koda}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ink-600">{r.identov}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{st(r.izhodisce)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{st(r.zdaj)}</td>
                    <td
                      className={`px-2 py-1.5 text-right font-semibold tabular-nums ${
                        r.zmanjsanjePct === null ? "text-ink-400" : r.zmanjsanjePct >= cilj && cilj > 0 ? "text-ok-600" : r.zmanjsanjePct < 0 ? "text-nok-600" : "text-ink-800"
                      }`}
                    >
                      {r.zmanjsanjePct === null ? "-" : fmtPct(r.zmanjsanjePct)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.hLeto === null ? "-" : formatH(r.hLeto)}</td>
                    <td className="px-2 py-1">
                      <input
                        value={vnos[r.druzina_id]?.kol ?? ""}
                        onChange={(e) => setVnos({ ...vnos, [r.druzina_id]: { ...vnos[r.druzina_id], kol: e.target.value } })}
                        inputMode="numeric"
                        title={`Letna količina kosov družine ${r.koda}`}
                        className={`${vnosPolje} ml-auto block`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={vnos[r.druzina_id]?.cilj ?? ""}
                        onChange={(e) => setVnos({ ...vnos, [r.druzina_id]: { ...vnos[r.druzina_id], cilj: e.target.value } })}
                        inputMode="decimal"
                        placeholder={formatNum(ciljLeta)}
                        title={`Cilj zmanjšanja normativa za ${r.koda} (%)`}
                        className={`${vnosPolje} ml-auto block w-20`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabelaOkvir>
        {napaka && <ErrorText>{napaka}</ErrorText>}
        <div className="flex justify-end gap-2 border-t border-ink-200 pt-3">
          <Button hint="Zapri okno brez shranjevanja" variant="neutral" icon={X} onClick={onClose}>
            Prekliči
          </Button>
          <Button hint="Shrani letne količine in cilje družin" variant="success" icon={Save} disabled={shranjujem} onClick={shrani}>
            Shrani
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// NOV POSNETEK NORMATIVOV
// ---------------------------------------------------------------------

function PosnetekOkno({ identov, onClose, onShranjeno }: { identov: number; onClose: () => void; onShranjeno: () => void }) {
  const notify = useToast();
  const [opis, setOpis] = useState("");
  const [shranjujem, setShranjujem] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);

  async function shrani() {
    setShranjujem(true);
    try {
      await ustvariPosnetek(opis);
      notify("success", "Posnetek normativov je shranjen.");
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  return (
    <Modal open title="Nov posnetek normativov" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-600">
          Shrani trenutno stanje normativov ({identov} identov) z današnjim datumom ({formatShort(toIso(new Date()))}). Posnetek se pokaže kot
          nova točka na grafu KPI 4; izhodišče ostane prvi posnetek.
        </p>
        <FilterPolje label="Opis (neobvezno)">
          <input
            value={opis}
            onChange={(e) => setOpis(e.target.value)}
            placeholder="npr. Po prenovi normativov montaže"
            title="Kratek opis posnetka"
            className={POLJE}
          />
        </FilterPolje>
        {napaka && <ErrorText>{napaka}</ErrorText>}
        <div className="flex justify-end gap-2 border-t border-ink-200 pt-3">
          <Button hint="Zapri okno brez shranjevanja" variant="neutral" icon={X} onClick={onClose}>
            Prekliči
          </Button>
          <Button hint="Shrani posnetek trenutnih normativov" variant="success" icon={Camera} disabled={shranjujem} onClick={shrani}>
            {shranjujem ? "Shranjujem ..." : "Shrani posnetek"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

