"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  BellRing,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Columns3,
  ListChecks,
  Loader2,
  Maximize2,
  RefreshCw,
  Send,
  Truck,
  X,
} from "lucide-react";
import { formatShort, type IsoDate } from "@/lib/dates";
import {
  OPIS_FAZE,
  OPIS_STANJA,
  OPIS_VRSTICE,
  PRIVZETE_NASTAVITVE,
  RDECA_OD,
  ROK_ZAZNAVE,
  RUMENA_OD,
  izracunajDoizdajo,
  naloziCakanje,
  naloziIzdaje,
  naloziPrevzeme,
  poKrovnih,
  privzeteIzlocene,
  shraniCakanje,
  stanjeVrstice,
  zabeleziObvestilo,
  zakljuciCakanje,
  type CakanjeZapis,
  type IzdajaVrstica,
  type Faza,
  type Kartica,
  type NalogPregled,
  type Nastavitve,
  type Prevzem,
  type StanjeNaloga,
  type StanjeVrstice,
  type Stolpec,
} from "@/lib/doizdaja";
import { ujemaIskanje } from "@/lib/iskanje";
import { posljiVTeams, prijavljenEmail, sporociloDoizdaje } from "@/lib/teams";
import { formatNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import { naloziZadnjiUvoz, type Nalog } from "@/lib/zasedenost";
import { Button } from "@/components/ui/Button";
import { FilterKartica, type KarticaBarva } from "@/components/ui/FilterKartica";
import {
  FilterCheckbox,
  FilterIskanje,
  FilterIzbira,
  FilterPolje,
  FilterPreklopnik,
  FilterVrstica,
} from "@/components/ui/Filtri";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { PodatkiVir } from "@/components/PodatkiVir";
import { usePoSyncu, useSync } from "@/components/SyncProvider";
import { Zavihki } from "@/components/ui/Zavihki";

type Pogled = "material" | "po_nalogih" | "nalogi";
type Razvrsti = "starost" | "rok";
type StanjeFilter = "vsi" | StanjeNaloga;

const NASTAVITVE_KLJUC = "doizdaja-nastavitve";
/** Samodejno osveževanje podatkov iz baze (zaslon v skladišču). */
const OSVEZI_MS = 2 * 60 * 1000;

const FAZE: Faza[] = ["nov", "tretji", "zamuja", "ni_manjkalo"];
const PRIVZETE_FAZE: Faza[] = ["nov", "tretji", "zamuja"];

const BARVA_FAZE: Record<Faza, KarticaBarva & { znacka: string; trakStolpca: string }> = {
  nov: {
    trak: "bg-ok-500",
    aktivna: "border-ok-500 bg-ok-50",
    ikona: "text-ok-500",
    znacka: "bg-ok-500 text-white",
    trakStolpca: "bg-ok-500",
  },
  tretji: {
    trak: "bg-warn-500",
    aktivna: "border-warn-500 bg-warn-50",
    ikona: "text-warn-500",
    znacka: "bg-warn-400 text-ink-900",
    trakStolpca: "bg-warn-500",
  },
  zamuja: {
    trak: "bg-nok-500",
    aktivna: "border-nok-500 bg-nok-50",
    ikona: "text-nok-500",
    znacka: "bg-nok-500 text-white",
    trakStolpca: "bg-nok-500",
  },
  ni_manjkalo: {
    trak: "bg-ink-400",
    aktivna: "border-ink-500 bg-ink-100",
    ikona: "text-ink-600",
    znacka: "bg-ink-200 text-ink-700",
    trakStolpca: "bg-ink-400",
  },
};

const HINT_FAZE: Record<Faza, string> = {
  nov: `Material prevzet pred 1-${RUMENA_OD - 1} delovnima dnevoma`,
  tretji: `${RUMENA_OD}. delovni dan od prevzema - izdaj danes`,
  zamuja: `Od prevzema ${RDECA_OD} ali več delovnih dni, ni izdano`,
  ni_manjkalo: "Pred prevzemom je bilo dovolj zaloge",
};

/** "5. dan" ali "–". */
const danTxt = (starost: number | null) => (starost === null ? "–" : `${starost}. dan`);

const BARVA_STANJA: Record<StanjeNaloga, string> = {
  upostevan: "bg-fines-500 text-white",
  pod_pragom: "bg-sync-500 text-white",
  ni_zacet: "bg-ink-200 text-ink-700",
  izdan: "bg-ok-500 text-white",
};

/** Prikaz roka / datuma ("28. 10. 2026" ali "–"). */
const datumTxt = (iso: IsoDate | null) => (iso ? formatShort(iso) : "–");
/** "2026-10-28T14:33:09" -> "28. 10. 14:33". */
function casTxt(cas: string | null) {
  if (!cas) return "–";
  const [d, t] = cas.split("T");
  const [, m, dan] = d.split("-");
  return `${Number(dan)}. ${Number(m)}.${t ? ` ${t.slice(0, 5)}` : ""}`;
}
const prevzemCas = (p: Prevzem) => p.cas ?? p.datum;
/** Čas obvestila iz baze (UTC) -> lokalno "29. 10. 10:15". */
const casObvestila = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}`;
};

/** Napaka, ko tabele v bazi še niso ustvarjene. */
const niTabel = (m: string) => /fp_doi_|does not exist|schema cache/i.test(m);

async function pridobiPodatke() {
  const izd = await naloziIzdaje().then(
    (x) => ({ ...x, niTabel: false }),
    (e: Error) => {
      if (!niTabel(e.message)) throw e;
      return { uvoz: null, vrstice: [] as IzdajaVrstica[], niTabel: true };
    },
  );
  const prev = await naloziPrevzeme().then(
    (x) => ({ ...x, niTabel: false }),
    (e: Error) => {
      if (!niTabel(e.message)) throw e;
      return { uvoz: null, prevzemi: [] as Prevzem[], niTabel: true };
    },
  );
  // Čakajoče izdaje (SQL 024) - brez tabele so vidne samo kartice, zaznane iz zadnjih prevzemov
  const cak = await naloziCakanje().then(
    (zapisi) => ({ zapisi, niTabele: false }),
    (e: Error) => {
      if (!/fp_doi_cakanje|does not exist|schema cache/i.test(e.message)) throw e;
      return { zapisi: [] as CakanjeZapis[], niTabele: true };
    },
  );
  // Krovni nalogi iz uvoza delovnih nalogov (Zasedenost) - brez njega so kartice po nalogih
  const nal = await naloziZadnjiUvoz().catch(() => ({
    uvoz: null,
    nalogi: [] as Nalog[],
  }));
  return { izd, prev, nal, cak };
}
type Podatki = Awaited<ReturnType<typeof pridobiPodatke>>;

type Shranjeno = Nastavitve & {
  faze: Faza[];
  razvrsti: Razvrsti;
  pogled: Pogled;
  grupiraj: boolean;
  /** Katere vrstice materiala pokaže razprt nalog v zavihku Aktivni nalogi. */
  prikazVrstic: StanjeVrstice[];
};
const PRIVZETO_SHRANJENO: Shranjeno = {
  ...PRIVZETE_NASTAVITVE,
  faze: PRIVZETE_FAZE,
  razvrsti: "starost",
  pogled: "material",
  grupiraj: true,
  prikazVrstic: ["neizdano", "delno"],
};

function preberiShranjeno(): Shranjeno {
  try {
    const s = JSON.parse(localStorage.getItem(NASTAVITVE_KLJUC) ?? "null") as Partial<Shranjeno> | null;
    const n = { ...PRIVZETO_SHRANJENO, ...(s ?? {}) };
    // starejša verzija je imela razvrščanje "prevzem"
    return { ...n, razvrsti: n.razvrsti === "rok" ? "rok" : "starost", faze: Array.isArray(n.faze) ? n.faze : PRIVZETE_FAZE };
  } catch {
    return PRIVZETO_SHRANJENO;
  }
}

export function Doizdaja() {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <DoizdajaInner />;
}

function DoizdajaInner() {
  const notify = useToast();
  const [podatki, setPodatki] = useState<Podatki | null>(null);
  const [osvezeno, setOsvezeno] = useState<Date | null>(null);
  // Stran pokaže Loading, dokler podatki niso naloženi - branje localStorage ob inicializaciji je varno
  const [nast, setNast] = useState<Shranjeno>(() => preberiShranjeno());
  const [iskanje, setIskanje] = useState("");
  const [stanjeFilter, setStanjeFilter] = useState<StanjeFilter>("vsi");
  // Obvestilo v Teams: izbrani materiali (ident) in okno s predogledom
  const [zaTeams, setZaTeams] = useState<Set<string>>(new Set());
  const [teamsOdprt, setTeamsOdprt] = useState(false);
  const [posiljam, setPosiljam] = useState(false);
  // Zaslon v skladišču: povezava s ?zaslon=1 odpre celozaslonski prikaz (stran najprej pokaže Loading - branje URL je varno)
  const [zaslon, setZaslon] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("zaslon") === "1",
  );

  const sync = useSync();

  const nalozi = useCallback(async () => {
    const p = await pridobiPodatke();
    setPodatki(p);
    setOsvezeno(new Date());
  }, []);

  useEffect(() => {
    let preklic = false;
    pridobiPodatke()
      .then((p) => {
        if (preklic) return;
        setPodatki(p);
        setOsvezeno(new Date());
      })
      .catch((e) => notify("error", `Napaka pri nalaganju podatkov: ${(e as Error).message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [notify]);

  // Samodejno osveževanje (uvoz na drugem računalniku se pokaže tudi na zaslonu)
  useEffect(() => {
    const t = setInterval(() => {
      nalozi().catch(() => {
        // naslednji poskus ob naslednjem intervalu
      });
    }, OSVEZI_MS);
    return () => clearInterval(t);
  }, [nalozi]);

  // Po syncu podatkov iz ERP (glava ali stran Podatki) takoj znova naloži
  usePoSyncu(() => {
    nalozi().catch((e) => notify("error", `Napaka pri nalaganju podatkov: ${(e as Error).message}`, 10000));
  });

  function spremeni(n: Partial<Shranjeno>) {
    const nove = { ...nast, ...n };
    setNast(nove);
    try {
      localStorage.setItem(NASTAVITVE_KLJUC, JSON.stringify(nove));
    } catch {
      // brez shrambe velja do osvežitve
    }
  }

  const krovniDn = useMemo(() => new Map((podatki?.nal.nalogi ?? []).map((n) => [n.st_naloga, n.krovni_dn])), [podatki]);

  // Izvoz izdaj, starejši od izvoza prevzemov, še ne vsebuje teh prevzemov v zalogi - takrat se nove kartice ne zaznavajo.
  // Če sta obe datoteki sinhronizirani iz mape, se primerja čas izvoza (datoteke), sicer čas uvoza.
  const izdF = sync.datoteke.find((d) => d.kljuc === "izdaje");
  const prevF = sync.datoteke.find((d) => d.kljuc === "prevzemi");
  const izIzvoza = izdF?.stanje === "sinhronizirano" && prevF?.stanje === "sinhronizirano";
  const casIzdaj = izIzvoza ? izdF.naServerju : podatki?.izd.uvoz ? Date.parse(podatki.izd.uvoz.created_at) : null;
  const casPrevzemov = izIzvoza ? prevF.naServerju : podatki?.prev.uvoz ? Date.parse(podatki.prev.uvoz.created_at) : null;
  const izdajeStarejse = casIzdaj !== null && casPrevzemov !== null && casPrevzemov - casIzdaj > 30 * 60 * 1000;

  const rezultat = useMemo(
    () =>
      izracunajDoizdajo(
        podatki?.izd.vrstice ?? [],
        podatki?.prev.prevzemi ?? [],
        krovniDn,
        { prag: nast.prag, izlocene: nast.izlocene },
        podatki?.cak.zapisi ?? [],
        { zaznavaj: !izdajeStarejse },
      ),
    [podatki, krovniDn, nast.prag, nast.izlocene, izdajeStarejse],
  );

  // Nove čakajoče izdaje zapiši v bazo, izdane zaključi (vsak odprt zaslon to naredi ob osvežitvi)
  const pisem = useRef(false);
  // Isti zapis se ne ponavlja (npr. če baza vrne uspeh, a se zapis ne pokaže) - sicer bi se pisanje vrtelo v krogu
  const zadnjiZapis = useRef("");
  useEffect(() => {
    if (!podatki || podatki.cak.niTabele || pisem.current) return;
    if (rezultat.nove.length === 0 && rezultat.zakljuci.length === 0) return;
    const zapis = JSON.stringify([rezultat.nove.map((c) => `${c.ident}|${c.st_naloga}`), rezultat.zakljuci]);
    if (zapis === zadnjiZapis.current) return;
    zadnjiZapis.current = zapis;
    pisem.current = true;
    (async () => {
      if (rezultat.nove.length) await shraniCakanje(rezultat.nove);
      if (rezultat.zakljuci.length) await zakljuciCakanje(rezultat.zakljuci);
      const zapisi = await naloziCakanje();
      setPodatki((p) => (p ? { ...p, cak: { zapisi, niTabele: false } } : p));
    })()
      .catch((e) => notify("error", `Čakajoče izdaje niso shranjene: ${(e as Error).message}`, 10000))
      .finally(() => {
        pisem.current = false;
      });
  }, [podatki, rezultat, notify]);

  const vrsticePoNalogu = useMemo(() => {
    const m = new Map<string, IzdajaVrstica[]>();
    for (const v of podatki?.izd.vrstice ?? []) {
      const xs = m.get(v.st_naloga);
      if (xs) xs.push(v);
      else m.set(v.st_naloga, [v]);
    }
    return m;
  }, [podatki]);

  const nazivKrovnega = useMemo(() => {
    const izNalogov = new Map((podatki?.nal.nalogi ?? []).map((n) => [n.st_naloga, n.naziv_artikla]));
    const izIzdaj = new Map(rezultat.nalogi.map((n) => [n.st_naloga, n.naziv]));
    return (krovni: string) => izNalogov.get(krovni) ?? izIzdaj.get(krovni) ?? null;
  }, [podatki, rezultat.nalogi]);

  if (!podatki) return <Loading />;

  const { izd, prev, nal } = podatki;
  const niTabelVBazi = izd.niTabel || prev.niTabel;
  const izlocene = nast.izlocene ?? privzeteIzlocene(rezultat.skupine);

  // ---- iskanje in kategorije
  const ujemaKartica = (s: Stolpec, k: Kartica) =>
    ujemaIskanje(iskanje, [
      s.ident,
      s.naziv,
      k.nalog.st_naloga,
      k.nalog.krovni,
      k.nalog.naziv,
      k.nalog.koda_artikla,
      ...s.prevzemi.map((p) => p.dobavitelj),
    ]);
  const iskaniStolpci = rezultat.stolpci
    .map((s) => ({
      ...s,
      kartice: s.kartice.filter((k) => ujemaKartica(s, k)),
    }))
    .filter((s) => s.kartice.length > 0);
  const prikazaniStolpci = iskaniStolpci
    .map((s) => ({
      ...s,
      kartice: s.kartice.filter((k) => nast.faze.includes(k.faza)),
    }))
    .filter((s) => s.kartice.length > 0)
    .map((s) => {
      // barva in dnevi stolpca po najdlje čakajočem prikazanem nalogu
      const starosti = s.kartice.map((k) => k.starost).filter((x): x is number => x !== null);
      const starost = starosti.length ? Math.max(...starosti) : null;
      return { ...s, starost, faza: s.kartice.find((k) => k.starost === starost)?.faza ?? s.faza };
    })
    .sort((a, b) => {
      const poRoku = (a.kartice[0].nalog.rok ?? "9999").localeCompare(b.kartice[0].nalog.rok ?? "9999");
      return nast.razvrsti === "rok"
        ? poRoku || a.ident.localeCompare(b.ident)
        : (b.starost ?? -1) - (a.starost ?? -1) || poRoku || a.ident.localeCompare(b.ident);
    });

  const upostevanih = rezultat.nalogi.filter((n) => n.stanje === "upostevan").length;

  // Obvestilo v Teams: izbran material v vrstnem redu table (s trenutnimi filtri)
  const izbraniZaTeams = prikazaniStolpci.filter((s) => zaTeams.has(s.ident));
  const vsiIzbrani = prikazaniStolpci.length > 0 && prikazaniStolpci.every((s) => zaTeams.has(s.ident));

  async function posljiObvestilo() {
    setPosiljam(true);
    try {
      const email = await prijavljenEmail();
      await posljiVTeams("doizdaja", sporociloDoizdaje(izbraniZaTeams, nazivKrovnega, email));
      try {
        await zabeleziObvestilo(
          izbraniZaTeams.map((s) => s.ident),
          email,
        );
      } catch {
        notify("warning", "Obvestilo je poslano, oznaka »obveščeno« ni shranjena (zaženi SQL 026).", 8000);
      }
      notify("success", `Obvestilo poslano v Teams: ${izbraniZaTeams.length} materialov.`);
      setTeamsOdprt(false);
      setZaTeams(new Set());
      await nalozi();
    } catch (e) {
      notify("error", `Obvestilo ni poslano: ${(e as Error).message}`, 10000);
    } finally {
      setPosiljam(false);
    }
  }

  const info = (
    <>
      Kartica: zelena {RUMENA_OD - 1} delovna dneva od prevzema, rumena {RUMENA_OD}. dan, rdeča od {RDECA_OD}. dne - ostane,
      dokler material ni izdan · delno izdanih nalogov <b className="tabular-nums">{upostevanih}</b> od {rezultat.nalogi.length}{" "}
      aktivnih
      {osvezeno && (
        <>
          {" "}
          · osveženo{" "}
          {osvezeno.toLocaleTimeString("sl-SI", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ============ GLAVA + UVOZ ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Doizdaja materiala</h2>
          <p className="text-sm text-ink-500">
            Material, ki je bil na aktivne delovne naloge izdan samo delno in je zdaj prispel od dobavitelja - kaj še izdati in na
            katere naloge
          </p>
        </div>
        <PodatkiVir kljuci={["izdaje", "prevzemi", "nalogi"]} />
      </div>

      {/* ============ OPOZORILA ============ */}
      {niTabelVBazi && (
        <WarningText>
          V bazi še ni tabel za doizdajo. V Supabase SQL editorju zaženi{" "}
          <code className="rounded bg-white px-1">supabase/migrations/023_doizdaja.sql</code> in osveži stran.
        </WarningText>
      )}
      {!niTabelVBazi && !nal.uvoz && (
        <WarningText>Ni uvoza delovnih nalogov (Zasedenost) - nalogi niso grupirani po krovnih nalogih.</WarningText>
      )}
      {izdajeStarejse && (
        <WarningText>
          Izvoz izdaj je starejši od izvoza prevzemov - zaloga v izdajah še ne vsebuje zadnjih prevzemov, zato se nove kartice ne
          zaznavajo. Sinhroniziraj svež izvoz izdaj.
        </WarningText>
      )}
      {!niTabelVBazi && podatki.cak.niTabele && (
        <WarningText>
          Kartice se še ne shranjujejo - vidne so samo {ROK_ZAZNAVE} delovne dni od prevzema. V Supabase SQL editorju zaženi{" "}
          <code className="rounded bg-white px-1">supabase/migrations/024_doizdaja_cakanje.sql</code> in osveži stran.
        </WarningText>
      )}

      {!izd.uvoz || !prev.uvoz ? (
        <div className="fp-card p-8 text-center text-ink-600">
          {niTabelVBazi
            ? "Po zagonu SQL 023 uvozi oba izvoza iz ERP."
            : `Uvozi ${!izd.uvoz ? "izdaje v proizvodnjo" : ""}${!izd.uvoz && !prev.uvoz ? " in " : ""}${!prev.uvoz ? "prevzeme od dobavitelja" : ""} z gumbom Sync v glavi ali na strani Podatki.`}
        </div>
      ) : (
        <>
          {/* ============ KARTICE: STAROST PREVZEMA ============ */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {FAZE.map((f) => {
              const xs = iskaniStolpci.flatMap((s) => s.kartice.filter((k) => k.faza === f));
              const materialov = iskaniStolpci.filter((s) => s.kartice.some((k) => k.faza === f)).length;
              const aktivna = nast.faze.includes(f);
              return (
                <FilterKartica
                  key={f}
                  aktivna={aktivna}
                  onClick={() => spremeni({ faze: aktivna ? nast.faze.filter((x) => x !== f) : [...nast.faze, f] })}
                  hint={`${aktivna ? "Skrij" : "Prikaži"}: ${HINT_FAZE[f].toLowerCase()}`}
                  barva={BARVA_FAZE[f]}
                  naslov={OPIS_FAZE[f]}
                  podnaslov={`${materialov} materialov · ${xs.length} nalogov`}
                />
              );
            })}
          </div>

          {/* ============ ZAVIHKI + FILTRI ============ */}
          <div>
            <Zavihki
              label="Pogled doizdaje"
              value={nast.pogled}
              onChange={(pogled) => spremeni({ pogled })}
              zavihki={[
                {
                  koda: "material",
                  label: "Po materialu",
                  icon: Columns3,
                  hint: "Prevzet material in nalogi, kamor ga izdati",
                },
                {
                  koda: "po_nalogih",
                  label: "Po nalogih",
                  icon: ListChecks,
                  hint: "Isti material, razvrščen po delovnih nalogih",
                },
                {
                  koda: "nalogi",
                  label: "Aktivni nalogi",
                  icon: ClipboardList,
                  hint: "Delež izdanega na vseh aktivnih nalogih",
                },
              ]}
            />
            <div className="fp-card flex flex-col gap-3 rounded-tl-none p-3 sm:p-4">
              <FilterVrstica>
                <FilterIskanje
                  value={iskanje}
                  onChange={setIskanje}
                  placeholder="Ident, material, nalog, dobavitelj ..."
                  hint="Išči po materialu, nalogu, krovnem, dobavitelju"
                />
                <FilterIzbira
                  label="Nalog je nabran od"
                  value={nast.prag}
                  onChange={(prag) => spremeni({ prag })}
                  hint="Najmanjši delež izdanih vrstic, da nalog šteje"
                  options={[10, 25, 50, 70, 90].map((p) => ({
                    value: p,
                    label: `${p} % izdanih vrstic`,
                  }))}
                />
                <div className="w-full sm:w-64">
                  <MultiSelect
                    label="Ne štej v delež izdanega"
                    options={rezultat.skupine}
                    value={izlocene}
                    onChange={(v) => spremeni({ izlocene: v })}
                    hint="Skupine, ki se izdajo posebej (npr. pločevina)"
                  />
                </div>
                {nast.pogled === "material" && (
                  <FilterPreklopnik
                    label="Vrstni red materiala"
                    value={nast.razvrsti}
                    onChange={(razvrsti) => spremeni({ razvrsti })}
                    options={[
                      { value: "starost", label: "Najdlje čaka", hint: "Najprej material, ki najdlje čaka na izdajo" },
                      { value: "rok", label: "Po roku", hint: "Najprej material za najbolj nujne naloge" },
                    ]}
                  />
                )}
                {nast.pogled === "material" && (
                  <FilterPolje label="Obvestilo v Teams">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        hint={vsiIzbrani ? "Odznači ves prikazan material" : "Označi ves prikazan material za obvestilo"}
                        variant="neutral"
                        disabled={prikazaniStolpci.length === 0}
                        onClick={() => setZaTeams(vsiIzbrani ? new Set() : new Set(prikazaniStolpci.map((s) => s.ident)))}
                      >
                        {vsiIzbrani ? "Odznači vse" : "Izberi vse"}
                      </Button>
                      <Button
                        hint="Pošlji izbran material v chat skladišča"
                        variant="sync"
                        icon={Send}
                        disabled={izbraniZaTeams.length === 0}
                        onClick={() => setTeamsOdprt(true)}
                      >
                        Obvesti v Teams{izbraniZaTeams.length ? ` (${izbraniZaTeams.length})` : ""}
                      </Button>
                    </div>
                  </FilterPolje>
                )}
                {nast.pogled === "po_nalogih" && (
                  <FilterCheckbox
                    naslov="Prikaz"
                    label="Grupiraj po krovnih nalogih"
                    checked={nast.grupiraj}
                    onChange={(grupiraj) => spremeni({ grupiraj })}
                    hint="Združi vrstice po krovnem nalogu"
                  />
                )}
                {nast.pogled === "nalogi" && (
                  <FilterPreklopnik
                    label="Stanje naloga"
                    value={stanjeFilter}
                    onChange={setStanjeFilter}
                    options={[
                      {
                        value: "vsi",
                        label: "Vsi",
                        hint: "Vsi aktivni nalogi",
                        stevilo: rezultat.nalogi.length,
                      },
                      ...(["upostevan", "pod_pragom", "ni_zacet", "izdan"] as StanjeNaloga[]).map((s) => ({
                        value: s,
                        label: OPIS_STANJA[s],
                        hint: `Samo nalogi: ${OPIS_STANJA[s].toLowerCase()}`,
                        stevilo: rezultat.nalogi.filter((n) => n.stanje === s).length,
                      })),
                    ]}
                  />
                )}
                {nast.pogled === "nalogi" && (
                  <FilterPolje label="Material razprtega naloga">
                    <div className="flex flex-wrap gap-2">
                      {(["neizdano", "delno", "izdano"] as StanjeVrstice[]).map((sv) => (
                        <FilterCheckbox
                          key={sv}
                          label={OPIS_VRSTICE[sv]}
                          checked={nast.prikazVrstic.includes(sv)}
                          onChange={(on) =>
                            spremeni({
                              prikazVrstic: on ? [...nast.prikazVrstic, sv] : nast.prikazVrstic.filter((x) => x !== sv),
                            })
                          }
                          hint={`${nast.prikazVrstic.includes(sv) ? "Skrij" : "Prikaži"} ${OPIS_VRSTICE[sv].toLowerCase()} material pod nalogom`}
                        />
                      ))}
                    </div>
                  </FilterPolje>
                )}
                <FilterPolje label="Prikaz">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      hint="Ponastavi filtre in nastavitve na privzete"
                      variant="neutral"
                      onClick={() => {
                        setIskanje("");
                        setStanjeFilter("vsi");
                        spremeni({
                          ...PRIVZETE_NASTAVITVE,
                          faze: PRIVZETE_FAZE,
                          razvrsti: "starost",
                          prikazVrstic: PRIVZETO_SHRANJENO.prikazVrstic,
                        });
                      }}
                    >
                      Ponastavi filtre
                    </Button>
                    <Button
                      hint="Prikaži material čez cel zaslon (skladišče)"
                      variant="neutral"
                      icon={Maximize2}
                      onClick={() => odpriZaslon(setZaslon)}
                    >
                      Zaslon
                    </Button>
                  </div>
                </FilterPolje>
              </FilterVrstica>
              <p className="text-xs text-ink-500">{info}</p>
            </div>
          </div>

          {/* ============ VSEBINA ============ */}
          {nast.pogled === "material" && (
            <Kanban
              stolpci={prikazaniStolpci}
              nazivKrovnega={nazivKrovnega}
              izbrani={zaTeams}
              onIzberi={(ident) =>
                setZaTeams((x) => {
                  const n = new Set(x);
                  if (n.has(ident)) n.delete(ident);
                  else n.add(ident);
                  return n;
                })
              }
            />
          )}
          {nast.pogled === "po_nalogih" && (
            <PoNalogih stolpci={prikazaniStolpci} grupiraj={nast.grupiraj} nazivKrovnega={nazivKrovnega} />
          )}
          {nast.pogled === "nalogi" && (
            <AktivniNalogi
              nalogi={rezultat.nalogi.filter(
                (n) =>
                  (stanjeFilter === "vsi" || n.stanje === stanjeFilter) &&
                  ujemaIskanje(iskanje, [
                    n.st_naloga,
                    n.krovni,
                    n.naziv,
                    n.koda_artikla,
                    // iskanje po identu najde naloge, ki ta material še potrebujejo
                    ...(vrsticePoNalogu.get(n.st_naloga) ?? []).filter((v) => v.za_izdajo > 0).map((v) => v.ident),
                  ]),
              )}
              prag={nast.prag}
              vrsticePoNalogu={vrsticePoNalogu}
              izlocene={izlocene}
              prikazVrstic={nast.prikazVrstic}
            />
          )}
        </>
      )}

      {/* ============ OBVESTILO V TEAMS ============ */}
      <Modal
        open={teamsOdprt}
        title="Obvestilo v Teams - Skladišče obveščanje"
        onClose={() => !posiljam && setTeamsOdprt(false)}
        sirina="max-w-2xl"
        noga={
          <div className="flex justify-end gap-2">
            <Button hint="Zapri brez pošiljanja" variant="neutral" disabled={posiljam} onClick={() => setTeamsOdprt(false)}>
              Prekliči
            </Button>
            <Button
              hint="Pošlji obvestilo v chat skladišča"
              variant="sync"
              icon={posiljam ? Loader2 : Send}
              disabled={posiljam || izbraniZaTeams.length === 0}
              onClick={posljiObvestilo}
            >
              Pošlji v Teams
            </Button>
          </div>
        }
      >
        <PredogledTeams stolpci={izbraniZaTeams} nazivKrovnega={nazivKrovnega} />
      </Modal>

      {/* ============ CELOZASLONSKI PRIKAZ (SKLADIŠČE) ============ */}
      {zaslon && (
        <Zaslon
          onZapri={() => zapriZaslon(setZaslon)}
          onOsvezi={() => nalozi().catch((e) => notify("error", `Napaka pri osveževanju: ${(e as Error).message}`, 10000))}
          info={info}
        >
          <Kanban stolpci={prikazaniStolpci} nazivKrovnega={nazivKrovnega} velik />
        </Zaslon>
      )}
    </div>
  );
}

function odpriZaslon(setZaslon: (v: boolean) => void) {
  setZaslon(true);
  document.documentElement.requestFullscreen?.().catch(() => {
    // brskalnik ne dovoli celega zaslona - prikaz ostane čez okno
  });
}

function zapriZaslon(setZaslon: (v: boolean) => void) {
  setZaslon(false);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// =====================================================================
// PO MATERIALU (KANBAN)
// =====================================================================

function Kanban({
  stolpci,
  nazivKrovnega,
  velik,
  izbrani,
  onIzberi,
}: {
  stolpci: Stolpec[];
  nazivKrovnega: (krovni: string) => string | null;
  velik?: boolean;
  /** Izbira materiala za obvestilo v Teams (ni na celozaslonskem prikazu). */
  izbrani?: Set<string>;
  onIzberi?: (ident: string) => void;
}) {
  if (stolpci.length === 0)
    return (
      <div className="fp-card p-8 text-center text-ink-500">
        Ni materiala, ki bi čakal na izdajo - prevzet material ni manjkal na nobenem delno izdanem nalogu.
      </div>
    );
  return (
    <div
      className={`grid items-start gap-3 ${
        velik
          ? "grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4"
          : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      }`}
    >
      {stolpci.map((s) => (
        <MaterialStolpec
          key={s.ident}
          s={s}
          nazivKrovnega={nazivKrovnega}
          velik={velik}
          izbran={izbrani?.has(s.ident)}
          onIzberi={onIzberi && (() => onIzberi(s.ident))}
        />
      ))}
    </div>
  );
}

function MaterialStolpec({
  s,
  nazivKrovnega,
  velik,
  izbran,
  onIzberi,
}: {
  s: Stolpec;
  nazivKrovnega: (krovni: string) => string | null;
  velik?: boolean;
  izbran?: boolean;
  onIzberi?: () => void;
}) {
  const b = BARVA_FAZE[s.faza];
  const zaIzdajo = s.kartice.reduce((a, k) => a + k.za_izdajo, 0);
  const manjka = Math.max(0, zaIzdajo - Math.max(0, s.zaloga));
  const em = s.em ?? "";
  const dobavitelji = [...new Set(s.prevzemi.map((p) => p.dobavitelj).filter(Boolean))].join(", ");
  const prevzemiHint = s.prevzemi
    .map(
      (p) =>
        `${casTxt(prevzemCas(p))} · ${formatNum(p.kolicina)} ${p.em ?? em} · ${p.dobavitelj ?? ""}${p.stevilka ? ` · prevzem ${p.stevilka}` : ""}`,
    )
    .join("\n");
  const skupine = poKrovnih(s.kartice, nazivKrovnega);

  return (
    <section
      className={`fp-card overflow-hidden ${izbran ? "ring-2 ring-sync-500" : s.faza === "zamuja" ? "border-nok-500" : ""}`}
      aria-label={`${s.ident} ${s.naziv ?? ""}`}
    >
      <div className={`h-2 ${b.trakStolpca}`} aria-hidden />
      <header className="border-b border-ink-100 p-3">
        <div className="flex items-start gap-3">
          {onIzberi && (
            <input
              type="checkbox"
              checked={!!izbran}
              onChange={onIzberi}
              title={izbran ? "Odstrani material iz obvestila v Teams" : "Dodaj material v obvestilo v Teams"}
              aria-label={`Izberi ${s.ident} za obvestilo`}
              className="mt-1 h-4 w-4 shrink-0 accent-fines-500"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className={`font-mono font-bold text-ink-900 ${velik ? "text-lg" : "text-base"}`}>{s.ident}</p>
            <h3 className={`font-semibold leading-tight text-ink-700 ${velik ? "text-base" : "text-sm"}`}>{s.naziv}</h3>
            {s.skupina && <p className="text-xs text-ink-500">{s.skupina}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`rounded-lg px-2.5 py-1 font-bold tabular-nums ${velik ? "text-xl" : "text-base"} ${b.znacka}`}
              title={
                s.starost === null
                  ? HINT_FAZE.ni_manjkalo
                  : `Delovni dnevi od prevzema (dan prevzema = 1. dan): ${HINT_FAZE[s.faza]}`
              }
            >
              {s.starost === null ? OPIS_FAZE.ni_manjkalo : danTxt(s.starost)}
            </span>
            <span className="text-right text-xs text-ink-500" title="Skupaj za izdajo na prikazanih nalogih">
              za izdajo{" "}
              <b className={`tabular-nums text-ink-900 ${velik ? "text-lg" : "text-sm"}`}>
                {formatNum(zaIzdajo)} {em}
              </b>
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span
            className="inline-flex items-center gap-1 rounded-full bg-sync-50 px-2 py-0.5 font-semibold text-sync-600"
            title={`Prevzemi:\n${prevzemiHint}`}
          >
            <Truck className="h-3.5 w-3.5" aria-hidden />
            Prevzeto {formatNum(s.prevzeto)} {em} · {casTxt(s.zadnjiPrevzem)}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 font-semibold text-ink-700"
            title="Trenutna zaloga ob izvozu izdaj"
          >
            <Boxes className="h-3.5 w-3.5" aria-hidden />
            Zaloga {formatNum(s.zaloga)} {em}
          </span>
          {manjka > 0 && (
            <span
              className="rounded-full bg-nok-500 px-2 py-0.5 font-bold text-white"
              title="Zaloga ne pokrije vseh prikazanih nalogov"
            >
              Manjka {formatNum(manjka)} {em}
            </span>
          )}
        </div>
        {s.obvesceno && (
          <p
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sync-600"
            title={`Obvestilo v Teams poslal ${s.obvesceno.kdo ?? "neznan uporabnik"}`}
          >
            <BellRing className="h-3.5 w-3.5" aria-hidden />
            Obveščeno {casObvestila(s.obvesceno.cas)}
            {s.neobvescenih > 0 && <span className="text-warn-700"> · {s.neobvescenih} novih nalogov</span>}
          </p>
        )}
        {dobavitelji && (
          <p className="mt-1 truncate text-xs text-ink-500" title={dobavitelji}>
            {dobavitelji}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-2 p-3">
        {skupine.map((sk) => {
          const samostojen = sk.kartice.length === 1 && sk.kartice[0].nalog.st_naloga === sk.krovni;
          return (
            <div key={sk.krovni} className="overflow-hidden rounded-lg border border-l-4 border-ink-200 border-l-ink-600">
              {!samostojen && (
                <div
                  className="flex items-baseline gap-2 bg-ink-100 px-2.5 py-1.5"
                  title={`Krovni nalog ${sk.krovni}${sk.naziv ? ` · ${sk.naziv}` : ""}`}
                >
                  <span className="font-mono text-sm font-bold text-ink-900">{sk.krovni}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-600">{sk.naziv}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-500">{datumTxt(sk.rok)}</span>
                </div>
              )}
              {sk.kartice.map((k) => (
                <NalogVrstica key={k.nalog.st_naloga} k={k} velik={velik} />
              ))}
            </div>
          );
        })}
      </div>

      {s.ostali.nalogov > 0 && (
        <footer
          className="border-t border-ink-100 px-3 py-2 text-xs text-ink-500"
          title="Nalogi, ki se še nabirajo ali se še niso začeli"
        >
          Še {s.ostali.nalogov} nalogov v nabiranju potrebuje {formatNum(s.ostali.kolicina)} {em}
        </footer>
      )}
    </section>
  );
}

function NalogVrstica({ k, velik }: { k: Kartica; velik?: boolean }) {
  const em = k.em ?? "";
  const hint = [
    `Nalog ${k.nalog.st_naloga}${k.nalog.naziv ? ` · ${k.nalog.naziv}` : ""}`,
    `Rok izdelave: ${datumTxt(k.nalog.rok)}`,
    `Planirano ${formatNum(k.planirano)} · izdano ${formatNum(k.porabljeno)} · za izdajo ${formatNum(k.za_izdajo)} ${em}`,
    `Nalog izdan ${Math.round(k.nalog.delez * 100)} % (${k.nalog.izdanih}/${k.nalog.vrstic} vrstic)`,
    k.prevzem_datum ? `Čaka od prevzema ${datumTxt(k.prevzem_datum)} (${danTxt(k.starost)})` : HINT_FAZE.ni_manjkalo,
  ].join("\n");
  return (
    <div className="flex items-center gap-3 border-t border-ink-100 bg-white px-2.5 py-2 first:border-t-0" title={hint}>
      <span className={`h-8 w-1.5 shrink-0 rounded-full ${BARVA_FAZE[k.faza].trakStolpca}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`font-mono font-bold text-ink-900 ${velik ? "text-base" : "text-sm"}`}>
          {k.nalog.st_naloga}
          <span className="ml-2 font-sans text-xs font-normal tabular-nums text-ink-500">{datumTxt(k.nalog.rok)}</span>
        </p>
        <p className="truncate text-xs text-ink-500">{k.nalog.naziv}</p>
      </div>
      <div className="shrink-0 text-right">
        <span
          className={`inline-block rounded-lg bg-ink-800 px-2.5 py-1 font-bold tabular-nums text-white ${velik ? "text-xl" : "text-base"}`}
        >
          {formatNum(k.za_izdajo)} <span className="text-xs font-semibold opacity-80">{em}</span>
        </span>
        {k.pokritost === "delno" && (
          <p className="mt-0.5 text-[11px] font-semibold text-warn-700" title="Zaloga pokrije samo del izdaje">
            na voljo {formatNum(k.na_voljo)}
          </p>
        )}
        {k.pokritost === "nic" && (
          <p className="mt-0.5 text-[11px] font-semibold text-nok-600" title="Zalogo so porabili nalogi z zgodnejšim rokom">
            ni zaloge
          </p>
        )}
      </div>
    </div>
  );
}

/** Predogled obvestila v Teams (ista vsebina kot kartica v chatu, preprost prikaz). */
function PredogledTeams({ stolpci, nazivKrovnega }: { stolpci: Stolpec[]; nazivKrovnega: (krovni: string) => string | null }) {
  const nalogov = new Set(stolpci.flatMap((s) => s.kartice.map((k) => k.nalog.st_naloga))).size;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink-600">
        V chat <b>Skladišče obveščanje</b> se pošlje {stolpci.length} materialov za {nalogov} nalogov (s trenutnimi filtri table).
        Obvestilo ima gumb »Odpri Doizdajo«.
      </p>
      {stolpci.map((s) => (
        <div key={s.ident} className={`rounded-lg border border-l-4 border-ink-200 p-2 ${BARVA_FAZE[s.faza].aktivna}`}>
          <div className="flex items-baseline gap-2">
            <span className="font-mono font-bold">{s.ident}</span>
            <span className="min-w-0 flex-1 truncate text-ink-700">{s.naziv}</span>
            <span className="shrink-0 text-xs font-bold">{danTxt(s.starost)}</span>
          </div>
          <ul className="mt-1 text-xs text-ink-700">
            {poKrovnih(s.kartice, nazivKrovnega).flatMap((sk) =>
              sk.kartice.map((k) => (
                <li key={k.nalog.st_naloga} className="flex gap-2">
                  <span className="font-mono">
                    {k.nalog.st_naloga}
                    {k.nalog.krovni !== k.nalog.st_naloga && ` (krovni ${k.nalog.krovni})`}
                  </span>
                  <span className="ml-auto tabular-nums">
                    <b>
                      {formatNum(k.za_izdajo)} {s.em}
                    </b>{" "}
                    · rok {datumTxt(k.nalog.rok)}
                  </span>
                </li>
              )),
            )}
          </ul>
          {s.obvesceno && (
            <p className="mt-1 text-xs text-warn-700">Ta material je bil že obveščen {casObvestila(s.obvesceno.cas)}.</p>
          )}
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// PO NALOGIH (TABELA)
// =====================================================================

type Vrstica = Kartica & { stolpec: Stolpec };
type KljucVrstice =
  "krovni" | "nalog" | "izdelek" | "rok" | "ident" | "material" | "za" | "na_voljo" | "zaloga" | "prevzeto" | "dni";

function PoNalogih({
  stolpci,
  grupiraj,
  nazivKrovnega,
}: {
  stolpci: Stolpec[];
  grupiraj: boolean;
  nazivKrovnega: (krovni: string) => string | null;
}) {
  const sort = useRazvrscanje<Vrstica, KljucVrstice>({
    krovni: (v) => v.nalog.krovni,
    nalog: (v) => v.nalog.st_naloga,
    izdelek: (v) => v.nalog.naziv,
    rok: (v) => v.nalog.rok,
    ident: (v) => v.ident,
    material: (v) => v.naziv,
    za: (v) => v.za_izdajo,
    na_voljo: (v) => v.na_voljo,
    zaloga: (v) => v.stolpec.zaloga,
    prevzeto: (v) => v.prevzem_datum,
    dni: (v) => v.starost,
  });
  // Privzeti vrstni red: rok, nalog, ident
  const vse = stolpci
    .flatMap((s) => s.kartice.map((k) => ({ ...k, stolpec: s })))
    .sort(
      (a, b) =>
        (a.nalog.rok ?? "9999").localeCompare(b.nalog.rok ?? "9999") ||
        a.nalog.st_naloga.localeCompare(b.nalog.st_naloga, "sl", { numeric: true }) ||
        a.ident.localeCompare(b.ident),
    );
  if (vse.length === 0)
    return <div className="fp-card p-8 text-center text-ink-500">Ni materiala za doizdajo za izbrane filtre.</div>;

  const skupine = grupiraj
    ? poKrovnih(vse, nazivKrovnega).map((sk) => ({ ...sk, vrstice: sort.razvrsti(sk.kartice as Vrstica[]) }))
    : [{ krovni: "", naziv: null, rok: null, vrstice: sort.razvrsti(vse), kartice: vse }];

  return (
    <div className="fp-card p-3 sm:p-4">
      <TabelaOkvir>
        <table className="w-full min-w-[960px] text-sm">
          <thead className="fp-thead">
            <tr className="text-left text-xs font-bold">
              {!grupiraj && (
                <SortTh sort={sort} kljuc="krovni">
                  Krovni
                </SortTh>
              )}
              <SortTh sort={sort} kljuc="nalog">
                Nalog
              </SortTh>
              <SortTh sort={sort} kljuc="izdelek">
                Izdelek
              </SortTh>
              <SortTh sort={sort} kljuc="rok">
                Rok
              </SortTh>
              <SortTh sort={sort} kljuc="ident">
                Ident
              </SortTh>
              <SortTh sort={sort} kljuc="material">
                Material
              </SortTh>
              <SortTh sort={sort} kljuc="za" desno>
                Za izdajo
              </SortTh>
              <SortTh sort={sort} kljuc="na_voljo" desno hint="Razvrsti po količini, ki jo pokrije zaloga">
                Na voljo
              </SortTh>
              <SortTh sort={sort} kljuc="zaloga" desno>
                Zaloga
              </SortTh>
              <SortTh sort={sort} kljuc="prevzeto" hint="Razvrsti po datumu prevzema">
                Prevzeto
              </SortTh>
              <SortTh sort={sort} kljuc="dni" hint="Razvrsti po delovnih dnevih od prevzema">
                Čaka
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {skupine.map((sk) => (
              <Fragment key={sk.krovni || "vse"}>
                {grupiraj && (
                  <tr className="border-l-4 border-l-ink-600 bg-ink-200">
                    <td colSpan={10} className="px-3 py-2 text-base">
                      <span className="font-mono font-bold">{sk.krovni}</span>
                      {sk.naziv && <span className="ml-2 font-semibold text-ink-700">{sk.naziv}</span>}
                      <span className="ml-3 text-sm text-ink-600">
                        rok {datumTxt(sk.rok)} · {new Set(sk.vrstice.map((v) => v.nalog.st_naloga)).size} nalogov ·{" "}
                        {sk.vrstice.length} materialov
                      </span>
                    </td>
                  </tr>
                )}
                {sk.vrstice.map((v) => (
                  <tr key={`${v.nalog.st_naloga}-${v.ident}`} className="border-b border-ink-100 hover:bg-ink-50">
                    {!grupiraj && <td className="px-2 py-1.5 font-mono">{v.nalog.krovni}</td>}
                    <td className="px-2 py-1.5 font-mono font-semibold">{v.nalog.st_naloga}</td>
                    <td className="max-w-64 truncate px-2 py-1.5" title={v.nalog.naziv ?? ""}>
                      {v.nalog.naziv}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{datumTxt(v.nalog.rok)}</td>
                    <td className="px-2 py-1.5 font-mono">{v.ident}</td>
                    <td className="max-w-64 truncate px-2 py-1.5" title={v.naziv ?? ""}>
                      {v.naziv}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                      {formatNum(v.za_izdajo)} <span className="text-xs font-normal text-ink-500">{v.em}</span>
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${v.pokritost === "vse" ? "" : v.pokritost === "delno" ? "font-semibold text-warn-700" : "font-semibold text-nok-600"}`}
                    >
                      {formatNum(v.na_voljo)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(v.stolpec.zaloga)}</td>
                    <td
                      className="whitespace-nowrap px-2 py-1.5 tabular-nums"
                      title={v.stolpec.prevzemi.map((p) => p.dobavitelj).join(", ")}
                    >
                      {datumTxt(v.prevzem_datum)}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${BARVA_FAZE[v.faza].znacka}`}
                        title={HINT_FAZE[v.faza]}
                      >
                        {v.starost === null ? OPIS_FAZE.ni_manjkalo : danTxt(v.starost)}
                      </span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </TabelaOkvir>
    </div>
  );
}

// =====================================================================
// AKTIVNI NALOGI (KONTROLA FILTRA)
// =====================================================================

type KljucNaloga = "nalog" | "krovni" | "izdelek" | "status" | "rok" | "vrstic" | "izdanih" | "delez" | "odprtih" | "stanje";

const BARVA_VRSTICE: Record<StanjeVrstice, string> = {
  neizdano: "bg-nok-500 text-white",
  delno: "bg-warn-400 text-ink-900",
  izdano: "bg-ok-500 text-white",
};

function AktivniNalogi({
  nalogi,
  prag,
  vrsticePoNalogu,
  izlocene,
  prikazVrstic,
}: {
  nalogi: NalogPregled[];
  prag: number;
  vrsticePoNalogu: Map<string, IzdajaVrstica[]>;
  izlocene: string[];
  prikazVrstic: StanjeVrstice[];
}) {
  const [razprti, setRazprti] = useState<Set<string>>(new Set());
  const sort = useRazvrscanje<NalogPregled, KljucNaloga>({
    nalog: (n) => n.st_naloga,
    krovni: (n) => n.krovni,
    izdelek: (n) => n.naziv,
    status: (n) => n.status_naloga,
    rok: (n) => n.rok,
    vrstic: (n) => n.vrstic,
    izdanih: (n) => n.izdanih,
    delez: (n) => n.delez,
    odprtih: (n) => n.odprtih,
    stanje: (n) => n.stanje,
  });
  const preklopi = (st: string) =>
    setRazprti((r) => {
      const n = new Set(r);
      if (n.has(st)) n.delete(st);
      else n.add(st);
      return n;
    });
  const vsiRazprti = nalogi.length > 0 && nalogi.every((n) => razprti.has(n.st_naloga));

  return (
    <div className="fp-card flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-start gap-3">
        <p className="min-w-[min(100%,18rem)] flex-1 text-sm text-ink-600">
          Doizdaja upošteva samo naloge s stanjem <b>Delno izdan</b>: izdanih je vsaj {prag} % vrstic (brez skupin, ki se ne
          štejejo) in nekaj je še neizdanega. Nalogi <b>V nabiranju</b> in <b>Nabiranje ni začeto</b> se ne upoštevajo, da se ne
          pokaže material, ki ga skladiščnik še nabira. Klik na nalog pokaže njegov material.
        </p>
        <Button
          hint={vsiRazprti ? "Zloži material vseh prikazanih nalogov" : "Pokaži material vseh prikazanih nalogov"}
          variant="neutral"
          icon={vsiRazprti ? ChevronDown : ChevronRight}
          disabled={nalogi.length === 0}
          onClick={() => setRazprti(vsiRazprti ? new Set() : new Set(nalogi.map((n) => n.st_naloga)))}
        >
          {vsiRazprti ? "Zloži vse" : "Razpri vse"}
        </Button>
      </div>
      <TabelaOkvir>
        <table className="w-full min-w-[960px] text-sm">
          <thead className="fp-thead">
            <tr className="text-left text-xs font-bold">
              <th className="w-8 px-1 py-2" aria-label="Razpri" />
              <SortTh sort={sort} kljuc="nalog">
                Nalog
              </SortTh>
              <SortTh sort={sort} kljuc="krovni">
                Krovni
              </SortTh>
              <SortTh sort={sort} kljuc="izdelek">
                Izdelek
              </SortTh>
              <SortTh sort={sort} kljuc="status">
                Status
              </SortTh>
              <SortTh sort={sort} kljuc="rok">
                Rok
              </SortTh>
              <SortTh sort={sort} kljuc="vrstic" desno hint="Razvrsti po številu štetih vrstic">
                Vrstic
              </SortTh>
              <SortTh sort={sort} kljuc="izdanih" desno>
                Izdanih
              </SortTh>
              <SortTh sort={sort} kljuc="delez" desno>
                Delež
              </SortTh>
              <SortTh sort={sort} kljuc="odprtih" desno hint="Razvrsti po številu neizdanih vrstic">
                Neizdanih
              </SortTh>
              <SortTh sort={sort} kljuc="stanje">
                Stanje
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {sort.razvrsti(nalogi).map((n) => {
              const razprt = razprti.has(n.st_naloga);
              return (
                <Fragment key={n.st_naloga}>
                  <tr
                    className={`cursor-pointer border-b border-ink-100 hover:bg-ink-50 ${razprt ? "bg-ink-50" : ""}`}
                    onClick={() => preklopi(n.st_naloga)}
                    title={razprt ? "Skrij material naloga" : "Pokaži material naloga"}
                    aria-expanded={razprt}
                  >
                    <td className="px-1 py-1.5 text-ink-500">
                      {razprt ? (
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono font-semibold">{n.st_naloga}</td>
                    <td className="px-2 py-1.5 font-mono">{n.krovni === n.st_naloga ? "" : n.krovni}</td>
                    <td className="max-w-72 truncate px-2 py-1.5" title={n.naziv ?? ""}>
                      {n.naziv}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-ink-600">{n.status_naloga ?? n.status}</td>
                    <td className="px-2 py-1.5 tabular-nums">{datumTxt(n.rok)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{n.vrstic}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{n.izdanih}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="inline-flex items-center gap-2" title={`Izdanih ${n.izdanih} od ${n.vrstic} vrstic`}>
                        <span className="h-2 w-16 overflow-hidden rounded-full bg-ink-100">
                          <span
                            className={`block h-full ${n.delez * 100 >= prag ? "bg-fines-500" : "bg-sync-500"}`}
                            style={{ width: `${Math.round(n.delez * 100)}%` }}
                          />
                        </span>
                        <span className="w-10 tabular-nums">{Math.round(n.delez * 100)} %</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{n.odprtih}</td>
                    <td className="px-2 py-1.5">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${BARVA_STANJA[n.stanje]}`}>
                        {OPIS_STANJA[n.stanje]}
                      </span>
                    </td>
                  </tr>
                  {razprt && (
                    <tr className="border-b border-ink-200 bg-ink-100">
                      <td colSpan={11} className="px-3 py-3 sm:pl-10">
                        <MaterialNaloga
                          vrstice={vrsticePoNalogu.get(n.st_naloga) ?? []}
                          izlocene={izlocene}
                          prikaz={prikazVrstic}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {nalogi.length === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-6 text-center text-ink-500">
                  Ni nalogov za izbrane filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TabelaOkvir>
    </div>
  );
}

type KljucMateriala = "ident" | "naziv" | "skupina" | "planirano" | "izdano" | "za" | "zaloga" | "naroceno" | "stanje";
const VRSTNI_RED_VRSTIC: StanjeVrstice[] = ["neizdano", "delno", "izdano"];

/** Material razprtega naloga: vse vrstice izdaje s količinami in stanjem (filter stanj nad tabelo nalogov). */
function MaterialNaloga({
  vrstice,
  izlocene,
  prikaz,
}: {
  vrstice: IzdajaVrstica[];
  izlocene: string[];
  prikaz: StanjeVrstice[];
}) {
  const sort = useRazvrscanje<IzdajaVrstica, KljucMateriala>({
    ident: (v) => v.ident,
    naziv: (v) => v.naziv,
    skupina: (v) => v.skupina,
    planirano: (v) => v.planirano,
    izdano: (v) => v.porabljeno,
    za: (v) => v.za_izdajo,
    zaloga: (v) => v.zaloga,
    naroceno: (v) => (v.naroceno ? "DA" : "NE"),
    stanje: (v) => VRSTNI_RED_VRSTIC.indexOf(stanjeVrstice(v)),
  });
  const stevilo = (sv: StanjeVrstice) => vrstice.filter((v) => stanjeVrstice(v) === sv).length;
  const prikazane = sort.razvrsti(vrstice.filter((v) => prikaz.includes(stanjeVrstice(v))));
  const skrite = vrstice.length - prikazane.length;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-600">
        {vrstice.length} vrstic materiala: <b className="text-nok-600">{stevilo("neizdano")} neizdanih</b> ·{" "}
        <b className="text-warn-700">{stevilo("delno")} delno izdanih</b> ·{" "}
        <b className="text-ok-600">{stevilo("izdano")} izdanih</b>
        {skrite > 0 && <span className="text-ink-500"> ({skrite} skritih s filtrom Material razprtega naloga)</span>}
      </p>
      {prikazane.length === 0 ? (
        <p className="py-2 text-center text-sm text-ink-500">Ni materiala za izbrane filtre.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-ink-800 text-ink-100">
              <tr className="text-left text-xs font-bold">
                <SortTh sort={sort} kljuc="ident">
                  Ident
                </SortTh>
                <SortTh sort={sort} kljuc="naziv">
                  Material
                </SortTh>
                <SortTh sort={sort} kljuc="skupina">
                  Skupina
                </SortTh>
                <SortTh sort={sort} kljuc="planirano" desno>
                  Planirano
                </SortTh>
                <SortTh sort={sort} kljuc="izdano" desno>
                  Izdano
                </SortTh>
                <SortTh sort={sort} kljuc="za" desno>
                  Za izdajo
                </SortTh>
                <SortTh sort={sort} kljuc="zaloga" desno hint="Razvrsti po trenutni zalogi">
                  Zaloga
                </SortTh>
                <SortTh sort={sort} kljuc="naroceno" hint="Razvrsti po tem, ali je material naročen">
                  Naročeno
                </SortTh>
                <SortTh sort={sort} kljuc="stanje">
                  Stanje
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {prikazane.map((v, i) => {
                const sv = stanjeVrstice(v);
                const pokrito = v.zaloga >= v.za_izdajo;
                return (
                  <tr key={`${v.ident}-${i}`} className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50">
                    <td className="px-2 py-1 font-mono">{v.ident}</td>
                    <td className="max-w-80 truncate px-2 py-1" title={v.naziv ?? ""}>
                      {v.naziv}
                    </td>
                    <td className="px-2 py-1 text-xs text-ink-600">
                      {v.skupina}
                      {izlocene.includes(v.skupina ?? "") && (
                        <span
                          className="ml-1 rounded bg-ink-200 px-1 text-[10px] font-semibold text-ink-600"
                          title="Skupina se ne šteje v delež izdanega"
                        >
                          ne šteje
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatNum(v.planirano)} <span className="text-xs text-ink-500">{v.em}</span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatNum(v.porabljeno)}</td>
                    <td className="px-2 py-1 text-right font-bold tabular-nums">
                      {sv === "izdano" ? "" : formatNum(v.za_izdajo)}
                    </td>
                    <td
                      className={`px-2 py-1 text-right tabular-nums ${sv === "izdano" ? "" : pokrito ? "font-semibold text-ok-600" : "font-semibold text-nok-600"}`}
                      title={
                        sv === "izdano"
                          ? "Trenutna zaloga"
                          : pokrito
                            ? "Zaloga pokrije izdajo - lahko izdaš"
                            : "Zaloga ne pokrije izdaje"
                      }
                    >
                      {formatNum(v.zaloga)}
                    </td>
                    <td className="px-2 py-1 text-xs">{v.naroceno ? "DA" : "NE"}</td>
                    <td className="px-2 py-1">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${BARVA_VRSTICE[sv]}`}>
                        {OPIS_VRSTICE[sv]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CELOZASLONSKI PRIKAZ
// =====================================================================

function Zaslon({
  onZapri,
  onOsvezi,
  info,
  children,
}: {
  onZapri: () => void;
  /** Znova naloži podatke iz baze - prikaz ostane čez cel zaslon. */
  onOsvezi: () => Promise<unknown>;
  info: ReactNode;
  children: ReactNode;
}) {
  const [ura, setUra] = useState(() => new Date());
  const [osvezujem, setOsvezujem] = useState(false);
  async function osvezi() {
    setOsvezujem(true);
    try {
      await onOsvezi();
    } finally {
      setOsvezujem(false);
    }
  }
  useEffect(() => {
    const t = setInterval(() => setUra(new Date()), 30 * 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZapri();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onZapri]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink-100">
      <header className="sticky top-0 z-10 border-b-4 border-fines-500 bg-white">
        <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-2">
          <Image src="/fines-logo.png" alt="FINES d.o.o. logotip" width={136} height={36} className="h-auto w-24 sm:w-[136px]" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-ink-900 sm:text-2xl">Doizdaja materiala</h1>
            <p className="text-xs text-ink-500 sm:text-sm">{info}</p>
          </div>
          <span className="text-2xl font-bold tabular-nums text-ink-800" title="Trenutni čas">
            {ura.toLocaleTimeString("sl-SI", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <Button
            hint="Znova naloži podatke, prikaz ostane čez zaslon"
            variant="sync"
            icon={osvezujem ? Loader2 : RefreshCw}
            disabled={osvezujem}
            onClick={osvezi}
            className={osvezujem ? "[&>svg]:animate-spin" : ""}
          >
            Osveži
          </Button>
          <Button hint="Zapri celozaslonski prikaz" variant="neutral" icon={X} onClick={onZapri}>
            Zapri
          </Button>
        </div>
      </header>
      <div className="flex-1 p-3 sm:p-4">{children}</div>
    </div>,
    document.body,
  );
}
