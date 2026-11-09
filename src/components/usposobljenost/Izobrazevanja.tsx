"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, History, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { addDays, formatShort, isoWeek, isoWeekYear, mondayOf, toIso, type IsoDate } from "@/lib/dates";
import { ujemaIskanje } from "@/lib/iskanje";
import {
  MATRIKE,
  SEZNAM_MATRIK,
  STANJE_TERMINA,
  VRSTNI_RED_STANJ,
  formatCas,
  imeZaposlenega,
  izvoziZgodovinoXlsx,
  obdobjeTermina,
  oznakaTermina,
  shraniTermin,
  skrijTermin,
  stanjeTermina,
  stolpciMatrike,
  trenutneOcene,
  zaposleniMatrike,
  type Matrika,
  type Ocena,
  type Podatki,
  type Stolpec,
  type Termin,
  type VrsticaZgodovine,
  type Zaposleni,
} from "@/lib/usposobljenost";
import { Button, IconButton } from "@/components/ui/Button";
import { FilterIskanje, FilterPolje, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { IzbiraTednov } from "@/components/ui/IzbiraTednov";
import { Izvoz } from "@/components/ui/Izvoz";
import { KoledarTednov, LegendaKoledarja, TA_TEDEN_CLS, type CelicaTedna } from "@/components/ui/KoledarTednov";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ErrorText, Loading, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { Zavihki } from "@/components/ui/Zavihki";
import { CelicaStopnje, FinesekStopnja } from "./Finesek";
import { IzpitnaPola, IzpitnaPolaOgled, type VnosPole } from "./IzpitnaPola";
import { usePodatki } from "./usePodatki";

const POLJE =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 sm:text-sm";

const PRAZEN_TEDEN = "bg-white text-ink-500 border-ink-200";
const PRETEKLI_TEDEN = "bg-ink-100 text-ink-400 border-ink-200";

type Pogled = "KOLEDAR" | "ZGODOVINA";
type FilterMatrike = "VSE" | Matrika;
type FilterRezultata = "VSI" | "DA" | "NE";

const MOZNOSTI_MATRIKE: { value: FilterMatrike; label: string; hint: string }[] = [
  { value: "VSE", label: "Vse", hint: "Prikaži proizvodnjo in montažo" },
  { value: "PROIZVODNJA", label: "Proizvodnja", hint: "Samo delovna mesta proizvodnje" },
  { value: "MONTAZA", label: "Montaža", hint: "Samo družine izdelkov v montaži" },
];

export function Izobrazevanja() {
  const { podatki, napaka, niBaze, nalozi } = usePodatki();
  const danes = toIso(new Date());
  const taTeden = mondayOf(danes);
  const [pogled, setPogled] = useState<Pogled>("KOLEDAR");
  const [leto, setLeto] = useState(() => isoWeekYear(taTeden));
  const [matrika, setMatrika] = useState<FilterMatrike>("VSE");
  const [rezultat, setRezultat] = useState<FilterRezultata>("VSI");
  const [iskanje, setIskanje] = useState("");
  const [teden, setTeden] = useState<IsoDate | null>(null);
  const [urejanje, setUrejanje] = useState<Termin | "NOV" | null>(null);
  const [pola, setPola] = useState<VnosPole | null>(null);
  const [ogled, setOgled] = useState<Ocena | null>(null);

  const zgodovina = useMemo<VrsticaZgodovine[]>(() => {
    if (!podatki) return [];
    return podatki.ocene.map((o) => {
      const z = podatki.zaposleni.find((x) => x.id === o.zaposleni_id);
      const s = podatki.stolpci.find((x) => x.id === o.stolpec_id);
      const t = podatki.termini.find((x) => x.id === o.termin_id);
      return { o, zaposleni: z ? imeZaposlenega(z) : "-", stolpec: s?.naziv ?? "-", matrika: s ? MATRIKE[s.matrika].label : "-", termin: t ? oznakaTermina(t) : "" };
    });
  }, [podatki]);

  const sort = useRazvrscanje<VrsticaZgodovine, string>({
    cas: (v) => v.o.cas,
    zaposleni: (v) => v.zaposleni,
    matrika: (v) => v.matrika,
    stolpec: (v) => v.stolpec,
    termin: (v) => v.termin || null,
    ocena: (v) => v.o.ocena,
    rezultat: (v) => (v.o.opravil ? 1 : 2),
    ocenjevalec: (v) => v.o.ocenjevalec,
    razlogi: (v) => v.o.razlogi,
    komentar: (v) => v.o.komentar,
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

  const labelMatrike = matrika === "VSE" ? null : MATRIKE[matrika].label;
  // privzeto novejši izpiti zgoraj; klik na glavo razvrsti po stolpcu
  const filtrirani = sort.razvrsti(
    [...zgodovina]
      .reverse()
      .filter(
        (v) =>
          (!labelMatrike || v.matrika === labelMatrike) &&
          (rezultat === "VSI" || v.o.opravil === (rezultat === "DA")) &&
          ujemaIskanje(iskanje, [v.zaposleni, v.stolpec, v.o.ocenjevalec, v.o.razlogi, v.o.komentar]),
      ),
  );

  const stolpciPoId = new Map(podatki.stolpci.map((s) => [s.id, s]));
  const termini = podatki.termini.filter((t) => t.visible && t.zaposleni_id !== null && (matrika === "VSE" || stolpciPoId.get(t.stolpec_id)?.matrika === matrika));
  const terminiTedna = (pon: IsoDate) => termini.filter((t) => t.datum_od <= addDays(pon, 6) && t.datum_do >= pon);

  function celica(pon: IsoDate): CelicaTedna {
    const vTednu = terminiTedna(pon);
    const obdobje = `${isoWeek(pon)}. teden (${formatShort(pon)})`;
    if (!vTednu.length) return { cls: pon < taTeden ? PRETEKLI_TEDEN : PRAZEN_TEDEN, title: `${obdobje}: ni ocenjevanj` };
    const stanja = vTednu.map((t) => stanjeTermina(podatki!, t, danes));
    const st = VRSTNI_RED_STANJ.find((s) => stanja.includes(s))!;
    return {
      cls: STANJE_TERMINA[st].cls,
      title: `Odpri ocenjevanja: ${obdobje}, ${vTednu.length} terminov - ${STANJE_TERMINA[st].label}`,
      onClick: () => setTeden(pon),
      oznake: (
        <span className="absolute right-0.5 top-0.5 rounded-full bg-ink-800 px-1 text-[9px] leading-tight text-white" aria-hidden>
          {vTednu.length}
        </span>
      ),
    };
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Izobraževanja</h2>
          <p className="text-sm text-ink-500">Klik na teden pokaže ocenjevanja tega tedna. Zgodovina izpitov je v svojem zavihku.</p>
        </div>
        {pogled === "KOLEDAR" && (
          <div className="flex flex-wrap items-center gap-2">
            <IconButton hint="Prikaži prejšnje leto" variant="neutral" icon={ChevronLeft} onClick={() => setLeto(leto - 1)} />
            <span className="min-w-14 text-center text-lg font-bold text-ink-800">{leto}</span>
            <IconButton hint="Prikaži naslednje leto" variant="neutral" icon={ChevronRight} onClick={() => setLeto(leto + 1)} />
          </div>
        )}
      </div>

      <section className="flex flex-col">
        <Zavihki
          label="Pogled izobraževanj"
          value={pogled}
          onChange={setPogled}
          zavihki={[
            { koda: "KOLEDAR", label: "Koledar", hint: "Termini ocenjevanja po tednih", icon: CalendarDays },
            { koda: "ZGODOVINA", label: `Zgodovina (${podatki.ocene.length})`, hint: "Vse izpitne pole zaposlenih", icon: History },
          ]}
        />
        <div className="fp-card flex flex-col gap-3 rounded-tl-none p-3 sm:p-4">
          <FilterVrstica>
            {pogled === "ZGODOVINA" && <FilterIskanje value={iskanje} onChange={setIskanje} placeholder="Zaposleni, ocenjevalec, razlogi ..." hint="Išči po zaposlenem, ocenjevalcu in razlogih" />}
            <FilterPreklopnik label="Matrika" value={matrika} onChange={setMatrika} options={MOZNOSTI_MATRIKE} />
            {pogled === "ZGODOVINA" && (
              <FilterPreklopnik
                label="Rezultat"
                value={rezultat}
                onChange={setRezultat}
                options={[
                  { value: "VSI", label: "Vsi", hint: "Prikaži vse izpite" },
                  { value: "DA", label: "Opravil", hint: "Samo opravljeni izpiti" },
                  { value: "NE", label: "Ni opravil", hint: "Samo neopravljeni izpiti" },
                ]}
              />
            )}
            <div className="ml-auto flex flex-wrap items-end gap-3">
              {pogled === "KOLEDAR" ? (
                <FilterPolje>
                  <Button hint="Določi osebe, temo in tedne ocenjevanja" variant="success" icon={Plus} onClick={() => setUrejanje("NOV")}>
                    Nov termin
                  </Button>
                </FilterPolje>
              ) : (
                <Izvoz
                  formati={[
                    {
                      koda: "xlsx",
                      label: "Excel",
                      hint: "Prenesi prikazano zgodovino izpitov v Excel",
                      disabled: !filtrirani.length,
                      akcija: () => izvoziZgodovinoXlsx(filtrirani, `Zgodovina_izobrazevanj_${danes}.xlsx`),
                    },
                  ]}
                />
              )}
            </div>
          </FilterVrstica>

          {pogled === "KOLEDAR" && (
            <KoledarTednov
              key={leto}
              leto={leto}
              taTeden={taTeden}
              celica={celica}
              legenda={
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
                  <LegendaKoledarja cls={TA_TEDEN_CLS}>Ta teden</LegendaKoledarja>
                  {VRSTNI_RED_STANJ.map((s) => (
                    <LegendaKoledarja key={s} cls={STANJE_TERMINA[s].cls}>
                      {STANJE_TERMINA[s].legenda}
                    </LegendaKoledarja>
                  ))}
                  <LegendaKoledarja cls={PRAZEN_TEDEN}>Ni ocenjevanj</LegendaKoledarja>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-full bg-ink-800 px-1 text-[9px] text-white">2</span>
                    število terminov
                  </span>
                </div>
              }
            />
          )}

          {pogled === "ZGODOVINA" && (
            <TabelaOkvir>
              <table className="w-full text-sm">
                <thead className="fp-thead">
                  <tr>
                    <SortTh sort={sort} kljuc="cas" className="pl-3">Čas</SortTh>
                    <SortTh sort={sort} kljuc="zaposleni">Zaposleni</SortTh>
                    <SortTh sort={sort} kljuc="matrika">Matrika</SortTh>
                    <SortTh sort={sort} kljuc="stolpec">Mesto / družina</SortTh>
                    <SortTh sort={sort} kljuc="termin">Termin</SortTh>
                    <SortTh sort={sort} kljuc="ocena">Ocena</SortTh>
                    <SortTh sort={sort} kljuc="rezultat">Rezultat</SortTh>
                    <SortTh sort={sort} kljuc="ocenjevalec">Ocenjevalec</SortTh>
                    <SortTh sort={sort} kljuc="razlogi">Razlogi</SortTh>
                    <SortTh sort={sort} kljuc="komentar" className="pr-3">Komentar</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {filtrirani.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-ink-500">
                        {podatki.ocene.length ? "Ni izpitov za izbrane filtre." : "Ni izpitov. Oceno vpišeš s klikom na celico matrike."}
                      </td>
                    </tr>
                  )}
                  {filtrirani.map((v) => (
                    <tr key={v.o.id} title="Odpri izpitno polo" onClick={() => setOgled(v.o)} className="cursor-pointer border-b border-ink-100 hover:bg-ink-50">
                      <td className="whitespace-nowrap px-3 py-1 tabular-nums text-ink-700">{formatCas(v.o.cas)}</td>
                      <td className="whitespace-nowrap px-2 py-1 font-semibold text-ink-900">{v.zaposleni}</td>
                      <td className="px-2 py-1 text-ink-700">{v.matrika}</td>
                      <td className="px-2 py-1 text-ink-700">{v.stolpec}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-ink-700">{v.termin || "-"}</td>
                      <td className="px-2 py-1">{v.o.ocena ? <FinesekStopnja stopnja={v.o.ocena} sirina={56} /> : "-"}</td>
                      <td className="px-2 py-1">
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${v.o.opravil ? "bg-ok-500 text-white" : "bg-nok-500 text-white"}`}>{v.o.opravil ? "Opravil" : "Ni opravil"}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-ink-700">{v.o.ocenjevalec}</td>
                      <td className="max-w-64 truncate px-2 py-1 text-ink-700" title={v.o.razlogi ?? undefined}>{v.o.razlogi || "-"}</td>
                      <td className="max-w-64 truncate px-2 py-1 pr-3 text-ink-700" title={v.o.komentar ?? undefined}>{v.o.komentar || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaOkvir>
          )}
        </div>
      </section>

      {teden && !pola && !urejanje && (
        <TerminiTedna
          teden={teden}
          termini={terminiTedna(teden)}
          podatki={podatki}
          danes={danes}
          onClose={() => setTeden(null)}
          onOceni={(z, s, t) => setPola({ zaposleni: z, stolpec: s, termin: t })}
          onUredi={setUrejanje}
        />
      )}
      {urejanje && (
        <TerminOkno
          termin={urejanje === "NOV" ? null : urejanje}
          podatki={podatki}
          privzetaMatrika={matrika === "VSE" ? "PROIZVODNJA" : matrika}
          onClose={() => setUrejanje(null)}
          onShranjeno={() => {
            setUrejanje(null);
            nalozi();
          }}
        />
      )}
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
      {ogled && (
        <IzpitnaPolaOgled
          ocena={ogled}
          podatki={podatki}
          onClose={() => setOgled(null)}
          onIzbrisano={() => {
            setOgled(null);
            nalozi();
          }}
        />
      )}
    </div>
  );
}

type VrsticaTedna = { t: Termin; z: Zaposleni; s: Stolpec; ime: string; trenutna: number | null; stanje: ReturnType<typeof stanjeTermina> };

/** Okno tedna: kdo se ta teden ocenjuje in iz česa. */
function TerminiTedna({
  teden,
  termini,
  podatki,
  danes,
  onClose,
  onOceni,
  onUredi,
}: {
  teden: IsoDate;
  termini: Termin[];
  podatki: Podatki;
  danes: IsoDate;
  onClose: () => void;
  onOceni: (z: Zaposleni, s: Stolpec, t: Termin) => void;
  onUredi: (t: Termin) => void;
}) {
  const sort = useRazvrscanje<VrsticaTedna, "ime" | "tema" | "termin" | "trenutna" | "stanje">({
    ime: (v) => `${v.z.priimek} ${v.z.ime}`,
    tema: (v) => v.s.naziv,
    termin: (v) => v.t.datum_od,
    trenutna: (v) => v.trenutna,
    stanje: (v) => VRSTNI_RED_STANJ.indexOf(v.stanje),
  });
  const ocene = trenutneOcene(podatki.ocene);
  const vrstice = sort.razvrsti(
    termini.flatMap((t) => {
      const z = podatki.zaposleni.find((x) => x.id === t.zaposleni_id);
      const s = podatki.stolpci.find((x) => x.id === t.stolpec_id);
      return z && s ? [{ t, z, s, ime: imeZaposlenega(z), trenutna: ocene.za(z.id, s.id)?.ocena ?? null, stanje: stanjeTermina(podatki, t, danes) }] : [];
    }),
  );

  return (
    <Modal open title={`Ocenjevanja T${isoWeek(teden)} · ${formatShort(teden)}`} onClose={onClose} sirina="max-w-3xl">
      <TabelaOkvir>
        <table className="w-full text-sm">
          <thead className="fp-thead">
            <tr>
              <SortTh sort={sort} kljuc="ime" className="pl-3">Oseba</SortTh>
              <SortTh sort={sort} kljuc="tema">Tema</SortTh>
              <SortTh sort={sort} kljuc="termin">Termin</SortTh>
              <SortTh sort={sort} kljuc="trenutna">Stopnja</SortTh>
              <SortTh sort={sort} kljuc="stanje">Stanje</SortTh>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {vrstice.map((v) => (
              <tr key={v.t.id} className="border-b border-ink-100 hover:bg-ink-50">
                <td className="whitespace-nowrap px-3 py-1 font-semibold text-ink-900">{v.ime}</td>
                <td className="px-2 py-1 text-ink-700">{v.s.naziv}</td>
                <td className="whitespace-nowrap px-2 py-1 text-ink-700" title={obdobjeTermina(v.t)}>{oznakaTermina(v.t)}</td>
                <td className="px-2 py-1"><CelicaStopnje stopnja={v.trenutna} sirina={56} /></td>
                <td className="px-2 py-1">
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STANJE_TERMINA[v.stanje].znacka}`}>{STANJE_TERMINA[v.stanje].label}</span>
                </td>
                <td className="px-2 py-1">
                  <span className="flex items-center justify-end gap-1">
                    <IconButton hint="Spremeni tedne ali odstrani termin" icon={Pencil} variant="neutral" onClick={() => onUredi(v.t)} />
                    <Button variant="success" hint={`Vpiši oceno za ${v.ime}`} onClick={() => onOceni(v.z, v.s, v.t)}>
                      Oceni
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaOkvir>
    </Modal>
  );
}

/** Nov termin: oddelek → osebe → tema → tedni. Pri urejanju se spreminja samo obdobje in opomba. */
function TerminOkno({
  termin,
  podatki,
  privzetaMatrika,
  onClose,
  onShranjeno,
}: {
  termin: Termin | null;
  podatki: Podatki;
  privzetaMatrika: Matrika;
  onClose: () => void;
  onShranjeno: () => void;
}) {
  const notify = useToast();
  const stolpecTermina = termin ? podatki.stolpci.find((s) => s.id === termin.stolpec_id) : null;
  const osebaTermina = termin ? podatki.zaposleni.find((z) => z.id === termin.zaposleni_id) : null;
  const [matrika, setMatrika] = useState<Matrika>(stolpecTermina?.matrika ?? privzetaMatrika);
  const [osebe, setOsebe] = useState<string[]>([]);
  const [teme, setTeme] = useState<string[]>([]);
  const [od, setOd] = useState<IsoDate | null>(termin ? mondayOf(termin.datum_od) : null);
  const [do_, setDo] = useState<IsoDate | null>(termin ? mondayOf(termin.datum_do) : null);
  const [opomba, setOpomba] = useState(termin?.opomba ?? "");
  const [delam, setDelam] = useState(false);

  const zaposleni = zaposleniMatrike(podatki, matrika);
  const stolpci = stolpciMatrike(podatki, matrika);
  const novih = osebe.length * teme.length;
  const manjka = !termin && !osebe.length ? "Izberi vsaj eno osebo" : !termin && !teme.length ? "Izberi temo ocenjevanja" : !od || !do_ ? "Na koledarju izberi tedne" : null;

  async function izvedi(akcija: () => Promise<unknown>, sporocilo: string) {
    setDelam(true);
    try {
      await akcija();
      notify("success", sporocilo);
      onShranjeno();
    } catch (e) {
      notify("error", (e as Error).message, 10000);
      setDelam(false);
    }
  }

  function shrani() {
    if (!od || !do_) return;
    izvedi(() => shraniTermin(termin?.id ?? null, osebe.map(Number), teme.map(Number), od, addDays(do_, 6), opomba), novih > 1 ? `Shranjenih terminov: ${novih}.` : "Termin je shranjen.");
  }

  const imeOsebe = (id: string) => {
    const z = zaposleni.find((x) => String(x.id) === id);
    return z ? imeZaposlenega(z) : id;
  };
  const imeTeme = (id: string) => stolpci.find((s) => String(s.id) === id)?.naziv ?? id;

  return (
    <Modal
      open
      title={termin ? "Uredi termin ocenjevanja" : "Nov termin ocenjevanja"}
      onClose={onClose}
      noga={
        <div className="flex flex-wrap items-center gap-2">
          {termin && (
            <Button variant="danger" icon={Trash2} disabled={delam} hint="Odstrani termin s koledarja" onClick={() => window.confirm("Odstranim termin? Ocene ostanejo v zgodovini.") && izvedi(() => skrijTermin(termin.id), "Termin je odstranjen.")}>
              Odstrani
            </Button>
          )}
          <span className="ml-auto flex gap-2">
            <Button variant="neutral" hint="Zapri brez shranjevanja" onClick={onClose}>
              Prekliči
            </Button>
            <Button variant="success" icon={Save} disabled={!!manjka || delam} hint={manjka ?? "Shrani termin na koledar"} onClick={shrani}>
              {novih > 1 ? `Shrani (${novih})` : "Shrani"}
            </Button>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {termin ? (
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-ink-50 p-3 text-sm">
            <div>
              <dt className="text-xs text-ink-500">Oseba</dt>
              <dd className="font-bold text-ink-900">{osebaTermina ? imeZaposlenega(osebaTermina) : "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Tema</dt>
              <dd className="font-bold text-ink-900">{stolpecTermina?.naziv}</dd>
            </div>
          </dl>
        ) : (
          <>
            <FilterPreklopnik
              label="Oddelek *"
              value={matrika}
              onChange={(m) => {
                setMatrika(m);
                setOsebe([]);
                setTeme([]);
              }}
              options={SEZNAM_MATRIK.map((m) => ({ value: m, label: MATRIKE[m].label, hint: `Ocenjevanje po ${MATRIKE[m].stolpci}` }))}
            />
            <MultiSelect label="Osebe *" options={zaposleni.map((z) => String(z.id))} oznaka={imeOsebe} value={osebe} onChange={setOsebe} hint="Izberi, koga se ocenjuje" prazno="Izberi ..." />
            <MultiSelect
              label={matrika === "MONTAZA" ? "Tema - družina *" : "Tema - delovno mesto *"}
              options={stolpci.map((s) => String(s.id))}
              oznaka={imeTeme}
              value={teme}
              onChange={setTeme}
              hint="Izberi, iz česa se osebe ocenjujejo"
              prazno="Izberi ..."
            />
          </>
        )}
        <FilterPolje label="Tedni ocenjevanja * (klikni prvi in zadnji teden)">
          <IzbiraTednov
            od={od}
            do_={do_}
            onChange={(a, b) => {
              setOd(a);
              setDo(b);
            }}
          />
        </FilterPolje>
        <FilterPolje label="Opomba">
          <textarea value={opomba} onChange={(e) => setOpomba(e.target.value)} rows={2} title="Kaj se bo v terminu izobraževalo" className={POLJE} />
        </FilterPolje>
      </div>
    </Modal>
  );
}
