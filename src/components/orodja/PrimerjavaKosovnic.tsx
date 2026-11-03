"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, GitCompareArrows, Minus, Plus } from "lucide-react";
import { aktivenIdent, lokalniPredogled, materialniPlan, naloziIdente, naloziKosovnico, primerjajStrukturo, type Ident, type Vozlisce, type ZalogaKosa } from "@/lib/kosovnice";
import { naloziMaterial } from "@/lib/material";
import { formatNum } from "@/lib/stevila";
import { ujemaIskanje } from "@/lib/iskanje";
import { poisciKomponente } from "@/lib/kosovniceIskanje";
import { supabaseConfigured } from "@/lib/supabase";
import { useSync } from "@/components/SyncProvider";
import { PodatkiVir } from "@/components/PodatkiVir";
import { Button, IconButton } from "@/components/ui/Button";
import { FilterCheckbox, FilterIskanje, FilterIzbira, FilterPolje, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { ConfigMissing, ErrorText, Loading, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { Izvoz } from "@/components/ui/Izvoz";
import { PredelavaKosovnic } from "./PredelavaKosovnic";

function IzbiraIdenta({ identi, value, onChange }: { identi: Ident[]; value: string; onChange: (v: string) => void }) {
  const [odprt, setOdprt] = useState(false), [iskanje, setIskanje] = useState("");
  const [aktivni, setAktivni] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const zadetki = useMemo(() => identi.filter(i => ujemaIskanje(iskanje, [i.sifra, i.naziv, i.risp_sifra])), [identi, iskanje]);
  const vidni = zadetki.slice(0, 100);
  useEffect(() => {
    if (!odprt) return;
    const zapri = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOdprt(false); };
    document.addEventListener("mousedown", zapri);
    return () => document.removeEventListener("mousedown", zapri);
  }, [odprt]);
  const izbran = identi.find(i => i.sifra === value);
  function izberi(sifra: string) { onChange(sifra); setOdprt(false); setIskanje(""); }
  return <div ref={ref} className="relative min-w-0 flex-1">
    <FilterPolje label="Ident / proizvodna šifra">
      <button type="button" title="Izberi ident z iskanjem po nazivu" aria-haspopup="listbox" aria-expanded={odprt} onClick={() => { setOdprt(!odprt); setAktivni(0); }} className="flex h-10 w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-left text-sm">
        <span className="min-w-0 flex-1 truncate">{value ? `${value} · ${izbran?.naziv ?? ""}` : "Izberi ident ..."}</span><ChevronDown className="h-4 w-4 shrink-0" />
      </button>
    </FilterPolje>
    {odprt && <div className="absolute z-30 mt-1 w-full rounded-lg border border-ink-200 bg-white p-2 shadow-lg" onKeyDown={e => { if (e.key === "Escape") { setOdprt(false); e.stopPropagation(); } }}>
      <input autoFocus role="combobox" aria-label="Išči ident" aria-expanded={true} aria-controls={`${id}-seznam`} aria-activedescendant={vidni[aktivni] ? `${id}-${aktivni}` : undefined} title="Išči proizvodno šifro ali naziv identa" value={iskanje} onChange={e => { setIskanje(e.target.value); setAktivni(0); }} onKeyDown={e => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, Math.min(vidni.length - 1, aktivni + (e.key === "ArrowDown" ? 1 : -1))); setAktivni(n); document.getElementById(`${id}-${n}`)?.scrollIntoView({ block: "nearest" }); }
        if (e.key === "Enter" && vidni[aktivni]) { e.preventDefault(); izberi(vidni[aktivni].sifra); }
      }} placeholder="Šifra ali naziv ..." className="mb-2 h-10 w-full rounded-lg border border-ink-200 px-3 text-sm focus:outline-fines-500" />
      <div role="listbox" id={`${id}-seznam`} aria-label="Identi" className="max-h-64 overflow-auto">
        {vidni.map((i, n) => <button id={`${id}-${n}`} key={i.sifra} role="option" aria-selected={i.sifra === value} type="button" title={`Izberi ${i.sifra} · ${i.naziv}`} onClick={() => izberi(i.sifra)} className={`block w-full rounded px-2 py-2 text-left text-sm hover:bg-fines-50 ${n === aktivni ? "bg-ink-100" : ""}`}><b>{i.sifra}</b><span className="ml-2">{i.naziv}</span><span className="block text-xs text-ink-500">{i.status ?? "Brez statusa"}</span></button>)}
        {!vidni.length && <p className="p-2 text-sm text-ink-500">Ni zadetkov.</p>}
      </div>
      <p className="pt-2 text-xs text-ink-500">{zadetki.length} zadetkov{zadetki.length > 100 ? " · prikazanih prvih 100, zoži iskanje" : ""}</p>
    </div>}
  </div>;
}

function Drevo({ koren, identi, iskanje }: { koren: Vozlisce; identi: Map<string, Ident>; iskanje: string }) {
  const [zaprti, setZaprti] = useState<Set<number>>(new Set());
  const okvir = useRef<HTMLDivElement>(null);
  const najdeno = useMemo(() => poisciKomponente(koren, iskanje), [koren, iskanje]);
  const zadetki = useMemo(() => new Set(najdeno.zadetki.map(n => n.vrstica)), [najdeno]);
  const [izborZadetka, setIzborZadetka] = useState({ iskanje, index: 0 });
  const aktiven = izborZadetka.iskanje === iskanje ? Math.min(izborZadetka.index, Math.max(0, najdeno.zadetki.length - 1)) : 0;
  const trenutni = najdeno.zadetki[aktiven]?.vrstica;
  // Drsi le znotraj kosovnice; položaj celotne strani ostane pri obeh identih.
  useEffect(() => {
    const el = okvir.current?.querySelector<HTMLElement>(`[data-vrstica="${trenutni}"]`);
    const scroller = okvir.current;
    if (!el || !scroller) return;
    const r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    scroller.scrollTop += r.top - s.top - scroller.clientHeight / 2 + r.height / 2;
    scroller.scrollLeft = 0;
  }, [trenutni, iskanje]);
  function premakni(delta: number) {
    setIzborZadetka({ iskanje, index: (aktiven + delta + najdeno.zadetki.length) % najdeno.zadetki.length });
  }
  function vrstica(n: Vozlisce, globina: number) {
    const zaprt = zaprti.has(n.vrstica) && !najdeno.predniki.has(n.vrstica);
    const zadetek = zadetki.has(n.vrstica);
    return <li key={n.vrstica} className={globina ? "border-l border-dashed border-ink-300 pl-2" : ""}>
      <div data-vrstica={n.vrstica} aria-current={zadetek && n.vrstica === trenutni ? "true" : undefined} className={`flex min-h-8 items-center gap-1.5 border-b border-ink-100 text-xs md:min-h-6 ${zadetek ? `bg-[#f5ff00] text-ink-900 ${n.vrstica === trenutni ? "ring-1 ring-inset ring-ink-700" : ""}` : "hover:bg-ink-50"}`}>
        {globina > 0 && <span className="-ml-2 w-2 shrink-0 border-t border-dashed border-ink-300" />}
        {n.otroci.length ? <button type="button" title={najdeno.predniki.has(n.vrstica) ? "Vsebuje zadetek; počisti iskanje za zapiranje" : zaprt ? "Razpri nivo kosovnice" : "Zapri nivo kosovnice"} aria-expanded={!zaprt} disabled={najdeno.predniki.has(n.vrstica)} onClick={() => setZaprti(s => { const x = new Set(s); if (x.has(n.vrstica)) x.delete(n.vrstica); else x.add(n.vrstica); return x; })} className="flex h-8 w-7 shrink-0 items-center justify-center rounded hover:bg-ink-200 disabled:cursor-default md:h-5 md:w-5">{zaprt ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button> : <span className="w-7 shrink-0 md:w-5" />}
        <div title={`${n.sifra} · ${n.naziv} (N${n.nivo})`} className="flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-nowrap"><span className="shrink-0 font-mono font-semibold text-fines-600">{n.sifra}</span><span className="truncate">{n.naziv}</span><span className="shrink-0 text-[10px] text-ink-500">(N{n.nivo})</span></div>
        <span className="w-12 shrink-0 text-right tabular-nums" title="Količina na en nadrejeni sestav">{formatNum(n.nivo === 1 ? 1 : n.kolicina)}</span>
        <span className="w-12 shrink-0 text-right font-semibold tabular-nums" title="Skupna količina na en končni izdelek">{formatNum(n.skupaj)}</span>
        <span className="w-8 shrink-0 text-[10px] text-ink-500">{identi.get(n.sifra)?.em ?? "—"}</span>
      </div>
      {n.otroci.length > 0 && !zaprt && <ul className="ml-2">{n.otroci.map(o => vrstica(o, globina + 1))}</ul>}
    </li>;
  }
  const vse = (n: Vozlisce): number[] => [n.vrstica, ...n.otroci.flatMap(vse)];
  return <div ref={okvir} className="h-80 min-h-48 overflow-auto rounded-lg border border-ink-200 md:h-[clamp(16rem,calc(100dvh-25rem),42rem)]">
    <div className="sticky top-0 z-10 flex min-w-[560px] items-center gap-1.5 bg-ink-800 px-2 py-1 text-[11px] font-semibold text-white">
      <button type="button" title="Razpri vse nivoje kosovnice" aria-label="Razpri vse nivoje kosovnice" onClick={() => setZaprti(new Set())} className="flex h-8 w-7 shrink-0 items-center justify-center rounded border border-ink-500 hover:bg-ink-600 md:h-6 md:w-6"><Plus className="h-3.5 w-3.5" /></button>
      <button type="button" title="Zapri vse podsestave kosovnice" aria-label="Zapri vse podsestave kosovnice" onClick={() => setZaprti(new Set(vse(koren).filter(v => v !== koren.vrstica)))} className="flex h-8 w-7 shrink-0 items-center justify-center rounded border border-ink-500 hover:bg-ink-600 md:h-6 md:w-6"><Minus className="h-3.5 w-3.5" /></button>
      <span className="flex-1">Hierarhija kosovnice</span>
      {iskanje.trim() && <><span role="status" aria-live="polite" className="whitespace-nowrap text-[10px]">{najdeno.zadetki.length ? `${aktiven + 1} / ${najdeno.zadetki.length}` : "Ni zadetkov"}</span>{[-1, 1].map(d => <button key={d} type="button" title={d < 0 ? "Pokaži prejšnjo najdeno komponento" : "Pokaži naslednjo najdeno komponento"} aria-label={d < 0 ? "Prejšnji zadetek" : "Naslednji zadetek"} disabled={!najdeno.zadetki.length} onClick={() => premakni(d)} className="flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-ink-600 disabled:opacity-40">{d < 0 ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>)}</>}
      <span className="w-12 text-right" title="Količina na nadrejeni sestav">Na sestav</span><span className="w-12 text-right" title="Količina na končni izdelek">Skupaj</span><span className="w-8">EM</span>
    </div>
    <ul className="min-w-[560px] px-2">{vrstica(koren, 0)}</ul>
  </div>;
}

type FiltriOkna = { status: string; natancenStatus: string; klasifikat: string };
const PRIVZETI_FILTRI: FiltriOkna = { status: "aktivni", natancenStatus: "vsi", klasifikat: "" };

function Okno({ naslov, identi, sifra, onChange, drevo, loading, napaka, iskanjeKomponente, filtri, setFiltri }: { naslov: string; identi: Ident[]; sifra: string; onChange: (v: string) => void; drevo: Vozlisce | null; loading: boolean; napaka: string; iskanjeKomponente: string; filtri: FiltriOkna; setFiltri: (f: Partial<FiltriOkna>) => void }) {
  const { status, natancenStatus, klasifikat } = filtri;
  const po = useMemo(() => new Map(identi.map(i => [i.sifra, i])), [identi]);
  const statuses = useMemo(() => [...new Set(identi.map(i => i.status ?? ""))].sort((a, b) => a.localeCompare(b, "sl")), [identi]);
  const filtrirani = useMemo(() => identi.filter(i => (!klasifikat || i.klasifikat === klasifikat) && (status === "vsi" || (status === "aktivni" ? aktivenIdent(i) : !aktivenIdent(i))) && (natancenStatus === "vsi" || (i.status ?? "") === natancenStatus.slice(2))), [identi, klasifikat, status, natancenStatus]);
  const klasifikati = [...new Set(identi.map(i => i.klasifikat).filter((v): v is string => !!v))].sort();
  function filter(f: Partial<FiltriOkna>) { setFiltri(f); if (sifra) onChange(""); }
  return <section className="fp-card min-w-0 p-2.5 sm:p-3">
    <h3 className="mb-2 border-l-4 border-fines-500 pl-2 text-sm font-bold">{naslov}</h3>
    <div className="mb-2 flex flex-col gap-2">
      <FilterVrstica>
        <FilterPreklopnik label="Aktivnost" value={status} onChange={v => filter({ status: v, natancenStatus: "vsi" })} options={[{ value: "vsi", label: "Vsi", hint: "Prikaži idente z vsemi statusi" }, { value: "aktivni", label: "Aktivni", hint: "Prikaži aktivne idente tudi s posebnostjo" }, { value: "neaktivni", label: "Ostali", hint: "Prikaži neaktivne in ostale statuse identov" }]} />
        <FilterIzbira label="Podrobni status" value={natancenStatus} onChange={v => filter({ natancenStatus: v })} hint="Omeji izbor na točen status identa" options={[{ value: "vsi", label: "Vsi v skupini" }, ...statuses.filter(s => status === "vsi" || (status === "aktivni" ? /^AKTIVEN(?:\s|$)/i.test(s) : !/^AKTIVEN(?:\s|$)/i.test(s))).map(s => ({ value: `s:${s}`, label: s || "Brez statusa" }))]} className="w-36 min-w-0 max-w-full [&_select]:min-w-0 [&_select]:max-w-full" />
        <FilterIzbira label="Klasifikat" value={klasifikat} onChange={v => filter({ klasifikat: v })} hint="Omeji izbor identov po klasifikatu" options={[{ value: "", label: "Vsi klasifikati" }, ...klasifikati.map(k => ({ value: k, label: `${k} · ${identi.find(i => i.klasifikat === k)?.klasifikacija ?? ""}` }))]} className="min-w-36 max-w-full flex-1 [&_select]:min-w-0 [&_select]:max-w-full" />
      </FilterVrstica>
      <IzbiraIdenta identi={filtrirani} value={sifra} onChange={onChange} />
    </div>
    {loading ? <Loading /> : napaka ? <ErrorText>{napaka}</ErrorText> : drevo ? <Drevo key={sifra} koren={drevo} identi={po} iskanje={iskanjeKomponente} /> : <p className="rounded-lg bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">{sifra ? "Za ta ident ni uvožene kosovnice." : "Izberi ident za prikaz njegove kosovnice."}</p>}
  </section>;
}

type Izbor = { sifra: string; drevo: Vozlisce | null; loading: boolean; napaka: string };
const PRAZEN: Izbor = { sifra: "", drevo: null, loading: false, napaka: "" };
type Namen = "pregled" | "predelava";

// Izbrana identa, filtri oken in namen ostanejo po osvežitvi in menjavi strani (ta brskalnik).
const NASTAVITVE_KLJUC = "fines-primerjava-kosovnic";
type Shranjeno = { sifre: [string, string]; filtri: [FiltriOkna, FiltriOkna]; namen: Namen };
const PRIVZETO_SHRANJENO: Shranjeno = { sifre: ["", ""], filtri: [PRIVZETI_FILTRI, PRIVZETI_FILTRI], namen: "pregled" };
function preberiShranjeno(): Shranjeno {
  try {
    const s = JSON.parse(localStorage.getItem(NASTAVITVE_KLJUC) ?? "null") as Partial<Shranjeno> | null;
    return {
      sifre: Array.isArray(s?.sifre) ? [String(s.sifre[0] ?? ""), String(s.sifre[1] ?? "")] : PRIVZETO_SHRANJENO.sifre,
      filtri: Array.isArray(s?.filtri) ? [{ ...PRIVZETI_FILTRI, ...s.filtri[0] }, { ...PRIVZETI_FILTRI, ...s.filtri[1] }] : PRIVZETO_SHRANJENO.filtri,
      namen: s?.namen === "predelava" ? "predelava" : "pregled",
    };
  } catch {
    return PRIVZETO_SHRANJENO;
  }
}
const naloziDrevo = async (sifra: string, lokalno: boolean) =>
  lokalno ? (await lokalniPredogled<{ drevo: Vozlisce | null }>(sifra)).drevo : await naloziKosovnico(sifra);

export function PrimerjavaKosovnic() {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <PrimerjavaOsvezevanje />;
}
function PrimerjavaOsvezevanje() {
  const { verzija } = useSync();
  const [lokalno, setLokalno] = useState(false);
  return <Primerjava key={`${verzija}-${lokalno}`} lokalno={lokalno} zamenjajVir={() => setLokalno(v => !v)} />;
}
function Primerjava({ lokalno, zamenjajVir }: { lokalno: boolean; zamenjajVir: () => void }) {
  // Primerjava teče samo v brskalniku (seja Supabase) - branje localStorage ob inicializaciji je varno
  const [nast, setNast] = useState<Shranjeno>(() => preberiShranjeno());
  function spremeni(n: Partial<Shranjeno>) {
    setNast(s => {
      const nove = { ...s, ...n };
      try { localStorage.setItem(NASTAVITVE_KLJUC, JSON.stringify(nove)); } catch { /* brez shrambe velja do osvežitve */ }
      return nove;
    });
  }
  const [identi, setIdenti] = useState<Ident[]>([]), [zaloga, setZaloga] = useState<Map<string, ZalogaKosa>>(new Map());
  const [loading, setLoading] = useState(true), [napaka, setNapaka] = useState(""), [zalogaNapaka, setZalogaNapaka] = useState("");
  const [opozorila, setOpozorila] = useState<string[]>([]);
  const [izbora, setIzbora] = useState<[Izbor, Izbor]>(() => nast.sifre.map(sifra => ({ ...PRAZEN, sifra, loading: !!sifra })) as [Izbor, Izbor]);
  const zahteve = useRef([0, 0]);
  const [primerjava, setPrimerjava] = useState(false), [pogled, setPogled] = useState("material");
  const [iskanje, setIskanje] = useState(""), [samoRazlike, setSamoRazlike] = useState(true), [upostevaj, setUpostevaj] = useState(true);
  const [iskanjeKomponente, setIskanjeKomponente] = useState("");
  const iskalnikKomponent = useRef<HTMLDivElement>(null);
  function poisciVStrukturi(sifra: string) {
    setIskanjeKomponente(sifra);
    iskalnikKomponent.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  useEffect(() => {
    let zivo = true;
    // Razveljavi tudi zahteve za kosovnice iz prejšnjega uvoza.
    zahteve.current = zahteve.current.map(n => n + 1);
    const katalog = lokalno ? lokalniPredogled<{ identi: Ident[]; opozorila: string[] }>().then(p => { if (zivo) setOpozorila(p.opozorila); return p.identi; }) : naloziIdente();
    Promise.allSettled([katalog, naloziMaterial()]).then(([i, m]) => {
      if (!zivo) return;
      if (i.status === "fulfilled") setIdenti(i.value); else { setIdenti([]); setNapaka(`Identi niso pripravljeni. Zaženi skripto 027 in sinhroniziraj Identi.xlsx. ${i.reason?.message ?? i.reason}`); }
      if (m.status === "fulfilled") { setZaloga(m.value.material); if (!m.value.uvoz) setZalogaNapaka("Zaloga še ni uvožena. Materialni pregled prikazuje potrebe brez potrjene zaloge."); }
      else { setZaloga(new Map()); setZalogaNapaka(`Zaloge ni mogoče prebrati: ${m.reason?.message ?? m.reason}`); }
      setLoading(false);
    });
    // Obnovi kosovnici identov, izbranih pred osvežitvijo strani.
    preberiShranjeno().sifre.forEach((sifra, stran) => {
      if (!sifra) return;
      const st = zahteve.current[stran];
      const nastavi = (v: Izbor) => { if (zivo && zahteve.current[stran] === st) setIzbora(s => s.map((o, i) => i === stran ? v : o) as [Izbor, Izbor]); };
      naloziDrevo(sifra, lokalno).then(drevo => nastavi({ sifra, drevo, loading: false, napaka: "" }), e => nastavi({ sifra, drevo: null, loading: false, napaka: e instanceof Error ? e.message : String(e) }));
    });
    return () => { zivo = false; zahteve.current = zahteve.current.map(n => n + 1); };
  }, [lokalno]);
  async function izberi(stran: number, sifra: string) {
    const st = ++zahteve.current[stran];
    setPrimerjava(false);
    spremeni({ sifre: stran === 0 ? [sifra, izbora[1].sifra] : [izbora[0].sifra, sifra] });
    const nastavi = (v: Izbor) => setIzbora(s => s.map((o, i) => i === stran ? v : o) as [Izbor, Izbor]);
    nastavi({ sifra, drevo: null, loading: !!sifra, napaka: "" });
    if (!sifra) return;
    try {
      const drevo = await naloziDrevo(sifra, lokalno);
      if (zahteve.current[stran] === st) nastavi({ sifra, drevo, loading: false, napaka: "" });
    } catch (e) { if (zahteve.current[stran] === st) nastavi({ sifra, drevo: null, loading: false, napaka: e instanceof Error ? e.message : String(e) }); }
  }
  const [levo, desno] = izbora;
  const rezultat = useMemo(() => {
    if (!primerjava || nast.namen !== "pregled" || !levo.drevo || !desno.drevo) return null;
    const l = materialniPlan(levo.drevo, zaloga, upostevaj), d = materialniPlan(desno.drevo, zaloga, upostevaj);
    return { struktura: primerjajStrukturo(levo.drevo, desno.drevo), material: [...new Set([...l.keys(), ...d.keys()])].sort((a, b) => a.localeCompare(b, "sl", { numeric: true })).map(sifra => ({ sifra, naziv: (l.get(sifra) ?? d.get(sifra))!.naziv, levo: l.get(sifra), desno: d.get(sifra), zaloga: zaloga.get(sifra) })) };
  }, [primerjava, nast.namen, levo.drevo, desno.drevo, zaloga, upostevaj]);
  type MaterialRez = NonNullable<typeof rezultat>["material"][number];
  const sortMaterial = useRazvrscanje<MaterialRez, "sifra" | "naziv" | "em" | "zaloga" | "razpolozljiva" | "lPot" | "lPrev" | "lManj" | "dPot" | "dPrev" | "dManj" | "delta">({
    sifra: r => r.sifra, naziv: r => r.naziv, em: r => r.zaloga?.em ?? identi.find(i => i.sifra === r.sifra)?.em,
    zaloga: r => r.zaloga?.zaloga, razpolozljiva: r => r.zaloga?.razpolozljiva,
    lPot: r => r.levo?.potreba ?? 0, lPrev: r => r.levo?.prevzem ?? 0, lManj: r => r.levo?.manjka ?? 0,
    dPot: r => r.desno?.potreba ?? 0, dPrev: r => r.desno?.prevzem ?? 0, dManj: r => r.desno?.manjka ?? 0,
    delta: r => (r.desno?.potreba ?? 0) - (r.levo?.potreba ?? 0),
  });
  const sortStruktura = useRazvrscanje<NonNullable<typeof rezultat>["struktura"][number], "pot" | "sifra" | "naziv" | "levo" | "desno" | "delta">({ pot: r => r.pot, sifra: r => r.sifra, naziv: r => r.naziv, levo: r => r.levo, desno: r => r.desno, delta: r => r.desno - r.levo });
  const material = sortMaterial.razvrsti(rezultat?.material.filter(r => ujemaIskanje(iskanje, [r.sifra, r.naziv]) && (!samoRazlike || Math.abs((r.levo?.potreba ?? 0) - (r.desno?.potreba ?? 0)) > 1e-8 || Math.abs((r.levo?.prevzem ?? 0) - (r.desno?.prevzem ?? 0)) > 1e-8)) ?? []);
  const struktura = sortStruktura.razvrsti(rezultat?.struktura.filter(r => ujemaIskanje(iskanje, [r.sifra, r.naziv, r.pot])) ?? []);
  async function izvozi() {
    const XLSX = await import("xlsx");
    const rows = pogled === "struktura" ? struktura.map(r => ({ "Nadrejeni sestav": r.pot, "Šifra": r.sifra, "Naziv": r.naziv, [`IDENT 1 · ${levo.sifra}`]: r.levo, [`IDENT 2 · ${desno.sifra}`]: r.desno, "Razlika 2 − 1": r.desno - r.levo })) : material.map(r => ({ "Šifra": r.sifra, "Naziv": r.naziv, "EM": r.zaloga?.em ?? identi.find(i => i.sifra === r.sifra)?.em, "Zaloga matično": r.zaloga?.zaloga, "Razpoložljiva": r.zaloga?.razpolozljiva, "IDENT 1 potreba": r.levo?.potreba ?? 0, "IDENT 1 iz zaloge": r.levo?.prevzem ?? 0, "IDENT 1 manjka": r.levo?.manjka ?? 0, "IDENT 2 potreba": r.desno?.potreba ?? 0, "IDENT 2 iz zaloge": r.desno?.prevzem ?? 0, "IDENT 2 manjka": r.desno?.manjka ?? 0, "Razlika 2 − 1": (r.desno?.potreba ?? 0) - (r.levo?.potreba ?? 0) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Primerjava"); XLSX.writeFile(wb, `Primerjava_kosovnic_${pogled}.xlsx`);
  }
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start gap-3"><div className="min-w-[min(100%,18rem)] flex-1"><h2 className="text-xl font-bold">Primerjava kosovnic</h2><p className="text-sm text-ink-500">Izberi namen in dva identa, nato klikni Primerjaj.</p></div><PodatkiVir kljuci={["identi", "kosovnice", "material"]} /></div>
    {napaka && <ErrorText>{napaka}</ErrorText>}{zalogaNapaka && <WarningText>{zalogaNapaka}</WarningText>}
    {(lokalno || napaka) && <div className="fp-card flex flex-wrap items-center gap-3 p-3"><p className="min-w-[min(100%,18rem)] flex-1 text-sm text-ink-600">{lokalno ? "Lokalni predogled: identi in kosovnice iz mape data, zaloga iz baze. Predogled ne zapisuje v bazo in ni sync." : "Za testiranje pred izvedbo SQL je na lokalnem strežniku na voljo predogled datotek iz mape data."}</p><Button variant="neutral" hint={lokalno ? "Preklopi na sinhronizirane podatke iz baze" : "Odpri lokalna Excela brez sprememb baze"} onClick={zamenjajVir}>{lokalno ? "Podatki iz baze" : "Lokalni predogled Excelov"}</Button></div>}
    {opozorila.map(o => <WarningText key={o}>{o}</WarningText>)}
    <FilterVrstica><FilterPreklopnik label="Namen primerjave" value={nast.namen} onChange={v => spremeni({ namen: v })} options={[{ value: "pregled", label: "Pregled kosovnice", hint: "Primerjaj material in strukturo obeh kosovnic" }, { value: "predelava", label: "Predelava", hint: "Izračunaj material za predelavo enega identa v drugega" }]} /></FilterVrstica>
    {loading ? <Loading /> : <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <Okno naslov="IDENT 1" identi={identi} sifra={levo.sifra} onChange={v => void izberi(0, v)} drevo={levo.drevo} loading={levo.loading} napaka={levo.napaka} iskanjeKomponente={iskanjeKomponente} filtri={nast.filtri[0]} setFiltri={f => spremeni({ filtri: [{ ...nast.filtri[0], ...f }, nast.filtri[1]] })} />
      {/* Med oknoma: iskanje poravnano s filtri oken, gumb Primerjaj na sredini višine. Na telefonu pod oknoma. */}
      <div ref={iskalnikKomponent} className="order-last flex scroll-mt-20 flex-col items-center gap-3 lg:order-none lg:w-52 lg:pt-[41px]">
        <FilterIskanje label="Poišči komponento" value={iskanjeKomponente} onChange={setIskanjeKomponente} placeholder="Šifra, naziv, RISP ..." hint="Razkrij in rumeno označi najdene komponente" className="w-full sm:w-72 lg:w-full" />
        {iskanjeKomponente && <Button variant="neutral" hint="Počisti iskanje in povrni zložene nivoje" onClick={() => setIskanjeKomponente("")}>Počisti</Button>}
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-2">
          <IconButton variant="primary" icon={GitCompareArrows} className="h-12 w-12" hint={!levo.drevo || !desno.drevo ? "Najprej izberi oba identa s kosovnico" : nast.namen === "pregled" ? "Primerjaj material in strukturo obeh kosovnic" : "Izračunaj material za predelavo"} disabled={!levo.drevo || !desno.drevo || levo.loading || desno.loading} onClick={() => setPrimerjava(true)} />
          <span className="text-xs font-semibold text-ink-600">Primerjaj</span>
        </div>
      </div>
      <Okno naslov="IDENT 2" identi={identi} sifra={desno.sifra} onChange={v => void izberi(1, v)} drevo={desno.drevo} loading={desno.loading} napaka={desno.napaka} iskanjeKomponente={iskanjeKomponente} filtri={nast.filtri[1]} setFiltri={f => spremeni({ filtri: [nast.filtri[0], { ...nast.filtri[1], ...f }] })} />
    </div>}
    {primerjava && nast.namen === "predelava" && levo.drevo && desno.drevo && <PredelavaKosovnic ident1={levo.drevo} ident2={desno.drevo} zaloga={zaloga} poisci={poisciVStrukturi} />}
    {rezultat && <section className="fp-card min-w-0 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-start gap-3"><div className="min-w-[min(100%,18rem)] flex-1"><h3 className="font-bold">Primerjava · IDENT 1: {levo.sifra} ↔ IDENT 2: {desno.sifra}</h3><p className="text-xs text-ink-500">IDENT 1 in IDENT 2 sta alternativi. Zaloga se za vsako obračuna ločeno.</p></div><Izvoz formati={[{ koda: "xlsx", label: "Excel (.xlsx)", hint: "Prenesi prikazano primerjavo kosovnic v Excel", akcija: izvozi }]} /></div>
      <div className="mb-3"><FilterPreklopnik label="Pogled" value={pogled} onChange={setPogled} options={[{ value: "material", label: "Material za skladišče", hint: "Prikaži material brez dvojnega štetja sestavov" }, { value: "struktura", label: "Razlike v strukturi", hint: "Prikaži razlike pod posameznimi nadrejenimi sestavi" }]} /></div>
      <WarningText>{pogled === "material" ? "Za prevzem upoštevamo največ manjšo vrednost med matično in razpoložljivo zalogo (brez pričakovanih dobav). Razpoložljiv sestav pokrije svojo vejo; nepokriti del razvijemo. Predlog ne rezervira zaloge." : "Količine so preračunane na en končni izdelek. Ista šifra pod različnimi sestavi ostane prikazana ločeno."}</WarningText>
      <FilterVrstica className="my-3"><FilterIskanje value={iskanje} onChange={setIskanje} placeholder="Šifra, naziv ali sestav ..." hint="Poišči postavko v rezultatih primerjave" />{pogled === "material" && <><FilterCheckbox label="Samo razlike" checked={samoRazlike} onChange={setSamoRazlike} hint="Skrij material z enakimi potrebami obeh kosovnic" /><FilterCheckbox label="Upoštevaj zalogo" checked={upostevaj} onChange={setUpostevaj} hint="Odštej zalogo skladišča od potreb" info={<><p>Določa, ali tabela pokaže, kaj <b>manjka</b> (glede na skladišče), ali koliko materiala peč <b>potrebuje skupaj</b>.</p><p className="mt-1"><b>Vklopljeno:</b> od potreb se odšteje zaloga. Najprej se pogleda cel sestav: če so npr. vrata na zalogi, jih vzameš iz skladišča in njihovih delov v tabeli ni. Šele za količino, ki je zaloga ne pokrije, se sestav razgradi na dele, pri vsakem se spet odšteje zaloga. Stolpec Manjka pove, kaj je treba naročiti ali izdelati.</p><p className="mt-1"><b>Izklopljeno:</b> zaloga se ne upošteva - ne pri sestavih ne pri delih. Vsak sestav se razgradi do zadnjega nivoja in tabela pokaže celotno potrebo po materialu, kot da je skladišče prazno.</p></>} /></>}</FilterVrstica>
      <TabelaOkvir><table className="w-full text-xs [&_th]:px-2 [&_th]:py-1.5 [&_th]:whitespace-nowrap [&_td]:px-2 [&_td]:py-1 [&_tbody_tr]:border-b [&_tbody_tr]:border-ink-100 [&_tbody_tr:hover]:bg-ink-50"><thead className="fp-thead"><tr>{pogled === "material" ? <>{([["sifra","Šifra"],["naziv","Naziv"],["em","EM"],["zaloga","Matična"],["razpolozljiva","Razpoložljiva"],["lPot","IDENT 1 · potreba"],["lPrev","IDENT 1 · iz zaloge"],["lManj","IDENT 1 · manjka"],["dPot","IDENT 2 · potreba"],["dPrev","IDENT 2 · iz zaloge"],["dManj","IDENT 2 · manjka"],["delta","Razlika 2 − 1"]] as const).map(([k,t]) => <SortTh key={k} sort={sortMaterial} kljuc={k} desno={!["sifra","naziv","em"].includes(k)}>{t}</SortTh>)}</> : <>{([["pot","Nadrejeni sestav"],["sifra","Šifra"],["naziv","Naziv"],["levo","IDENT 1"],["desno","IDENT 2"],["delta","Razlika 2 − 1"]] as const).map(([k,t]) => <SortTh key={k} sort={sortStruktura} kljuc={k} desno={["levo","desno","delta"].includes(k)}>{t}</SortTh>)}</>}</tr></thead>
        <tbody>{pogled === "material" ? material.map(r => <tr key={r.sifra}><td title={[...(r.levo?.poti ?? []), ...(r.desno?.poti ?? [])].join("; ")}><button type="button" title="Poišči komponento v obeh kosovnicah" onClick={() => poisciVStrukturi(r.sifra)} className="font-mono font-semibold text-fines-600 underline decoration-dotted underline-offset-2 hover:text-fines-700">{r.sifra}</button>{!r.zaloga && <span className="text-xs text-warn-700">Ni podatka o zalogi</span>}</td><td className="min-w-48">{r.naziv}</td><td>{r.zaloga?.em ?? identi.find(i => i.sifra === r.sifra)?.em ?? "—"}</td><td className="text-right tabular-nums">{r.zaloga ? formatNum(r.zaloga.zaloga) : "—"}</td><td className="text-right tabular-nums">{r.zaloga ? formatNum(r.zaloga.razpolozljiva) : "—"}</td>{[r.levo, r.desno].map((p, i) => <MaterialCelice key={i} potreba={p?.potreba ?? 0} prevzem={p?.prevzem ?? 0} manjka={p?.manjka ?? 0} />)}<td className="text-right font-bold tabular-nums">{formatNum((r.desno?.potreba ?? 0) - (r.levo?.potreba ?? 0))}</td></tr>) : struktura.map(r => <tr key={`${r.pot}/${r.sifra}`}><td className="max-w-72 text-xs">{r.pot || "Končni izdelek"}</td><td><button type="button" title="Poišči komponento v obeh kosovnicah" onClick={() => poisciVStrukturi(r.sifra)} className="font-mono font-semibold text-fines-600 underline decoration-dotted underline-offset-2 hover:text-fines-700">{r.sifra}</button></td><td>{r.naziv}</td><td className="text-right tabular-nums">{formatNum(r.levo)}</td><td className="text-right tabular-nums">{formatNum(r.desno)}</td><td className="text-right font-bold tabular-nums">{formatNum(r.desno - r.levo)}</td></tr>)}</tbody>
      </table></TabelaOkvir>
      {(pogled === "material" ? material : struktura).length === 0 && <p className="p-6 text-center text-sm text-ink-500">Za trenutne filtre ni razlik oziroma postavk.</p>}
      <p className="mt-2 text-xs text-ink-500">Prikazano: {(pogled === "material" ? material : struktura).length} postavk · pozitivna razlika pomeni več materiala pri IDENTU 2.</p>
    </section>}
  </div>;
}
function MaterialCelice({ potreba, prevzem, manjka }: { potreba: number; prevzem: number; manjka: number }) {
  return <><td className="text-right tabular-nums">{formatNum(potreba)}</td><td className="text-right font-semibold text-ok-600 tabular-nums">{formatNum(prevzem)}</td><td className={`text-right font-semibold tabular-nums ${manjka > 1e-8 ? "text-nok-600" : "text-ink-400"}`}>{formatNum(manjka)}</td></>;
}
