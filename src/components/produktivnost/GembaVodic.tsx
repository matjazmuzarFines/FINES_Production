"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, ChevronDown, CircleHelp, FileText, Plus, Trash2, Wrench, X } from "lucide-react";
import { IZGUBE, KORAKI, PRAVILA, PREDLOGA_ZAPISNIKA, SPLOSNA_VPRASANJA, izgubaPoKodi, type Izguba } from "@/lib/gembaVodic";
import {
  dodajVprasanje,
  naloziVprasanja,
  skrijVprasanje,
  type AkcijaVnos,
  type GembaPolja,
  type LastnoVprasanje,
  type Nastavitve,
  type VprasanjeSkupina,
} from "@/lib/produktivnost";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Zavihki } from "@/components/ui/Zavihki";
import { GembaOrodja } from "./GembaOrodja";

type Pogled = "VODIC" | "VPRASANJA" | "ORODJA";

/** Stranski panel ob zapisniku: vodič gembe, vprašanja po temah in orodja. */
export function GembaVodic({
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
  const [pogled, setPogled] = useState<Pogled>("VPRASANJA");

  return (
    <div className="flex min-h-0 flex-col">
      <Zavihki
        label="Pomoč pri gembi"
        value={pogled}
        onChange={setPogled}
        zavihki={[
          { koda: "VODIC", label: "Vodič", hint: "Potek gembe korak za korakom", icon: BookOpen },
          { koda: "VPRASANJA", label: "Vprašanja", hint: "Vprašanja za opazovanje po temah", icon: CircleHelp },
          { koda: "ORODJA", label: "Orodja", hint: "Časovnik, štoparica, števci, prihranek", icon: Wrench },
        ]}
      />
      <div className="fp-card min-h-0 overflow-y-auto rounded-tl-none p-3 lg:max-h-[calc(100dvh-10rem)]">
        <div className={pogled === "VODIC" ? "" : "hidden"}>
          <Vodic onVstavi={onVstavi} prazenZapisnik={!polja.zapisnik.trim()} />
        </div>
        <div className={pogled === "VPRASANJA" ? "" : "hidden"}>
          <Vprasanja tema={polja.tema} onVstavi={onVstavi} />
        </div>
        {/* Orodja so vedno naložena, da časovnik in štoparica tečeta tudi na drugem zavihku. */}
        <div className={pogled === "ORODJA" ? "" : "hidden"}>
          <GembaOrodja
            polja={polja}
            nastavi={nastavi}
            nastavitve={nastavitve}
            onVstavi={onVstavi}
            onNovaAkcija={onNovaAkcija}
          />
        </div>
      </div>
    </div>
  );
}

function Vodic({ onVstavi, prazenZapisnik }: { onVstavi: (t: string) => void; prazenZapisnik: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border-l-4 border-fines-500 bg-fines-50 p-3">
        <h4 className="mb-1 text-sm font-bold text-fines-700">Pravila</h4>
        <ul className="list-disc space-y-1 pl-4 text-sm text-ink-800">
          {PRAVILA.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <Button
        hint="Vstavi strukturo zapisnika v prazno polje"
        variant="primary"
        icon={FileText}
        className="self-start"
        disabled={!prazenZapisnik}
        onClick={() => onVstavi(PREDLOGA_ZAPISNIKA)}
      >
        Predloga zapisnika
      </Button>
      <ol className="flex flex-col gap-2">
        {KORAKI.map((k, i) => (
          <li key={k.naslov} className="rounded-lg border border-ink-200 p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-bold text-white">{i + 1}</span>
              <span className="flex-1 text-sm font-bold text-ink-900">{k.naslov}</span>
              <span className="text-xs text-ink-500">{k.cas}</span>
            </div>
            <ul className="list-disc space-y-0.5 pl-10 text-sm text-ink-700">
              {k.tocke.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

type VprasanjaApi = {
  /** Vgrajena (brez odstranjenih) + dodana vprašanja skupine. */
  seznam: (tema: string, skupina: VprasanjeSkupina, vgrajena: string[]) => { besedilo: string; id: number | null }[];
  dodaj: (tema: string, skupina: VprasanjeSkupina, besedilo: string) => Promise<boolean>;
  izbrisi: (tema: string, skupina: VprasanjeSkupina, v: { besedilo: string; id: number | null }) => void;
};

/** Vprašanja iz baze (dodana in odstranjena vgrajena). Brez migracije 014 ostanejo samo vgrajena. */
function useVprasanja(): VprasanjaApi {
  const notify = useToast();
  const [lastna, setLastna] = useState<LastnoVprasanje[]>([]);

  useEffect(() => {
    let preklic = false;
    naloziVprasanja()
      .then((v) => !preklic && setLastna(v))
      .catch((e) => notify("error", `Napaka pri nalaganju vprašanj: ${e.message}`, 10000));
    return () => {
      preklic = true;
    };
  }, [notify]);

  return {
    seznam(tema, skupina, vgrajena) {
      const moje = lastna.filter((v) => v.tema === tema && v.skupina === skupina);
      const izbrisana = new Set(moje.filter((v) => v.izbrisano).map((v) => v.besedilo));
      return [
        ...vgrajena.filter((b) => !izbrisana.has(b)).map((besedilo) => ({ besedilo, id: null })),
        ...moje.filter((v) => !v.izbrisano).map((v) => ({ besedilo: v.besedilo, id: v.id })),
      ];
    },
    async dodaj(tema, skupina, besedilo) {
      try {
        const v = await dodajVprasanje({ tema, skupina, besedilo, izbrisano: false });
        setLastna((s) => [...s, v]);
        notify("success", "Vprašanje je dodano.");
        return true;
      } catch (e) {
        notify("error", `Ni shranjeno: ${(e as Error).message}`, 10000);
        return false;
      }
    },
    async izbrisi(tema, skupina, v) {
      if (!window.confirm(`Odstranim vprašanje "${v.besedilo}"?`)) return;
      try {
        if (v.id !== null) {
          await skrijVprasanje(v.id);
          setLastna((s) => s.filter((x) => x.id !== v.id));
        } else {
          // vgrajeno vprašanje - zapišemo, da je odstranjeno
          const z = await dodajVprasanje({ tema, skupina, besedilo: v.besedilo, izbrisano: true });
          setLastna((s) => [...s, z]);
        }
        notify("success", "Vprašanje je odstranjeno.");
      } catch (e) {
        notify("error", `Ni odstranjeno: ${(e as Error).message}`, 10000);
      }
    },
  };
}

function VprasanjeVrstica({ v, onVstavi, onIzbrisi }: { v: string; onVstavi: (t: string) => void; onIzbrisi: () => void }) {
  return (
    <li className="group flex items-start gap-1.5 rounded-md py-1 pl-1 hover:bg-ink-50">
      <span className="flex-1 text-sm text-ink-800">{v}</span>
      <button
        type="button"
        title="Odstrani vprašanje s seznama"
        aria-label={`Odstrani vprašanje: ${v}`}
        onClick={onIzbrisi}
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-300 hover:bg-nok-50 hover:text-nok-600"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        title="Vstavi vprašanje v zapisnik"
        aria-label={`Vstavi v zapisnik: ${v}`}
        onClick={() => onVstavi(`V: ${v}\nO: `)}
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-fines-500 hover:border-fines-500 hover:bg-fines-50"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

/** Vprašanja ene skupine z gumbom za dodajanje novega vprašanja. */
function SeznamVprasanj({
  api,
  tema,
  skupina,
  vgrajena,
  onVstavi,
}: {
  api: VprasanjaApi;
  tema: string;
  skupina: VprasanjeSkupina;
  vgrajena: string[];
  onVstavi: (t: string) => void;
}) {
  const [nov, setNov] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);

  async function shrani() {
    if (!nov?.trim() || shranjujem) return;
    setShranjujem(true);
    if (await api.dodaj(tema, skupina, nov)) setNov(null);
    setShranjujem(false);
  }

  return (
    <ul className="flex flex-col">
      {api.seznam(tema, skupina, vgrajena).map((v) => (
        <VprasanjeVrstica key={`${v.id ?? "v"}-${v.besedilo}`} v={v.besedilo} onVstavi={onVstavi} onIzbrisi={() => api.izbrisi(tema, skupina, v)} />
      ))}
      <li className="pt-1">
        {nov === null ? (
          <button
            type="button"
            title="Dodaj svoje vprašanje v to skupino"
            onClick={() => setNov("")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-sm font-semibold text-ok-600 hover:bg-ok-50"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ok-500 text-white">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
            Dodaj vprašanje
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nov}
              onChange={(e) => setNov(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") shrani();
                if (e.key === "Escape") setNov(null);
              }}
              placeholder="Novo vprašanje ..."
              title="Besedilo novega vprašanja"
              className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
            />
            <button
              type="button"
              title="Shrani novo vprašanje"
              disabled={!nov.trim() || shranjujem}
              onClick={shrani}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok-500 text-white hover:bg-ok-600 disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              title="Prekliči dodajanje vprašanja"
              onClick={() => setNov(null)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600 hover:bg-ink-100"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </li>
    </ul>
  );
}

function IzgubaBlok({ i, odprt, api, onVstavi }: { i: Izguba; odprt: boolean; api: VprasanjaApi; onVstavi: (t: string) => void }) {
  return (
    <details open={odprt} className="group rounded-lg border border-ink-200 open:border-l-4" style={{ borderLeftColor: i.barva }}>
      <summary
        title={`Prikaži / skrij vprašanja: ${i.naziv}`}
        className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-2.5 hover:bg-ink-50"
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: i.barva }} />
        <span className="flex-1 text-sm font-bold text-ink-900">{i.naziv}</span>
        <ChevronDown className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-2 px-2.5 pb-3">
        <p className="text-xs text-ink-500">{i.opis}</p>
        <Skupina naslov="Opazuj">
          <SeznamVprasanj api={api} tema={i.koda} skupina="OPAZUJ" vgrajena={i.opazuj} onVstavi={onVstavi} />
        </Skupina>
        <Skupina naslov="Vprašaj delavce">
          <SeznamVprasanj api={api} tema={i.koda} skupina="VPRASAJ" vgrajena={i.vprasaj} onVstavi={onVstavi} />
        </Skupina>
        <Skupina naslov="Tipični ukrepi">
          <ul className="flex flex-col">
            {i.ukrepi.map((u) => (
              <li key={u} className="list-inside list-disc text-sm text-ink-700">
                {u}
              </li>
            ))}
          </ul>
        </Skupina>
        <p className="rounded-md bg-ink-50 px-2 py-1.5 text-xs text-ink-700">
          <strong>Meritev:</strong> {i.meritev}
        </p>
      </div>
    </details>
  );
}

function Skupina({ naslov, children }: { naslov: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-fines-600">{naslov}</h5>
      {children}
    </div>
  );
}

function Vprasanja({ tema, onVstavi }: { tema: string; onVstavi: (t: string) => void }) {
  const api = useVprasanja();
  const izbrana = izgubaPoKodi(tema);
  const ostale = IZGUBE.filter((i) => i.koda !== tema);
  // Ko je tema izbrana, so ostale teme skrite (manj drsenja); po potrebi jih prikažeš z gumbom.
  const [ostaleOdprte, setOstaleOdprte] = useState(false);
  const prikaziOstale = !izbrana || ostaleOdprte;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-500">
        Klikni <Plus className="inline h-3.5 w-3.5 text-fines-500" aria-hidden /> za vstavitev vprašanja v zapisnik (V: vprašanje, O: tvoj odgovor).
      </p>
      {izbrana ? (
        <div>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-600">Tema tedna</h4>
          <IzgubaBlok i={izbrana} odprt api={api} onVstavi={onVstavi} />
        </div>
      ) : (
        <p className="rounded-lg bg-warn-50 px-3 py-2 text-sm font-medium text-warn-700">Izberi temo tedna zgoraj - vprašanja teme se prikažejo tukaj.</p>
      )}
      <details className="group rounded-lg border border-ink-200">
        <summary title="Prikaži / skrij splošna vprašanja" className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-2.5 hover:bg-ink-50">
          <CircleHelp className="h-4 w-4 text-ink-500" aria-hidden />
          <span className="flex-1 text-sm font-bold text-ink-900">Splošna vprašanja</span>
          <ChevronDown className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-2.5 pb-3">
          <SeznamVprasanj api={api} tema="" skupina="SPLOSNO" vgrajena={SPLOSNA_VPRASANJA} onVstavi={onVstavi} />
        </div>
      </details>
      {izbrana && (
        <button
          type="button"
          title={ostaleOdprte ? "Skrij vprašanja ostalih tem" : "Prikaži vprašanja ostalih tem"}
          onClick={() => setOstaleOdprte((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-ink-300 px-2.5 py-2 text-sm font-semibold text-ink-600 hover:border-fines-500 hover:text-fines-600"
        >
          <span className="flex-1 text-left">{ostaleOdprte ? "Skrij ostale teme" : `Prikaži ostale teme (${ostale.length})`}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${ostaleOdprte ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
      {prikaziOstale && (
        <>
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600">Ostale teme</h4>
          {ostale.map((i) => (
            <IzgubaBlok key={i.koda} i={i} odprt={false} api={api} onVstavi={onVstavi} />
          ))}
        </>
      )}
    </div>
  );
}
