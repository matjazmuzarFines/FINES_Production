"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Factory,
  FileText,
  Copy,
  MessageSquare,
  Package,
} from "lucide-react";
import { addDays, formatDayMonth, formatShort, isoWeek, mondayOf, type IsoDate } from "@/lib/dates";
import { naloziNormative } from "@/lib/normativi";
import {
  STATUS,
  STATUSI,
  danesIso,
  izracunajPrioritete,
  izvoziArtikleXlsx,
  izvoziNalogePrioritetXlsx,
  izvoziOdpremeXlsx,
  prenesiTxt,
  prioriteteTxt,
  naloziOpombe,
  naloziZadnjiPriUvoz,
  opisDelov,
  preberiVd200Xlsx,
  shraniOpombo,
  shraniPriUvoz,
  type ArtikelPregled,
  type Del,
  type NalogPrioriteta,
  type Opomba,
  type Postavka,
  type PostavkaIzracun,
  type PriUvoz,
  type PriUvozPregled,
  type Status,
} from "@/lib/prioritete";
import { formatNum, formatUre } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import { naloziZadnjiUvoz, preberiNalogeXlsx, shraniUvoz, type Nalog, type Uvoz, type UvozPregled } from "@/lib/zasedenost";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { FilterKartica } from "@/components/ui/FilterKartica";
import { FilterCheckbox, FilterIskanje, FilterIzbira, FilterPolje, FilterVrstica } from "@/components/ui/Filtri";
import { SortTh, TabelaOkvir, useRazvrscanje, type Razvrscanje } from "@/components/ui/Tabela";
import { UvozDropzone } from "@/components/ui/UvozDropzone";
import { Zavihki, type Zavihek } from "@/components/ui/Zavihki";

type Pogled = "tedni" | "nalogi" | "artikli";

const POGLEDI: Zavihek<Pogled>[] = [
  { koda: "tedni", label: "Odpreme po tednih", hint: "Odpreme po tednih, datumih in naročilih", icon: CalendarDays },
  { koda: "nalogi", label: "Prioritete nalogov", hint: "Kaj in do kdaj izdelati po nalogih", icon: Factory },
  { koda: "artikli", label: "Po artiklih", hint: "Razdelitev zaloge in nalogov po artiklih", icon: Package },
];

const IZVOZ_HINT: Record<Pogled, string> = {
  tedni: "Izvozi prikazane odpreme v Excel",
  nalogi: "Izvozi prikazane prioritete nalogov v Excel",
  artikli: "Izvozi prikazane artikle v Excel",
};

const TEDNI_IZBIRA = [1, 2, 3, 4, 5, 6, 8, 12, 0]; // 0 = vsi
const NASTAVITVE_KLJUC = "fp-prioritete-nastavitve";

type Shranjeno = { tednov: number; zamikDni: number };

function preberiShranjeno(): Shranjeno {
  const privzeto = { tednov: 5, zamikDni: 0 };
  try {
    const s = JSON.parse(localStorage.getItem(NASTAVITVE_KLJUC) ?? "null");
    return s ? { ...privzeto, ...s } : privzeto;
  } catch {
    return privzeto;
  }
}

type Podatki = {
  nalUvoz: Uvoz | null;
  nalogi: Nalog[];
  montaza: Map<string, number>;
  priUvoz: PriUvoz | null;
  postavke: Postavka[];
  opombe: Map<string, Opomba>;
  napakaBaze: string | null;
};

async function pridobiPodatke(): Promise<Podatki> {
  const [nal, norm] = await Promise.all([naloziZadnjiUvoz(), naloziNormative(true)]);
  const osnova = {
    nalUvoz: nal.uvoz,
    nalogi: nal.nalogi,
    montaza: new Map(norm.map((n) => [n.ident, n.normativ_montaza])),
  };
  try {
    const [pri, op] = await Promise.all([naloziZadnjiPriUvoz(), naloziOpombe()]);
    return { ...osnova, priUvoz: pri.uvoz, postavke: pri.postavke, opombe: new Map(op.map((o) => [o.kljuc, o])), napakaBaze: null };
  } catch (e) {
    const m = (e as Error).message;
    if (!niTabel(m)) throw e;
    return { ...osnova, priUvoz: null, postavke: [], opombe: new Map(), napakaBaze: m };
  }
}

/** Napaka, ko tabele prioritet v bazi še niso ustvarjene (SQL 005 ni zagnan). */
const niTabel = (m: string) => /fp_pri_|does not exist|schema cache/i.test(m);

export function Prioritete() {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <PrioriteteInner />;
}

function PrioriteteInner() {
  const notify = useToast();
  const danes = danesIso();

  const [nalozeno, setNalozeno] = useState(false);
  const [napakaBaze, setNapakaBaze] = useState<string | null>(null);
  const [priUvoz, setPriUvoz] = useState<PriUvoz | null>(null);
  const [postavke, setPostavke] = useState<Postavka[]>([]);
  const [nalUvoz, setNalUvoz] = useState<Uvoz | null>(null);
  const [nalogi, setNalogi] = useState<Nalog[]>([]);
  const [montaza, setMontaza] = useState<Map<string, number>>(new Map());
  const [opombe, setOpombe] = useState<Map<string, Opomba>>(new Map());

  // Nastavitve in filtri
  // Stran pokaže Loading, dokler podatki niso naloženi - branje localStorage ob inicializaciji je varno
  const [tednov, setTednov] = useState(() => preberiShranjeno().tednov);
  const [zamikDni, setZamikDni] = useState(() => preberiShranjeno().zamikDni);
  const [vkljuciNepotrjena, setVkljuciNepotrjena] = useState(false);
  const [samoIzdelki, setSamoIzdelki] = useState(true);
  const [statusi, setStatusi] = useState<Status[]>(["MANJKA", "ZAMUJA", "PREGLEJ", "V_DELU"]);
  const [grupe, setGrupe] = useState<string[]>([]);
  const [iskanje, setIskanje] = useState("");
  const [pogled, setPogled] = useState<Pogled>("tedni");
  const [samoNepregledano, setSamoNepregledano] = useState(false);
  const [samoVezani, setSamoVezani] = useState(true);
  const [txtOdprt, setTxtOdprt] = useState(false);
  const sortNalogov = useRazvrscanje(NALOG_VREDNOSTI);
  const sortArtiklov = useRazvrscanje(ARTIKEL_VREDNOSTI);

  // Uvoz
  const [vd200Pregled, setVd200Pregled] = useState<(PriUvozPregled & { datoteka: string }) | null>(null);
  const [nalPregled, setNalPregled] = useState<(UvozPregled & { datoteka: string }) | null>(null);
  const [uvazam, setUvazam] = useState<"vd200" | "nalogi" | null>(null);

  function shraniNastavitve(s: Partial<Shranjeno>) {
    const nove = { tednov, zamikDni, ...s };
    setTednov(nove.tednov);
    setZamikDni(nove.zamikDni);
    try {
      localStorage.setItem(NASTAVITVE_KLJUC, JSON.stringify(nove));
    } catch {
      // brskalnik ne dovoli shranjevanja - nastavitev velja do osvežitve
    }
  }

  function uporabi(p: Podatki) {
    setNalUvoz(p.nalUvoz);
    setNalogi(p.nalogi);
    setMontaza(p.montaza);
    setNapakaBaze(p.napakaBaze);
    if (p.napakaBaze) return;
    setPriUvoz(p.priUvoz);
    setPostavke(p.postavke);
    setOpombe(p.opombe);
  }

  const naloziVse = async () => uporabi(await pridobiPodatke());

  useEffect(() => {
    let preklic = false;
    pridobiPodatke()
      .then((p) => !preklic && uporabi(p))
      .catch((e) => notify("error", `Napaka pri nalaganju prioritet: ${(e as Error).message}`, 10000))
      .finally(() => !preklic && setNalozeno(true));
    return () => {
      preklic = true;
    };
  }, [notify]);

  const rezultat = useMemo(
    () => izracunajPrioritete(postavke, nalogi, { danes, zamikDni, vkljuciNepotrjena, samoIzdelki }),
    [postavke, nalogi, danes, zamikDni, vkljuciNepotrjena, samoIzdelki],
  );

  // ---- obseg tednov
  const taTeden = mondayOf(danes);
  const konec = tednov > 0 ? addDays(taTeden, tednov * 7) : null;
  const vObsegu = (p: PostavkaIzracun) => !p.datum_odpreme || !konec || p.datum_odpreme < konec;

  const q = iskanje.trim().toLowerCase();
  const ujemaIskanje = (vals: (string | null | number)[]) => !q || vals.some((v) => String(v ?? "").toLowerCase().includes(q));

  // Postavke brez filtra statusa (za števce na gumbih)
  const osnova = rezultat.postavke.filter(
    (p) =>
      vObsegu(p) &&
      (vkljuciNepotrjena || !p.nepotrjeno) &&
      (grupe.length === 0 || grupe.includes(p.grupa)) &&
      (!samoNepregledano || !opombe.get(p.kljuc)?.pregledano) &&
      ujemaIskanje([p.stevilka, p.partner, p.lokacija, p.ident, p.opis, opombe.get(p.kljuc)?.opomba ?? null, ...nalogiDelov(p.deli)]),
  );
  const prikazane = osnova.filter((p) => statusi.includes(p.status));

  const vseGrupe = useMemo(() => [...new Set(rezultat.postavke.map((p) => p.grupa))].sort(), [rezultat]);

  async function izberiVd200(f: File) {
    try {
      setVd200Pregled({ ...(await preberiVd200Xlsx(f)), datoteka: f.name });
    } catch (e) {
      notify("error", (e as Error).message, 10000);
    }
  }

  async function izberiNaloge(f: File) {
    try {
      setNalPregled({ ...(await preberiNalogeXlsx(f)), datoteka: f.name });
    } catch (e) {
      notify("error", (e as Error).message, 10000);
    }
  }

  async function potrdi(tip: "vd200" | "nalogi") {
    setUvazam(tip);
    try {
      if (tip === "vd200" && vd200Pregled) {
        await shraniPriUvoz(vd200Pregled.datoteka, vd200Pregled.postavke);
        notify("success", `Uvoženih postavk naročil: ${vd200Pregled.postavke.length}.`);
        setVd200Pregled(null);
      } else if (tip === "nalogi" && nalPregled) {
        await shraniUvoz(nalPregled.datoteka, nalPregled.nalogi);
        notify("success", `Uvoženih nalogov: ${nalPregled.nalogi.length} (velja tudi za Zasedenost).`);
        setNalPregled(null);
      }
      await naloziVse();
    } catch (e) {
      notify("error", `Napaka pri uvozu: ${(e as Error).message}`, 10000);
    } finally {
      setUvazam(null);
    }
  }

  async function posodobiOpombo(o: Opomba) {
    const prej = opombe.get(o.kljuc);
    setOpombe((m) => new Map(m).set(o.kljuc, o));
    try {
      await shraniOpombo(o);
    } catch (e) {
      setOpombe((m) => {
        const n = new Map(m);
        if (prej) n.set(o.kljuc, prej);
        else n.delete(o.kljuc);
        return n;
      });
      notify("error", `Opomba ni shranjena: ${(e as Error).message}`, 10000);
    }
  }

  if (!nalozeno) return <Loading />;

  // Opozorilo: nalogi so starejši od izvoza naročil
  const starostNalogov =
    nalUvoz && priUvoz ? (new Date(priUvoz.created_at).getTime() - new Date(nalUvoz.created_at).getTime()) / 86400000 : 0;

  const prikazaniNalogi = rezultat.nalogi.filter(
    (n) =>
      (!samoVezani || n.prodano > 0) &&
      (grupe.length === 0 || grupe.includes(rezultat.artikli.find((a) => a.ident === n.ident)?.grupa ?? "Ostalo")) &&
      ujemaIskanje([n.st_naloga, n.krovni_dn, n.ident, n.opis, n.narocnik, ...n.dodelitve.map((d) => d.partner)]),
  );
  const prikazaniArtikli = rezultat.artikli.filter(
    (a) =>
      statusi.includes(a.status) &&
      (grupe.length === 0 || grupe.includes(a.grupa)) &&
      ujemaIskanje([a.ident, a.opis, ...a.nalogi.map((n) => n.st_naloga)]),
  );

  function izvozi() {
    if (pogled === "tedni") izvoziOdpremeXlsx(prikazane, `prioritete_odpreme_${danes}.xlsx`);
    else if (pogled === "nalogi")
      izvoziNalogePrioritetXlsx(
        [...sortNalogov.razvrsti(prikazaniNalogi.filter((n) => n.zamuja)), ...sortNalogov.razvrsti(prikazaniNalogi.filter((n) => !n.zamuja))],
        `prioritete_nalogi_${danes}.xlsx`,
      );
    else izvoziArtikleXlsx(sortArtiklov.razvrsti(prikazaniArtikli), `prioritete_artikli_${danes}.xlsx`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ============ GLAVA + UVOZ ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-xl font-bold text-ink-900">Prioritete odprem</h2>
          <p className="text-sm text-ink-500">
            Potrjena naročila (VD200) · zaloga in delovni nalogi razdeljeni po datumu odpreme
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <div className="sm:w-72">
            <UvozDropzone
              naslov="Izvoz VD200 (.xlsx)"
              hint="Povleci sem izvozvd200.xlsx ali klikni za izbiro"
              enota="postavk"
              uvoz={priUvoz ? { ...priUvoz, stevilo: priUvoz.st_postavk } : null}
              nalagam={uvazam === "vd200"}
              onemogoceno={!!napakaBaze || uvazam !== null}
              onFile={izberiVd200}
            />
          </div>
          <div className="sm:w-72">
            <UvozDropzone
              naslov="Delovni nalogi (.xlsx)"
              hint="Isti uvoz nalogov kot v Zasedenosti"
              enota="nalogov"
              uvoz={nalUvoz ? { ...nalUvoz, stevilo: nalUvoz.st_nalogov } : null}
              nalagam={uvazam === "nalogi"}
              onemogoceno={uvazam !== null}
              onFile={izberiNaloge}
            />
          </div>
        </div>
      </div>

      {napakaBaze ? (
        <WarningText>
          Tabele za prioritete v bazi še ne obstajajo. V Supabase SQL editorju zaženi{" "}
          <code className="rounded bg-white px-1">supabase/migrations/005_prioritete.sql</code> in osveži stran.
        </WarningText>
      ) : !priUvoz ? (
        <div className="fp-card p-8 text-center text-ink-600">
          Ni uvoženih naročil. Povleci izvoz <strong>izvozvd200.xlsx</strong> v okno zgoraj desno.
        </div>
      ) : (
        <>
          {!nalUvoz && (
            <WarningText>
              Ni uvoženih delovnih nalogov - planirana količina DN je brez rokov (status Nedorečeno). Uvozi naloge
              zgoraj desno ali v Zasedenosti.
            </WarningText>
          )}
          {nalUvoz && starostNalogov > 2 && (
            <WarningText>
              Delovni nalogi so uvoženi {Math.round(starostNalogov)} dni pred izvozom naročil - roki in količine
              nalogov morda niso aktualni.
            </WarningText>
          )}

          {/* ============ STATUSI ============ */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {STATUSI.map((s) => {
              const xs = osnova.filter((p) => p.status === s.koda && !p.nepotrjeno);
              const kos = xs.reduce((a, p) => a + p.kolicina, 0);
              const aktiven = statusi.includes(s.koda);
              return (
                <FilterKartica
                  key={s.koda}
                  aktivna={aktiven}
                  hint={`${aktiven ? "Skrij" : "Prikaži"}: ${s.opis}`}
                  onClick={() => setStatusi(aktiven ? statusi.filter((x) => x !== s.koda) : [...statusi, s.koda])}
                  barva={{ trak: s.pika, aktivna: s.aktivna, ikona: s.ikona }}
                  naslov={s.label}
                  podnaslov={`${xs.length} postavk · ${formatNum(kos)} kos`}
                />
              );
            })}
          </div>

          {/* ============ POGLEDI (zavihki) + FILTRI ============ */}
          <div>
            <Zavihki zavihki={POGLEDI} value={pogled} onChange={setPogled} label="Pogled prioritet" />
            <div className="fp-card flex flex-wrap items-start gap-3 rounded-tl-none p-3">
              <FilterVrstica className="flex-1">
                <FilterIskanje
                  value={iskanje}
                  onChange={setIskanje}
                  placeholder="Kupec, naročilo, ident, nalog ..."
                  hint="Išči po kupcu, naročilu, identu, nalogu, opombi"
                />
                <div className="w-44">
                  <MultiSelect label="Grupa" options={vseGrupe} value={grupe} onChange={setGrupe} hint="Filtriraj po grupi izdelkov" />
                </div>
                {pogled === "tedni" && (
                  <FilterIzbira
                    label="Tednov"
                    value={tednov}
                    options={TEDNI_IZBIRA.map((t) => ({ value: t, label: t === 0 ? "Vsi" : String(t) }))}
                    onChange={(t) => shraniNastavitve({ tednov: t })}
                    hint="Koliko tednov odprem prikazati (od tega tedna)"
                  />
                )}
                <FilterIzbira
                  label="Rezerva"
                  value={zamikDni}
                  options={[0, 1, 2, 3, 5, 7].map((d) => ({ value: d, label: `${d} dni` }))}
                  onChange={(d) => shraniNastavitve({ zamikDni: d })}
                  hint="Koliko dni pred odpremo mora biti nalog končan"
                />
                {pogled === "tedni" && (
                  <>
                    <FilterCheckbox
                      checked={vkljuciNepotrjena}
                      onChange={setVkljuciNepotrjena}
                      label="Nepotrjena naročila"
                      hint="Upoštevaj tudi predvidena in definirana naročila"
                    />
                    <FilterCheckbox
                      checked={samoNepregledano}
                      onChange={setSamoNepregledano}
                      label="Samo nepregledano"
                      hint="Skrij postavke, označene kot pregledane"
                    />
                  </>
                )}
                {pogled === "nalogi" && (
                  <FilterCheckbox
                    checked={samoVezani}
                    onChange={setSamoVezani}
                    label="Samo vezani na naročila"
                    hint="Skrij naloge, ki niso vezani na naročila"
                  />
                )}
                <FilterCheckbox
                  checked={!samoIzdelki}
                  onChange={(v) => setSamoIzdelki(!v)}
                  label="Vsi identi"
                  hint="Prikaži tudi polizdelke in rezervne dele"
                />
              </FilterVrstica>
              <FilterPolje label="Izvoz" className="ml-auto">
                <div className="flex gap-2">
                  {pogled === "tedni" && (
                    <Button
                      hint="Sporočilo za montažo (Teams) kot besedilo"
                      variant="neutral"
                      icon={FileText}
                      disabled={prikazane.length === 0}
                      onClick={() => setTxtOdprt(true)}
                    >
                      TXT
                    </Button>
                  )}
                  <Button hint={IZVOZ_HINT[pogled]} variant="neutral" icon={Download} onClick={izvozi}>
                    Excel
                  </Button>
                </div>
              </FilterPolje>
            </div>
          </div>

          {pogled === "tedni" && (
            <PoTednih
              postavke={prikazane}
              taTeden={taTeden}
              montaza={montaza}
              opombe={opombe}
              onOpomba={posodobiOpombo}
            />
          )}
          {pogled === "nalogi" && <PoNalogih nalogi={prikazaniNalogi} sort={sortNalogov} />}
          {pogled === "artikli" && <PoArtiklih artikli={prikazaniArtikli} postavke={rezultat.postavke} sort={sortArtiklov} />}

          <p className="text-xs text-ink-500">
            Pravila: zaloga matičnega skladišča in nalogi (po roku) se dodelijo naročilom po datumu odpreme. Odprte
            količine nalogov so usklajene s planirano količino DN iz izvoza. Če je prosta zaloga v ERP negativna,
            zadnja naročila ostanejo &quot;Manjka&quot;. Rezerva = koliko dni pred odpremo mora biti nalog končan.
          </p>
        </>
      )}

      <Modal open={txtOdprt} title="Sporočilo za montažo (TXT)" onClose={() => setTxtOdprt(false)} sirina="max-w-3xl">
        {txtOdprt && <TxtSporocilo besedilo={prioriteteTxt(prikazane, taTeden, konec)} ime={`prioritete_${danes}.txt`} />}
      </Modal>

      {/* ============ PREGLED UVOZA ============ */}
      <Modal open={!!vd200Pregled} title={`Uvoz: ${vd200Pregled?.datoteka ?? ""}`} onClose={() => !uvazam && setVd200Pregled(null)}>
        {vd200Pregled && (
          <UvozPotrditev
            vrstice={[
              ["Postavk skupaj", vd200Pregled.postavke.length],
              ["Naročil", new Set(vd200Pregled.postavke.map((p) => p.stevilka)).size],
              ["Potrjenih postavk izdelkov (100/099/110)", vd200Pregled.postavke.filter((p) => /^(100|099|110)-/.test(p.ident) && (p.status ?? "").includes("potrjeno")).length],
            ]}
            opozorila={vd200Pregled.opozorila}
            uvazam={uvazam !== null}
            onPreklici={() => setVd200Pregled(null)}
            onPotrdi={() => potrdi("vd200")}
          />
        )}
      </Modal>
      <Modal open={!!nalPregled} title={`Uvoz nalogov: ${nalPregled?.datoteka ?? ""}`} onClose={() => !uvazam && setNalPregled(null)}>
        {nalPregled && (
          <UvozPotrditev
            vrstice={[["Nalogov", nalPregled.nalogi.length]]}
            opomba="Nalogi se shranijo kot nov uvoz in veljajo tudi za Zasedenost in Delovni plan."
            opozorila={nalPregled.opozorila}
            uvazam={uvazam !== null}
            onPreklici={() => setNalPregled(null)}
            onPotrdi={() => potrdi("nalogi")}
          />
        )}
      </Modal>
    </div>
  );
}

const nalogiDelov = (deli: Del[]) => deli.flatMap((d) => (d.vir === "nalog" ? [d.nalog, d.krovni] : []));

// =====================================================================
// POGLED: ODPREME PO TEDNIH (kot pivot v Excelu)
// =====================================================================

type Skupina = { kljuc: string; naslov: string; podnaslov: string; rdeca?: boolean; postavke: PostavkaIzracun[] };

function PoTednih({
  postavke,
  taTeden,
  montaza,
  opombe,
  onOpomba,
}: {
  postavke: PostavkaIzracun[];
  taTeden: IsoDate;
  montaza: Map<string, number>;
  opombe: Map<string, Opomba>;
  onOpomba: (o: Opomba) => void;
}) {
  const skupine: Skupina[] = [];
  const zapadle = postavke.filter((p) => p.teden && p.teden < taTeden);
  if (zapadle.length)
    skupine.push({ kljuc: "zapadlo", naslov: "Zapadlo", podnaslov: `odprema pred ${formatShort(taTeden)}`, rdeca: true, postavke: zapadle });
  const tedni = [...new Set(postavke.map((p) => p.teden).filter((t): t is IsoDate => !!t && t >= taTeden))].sort();
  for (const t of tedni)
    skupine.push({
      kljuc: t,
      naslov: `${isoWeek(t)}. teden`,
      podnaslov: `${formatDayMonth(t)} – ${formatDayMonth(addDays(t, 6))}${t === taTeden ? " · ta teden" : ""}`,
      postavke: postavke.filter((p) => p.teden === t),
    });
  const brez = postavke.filter((p) => !p.teden);
  if (brez.length) skupine.push({ kljuc: "brez", naslov: "Brez datuma odpreme", podnaslov: "", postavke: brez });

  if (skupine.length === 0) return <div className="fp-card p-8 text-center text-ink-500">Ni odprem za izbrane filtre.</div>;

  return (
    <div className="flex flex-col gap-4">
      {skupine.map((s) => (
        <TedenKartica key={s.kljuc} skupina={s} montaza={montaza} opombe={opombe} onOpomba={onOpomba} />
      ))}
    </div>
  );
}

function TedenKartica({
  skupina,
  montaza,
  opombe,
  onOpomba,
}: {
  skupina: Skupina;
  montaza: Map<string, number>;
  opombe: Map<string, Opomba>;
  onOpomba: (o: Opomba) => void;
}) {
  const [odprta, setOdprta] = useState(true);
  const { postavke } = skupina;
  const kos = postavke.reduce((s, p) => s + p.kolicina, 0);
  const ureM = postavke
    .filter((p) => p.status !== "NA_ZALOGI")
    .reduce((s, p) => s + p.kolicina * (montaza.get(p.ident) ?? 0), 0);

  // datum -> naročilo -> postavke
  const poDatumu = new Map<string, Map<string, PostavkaIzracun[]>>();
  for (const p of postavke) {
    const d = p.datum_odpreme ?? "";
    const m = poDatumu.get(d) ?? new Map<string, PostavkaIzracun[]>();
    m.set(p.stevilka, [...(m.get(p.stevilka) ?? []), p]);
    poDatumu.set(d, m);
  }

  return (
    <div className="fp-card overflow-hidden">
      <button
        type="button"
        title={odprta ? "Skrij odpreme tega tedna" : "Prikaži odpreme tega tedna"}
        onClick={() => setOdprta(!odprta)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 bg-ink-800 px-4 py-2.5 text-left text-white"
      >
        {odprta ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
        <span className={`text-lg font-bold ${skupina.rdeca ? "text-nok-500" : ""}`}>{skupina.naslov}</span>
        <span className="text-sm text-ink-200">{skupina.podnaslov}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {STATUSI.map((s) => {
            const n = postavke.filter((p) => p.status === s.koda).reduce((a, p) => a + p.kolicina, 0);
            return n > 0 ? (
              <span key={s.koda} title={`${s.label}: ${formatNum(n)} kos`} className={`rounded-full px-2 py-0.5 font-semibold ${s.badge}`}>
                {formatNum(n)}
              </span>
            ) : null;
          })}
          <span className="text-ink-200">{formatNum(kos)} kos</span>
          {ureM > 0 && (
            <span className="text-ink-200" title="Ure montaže za postavke, ki niso na zalogi (po normativih)">
              M {formatUre(ureM)} h
            </span>
          )}
        </span>
      </button>
      {odprta && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                <th className="w-32 px-3 py-2">Status</th>
                <th className="px-2 py-2">Ident</th>
                <th className="px-2 py-2">Kratki opis</th>
                <th className="px-2 py-2 text-right">Kol.</th>
                <th className="px-2 py-2">Pokritje (zaloga / nalog)</th>
                <th className="w-64 px-2 py-2">Opomba</th>
                <th className="w-10 px-2 py-2" title="Pregledano">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                </th>
              </tr>
            </thead>
            <tbody>
              {[...poDatumu].map(([datum, narocila]) => (
                <Fragment key={datum}>
                  <tr className="bg-fines-50">
                    <td colSpan={7} className="px-3 py-1.5 text-sm font-bold text-fines-700">
                      {datum ? `${dan(datum)} ${formatShort(datum)}` : "Brez datuma"}
                    </td>
                  </tr>
                  {[...narocila].map(([stevilka, xs]) => (
                    <Fragment key={stevilka}>
                      <tr className="border-t border-ink-100">
                        <td colSpan={7} className="px-3 pb-1 pt-2">
                          <span className="font-semibold text-ink-900">{xs[0].partner}</span>
                          {xs[0].lokacija && <span className="text-ink-500"> · {xs[0].lokacija}</span>}
                          <span className="ml-2 font-mono text-xs text-ink-400">nar. {stevilka}</span>
                          {xs[0].vOdpremi && <Oznaka cls="bg-sync-500 text-white">V odpremi</Oznaka>}
                          {xs[0].nepotrjeno && <Oznaka cls="bg-ink-200 text-ink-700">{xs[0].status}</Oznaka>}
                          {xs[0].zaznamek && (
                            <span title={xs[0].zaznamek} className="ml-2 inline-flex items-center gap-1 text-xs text-warn-700">
                              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                              zaznamek
                            </span>
                          )}
                        </td>
                      </tr>
                      {xs.map((p) => (
                        <PostavkaVrstica key={p.kljuc} p={p} opomba={opombe.get(p.kljuc)} onOpomba={onOpomba} />
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PostavkaVrstica({ p, opomba, onOpomba }: { p: PostavkaIzracun; opomba?: Opomba; onOpomba: (o: Opomba) => void }) {
  const pregledano = !!opomba?.pregledano;
  return (
    <tr className={`align-top hover:bg-ink-50 ${pregledano ? "opacity-60" : ""}`}>
      <td className="px-3 py-1.5">
        <StatusZnacka status={p.status} />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{p.ident}</td>
      <td className="px-2 py-1.5">{p.opis}</td>
      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatNum(p.kolicina)}</td>
      <td className="px-2 py-1.5">
        <Pokritje deli={p.deli} />
        {p.potrebnoDo && p.deli.some((d) => d.vir !== "zaloga") && (
          <div className="text-[11px] text-ink-500">iz proizvodnje potrebno do {formatShort(p.potrebnoDo)}</div>
        )}
      </td>
      <td className="px-2 py-1">
        <input
          key={opomba?.opomba ?? ""}
          defaultValue={opomba?.opomba ?? ""}
          placeholder="Kaj gre za koga ..."
          title="Opomba za to postavko (shrani se ob izhodu iz polja)"
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== (opomba?.opomba ?? null)) onOpomba({ kljuc: p.kljuc, opomba: v, pregledano });
          }}
          className="h-8 w-full rounded-md border border-ink-200 px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={pregledano}
          title={pregledano ? "Odznači pregledano postavko" : "Označi postavko kot pregledano"}
          onChange={(e) => onOpomba({ kljuc: p.kljuc, opomba: opomba?.opomba ?? null, pregledano: e.target.checked })}
          className="mt-1 h-4 w-4 accent-fines-500"
        />
      </td>
    </tr>
  );
}

function Pokritje({ deli }: { deli: Del[] }) {
  if (deli.length === 0) return <span className="text-xs text-ink-400">ne šteje v potrebe</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {deli.map((d, i) => {
        const k = formatNum(d.kolicina);
        if (d.vir === "zaloga")
          return (
            <Cip key={i} cls="bg-ok-50 text-ok-600" hint="Pokrito z zalogo matičnega skladišča">
              {k} zaloga
            </Cip>
          );
        if (d.vir === "dn")
          return (
            <Cip key={i} cls="bg-warn-50 text-warn-700" hint="Planirana količina DN, nalog ni v uvozu nalogov">
              {k} DN brez naloga
            </Cip>
          );
        if (d.vir === "manjka")
          return (
            <Cip
              key={i}
              cls="bg-nok-50 text-nok-600"
              hint={d.erp ? "Prosta zaloga v ERP je negativna - rezervirano drugje" : "Ni zaloge in ni naloga"}
            >
              {k} manjka{d.erp ? " (ERP)" : ""}
            </Cip>
          );
        return (
          <Cip
            key={i}
            cls={d.predviden ? "bg-warn-50 text-warn-700" : "bg-sync-500/10 text-sync-600"}
            hint={`Nalog ${d.nalog}${d.krovni ? `, krovni ${d.krovni}` : ""}${d.predviden ? " (predviden)" : ""}${
              d.drugKupec ? ` - odprt za kupca ${d.drugKupec}` : ""
            }`}
          >
            {k} · DN {d.nalog} · {d.rok ? formatDayMonth(d.rok) : "brez roka"}
            {d.drugKupec && <AlertTriangle className="ml-1 inline h-3 w-3" aria-hidden />}
          </Cip>
        );
      })}
    </div>
  );
}

// =====================================================================
// POGLED: PRIORITETE NALOGOV (za vodjo montaže)
// 1. sklop: nalogi, ki zamujajo (rok po prvi odpremi) - kaj stisniti in končati
// 2. sklop: ostali nalogi po prvi odpremi, ki čaka nanje
// =====================================================================

type NalogKljuc = "nalog" | "krovni" | "artikel" | "rok" | "odprema" | "odprto" | "prodano" | "prosto";

const NALOG_VREDNOSTI: Record<NalogKljuc, (n: NalogPrioriteta) => string | number | null> = {
  nalog: (n) => n.st_naloga,
  krovni: (n) => n.krovni_dn,
  artikel: (n) => n.ident,
  rok: (n) => n.rok,
  odprema: (n) => n.prvaPotreba,
  odprto: (n) => n.preostala,
  prodano: (n) => n.prodano,
  prosto: (n) => n.prosto,
};

function PoNalogih({ nalogi, sort }: { nalogi: NalogPrioriteta[]; sort: Razvrscanje<NalogPrioriteta, NalogKljuc> }) {
  const [odprt, setOdprt] = useState<string | null>(null);
  const sklopi = [
    {
      kljuc: "zamuja",
      naslov: "Zamuja - pospeši in končaj",
      opis: "Rok naloga je po datumu odpreme. To sporoči vodji montaže.",
      cls: "border-fines-500 bg-fines-100 text-fines-700",
      nalogi: sort.razvrsti(nalogi.filter((n) => n.zamuja)),
    },
    {
      kljuc: "ostali",
      naslov: "Po prvi odpremi",
      opis: "Nalogi, ki bodo pravočasno končani, po datumu prve odpreme.",
      cls: "border-ink-600 bg-ink-200 text-ink-900",
      nalogi: sort.razvrsti(nalogi.filter((n) => !n.zamuja)),
    },
  ];

  return (
    <div className="fp-card p-3 sm:p-4">
      <TabelaOkvir>
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="fp-thead">
            <tr>
              <th className="w-8 px-2 py-2" />
              <SortTh sort={sort} kljuc="nalog">Nalog</SortTh>
              <SortTh sort={sort} kljuc="krovni">Krovni</SortTh>
              <SortTh sort={sort} kljuc="artikel">Artikel</SortTh>
              <SortTh sort={sort} kljuc="rok">Rok naloga</SortTh>
              <SortTh sort={sort} kljuc="odprema">Prva odprema</SortTh>
              <SortTh sort={sort} kljuc="odprto" desno>Odprto</SortTh>
              <SortTh sort={sort} kljuc="prodano" desno>Prodano</SortTh>
              <SortTh sort={sort} kljuc="prosto" desno>Prosto</SortTh>
              <th className="px-2 py-2">Predlog</th>
            </tr>
          </thead>
          {sklopi.map((s) => (
            <tbody key={s.kljuc}>
              <tr>
                <td colSpan={10} className={`border-l-4 px-3 py-2.5 text-base ${s.cls}`}>
                  <span className="font-bold">{s.naslov}</span>
                  <span className="ml-2 text-xs font-semibold">{s.nalogi.length} nalogov</span>
                  <span className="ml-2 text-xs opacity-80">· {s.opis}</span>
                </td>
              </tr>
              {s.nalogi.map((n) => {
                const jeOdprt = odprt === n.st_naloga;
                return (
                  <Fragment key={n.st_naloga}>
                    <tr
                      className="cursor-pointer border-b border-ink-100 align-top hover:bg-ink-50"
                      title="Prikaži naročila, vezana na ta nalog"
                      onClick={() => setOdprt(jeOdprt ? null : n.st_naloga)}
                    >
                      <td className="px-2 py-1.5">
                        {n.dodelitve.length > 0 &&
                          (jeOdprt ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />)}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        {n.st_naloga}
                        {n.predviden && <Oznaka cls="bg-warn-400 text-ink-900">predviden</Oznaka>}
                      </td>
                      <td className="px-2 py-1.5">{n.krovni_dn}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-mono text-xs text-ink-500">{n.ident}</div>
                        <div>{n.opis}</div>
                        {n.narocnik && !n.narocnik.toLowerCase().startsWith("fines") && (
                          <div className="text-xs text-ink-500">za: {n.narocnik}</div>
                        )}
                      </td>
                      <td className={`whitespace-nowrap px-2 py-1.5 ${n.zamuja ? "font-bold text-nok-600" : ""}`}>
                        {n.rok ? formatShort(n.rok) : "–"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">{n.prvaPotreba ? formatShort(n.prvaPotreba) : "–"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(n.preostala)}</td>
                      <td className="px-2 py-1.5 text-right font-bold tabular-nums">{formatNum(n.prodano)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-ink-500">{formatNum(n.prosto)}</td>
                      <td className="px-2 py-1.5 text-sm">
                        <span className={n.zamuja ? "font-semibold text-nok-600" : n.prodano === 0 ? "text-ink-500" : "text-ink-800"}>
                          {n.predlog}
                        </span>
                      </td>
                    </tr>
                    {jeOdprt && (
                      <tr className="border-b border-ink-100 bg-ink-50">
                        <td />
                        <td colSpan={9} className="px-2 py-2">
                          <table className="text-xs">
                            <tbody>
                              {n.dodelitve.map((d) => (
                                <tr key={d.kljuc}>
                                  <td className="pr-4 font-semibold tabular-nums">{formatNum(d.kolicina)} kos</td>
                                  <td className="pr-4">{d.datum ? formatShort(d.datum) : "brez datuma"}</td>
                                  <td className="pr-4">{d.partner}</td>
                                  <td className="font-mono text-ink-500">nar. {d.stevilka}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {s.nalogi.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-3 text-center text-ink-500">
                    Ni nalogov.
                  </td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </TabelaOkvir>
    </div>
  );
}

// =====================================================================
// POGLED: PO ARTIKLIH (razdelitev zaloge in nalogov)
// =====================================================================

type ArtikelKljuc =
  | "status"
  | "artikel"
  | "zaloga"
  | "dn"
  | "prosta"
  | "naroceno"
  | "izZaloge"
  | "izProizvodnje"
  | "manjka"
  | "zalogaDo"
  | "naslednja";

const RANG_STATUSA = Object.fromEntries(STATUSI.map((s, i) => [s.koda, i])) as Record<Status, number>;

const ARTIKEL_VREDNOSTI: Record<ArtikelKljuc, (a: ArtikelPregled) => string | number | null> = {
  status: (a) => RANG_STATUSA[a.status],
  artikel: (a) => a.ident,
  zaloga: (a) => a.zaloga,
  dn: (a) => a.planirano_dn,
  prosta: (a) => a.prosta_zaloga,
  naroceno: (a) => a.naroceno,
  izZaloge: (a) => a.izZaloge,
  izProizvodnje: (a) => a.izProizvodnje,
  manjka: (a) => a.manjka,
  zalogaDo: (a) => a.zalogaDo,
  naslednja: (a) => a.naslednjaIzProizvodnje,
};

function PoArtiklih({
  artikli,
  postavke,
  sort,
}: {
  artikli: ArtikelPregled[];
  postavke: PostavkaIzracun[];
  sort: Razvrscanje<ArtikelPregled, ArtikelKljuc>;
}) {
  const [odprt, setOdprt] = useState<string | null>(null);
  const vrstice = sort.razvrsti(artikli);
  return (
    <div className="fp-card p-3 sm:p-4">
      <TabelaOkvir>
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="fp-thead">
            <tr>
              <th className="w-8 px-2 py-2" />
              <SortTh sort={sort} kljuc="status">Status</SortTh>
              <SortTh sort={sort} kljuc="artikel">Artikel</SortTh>
              <SortTh sort={sort} kljuc="zaloga" desno hint="Zaloga matičnega skladišča (ostala skladišča)">Zaloga</SortTh>
              <SortTh sort={sort} kljuc="dn" desno hint="Planirana količina na delovnih nalogih">DN</SortTh>
              <SortTh sort={sort} kljuc="prosta" desno hint="Prosta zaloga v ERP">Prosta</SortTh>
              <SortTh sort={sort} kljuc="naroceno" desno>Naročeno</SortTh>
              <SortTh sort={sort} kljuc="izZaloge" desno>Iz zaloge</SortTh>
              <SortTh sort={sort} kljuc="izProizvodnje" desno>Iz proizv.</SortTh>
              <SortTh sort={sort} kljuc="manjka" desno>Manjka</SortTh>
              <SortTh sort={sort} kljuc="zalogaDo" hint="Zadnja odprema, ki jo v celoti pokrije zaloga">Zaloga do</SortTh>
              <SortTh sort={sort} kljuc="naslednja" hint="Kdaj mora biti prvi kos iz proizvodnje">1. kos iz proizv.</SortTh>
            </tr>
          </thead>
          <tbody>
            {vrstice.map((a) => {
              const jeOdprt = odprt === a.ident;
              return (
                <Fragment key={a.ident}>
                  <tr
                    className="cursor-pointer border-b border-ink-100 hover:bg-ink-50"
                    title="Prikaži razdelitev po naročilih"
                    onClick={() => setOdprt(jeOdprt ? null : a.ident)}
                  >
                    <td className="px-2 py-1.5">
                      {jeOdprt ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                    </td>
                    <td className="px-2 py-1.5">
                      <StatusZnacka status={a.status} />
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-xs text-ink-500">{a.ident}</span> {a.opis}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatNum(a.zaloga)}
                      {a.zaloga_ostalo > 0 && <span className="text-ink-400"> ({formatNum(a.zaloga_ostalo)})</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(a.planirano_dn)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${a.prosta_zaloga < 0 ? "font-bold text-nok-600" : ""}`}>
                      {formatNum(a.prosta_zaloga)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatNum(a.naroceno)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ok-600">{a.izZaloge ? formatNum(a.izZaloge) : ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-sync-600">{a.izProizvodnje ? formatNum(a.izProizvodnje) : ""}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-nok-600">{a.manjka ? formatNum(a.manjka) : ""}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{a.zalogaDo ? formatShort(a.zalogaDo) : "–"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-semibold">
                      {a.naslednjaIzProizvodnje ? formatShort(a.naslednjaIzProizvodnje) : "–"}
                    </td>
                  </tr>
                  {jeOdprt && (
                    <tr className="border-b border-ink-100 bg-ink-50">
                      <td />
                      <td colSpan={11} className="px-2 py-2">
                        <ArtikelPodrobno a={a} postavke={postavke.filter((p) => p.ident === a.ident)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {vrstice.length === 0 && (
              <tr>
                <td colSpan={12} className="px-2 py-8 text-center text-ink-500">
                  Ni artiklov za izbrane filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TabelaOkvir>
    </div>
  );
}

function ArtikelPodrobno({ a, postavke }: { a: ArtikelPregled; postavke: PostavkaIzracun[] }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      {a.rezerviranoDrugje > 0 && (
        <p className="text-warn-700">
          ERP rezervira {formatNum(a.rezerviranoDrugje)} kos izven teh naročil (drugi dokumenti ali vgradnja v druge
          naloge).
        </p>
      )}
      <table>
        <tbody>
          {postavke.map((p) => (
            <tr key={p.kljuc} className="align-top">
              <td className="py-0.5 pr-3">
                <StatusZnacka status={p.status} />
              </td>
              <td className="whitespace-nowrap py-0.5 pr-3">{p.datum_odpreme ? formatShort(p.datum_odpreme) : "brez datuma"}</td>
              <td className="py-0.5 pr-3 font-semibold tabular-nums">{formatNum(p.kolicina)} kos</td>
              <td className="py-0.5 pr-3">{p.partner}</td>
              <td className="py-0.5 text-ink-600">{p.deli.length ? opisDelov(p.deli) : p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {a.nalogi.length > 0 && (
        <div className="text-ink-600">
          Nalogi:{" "}
          {a.nalogi
            .map((n) => `${n.st_naloga} (${formatNum(n.preostala)} kos, rok ${n.rok ? formatShort(n.rok) : "–"}, prosto ${formatNum(n.prosto)})`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// POMOŽNE KOMPONENTE
// =====================================================================

function StatusZnacka({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span title={s.opis} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${s.badge}`}>
      {s.label}
    </span>
  );
}

function Cip({ cls, hint, children }: { cls: string; hint: string; children: React.ReactNode }) {
  return (
    <span title={hint} className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function Oznaka({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function TxtSporocilo({ besedilo, ime }: { besedilo: string; ime: string }) {
  const notify = useToast();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-600">
        Prikazane odpreme (glede na izbrane filtre in statuse) - datum, količina, ident, naziv, kupec in krovni nalog.
        Kopiraj v Teams ali prenesi kot .txt.
      </p>
      <textarea
        readOnly
        value={besedilo}
        title="Besedilo sporočila za montažo"
        className="h-[55vh] w-full resize-y rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-xs leading-relaxed text-ink-900 focus:border-fines-500 focus:outline-none"
        onFocus={(e) => e.target.select()}
      />
      <div className="flex justify-end gap-2">
        <Button hint="Prenesi sporočilo kot .txt datoteko" variant="neutral" icon={Download} onClick={() => prenesiTxt(besedilo, ime)}>
          Prenesi .txt
        </Button>
        <Button
          hint="Kopiraj sporočilo v odložišče za Teams"
          variant="primary"
          icon={Copy}
          onClick={() =>
            navigator.clipboard
              .writeText(besedilo)
              .then(() => notify("success", "Sporočilo je kopirano - prilepi ga v Teams."))
              .catch(() => notify("error", "Kopiranje ni uspelo - označi besedilo in kopiraj ročno."))
          }
        >
          Kopiraj
        </Button>
      </div>
    </div>
  );
}


function UvozPotrditev({
  vrstice,
  opomba,
  opozorila,
  uvazam,
  onPreklici,
  onPotrdi,
}: {
  vrstice: [string, number][];
  opomba?: string;
  opozorila: string[];
  uvazam: boolean;
  onPreklici: () => void;
  onPotrdi: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {vrstice.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-ink-600">{k}</dt>
            <dd className="text-right font-bold tabular-nums">{formatNum(v)}</dd>
          </Fragment>
        ))}
      </dl>
      {opomba && <p className="text-ink-600">{opomba}</p>}
      {opozorila.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg bg-warn-50 p-2 text-xs text-warn-700">
          {opozorila.map((o, i) => (
            <div key={i}>{o}</div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button hint="Prekliči uvoz datoteke" variant="neutral" onClick={onPreklici} disabled={uvazam}>
          Prekliči
        </Button>
        <Button hint="Shrani uvoz kot zadnje podatke" variant="success" onClick={onPotrdi} disabled={uvazam}>
          {uvazam ? "Uvažam ..." : "Uvozi"}
        </Button>
      </div>
    </div>
  );
}

const DNEVI = ["", "Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];
function dan(iso: IsoDate) {
  const d = new Date(`${iso}T00:00:00`).getDay();
  return DNEVI[d === 0 ? 7 : d];
}
