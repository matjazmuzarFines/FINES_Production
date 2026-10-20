"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Clock, List, Loader2, LockOpen, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { AuditPorocilo } from "@/lib/auditPdf";
import { nazivOddelka, oddelekPoKodi, temaPoKodi } from "@/lib/auditSifranti";
import {
  PRAZNA_POLJA_AUDITA,
  PRILOGE_AUDITA,
  VRSTA,
  VRSTE,
  kljucPrilogAudita,
  manjkaZaShranjevanje,
  naloziAkcijeAuditov,
  naloziAudite,
  odprta,
  shraniAudit,
  skrijAudit,
  type Audit,
  type AuditAkcija,
  type AuditAkcijaVnos,
  type AuditPolja,
} from "@/lib/auditi";
import { formatShort, toIso } from "@/lib/dates";
import { compressImage } from "@/lib/images";
import { lahkoZapustim, useNeshranjeno } from "@/lib/neshranjeno";
import type { Priloga } from "@/lib/priloge";
import { Button } from "@/components/ui/Button";
import { FilterIzbira, FilterPolje } from "@/components/ui/Filtri";
import { ErrorText, Loading, WarningText } from "@/components/ui/Notice";
import { Izvoz, type IzvozFormat } from "@/components/ui/Izvoz";
import { useToast } from "@/components/ui/Toast";
import { Priloge } from "@/components/produktivnost/Priloge";
import { AuditAkcijaOkno, AuditAkcijeTabela, predlogiOdgovornih } from "./AuditAkcije";
import { AuditVodic } from "./AuditVodic";
import { PreverjanjeAkcij } from "./PreverjanjeAkcij";
import { useSifranti } from "./Sifranti";

const SEZNAM = "/management/auditi";
const KLJUC_IZVAJALCA = "fp-aud-izvajalec";
const kljucOsnutka = (id: number | null) => `fp-aud-osnutek-${id ?? "nov"}`;

/** Polja 40 px (na telefonu 44 px in pisava 16 px, da iPhone ob vnosu ne poveča strani). */
const POLJE =
  "h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-base focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 sm:h-10 sm:text-sm";

type Odsek = "PODATKI" | "UGOTOVITVE" | "VPRASANJA" | "ZAPISNIK" | "PRILOGE";

const izAudita = (a: Audit): AuditPolja => ({
  datum: a.datum,
  oddelek: a.oddelek,
  tema: a.tema,
  izvajalec: a.izvajalec,
  udelezenci: a.udelezenci,
  lokacija: a.lokacija,
  zapisnik: a.zapisnik,
  orodja: a.orodja,
});

const unikatno = (sez: string[]) => [...new Set(sez.filter(Boolean))].sort((a, b) => a.localeCompare(b, "sl"));

/** localStorage lahko ni na voljo (zasebno okno) - stran deluje tudi brez osnutka. */
function beri<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function pisi(k: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  } catch {
    /* brez osnutka */
  }
}

type Osnutek = { polja: AuditPolja; cas: number };

/** Izvedba audita: nov audit (id = null) ali obstoječ. */
export function AuditZapisnik({ id }: { id: number | null }) {
  const router = useRouter();
  const notify = useToast();
  const { s } = useSifranti();
  const zapisnikRef = useRef<HTMLTextAreaElement>(null);
  const kursorRef = useRef<number | null>(null);
  const kameraRef = useRef<HTMLInputElement>(null);
  const ustvarjanje = useRef<Promise<number> | null>(null);
  const danes = toIso(new Date());

  const [nalozeno, setNalozeno] = useState(false);
  const [napakaNalaganja, setNapakaNalaganja] = useState<string | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [vsiAuditi, setVsiAuditi] = useState<Audit[]>([]);
  const [akcije, setAkcije] = useState<AuditAkcija[]>([]);
  const [priloge, setPriloge] = useState<Priloga[]>([]);
  const [osnova, setOsnova] = useState<AuditPolja>({ ...PRAZNA_POLJA_AUDITA, datum: danes });
  const [polja, setPolja] = useState<AuditPolja>({ ...PRAZNA_POLJA_AUDITA, datum: danes });
  const [osnutek, setOsnutek] = useState<Osnutek | null>(null);
  const [shranjujem, setShranjujem] = useState(false);
  const [slikam, setSlikam] = useState(false);
  const [odsek, setOdsek] = useState<Odsek>(id === null ? "PODATKI" : "UGOTOVITVE");
  const [okno, setOkno] = useState<{ akcija: AuditAkcija | null; predlog?: Partial<AuditAkcijaVnos> } | null>(null);

  const spremenjena = (Object.keys(polja) as (keyof AuditPolja)[]).filter(
    (k) => JSON.stringify(polja[k]) !== JSON.stringify(osnova[k]),
  );
  const steviloSprememb = spremenjena.length;
  useNeshranjeno(steviloSprememb > 0);

  useEffect(() => {
    let preklic = false;
    Promise.all([naloziAudite(), naloziAkcijeAuditov()])
      .then(async ([auditi, a]) => {
        const g = id !== null ? (auditi.find((x) => x.id === id) ?? null) : null;
        const p = g ? await PRILOGE_AUDITA.nalozi(g.id) : [];
        if (preklic) return;
        setVsiAuditi(auditi);
        setAkcije(a);
        setPriloge(p);
        if (id !== null && !g) setNapakaNalaganja("Audit ne obstaja ali je bil odstranjen.");
        const zacetna = g ? izAudita(g) : { ...PRAZNA_POLJA_AUDITA, datum: toIso(new Date()), izvajalec: beri<string>(KLJUC_IZVAJALCA) ?? "" };
        if (g) setAudit(g);
        setOsnova(zacetna);
        setPolja(zacetna);
        // neshranjen osnutek z istega telefona / računalnika
        const o = beri<Osnutek>(kljucOsnutka(id));
        if (o && JSON.stringify(o.polja) !== JSON.stringify(zacetna)) setOsnutek(o);
        setNalozeno(true);
      })
      .catch((e) => {
        if (preklic) return;
        setNapakaNalaganja(e.message);
        notify("error", `Napaka pri nalaganju audita: ${e.message}`, 10000);
      });
    return () => {
      preklic = true;
    };
  }, [id, notify]);

  // osnutek v brskalniku (slab Wi-Fi, zaprt zavihek) - zbriše se ob shranjevanju
  const auditId = audit?.id ?? null;
  useEffect(() => {
    if (!nalozeno || osnutek) return;
    const t = setTimeout(() => pisi(kljucOsnutka(auditId), steviloSprememb ? { polja, cas: Date.now() } : null), 800);
    return () => clearTimeout(t);
  }, [polja, steviloSprememb, auditId, nalozeno, osnutek]);

  /** Nov audit dobi naslov z id, brez ponovnega nalaganja strani (časovnik teče naprej). */
  function prejel(g: Audit) {
    setAudit(g);
    setVsiAuditi((x) => [...x.filter((y) => y.id !== g.id), g]);
    if (g.izvajalec) pisi(KLJUC_IZVAJALCA, g.izvajalec);
    if (!audit) {
      pisi(kljucOsnutka(null), null);
      window.history.replaceState(null, "", `${SEZNAM}/${g.id}`);
    }
  }

  /** Audit mora obstajati, preden dodamo akcijo ali datoteko - ustvari ga (enkrat) s trenutnimi podatki. */
  function pridobiAuditId(): Promise<number> {
    if (audit) return Promise.resolve(audit.id);
    const manjka = manjkaZaShranjevanje(polja);
    if (manjka) return Promise.reject(new Error(manjka));
    ustvarjanje.current ??= shraniAudit(null, polja).then((g) => {
      prejel(g);
      setOsnova(izAudita(g));
      return g.id;
    });
    ustvarjanje.current.catch(() => (ustvarjanje.current = null));
    return ustvarjanje.current;
  }

  const nastavi = (p: Partial<AuditPolja>) => setPolja((x) => ({ ...x, ...p }));

  function vstavi(tekst: string) {
    const el = zapisnikRef.current;
    const t = polja.zapisnik;
    // Klik na gumb vzame fokus polju - vstavimo na zadnji položaj kurzorja (privzeto na konec).
    const poz = Math.min(kursorRef.current ?? t.length, t.length);
    const pred = t.slice(0, poz);
    const za = t.slice(poz);
    const zacetek = pred && !pred.endsWith("\n") ? "\n" : "";
    const nov = `${pred}${zacetek}${tekst}${za.startsWith("\n") || !za ? "" : "\n"}`;
    nastavi({ zapisnik: nov + za });
    const kursor = (pred + zacetek + tekst).length;
    kursorRef.current = kursor;
    // na telefonu je zapisnik na drugem zavihku - samo obvestilo
    if (window.matchMedia("(max-width: 1023px)").matches && odsek !== "ZAPISNIK") return notify("success", "Vstavljeno v zapisnik.");
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(kursor, kursor);
    });
  }

  async function shrani(status?: Audit["status"]) {
    const manjka = manjkaZaShranjevanje(polja);
    if (manjka) {
      setOdsek("PODATKI");
      return notify("error", manjka);
    }
    setShranjujem(true);
    try {
      const nov = !audit;
      const g = await shraniAudit(audit?.id ?? null, { ...polja, ...(status ? { status } : {}) });
      prejel(g);
      setOsnova(izAudita(g));
      setPolja(izAudita(g));
      pisi(kljucOsnutka(g.id), null);
      if (nov && odsek === "PODATKI") setOdsek("UGOTOVITVE");
      notify("success", status === "ZAKLJUCEN" ? "Audit je zaključen." : status === "OSNUTEK" ? "Audit je ponovno odprt." : "Audit je shranjen.");
    } catch (e) {
      notify("error", `Napaka pri shranjevanju: ${(e as Error).message}`, 10000);
    } finally {
      setShranjujem(false);
    }
  }

  async function odstrani() {
    if (!audit || !window.confirm("Odstranim audit s seznama? Skrite bodo tudi njegove akcije.")) return;
    try {
      await skrijAudit(audit.id);
      pisi(kljucOsnutka(audit.id), null);
      setOsnova(polja);
      notify("success", "Audit je odstranjen.");
      router.push(SEZNAM);
    } catch (e) {
      notify("error", `Napaka: ${(e as Error).message}`, 10000);
    }
  }

  async function osveziAkcije() {
    setAkcije(await naloziAkcijeAuditov());
    if (audit) setPriloge(await PRILOGE_AUDITA.nalozi(audit.id));
  }

  async function osveziPriloge() {
    const aid = await pridobiAuditId();
    setPriloge(await PRILOGE_AUDITA.nalozi(aid));
  }

  /** Hitra slika audita (spodnja vrstica): kamera telefona -> galerija prilog. */
  async function hitraSlika(files: File[]) {
    if (!files.length) return;
    setSlikam(true);
    try {
      const aid = await pridobiAuditId();
      for (const f of files) await PRILOGE_AUDITA.dodaj(aid, kljucPrilogAudita(polja.datum ?? danes), "SLIKA", await compressImage(f), f.name);
      setPriloge(await PRILOGE_AUDITA.nalozi(aid));
      notify("success", files.length > 1 ? `Dodanih slik: ${files.length}.` : "Slika je dodana med priloge.");
    } catch (e) {
      notify("error", `Slika ni naložena: ${(e as Error).message}`, 10000);
    } finally {
      setSlikam(false);
    }
  }

  function novaUgotovitev(predlog: Partial<AuditAkcijaVnos> = {}) {
    const manjka = manjkaZaShranjevanje(polja);
    if (manjka) {
      setOdsek("PODATKI");
      return notify("error", manjka);
    }
    setOkno({ akcija: null, predlog: { kategorija: polja.tema || null, ...predlog } });
  }

  function pojdi(href: string) {
    if (lahkoZapustim()) router.push(href);
  }

  const oddelek = oddelekPoKodi(s, polja.oddelek);
  const odgovorni = useMemo(
    () => predlogiOdgovornih(akcije, polja.oddelek, oddelek?.vodja ?? "", polja.izvajalec),
    [akcije, polja.oddelek, oddelek?.vodja, polja.izvajalec],
  );
  const izvajalci = useMemo(() => unikatno(vsiAuditi.map((a) => a.izvajalec)), [vsiAuditi]);
  const lokacije = useMemo(
    () => unikatno(vsiAuditi.filter((a) => !polja.oddelek || a.oddelek === polja.oddelek).map((a) => a.lokacija)),
    [vsiAuditi, polja.oddelek],
  );

  if (napakaNalaganja && !nalozeno) return <ErrorText className="mx-auto max-w-xl">{napakaNalaganja}</ErrorText>;
  if (!nalozeno) return <Loading />;
  if (napakaNalaganja) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3">
        <ErrorText className="w-full">{napakaNalaganja}</ErrorText>
        <Button hint="Nazaj na seznam auditov" variant="neutral" icon={List} onClick={() => router.push(SEZNAM)}>
          Seznam auditov
        </Button>
      </div>
    );
  }

  const tema = temaPoKodi(s, polja.oddelek, polja.tema);
  const oddelki = s.oddelki.filter((o) => o.aktiven || o.koda === polja.oddelek);
  const teme = (oddelek?.teme ?? []).filter((t) => t.aktivna || t.koda === polja.tema);
  const tegaAudita = audit ? akcije.filter((a) => a.audit_id === audit.id) : [];
  const odprtePrej = polja.oddelek ? akcije.filter((a) => a.oddelek === polja.oddelek && a.audit_id !== audit?.id && odprta(a)) : [];
  const zakljucen = audit?.status === "ZAKLJUCEN";
  const manjka = manjkaZaShranjevanje(polja);
  const splosnePriloge = priloge.filter((p) => !p.akcija_id);
  const kljucPrilog = kljucPrilogAudita(audit?.datum ?? polja.datum ?? danes);
  const poVrsti = VRSTE.map((v) => ({ v, n: tegaAudita.filter((a) => a.vrsta === v).length })).filter((x) => x.n);

  /** Podatki za PDF / e-mail (shranjeno stanje - izvoz je mogoč samo brez neshranjenih sprememb). */
  const porocilo = (): AuditPorocilo => ({
    sifranti: s,
    id: audit!.id,
    status: audit?.status ?? null,
    polja,
    akcijeAudita: tegaAudita,
    odprtePrej,
    priloge,
  });
  const brezIzvoza = !audit || steviloSprememb > 0;
  const zakajNe = !audit ? "Najprej shrani audit" : "Najprej shrani spremembe zapisnika";
  const izvozFormati: IzvozFormat[] = [
    {
      koda: "pdf",
      label: "PDF",
      hint: "Prenesi poročilo audita kot PDF",
      disabled: brezIzvoza,
      zakaj: zakajNe,
      akcija: async () => (await import("@/lib/auditPdf")).prenesiPdf(porocilo()),
    },
    {
      koda: "eml",
      label: "E-mail (Outlook)",
      hint: "Pripravi e-mail s PDF poročilom za Outlook",
      variant: "sync",
      disabled: brezIzvoza,
      zakaj: zakajNe,
      akcija: async () => (await import("@/lib/auditPdf")).pripraviEmail(porocilo()),
    },
  ];

  /** Na telefonu je viden samo izbran odsek, od lg naprej vsi. */
  const vidno = (o: Odsek) => (odsek === o ? "" : "max-lg:hidden");
  const zavihki: { o: Odsek; label: string; st?: number }[] = [
    { o: "PODATKI", label: "Podatki" },
    { o: "UGOTOVITVE", label: "Ugotovitve", st: tegaAudita.length + odprtePrej.length },
    { o: "VPRASANJA", label: "Vprašanja" },
    { o: "ZAPISNIK", label: "Zapisnik" },
    { o: "PRILOGE", label: "Priloge", st: splosnePriloge.length },
  ];

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:gap-4">
      {/* glava audita */}
      <div className="fp-card flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-ink-900 sm:text-2xl">{audit ? `Audit · ${nazivOddelka(s, audit.oddelek)}` : "Nov audit"}</h2>
            <span
              title={zakljucen ? "Audit je izveden in zapisnik zaključen" : audit ? "Zapisnik še ni zaključen" : "Audit še ni shranjen"}
              className={`rounded-full px-3 py-1 text-xs font-bold ${zakljucen ? "bg-ok-500 text-white" : audit ? "bg-warn-400 text-ink-900" : "bg-ink-100 text-ink-600"}`}
            >
              {zakljucen ? "Zaključen" : audit ? "V delu" : "Ni shranjeno"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            {polja.datum ? formatShort(polja.datum) : ""}
            {tema ? ` · ${tema.naziv}` : ""}
            {polja.izvajalec ? ` · ${polja.izvajalec}` : ""}
            <span className="hidden sm:inline"> · Management - gemba walk vodstva po oddelku</span>
          </p>
        </div>
        <Izvoz className="max-sm:hidden" spomin="audit" formati={izvozFormati} />
        <div className="flex flex-wrap gap-2 self-end">
          <Izvoz className="sm:hidden" label={null} kompakten spomin="audit" formati={izvozFormati} />
          <Button hint="Nazaj na seznam auditov" variant="neutral" icon={List} onClick={() => pojdi(SEZNAM)}>
            <span className="hidden sm:inline">Seznam</span>
          </Button>
          {zakljucen ? (
            <Button hint="Ponovno odpri zaključen audit" variant="primary" icon={LockOpen} disabled={shranjujem} onClick={() => shrani("OSNUTEK")}>
              <span className="hidden sm:inline">Ponovno odpri</span>
            </Button>
          ) : (
            <Button hint={manjka ?? "Shrani in zaključi zapisnik audita"} variant="success" icon={CheckCircle2} disabled={shranjujem || !!manjka} onClick={() => shrani("ZAKLJUCEN")}>
              Zaključi
            </Button>
          )}
          {audit && (
            <Button hint="Odstrani audit s seznama auditov" variant="danger" icon={Trash2} disabled={shranjujem} onClick={odstrani}>
              <span className="hidden sm:inline">Odstrani</span>
            </Button>
          )}
        </div>
      </div>

      {osnutek && (
        <WarningText>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              Najden neshranjen osnutek ({new Date(osnutek.cas).toLocaleDateString("sl-SI")} ob{" "}
              {new Date(osnutek.cas).toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}) - podatki niso bili shranjeni.
            </span>
            <Button
              hint="Obnovi neshranjene podatke osnutka"
              variant="primary"
              icon={RotateCcw}
              onClick={() => {
                setPolja(osnutek.polja);
                setOsnutek(null);
              }}
            >
              Obnovi
            </Button>
            <Button
              hint="Zavrzi neshranjen osnutek"
              variant="danger"
              icon={Trash2}
              onClick={() => {
                pisi(kljucOsnutka(audit?.id ?? id), null);
                setOsnutek(null);
              }}
            >
              Zavrzi
            </Button>
          </div>
        </WarningText>
      )}

      {/* zavihki na telefonu / tablici */}
      <nav aria-label="Deli audita" className="sticky top-[68px] z-20 -mx-3 flex gap-1.5 overflow-x-auto bg-ink-50/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        {zavihki.map((z) => (
          <button
            key={z.o}
            type="button"
            title={`Prikaži: ${z.label}`}
            aria-pressed={odsek === z.o}
            onClick={() => setOdsek(z.o)}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${
              odsek === z.o ? "border-fines-500 bg-fines-500 text-white" : "border-ink-200 bg-white text-ink-700"
            }`}
          >
            {z.label}
            {!!z.st && <span className={`rounded-full px-1.5 text-xs tabular-nums ${odsek === z.o ? "bg-white/25" : "bg-ink-100"}`}>{z.st}</span>}
          </button>
        ))}
      </nav>

      {/* podatki audita */}
      <div className={`fp-card flex flex-col gap-3 p-3 sm:p-4 ${vidno("PODATKI")}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <FilterPolje label="Datum *" className="lg:w-40">
            <input type="date" value={polja.datum ?? ""} onChange={(e) => nastavi({ datum: e.target.value || null })} title="Dan, ko je bil audit izveden" className={POLJE} />
          </FilterPolje>
          <FilterIzbira
            label="Oddelek *"
            hint="Izberi oddelek, v katerem poteka audit"
            value={polja.oddelek}
            options={[{ value: "", label: "- izberi oddelek -" }, ...oddelki.map((o) => ({ value: o.koda, label: o.naziv }))]}
            onChange={(v) => nastavi({ oddelek: v, tema: v === polja.oddelek ? polja.tema : "" })}
            className="[&>select]:h-11 [&>select]:w-full [&>select]:text-base sm:[&>select]:h-10 sm:[&>select]:text-sm"
          />
          <FilterIzbira
            label="Tema"
            hint={oddelek ? "Izberi temo audita (neobvezno)" : "Najprej izberi oddelek"}
            value={polja.tema}
            options={[{ value: "", label: oddelek ? "- vse teme oddelka -" : "- najprej oddelek -" }, ...teme.map((t) => ({ value: t.koda, label: t.naziv }))]}
            onChange={(v) => nastavi({ tema: v })}
            className="[&>select]:h-11 [&>select]:w-full [&>select]:text-base sm:[&>select]:h-10 sm:[&>select]:text-sm"
          />
          <FilterPolje label="Področje / delovno mesto" className="lg:w-64">
            <input
              value={polja.lokacija}
              onChange={(e) => nastavi({ lokacija: e.target.value })}
              list="fp-aud-lokacije"
              placeholder={oddelek?.podrocje || "npr. Montažna linija 1"}
              title="Kje je potekal audit"
              className={POLJE}
            />
            <datalist id="fp-aud-lokacije">
              {lokacije.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </FilterPolje>
          <FilterPolje label="Izvajalec" className="lg:w-52">
            <input value={polja.izvajalec} onChange={(e) => nastavi({ izvajalec: e.target.value })} list="fp-aud-izvajalci" placeholder="Ime vodje" title="Kdo izvaja audit" className={POLJE} />
            <datalist id="fp-aud-izvajalci">
              {izvajalci.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </FilterPolje>
          <FilterPolje label="Udeleženci" className="lg:w-72">
            <input
              value={polja.udelezenci}
              onChange={(e) => nastavi({ udelezenci: e.target.value })}
              placeholder={oddelek?.vodja ? `npr. ${oddelek.vodja}` : "npr. vodja oddelka, tehnolog"}
              title="Kdo je sodeloval na auditu"
              className={POLJE}
            />
          </FilterPolje>
        </div>
        {!polja.oddelek && <WarningText>Izberi oddelek - brez datuma in oddelka audita ni mogoče shraniti.</WarningText>}
        {oddelek && (
          <p className="flex items-start gap-2 text-sm text-ink-600">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: oddelek.barva }} />
            <span>
              <strong className="text-ink-800">{oddelek.naziv}:</strong> {oddelek.opis}
              {oddelek.vodja && <> Vodja: {oddelek.vodja}.</>}
              {tema && (
                <>
                  {" "}
                  <strong className="text-ink-800">Tema:</strong> {tema.opis}
                </>
              )}
            </span>
          </p>
        )}
        {!audit && (
          <Button hint={manjka ?? "Shrani audit in začni z ugotovitvami"} variant="success" icon={Save} size="lg" disabled={!!manjka || shranjujem} onClick={() => shrani()} className="lg:hidden">
            Začni audit
          </Button>
        )}
      </div>

      {/* zapisnik + vodič */}
      <div className={`grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px] ${odsek === "ZAPISNIK" || odsek === "VPRASANJA" ? "" : "max-lg:hidden"}`}>
        <section className={`fp-card flex flex-col gap-2 p-3 sm:p-4 ${vidno("ZAPISNIK")}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex-1 text-lg font-bold text-ink-900">Zapisnik</h3>
            <Button
              hint="Vstavi trenutno uro v zapisnik"
              variant="primary"
              icon={Clock}
              onClick={() => vstavi(`[${new Date().toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}] `)}
            >
              Ura
            </Button>
          </div>
          <textarea
            ref={zapisnikRef}
            value={polja.zapisnik}
            onChange={(e) => nastavi({ zapisnik: e.target.value })}
            onSelect={(e) => (kursorRef.current = e.currentTarget.selectionStart)}
            placeholder={"Zapisuj dejstva: kaj, kje, kolikokrat.\n\nUgotovitve, ki potrebujejo ukrep, dodaj z gumbom + Ugotovitev.\nVprašanja (klik na + jih vstavi sem), vodič in orodja so na zavihku Vprašanja."}
            title="Zapisnik audita"
            className="min-h-[50dvh] w-full resize-y rounded-lg border border-ink-200 p-3 font-[inherit] text-base leading-relaxed focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 sm:text-sm lg:min-h-[calc(100dvh-16rem)]"
          />
          <p className="text-right text-xs text-ink-400">{polja.zapisnik.length} znakov</p>
        </section>

        <aside className={`lg:sticky lg:top-20 ${vidno("VPRASANJA")}`}>
          <AuditVodic polja={polja} nastavi={nastavi} onVstavi={vstavi} onUkrep={(t, u) => novaUgotovitev({ kategorija: t, ukrep: u })} />
        </aside>
      </div>

      {/* ugotovitve in akcije */}
      <section className={`fp-card flex flex-col gap-3 p-3 sm:p-4 ${vidno("UGOTOVITVE")}`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-ink-900">Ugotovitve in akcije</h3>
            <p className="text-sm text-ink-500">
              {poVrsti.length ? poVrsti.map((x) => `${VRSTA[x.v].kratko} ${x.n}`).join(" · ") : "Na obhodu zapiši 1-3 najpomembnejše ugotovitve in vsaj eno dobro prakso."}
            </p>
          </div>
          <Button hint={manjka ?? "Dodaj novo ugotovitev ali akcijo"} variant="success" icon={Plus} disabled={!!manjka} onClick={() => novaUgotovitev()} className="max-lg:hidden">
            Ugotovitev
          </Button>
        </div>
        <AuditAkcijeTabela
          skupine={[{ naslov: "Ugotovitve tega audita", opis: polja.datum ? `zapisane ${formatShort(polja.datum)}` : "", akcije: tegaAudita }]}
          danes={danes}
          brezOddelka
          onOdpri={(a) => setOkno({ akcija: a })}
          prazno="Ni ugotovitev. Klikni + Ugotovitev spodaj."
        />
      </section>

      {polja.oddelek && (
        <section className={`fp-card flex flex-col gap-3 p-3 sm:p-4 ${vidno("UGOTOVITVE")}`}>
          <div>
            <h3 className="text-lg font-bold text-ink-900">Preveri odprte akcije oddelka ({odprtePrej.length})</h3>
            <p className="text-sm text-ink-500">Iz prejšnjih auditov oddelka {oddelek?.naziv}. Na mestu preveri in z enim klikom zapiši stanje.</p>
          </div>
          <PreverjanjeAkcij akcije={odprtePrej} danes={danes} onOdpri={(a) => setOkno({ akcija: a })} onSpremenjeno={() => osveziAkcije().catch((e) => notify("error", e.message))} />
        </section>
      )}

      <div className={vidno("PRILOGE")}>
        <Priloge
          vir={PRILOGE_AUDITA}
          kljuc={kljucPrilog}
          pridobiId={pridobiAuditId}
          priloge={splosnePriloge}
          onSpremenjeno={osveziPriloge}
          label="Priloge audita"
          opisSkic="Tloris področja, poti, označbe, predlog nove postavitve ..."
        />
      </div>

      {/* spodnja vrstica: hitra slika, nova ugotovitev, shrani */}
      <div className="sticky bottom-0 z-30 -mx-3 mt-2 border-t border-ink-200 bg-white/95 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="hidden flex-1 text-sm text-ink-600 sm:block">
            {steviloSprememb > 0 ? <strong className="text-warn-700">Neshranjene spremembe: {steviloSprememb}</strong> : "Ni neshranjenih sprememb"}
          </span>
          <Button
            hint={manjka ?? "Slikaj in dodaj sliko med priloge audita"}
            variant="success"
            icon={slikam ? Loader2 : Camera}
            size="lg"
            disabled={!!manjka || slikam}
            onClick={() => kameraRef.current?.click()}
            className={slikam ? "[&>svg]:animate-spin" : ""}
          >
            <span className="hidden sm:inline">Slika</span>
          </Button>
          <Button hint={manjka ?? "Dodaj novo ugotovitev ali akcijo"} variant="success" icon={Plus} size="lg" disabled={!!manjka} onClick={() => novaUgotovitev()} className="flex-1 sm:flex-none">
            Ugotovitev
          </Button>
          {steviloSprememb > 0 && (
            <Button hint="Zavrzi neshranjene spremembe" variant="neutral" icon={RotateCcw} size="lg" disabled={shranjujem} onClick={() => setPolja(osnova)} className="max-sm:hidden">
              Prekliči
            </Button>
          )}
          <Button
            hint="Shrani zapisnik in podatke audita"
            variant="success"
            icon={Save}
            size="lg"
            disabled={(steviloSprememb === 0 && !!audit) || shranjujem || !!manjka}
            onClick={() => shrani()}
            className="relative"
          >
            <span className="hidden sm:inline">{shranjujem ? "Shranjujem ..." : "Shrani"}</span>
            {steviloSprememb > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-warn-400 px-1 text-[11px] font-bold text-ink-900 sm:hidden">
                {steviloSprememb}
              </span>
            )}
          </Button>
        </div>
        <input
          ref={kameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            hitraSlika([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {okno && (
        <AuditAkcijaOkno
          akcija={okno.akcija}
          oddelek={polja.oddelek}
          datumAudita={polja.datum}
          predlog={okno.predlog}
          odgovorni={odgovorni}
          pridobiAuditId={pridobiAuditId}
          onClose={() => setOkno(null)}
          onShranjeno={() => {
            setOkno(null);
            osveziAkcije().catch((e) => notify("error", e.message));
          }}
        />
      )}
    </div>
  );
}

