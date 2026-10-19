"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Building2, Check, ChevronDown, CircleHelp, List, Pencil, Plus, Save, Target, Trash2, X } from "lucide-react";
import {
  PRIVZETE_NASTAVITVE,
  dodajPostavko,
  novRed,
  novaKoda,
  posodobiPostavko,
  shraniNastavitve,
  shraniOddelek,
  shraniTemo,
  type AuditNastavitve,
  type Oddelek,
  type Postavka,
  type SkupinaPostavke,
  type Tema,
} from "@/lib/auditSifranti";
import { formatVnos, parseNum } from "@/lib/stevila";
import { Button, IconButton } from "@/components/ui/Button";
import { FilterPolje } from "@/components/ui/Filtri";
import { Modal } from "@/components/ui/Modal";
import { ErrorText, WarningText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { Zavihki } from "@/components/ui/Zavihki";
import { useSifranti } from "./Sifranti";

type Pogled = "ODDELKI" | "TEME" | "CILJI";

const POLJE =
  "h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-base focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 disabled:bg-ink-100 sm:h-10 sm:text-sm";

const BARVE = ["#2563eb", "#7c4dcc", "#15803d", "#0d9488", "#be123c", "#a16207", "#ca5010", "#4d4d53", "#0891b2", "#db2777"];

/** Nov vrstni red po premiku za eno mesto gor / dol (10, 20, 30 ...); vrne samo spremenjene. */
function premik<T extends { vrstni_red: number }>(sez: T[], i: number, smer: -1 | 1): { x: T; red: number }[] {
  const j = i + smer;
  if (j < 0 || j >= sez.length) return [];
  const nov = [...sez];
  [nov[i], nov[j]] = [nov[j], nov[i]];
  return nov.map((x, k) => ({ x, red: (k + 1) * 10 })).filter(({ x, red }) => x.vrstni_red !== red);
}

/** Stran Nastavitve auditov: oddelki in vodje, teme z vprašanji in tipičnimi ukrepi, cilji in roki. */
export function AuditNastavitve() {
  const router = useRouter();
  const { s } = useSifranti();
  const [pogled, setPogled] = useState<Pogled>("ODDELKI");

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Nastavitve auditov</h2>
          <p className="text-sm text-ink-500">Oddelki in vodje, teme z vprašanji in tipičnimi ukrepi, cilji KPI in roki prioritet. Spremembe veljajo takoj za vse audite.</p>
        </div>
        <Button hint="Nazaj na seznam auditov" variant="neutral" icon={List} onClick={() => router.push("/management/auditi")}>
          Auditi
        </Button>
      </div>
      {!s.izBaze && (
        <WarningText>
          Urejanje ni mogoče, dokler v Supabase ne zaženeš migracije <strong>016_auditi_nastavitve_ocena.sql</strong>. Spodaj je privzeta vsebina.
        </WarningText>
      )}
      <section className="flex flex-col">
        <Zavihki
          label="Nastavitve auditov"
          value={pogled}
          onChange={setPogled}
          zavihki={[
            { koda: "ODDELKI", label: `Oddelki (${s.oddelki.length})`, hint: "Oddelki, barve in vodje oddelkov", icon: Building2 },
            { koda: "TEME", label: "Teme in vprašanja", hint: "Teme oddelkov, vprašanja in tipični ukrepi", icon: CircleHelp },
            { koda: "CILJI", label: "Cilji in roki", hint: "Cilji KPI in roki prioritet A / B / C", icon: Target },
          ]}
        />
        <div className="fp-card rounded-tl-none p-3 sm:p-4">
          {pogled === "ODDELKI" && <Oddelki />}
          {pogled === "TEME" && <Teme />}
          {pogled === "CILJI" && <Cilji key={JSON.stringify(s.nastavitve)} />}
        </div>
      </section>
    </div>
  );
}

// =====================================================================
// ODDELKI
// =====================================================================

function Oddelki() {
  const notify = useToast();
  const { s, osvezi } = useSifranti();
  const [okno, setOkno] = useState<Oddelek | "NOV" | null>(null);

  async function premakni(i: number, smer: -1 | 1) {
    try {
      for (const { x, red } of premik(s.oddelki, i, smer)) await shraniOddelek(x, { ...x, vrstni_red: red });
      await osvezi();
    } catch (e) {
      notify("error", `Ni shranjeno: ${(e as Error).message}`, 10000);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-ink-500">Vodja oddelka je predlagan kot odgovoren pri akcijah in je naveden v PDF poročilu. Neaktiven oddelek se ne ponuja za nove audite.</p>
        <Button hint="Dodaj nov oddelek" variant="success" icon={Plus} disabled={!s.izBaze} onClick={() => setOkno("NOV")}>
          Nov oddelek
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {s.oddelki.map((o, i) => (
          <li key={o.koda} className={`flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 border-l-4 p-3 ${o.aktiven ? "bg-white" : "bg-ink-50"}`} style={{ borderLeftColor: o.barva }}>
            <div className="min-w-[min(100%,14rem)] flex-1">
              <p className="flex flex-wrap items-center gap-2 font-bold text-ink-900">
                {o.naziv}
                {!o.aktiven && <span className="rounded-full bg-ink-200 px-2 py-0.5 text-xs font-bold text-ink-600">neaktiven</span>}
                <span className="text-xs font-normal text-ink-500">{o.teme.filter((t) => t.aktivna).length} tem</span>
              </p>
              <p className="text-sm text-ink-600">
                {o.vodja ? (
                  <>
                    Vodja: <strong>{o.vodja}</strong>
                    {o.vodja_email && <span className="text-ink-500"> · {o.vodja_email}</span>}
                  </>
                ) : (
                  <span className="text-warn-700">Vodja ni vpisan</span>
                )}
              </p>
              {o.opis && <p className="text-xs text-ink-500">{o.opis}</p>}
            </div>
            <div className="flex gap-1">
              <IconButton hint="Premakni oddelek višje" variant="primary" icon={ArrowUp} disabled={!s.izBaze || i === 0} onClick={() => premakni(i, -1)} />
              <IconButton hint="Premakni oddelek nižje" variant="primary" icon={ArrowDown} disabled={!s.izBaze || i === s.oddelki.length - 1} onClick={() => premakni(i, 1)} />
              <IconButton hint="Uredi oddelek in vodjo" variant="primary" icon={Pencil} disabled={!s.izBaze} onClick={() => setOkno(o)} />
            </div>
          </li>
        ))}
      </ul>
      {okno && <OddelekOkno oddelek={okno === "NOV" ? null : okno} onClose={() => setOkno(null)} />}
    </div>
  );
}

function OddelekOkno({ oddelek, onClose }: { oddelek: Oddelek | null; onClose: () => void }) {
  const notify = useToast();
  const { s, osvezi } = useSifranti();
  const [f, setF] = useState({
    naziv: oddelek?.naziv ?? "",
    barva: oddelek?.barva ?? BARVE[s.oddelki.length % BARVE.length],
    opis: oddelek?.opis ?? "",
    podrocje: oddelek?.podrocje ?? "",
    vodja: oddelek?.vodja ?? "",
    vodja_email: oddelek?.vodja_email ?? "",
    aktiven: oddelek?.aktiven ?? true,
  });
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);
  const nastavi = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function shrani() {
    if (!f.naziv.trim()) return setNapaka("Vpiši naziv oddelka.");
    if (f.vodja_email && !/^\S+@\S+\.\S+$/.test(f.vodja_email.trim())) return setNapaka("E-mail vodje ni pravilen.");
    setShranjujem(true);
    try {
      await shraniOddelek(oddelek, {
        ...f,
        vrstni_red: oddelek?.vrstni_red ?? novRed(s.oddelki),
        koda: oddelek ? undefined : novaKoda(f.naziv, s.oddelki.map((o) => o.koda)),
      });
      await osvezi();
      notify("success", oddelek ? "Oddelek je posodobljen." : "Oddelek je dodan.");
      onClose();
    } catch (e) {
      setNapaka(`Ni shranjeno: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  return (
    <Modal
      open
      title={oddelek ? `Oddelek · ${oddelek.naziv}` : "Nov oddelek"}
      onClose={onClose}
      sirina="max-w-xl"
      noga={
        <div className="flex flex-col gap-2">
          {napaka && <ErrorText>{napaka}</ErrorText>}
          <div className="flex justify-end gap-2">
            <Button hint="Zapri okno brez shranjevanja" variant="neutral" icon={X} onClick={onClose}>
              Prekliči
            </Button>
            <Button hint="Shrani oddelek" variant="success" icon={Save} disabled={shranjujem} onClick={shrani}>
              {shranjujem ? "Shranjujem ..." : "Shrani"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <FilterPolje label="Naziv *">
          <input value={f.naziv} onChange={(e) => nastavi({ naziv: e.target.value })} autoFocus placeholder="npr. Vzdrževanje" title="Naziv oddelka" className={POLJE} />
        </FilterPolje>
        <FilterPolje label="Barva">
          <div className="flex flex-wrap items-center gap-2">
            {BARVE.map((b) => (
              <button
                key={b}
                type="button"
                title={`Izberi barvo ${b}`}
                aria-pressed={f.barva === b}
                onClick={() => nastavi({ barva: b })}
                className={`h-9 w-9 rounded-full border-2 ${f.barva === b ? "border-ink-900" : "border-white shadow"}`}
                style={{ background: b }}
              />
            ))}
            <input type="color" value={f.barva} onChange={(e) => nastavi({ barva: e.target.value })} title="Poljubna barva oddelka" className="h-9 w-12 cursor-pointer rounded border border-ink-200" />
          </div>
        </FilterPolje>
        <FilterPolje label="Opis">
          <input value={f.opis} onChange={(e) => nastavi({ opis: e.target.value })} placeholder="Kaj dela oddelek" title="Kratek opis oddelka" className={POLJE} />
        </FilterPolje>
        <FilterPolje label="Primer področja (namig v auditu)">
          <input value={f.podrocje} onChange={(e) => nastavi({ podrocje: e.target.value })} placeholder="npr. Stružnica, servisna delavnica" title="Namig za polje Področje pri auditu" className={POLJE} />
        </FilterPolje>
        <div className="grid gap-3 sm:grid-cols-2">
          <FilterPolje label="Vodja oddelka">
            <input value={f.vodja} onChange={(e) => nastavi({ vodja: e.target.value })} placeholder="Ime in priimek" title="Vodja oddelka - predlog odgovornega" className={POLJE} />
          </FilterPolje>
          <FilterPolje label="E-mail vodje">
            <input type="email" value={f.vodja_email} onChange={(e) => nastavi({ vodja_email: e.target.value })} placeholder="ime@fines.si" title="E-mail vodje oddelka" className={POLJE} />
          </FilterPolje>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-ink-200 px-3 text-sm font-semibold" title="Neaktiven oddelek se ne ponuja za nove audite">
          <input type="checkbox" checked={f.aktiven} onChange={(e) => nastavi({ aktiven: e.target.checked })} className="h-5 w-5 accent-fines-500" />
          Aktiven (ponudi pri novih auditih)
        </label>
      </div>
    </Modal>
  );
}

// =====================================================================
// TEME IN VPRAŠANJA
// =====================================================================

function Teme() {
  const notify = useToast();
  const { s, osvezi } = useSifranti();
  const [izbran, setIzbran] = useState<string>(s.oddelki[0]?.koda ?? "");
  const [okno, setOkno] = useState<Tema | "NOVA" | null>(null);
  const o = s.oddelki.find((x) => x.koda === izbran) ?? null;

  async function premakni(i: number, smer: -1 | 1) {
    if (!o) return;
    try {
      for (const { x, red } of premik(o.teme, i, smer)) await shraniTemo(x, { ...x, oddelek: o.koda, vrstni_red: red });
      await osvezi();
    } catch (e) {
      notify("error", `Ni shranjeno: ${(e as Error).message}`, 10000);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Oddelek">
        {[...s.oddelki.map((x) => ({ k: x.koda, n: x.naziv, b: x.barva })), { k: "", n: "Splošna vprašanja", b: "#8a8a92" }].map((x) => (
          <button
            key={x.k || "splosno"}
            type="button"
            title={x.k ? `Teme oddelka ${x.n}` : "Vprašanja, ki veljajo za vse oddelke"}
            aria-pressed={izbran === x.k}
            onClick={() => setIzbran(x.k)}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
              izbran === x.k ? "border-fines-500 bg-fines-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.b }} />
            {x.n}
          </button>
        ))}
      </div>

      {!o ? (
        <div className="rounded-lg border border-ink-200 p-3">
          <h4 className="mb-2 text-sm font-bold text-ink-900">Splošna vprašanja (vsi oddelki)</h4>
          <Postavke oddelek="" tema="" skupina="SPLOSNO" postavke={s.splosna} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-ink-500">
              Teme oddelka <strong>{o.naziv}</strong>. Vodja izbere temo pri auditu; vprašanja in tipični ukrepi se prikažejo v zavihku Vprašanja.
            </p>
            <Button hint="Dodaj novo temo oddelka" variant="success" icon={Plus} disabled={!s.izBaze} onClick={() => setOkno("NOVA")}>
              Nova tema
            </Button>
          </div>
          {o.teme.length === 0 && <p className="py-4 text-center text-sm text-ink-500">Oddelek še nima tem.</p>}
          {o.teme.map((t, i) => (
            <details key={t.koda} className={`group rounded-lg border border-ink-200 border-l-4 ${t.aktivna ? "bg-white" : "bg-ink-50"}`} style={{ borderLeftColor: o.barva }}>
              <summary title={`Prikaži / skrij vprašanja teme ${t.naziv}`} className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-2 p-2.5">
                <ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-bold text-ink-900">{t.naziv}</span>
                  {!t.aktivna && <span className="ml-2 rounded-full bg-ink-200 px-2 py-0.5 text-xs font-bold text-ink-600">skrita</span>}
                  <span className="block text-xs text-ink-500">
                    {t.opazuj.length + t.vprasaj.length} vprašanj · {t.ukrepi.length} ukrepov
                  </span>
                </span>
                <span className="flex gap-1" onClick={(e) => e.preventDefault()}>
                  <IconButton hint="Premakni temo višje" variant="primary" icon={ArrowUp} disabled={!s.izBaze || i === 0} onClick={() => premakni(i, -1)} />
                  <IconButton hint="Premakni temo nižje" variant="primary" icon={ArrowDown} disabled={!s.izBaze || i === o.teme.length - 1} onClick={() => premakni(i, 1)} />
                  <IconButton hint="Uredi naziv in opis teme" variant="primary" icon={Pencil} disabled={!s.izBaze} onClick={() => setOkno(t)} />
                </span>
              </summary>
              <div className="grid gap-3 border-t border-ink-100 p-3 lg:grid-cols-3">
                <Skupina naslov="Opazuj">
                  <Postavke oddelek={o.koda} tema={t.koda} skupina="OPAZUJ" postavke={t.opazuj} />
                </Skupina>
                <Skupina naslov="Vprašaj zaposlene">
                  <Postavke oddelek={o.koda} tema={t.koda} skupina="VPRASAJ" postavke={t.vprasaj} />
                </Skupina>
                <Skupina naslov="Tipični ukrepi">
                  <Postavke oddelek={o.koda} tema={t.koda} skupina="UKREP" postavke={t.ukrepi} />
                </Skupina>
              </div>
            </details>
          ))}
          {okno && <TemaOkno oddelek={o} tema={okno === "NOVA" ? null : okno} onClose={() => setOkno(null)} />}
        </>
      )}
    </div>
  );
}

function Skupina({ naslov, children }: { naslov: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h5 className="text-[11px] font-bold uppercase tracking-wide text-fines-600">{naslov}</h5>
      {children}
    </div>
  );
}

function TemaOkno({ oddelek, tema, onClose }: { oddelek: Oddelek; tema: Tema | null; onClose: () => void }) {
  const notify = useToast();
  const { osvezi } = useSifranti();
  const [f, setF] = useState({ naziv: tema?.naziv ?? "", opis: tema?.opis ?? "", aktivna: tema?.aktivna ?? true });
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);

  async function shrani() {
    if (!f.naziv.trim()) return setNapaka("Vpiši naziv teme.");
    setShranjujem(true);
    try {
      await shraniTemo(tema, {
        ...f,
        oddelek: oddelek.koda,
        vrstni_red: tema?.vrstni_red ?? novRed(oddelek.teme),
        koda: tema ? undefined : novaKoda(f.naziv, oddelek.teme.map((t) => t.koda)),
      });
      await osvezi();
      notify("success", tema ? "Tema je posodobljena." : "Tema je dodana.");
      onClose();
    } catch (e) {
      setNapaka(`Ni shranjeno: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  return (
    <Modal
      open
      title={tema ? `Tema · ${tema.naziv}` : `Nova tema · ${oddelek.naziv}`}
      onClose={onClose}
      noga={
        <div className="flex flex-col gap-2">
          {napaka && <ErrorText>{napaka}</ErrorText>}
          <div className="flex justify-end gap-2">
            <Button hint="Zapri okno brez shranjevanja" variant="neutral" icon={X} onClick={onClose}>
              Prekliči
            </Button>
            <Button hint="Shrani temo" variant="success" icon={Save} disabled={shranjujem} onClick={shrani}>
              {shranjujem ? "Shranjujem ..." : "Shrani"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <FilterPolje label="Naziv *">
          <input value={f.naziv} onChange={(e) => setF({ ...f, naziv: e.target.value })} autoFocus placeholder="npr. Orodja in naprave" title="Naziv teme" className={POLJE} />
        </FilterPolje>
        <FilterPolje label="Opis (kaj preverjam)">
          <textarea
            value={f.opis}
            onChange={(e) => setF({ ...f, opis: e.target.value })}
            rows={2}
            title="En stavek: kaj se pri tej temi preverja"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-base focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 sm:text-sm"
          />
        </FilterPolje>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-ink-200 px-3 text-sm font-semibold" title="Skrita tema se ne ponuja pri novih auditih">
          <input type="checkbox" checked={f.aktivna} onChange={(e) => setF({ ...f, aktivna: e.target.checked })} className="h-5 w-5 accent-fines-500" />
          Aktivna (ponudi pri auditih)
        </label>
      </div>
    </Modal>
  );
}

/** Urejanje seznama vprašanj / ukrepov: popravek ob izhodu iz polja, premik, odstranitev, dodajanje. */
function Postavke({ oddelek, tema, skupina, postavke }: { oddelek: string; tema: string; skupina: SkupinaPostavke; postavke: Postavka[] }) {
  const notify = useToast();
  const { s, osvezi } = useSifranti();
  const [nov, setNov] = useState("");
  const [delam, setDelam] = useState(false);

  async function izvedi(f: () => Promise<unknown>, ok?: string) {
    setDelam(true);
    try {
      await f();
      await osvezi();
      if (ok) notify("success", ok);
    } catch (e) {
      notify("error", `Ni shranjeno: ${(e as Error).message}`, 10000);
    } finally {
      setDelam(false);
    }
  }

  const premakni = (i: number, smer: -1 | 1) =>
    izvedi(async () => {
      for (const { x, red } of premik(postavke, i, smer)) if (x.id) await posodobiPostavko(x.id, { vrstni_red: red });
    });

  async function dodaj() {
    if (!nov.trim()) return;
    await izvedi(() => dodajPostavko({ oddelek, tema, skupina, besedilo: nov, vrstni_red: novRed(postavke) }));
    setNov("");
  }

  return (
    <ul className="flex flex-col gap-1">
      {postavke.map((p, i) => (
        <li key={p.id ?? p.besedilo} className="flex items-start gap-1">
          <textarea
            defaultValue={p.besedilo}
            rows={2}
            disabled={!s.izBaze || !p.id}
            title="Popravi besedilo - shrani se ob izhodu iz polja"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (p.id && v && v !== p.besedilo) izvedi(() => posodobiPostavko(p.id!, { besedilo: v }), "Popravek je shranjen.");
            }}
            className="min-w-0 flex-1 resize-y rounded-lg border border-ink-200 px-2.5 py-1.5 text-base leading-snug focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 disabled:bg-ink-50 sm:text-sm"
          />
          <div className="flex flex-col">
            <button
              type="button"
              title="Premakni višje"
              disabled={!s.izBaze || delam || i === 0}
              onClick={() => premakni(i, -1)}
              className="inline-flex h-7 w-8 items-center justify-center rounded text-fines-600 hover:bg-fines-50 disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              title="Premakni nižje"
              disabled={!s.izBaze || delam || i === postavke.length - 1}
              onClick={() => premakni(i, 1)}
              className="inline-flex h-7 w-8 items-center justify-center rounded text-fines-600 hover:bg-fines-50 disabled:opacity-30"
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            title="Odstrani s seznama"
            disabled={!s.izBaze || delam || !p.id}
            onClick={() => window.confirm(`Odstranim "${p.besedilo}"?`) && izvedi(() => posodobiPostavko(p.id!, { visible: false }), "Odstranjeno.")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-nok-500 hover:bg-nok-50 disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </li>
      ))}
      <li className="flex items-center gap-1.5 pt-1">
        <input
          value={nov}
          onChange={(e) => setNov(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dodaj()}
          disabled={!s.izBaze}
          placeholder={skupina === "UKREP" ? "Nov tipični ukrep ..." : "Novo vprašanje ..."}
          title="Vpiši novo postavko in pritisni Enter"
          className="h-10 min-w-0 flex-1 rounded-lg border border-dashed border-ink-300 px-2.5 text-base focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 disabled:bg-ink-50 sm:text-sm"
        />
        <button
          type="button"
          title="Dodaj na seznam"
          disabled={!s.izBaze || delam || !nov.trim()}
          onClick={dodaj}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok-500 text-white hover:bg-ok-600 disabled:opacity-40"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      </li>
    </ul>
  );
}

// =====================================================================
// CILJI IN ROKI
// =====================================================================

const POLJA_CILJEV: { k: keyof AuditNastavitve; label: string; enota: string; hint: string }[] = [
  { k: "ciljAuditovTeden", label: "Cilj: auditi na teden", enota: "auditov", hint: "KPI 1 - koliko auditov na teden (vsi oddelki skupaj)" },
  { k: "ciljPravocasnoPct", label: "Cilj: pravočasno zaprte akcije", enota: "%", hint: "KPI 3 - delež akcij, zaprtih do roka" },
  { k: "rokA", label: "Rok prioritete A (nujno)", enota: "dni", hint: "Prioriteta A nastavi rok čez toliko dni" },
  { k: "rokB", label: "Rok prioritete B (kmalu)", enota: "dni", hint: "Prioriteta B nastavi rok čez toliko dni" },
  { k: "rokC", label: "Rok prioritete C (ko bo mogoče)", enota: "dni", hint: "Prioriteta C nastavi rok čez toliko dni" },
];

function Cilji() {
  const notify = useToast();
  const { s, osvezi } = useSifranti();
  const [v, setV] = useState<Record<keyof AuditNastavitve, string>>(
    () => Object.fromEntries(POLJA_CILJEV.map(({ k }) => [k, formatVnos(s.nastavitve[k])])) as Record<keyof AuditNastavitve, string>,
  );
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);

  async function shrani() {
    const n = { ...PRIVZETE_NASTAVITVE };
    for (const { k, label } of POLJA_CILJEV) {
      const x = parseNum(v[k]);
      if (x === null || x < 0) return setNapaka(`${label}: vpiši pozitivno število.`);
      n[k] = x;
    }
    setNapaka(null);
    setShranjujem(true);
    try {
      await shraniNastavitve(n);
      await osvezi();
      notify("success", "Cilji in roki so shranjeni.");
    } catch (e) {
      setNapaka(`Ni shranjeno: ${(e as Error).message}`);
    } finally {
      setShranjujem(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {POLJA_CILJEV.map(({ k, label, enota, hint }) => (
          <FilterPolje key={k} label={label}>
            <span className="relative">
              <input
                value={v[k]}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
                inputMode="decimal"
                disabled={!s.izBaze}
                title={hint}
                className={`${POLJE} pr-16 text-right tabular-nums`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">{enota}</span>
            </span>
          </FilterPolje>
        ))}
      </div>
      {napaka && <ErrorText>{napaka}</ErrorText>}
      <Button hint="Shrani cilje in roke" variant="success" icon={Check} disabled={!s.izBaze || shranjujem} onClick={shrani} className="self-start">
        {shranjujem ? "Shranjujem ..." : "Shrani cilje"}
      </Button>
    </div>
  );
}
