"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import type { IsoDate } from "@/lib/dates";
import {
  aktivneTocke,
  naloziKontrolneTocke,
  naloziSklRutino,
  naloziSklSlike,
  shraniSklRutino,
  sklImaOdstopanje,
  sklIzpolnjeno,
  type KontrolnaTocka,
  type SklOdgovori,
  type SklRutinaZapis,
  type SklSlika,
} from "@/lib/rutina";
import { compressImage } from "@/lib/images";
import { useNeshranjeno } from "@/lib/neshranjeno";
import { supabaseConfigured } from "@/lib/supabase";
import { DaNe } from "@/components/ui/Choice";
import { FilterChips } from "@/components/ui/FilterChips";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { DanGlava } from "./DanGlava";
import { PhotoField } from "./PhotoField";
import { SaveBar } from "./SaveBar";
import { StatusBadge } from "./StatusBadge";

const PRAZNO: SklOdgovori = { odgovor: null, dosezen_procent: null, komentar: null, casovne_izgube_min: 0 };

export function SklRutina({ datum }: { datum: IsoDate }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <SklRutinaInner datum={datum} />;
}

function SklRutinaInner({ datum }: { datum: IsoDate }) {
  const notify = useToast();
  const [sekcija, setSekcija] = useState("Vsi");

  const [tocke, setTocke] = useState<KontrolnaTocka[] | null>(null);
  const [zapisiDne, setZapisiDne] = useState<SklRutinaZapis[] | null>(null);
  const [slike, setSlike] = useState<SklSlika[]>([]);
  const [shranjujem, setShranjujem] = useState(false);

  const [urejanja, setUrejanja] = useState<Record<number, SklOdgovori>>({});
  const [noveSlike, setNoveSlike] = useState<Record<number, Blob>>({});
  const [verzija, setVerzija] = useState(0);

  const steviloSprememb = Object.keys(urejanja).length + Object.keys(noveSlike).length;
  useNeshranjeno(steviloSprememb > 0);

  async function naloziDan() {
    const [r, s] = await Promise.all([naloziSklRutino(datum, datum), naloziSklSlike(datum)]);
    setZapisiDne(r);
    setSlike(s);
  }

  useEffect(() => {
    let preklic = false;
    Promise.all([naloziKontrolneTocke(), naloziSklRutino(datum, datum), naloziSklSlike(datum)])
      .then(([t, r, s]) => {
        if (preklic) return;
        setTocke(t);
        setZapisiDne(r);
        setSlike(s);
      })
      .catch((e) => notify("error", `Napaka pri nalaganju rutine: ${e.message}`));
    return () => {
      preklic = true;
    };
  }, [datum, notify]);

  const aktivne = useMemo(() => (tocke ? aktivneTocke(tocke, datum) : []), [tocke, datum]);
  const sekcije = useMemo(() => ["Vsi", ...new Set(aktivne.map((t) => t.sekcija).filter(Boolean))], [aktivne]);
  const prikazane = aktivne.filter((t) => sekcija === "Vsi" || t.sekcija === sekcija);
  const nalozeno = tocke !== null && zapisiDne !== null;
  const izpolnjenih = (zapisiDne ?? []).filter(
    (z) => z.izpolnjeno && aktivne.some((t) => t.id === z.kontrolna_tocka_id),
  ).length;

  function vrednosti(tockaId: number): SklOdgovori {
    if (urejanja[tockaId]) return urejanja[tockaId];
    const z = zapisiDne?.find((r) => r.kontrolna_tocka_id === tockaId);
    return z
      ? {
          odgovor: z.odgovor,
          dosezen_procent: z.dosezen_procent,
          komentar: z.komentar,
          casovne_izgube_min: z.casovne_izgube_min,
        }
      : PRAZNO;
  }

  function nastavi(tockaId: number, sprememba: Partial<SklOdgovori>) {
    setUrejanja((u) => ({ ...u, [tockaId]: { ...vrednosti(tockaId), ...sprememba } }));
  }

  async function dodajSliko(tockaId: number, file: File) {
    try {
      const blob = await compressImage(file);
      setNoveSlike((s) => ({ ...s, [tockaId]: blob }));
    } catch (e) {
      notify("error", (e as Error).message);
    }
  }

  async function shrani() {
    setShranjujem(true);
    try {
      await shraniSklRutino(
        datum,
        Object.entries(urejanja).map(([id, odgovori]) => ({ kontrolnaTockaId: Number(id), odgovori })),
        Object.entries(noveSlike).map(([id, blob]) => ({ kontrolnaTockaId: Number(id), blob })),
        slike,
        zapisiDne ?? [],
      );
      setUrejanja({});
      setNoveSlike({});
      setVerzija((x) => x + 1);
      notify("success", "Skladiščna rutina je uspešno shranjena.");
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
        koledarHref={`/skladisce/rutina?mesec=${datum.slice(0, 7)}`}
        povzetek={nalozeno ? `Izpolnjeno ${izpolnjenih} od ${aktivne.length} kontrolnih točk` : undefined}
        prikaziDanes={nalozeno}
      />

      {sekcije.length > 2 && (
        <FilterChips items={sekcije} value={sekcija} onChange={setSekcija} hintPrefix="Prikaži sekcijo" />
      )}

      {!nalozeno ? (
        <Loading />
      ) : prikazane.length === 0 ? (
        <div className="fp-card p-6 text-center text-ink-600">Za izbrani dan ni aktivnih kontrolnih točk.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {prikazane.map((t) => {
            const v = vrednosti(t.id);
            const zapis = zapisiDne?.find((r) => r.kontrolna_tocka_id === t.id);
            const cilj = zapis?.ciljni_procent ?? t.ciljni_procent;
            const nok = sklImaOdstopanje(t, v, cilj);
            const imaSliko = !!noveSlike[t.id] || slike.some((s) => s.rutina_id === zapis?.id);
            const manjkaOpis = t.opis_obvezen_pri_nok && !v.komentar?.trim();
            const manjkaSlika = t.slika_obvezna_pri_nok && !imaSliko;
            const procent = v.dosezen_procent ?? 0;

            return (
              <article key={t.id} className="fp-card flex flex-col gap-3 p-4">
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fines-500">
                      {t.sekcija}
                      {t.cas_kontrole && (
                        <>
                          <Clock className="ml-1 h-3.5 w-3.5" aria-hidden />
                          {t.cas_kontrole}
                        </>
                      )}
                    </p>
                    <h3 className="text-lg font-bold text-ink-900">{t.naziv}</h3>
                  </div>
                  <StatusBadge izpolnjeno={sklIzpolnjeno(t, v)} odstopanje={nok} spremenjeno={!!urejanja[t.id]} />
                </header>

                <div className="flex items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="font-semibold text-ink-800">{t.vprasanje}</p>
                    {t.navodilo?.trim() && <p className="text-sm text-ink-500">{t.navodilo}</p>}
                  </div>
                  <PhotoField
                    label="Slika"
                    savedUrl={slike.find((s) => s.rutina_id === zapis?.id)?.url}
                    pending={noveSlike[t.id]}
                    required={nok && t.slika_obvezna_pri_nok}
                    onPick={(f) => dodajSliko(t.id, f)}
                  />
                </div>

                {t.tip_vnosa === "DA_NE" ? (
                  <DaNe
                    value={v.odgovor}
                    subject={t.naziv}
                    onChange={(x) => nastavi(t.id, { odgovor: x })}
                  />
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-semibold text-ink-700">Dosežen procent</span>
                      <span>
                        <strong className={`text-lg ${nok ? "text-nok-600" : "text-ink-900"}`}>{procent} %</strong>
                        {cilj !== null && <span className="ml-2 text-ink-500">Cilj: {cilj} %</span>}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={procent}
                      title="Nastavi dosežen procent dnevnega plana"
                      aria-label="Dosežen procent"
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        nastavi(t.id, { dosezen_procent: n === 0 ? null : n });
                      }}
                      className="fp-range h-8 w-full"
                    />
                    <div className="flex justify-between text-xs text-ink-400">
                      <span>0 %</span>
                      <span>100 %</span>
                    </div>
                  </div>
                )}

                <textarea
                  key={`${datum}-${t.id}-${verzija}`}
                  defaultValue={v.komentar ?? ""}
                  placeholder="Opis napake, vzroka ali dodatna opomba ..."
                  title="Vpiši opis napake ali opombo"
                  rows={2}
                  onBlur={(e) => {
                    const txt = e.target.value.trim() || null;
                    if (txt !== (v.komentar ?? null)) nastavi(t.id, { komentar: txt });
                  }}
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                />

                {t.casovne_izgube_omogocene && (
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
                    Časovne izgube:
                    <input
                      key={`${datum}-${t.id}-${verzija}-izg`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      defaultValue={v.casovne_izgube_min || ""}
                      placeholder="0"
                      title="Vpiši časovne izgube v minutah"
                      onBlur={(e) => {
                        const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                        if (n !== v.casovne_izgube_min) nastavi(t.id, { casovne_izgube_min: n });
                      }}
                      className="h-10 w-24 rounded-lg border border-ink-200 px-3 text-right focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                    />
                    <span className="font-normal text-ink-500">min</span>
                  </label>
                )}

                {nok && (manjkaOpis || manjkaSlika) && (
                  <WarningText>
                    {manjkaOpis && manjkaSlika
                      ? "Pri odstopanju sta obvezna opis in fotografija."
                      : manjkaOpis
                        ? "Pri odstopanju je obvezen opis napake."
                        : "Pri odstopanju je obvezna fotografija."}
                  </WarningText>
                )}
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
