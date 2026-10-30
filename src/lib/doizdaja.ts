// Doizdaja materiala (Skladišče): material, ki je bil na aktivne delovne naloge izdan samo delno,
// ker ga ni bilo na zalogi, in je zdaj prispel s prevzemom od dobavitelja.
//
// Viri: izvoz "Kreiranje izdaj v proizvodnjo" (material po nalogih), izvoz "Prevzem od dobavitelja"
// in uvoz delovnih nalogov (krovni DN). Logika je opisana pri funkciji izracunajDoizdajo.
import * as XLSX from "xlsx";
import { addDays, parseAnyDate, todayWorkday, weekday, type IsoDate } from "./dates";
import { parseNum } from "./stevila";
import { fetchAll, getSupabase, kosi } from "./supabase";

// =====================================================================
// TIPI
// =====================================================================

/** Vrstica izdaje: en material na delovnem nalogu. */
export type IzdajaVrstica = {
  st_naloga: string;
  opis: string | null;
  koda_artikla: string | null;
  naziv_artikla: string | null;
  status: string | null;
  status_naloga: string | null;
  rok_izdelave: IsoDate | null;
  razpisana_kolicina: number;
  ident: string;
  naziv: string | null;
  naroceno: boolean;
  skupina: string | null;
  skl: string | null;
  em: string | null;
  zaloga: number;
  porabljeno: number;
  planirano: number;
  za_izdajo: number;
};

/** Postavka prevzema od dobavitelja. */
export type Prevzem = {
  skladisce: string | null;
  stevilka: string | null;
  datum: IsoDate | null;
  /** Lokalni čas kreiranja "YYYY-MM-DDTHH:MM:SS". */
  cas: string | null;
  narocilo: string | null;
  dobavitelj: string | null;
  dobavnica: string | null;
  delovni_nalog: string | null;
  ident: string;
  naziv: string | null;
  kolicina: number;
  em: string | null;
  uporabnik: string | null;
};

export type DoiUvoz = {
  id: number;
  datoteka: string;
  st_postavk: number;
  created_at: string;
};

export type IzdajeUvozPregled = {
  vrstice: IzdajaVrstica[];
  nalogov: number;
  zakljucenih: number;
  opozorila: string[];
};
export type PrevzemiUvozPregled = {
  prevzemi: Prevzem[];
  od: IsoDate | null;
  do: IsoDate | null;
  opozorila: string[];
};

// =====================================================================
// UVOZ XLSX
// =====================================================================

/** "Zap.številka naloga" -> "zap številka naloga", "Proizvodna. šifra" -> "proizvodna šifra". */
const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/_x000d_/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

const txt = (x: unknown) => (x === null || x === undefined || String(x).trim() === "" ? null : String(x).trim());
const st = (x: unknown) => parseNum(x) ?? 0;

/** Excelov datum z uro (serijska številka) -> lokalni čas "YYYY-MM-DDTHH:MM:SS". */
function parseCas(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400) * 1000);
    return d.toISOString().slice(0, 19);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
  if (iso) return `${iso[1]}T${iso[2].length === 5 ? `${iso[2]}:00` : iso[2]}`;
  return null;
}

async function preberiVrstice(file: File) {
  // dense + brez besedila / HTML / formul celic: izvoz izdaj ima ~160.000 vrstic, branje je pol hitrejše
  const wb = XLSX.read(await file.arrayBuffer(), { dense: true, cellText: false, cellHTML: false, cellFormula: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });
}

/** Indeksi stolpcev po imenih glave (prvo ujemanje). */
function indeksiGlave<K extends string>(glava: string[], stolpci: Record<string, K>) {
  const out: [number, K][] = [];
  const zasedeni = new Set<K>();
  for (const [ime, polje] of Object.entries(stolpci) as [string, K][]) {
    const i = glava.indexOf(ime);
    if (i >= 0 && !zasedeni.has(polje)) {
      out.push([i, polje]);
      zasedeni.add(polje);
    }
  }
  return out;
}

const STOLPCI_IZDAJE: Record<string, keyof IzdajaVrstica> = {
  "zap številka naloga": "st_naloga",
  "opis delovnega naloga": "opis",
  "koda artikla": "koda_artikla",
  "naziv artikla": "naziv_artikla",
  status: "status",
  "status naloga": "status_naloga",
  "rok izdelave": "rok_izdelave",
  "razpisana količina": "razpisana_kolicina",
  "proizvodna šifra": "ident",
  naziv: "naziv",
  naročeno: "naroceno",
  skupina: "skupina",
  skl: "skl",
  em: "em",
  "trenutna zaloga": "zaloga",
  "porabljena količina na dn": "porabljeno",
  "planirana količina na dn": "planirano",
  "za izdajo": "za_izdajo",
};

/** Zaključen nalog (status Z) ali vrstica brez statusa - ne shranjuje se. */
const jeAktiven = (status: string | null) => !!status && status.toUpperCase() !== "Z";

export async function preberiIzdajeXlsx(file: File): Promise<IzdajeUvozPregled> {
  const rows = await preberiVrstice(file);
  const glavaIdx = rows
    .slice(0, 15)
    .findIndex((r) => r.some((c) => norm(c) === "za izdajo") && r.some((c) => norm(c) === "proizvodna šifra"));
  if (glavaIdx < 0)
    throw new Error('V datoteki ni stolpcev "Proizvodna šifra" in "Za izdajo". Ali je to izvoz Kreiranje izdaj v proizvodnjo?');
  const indeksi = indeksiGlave(rows[glavaIdx].map(norm), STOLPCI_IZDAJE);
  for (const p of ["st_naloga", "status", "planirano", "za_izdajo", "zaloga"] as const) {
    if (!indeksi.some(([, x]) => x === p))
      throw new Error(`V datoteki manjka stolpec za "${p}". Ali je to izvoz izdaj v proizvodnjo?`);
  }

  const vrstice: IzdajaVrstica[] = [];
  const nalogi = new Set<string>();
  const zakljuceni = new Set<string>();
  for (const r of rows.slice(glavaIdx + 1)) {
    const v: Partial<Record<keyof IzdajaVrstica, unknown>> = {};
    for (const [i, polje] of indeksi) v[polje] = r[i];
    const nalog = txt(v.st_naloga);
    const ident = txt(v.ident);
    if (!nalog || !ident) continue;
    const status = txt(v.status);
    if (!jeAktiven(status)) {
      zakljuceni.add(nalog);
      continue;
    }
    nalogi.add(nalog);
    vrstice.push({
      st_naloga: nalog,
      opis: txt(v.opis),
      koda_artikla: txt(v.koda_artikla),
      naziv_artikla: txt(v.naziv_artikla),
      status,
      status_naloga: txt(v.status_naloga),
      rok_izdelave: parseAnyDate(v.rok_izdelave),
      razpisana_kolicina: st(v.razpisana_kolicina),
      ident,
      naziv: txt(v.naziv),
      naroceno:
        String(v.naroceno ?? "")
          .trim()
          .toUpperCase() === "DA",
      skupina: txt(v.skupina),
      skl: txt(v.skl),
      em: txt(v.em),
      zaloga: st(v.zaloga),
      porabljeno: st(v.porabljeno),
      planirano: st(v.planirano),
      za_izdajo: st(v.za_izdajo),
    });
  }
  if (vrstice.length === 0) throw new Error("V datoteki ni aktivnih delovnih nalogov (vsi so zaključeni).");
  const opozorila: string[] = [];
  const brezRoka = new Set(vrstice.filter((x) => !x.rok_izdelave).map((x) => x.st_naloga));
  if (brezRoka.size) opozorila.push(`${brezRoka.size} aktivnih nalogov nima roka izdelave (razvrščeni so na konec).`);
  return {
    vrstice,
    nalogov: nalogi.size,
    zakljucenih: zakljuceni.size,
    opozorila,
  };
}

const STOLPCI_PREVZEMA: Record<string, keyof Prevzem | "zaloge" | "dn_glava" | "cas_vnosa"> = {
  skladišče: "skladisce",
  številka: "stevilka",
  datum: "datum",
  "datum/ura kreiranja": "cas",
  "datum vnosa": "cas_vnosa",
  "naročilo risp": "narocilo",
  dobavitelj: "dobavitelj",
  "številka dobavnice": "dobavnica",
  "postavka - delovni nalog": "delovni_nalog",
  "delovni nalog": "dn_glava",
  "proizvodna šifra": "ident",
  "naziv identa": "naziv",
  količina: "kolicina",
  em: "em",
  uporabnik: "uporabnik",
  zaloge: "zaloge",
};

export async function preberiPrevzemeXlsx(file: File): Promise<PrevzemiUvozPregled> {
  const rows = await preberiVrstice(file);
  const glavaIdx = rows
    .slice(0, 15)
    .findIndex((r) => r.some((c) => norm(c) === "proizvodna šifra") && r.some((c) => norm(c) === "dobavitelj"));
  if (glavaIdx < 0)
    throw new Error('V datoteki ni stolpcev "Proizvodna šifra" in "Dobavitelj". Ali je to izvoz Prevzem od dobavitelja?');
  const indeksi = indeksiGlave(rows[glavaIdx].map(norm), STOLPCI_PREVZEMA);
  for (const p of ["ident", "kolicina", "datum"] as const) {
    if (!indeksi.some(([, x]) => x === p)) throw new Error(`V datoteki manjka stolpec za "${p}". Ali je to izvoz prevzemov?`);
  }

  const prevzemi: Prevzem[] = [];
  let brezZaloge = 0;
  for (const r of rows.slice(glavaIdx + 1)) {
    const v: Partial<Record<keyof Prevzem | "zaloge" | "dn_glava" | "cas_vnosa", unknown>> = {};
    for (const [i, polje] of indeksi) v[polje] = r[i];
    const ident = txt(v.ident);
    if (!ident) continue; // glava prevzema brez postavk
    // Postavka, ki ne gre na zalogo (storitev, strošek), ni material za izdajo
    if (
      String(v.zaloge ?? "")
        .trim()
        .toUpperCase() === "NE"
    ) {
      brezZaloge++;
      continue;
    }
    prevzemi.push({
      skladisce: txt(v.skladisce),
      stevilka: txt(v.stevilka),
      datum: parseAnyDate(v.datum),
      cas: parseCas(v.cas) ?? parseCas(v.cas_vnosa),
      narocilo: txt(v.narocilo),
      dobavitelj: txt(v.dobavitelj),
      dobavnica: txt(v.dobavnica),
      delovni_nalog: txt(v.delovni_nalog) ?? txt(v.dn_glava),
      ident,
      naziv: txt(v.naziv),
      kolicina: st(v.kolicina),
      em: txt(v.em),
      uporabnik: txt(v.uporabnik),
    });
  }
  if (prevzemi.length === 0) throw new Error("V datoteki ni postavk prevzemov.");
  const datumi = prevzemi
    .map((p) => p.datum)
    .filter((d): d is IsoDate => !!d)
    .sort();
  const opozorila = brezZaloge ? [`${brezZaloge} postavk ne gre na zalogo (ZALOGE = NE) - niso uvožene.`] : [];
  return {
    prevzemi,
    od: datumi[0] ?? null,
    do: datumi[datumi.length - 1] ?? null,
    opozorila,
  };
}

/** Shrani uvoz (vrstice v kosih) in ga aktivira, ko so vse vrstice vpisane. */
async function shraniUvozDoi<T extends object>(
  tabelaUvozov: string,
  tabela: string,
  glava: Record<string, unknown>,
  vrstice: T[],
) {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb.from(tabelaUvozov).insert(glava).select("id").single();
  if (error) throw error;
  for (const kos of kosi(vrstice)) {
    const { error: e } = await sb.from(tabela).insert(kos.map((x) => ({ ...x, uvoz_id: uvoz.id })));
    if (e) throw new Error(`Podatki niso bili v celoti shranjeni (uvoz ni aktiviran - ponovi uvoz): ${e.message}`);
  }
  const { error: e2 } = await sb.from(tabelaUvozov).update({ aktiven: true }).eq("id", uvoz.id);
  if (e2) throw e2;
}

export async function shraniIzdajeUvoz(datoteka: string, p: IzdajeUvozPregled) {
  await shraniUvozDoi(
    "fp_doi_izdaje_uvozi",
    "fp_doi_izdaje",
    { datoteka, st_postavk: p.vrstice.length, st_nalogov: p.nalogov },
    p.vrstice,
  );
}

export async function shraniPrevzemeUvoz(datoteka: string, p: PrevzemiUvozPregled) {
  await shraniUvozDoi("fp_doi_prevzemi_uvozi", "fp_doi_prevzemi", { datoteka, st_postavk: p.prevzemi.length }, p.prevzemi);
}

// =====================================================================
// BRANJE
// =====================================================================

async function zadnjiUvoz(tabela: string): Promise<DoiUvoz | null> {
  const { data, error } = await getSupabase()
    .from(tabela)
    .select("id, datoteka, st_postavk, created_at")
    .eq("aktiven", true)
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const POLJA_IZDAJE =
  "st_naloga, opis, koda_artikla, naziv_artikla, status, status_naloga, rok_izdelave, razpisana_kolicina, ident, naziv, naroceno, skupina, skl, em, zaloga, porabljeno, planirano, za_izdajo";
const POLJA_PREVZEMA =
  "skladisce, stevilka, datum, cas, narocilo, dobavitelj, dobavnica, delovni_nalog, ident, naziv, kolicina, em, uporabnik";

export async function naloziIzdaje(): Promise<{
  uvoz: DoiUvoz | null;
  vrstice: IzdajaVrstica[];
}> {
  const uvoz = await zadnjiUvoz("fp_doi_izdaje_uvozi");
  if (!uvoz) return { uvoz: null, vrstice: [] };
  const sb = getSupabase();
  const vrstice = await fetchAll<IzdajaVrstica>((from, to) =>
    sb.from("fp_doi_izdaje").select(POLJA_IZDAJE).eq("uvoz_id", uvoz.id).eq("visible", true).order("id").range(from, to),
  );
  return {
    uvoz,
    vrstice: vrstice.map((v) => ({
      ...v,
      razpisana_kolicina: Number(v.razpisana_kolicina),
      zaloga: Number(v.zaloga),
      porabljeno: Number(v.porabljeno),
      planirano: Number(v.planirano),
      za_izdajo: Number(v.za_izdajo),
    })),
  };
}

export async function naloziPrevzeme(): Promise<{
  uvoz: DoiUvoz | null;
  prevzemi: Prevzem[];
}> {
  const uvoz = await zadnjiUvoz("fp_doi_prevzemi_uvozi");
  if (!uvoz) return { uvoz: null, prevzemi: [] };
  const sb = getSupabase();
  const prevzemi = await fetchAll<Prevzem>((from, to) =>
    sb.from("fp_doi_prevzemi").select(POLJA_PREVZEMA).eq("uvoz_id", uvoz.id).eq("visible", true).order("id").range(from, to),
  );
  return {
    uvoz,
    prevzemi: prevzemi.map((p) => ({ ...p, kolicina: Number(p.kolicina) })),
  };
}

// =====================================================================
// IZRAČUN
// =====================================================================

export type Nastavitve = {
  /** Najmanjši delež izdanih vrstic (%), da nalog šteje kot nabran. */
  prag: number;
  /** Skupine materiala, ki se ne štejejo v delež izdanega (npr. pločevina se izda prej za razrez); null = privzete. */
  izlocene: string[] | null;
};

export const PRIVZETE_NASTAVITVE: Nastavitve = {
  prag: 50,
  izlocene: null,
};

/** Kartica je rumena od tega delovnega dne od prevzema (dan prevzema = 1. dan) in rdeča od RDECA_OD naprej. */
export const RUMENA_OD = 3;
export const RDECA_OD = 4;
/**
 * Nove kartice se zaznajo samo iz prevzemov zadnjih N delovnih dni: "zaloga pred prevzemom = trenutna - prevzeto"
 * ne vidi izdaj med prevzemom in izvozom, zato je zanesljiva samo nekaj dni. Zaznana kartica se shrani v bazo
 * (fp_doi_cakanje) in od tam živi, dokler material ni izdan.
 */
export const ROK_ZAZNAVE = RDECA_OD;

/** Privzeto izločene skupine: pločevina (izda se prej za razrez) in polizdelki (P-...), ki jih izdela proizvodnja. */
export const privzeteIzlocene = (skupine: string[]) => skupine.filter((s) => /PLOČEVIN|^P-/i.test(s));

export type StanjeNaloga = "upostevan" | "pod_pragom" | "ni_zacet" | "izdan";

export const OPIS_STANJA: Record<StanjeNaloga, string> = {
  upostevan: "Delno izdan",
  pod_pragom: "V nabiranju",
  ni_zacet: "Nabiranje ni začeto",
  izdan: "V celoti izdan",
};

export type NalogPregled = {
  st_naloga: string;
  /** Ključ krovnega: Krovni DN, sicer nalog sam. */
  krovni: string;
  koda_artikla: string | null;
  naziv: string | null;
  status: string | null;
  status_naloga: string | null;
  rok: IsoDate | null;
  razpisana: number;
  /** Vrstice, ki štejejo v delež (brez izločenih skupin). */
  vrstic: number;
  izdanih: number;
  delez: number;
  /** Vrstice (vseh skupin) z neizdano količino. */
  odprtih: number;
  stanje: StanjeNaloga;
};

/** Koliko časa material čaka na izdajo (barva kartice); "ni_manjkalo" = zaloge je bilo dovolj že pred prevzemom. */
export type Faza = "nov" | "tretji" | "zamuja" | "ni_manjkalo";

export const OPIS_FAZE: Record<Faza, string> = {
  nov: "Nov prevzem",
  tretji: `${RUMENA_OD}. dan`,
  zamuja: "Zamuja",
  ni_manjkalo: "Ni manjkalo",
};

/** Koliko količine za izdajo pokrije trenutna zaloga. */
export type Pokritost = "vse" | "delno" | "nic";

/** Čakajoča izdaja (material, ki je prispel in čaka na izdajo na nalog) - shranjena v fp_doi_cakanje. */
export type Cakanje = {
  ident: string;
  st_naloga: string;
  prevzem_datum: IsoDate;
  prevzem_stevilka: string | null;
  /** Obvestilo v Teams (SQL 026) - čas in pošiljatelj. */
  obvesceno_at?: string | null;
  obvestil?: string | null;
};
export type CakanjeZapis = Cakanje & { id: number };

export type Kartica = {
  nalog: NalogPregled;
  ident: string;
  naziv: string | null;
  em: string | null;
  za_izdajo: number;
  porabljeno: number;
  planirano: number;
  /** Koliko od količine za izdajo pokrije trenutna zaloga (po vrsti roka). */
  na_voljo: number;
  pokritost: Pokritost;
  faza: Faza;
  /** Datum prevzema, s katerim je material postal na voljo, in delovni dnevi od njega (dan prevzema = 1). */
  prevzem_datum: IsoDate | null;
  starost: number | null;
  /** Obvestilo v Teams za to čakajočo izdajo (null = še ni obveščeno). */
  obvesceno_at: string | null;
  obvestil: string | null;
};

export type KrovniSkupina = {
  krovni: string;
  naziv: string | null;
  rok: IsoDate | null;
  kartice: Kartica[];
};

export type Stolpec = {
  ident: string;
  naziv: string | null;
  skupina: string | null;
  em: string | null;
  zaloga: number;
  /** Prevzemi od najstarejše čakajoče izdaje do danes (najnovejši prvi). */
  prevzemi: Prevzem[];
  prevzeto: number;
  /** Najdlje čakajoča izdaja materiala (delovni dnevi); null = ni manjkalo. */
  starost: number | null;
  faza: Faza;
  zadnjiPrevzem: string | null;
  /** Zadnje obvestilo v Teams za ta material in število čakajočih nalogov, ki še niso bili v obvestilu. */
  obvesceno: { cas: string; kdo: string | null } | null;
  neobvescenih: number;
  kartice: Kartica[];
  /** Nalogi, ki se še nabirajo (niso upoštevani) in potrebujejo ta material. */
  ostali: { nalogov: number; kolicina: number };
};

export type Doizdaja = {
  danes: IsoDate;
  nalogi: NalogPregled[];
  stolpci: Stolpec[];
  skupine: string[];
  /** Klasifikati (prve 3 števke šifre materiala) po skupini, npr. "096" ali "096, 097". */
  klasifikati: Record<string, string>;
  /** Na novo zaznane čakajoče izdaje - zapiši v bazo. */
  nove: Cakanje[];
  /** Shranjene čakajoče izdaje, ki so izdane (ali nalog ni več aktiven) - zaključi v bazi. */
  zakljuci: number[];
};

const EPS = 1e-6;

/** Stanje vrstice materiala na nalogu. */
export type StanjeVrstice = "neizdano" | "delno" | "izdano";

export const OPIS_VRSTICE: Record<StanjeVrstice, string> = {
  neizdano: "Neizdano",
  delno: "Delno izdano",
  izdano: "Izdano",
};

export const stanjeVrstice = (v: IzdajaVrstica): StanjeVrstice =>
  v.za_izdajo <= EPS ? "izdano" : v.porabljeno > EPS ? "delno" : "neizdano";

const poRoku = (a: { rok: IsoDate | null; st_naloga: string }, b: { rok: IsoDate | null; st_naloga: string }) =>
  (a.rok ?? "9999").localeCompare(b.rok ?? "9999") || a.st_naloga.localeCompare(b.st_naloga, "sl", { numeric: true });

/** Delovni dnevi od `od` do `doo`, oba vključena (prevzem danes = 1. dan). */
export function delovniDni(od: IsoDate, doo: IsoDate): number {
  if (od >= doo) return 1;
  let n = 0;
  for (let d = od; d <= doo; d = addDays(d, 1)) if (weekday(d) <= 5) n++;
  return Math.max(1, n);
}

export const fazaPoStarosti = (starost: number): Faza =>
  starost >= RDECA_OD ? "zamuja" : starost >= RUMENA_OD ? "tretji" : "nov";

function zadnjeObvestilo(kartice: Kartica[]): Stolpec["obvesceno"] {
  const k = kartice.filter((x) => x.obvesceno_at).sort((a, b) => b.obvesceno_at!.localeCompare(a.obvesceno_at!))[0];
  return k ? { cas: k.obvesceno_at!, kdo: k.obvestil } : null;
}

/** Klasifikat materiala: številčna predpona šifre ("096-10129" -> "096"). */
const klasifikat = (ident: string) => ident.match(/^(\d+)-/)?.[1] ?? null;

/** "096 · Pločevina" - skupina s klasifikatom za prikaz. */
export const skupinaSKlasifikatom = (skupina: string, klasifikati: Record<string, string>) =>
  klasifikati[skupina] ? `${klasifikati[skupina]} · ${skupina}` : skupina;

const prevzemKljuc =(p: Prevzem) => p.cas ?? p.datum ?? "";
const kljucCakanja = (ident: string, st_naloga: string) => `${ident}|${st_naloga}`;

/**
 * 1. Nalogi: aktivni nalog šteje kot "delno izdan" (upoštevan), če je izdanih vsaj `prag` % vrstic
 *    (brez izločenih skupin - pločevina se izda prej za razrez) in ima še neizdane vrstice.
 *    Nalog brez izdane vrstice se še ni začel nabirati, pod pragom se še nabira - oboje se ne upošteva.
 * 2. Zaznava (prevzemi zadnjih ROK_ZAZNAVE delovnih dni): za material z neizdanimi vrsticami upoštevanih nalogov
 *    (po vrsti roka) se od najnovejšega prevzema nazaj seštevajo količine; prvi prevzem, pred katerim zaloga
 *    (trenutna - prevzeto od tega prevzema naprej) ni pokrila potrebe, je prevzem, s katerim je material postal
 *    na voljo. Vrstice, ki jih je pokrila že zaloga pred njim, niso manjkale ("ni_manjkalo").
 * 3. Zaznane vrstice so čakajoče izdaje: shranijo se v bazo in ostanejo, dokler izvoz izdaj ne pokaže, da je
 *    material izdan. Dnevi se štejejo od prevzema: 1.-2. delovni dan zelena, 3. rumena, od 4. rdeča.
 *    En stolpec na material; barva stolpca je po najdlje čakajočem nalogu.
 */
export function izracunajDoizdajo(
  vrstice: IzdajaVrstica[],
  prevzemi: Prevzem[],
  krovniDn: Map<string, string | null>,
  nast: Nastavitve,
  cakanje: CakanjeZapis[],
  {
    danes = todayWorkday(),
    zaznavaj = true,
  }: {
    danes?: IsoDate;
    /** false, ko izvoz izdaj ni svež (starejši od prevzemov) - ocena zaloge pred prevzemom ne bi bila pravilna. */
    zaznavaj?: boolean;
  } = {},
): Doizdaja {
  const klasifikatiSkupin = new Map<string, Set<string>>();
  for (const v of vrstice) {
    if (!v.skupina) continue;
    const k = klasifikat(v.ident);
    if (!klasifikatiSkupin.has(v.skupina)) klasifikatiSkupin.set(v.skupina, new Set());
    if (k) klasifikatiSkupin.get(v.skupina)!.add(k);
  }
  const klasifikati = Object.fromEntries(
    [...klasifikatiSkupin].map(([s, ks]) => [s, [...ks].sort((a, b) => a.localeCompare(b, "sl", { numeric: true })).join(", ")]),
  );
  // Po klasifikatu (skladišče skupine pozna po številki), nato po nazivu
  const skupine = [...klasifikatiSkupin.keys()].sort(
    (a, b) => klasifikati[a].localeCompare(klasifikati[b], "sl", { numeric: true }) || a.localeCompare(b, "sl"),
  );
  const izlocene = new Set(nast.izlocene ?? privzeteIzlocene(skupine));

  // ---- 1. nalogi
  const poNalogu = new Map<string, IzdajaVrstica[]>();
  for (const v of vrstice) {
    const xs = poNalogu.get(v.st_naloga);
    if (xs) xs.push(v);
    else poNalogu.set(v.st_naloga, [v]);
  }
  const nalogi = new Map<string, NalogPregled>();
  for (const [st_naloga, xs] of poNalogu) {
    const stetje = xs.filter((v) => !izlocene.has(v.skupina ?? ""));
    const osnova = stetje.length ? stetje : xs;
    const izdanih = osnova.filter((v) => v.porabljeno > EPS).length;
    const delez = osnova.length ? izdanih / osnova.length : 0;
    const odprtih = xs.filter((v) => v.za_izdajo > EPS).length;
    const stanje: StanjeNaloga =
      izdanih === 0 ? "ni_zacet" : delez * 100 + EPS < nast.prag ? "pod_pragom" : odprtih === 0 ? "izdan" : "upostevan";
    const p = xs[0];
    nalogi.set(st_naloga, {
      st_naloga,
      krovni: krovniDn.get(st_naloga) ?? st_naloga,
      koda_artikla: p.koda_artikla,
      naziv: p.naziv_artikla ?? p.opis,
      status: p.status,
      status_naloga: p.status_naloga,
      rok: p.rok_izdelave,
      razpisana: p.razpisana_kolicina,
      vrstic: osnova.length,
      izdanih,
      delez,
      odprtih,
      stanje,
    });
  }

  // Neizdane vrstice (vsota, če je ident na nalogu večkrat), po identu
  type Odprta = { nalog: NalogPregled; v: IzdajaVrstica; za: number; por: number; plan: number };
  const odprte = new Map<string, Odprta>();
  const odprtePoIdentu = new Map<string, Odprta[]>();
  for (const v of vrstice) {
    if (v.za_izdajo <= EPS) continue;
    const k = kljucCakanja(v.ident, v.st_naloga);
    const o = odprte.get(k);
    if (o) {
      o.za += v.za_izdajo;
      o.por += v.porabljeno;
      o.plan += v.planirano;
      continue;
    }
    const nova: Odprta = { nalog: nalogi.get(v.st_naloga)!, v, za: v.za_izdajo, por: v.porabljeno, plan: v.planirano };
    odprte.set(k, nova);
    const xs = odprtePoIdentu.get(v.ident);
    if (xs) xs.push(nova);
    else odprtePoIdentu.set(v.ident, [nova]);
  }

  // Prevzemi po identu (najnovejši prvi)
  const prevzetiPoIdentu = new Map<string, Prevzem[]>();
  for (const p of prevzemi) {
    if (!p.datum || p.datum > danes || p.kolicina <= 0) continue;
    const xs = prevzetiPoIdentu.get(p.ident);
    if (xs) xs.push(p);
    else prevzetiPoIdentu.set(p.ident, [p]);
  }
  for (const xs of prevzetiPoIdentu.values()) xs.sort((a, b) => prevzemKljuc(b).localeCompare(prevzemKljuc(a)));

  // ---- 2. zaznava iz nedavnih prevzemov
  const zaznane = new Map<string, Cakanje>();
  const niManjkalo = new Set<string>();
  if (zaznavaj) {
    for (const [ident, prejeti] of prevzetiPoIdentu) {
      const nedavni = prejeti.filter((p) => delovniDni(p.datum!, danes) <= ROK_ZAZNAVE);
      if (nedavni.length === 0) continue;
      const ups = (odprtePoIdentu.get(ident) ?? [])
        .filter((o) => o.nalog.stanje === "upostevan")
        .sort((a, b) => poRoku(a.nalog, b.nalog));
      if (ups.length === 0) continue;
      const zaloga = ups[0].v.zaloga;
      if (zaloga <= EPS) continue; // ni česa izdati - material čaka dobavo
      const potreba = ups.reduce((s, o) => s + o.za, 0);
      let resilni: Prevzem | null = null;
      let vsota = 0;
      for (const p of nedavni) {
        vsota += p.kolicina;
        if (zaloga - vsota < potreba - EPS) {
          resilni = p;
          break;
        }
      }
      const zalogaPred = zaloga - vsota;
      let porabljeno = 0;
      for (const o of ups) {
        const pokritoPred = Math.min(o.za, Math.max(0, zalogaPred - porabljeno));
        porabljeno += o.za;
        const k = kljucCakanja(ident, o.nalog.st_naloga);
        if (!resilni || pokritoPred >= o.za - EPS) niManjkalo.add(k);
        else
          zaznane.set(k, {
            ident,
            st_naloga: o.nalog.st_naloga,
            prevzem_datum: resilni.datum!,
            prevzem_stevilka: resilni.stevilka,
          });
      }
    }
  }

  // ---- 3. čakajoče izdaje = shranjene (še neizdane) + na novo zaznane
  const aktivne = new Map<string, Cakanje>();
  const zakljuci: number[] = [];
  for (const c of cakanje) {
    const k = kljucCakanja(c.ident, c.st_naloga);
    if (odprte.has(k)) aktivne.set(k, c);
    else zakljuci.push(c.id);
  }
  const nove: Cakanje[] = [];
  for (const [k, z] of zaznane) {
    if (aktivne.has(k)) continue;
    aktivne.set(k, z);
    nove.push(z);
  }
  for (const k of aktivne.keys()) niManjkalo.delete(k);

  // ---- 4. stolpci (en na material)
  const identi = new Set([...aktivne.values()].map((c) => c.ident));
  for (const k of niManjkalo) identi.add(k.slice(0, k.indexOf("|")));
  const stolpci: Stolpec[] = [];
  for (const ident of identi) {
    const vse = odprtePoIdentu.get(ident) ?? [];
    const prikazane = vse
      .filter((o) => {
        const k = kljucCakanja(ident, o.nalog.st_naloga);
        return aktivne.has(k) || niManjkalo.has(k);
      })
      .sort((a, b) => poRoku(a.nalog, b.nalog));
    if (prikazane.length === 0) continue;
    const zaloga = vse[0].v.zaloga;
    let porabljeno = 0;
    const kartice: Kartica[] = prikazane.map((o) => {
      const c = aktivne.get(kljucCakanja(ident, o.nalog.st_naloga));
      const na_voljo = Math.min(o.za, Math.max(0, zaloga - porabljeno));
      porabljeno += o.za;
      const starost = c ? delovniDni(c.prevzem_datum, danes) : null;
      return {
        nalog: o.nalog,
        ident,
        naziv: o.v.naziv,
        em: o.v.em,
        za_izdajo: o.za,
        porabljeno: o.por,
        planirano: o.plan,
        na_voljo,
        pokritost: na_voljo >= o.za - EPS ? "vse" : na_voljo > EPS ? "delno" : "nic",
        faza: starost === null ? "ni_manjkalo" : fazaPoStarosti(starost),
        prevzem_datum: c?.prevzem_datum ?? null,
        starost,
        // obvestilo iz prejšnjega kroga (pred tem prevzemom) ne velja
        obvesceno_at: c?.obvesceno_at && c.obvesceno_at.slice(0, 10) >= c.prevzem_datum ? c.obvesceno_at : null,
        obvestil: c?.obvesceno_at && c.obvesceno_at.slice(0, 10) >= c.prevzem_datum ? (c.obvestil ?? null) : null,
      };
    });
    const starosti = kartice.map((k) => k.starost).filter((x): x is number => x !== null);
    const starost = starosti.length ? Math.max(...starosti) : null;
    const najstarejsi = kartice
      .map((k) => k.prevzem_datum)
      .filter((x): x is IsoDate => !!x)
      .sort()[0];
    const prejeti = prevzetiPoIdentu.get(ident) ?? [];
    const prikazaniPrevzemi = najstarejsi
      ? prejeti.filter((p) => p.datum! >= najstarejsi)
      : prejeti.filter((p) => delovniDni(p.datum!, danes) <= ROK_ZAZNAVE);
    const ostale = vse.filter((o) => !prikazane.includes(o) && o.nalog.stanje !== "upostevan");
    stolpci.push({
      ident,
      naziv: vse[0].v.naziv ?? prejeti[0]?.naziv ?? null,
      skupina: vse[0].v.skupina,
      em: vse[0].v.em ?? prejeti[0]?.em ?? null,
      zaloga,
      prevzemi: prikazaniPrevzemi,
      prevzeto: prikazaniPrevzemi.reduce((s, p) => s + p.kolicina, 0),
      starost,
      faza: starost === null ? "ni_manjkalo" : fazaPoStarosti(starost),
      zadnjiPrevzem: prikazaniPrevzemi[0] ? prevzemKljuc(prikazaniPrevzemi[0]) : null,
      obvesceno: zadnjeObvestilo(kartice),
      neobvescenih: kartice.filter((k) => k.starost !== null && !k.obvesceno_at).length,
      kartice,
      ostali: { nalogov: ostale.length, kolicina: ostale.reduce((s, o) => s + o.za, 0) },
    });
  }

  return { danes, nalogi: [...nalogi.values()].sort(poRoku), stolpci, skupine, klasifikati, nove, zakljuci };
}

// =====================================================================
// ČAKAJOČE IZDAJE (BAZA)
// =====================================================================

export async function naloziCakanje(): Promise<CakanjeZapis[]> {
  const sb = getSupabase();
  const beri = (polja: string) =>
    fetchAll<CakanjeZapis>((from, to) =>
      sb
        .from("fp_doi_cakanje")
        .select(polja)
        .is("zakljuceno_at", null)
        .eq("visible", true)
        .order("id")
        .range(from, to)
        .returns<CakanjeZapis[]>(),
    );
  try {
    return await beri("id, ident, st_naloga, prevzem_datum, prevzem_stevilka, obvesceno_at, obvestil");
  } catch (e) {
    // brez SQL 026 (stolpci obvestila) - kartice delujejo, obvestilo se ne zapiše
    if (!/obvesceno_at|obvestil/i.test((e as Error).message)) throw e;
    return beri("id, ident, st_naloga, prevzem_datum, prevzem_stevilka");
  }
}

/** Zapiše obvestilo v Teams pri vseh čakajočih izdajah poslanih materialov. */
export async function zabeleziObvestilo(identi: string[], obvestil: string | null) {
  const sb = getSupabase();
  const zdaj = new Date().toISOString();
  for (const kos of kosi(identi)) {
    const { error } = await sb
      .from("fp_doi_cakanje")
      .update({ obvesceno_at: zdaj, obvestil })
      .in("ident", kos)
      .is("zakljuceno_at", null);
    if (error) throw new Error(error.message);
  }
}

/** Zapiše nove čakajoče izdaje; zaključena izdaja istega materiala na istem nalogu se ponovno odpre z novim prevzemom. */
export async function shraniCakanje(nove: Cakanje[]) {
  const sb = getSupabase();
  for (const kos of kosi(nove)) {
    const { error } = await sb.from("fp_doi_cakanje").upsert(
      kos.map((c) => ({ ...c, zakljuceno_at: null, visible: true })),
      { onConflict: "ident,st_naloga" },
    );
    if (error) throw new Error(error.message);
  }
}

/** Material je izdan (ali nalog ni več aktiven) - čakajoča izdaja se zaključi (ne briše). */
export async function zakljuciCakanje(ids: number[]) {
  const sb = getSupabase();
  const zdaj = new Date().toISOString();
  for (const kos of kosi(ids)) {
    const { error } = await sb.from("fp_doi_cakanje").update({ zakljuceno_at: zdaj }).in("id", kos);
    if (error) throw new Error(error.message);
  }
}

/** Kartice stolpca, grupirane po krovnem nalogu (skupine po najzgodnejšem roku). */
export function poKrovnih(kartice: Kartica[], nazivKrovnega: (krovni: string) => string | null): KrovniSkupina[] {
  const m = new Map<string, KrovniSkupina>();
  for (const k of kartice) {
    const s = m.get(k.nalog.krovni);
    if (s) {
      s.kartice.push(k);
      if (k.nalog.rok && (!s.rok || k.nalog.rok < s.rok)) s.rok = k.nalog.rok;
    } else
      m.set(k.nalog.krovni, {
        krovni: k.nalog.krovni,
        naziv: nazivKrovnega(k.nalog.krovni),
        rok: k.nalog.rok,
        kartice: [k],
      });
  }
  return [...m.values()].sort(
    (a, b) => (a.rok ?? "9999").localeCompare(b.rok ?? "9999") || a.krovni.localeCompare(b.krovni, "sl", { numeric: true }),
  );
}
