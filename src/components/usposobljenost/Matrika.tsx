"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Factory, FileText, Plus, Wrench } from "lucide-react";
import { formatShort, toIso } from "@/lib/dates";
import { ujemaIskanje } from "@/lib/iskanje";
import { asciiIme } from "@/lib/prenos";
import {
  MATRIKE,
  formatCas,
  imeZaposlenega,
  izvoziMatrikoXlsx,
  naslednjiTermin,
  obdobjeTermina,
  opisStopnje,
  oznakaTermina,
  stolpciMatrike,
  trenutneOcene,
  zaposleniMatrike,
  type Matrika as VrstaMatrike,
  type Ocena,
  type Stolpec,
  type Termin,
  type Zaposleni,
} from "@/lib/usposobljenost";
import { Button } from "@/components/ui/Button";
import { FilterIskanje, FilterPolje, FilterVrstica } from "@/components/ui/Filtri";
import { Izvoz } from "@/components/ui/Izvoz";
import { ErrorText, Loading, WarningText } from "@/components/ui/Notice";
import { PdfPredogled } from "@/components/ui/PdfPredogled";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { Zavihki } from "@/components/ui/Zavihki";
import { FinesekStopnja, LegendaStopenj, PrazenKvadratek } from "./Finesek";
import { IzpitnaPola, type VnosPole } from "./IzpitnaPola";
import { usePodatki } from "./usePodatki";

type Vrstica = { z: Zaposleni; ime: string; ocene: Map<number, Ocena>; termini: Map<number, Termin> };

/** Najmanjša širina stolpca stopnje; ostali prostor si stolpci razdelijo enako. */
const SIRINA_STOLPCA = 104;

export function MatrikaUsposobljenosti() {
  const router = useRouter();
  const { podatki, napaka, niBaze, nalozi } = usePodatki();
  const [matrika, setMatrika] = useState<VrstaMatrike>("PROIZVODNJA");
  const [iskanje, setIskanje] = useState("");
  const [pola, setPola] = useState<VnosPole | null>(null);
  const [tisk, setTisk] = useState(false);
  const danes = toIso(new Date());

  const stolpci = useMemo(() => (podatki ? stolpciMatrike(podatki, matrika) : []), [podatki, matrika]);
  const vrstice = useMemo<Vrstica[]>(() => {
    if (!podatki) return [];
    const t = trenutneOcene(podatki.ocene);
    return zaposleniMatrike(podatki, matrika).map((z) => ({
      z,
      ime: imeZaposlenega(z),
      ocene: new Map(
        stolpci.flatMap((s) => {
          const o = t.za(z.id, s.id);
          return o ? [[s.id, o] as const] : [];
        }),
      ),
      termini: new Map(
        stolpci.flatMap((s) => {
          const x = naslednjiTermin(z.id, s.id, podatki.termini, danes);
          return x ? [[s.id, x] as const] : [];
        }),
      ),
    }));
  }, [podatki, matrika, stolpci, danes]);

  const sort = useRazvrscanje<Vrstica, string>({
    ime: (v) => `${v.z.priimek} ${v.z.ime}`,
    ...Object.fromEntries(stolpci.map((s) => [`s${s.id}`, (v: Vrstica) => v.ocene.get(s.id)?.ocena ?? null])),
  });

  if (niBaze) {
    return (
      <WarningText className="mx-auto max-w-xl">
        Tabele usposobljenosti še niso v bazi - v Supabase zaženi skripti <strong>034_usposobljenost.sql</strong> in <strong>035_usposobljenost_osebe.sql</strong>.
      </WarningText>
    );
  }
  if (napaka && !podatki) return <ErrorText className="mx-auto max-w-xl">{napaka}</ErrorText>;
  if (!podatki) return <Loading />;

  const prikazane = sort.razvrsti(vrstice.filter((v) => ujemaIskanje(iskanje, [v.ime])));
  const izvozVrstic = prikazane.map((v) => ({
    ime: v.ime,
    ocene: stolpci.map((s) => v.ocene.get(s.id)?.ocena ?? null),
    termini: stolpci.map((s) => {
      const t = v.termini.get(s.id);
      return t ? oznakaTermina(t) : "";
    }),
  }));
  const m = MATRIKE[matrika];
  const naslovPdf = `Matrika usposobljenosti - ${m.label}`;
  const imeDatoteke = `Matrika_usposobljenosti_${asciiIme(m.label)}_${danes}`;

  // Stolpec imena je širok toliko kot najdaljše ime, ostali stolpci so enako široki
  const znakovImena = Math.max(12, ...vrstice.map((v) => v.ime.length)) + 1;
  const sirinaImena = `calc(${znakovImena}ch + 1.5rem)`;
  const najmanjSirina = `calc(${znakovImena}ch + 1.5rem + ${stolpci.length * SIRINA_STOLPCA}px)`;

  async function pripraviPdf() {
    const { matrikaPdf } = await import("@/lib/usposobljenostPdf");
    return matrikaPdf({ naslov: naslovPdf, stolpci, vrstice: izvozVrstic });
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Matrika usposobljenosti</h2>
          <p className="text-sm text-ink-500">Znanje zaposlenih po delovnih mestih in družinah izdelkov. Klik na celico odpre izpitno polo.</p>
        </div>
        <Button hint="Odpri koledar ocenjevanj in zgodovino izpitov" variant="neutral" icon={CalendarClock} onClick={() => router.push("/proizvodnja/usposobljenost/izobrazevanja")}>
          Izobraževanja
        </Button>
      </div>

      <section className="flex flex-col">
        <Zavihki
          label="Matrika"
          value={matrika}
          onChange={setMatrika}
          zavihki={[
            { koda: "PROIZVODNJA", label: "Proizvodnja", hint: "Znanje zaposlenih po delovnih mestih", icon: Factory },
            { koda: "MONTAZA", label: "Montaža", hint: "Znanje zaposlenih po družinah izdelkov", icon: Wrench },
          ]}
        />
        <div className="fp-card flex flex-col gap-3 rounded-tl-none p-3 sm:p-4">
          <FilterVrstica>
            <FilterIskanje value={iskanje} onChange={setIskanje} placeholder="Ime ali priimek ..." hint="Išči zaposlenega po imenu in priimku" />
            <div className="ml-auto flex flex-wrap items-end gap-3">
              <FilterPolje label="Izvoz">
                <Button hint="Odpri predogled PDF za tisk" variant="primary" icon={FileText} disabled={!prikazane.length} onClick={() => setTisk(true)}>
                  PDF
                </Button>
              </FilterPolje>
              <Izvoz
                label={null}
                formati={[
                  {
                    koda: "xlsx",
                    label: "Excel",
                    hint: "Prenesi prikazano matriko v Excel",
                    disabled: !prikazane.length,
                    akcija: () => izvoziMatrikoXlsx(matrika, stolpci, izvozVrstic, `${imeDatoteke}.xlsx`),
                  },
                ]}
              />
            </div>
          </FilterVrstica>

          <LegendaStopenj />
          <NaslednjeOcenjevanje vrstice={vrstice} stolpci={stolpci} />

          <TabelaOkvir>
            <table className="w-full table-fixed text-sm" style={{ minWidth: najmanjSirina }}>
              <colgroup>
                <col style={{ width: sirinaImena }} />
                {stolpci.map((s) => (
                  <col key={s.id} />
                ))}
              </colgroup>
              <thead className="fp-thead">
                <tr>
                  <SortTh sort={sort} kljuc="ime" className="sticky left-0 z-20 pl-3">
                    Zaposleni
                  </SortTh>
                  {stolpci.map((s) => (
                    <SortTh key={s.id} sort={sort} kljuc={`s${s.id}`} className="text-center" hint="Razvrsti po stopnji">
                      {s.naziv}
                    </SortTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prikazane.length === 0 && (
                  <tr>
                    <td colSpan={stolpci.length + 1} className="px-3 py-6 text-center text-ink-500">
                      Ni zaposlenih za izbrane filtre.
                    </td>
                  </tr>
                )}
                {prikazane.map((v) => (
                  <tr key={v.z.id} className="border-b border-ink-100 hover:bg-ink-50">
                    <td className="sticky left-0 z-[1] truncate bg-white px-3 py-1 font-semibold text-ink-900">{v.ime}</td>
                    {stolpci.map((s) => (
                      <Celica key={s.id} ime={v.ime} stolpec={s} ocena={v.ocene.get(s.id) ?? null} termin={v.termini.get(s.id) ?? null} onKlik={() => setPola({ zaposleni: v.z, stolpec: s })} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaOkvir>
        </div>
      </section>

      {pola && (
        <IzpitnaPola
          vnos={pola}
          podatki={podatki}
          onClose={() => setPola(null)}
          onShranjeno={() => {
            setPola(null);
            nalozi();
          }}
        />
      )}
      {tisk && <PdfPredogled naslov={naslovPdf} pripravi={pripraviPdf} imeDatoteke={`${imeDatoteke}.pdf`} onClose={() => setTisk(false)} />}
    </div>
  );
}

function Celica({ ime, stolpec, ocena, termin, onKlik }: { ime: string; stolpec: Stolpec; ocena: Ocena | null; termin: Termin | null; onKlik: () => void }) {
  const oTerminu = termin ? ` Naslednje ocenjevanje ${oznakaTermina(termin)}.` : "";
  const opis = ocena?.ocena
    ? `${ime} · ${stolpec.naziv}: ${ocena.ocena} - ${opisStopnje(ocena.ocena)}. Ocenjeno ${formatCas(ocena.cas)}, ${ocena.ocenjevalec}.${oTerminu} Klik: izpitna pola`
    : `Oceni: ${ime} · ${stolpec.naziv}.${oTerminu}`;
  return (
    <td className="border-l border-ink-100 p-0.5 text-center">
      <button type="button" title={opis} aria-label={opis} onClick={onKlik} className="group relative flex h-[84px] w-full flex-col items-center justify-center gap-0.5 rounded-md transition-colors hover:bg-fines-50">
        {ocena?.ocena ? (
          <FinesekStopnja stopnja={ocena.ocena} title={opis} />
        ) : (
          <span className="relative">
            <PrazenKvadratek title={opis} />
            <Plus className="absolute inset-0 m-auto h-5 w-5 text-ink-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100" aria-hidden />
          </span>
        )}
        {termin && <span className="text-[10px] font-bold leading-none text-fines-600">{oznakaTermina(termin)}</span>}
      </button>
    </td>
  );
}

/** Povzetek: prvi prihajajoči termin in kdo se v njem ocenjuje. */
function NaslednjeOcenjevanje({ vrstice, stolpci }: { vrstice: Vrstica[]; stolpci: Stolpec[] }) {
  const vsi = vrstice.flatMap((v) => stolpci.flatMap((s) => {
    const t = v.termini.get(s.id);
    return t ? [{ t, opis: `${v.ime} · ${s.naziv}` }] : [];
  }));
  if (!vsi.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-600">
        <CalendarClock className="h-4 w-4 text-ink-400" aria-hidden />
        Naslednje ocenjevanje še ni določeno.
      </p>
    );
  }
  const prvi = vsi.reduce((a, b) => (b.t.datum_od < a.t.datum_od ? b : a)).t;
  const istega = vsi.filter((x) => x.t.datum_od === prvi.datum_od && x.t.datum_do === prvi.datum_do).map((x) => x.opis);
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-700" title={`Ocenjevanje: ${formatShort(prvi.datum_od)} - ${formatShort(prvi.datum_do)}`}>
      <CalendarClock className="h-4 w-4 text-fines-500" aria-hidden />
      <span className="font-bold">Naslednje ocenjevanje: {oznakaTermina(prvi)}</span>
      <span className="text-ink-500">({obdobjeTermina(prvi)})</span>
      <span>
        · {istega.slice(0, 6).join(", ")}
        {istega.length > 6 ? ` in še ${istega.length - 6}` : ""}
      </span>
    </p>
  );
}
