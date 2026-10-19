"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileDown, LockOpen, Mail, Plus } from "lucide-react";
import type { GembaPorocilo } from "@/lib/gembaPdf";
import { addDays, isoWeek, mondayOf, toIso, type IsoDate } from "@/lib/dates";
import { IZGUBE, izgubaPoKodi, predlogTeme } from "@/lib/gembaVodic";
import { lahkoZapustim, useNeshranjeno } from "@/lib/neshranjeno";
import {
  PRAZNA_POLJA,
  PRILOGE_GEMBE,
  akcijaOdprta,
  formatEur,
  prihranekAkcije,
  letoTedna,
  naloziAkcije,
  naloziGembe,
  naloziNastavitve,
  naloziPriloge,
  obdobjeTedna,
  kljucPrilogGembe,
  shraniGembo,
  type Akcija,
  type AkcijaVnos,
  type Gemba,
  type GembaPolja,
  type Nastavitve,
  type Priloga,
} from "@/lib/produktivnost";
import { supabaseConfigured } from "@/lib/supabase";
import { Button, IconButton } from "@/components/ui/Button";
import { FilterIzbira, FilterPolje, FilterVrstica } from "@/components/ui/Filtri";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { SaveBar } from "@/components/rutina/SaveBar";
import { AkcijaOkno, AkcijeTabela } from "./Akcije";
import { GembaVodic } from "./GembaVodic";
import { Priloge } from "./Priloge";

const KOLEDAR = "/proizvodnja/rutina/produktivnost";
const MAX_ODPRTIH = 3;

const POLJE =
  "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

const izGembe = (g: Gemba | null): GembaPolja =>
  g
    ? {
        datum: g.datum,
        udelezenci: g.udelezenci,
        lokacija: g.lokacija,
        tema: g.tema,
        zapisnik: g.zapisnik,
        orodja: g.orodja,
        kpi_ure: g.kpi_ure,
        kpi_kosi: g.kpi_kosi,
      }
    : PRAZNA_POLJA;

/** Okrogel gumb izvoza; med pripravo se vrti (oranžen = PDF, moder = e-mail v Outlooku). */
export function IzvozGumb({
  hint,
  icon,
  variant = "primary",
  disabled,
  akcija,
}: {
  hint: string;
  icon: typeof FileDown;
  variant?: "primary" | "sync";
  disabled?: boolean;
  akcija: () => Promise<void>;
}) {
  const notify = useToast();
  const [delam, setDelam] = useState(false);
  return (
    <IconButton
      hint={hint}
      icon={icon}
      variant={variant}
      disabled={disabled || delam}
      delam={delam}
      onClick={async () => {
        setDelam(true);
        try {
          await akcija();
        } catch (e) {
          notify("error", `Ni uspelo: ${(e as Error).message}`, 10000);
        } finally {
          setDelam(false);
        }
      }}
    />
  );
}

export function GembaZapisnik({ teden }: { teden: IsoDate }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <GembaZapisnikInner teden={teden} />;
}

function GembaZapisnikInner({ teden }: { teden: IsoDate }) {
  const router = useRouter();
  const notify = useToast();
  const zapisnikRef = useRef<HTMLTextAreaElement>(null);
  const kursorRef = useRef<number | null>(null);
  const ustvarjanje = useRef<Promise<number> | null>(null);

  const [gemba, setGemba] = useState<Gemba | null>(null);
  const [vseGembe, setVseGembe] = useState<Gemba[]>([]);
  const [akcije, setAkcije] = useState<Akcija[]>([]);
  const [priloge, setPriloge] = useState<Priloga[]>([]);
  const [nastavitve, setNastavitve] = useState<Nastavitve | null>(null);
  const [osnova, setOsnova] = useState<GembaPolja>(PRAZNA_POLJA);
  const [polja, setPolja] = useState<GembaPolja>(PRAZNA_POLJA);
  const [shranjujem, setShranjujem] = useState(false);
  const [okno, setOkno] = useState<{ akcija: Akcija | null; predlog?: Partial<AkcijaVnos> } | null>(null);

  const spremenjena = (Object.keys(polja) as (keyof GembaPolja)[]).filter(
    (k) => JSON.stringify(polja[k]) !== JSON.stringify(osnova[k]),
  );
  useNeshranjeno(spremenjena.length > 0);

  useEffect(() => {
    let preklic = false;
    Promise.all([naloziGembe(), naloziAkcije(), naloziNastavitve()])
      .then(async ([gembe, a, n]) => {
        const g = gembe.find((x) => x.teden === teden) ?? null;
        const p = g ? await naloziPriloge(g.id) : [];
        if (preklic) return;
        setVseGembe(gembe);
        setGemba(g);
        setAkcije(a);
        setNastavitve(n);
        setPriloge(p);
        setOsnova(izGembe(g));
        setPolja(izGembe(g));
      })
      .catch((e) => notify("error", `Napaka pri nalaganju gembe: ${e.message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [teden, notify]);

  const danes = toIso(new Date());
  const stTedna = isoWeek(teden);
  const predlog = predlogTeme(stTedna);

  /** Gemba mora obstajati, preden dodamo akcijo ali datoteko - ustvari jo (enkrat). */
  function pridobiGembaId(): Promise<number> {
    if (gemba) return Promise.resolve(gemba.id);
    ustvarjanje.current ??= shraniGembo(teden, null, {}).then((g) => {
      setGemba(g);
      setVseGembe((s) => [...s, g]);
      return g.id;
    });
    ustvarjanje.current.catch(() => (ustvarjanje.current = null));
    return ustvarjanje.current;
  }

  const nastavi = (p: Partial<GembaPolja>) => setPolja((s) => ({ ...s, ...p }));

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
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(kursor, kursor);
    });
  }

  async function shrani(status?: Gemba["status"]) {
    setShranjujem(true);
    try {
      const g = await shraniGembo(teden, gemba?.id ?? null, { ...polja, ...(status ? { status } : {}) });
      setGemba(g);
      setVseGembe((s) => [...s.filter((x) => x.id !== g.id), g]);
      setOsnova(izGembe(g));
      setPolja(izGembe(g));
      notify(
        "success",
        status === "ZAKLJUCEN" ? "Gemba je zaključena." : status === "OSNUTEK" ? "Gemba je ponovno odprta." : "Zapisnik je shranjen.",
      );
    } catch (e) {
      notify("error", `Napaka pri shranjevanju: ${(e as Error).message}`, 10000);
    } finally {
      setShranjujem(false);
    }
  }

  async function osveziAkcije() {
    setAkcije(await naloziAkcije());
  }

  async function osveziPriloge() {
    const id = await pridobiGembaId();
    setPriloge(await naloziPriloge(id));
  }

  function pojdi(href: string) {
    if (lahkoZapustim()) router.push(href);
  }

  const odgovorni = useMemo(() => [...new Set(akcije.map((a) => a.odgovoren).filter((x): x is string => !!x))].sort(), [akcije]);
  const lokacije = useMemo(() => [...new Set(vseGembe.map((g) => g.lokacija).filter(Boolean))].sort(), [vseGembe]);

  if (!nastavitve) return <Loading />;

  const tegaTedna = gemba ? akcije.filter((a) => a.gemba_id === gemba.id) : [];
  const odprtePrej = akcije.filter((a) => a.teden < teden && akcijaOdprta(a));
  const odprtih = akcije.filter(akcijaOdprta).length;
  const prihranekTedna = tegaTedna
    .filter((a) => a.status !== "OPUSCENO")
    .reduce((s, a) => s + (prihranekAkcije(a, nastavitve).eurLeto ?? 0), 0);
  const zakljucen = gemba?.status === "ZAKLJUCEN";

  /** Podatki za PDF / e-mail (shranjeno stanje - izvoz je mogoč samo brez neshranjenih sprememb). */
  const porocilo = (): GembaPorocilo => ({
    teden,
    status: gemba?.status ?? null,
    polja,
    akcijeTedna: tegaTedna,
    odprtePrej,
    priloge,
    nastavitve,
  });

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      {/* glava tedna */}
      <div className="fp-card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-ink-900 sm:text-2xl">Gemba walk · {stTedna}. teden</h2>
            <span
              title={zakljucen ? "Gemba je izvedena in zapisnik zaključen" : gemba ? "Zapisnik še ni zaključen" : "Za ta teden še ni zapisnika"}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                zakljucen ? "bg-ok-500 text-white" : gemba ? "bg-warn-400 text-ink-900" : "bg-ink-100 text-ink-600"
              }`}
            >
              {zakljucen ? "Zaključena" : gemba ? "V delu" : "Ni začeto"}
            </span>
            {teden === mondayOf(danes) && (
              <span className="rounded-full bg-sync-500 px-2.5 py-0.5 text-xs font-bold text-white">Ta teden</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            {obdobjeTedna(teden)} {letoTedna(teden)} · Produktivnost - tedenski sprehod po montaži z vodjo
          </p>
        </div>
        <FilterPolje label="Izvoz">
          <div className="flex gap-2">
            <IzvozGumb
              hint={spremenjena.length ? "Najprej shrani spremembe zapisnika" : "Prenesi poročilo gembe kot PDF"}
              icon={FileDown}
              disabled={!gemba || spremenjena.length > 0}
              akcija={async () => (await import("@/lib/gembaPdf")).prenesiPdf(porocilo())}
            />
            <IzvozGumb
              hint={spremenjena.length ? "Najprej shrani spremembe zapisnika" : "Pripravi e-mail s PDF poročilom za Outlook"}
              icon={Mail}
              variant="sync"
              disabled={!gemba || spremenjena.length > 0}
              akcija={async () => (await import("@/lib/gembaPdf")).pripraviEmail(porocilo())}
            />
          </div>
        </FilterPolje>
        <div className="flex flex-wrap gap-2 self-end">
          <IconButton hint="Prejšnji teden" variant="neutral" icon={ChevronLeft} onClick={() => pojdi(`${KOLEDAR}/${addDays(teden, -7)}`)} />
          <IconButton hint="Naslednji teden" variant="neutral" icon={ChevronRight} onClick={() => pojdi(`${KOLEDAR}/${addDays(teden, 7)}`)} />
          <Button hint="Nazaj na koledar tednov" variant="neutral" icon={CalendarDays} onClick={() => pojdi(`${KOLEDAR}?mesec=${teden.slice(0, 7)}`)}>
            Koledar
          </Button>
          {zakljucen ? (
            <Button hint="Ponovno odpri zaključeno gembo" variant="primary" icon={LockOpen} disabled={shranjujem} onClick={() => shrani("OSNUTEK")}>
              Ponovno odpri
            </Button>
          ) : (
            <Button hint="Shrani in zaključi zapisnik gembe" variant="success" icon={CheckCircle2} disabled={shranjujem} onClick={() => shrani("ZAKLJUCEN")}>
              Zaključi gembo
            </Button>
          )}
        </div>
      </div>

      {/* podatki gembe */}
      <div className="fp-card p-3 sm:p-4">
        <FilterVrstica>
          <FilterPolje label="Datum izvedbe" className="w-40">
            <input
              type="date"
              value={polja.datum ?? ""}
              min={teden}
              max={addDays(teden, 6)}
              onChange={(e) => nastavi({ datum: e.target.value || null })}
              title="Dan, ko je bila gemba izvedena"
              className={POLJE}
            />
          </FilterPolje>
          <FilterPolje label="Celica / družina izdelkov" className="w-full sm:w-64">
            <input
              value={polja.lokacija}
              onChange={(e) => nastavi({ lokacija: e.target.value })}
              list="fp-prod-lokacije"
              placeholder="npr. Montaža - linija 1"
              title="Kje je potekalo opazovanje"
              className={POLJE}
            />
            <datalist id="fp-prod-lokacije">
              {lokacije.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </FilterPolje>
          <FilterPolje label="Udeleženci" className="w-full sm:w-72">
            <input
              value={polja.udelezenci}
              onChange={(e) => nastavi({ udelezenci: e.target.value })}
              placeholder="npr. vodja montaže, vodja proizvodnje"
              title="Kdo je sodeloval na gembi"
              className={POLJE}
            />
          </FilterPolje>
          <FilterIzbira
            label="Tema tedna (ena izguba)"
            hint="Izberi temo opazovanja za ta teden"
            value={polja.tema}
            options={[{ value: "", label: "- izberi temo -" }, ...IZGUBE.map((i) => ({ value: i.koda, label: i.naziv }))]}
            onChange={(v) => nastavi({ tema: v })}
          />
          {!polja.tema && (
            <FilterPolje>
              <button
                type="button"
                title="Predlagana tema po vrstnem redu - vsak teden druga izguba"
                onClick={() => nastavi({ tema: predlog.koda })}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-dashed border-ink-300 bg-white px-3 text-sm text-ink-600 hover:border-fines-500 hover:text-fines-600"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: predlog.barva }} />
                Predlog: {predlog.naziv}
              </button>
            </FilterPolje>
          )}
        </FilterVrstica>
        {izgubaPoKodi(polja.tema) && <p className="mt-2 text-sm text-ink-600">{izgubaPoKodi(polja.tema)!.opis}</p>}
      </div>

      {/* zapisnik + vodič */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="fp-card flex flex-col gap-2 p-3 sm:p-4">
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
            placeholder={
              "Zapisuj dejstva: kaj, kolikokrat, koliko časa.\n\nDesno so vodič, vprašanja (klik na + jih vstavi sem) in orodja (štoparica, števci, kalkulator prihranka).\nTabla za skiciranje, slike in povpraševanja so spodaj."
            }
            title="Zapisnik gembe"
            className="min-h-[28rem] w-full resize-y rounded-lg border border-ink-200 p-3 font-[inherit] text-sm leading-relaxed focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 lg:min-h-[calc(100dvh-16rem)]"
          />
          <p className="text-right text-xs text-ink-400">{polja.zapisnik.length} znakov</p>
        </section>

        <aside className="lg:sticky lg:top-20">
          <GembaVodic
            polja={polja}
            nastavi={nastavi}
            nastavitve={nastavitve}
            onVstavi={vstavi}
            onNovaAkcija={(prihranek) =>
              setOkno({ akcija: null, predlog: { ...prihranek, kategorija: polja.tema || null } })
            }
          />
        </aside>
      </div>

      {/* tabla izboljšav */}
      <section className="fp-card flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-ink-900">Tabla izboljšav</h3>
            <p className="text-sm text-ink-500">
              Nove akcije tega tedna in odprte akcije prejšnjih tednov (preveri jih na gembi).
              {prihranekTedna > 0 && (
                <>
                  {" "}Ocena prihranka akcij tega tedna: <strong className="text-ink-800">{formatEur(prihranekTedna)} / leto</strong>.
                </>
              )}
            </p>
          </div>
          <Button
            hint="Dodaj novo akcijo na tablo izboljšav"
            variant="success"
            icon={Plus}
            onClick={() => setOkno({ akcija: null, predlog: { kategorija: polja.tema || null } })}
          >
            Nova akcija
          </Button>
        </div>
        {odprtih > MAX_ODPRTIH && (
          <WarningText>
            Odprtih akcij je {odprtih} (priporočeno največ {MAX_ODPRTIH}). Najprej dokončaj in preveri obstoječe, nato odpri nove.
          </WarningText>
        )}
        <AkcijeTabela
          skupine={[
            { naslov: "Nove akcije tega tedna", opis: `zapisane na gembi T${stTedna}`, akcije: tegaTedna },
            { naslov: "Odprte iz prejšnjih tednov", opis: "preveri stanje na gembi", akcije: odprtePrej },
          ]}
          danes={danes}
          nastavitve={nastavitve}
          onOdpri={(a) => setOkno({ akcija: a })}
          prazno="Ni akcij. Na gembi izberi 1-3 najpomembnejše izgube in jih dodaj kot akcije."
        />
      </section>

      <Priloge vir={PRILOGE_GEMBE} kljuc={kljucPrilogGembe(teden)} pridobiId={pridobiGembaId} priloge={priloge} onSpremenjeno={osveziPriloge} />

      <SaveBar
        steviloSprememb={spremenjena.length}
        shranjujem={shranjujem}
        onSave={() => shrani()}
        onReset={() => setPolja(osnova)}
        shraniLabel="Shrani zapisnik"
        shraniHint="Shrani zapisnik in podatke gembe"
      />

      {okno && (
        <AkcijaOkno
          akcija={okno.akcija}
          predlog={okno.predlog}
          odgovorni={odgovorni}
          nastavitve={nastavitve}
          pridobiGembaId={pridobiGembaId}
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
