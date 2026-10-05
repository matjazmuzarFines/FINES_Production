"use client";

import { useEffect, useMemo, useState } from "react";
import type { IsoDate } from "@/lib/dates";
import {
  PR_PODROCJA,
  aktivnaDelovnaMesta,
  naloziDelovnaMesta,
  naloziPrRutino,
  naloziPrSlike,
  prImaOdstopanje,
  prPodrocjeNok,
  shraniPrRutino,
  type DelovnoMesto,
  type PrOdgovori,
  type PrPodrocje,
  type PrRutinaZapis,
  type PrSlika,
} from "@/lib/rutina";
import { compressImage } from "@/lib/images";
import { useNeshranjeno } from "@/lib/neshranjeno";
import { supabaseConfigured } from "@/lib/supabase";
import { ChoiceGroup, daNeOptions, scoreOptions } from "@/components/ui/Choice";
import { FilterChips } from "@/components/ui/FilterChips";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { DanGlava } from "./DanGlava";
import { PhotoField } from "./PhotoField";
import { SaveBar } from "./SaveBar";
import { StatusBadge } from "./StatusBadge";

const PRAZNO: PrOdgovori = {
  plan_pripravljen: null,
  delovno_mesto_urejeno: null,
  kakovost_izdelka: null,
  ocena_procesa: null,
  komentar: null,
};

const VPRASANJA: { podrocje: PrPodrocje; label: string; tip: "DA_NE" | "OCENA"; polje: keyof PrOdgovori }[] = [
  { podrocje: "PLAN", label: "Dnevni delovni plan je pripravljen", tip: "DA_NE", polje: "plan_pripravljen" },
  { podrocje: "UREJENOST", label: "Delovno mesto je urejeno", tip: "DA_NE", polje: "delovno_mesto_urejeno" },
  { podrocje: "KAKOVOST", label: "Kakovost trenutnega izdelka", tip: "OCENA", polje: "kakovost_izdelka" },
  { podrocje: "PROCES", label: "Ocena delovnega procesa", tip: "OCENA", polje: "ocena_procesa" },
];

const PODROCJE_LABEL: Record<PrPodrocje, string> = {
  PLAN: "Plan",
  UREJENOST: "Urejenost",
  KAKOVOST: "Kakovost",
  PROCES: "Proces",
};

export function PrRutina({ datum }: { datum: IsoDate }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <PrRutinaInner datum={datum} />;
}

function PrRutinaInner({ datum }: { datum: IsoDate }) {
  const notify = useToast();
  const [oddelek, setOddelek] = useState("Vsi");

  const [mesta, setMesta] = useState<DelovnoMesto[] | null>(null);
  const [zapisiDne, setZapisiDne] = useState<PrRutinaZapis[] | null>(null);
  const [slike, setSlike] = useState<PrSlika[]>([]);
  const [shranjujem, setShranjujem] = useState(false);

  const [urejanja, setUrejanja] = useState<Record<number, PrOdgovori>>({});
  const [noveSlike, setNoveSlike] = useState<Record<string, Blob>>({});
  // Poveča se ob preklicu/shranjevanju, da se vnosna polja ponastavijo.
  const [verzija, setVerzija] = useState(0);

  const steviloSprememb = Object.keys(urejanja).length + Object.keys(noveSlike).length;
  useNeshranjeno(steviloSprememb > 0);

  async function naloziDan() {
    const [r, s] = await Promise.all([naloziPrRutino(datum, datum), naloziPrSlike(datum)]);
    setZapisiDne(r);
    setSlike(s);
  }

  useEffect(() => {
    let preklic = false;
    Promise.all([naloziDelovnaMesta(), naloziPrRutino(datum, datum), naloziPrSlike(datum)])
      .then(([m, r, s]) => {
        if (preklic) return;
        setMesta(m);
        setZapisiDne(r);
        setSlike(s);
      })
      .catch((e) => notify("error", `Napaka pri nalaganju rutine: ${e.message}`));
    return () => {
      preklic = true;
    };
  }, [datum, notify]);

  const aktivna = useMemo(() => (mesta ? aktivnaDelovnaMesta(mesta, datum) : []), [mesta, datum]);
  const oddelki = useMemo(() => ["Vsi", ...new Set(aktivna.map((m) => m.oddelek).filter(Boolean))], [aktivna]);
  const prikazana = aktivna.filter((m) => oddelek === "Vsi" || m.oddelek === oddelek);
  const nalozeno = mesta !== null && zapisiDne !== null;
  const izpolnjenih = (zapisiDne ?? []).filter(
    (z) => z.izpolnjeno && aktivna.some((m) => m.id === z.delovno_mesto_id),
  ).length;

  function vrednosti(mestoId: number): PrOdgovori {
    if (urejanja[mestoId]) return urejanja[mestoId];
    const z = zapisiDne?.find((r) => r.delovno_mesto_id === mestoId);
    return z
      ? {
          plan_pripravljen: z.plan_pripravljen,
          delovno_mesto_urejeno: z.delovno_mesto_urejeno,
          kakovost_izdelka: z.kakovost_izdelka,
          ocena_procesa: z.ocena_procesa,
          komentar: z.komentar,
        }
      : PRAZNO;
  }

  function nastavi(mestoId: number, sprememba: Partial<PrOdgovori>) {
    setUrejanja((u) => ({ ...u, [mestoId]: { ...vrednosti(mestoId), ...sprememba } }));
  }

  async function dodajSliko(mestoId: number, podrocje: PrPodrocje, file: File) {
    try {
      const blob = await compressImage(file);
      setNoveSlike((s) => ({ ...s, [`${mestoId}|${podrocje}`]: blob }));
    } catch (e) {
      notify("error", (e as Error).message);
    }
  }

  async function shrani() {
    setShranjujem(true);
    try {
      await shraniPrRutino(
        datum,
        Object.entries(urejanja).map(([id, odgovori]) => ({ delovnoMestoId: Number(id), odgovori })),
        Object.entries(noveSlike).map(([k, blob]) => {
          const [id, podrocje] = k.split("|");
          return { delovnoMestoId: Number(id), podrocje: podrocje as PrPodrocje, blob };
        }),
        slike,
        zapisiDne ?? [],
      );
      setUrejanja({});
      setNoveSlike({});
      setVerzija((x) => x + 1);
      notify("success", "Rutina je uspešno shranjena.");
    } catch (e) {
      notify("error", `Napaka pri shranjevanju: ${(e as Error).message}`, 10000);
    } finally {
      await naloziDan().catch(() => {});
      setShranjujem(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <DanGlava
        datum={datum}
        koledarHref={`/proizvodnja/rutina?mesec=${datum.slice(0, 7)}`}
        povzetek={nalozeno ? `Izpolnjeno ${izpolnjenih} od ${aktivna.length} delovnih mest` : undefined}
        prikaziDanes={nalozeno}
      />

      {oddelki.length > 2 && (
        <FilterChips items={oddelki} value={oddelek} onChange={setOddelek} hintPrefix="Prikaži oddelek" />
      )}

      {!nalozeno ? (
        <Loading />
      ) : prikazana.length === 0 ? (
        <div className="fp-card p-6 text-center text-ink-600">Za izbrani dan ni aktivnih delovnih mest.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {prikazana.map((m) => {
            const v = vrednosti(m.id);
            const zapis = zapisiDne?.find((r) => r.delovno_mesto_id === m.id);
            const izpolnjeno =
              v.plan_pripravljen !== null &&
              v.delovno_mesto_urejeno !== null &&
              v.kakovost_izdelka !== null &&
              v.ocena_procesa !== null;
            const manjkaSlika = PR_PODROCJA.some(
              (p) =>
                prPodrocjeNok(v, p) &&
                !noveSlike[`${m.id}|${p}`] &&
                !slike.some((s) => s.rutina_id === zapis?.id && s.podrocje === p),
            );
            return (
              <article key={m.id} className="fp-card flex flex-col gap-3 p-4">
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-ink-900">{m.naziv}</h3>
                    <p className="text-sm text-ink-500">{m.oddelek}</p>
                  </div>
                  <StatusBadge
                    izpolnjeno={izpolnjeno}
                    odstopanje={prImaOdstopanje(v)}
                    spremenjeno={!!urejanja[m.id]}
                  />
                </header>

                <div className="flex flex-col divide-y divide-ink-100">
                  {VPRASANJA.map((q) => {
                    const savedUrl = slike.find((s) => s.rutina_id === zapis?.id && s.podrocje === q.podrocje)?.url;
                    return (
                      <div key={q.podrocje} className="flex items-center gap-3 py-3">
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <span className="text-sm font-semibold text-ink-700">{q.label}</span>
                          {q.tip === "DA_NE" ? (
                            <ChoiceGroup
                              value={v[q.polje] as "DA" | "NE" | null}
                              options={daNeOptions(q.label)}
                              onChange={(x) => nastavi(m.id, { [q.polje]: x })}
                            />
                          ) : (
                            <ChoiceGroup
                              value={v[q.polje] as number | null}
                              options={scoreOptions(q.label)}
                              onChange={(x) => nastavi(m.id, { [q.polje]: x })}
                            />
                          )}
                        </div>
                        <PhotoField
                          label={PODROCJE_LABEL[q.podrocje]}
                          savedUrl={savedUrl}
                          pending={noveSlike[`${m.id}|${q.podrocje}`]}
                          required={prPodrocjeNok(v, q.podrocje)}
                          onPick={(f) => dodajSliko(m.id, q.podrocje, f)}
                        />
                      </div>
                    );
                  })}
                </div>

                <textarea
                  key={`${datum}-${m.id}-${verzija}`}
                  defaultValue={v.komentar ?? ""}
                  placeholder="Komentar oz. opis nepravilnosti"
                  title="Vpiši komentar ali opis nepravilnosti"
                  rows={2}
                  onBlur={(e) => {
                    const t = e.target.value.trim() || null;
                    if (t !== (v.komentar ?? null)) nastavi(m.id, { komentar: t });
                  }}
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                />

                {manjkaSlika && <WarningText>Za NE ali oceno 1–2 je potrebno dodati fotografijo.</WarningText>}
              </article>
            );
          })}
        </div>
      )}

      <SaveBar
        steviloSprememb={steviloSprememb}
        shranjujem={shranjujem}
        onSave={shrani}
        onReset={() => {
          setUrejanja({});
          setNoveSlike({});
          setVerzija((x) => x + 1);
        }}
      />
    </div>
  );
}
