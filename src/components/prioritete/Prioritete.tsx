"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Factory,
  Copy,
  Gauge,
  MessageSquare,
  Package,
} from "lucide-react";
import { addDays, formatDayMonth, formatShort, isoWeek, mondayOf, type IsoDate } from "@/lib/dates";
import {
  naloziMaterial,
  preberiMaterialXlsx,
  shraniMaterialUvoz,
  type Material,
  type MaterialUvoz,
  type MaterialUvozPregled,
} from "@/lib/material";
import { naloziNormative, type Normativ, type OddelekKoda } from "@/lib/normativi";
import {
  STATUS,
  STATUSI,
  danesIso,
  izracunajPrioritete,
  izvoziArtikleXlsx,
  izvoziKrovneXlsx,
  izvoziNalogePrioritetXlsx,
  krovniTxt,
  nalogiPoKrovnih,
  steviloNalogov,
  type KrovniSkupina,
  izvoziOdpremeXlsx,
  izvoziUreNarocilXlsx,
  urePostavk,
  type PostavkaUre,
  prenesiTxt,
  prioriteteTxt,
  naloziOpombe,
  naloziZadnjiOdpUvoz,
  naloziZadnjiPriUvoz,
  preberiVd300Xlsx,
  shraniOdpUvoz,
  type OdpUvoz,
  type OdpUvozPregled,
  type Odprema,
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
import {
  KODE,
  naloziKapacitete,
  naloziZadnjiUvoz,
  naloziZasOddelke,
  preberiNalogeXlsx,
  razpolozljivo,
  shraniUvoz,
  tedniOd,
  type Kapaciteta,
  type Nalog,
  type Teden,
  type Uvoz,
  type UvozPregled,
  type ZasOddelek,
} from "@/lib/zasedenost";
import { Button, IconButton } from "@/components/ui/Button";
import { Izvoz } from "@/components/ui/Izvoz";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfigMissing, Loading, WarningText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { FilterKartica } from "@/components/ui/FilterKartica";
import { FilterCheckbox, FilterIskanje, FilterIzbira, FilterPolje, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { SortTh, TabelaOkvir, useRazvrscanje, type Razvrscanje } from "@/components/ui/Tabela";
import { UvozDropzone } from "@/components/ui/UvozDropzone";
import { Zavihki, type Zavihek } from "@/components/ui/Zavihki";
import {
  LegendaObremenitve,
  ObremenitevVsebina,
  SkupajVrstica,
  TedenGlava,
  ZapadloCelica,
} from "@/components/zasedenost/Obremenitev";

type Pogled = "tedni" | "nalogi" | "artikli" | "zasedenost";

const POGLEDI: Zavihek<Pogled>[] = [
  { koda: "tedni", label: "Odpreme po tednih", hint: "Odpreme po tednih, datumih in naročilih", icon: CalendarDays },
  { koda: "nalogi", label: "Prioritete nalogov", hint: "Kaj in do kdaj izdelati po nalogih", icon: Factory },
  { koda: "artikli", label: "Po artiklih", hint: "Razdelitev zaloge in nalogov po artiklih", icon: Package },
  { koda: "zasedenost", label: "Zasedenost naročil", hint: "Ure za naročila po tednih glede na razpoložljivost", icon: Gauge },
];

const IZVOZ_HINT: Record<Pogled, string> = {
  tedni: "Izvozi prikazane odpreme v Excel",
  nalogi: "Izvozi prikazane prioritete nalogov v Excel",
  artikli: "Izvozi prikazane artikle v Excel",
  zasedenost: "Izvozi prikazane postavke z urami v Excel",
};

const STEVILO_TEDNOV_ZAS = 8;

type IzborZas = { tip: "teden"; teden: IsoDate } | { tip: "zapadlo" } | { tip: "brez" } | { tip: "vsi" };
type NormativFilter = "vsi" | "brez" | "z";

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
  normativi: Map<string, Normativ>;
  oddelki: ZasOddelek[];
  kapacitete: Kapaciteta[];
  tedniZas: Teden[];
  priUvoz: PriUvoz | null;
  postavke: Postavka[];
  opombe: Map<string, Opomba>;
  napakaBaze: string | null;
  odpUvoz: OdpUvoz | null;
  odpreme: Odprema[];
  /** Tabele odprem VD300 še niso ustvarjene (SQL 009). */
  niOdpremTabel: boolean;
  matUvoz: MaterialUvoz | null;
  material: Map<string, Material>;
  /** Tabele materiala še niso ustvarjene (SQL 018). */
  niMaterialTabel: boolean;
};

async function pridobiPodatke(): Promise<Podatki> {
  const taTeden = mondayOf(danesIso());
  const [nal, norm, oddelki, kap] = await Promise.all([
    naloziZadnjiUvoz(),
    naloziNormative(true),
    naloziZasOddelke(),
    naloziKapacitete(addDays(taTeden, -7 * 52), addDays(taTeden, 7 * 104)),
  ]);
  const osnova = {
    nalUvoz: nal.uvoz,
    nalogi: nal.nalogi,
    montaza: new Map(norm.map((n) => [n.ident, n.normativ_montaza])),
    normativi: new Map(norm.filter((n) => n.visible).map((n) => [n.ident, n])),
    oddelki,
    kapacitete: kap.kapacitete,
    tedniZas: kap.tedni,
  };
  const odp = await naloziZadnjiOdpUvoz().then(
    (x) => ({ odpUvoz: x.uvoz, odpreme: x.odpreme, niOdpremTabel: false }),
    (e: Error) => {
      if (!niTabel(e.message)) throw e;
      return { odpUvoz: null, odpreme: [], niOdpremTabel: true };
    },
  );
  const mat = await naloziMaterial().then(
    (x) => ({ matUvoz: x.uvoz, material: x.material, niMaterialTabel: false }),
    (e: Error) => {
      if (!niTabel(e.message)) throw e;
      return { matUvoz: null, material: new Map<string, Material>(), niMaterialTabel: true };
    },
  );
  try {
    const [pri, op] = await Promise.all([naloziZadnjiPriUvoz(), naloziOpombe()]);
    return {
      ...osnova,
      ...odp,
      ...mat,
      priUvoz: pri.uvoz,
      postavke: pri.postavke,
      opombe: new Map(op.map((o) => [o.kljuc, o])),
      napakaBaze: null,
    };
  } catch (e) {
    const m = (e as Error).message;
    if (!niTabel(m)) throw e;
    return { ...osnova, ...odp, ...mat, priUvoz: null, postavke: [], opombe: new Map(), napakaBaze: m };
  }
}

/** Napaka, ko tabele v bazi še niso ustvarjene (SQL 005 / 009 / 018 ni zagnan). */
const niTabel = (m: string) => /fp_pri_|spl_material|does not exist|schema cache/i.test(m);

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
  const [normativi, setNormativi] = useState<Map<string, Normativ>>(new Map());
  const [oddelki, setOddelki] = useState<ZasOddelek[]>([]);
  const [kapacitete, setKapacitete] = useState<Kapaciteta[]>([]);
  const [tedniZas, setTedniZas] = useState<Teden[]>([]);
  const [opombe, setOpombe] = useState<Map<string, Opomba>>(new Map());
  const [odpUvoz, setOdpUvoz] = useState<OdpUvoz | null>(null);
  const [odpreme, setOdpreme] = useState<Odprema[]>([]);
  const [niOdpremTabel, setNiOdpremTabel] = useState(false);
  const [matUvoz, setMatUvoz] = useState<MaterialUvoz | null>(null);
  const [material, setMaterial] = useState<Map<string, Material>>(new Map());
  const [niMaterialTabel, setNiMaterialTabel] = useState(false);

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
  const [poKrovnih, setPoKrovnih] = useState(false);
  const [txtOdprt, setTxtOdprt] = useState(false);
  // Zasedenost naročil
  const [zacetekZas, setZacetekZas] = useState<IsoDate>(() => mondayOf(danesIso()));
  const [izborZas, setIzborZas] = useState<IzborZas>(() => ({ tip: "teden", teden: mondayOf(danesIso()) }));
  const [normativZas, setNormativZas] = useState<NormativFilter>("vsi");
  const sortUre = useRazvrscanje(URE_VREDNOSTI);
  const sortNalogov = useRazvrscanje(NALOG_VREDNOSTI);
  const sortArtiklov = useRazvrscanje(ARTIKEL_VREDNOSTI);
  const sortOdprem = useRazvrscanje<PostavkaIzracun, OdpremaKljuc>({
    status: (p) => STATUSI.findIndex((s) => s.koda === p.status),
    ident: (p) => p.ident,
    opis: (p) => p.opis,
    kolicina: (p) => p.kolicina,
    pokritje: (p) => p.potrebnoDo,
    opomba: (p) => opombe.get(p.kljuc)?.opomba ?? null,
    pregledano: (p) => (opombe.get(p.kljuc)?.pregledano ? 1 : 0),
  });

  // Uvoz
  const [vd200Pregled, setVd200Pregled] = useState<(PriUvozPregled & { datoteka: string }) | null>(null);
  const [nalPregled, setNalPregled] = useState<(UvozPregled & { datoteka: string }) | null>(null);
  const [vd300Pregled, setVd300Pregled] = useState<(OdpUvozPregled & { datoteka: string }) | null>(null);
  const [matPregled, setMatPregled] = useState<(MaterialUvozPregled & { datoteka: string }) | null>(null);
  const [uvazam, setUvazam] = useState<"vd200" | "nalogi" | "vd300" | "material" | null>(null);

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
    setNormativi(p.normativi);
    setOddelki(p.oddelki);
    setKapacitete(p.kapacitete);
    setTedniZas(p.tedniZas);
    setOdpUvoz(p.odpUvoz);
    setOdpreme(p.odpreme);
    setNiOdpremTabel(p.niOdpremTabel);
    setMatUvoz(p.matUvoz);
    setMaterial(p.material);
    setNiMaterialTabel(p.niMaterialTabel);
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
    () => izracunajPrioritete(postavke, nalogi, { danes, zamikDni, vkljuciNepotrjena, samoIzdelki }, odpreme, material),
    [postavke, nalogi, danes, zamikDni, vkljuciNepotrjena, samoIzdelki, odpreme, material],
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
  // Razvrščanje ne podira sklopov: razvrsti se samo znotraj istega naročila na isti dan.
  const prikazaneRazvrscene = razvrstiZnotrajNarocil(prikazane, sortOdprem);

  const vseGrupe = useMemo(() => [...new Set(rezultat.postavke.map((p) => p.grupa))].sort(), [rezultat]);

  // ---- zasedenost naročil: isti filtri kot odpreme, brez obsega tednov in "pregledano"
  const ureVse = useMemo(() => urePostavk(rezultat.postavke, normativi), [rezultat, normativi]);
  const ureOsnova = ureVse.filter(
    ({ p }) =>
      (vkljuciNepotrjena || !p.nepotrjeno) &&
      statusi.includes(p.status) &&
      (grupe.length === 0 || grupe.includes(p.grupa)) &&
      ujemaIskanje([p.stevilka, p.partner, p.lokacija, p.ident, p.opis, opombe.get(p.kljuc)?.opomba ?? null, ...nalogiDelov(p.deli)]),
  );
  const ureVIzboru = ureOsnova.filter((u) =>
    izborZas.tip === "teden"
      ? u.teden === izborZas.teden
      : izborZas.tip === "zapadlo"
        ? u.teden !== null && u.teden < zacetekZas
        : izborZas.tip === "brez"
          ? u.teden === null
          : true,
  );
  const ureTabela = sortUre.razvrsti(
    ureVIzboru
      .filter((u) => (normativZas === "brez" ? !u.normativ : normativZas === "z" ? !!u.normativ : true))
      .sort(
        (a, b) =>
          (a.p.datum_odpreme ?? "9999").localeCompare(b.p.datum_odpreme ?? "9999") ||
          a.p.stevilka.localeCompare(b.p.stevilka) ||
          (a.p.zap ?? 0) - (b.p.zap ?? 0),
      ),
  );

  async function izberiVd200(f: File) {
    try {
      setVd200Pregled({ ...(await preberiVd200Xlsx(f)), datoteka: f.name });
    } catch (e) {
      notify("error", (e as Error).message, 10000);
    }
  }

  async function izberiVd300(f: File) {
    try {
      setVd300Pregled({ ...(await preberiVd300Xlsx(f)), datoteka: f.name });
    } catch (e) {
      notify("error", (e as Error).message, 10000);
    }
  }

  async function izberiMaterial(f: File) {
    try {
      setMatPregled({ ...(await preberiMaterialXlsx(f)), datoteka: f.name });
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

  async function potrdi(tip: "vd200" | "nalogi" | "vd300" | "material") {
    setUvazam(tip);
    try {
      if (tip === "material" && matPregled) {
        await shraniMaterialUvoz(matPregled.datoteka, matPregled.material);
        notify("success", `Uvoženih artiklov materiala: ${matPregled.material.length}.`);
        setMatPregled(null);
      } else if (tip === "vd200" && vd200Pregled) {
        await shraniPriUvoz(vd200Pregled.datoteka, vd200Pregled.postavke);
        notify("success", `Uvoženih postavk naročil: ${vd200Pregled.postavke.length}.`);
        setVd200Pregled(null);
      } else if (tip === "vd300" && vd300Pregled) {
        await shraniOdpUvoz(vd300Pregled.datoteka, vd300Pregled.odpreme);
        notify("success", `Uvoženih postavk odprem: ${vd300Pregled.odpreme.length}.`);
        setVd300Pregled(null);
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
  // Material in naročila morata biti izvožena približno sočasno, sicer se zaloga in naročila ne ujemata
  const razlikaMaterial =
    matUvoz && priUvoz ? Math.abs(new Date(priUvoz.created_at).getTime() - new Date(matUvoz.created_at).getTime()) / 86400000 : 0;
  const brezMateriala = matUvoz ? rezultat.artikli.filter((a) => a.virZaloge === "vd200") : [];
  // Odpreme morajo biti izvožene istočasno z naročili ali za njimi - sicer danes zaključene odpreme manjkajo
  const odpremeStarejse =
    odpUvoz && priUvoz ? (new Date(priUvoz.created_at).getTime() - new Date(odpUvoz.created_at).getTime()) / 3600000 : 0;

  const prikazaniNalogi = rezultat.nalogi.filter(
    (n) =>
      (!samoVezani || n.prodano > 0) &&
      (grupe.length === 0 || grupe.includes(rezultat.artikli.find((a) => a.ident === n.ident)?.grupa ?? "Ostalo")) &&
      ujemaIskanje([n.st_naloga, n.krovni_dn, n.ident, n.opis, n.narocnik, ...n.dodelitve.map((d) => d.partner)]),
  );
  // Grupirano po krovnih: razvrščanje glave velja znotraj krovnega (krovni ostanejo po prvi odpremi)
  const krovneSkupine = nalogiPoKrovnih(prikazaniNalogi).map((k) => ({ ...k, nalogi: sortNalogov.razvrsti(k.nalogi) }));
  const grupaArtikla = new Map(rezultat.artikli.map((a) => [a.ident, a.grupa]));
  const grupeNalogov = [...new Set(prikazaniNalogi.map((n) => grupaArtikla.get(n.ident) ?? "Ostalo"))].sort();
  const prikazaniArtikli = rezultat.artikli.filter(
    (a) =>
      statusi.includes(a.status) &&
      (grupe.length === 0 || grupe.includes(a.grupa)) &&
      ujemaIskanje([a.ident, a.opis, ...a.nalogi.map((n) => n.st_naloga)]),
  );

  function izvozi() {
    if (pogled === "tedni") izvoziOdpremeXlsx(prikazaneRazvrscene, `prioritete_odpreme_${danes}.xlsx`);
    else if (pogled === "nalogi" && poKrovnih) izvoziKrovneXlsx(krovneSkupine, `prioritete_krovni_${danes}.xlsx`);
    else if (pogled === "nalogi")
      izvoziNalogePrioritetXlsx(
        [...sortNalogov.razvrsti(prikazaniNalogi.filter((n) => n.zamuja)), ...sortNalogov.razvrsti(prikazaniNalogi.filter((n) => !n.zamuja))],
        `prioritete_nalogi_${danes}.xlsx`,
      );
    else if (pogled === "zasedenost")
      izvoziUreNarocilXlsx(
        ureTabela,
        `prioritete_zasedenost_${izborZas.tip === "teden" ? `teden_${isoWeek(izborZas.teden)}_${izborZas.teden}` : izborZas.tip}.xlsx`,
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
            Potrjena naročila (VD200) · zaloga iz izpisa materiala · zaloga in delovni nalogi razdeljeni po datumu odpreme
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2 2xl:grid-cols-4">
          <div className="sm:w-72">
            <UvozDropzone
              naslov="Material (.xlsx)"
              hint={niMaterialTabel ? "Najprej zaženi SQL 018 (tabela materiala)" : "Povleci sem izpis materiala (zaloge) ali klikni"}
              enota="artiklov"
              uvoz={matUvoz ? { ...matUvoz, stevilo: matUvoz.st_postavk } : null}
              nalagam={uvazam === "material"}
              onemogoceno={niMaterialTabel || uvazam !== null}
              onFile={izberiMaterial}
            />
          </div>
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
              naslov="Odpreme VD300 (.xlsx)"
              hint={niOdpremTabel ? "Najprej zaženi SQL 009 (tabele odprem)" : "Povleci sem celoten izvoz odprem VD300 ali klikni"}
              enota="postavk"
              uvoz={odpUvoz ? { ...odpUvoz, stevilo: odpUvoz.st_postavk } : null}
              nalagam={uvazam === "vd300"}
              onemogoceno={niOdpremTabel || uvazam !== null}
              onFile={izberiVd300}
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
          {niMaterialTabel ? (
            <WarningText>
              Tabela materiala v bazi še ne obstaja. V Supabase SQL editorju zaženi{" "}
              <code className="rounded bg-white px-1">supabase/migrations/018_spl_material.sql</code> in osveži stran. Do
              takrat sta zaloga in DN iz izvoza VD200 (prosta zaloga VD200 se ne uporablja).
            </WarningText>
          ) : !matUvoz ? (
            <WarningText>
              Ni uvoženega izpisa materiala - zaloga in DN sta iz izvoza VD200, rezervacije za delovne naloge niso
              upoštevane. Uvozi material zgoraj desno.
            </WarningText>
          ) : (
            <>
              {razlikaMaterial > 1 && (
                <WarningText>
                  Material in naročila VD200 sta uvožena {Math.round(razlikaMaterial)} dni narazen - zaloga in naročila
                  morda nista usklajena. Uvozi oba izvoza istočasno.
                </WarningText>
              )}
              {brezMateriala.length > 0 && (
                <WarningText>
                  {brezMateriala.length} artiklov ni v izpisu materiala - zaloga in DN sta iz VD200:{" "}
                  {brezMateriala
                    .slice(0, 8)
                    .map((a) => a.ident)
                    .join(", ")}
                  {brezMateriala.length > 8 ? " ..." : ""}
                </WarningText>
              )}
            </>
          )}
          {!niOdpremTabel && !odpUvoz && (
            <WarningText>
              Ni uvoženih odprem VD300 - oprema, ki je že na dobavnici, se šteje kot potreba (lahko kaže Manjka). Uvozi
              celoten izvoz odprem zgoraj desno.
            </WarningText>
          )}
          {odpremeStarejse > 1 && (
            <WarningText>
              Odpreme VD300 so uvožene {odpremeStarejse >= 48 ? `${Math.round(odpremeStarejse / 24)} dni` : `${Math.round(odpremeStarejse)} h`}{" "}
              pred naročili - odpreme, zaključene vmes, niso upoštevane (lahko kažejo Manjka). Uvozi odpreme za
              naročili.
            </WarningText>
          )}
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
                {pogled === "zasedenost" && (
                  <>
                    <FilterCheckbox
                      checked={vkljuciNepotrjena}
                      onChange={setVkljuciNepotrjena}
                      label="Nepotrjena naročila"
                      hint="Upoštevaj tudi predvidena in definirana naročila"
                    />
                    <FilterPreklopnik
                      label="Normativ"
                      value={normativZas}
                      onChange={setNormativZas}
                      options={[
                        { value: "vsi", label: "Vsi", hint: "Prikaži postavke z normativom in brez" },
                        {
                          value: "brez",
                          label: "Brez normativa",
                          hint: "Prikaži samo postavke brez normativa",
                          stevilo: ureVIzboru.filter((u) => !u.normativ).length,
                        },
                        { value: "z", label: "Z normativom", hint: "Skrij postavke brez normativa" },
                      ]}
                    />
                  </>
                )}
                {pogled === "nalogi" && (
                  <>
                    <FilterCheckbox
                      checked={samoVezani}
                      onChange={setSamoVezani}
                      label="Samo vezani na naročila"
                      hint="Skrij naloge, ki niso vezani na naročila"
                    />
                    <FilterCheckbox
                      checked={poKrovnih}
                      onChange={setPoKrovnih}
                      label="Grupiraj po krovnih nalogih"
                      hint="Krovni nalogi po datumu prve odpreme"
                    />
                  </>
                )}
                <FilterCheckbox
                  checked={!samoIzdelki}
                  onChange={(v) => setSamoIzdelki(!v)}
                  label="Vsi identi"
                  hint="Prikaži tudi polizdelke in rezervne dele"
                />
              </FilterVrstica>
              <Izvoz
                key={pogled}
                className="ml-auto"
                spomin={`prioritete-${pogled}`}
                formati={[
                  { koda: "xlsx", label: "Excel (.xlsx)", hint: IZVOZ_HINT[pogled], akcija: izvozi },
                  ...(pogled === "tedni" || (pogled === "nalogi" && poKrovnih)
                    ? [
                        {
                          koda: "txt",
                          label: "TXT - sporočilo",
                          hint: pogled === "tedni" ? "Sporočilo za montažo (Teams) kot besedilo" : "Krovni nalogi za montažo kot besedilo",
                          disabled: pogled === "tedni" ? prikazane.length === 0 : krovneSkupine.length === 0,
                          zakaj: "Ni podatkov za izbrane filtre",
                          akcija: () => setTxtOdprt(true),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>

          {pogled === "tedni" && (
            <PoTednih
              postavke={prikazaneRazvrscene}
              sort={sortOdprem}
              taTeden={taTeden}
              montaza={montaza}
              opombe={opombe}
              onOpomba={posodobiOpombo}
            />
          )}
          {pogled === "nalogi" &&
            (poKrovnih ? (
              <PoKrovnih skupine={krovneSkupine} sort={sortNalogov} />
            ) : (
              <PoNalogih nalogi={prikazaniNalogi} sort={sortNalogov} />
            ))}
          {pogled === "artikli" && <PoArtiklih artikli={prikazaniArtikli} postavke={rezultat.postavke} sort={sortArtiklov} />}
          {pogled === "zasedenost" && (
            <ZasedenostNarocil
              vse={ureOsnova}
              vrstice={ureTabela}
              oddelki={oddelki}
              kapacitete={kapacitete}
              tedni={tedniZas}
              danes={danes}
              zacetek={zacetekZas}
              onZacetek={setZacetekZas}
              izbor={izborZas}
              onIzbor={setIzborZas}
              onBrezNormativa={() => {
                setIzborZas({ tip: "vsi" });
                setNormativZas("brez");
              }}
              sort={sortUre}
            />
          )}

          <p className="text-xs text-ink-500">
            Pravila: zaloga, planirana količina DN in rezervacije so iz izpisa materiala. Količina, razpisana kot
            material na delovne naloge (npr. peč za predelavo), se najprej odšteje od zaloge. Preostala zaloga
            matičnega skladišča in nalogi (po roku) se dodelijo naročilom po datumu odpreme; odprte količine nalogov so
            usklajene s planirano količino DN. Kar ni pokrito, je &quot;Manjka&quot;. Prosta zaloga = zaloga + DN −
            rezervirano za DN − naročila. Rezerva = koliko dni pred odpremo mora biti nalog končan.
          </p>
        </>
      )}

      <Modal open={txtOdprt} title="Sporočilo za montažo (TXT)" onClose={() => setTxtOdprt(false)} sirina="max-w-3xl">
        {txtOdprt &&
          (pogled === "nalogi" ? (
            <TxtSporocilo
              opis="Prikazani nalogi po krovnih nalogih (glede na izbrane filtre) - krovni po prvi odpremi, v vsakem nalog, količina, ident, naziv in kupci z datumom odpreme."
              besedilo={krovniTxt(krovneSkupine, danes, grupeNalogov)}
              ime={`prioritete_krovni_${danes}.txt`}
            />
          ) : (
            <TxtSporocilo
              opis="Prikazane odpreme (glede na izbrane filtre in statuse) - datum, količina, ident, naziv, kupec in krovni nalog."
              besedilo={prioriteteTxt(prikazane, taTeden, konec)}
              ime={`prioritete_${danes}.txt`}
            />
          ))}
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
      <Modal open={!!vd300Pregled} title={`Uvoz odprem: ${vd300Pregled?.datoteka ?? ""}`} onClose={() => !uvazam && setVd300Pregled(null)}>
        {vd300Pregled && (
          <UvozPotrditev
            vrstice={[
              ["Vrstic v datoteki", vd300Pregled.vseh],
              ["Izločenih (zaključena naročila, starejša od 30 dni)", vd300Pregled.izlocenih],
              ["Postavk odprem za uvoz", vd300Pregled.odpreme.length],
              ["Odpremnih dokumentov", new Set(vd300Pregled.odpreme.map((o) => o.stevilka)).size],
              ["Postavk z dobavnico (vzeto z zaloge)", vd300Pregled.odpreme.filter((o) => o.dokument).length],
              ["Zaključenih odprem na še odprtih naročilih", vd300Pregled.odpreme.filter((o) => o.dokument && /zaklju/i.test(o.status ?? "") && !/zaklju/i.test(o.narocilo_status ?? "")).length],
            ]}
            opomba="Uvozi celoten izvoz odprem (tudi zaključene, npr. od začetka leta) - shranijo se samo odpreme odprtih naročil in zadnjih 30 dni. Postavke naročil VD200 z dobavnico dobijo status V odpremi in ne porabijo zaloge, tudi če je odprema danes zaključena in se naročilo zapre šele ponoči."
            opozorila={vd300Pregled.opozorila}
            uvazam={uvazam !== null}
            onPreklici={() => setVd300Pregled(null)}
            onPotrdi={() => potrdi("vd300")}
          />
        )}
      </Modal>
      <Modal open={!!matPregled} title={`Uvoz materiala: ${matPregled?.datoteka ?? ""}`} onClose={() => !uvazam && setMatPregled(null)}>
        {matPregled && (
          <UvozPotrditev
            vrstice={[
              ["Artiklov", matPregled.material.length],
              ["Izdelkov (100/099/110)", matPregled.material.filter((m) => /^(100|099|110)-/.test(m.ident)).length],
              ["Z zalogo (matično)", matPregled.material.filter((m) => m.zaloga > 0).length],
              ["Rezervirano kot material na DN", matPregled.material.filter((m) => m.planirano_proizvodnja > 0).length],
              ["S planirano količino DN", matPregled.material.filter((m) => m.planirano_dn > 0).length],
            ]}
            opomba="Material se shrani v splošno tabelo materiala (velja za vse strani). Zaloga, DN in rezervacije za delovne naloge se v Prioritetah računajo iz tega izpisa."
            opozorila={matPregled.opozorila}
            uvazam={uvazam !== null}
            onPreklici={() => setMatPregled(null)}
            onPotrdi={() => potrdi("material")}
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

type OdpremaKljuc = "status" | "ident" | "opis" | "kolicina" | "pokritje" | "opomba" | "pregledano";

function razvrstiZnotrajNarocil(
  postavke: PostavkaIzracun[],
  sort: Razvrscanje<PostavkaIzracun, OdpremaKljuc>,
): PostavkaIzracun[] {
  const sklopi = new Map<string, PostavkaIzracun[]>();
  for (const p of postavke) {
    const k = `${p.datum_odpreme ?? ""}|${p.stevilka}`;
    sklopi.set(k, [...(sklopi.get(k) ?? []), p]);
  }
  return [...sklopi.values()].flatMap((xs) => sort.razvrsti(xs));
}

function PoTednih({
  postavke,
  sort,
  taTeden,
  montaza,
  opombe,
  onOpomba,
}: {
  postavke: PostavkaIzracun[];
  sort: Razvrscanje<PostavkaIzracun, OdpremaKljuc>;
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
        <TedenKartica key={s.kljuc} skupina={s} sort={sort} montaza={montaza} opombe={opombe} onOpomba={onOpomba} />
      ))}
    </div>
  );
}

function TedenKartica({
  skupina,
  sort,
  montaza,
  opombe,
  onOpomba,
}: {
  skupina: Skupina;
  sort: Razvrscanje<PostavkaIzracun, OdpremaKljuc>;
  montaza: Map<string, number>;
  opombe: Map<string, Opomba>;
  onOpomba: (o: Opomba) => void;
}) {
  const [odprta, setOdprta] = useState(true);
  const { postavke } = skupina;
  const kos = postavke.reduce((s, p) => s + p.kolicina, 0);
  const ureM = postavke
    .filter((p) => p.status !== "NA_ZALOGI" && p.status !== "V_ODPREMI")
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
            {/* glava kartice je že temna - zato glava tabele brez zaobljenih kotov */}
            <thead className="fp-thead [&_th]:!rounded-none">
              <tr>
                <SortTh sort={sort} kljuc="status" className="w-32 pl-3">Status</SortTh>
                <SortTh sort={sort} kljuc="ident">Ident</SortTh>
                <SortTh sort={sort} kljuc="opis">Kratki opis</SortTh>
                <SortTh sort={sort} kljuc="kolicina" desno>Kol.</SortTh>
                <SortTh sort={sort} kljuc="pokritje" hint="Razvrsti po datumu, do kdaj mora biti iz proizvodnje">
                  Pokritje (zaloga / nalog)
                </SortTh>
                <SortTh sort={sort} kljuc="opomba" className="w-64">Opomba</SortTh>
                <SortTh sort={sort} kljuc="pregledano" className="w-10" hint="Razvrsti po pregledanih postavkah">
                  <CheckCircle2 className="h-4 w-4" aria-label="Pregledano" />
                </SortTh>
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
                          {xs.some((x) => x.vOdpremi) && <Oznaka cls="bg-ok-600 text-white">V odpremi</Oznaka>}
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
        {p.potrebnoDo && p.deli.some((d) => d.vir !== "zaloga" && d.vir !== "odprema") && (
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
        if (d.vir === "odprema")
          return (
            <Cip key={i} cls="bg-ok-600 text-white" hint={`Dobavnica ${d.dokument} - vzeto z zaloge, pripravljeno za odpremo`}>
              {k} v odpremi
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
            <Cip key={i} cls="bg-nok-50 text-nok-600" hint="Ni proste zaloge in ni naloga">
              {k} manjka
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
              {s.nalogi.map((n) => (
                <NalogVrstica
                  key={n.st_naloga}
                  n={n}
                  odprt={odprt === n.st_naloga}
                  onOdpri={() => setOdprt(odprt === n.st_naloga ? null : n.st_naloga)}
                />
              ))}
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

/** Vrstica naloga (s podrobnostmi naročil). Grupirano po krovnih: brez stolpcev Krovni in Rok naloga, zamujanje kot oznaka. */
function NalogVrstica({ n, odprt, onOdpri, poKrovnih = false }: { n: NalogPrioriteta; odprt: boolean; onOdpri: () => void; poKrovnih?: boolean }) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-ink-100 align-top hover:bg-ink-50"
        title="Prikaži naročila, vezana na ta nalog"
        onClick={onOdpri}
      >
        <td className="px-2 py-1.5">
          {n.dodelitve.length > 0 &&
            (odprt ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />)}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 font-mono">
          {n.st_naloga}
          {n.predviden && <Oznaka cls="bg-warn-400 text-ink-900">predviden</Oznaka>}
          {poKrovnih && n.zamuja && (
            <span title={`Rok naloga ${n.rok ? formatShort(n.rok) : "–"} je po datumu odpreme`}>
              <Oznaka cls={STATUS.ZAMUJA.badge}>zamuja</Oznaka>
            </span>
          )}
        </td>
        {!poKrovnih && <td className="px-2 py-1.5">{n.krovni_dn}</td>}
        <td className="px-2 py-1.5">
          <div className="font-mono text-xs text-ink-500">{n.ident}</div>
          <div>{n.opis}</div>
          {n.narocnik && !n.narocnik.toLowerCase().startsWith("fines") && <div className="text-xs text-ink-500">za: {n.narocnik}</div>}
        </td>
        {!poKrovnih && (
          <td className={`whitespace-nowrap px-2 py-1.5 ${n.zamuja ? "font-bold text-nok-600" : ""}`}>{n.rok ? formatShort(n.rok) : "–"}</td>
        )}
        <td className={`whitespace-nowrap px-2 py-1.5 ${poKrovnih ? "font-semibold" : ""}`}>
          {n.prvaPotreba ? formatShort(n.prvaPotreba) : "–"}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(n.preostala)}</td>
        <td className="px-2 py-1.5 text-right font-bold tabular-nums">{formatNum(n.prodano)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-ink-500">{formatNum(n.prosto)}</td>
        <td className="px-2 py-1.5 text-sm">
          <span className={n.zamuja ? "font-semibold text-nok-600" : n.prodano === 0 ? "text-ink-500" : "text-ink-800"}>{n.predlog}</span>
        </td>
      </tr>
      {odprt && (
        <tr className="border-b border-ink-100 bg-ink-50">
          <td />
          <td colSpan={poKrovnih ? 7 : 9} className="px-2 py-2">
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
    </>
  );
}

// =====================================================================
// POGLED: PRIORITETE NALOGOV, GRUPIRANO PO KROVNIH NALOGIH
// Krovni po prvi odpremi (najzgodnejša med njegovimi nalogi), v krovnem nalogi po prvi odpremi.
// Rok naloga ne določa vrstnega reda - zamujanje je samo oznaka pri nalogu.
// =====================================================================

function PoKrovnih({ skupine, sort }: { skupine: KrovniSkupina[]; sort: Razvrscanje<NalogPrioriteta, NalogKljuc> }) {
  const [odprt, setOdprt] = useState<string | null>(null);
  return (
    <div className="fp-card p-3 sm:p-4">
      <TabelaOkvir>
        <table className="w-full min-w-[950px] text-sm">
          <thead className="fp-thead">
            <tr>
              <th className="w-8 px-2 py-2" />
              <SortTh sort={sort} kljuc="nalog">Nalog</SortTh>
              <SortTh sort={sort} kljuc="artikel">Artikel</SortTh>
              <SortTh sort={sort} kljuc="odprema">Prva odprema</SortTh>
              <SortTh sort={sort} kljuc="odprto" desno>Odprto</SortTh>
              <SortTh sort={sort} kljuc="prodano" desno>Prodano</SortTh>
              <SortTh sort={sort} kljuc="prosto" desno>Prosto</SortTh>
              <th className="px-2 py-2">Predlog</th>
            </tr>
          </thead>
          {skupine.map((k) => (
            <tbody key={k.kljuc}>
              <tr>
                <td colSpan={8} className="border-l-4 border-ink-600 bg-ink-200 px-3 py-2.5 text-base text-ink-900">
                  <span className="font-bold">{k.krovni ? `Krovni ${k.krovni}` : `Nalog ${k.nalogi[0].st_naloga}`}</span>
                  {!k.krovni && <span className="ml-2 text-xs font-semibold">brez krovnega</span>}
                  <span className="ml-2 text-xs font-semibold">
                    prva odprema {k.prvaOdprema ? formatShort(k.prvaOdprema) : "–"}
                  </span>
                  <span className="ml-2 text-xs opacity-80">
                    · {steviloNalogov(k.nalogi.length)} · {formatNum(k.odprto)} kos odprto, {formatNum(k.prodano)} prodano
                  </span>
                  {k.zamuja > 0 && <Oznaka cls={STATUS.ZAMUJA.badge}>{k.zamuja} zamuja</Oznaka>}
                </td>
              </tr>
              {k.nalogi.map((n) => (
                <NalogVrstica
                  key={n.st_naloga}
                  n={n}
                  poKrovnih
                  odprt={odprt === n.st_naloga}
                  onOdpri={() => setOdprt(odprt === n.st_naloga ? null : n.st_naloga)}
                />
              ))}
            </tbody>
          ))}
          {skupine.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={8} className="px-2 py-8 text-center text-ink-500">
                  Ni nalogov za izbrane filtre.
                </td>
              </tr>
            </tbody>
          )}
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
  | "rezervirano"
  | "dn"
  | "prosta"
  | "naroceno"
  | "izZaloge"
  | "vOdpremi"
  | "izProizvodnje"
  | "manjka"
  | "zalogaDo"
  | "naslednja";

const RANG_STATUSA = Object.fromEntries(STATUSI.map((s, i) => [s.koda, i])) as Record<Status, number>;

const ARTIKEL_VREDNOSTI: Record<ArtikelKljuc, (a: ArtikelPregled) => string | number | null> = {
  status: (a) => RANG_STATUSA[a.status],
  artikel: (a) => a.ident,
  zaloga: (a) => a.zaloga,
  rezervirano: (a) => a.rezervirano_dn,
  dn: (a) => a.planirano_dn,
  prosta: (a) => a.prosta_zaloga,
  naroceno: (a) => a.naroceno,
  izZaloge: (a) => a.izZaloge,
  vOdpremi: (a) => a.vOdpremi,
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
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="fp-thead">
            <tr>
              <th className="w-8 px-2 py-2" />
              <SortTh sort={sort} kljuc="status">Status</SortTh>
              <SortTh sort={sort} kljuc="artikel">Artikel</SortTh>
              <SortTh sort={sort} kljuc="zaloga" desno hint="Zaloga matičnega skladišča (ostala skladišča)">Zaloga</SortTh>
              <SortTh sort={sort} kljuc="rezervirano" desno hint="Razpisano kot material na delovne naloge">
                Za DN
              </SortTh>
              <SortTh sort={sort} kljuc="dn" desno hint="Planirana količina na delovnih nalogih">DN</SortTh>
              <SortTh sort={sort} kljuc="prosta" desno hint="Zaloga + DN − za DN − naročila">Prosta</SortTh>
              <SortTh sort={sort} kljuc="naroceno" desno>Naročeno</SortTh>
              <SortTh sort={sort} kljuc="izZaloge" desno>Iz zaloge</SortTh>
              <SortTh sort={sort} kljuc="vOdpremi" desno hint="Kosi z dobavnico v VD300 (niso več na zalogi)">V odpremi</SortTh>
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
                      {a.virZaloge === "vd200" && (
                        <span title="Artikla ni v izpisu materiala - zaloga in DN iz izvoza VD200">
                          <Oznaka cls="bg-warn-400 text-ink-900">VD200</Oznaka>
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatNum(a.zaloga)}
                      {a.zaloga_ostalo > 0 && <span className="text-ink-400"> ({formatNum(a.zaloga_ostalo)})</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-warn-700">
                      {a.rezervirano_dn ? formatNum(a.rezervirano_dn) : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(a.planirano_dn)}</td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${a.prosta_zaloga < 0 ? "font-bold text-nok-600" : ""}`}
                      title={a.prosta_erp !== null ? `Prosta zaloga v ERP (z nabavo): ${formatNum(a.prosta_erp)}` : undefined}
                    >
                      {formatNum(a.prosta_zaloga)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums">
                      {razlikaNarocil(a) && (
                        <span title={`Naročeno v ERP ${formatNum(a.naroceno_erp!)}, v izvozu VD200 ${formatNum(a.naroceno_vd200)} - izvoza nista usklajena`}>
                          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-warn-500" aria-hidden />
                        </span>
                      )}
                      {formatNum(a.naroceno)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ok-600">{a.izZaloge ? formatNum(a.izZaloge) : ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ok-600">{a.vOdpremi ? formatNum(a.vOdpremi) : ""}</td>
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
                      <td colSpan={13} className="px-2 py-2">
                        <ArtikelPodrobno a={a} postavke={postavke.filter((p) => p.ident === a.ident)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {vrstice.length === 0 && (
              <tr>
                <td colSpan={14} className="px-2 py-8 text-center text-ink-500">
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

/** ERP (material) in izvoz VD200 imata različno količino potrjenih naročil. */
const razlikaNarocil = (a: ArtikelPregled) => a.naroceno_erp !== null && Math.abs(a.naroceno_erp - a.naroceno_vd200) > 0.001;

function ArtikelPodrobno({ a, postavke }: { a: ArtikelPregled; postavke: PostavkaIzracun[] }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-ink-600">
        {a.virZaloge === "material" ? "Izpis materiala" : "Izvoz VD200 (artikla ni v izpisu materiala)"}: zaloga{" "}
        {formatNum(a.zaloga)} + DN {formatNum(a.planirano_dn)}
        {a.rezervirano_dn > 0 && <> − za DN {formatNum(a.rezervirano_dn)}</>} − naročila {formatNum(a.naroceno - a.vOdpremi)}
        {a.vOdpremi > 0 && <> (brez {formatNum(a.vOdpremi)} v odpremi)</>} = prosta{" "}
        <strong className={a.prosta_zaloga < 0 ? "text-nok-600" : ""}>{formatNum(a.prosta_zaloga)}</strong>
        {a.prosta_erp !== null && <> · prosta zaloga v ERP (z nabavo) {formatNum(a.prosta_erp)}</>}
      </p>
      {a.rezervirano_dn > 0 && (
        <p className="text-warn-700">
          {formatNum(a.rezervirano_dn)} kos je razpisanih kot material na delovne naloge (npr. predelava) - ni na
          voljo za naročila.
        </p>
      )}
      {razlikaNarocil(a) && (
        <p className="text-warn-700">
          Naročeno v ERP {formatNum(a.naroceno_erp!)}, v izvozu VD200 {formatNum(a.naroceno_vd200)} - izvoza nista
          usklajena (uvozi material in naročila istočasno).
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
// POGLED: ZASEDENOST NAROČIL
// Ure po normativu za del naročil, ki ga je še treba narediti (brez zaloge in odpreme),
// po tednu "potrebno do" (datum odpreme - rezerva), primerjano z razpoložljivostjo iz Zasedenosti.
// =====================================================================

type UreKljuc = "odprema" | "narocilo" | "kupec" | "ident" | "naziv" | "status" | "kolicina" | "narediti" | OddelekKodaUre | "skupaj";
type OddelekKodaUre = OddelekKoda;

const URE_VREDNOSTI: Record<UreKljuc, (u: PostavkaUre) => string | number | null> = {
  odprema: (u) => u.p.datum_odpreme,
  narocilo: (u) => u.p.stevilka,
  kupec: (u) => u.p.partner,
  ident: (u) => u.p.ident,
  naziv: (u) => u.p.opis,
  status: (u) => RANG_STATUSA[u.p.status],
  kolicina: (u) => u.p.kolicina,
  narediti: (u) => u.narediti,
  P: (u) => u.ure.P,
  M: (u) => u.ure.M,
  E: (u) => u.ure.E,
  T: (u) => u.ure.T,
  skupaj: (u) => (u.normativ ? u.ureSkupaj : null),
};

function ZasedenostNarocil({
  vse,
  vrstice,
  oddelki,
  kapacitete,
  tedni,
  danes,
  zacetek,
  onZacetek,
  izbor,
  onIzbor,
  onBrezNormativa,
  sort,
}: {
  /** Vse filtrirane postavke (za pregled po tednih). */
  vse: PostavkaUre[];
  /** Postavke izbranega tedna (filtrirane in razvrščene) za tabelo. */
  vrstice: PostavkaUre[];
  oddelki: ZasOddelek[];
  kapacitete: Kapaciteta[];
  tedni: Teden[];
  danes: IsoDate;
  zacetek: IsoDate;
  onZacetek: (t: IsoDate) => void;
  izbor: IzborZas;
  onIzbor: (i: IzborZas) => void;
  onBrezNormativa: () => void;
  sort: Razvrscanje<PostavkaUre, UreKljuc>;
}) {
  const prikazaniTedni = tedniOd(zacetek, STEVILO_TEDNOV_ZAS);
  const jeTaTeden = zacetek === mondayOf(danes);

  const potrebno = new Map<string, number>();
  for (const u of vse) {
    if (!u.teden) continue;
    const kljuc = u.teden < zacetek ? "zapadlo" : u.teden;
    for (const k of KODE) potrebno.set(`${k}|${kljuc}`, (potrebno.get(`${k}|${kljuc}`) ?? 0) + u.ure[k]);
  }
  const steviloPostavk = (kljuc: string) =>
    vse.filter((u) => u.teden && (kljuc === "zapadlo" ? u.teden < zacetek : u.teden === kljuc)).length;
  const kapaciteta = (o: ZasOddelek, t: IsoDate) => razpolozljivo(o, t, kapacitete, tedni);
  const brezNormativa = vse.filter((u) => !u.normativ).length;
  const brezDatuma = vse.filter((u) => !u.teden).length;

  const naslov =
    izbor.tip === "teden"
      ? `${isoWeek(izbor.teden)}. teden (${formatShort(izbor.teden)} – ${formatShort(addDays(izbor.teden, 6))})`
      : izbor.tip === "zapadlo"
        ? `Potrebno pred ${formatShort(zacetek)}`
        : izbor.tip === "brez"
          ? "Postavke brez datuma odpreme"
          : "Vse postavke";
  const vsota = (k: OddelekKodaUre | "skupaj") => vrstice.reduce((s, u) => s + (k === "skupaj" ? u.ureSkupaj : u.ure[k]), 0);

  return (
    <>
      {brezNormativa > 0 && (
        <button
          type="button"
          title="Prikaži postavke brez normativa"
          onClick={onBrezNormativa}
          className="flex items-center gap-2 self-start rounded-lg bg-warn-50 px-3 py-2 text-left text-sm font-medium text-warn-700 hover:underline"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {brezNormativa} postavk nima normativa - njihove ure niso upoštevane.
        </button>
      )}

      {/* ============ PREGLED PO TEDNIH ============ */}
      <div className="fp-card p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <IconButton hint="Premakni pregled en teden nazaj" variant="neutral" icon={ChevronLeft} onClick={() => onZacetek(addDays(zacetek, -7))} />
          <IconButton hint="Premakni pregled en teden naprej" variant="neutral" icon={ChevronRight} onClick={() => onZacetek(addDays(zacetek, 7))} />
          <Button hint="Začni pregled s tekočim tednom" variant="neutral" disabled={jeTaTeden} onClick={() => onZacetek(mondayOf(danes))}>
            Ta teden
          </Button>
          <span className="ml-auto text-xs text-ink-500">
            Ure za del naročil, ki ni na zalogi ali v odpremi · razpoložljivost iz Zasedenosti
          </span>
        </div>

        {oddelki.length === 0 ? (
          <p className="py-6 text-center text-ink-500">Oddelki za zasedenost niso nastavljeni.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="w-32" />
                  <th className="align-bottom">
                    <TedenGlava
                      naslov={jeTaTeden ? "Zapadlo" : "Prej"}
                      podnaslov={`pred ${formatDayMonth(zacetek)}`}
                      stevilo={`${steviloPostavk("zapadlo")} postavk`}
                      izbran={izbor.tip === "zapadlo"}
                      onClick={() => onIzbor({ tip: "zapadlo" })}
                      rdeca={jeTaTeden}
                    />
                  </th>
                  {prikazaniTedni.map((t) => (
                    <th key={t} className="align-bottom">
                      <TedenGlava
                        naslov={`${isoWeek(t)}. teden`}
                        podnaslov={`${formatDayMonth(t)} – ${formatDayMonth(addDays(t, 6))}`}
                        stevilo={`${steviloPostavk(t)} postavk`}
                        izbran={izbor.tip === "teden" && izbor.teden === t}
                        trenutni={t === mondayOf(danes)}
                        onClick={() => onIzbor({ tip: "teden", teden: t })}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {oddelki.map((o) => (
                  <tr key={o.id}>
                    <th className="pr-2 text-right align-middle">
                      <div className="text-sm font-bold text-ink-800">{o.naziv}</div>
                      <div className="text-[11px] font-normal text-ink-500">{formatNum(o.ure_na_dan)} h/dan na osebo</div>
                    </th>
                    <ZapadloCelica ure={potrebno.get(`${o.koda}|zapadlo`) ?? 0} rdeca={jeTaTeden} />
                    {prikazaniTedni.map((t) => {
                      const kap = kapaciteta(o, t);
                      return (
                        <td key={t} className="rounded-lg border border-ink-200 bg-white p-2 align-top">
                          <div
                            className="text-[11px] text-ink-500"
                            title={`${formatNum(kap.zaposlenih)} oseb × ${formatNum(kap.ureNaDan)} h × ${formatNum(kap.dni)} dni`}
                          >
                            {formatNum(kap.zaposlenih)} oseb · {formatNum(kap.dni)} dni
                          </div>
                          <ObremenitevVsebina potrebno={potrebno.get(`${o.koda}|${t}`) ?? 0} naVoljo={kap.ure} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <SkupajVrstica oddelki={oddelki} tedni={prikazaniTedni} potrebno={potrebno} kapaciteta={kapaciteta} />
              </tbody>
            </table>
          </div>
        )}
        <LegendaObremenitve />
      </div>

      {/* ============ POSTAVKE IZBRANEGA TEDNA ============ */}
      <div className="fp-card flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mr-auto text-lg font-bold text-ink-900">
            {naslov} <span className="text-sm font-normal text-ink-500">· {vrstice.length} postavk</span>
          </h3>
          <FilterPolje label="Prikaz">
            <div className="flex gap-1">
              <Button
                hint="Prikaži postavke vseh tednov"
                variant={izbor.tip === "vsi" ? "primary" : "neutral"}
                onClick={() => onIzbor({ tip: "vsi" })}
              >
                Vsi
              </Button>
              {brezDatuma > 0 && (
                <Button
                  hint="Prikaži postavke brez datuma odpreme"
                  variant={izbor.tip === "brez" ? "primary" : "neutral"}
                  onClick={() => onIzbor({ tip: "brez" })}
                >
                  Brez datuma ({brezDatuma})
                </Button>
              )}
            </div>
          </FilterPolje>
        </div>
        <TabelaOkvir>
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="fp-thead">
              <tr>
                <SortTh sort={sort} kljuc="odprema">Odprema</SortTh>
                <SortTh sort={sort} kljuc="narocilo">Naročilo</SortTh>
                <SortTh sort={sort} kljuc="kupec">Kupec</SortTh>
                <SortTh sort={sort} kljuc="ident">Ident</SortTh>
                <SortTh sort={sort} kljuc="naziv">Kratki opis</SortTh>
                <SortTh sort={sort} kljuc="status">Status</SortTh>
                <SortTh sort={sort} kljuc="kolicina" desno hint="Razvrsti po naročeni količini">Kol.</SortTh>
                <SortTh sort={sort} kljuc="narediti" desno hint="Razvrsti po količini, ki ni na zalogi ali v odpremi">
                  Narediti
                </SortTh>
                {KODE.map((k) => (
                  <SortTh key={k} sort={sort} kljuc={k} desno>
                    {k} h
                  </SortTh>
                ))}
                <SortTh sort={sort} kljuc="skupaj" desno>Skupaj h</SortTh>
              </tr>
            </thead>
            <tbody>
              {vrstice.map((u) => (
                <tr key={u.p.kljuc} className={`border-b border-ink-100 ${u.normativ ? "hover:bg-ink-50" : "bg-warn-50"}`}>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {u.p.datum_odpreme ? `${dan(u.p.datum_odpreme)} ${formatShort(u.p.datum_odpreme)}` : "–"}
                    {u.potrebnoDo && u.potrebnoDo !== u.p.datum_odpreme && (
                      <div className="text-[11px] text-ink-500">narejeno do {formatShort(u.potrebnoDo)}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{u.p.stevilka}</td>
                  <td className="px-2 py-1.5">{u.p.partner}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">
                    {u.normativ ? (
                      u.p.ident
                    ) : (
                      <Link
                        href={`/proizvodnja/normativi?nov=${encodeURIComponent(u.p.ident)}&naziv=${encodeURIComponent(u.p.opis ?? "")}`}
                        title="Ni normativa - dodaj nov normativ za ta artikel"
                        className="inline-flex items-center gap-1 font-semibold text-warn-700 hover:underline"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {u.p.ident}
                      </Link>
                    )}
                  </td>
                  <td className="max-w-80 truncate px-2 py-1.5" title={u.p.opis ?? ""}>
                    {u.p.opis}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusZnacka status={u.p.status} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-500">{formatNum(u.p.kolicina)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatNum(u.narediti)}</td>
                  {KODE.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-right tabular-nums text-ink-600">
                      {u.ure[k] ? formatUre(u.ure[k]) : ""}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                    {u.normativ ? formatUre(u.ureSkupaj) : <span className="text-xs font-normal text-warn-700">ni normativa</span>}
                  </td>
                </tr>
              ))}
              {vrstice.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-ink-500">
                    Ni postavk za izbrane filtre.
                  </td>
                </tr>
              )}
            </tbody>
            {vrstice.length > 0 && (
              <tfoot className="font-bold">
                <tr className="border-t-2 border-ink-300">
                  <td colSpan={7} className="px-2 py-2 text-right">
                    Skupaj
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatNum(vrstice.reduce((s, u) => s + u.narediti, 0))}</td>
                  {KODE.map((k) => (
                    <td key={k} className="px-2 py-2 text-right tabular-nums">
                      {formatUre(vsota(k))}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums">{formatUre(vsota("skupaj"))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TabelaOkvir>
      </div>
    </>
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

function TxtSporocilo({ opis, besedilo, ime }: { opis: string; besedilo: string; ime: string }) {
  const notify = useToast();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-600">{opis} Kopiraj v Teams ali prenesi kot .txt.</p>
      <textarea
        readOnly
        value={besedilo}
        title="Besedilo sporočila za montažo"
        className="h-[55vh] w-full resize-y rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-xs leading-relaxed text-ink-900 focus:border-fines-500 focus:outline-none"
        onFocus={(e) => e.target.select()}
      />
      <div className="flex justify-end gap-2">
        <Button hint="Prenesi sporočilo kot .txt datoteko" variant="primary" icon={Download} onClick={() => prenesiTxt(besedilo, ime)}>
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
