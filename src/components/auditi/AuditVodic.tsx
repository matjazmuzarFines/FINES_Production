"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, CircleHelp, Plus, Wrench } from "lucide-react";
import { KORAKI, PRAVILA, PREDLOGA_ZAPISNIKA } from "@/lib/auditVodic";
import {
  BREZ_MIGRACIJE_016,
  dodajPostavko,
  novRed,
  oddelekPoKodi,
  posodobiPostavko,
  type Oddelek,
  type Postavka,
  type SkupinaPostavke,
  type Tema,
} from "@/lib/auditSifranti";
import type { AuditPolja } from "@/lib/auditi";
import type { Orodja } from "@/lib/produktivnost";
import { useToast } from "@/components/ui/Toast";
import { Zavihki } from "@/components/ui/Zavihki";
import { Casovnik, Stevci } from "@/components/produktivnost/GembaOrodja";
import { SeznamVprasanj, Skupina, Vodic, type VprasanjaApi } from "@/components/produktivnost/GembaVodic";
import { useSifranti } from "./Sifranti";

type Pogled = "VODIC" | "VPRASANJA" | "ORODJA";

/** Stranski panel ob zapisniku audita: vodič, vprašanja oddelka po temah in orodja (časovnik, števci). */
export function AuditVodic({
  polja,
  nastavi,
  onVstavi,
  onUkrep,
}: {
  polja: AuditPolja;
  nastavi: (p: Partial<AuditPolja>) => void;
  onVstavi: (tekst: string) => void;
  /** Klik na tipični ukrep odpre novo ugotovitev s tem ukrepom. */
  onUkrep: (tema: string, ukrep: string) => void;
}) {
  const [pogled, setPogled] = useState<Pogled>("VPRASANJA");
  const nastaviOrodja = (o: Partial<Orodja>) => nastavi({ orodja: { ...polja.orodja, ...o } });

  return (
    <div className="flex min-h-0 flex-col">
      <Zavihki
        label="Pomoč pri auditu"
        value={pogled}
        onChange={setPogled}
        zavihki={[
          { koda: "VPRASANJA", label: "Vprašanja", hint: "Vprašanja oddelka po temah", icon: CircleHelp },
          { koda: "VODIC", label: "Vodič", hint: "Potek audita korak za korakom", icon: BookOpen },
          { koda: "ORODJA", label: "Orodja", hint: "Časovnik audita in števci", icon: Wrench },
        ]}
      />
      <div className="fp-card min-h-0 overflow-y-auto rounded-tl-none p-3 lg:max-h-[calc(100dvh-10rem)]">
        <div className={pogled === "VODIC" ? "" : "hidden"}>
          <Vodic onVstavi={onVstavi} prazenZapisnik={!polja.zapisnik.trim()} pravila={PRAVILA} koraki={KORAKI} predloga={PREDLOGA_ZAPISNIKA} />
        </div>
        <div className={pogled === "VPRASANJA" ? "" : "hidden"}>
          <Vprasanja oddelek={polja.oddelek} tema={polja.tema} onVstavi={onVstavi} onUkrep={onUkrep} />
        </div>
        {/* Orodja so vedno naložena, da časovnik teče tudi na drugem zavihku. */}
        <div className={pogled === "ORODJA" ? "" : "hidden"}>
          <div className="flex flex-col gap-3">
            <Casovnik orodja={polja.orodja} onChange={nastaviOrodja} />
            <Stevci
              stevci={polja.orodja.stevci}
              onChange={(stevci) => nastaviOrodja({ stevci })}
              onVstavi={onVstavi}
              predlogi={[]}
              opis="Dodaj svoj števec in štej, kolikokrat se nekaj zgodi med obhodom."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Ključ seznama: "" = splošna vprašanja, "ODDELEK:TEMA" = vprašanja teme. */
const kljuc = (oddelek: string, tema: string) => (oddelek ? `${oddelek}:${tema}` : "");

/** Vprašanja iz šifrantov; dodajanje in odstranjevanje se zapiše v bazo (velja za vse audite). */
function useVprasanjaAudita(): VprasanjaApi {
  const notify = useToast();
  const { s, osvezi } = useSifranti();

  const seznamZa = (k: string, skupina: SkupinaPostavke): Postavka[] => {
    if (!k) return skupina === "SPLOSNO" ? s.splosna : [];
    const [odd, tema] = k.split(":");
    const t = oddelekPoKodi(s, odd)?.teme.find((x) => x.koda === tema);
    return skupina === "OPAZUJ" ? (t?.opazuj ?? []) : skupina === "VPRASAJ" ? (t?.vprasaj ?? []) : (t?.ukrepi ?? []);
  };

  return {
    seznam: (k, skupina) => seznamZa(k, skupina).map((p) => ({ besedilo: p.besedilo, id: p.id })),
    async dodaj(k, skupina, besedilo) {
      if (!s.izBaze) {
        notify("error", BREZ_MIGRACIJE_016, 10000);
        return false;
      }
      try {
        const [odd = "", tema = ""] = k.split(":");
        await dodajPostavko({ oddelek: odd, tema, skupina, besedilo, vrstni_red: novRed(seznamZa(k, skupina)) });
        await osvezi();
        notify("success", "Vprašanje je dodano.");
        return true;
      } catch (e) {
        notify("error", `Ni shranjeno: ${(e as Error).message}`, 10000);
        return false;
      }
    },
    async izbrisi(_k, _skupina, v) {
      if (v.id === null) return notify("error", BREZ_MIGRACIJE_016, 10000);
      if (!window.confirm(`Odstranim vprašanje "${v.besedilo}"? Velja za vse audite.`)) return;
      try {
        await posodobiPostavko(v.id, { visible: false });
        await osvezi();
        notify("success", "Vprašanje je odstranjeno.");
      } catch (e) {
        notify("error", `Ni odstranjeno: ${(e as Error).message}`, 10000);
      }
    },
  };
}

function TemaBlok({
  o,
  t,
  odprt,
  api,
  onVstavi,
  onUkrep,
}: {
  o: Oddelek;
  t: Tema;
  odprt: boolean;
  api: VprasanjaApi;
  onVstavi: (t: string) => void;
  onUkrep: (tema: string, ukrep: string) => void;
}) {
  const k = kljuc(o.koda, t.koda);
  return (
    <details open={odprt} className="group rounded-lg border border-ink-200 open:border-l-4" style={{ borderLeftColor: o.barva }}>
      <summary title={`Prikaži / skrij vprašanja: ${t.naziv}`} className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg p-2.5 hover:bg-ink-50">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.barva }} />
        <span className="flex-1 text-sm font-bold text-ink-900">{t.naziv}</span>
        <ChevronDown className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-2 px-2.5 pb-3">
        {t.opis && <p className="text-xs text-ink-500">{t.opis}</p>}
        <Skupina naslov="Opazuj">
          <SeznamVprasanj api={api} tema={k} skupina="OPAZUJ" vgrajena={[]} onVstavi={onVstavi} />
        </Skupina>
        <Skupina naslov="Vprašaj zaposlene">
          <SeznamVprasanj api={api} tema={k} skupina="VPRASAJ" vgrajena={[]} onVstavi={onVstavi} />
        </Skupina>
        {t.ukrepi.length > 0 && (
          <Skupina naslov="Tipični ukrepi - klik odpre novo ugotovitev">
            <ul className="flex flex-col">
              {t.ukrepi.map((u) => (
                <li key={u.id ?? u.besedilo}>
                  <button
                    type="button"
                    title="Odpri novo ugotovitev s tem ukrepom"
                    onClick={() => onUkrep(t.koda, u.besedilo)}
                    className="flex min-h-9 w-full items-center gap-2 rounded-md py-1 pl-1 text-left text-sm text-ink-700 hover:bg-ok-50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok-500 text-white">
                      <Plus className="h-4 w-4" aria-hidden />
                    </span>
                    {u.besedilo}
                  </button>
                </li>
              ))}
            </ul>
          </Skupina>
        )}
      </div>
    </details>
  );
}

function Vprasanja({
  oddelek,
  tema,
  onVstavi,
  onUkrep,
}: {
  oddelek: string;
  tema: string;
  onVstavi: (t: string) => void;
  onUkrep: (tema: string, ukrep: string) => void;
}) {
  const api = useVprasanjaAudita();
  const { s } = useSifranti();
  const o = oddelekPoKodi(s, oddelek);
  const teme = (o?.teme ?? []).filter((t) => t.aktivna || t.koda === tema);
  const izbrana = teme.find((t) => t.koda === tema);
  const ostale = teme.filter((t) => t.koda !== tema);
  // Ko je tema izbrana, so ostale teme oddelka skrite (manj drsenja); po potrebi jih prikažeš z gumbom.
  const [ostaleOdprte, setOstaleOdprte] = useState(false);
  const prikaziOstale = !izbrana || ostaleOdprte;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-500">
        Klikni <Plus className="inline h-3.5 w-3.5 text-fines-500" aria-hidden /> za vstavitev vprašanja v zapisnik (V: vprašanje, O: tvoj odgovor).
      </p>
      {!o && <p className="rounded-lg bg-warn-50 px-3 py-2 text-sm font-medium text-warn-700">Izberi oddelek - vprašanja oddelka se prikažejo tukaj.</p>}
      {o && izbrana && (
        <div>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-600">Tema audita</h4>
          <TemaBlok o={o} t={izbrana} odprt api={api} onVstavi={onVstavi} onUkrep={onUkrep} />
        </div>
      )}
      <details className="group rounded-lg border border-ink-200">
        <summary title="Prikaži / skrij splošna vprašanja" className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg p-2.5 hover:bg-ink-50">
          <CircleHelp className="h-4 w-4 text-ink-500" aria-hidden />
          <span className="flex-1 text-sm font-bold text-ink-900">Splošna vprašanja</span>
          <ChevronDown className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-2.5 pb-3">
          <SeznamVprasanj api={api} tema="" skupina="SPLOSNO" vgrajena={[]} onVstavi={onVstavi} />
        </div>
      </details>
      {o && izbrana && (
        <button
          type="button"
          title={ostaleOdprte ? "Skrij vprašanja ostalih tem oddelka" : "Prikaži vprašanja ostalih tem oddelka"}
          onClick={() => setOstaleOdprte((x) => !x)}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-ink-300 px-2.5 py-2 text-sm font-semibold text-ink-600 hover:border-fines-500 hover:text-fines-600"
        >
          <span className="flex-1 text-left">{ostaleOdprte ? "Skrij ostale teme" : `Prikaži ostale teme oddelka (${ostale.length})`}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${ostaleOdprte ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
      {o && prikaziOstale && (
        <>
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600">{izbrana ? "Ostale teme" : `Teme oddelka ${o.naziv}`}</h4>
          {ostale.map((t) => (
            <TemaBlok key={t.koda} o={o} t={t} odprt={false} api={api} onVstavi={onVstavi} onUkrep={onUkrep} />
          ))}
        </>
      )}
    </div>
  );
}
