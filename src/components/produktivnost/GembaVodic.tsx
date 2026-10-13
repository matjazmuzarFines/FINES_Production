"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, CircleHelp, FileText, Plus, Wrench } from "lucide-react";
import { IZGUBE, KORAKI, PRAVILA, PREDLOGA_ZAPISNIKA, SPLOSNA_VPRASANJA, izgubaPoKodi, type Izguba } from "@/lib/gembaVodic";
import type { AkcijaVnos, GembaPolja, Nastavitve } from "@/lib/produktivnost";
import { Button } from "@/components/ui/Button";
import { Zavihki } from "@/components/ui/Zavihki";
import { GembaOrodja } from "./GembaOrodja";

type Pogled = "VODIC" | "VPRASANJA" | "ORODJA";

/** Stranski panel ob zapisniku: vodič gembe, vprašanja po temah in orodja. */
export function GembaVodic({
  polja,
  nastavi,
  prejsnjiHKos,
  nastavitve,
  onVstavi,
  onNovaAkcija,
  verzija,
}: {
  polja: GembaPolja;
  nastavi: (p: Partial<GembaPolja>) => void;
  prejsnjiHKos: { vrednost: number; teden: string } | null;
  nastavitve: Nastavitve;
  onVstavi: (tekst: string) => void;
  onNovaAkcija: (prihranek: Partial<AkcijaVnos>) => void;
  /** Ob preklicu sprememb se vnosna polja orodij ponastavijo. */
  verzija: number;
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
          { koda: "ORODJA", label: "Orodja", hint: "Časovnik, štoparica, števci, KPI, prihranek", icon: Wrench },
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
            verzija={verzija}
            polja={polja}
            nastavi={nastavi}
            prejsnjiHKos={prejsnjiHKos}
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

function VprasanjeVrstica({ v, onVstavi }: { v: string; onVstavi: (t: string) => void }) {
  return (
    <li className="group flex items-start gap-2 rounded-md py-1 pl-1 hover:bg-ink-50">
      <span className="flex-1 text-sm text-ink-800">{v}</span>
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

function IzgubaBlok({ i, odprt, onVstavi }: { i: Izguba; odprt: boolean; onVstavi: (t: string) => void }) {
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
          {i.opazuj.map((v) => (
            <VprasanjeVrstica key={v} v={v} onVstavi={onVstavi} />
          ))}
        </Skupina>
        <Skupina naslov="Vprašaj delavce">
          {i.vprasaj.map((v) => (
            <VprasanjeVrstica key={v} v={v} onVstavi={onVstavi} />
          ))}
        </Skupina>
        <Skupina naslov="Tipični ukrepi">
          {i.ukrepi.map((u) => (
            <li key={u} className="list-inside list-disc text-sm text-ink-700">
              {u}
            </li>
          ))}
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
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function Vprasanja({ tema, onVstavi }: { tema: string; onVstavi: (t: string) => void }) {
  const izbrana = izgubaPoKodi(tema);
  const ostale = IZGUBE.filter((i) => i.koda !== tema);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-500">
        Klikni <Plus className="inline h-3.5 w-3.5 text-fines-500" aria-hidden /> za vstavitev vprašanja v zapisnik (V: vprašanje, O: tvoj odgovor).
      </p>
      {izbrana ? (
        <div>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-600">Tema tedna</h4>
          <IzgubaBlok i={izbrana} odprt onVstavi={onVstavi} />
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
        <ul className="flex flex-col px-2.5 pb-3">
          {SPLOSNA_VPRASANJA.map((v) => (
            <VprasanjeVrstica key={v} v={v} onVstavi={onVstavi} />
          ))}
        </ul>
      </details>
      <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600">Ostale teme</h4>
      {ostale.map((i) => (
        <IzgubaBlok key={i.koda} i={i} odprt={false} onVstavi={onVstavi} />
      ))}
    </div>
  );
}
