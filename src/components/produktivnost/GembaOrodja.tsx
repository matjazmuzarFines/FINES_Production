"use client";

import { useEffect, useState } from "react";
import { Flag, Minus, Pause, Play, Plus, RotateCcw, Square, TextCursorInput, Trash2 } from "lucide-react";
import {
  formatCas,
  novId,
  opisMeritve,
  statistika,
  type GembaPolja,
  type Meritev,
  type Nastavitve,
  type Orodja,
  type Stevec,
  type AkcijaVnos,
} from "@/lib/produktivnost";
import { Button, IconButton } from "@/components/ui/Button";
import { KalkulatorPrihranka, preberiPrihranek, prihranekVnosIz, type PrihranekVnos } from "./Akcije";

const PREDLOGI_STEVCEV = ["Hoja po orodje", "Hoja po material", "Iskanje", "Čakanje", "Obračanje kosa", "Dodelava", "Prekinitev"];

const POLJE =
  "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

export function Blok({ naslov, opis, children }: { naslov: string; opis?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-ink-200 p-3">
      <div>
        <h4 className="text-sm font-bold text-ink-900">{naslov}</h4>
        {opis && <p className="text-xs text-ink-500">{opis}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Tekoči čas v ms (osveži se večkrat na sekundo, ko teče).
 * Pretečeni čas računaj s pretecenoMs: ob (ponovnem) zagonu je zdaj še star čas, razlika bi bila
 * negativna (utripanje številk, skok nazaj) - zato je spodaj omejena na 0.
 */
function useZdaj(tece: boolean) {
  const [zdaj, setZdaj] = useState(() => Date.now());
  useEffect(() => {
    if (!tece) return;
    const t = setInterval(() => setZdaj(Date.now()), 100);
    return () => clearInterval(t);
  }, [tece]);
  return zdaj;
}

const pretecenoMs = (zdaj: number, zacetek: number | null) => (zacetek === null ? 0 : Math.max(0, zdaj - zacetek));

export function GembaOrodja({
  polja,
  nastavi,
  nastavitve,
  onVstavi,
  onNovaAkcija,
}: {
  polja: GembaPolja;
  nastavi: (p: Partial<GembaPolja>) => void;
  nastavitve: Nastavitve;
  onVstavi: (tekst: string) => void;
  onNovaAkcija: (prihranek: Partial<AkcijaVnos>) => void;
}) {
  const orodja = polja.orodja;
  const nastaviOrodja = (o: Partial<Orodja>) => nastavi({ orodja: { ...orodja, ...o } });

  return (
    <div className="flex flex-col gap-3">
      <Casovnik orodja={orodja} onChange={nastaviOrodja} />
      <Stoparica meritve={orodja.meritve} onChange={(meritve) => nastaviOrodja({ meritve })} onVstavi={onVstavi} />
      <Stevci stevci={orodja.stevci} onChange={(stevci) => nastaviOrodja({ stevci })} onVstavi={onVstavi} />
      <Kalkulator nastavitve={nastavitve} onNovaAkcija={onNovaAkcija} />
    </div>
  );
}

// ---------------------------------------------------------------------
// KALKULATOR PRIHRANKA -> nova akcija
// ---------------------------------------------------------------------

function Kalkulator({ nastavitve, onNovaAkcija }: { nastavitve: Nastavitve; onNovaAkcija: (p: Partial<AkcijaVnos>) => void }) {
  const [v, setV] = useState<PrihranekVnos>(prihranekVnosIz({}));
  const p = preberiPrihranek(v);
  const prazno = typeof p === "string" || (!p.prihranek_min_kos && !p.prihranek_eur_kos);
  return (
    <Blok naslov="Kalkulator prihranka" opis="Prihranek časa in materiala na kos; prenesi ga v novo akcijo.">
      <KalkulatorPrihranka nastavitve={nastavitve} vrednost={v} onChange={setV} />
      <Button
        hint="Odpri novo akcijo s tem prihrankom"
        variant="success"
        icon={Plus}
        className="self-start"
        disabled={prazno}
        onClick={() => {
          if (typeof p === "string") return;
          onNovaAkcija(p);
          setV(prihranekVnosIz({}));
        }}
      >
        Nova akcija
      </Button>
    </Blok>
  );
}

// ---------------------------------------------------------------------
// ČASOVNIK GEMBE (30-60 min)
// ---------------------------------------------------------------------

/** Trajanje gembe se ob pavzi zapiše v podatke gembe (shrani se z zapisnikom) - za PDF in e-mail. */
export function Casovnik({ orodja, onChange }: { orodja: Orodja; onChange: (o: Partial<Orodja>) => void }) {
  const [zacetek, setZacetek] = useState<number | null>(null);
  const prej = (orodja.trajanje_s ?? 0) * 1000;
  const zdaj = useZdaj(zacetek !== null);
  const s = (prej + pretecenoMs(zdaj, zacetek)) / 1000;
  const min = s / 60;
  const pct = Math.min(100, (min / 60) * 100);
  const barva = min < 30 ? "bg-sync-500" : min <= 60 ? "bg-ok-500" : "bg-warn-500";

  function start() {
    // ura začetka se zapiše ob prvem zagonu
    if (!orodja.zacetek_ura) onChange({ zacetek_ura: new Date().toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" }) });
    setZacetek(Date.now());
  }

  return (
    <Blok
      naslov="Časovnik gembe"
      opis={`Cilj 30-60 min. Ob pavzi se trajanje zapiše v zapisnik (PDF, e-mail).${orodja.zacetek_ura ? ` Začetek ob ${orodja.zacetek_ura}.` : ""}`}
    >
      <div className="flex items-center gap-3">
        <span className="min-w-24 text-3xl font-bold tabular-nums text-ink-900">
          {String(Math.floor(min)).padStart(2, "0")}:{String(Math.floor(s % 60)).padStart(2, "0")}
        </span>
        <div className="flex gap-1">
          {zacetek === null ? (
            <IconButton hint="Zaženi časovnik gembe" variant="primary" icon={Play} onClick={start} />
          ) : (
            <IconButton
              hint="Ustavi časovnik in zapiši trajanje"
              variant="primary"
              icon={Pause}
              onClick={() => {
                onChange({ trajanje_s: Math.round((prej + Date.now() - zacetek) / 1000) });
                setZacetek(null);
              }}
            />
          )}
          <IconButton
            hint="Ponastavi časovnik na nič"
            variant="neutral"
            icon={RotateCcw}
            disabled={s === 0}
            onClick={() => {
              setZacetek(null);
              onChange({ trajanje_s: 0, zacetek_ura: undefined });
            }}
          />
        </div>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-ink-100" title="Napredek do 60 minut">
        <div className={`h-full ${barva} transition-all`} style={{ width: `${pct}%` }} />
        <span className="absolute inset-y-0 left-1/2 w-0.5 bg-ink-400" />
      </div>
    </Blok>
  );
}

// ---------------------------------------------------------------------
// ŠTOPARICA (meritev ciklov)
// ---------------------------------------------------------------------

function Stoparica({
  meritve,
  onChange,
  onVstavi,
}: {
  meritve: Meritev[];
  onChange: (m: Meritev[]) => void;
  onVstavi: (t: string) => void;
}) {
  const [izbrana, setIzbrana] = useState<string | null>(meritve[0]?.id ?? null);
  const [naziv, setNaziv] = useState("");
  const [zacetek, setZacetek] = useState<number | null>(null);
  const zdaj = useZdaj(zacetek !== null);
  const m = meritve.find((x) => x.id === izbrana) ?? null;
  const st = m ? statistika(m.casi) : null;
  const tekoci = pretecenoMs(zdaj, zacetek) / 1000;

  function dodajCas() {
    if (!m || zacetek === null) return;
    const t = Math.round(((Date.now() - zacetek) / 1000) * 10) / 10;
    onChange(meritve.map((x) => (x.id === m.id ? { ...x, casi: [...x.casi, t] } : x)));
    return t;
  }

  function novaMeritev() {
    const n = naziv.trim() || `Meritev ${meritve.length + 1}`;
    const nova = { id: novId(), naziv: n, casi: [] };
    onChange([...meritve, nova]);
    setIzbrana(nova.id);
    setNaziv("");
    setZacetek(null);
  }

  return (
    <Blok
      naslov="Štoparica - meritev operacij"
      opis="Pečica traja 1-2 h, zato meri posamezne operacije (npr. montaža vrat, ožičenje), ki se ponovijo večkrat ali na več pečicah. Krog = konec operacije in začetek naslednje."
    >
      <div className="flex gap-2">
        <input
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && novaMeritev()}
          placeholder="Ime operacije (npr. Montaža vrat)"
          title="Vpiši ime operacije, ki jo meriš"
          className={POLJE}
        />
        <Button hint="Dodaj novo meritev operacije" variant="success" icon={Plus} onClick={novaMeritev} />
      </div>
      {meritve.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {meritve.map((x) => (
            <button
              key={x.id}
              type="button"
              title={`Izberi meritev: ${x.naziv}`}
              aria-pressed={x.id === izbrana}
              onClick={() => {
                setIzbrana(x.id);
                setZacetek(null);
              }}
              className={`h-9 rounded-full border px-3 text-sm font-semibold transition-colors ${
                x.id === izbrana ? "border-fines-500 bg-fines-500 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-100"
              }`}
            >
              {x.naziv} ({x.casi.length})
            </button>
          ))}
        </div>
      )}
      {m && (
        <>
          <div className="flex items-center gap-3">
            <span className="min-w-28 text-3xl font-bold tabular-nums text-ink-900">{formatCas(tekoci)}</span>
            {zacetek === null ? (
              <Button hint="Začni meriti operacijo" variant="primary" icon={Play} size="lg" onClick={() => setZacetek(Date.now())}>
                Start
              </Button>
            ) : (
              <>
                <Button
                  hint="Zabeleži operacijo in začni naslednjo"
                  variant="primary"
                  icon={Flag}
                  size="lg"
                  onClick={() => {
                    dodajCas();
                    setZacetek(Date.now());
                  }}
                >
                  Krog
                </Button>
                <IconButton
                  hint="Zabeleži zadnjo operacijo in ustavi"
                  variant="neutral"
                  icon={Square}
                  onClick={() => {
                    dodajCas();
                    setZacetek(null);
                  }}
                />
              </>
            )}
          </div>
          {st && (
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {[
                ["Meritev", String(st.n)],
                ["Povprečje", formatCas(st.povp)],
                ["Min", formatCas(st.min)],
                ["Max", formatCas(st.max)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-ink-50 p-1.5">
                  <div className="text-ink-500">{l}</div>
                  <div className="font-bold tabular-nums text-ink-900">{v}</div>
                </div>
              ))}
            </div>
          )}
          {m.casi.length > 0 && (
            <ol className="flex flex-wrap gap-1.5 text-xs">
              {m.casi.map((c, i) => (
                <li key={i} className="inline-flex items-center gap-1 rounded-full bg-ink-100 py-0.5 pl-2 pr-1 tabular-nums">
                  {i + 1}. {formatCas(c)}
                  <button
                    type="button"
                    title="Odstrani to meritev"
                    onClick={() => onChange(meritve.map((x) => (x.id === m.id ? { ...x, casi: x.casi.filter((_, j) => j !== i) } : x)))}
                    className="rounded-full px-1 text-ink-400 hover:bg-nok-50 hover:text-nok-600"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            <Button hint="Vpiši rezultate meritve v zapisnik" variant="primary" icon={TextCursorInput} disabled={!st} onClick={() => onVstavi(opisMeritve(m))}>
              V zapisnik
            </Button>
            <Button
              hint="Odstrani celotno meritev operacije"
              variant="danger"
              icon={Trash2}
              onClick={() => {
                if (!window.confirm(`Odstranim meritev "${m.naziv}"?`)) return;
                onChange(meritve.filter((x) => x.id !== m.id));
                setIzbrana(meritve.find((x) => x.id !== m.id)?.id ?? null);
                setZacetek(null);
              }}
            >
              Odstrani
            </Button>
          </div>
        </>
      )}
    </Blok>
  );
}

// ---------------------------------------------------------------------
// ŠTEVCI
// ---------------------------------------------------------------------

export function Stevci({
  stevci,
  onChange,
  onVstavi,
  predlogi: vsiPredlogi = PREDLOGI_STEVCEV,
  opis = "Štej, kolikokrat se izguba zgodi med opazovanjem (npr. hoja po orodje).",
}: {
  stevci: Stevec[];
  onChange: (s: Stevec[]) => void;
  onVstavi: (t: string) => void;
  /** Predlagani števci (en klik); prazno = samo lastni števci. */
  predlogi?: string[];
  opis?: string;
}) {
  const [naziv, setNaziv] = useState("");
  const dodaj = (n: string) => {
    if (!n.trim() || stevci.some((s) => s.naziv === n.trim())) return;
    onChange([...stevci, { id: novId(), naziv: n.trim(), stevilo: 0 }]);
    setNaziv("");
  };
  const spremeni = (id: string, d: number) =>
    onChange(stevci.map((s) => (s.id === id ? { ...s, stevilo: Math.max(0, s.stevilo + d) } : s)));
  const predlogi = vsiPredlogi.filter((p) => !stevci.some((s) => s.naziv === p));

  return (
    <Blok naslov="Števci dogodkov" opis={opis}>
      {stevci.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800" title={s.naziv}>
            {s.naziv}
          </span>
          <IconButton hint={`Zmanjšaj števec: ${s.naziv}`} variant="neutral" icon={Minus} disabled={s.stevilo === 0} onClick={() => spremeni(s.id, -1)} />
          <span className="w-10 text-center text-xl font-bold tabular-nums text-ink-900">{s.stevilo}</span>
          <button
            type="button"
            title={`Prištej 1: ${s.naziv}`}
            aria-label={`Prištej 1: ${s.naziv}`}
            onClick={() => spremeni(s.id, 1)}
            className="inline-flex h-12 w-16 items-center justify-center rounded-lg bg-fines-500 text-white shadow-sm hover:bg-fines-600 active:bg-fines-700"
          >
            <Plus className="h-6 w-6" aria-hidden />
          </button>
          <IconButton
            hint={`Odstrani števec: ${s.naziv}`}
            variant="ghost"
            icon={Trash2}
            className="hover:!text-nok-600"
            onClick={() => onChange(stevci.filter((x) => x.id !== s.id))}
          />
        </div>
      ))}
      {predlogi.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {predlogi.map((p) => (
            <button
              key={p}
              type="button"
              title={`Dodaj števec: ${p}`}
              onClick={() => dodaj(p)}
              className="h-8 rounded-full border border-dashed border-ink-300 bg-white px-3 text-xs font-semibold text-ink-600 hover:border-ok-500 hover:text-ok-600"
            >
              + {p}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dodaj(naziv)}
          placeholder="Lasten števec"
          title="Vpiši ime novega števca"
          className={POLJE}
        />
        <Button hint="Dodaj nov števec dogodkov" variant="success" icon={Plus} onClick={() => dodaj(naziv)} />
      </div>
      {stevci.length > 0 && (
        <Button
          hint="Vpiši stanje števcev v zapisnik"
          variant="primary"
          icon={TextCursorInput}
          className="self-start"
          onClick={() => onVstavi(`Števci: ${stevci.map((s) => `${s.naziv} ${s.stevilo}×`).join(", ")}`)}
        >
          V zapisnik
        </Button>
      )}
    </Blok>
  );
}
