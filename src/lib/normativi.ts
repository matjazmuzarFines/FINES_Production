import { fetchAll, getSupabase, kosi } from "./supabase";
import { parseNum } from "./stevila";

// =====================================================================
// TIPI
// =====================================================================

export const ODDELKI_NORMATIVA = [
  { polje: "normativ_proizvodnja", koda: "P", label: "Proizvodnja" },
  { polje: "normativ_montaza", koda: "M", label: "Montaža" },
  { polje: "normativ_elektro", koda: "E", label: "Elektro" },
  { polje: "normativ_testiranje", koda: "T", label: "Testiranje" },
] as const;

export type OddelekKoda = (typeof ODDELKI_NORMATIVA)[number]["koda"];
export type NormativPolje = (typeof ODDELKI_NORMATIVA)[number]["polje"] | "normativ_skupni";

export type Normativ = {
  id: number;
  ident: string;
  naziv: string;
  druzina: string; // koda družine ("" = brez)
  velikost: number | null;
  normativ_skupni: number;
  normativ_proizvodnja: number;
  normativ_montaza: number;
  normativ_elektro: number;
  normativ_testiranje: number;
  barvanje: boolean;
  cleaning: boolean;
  opomba: string | null;
  visible: boolean;
};

export type Druzina = { id: number; koda: string };

export type OddelekPolje = (typeof ODDELKI_NORMATIVA)[number]["polje"];
const DELI: OddelekPolje[] = ODDELKI_NORMATIVA.map((o) => o.polje);

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function vsotaDelov(n: Pick<Normativ, OddelekPolje>) {
  return r3(DELI.reduce((s, p) => s + n[p], 0));
}

/** Vsota normativov oddelkov se ne ujema s skupnim normativom. */
export function vsotaNeUjema(n: Normativ) {
  return Math.abs(vsotaDelov(n) - n.normativ_skupni) > 0.0005;
}

/**
 * Razdeli `skupaj` na dele v razmerju `utezi` (zaokroženo na 3 decimalke,
 * ostanek zaokroževanja gre največjemu delu, da je vsota točna).
 * Vrne null, če so vse uteži 0.
 */
export function razdeliSorazmerno(skupaj: number, utezi: number[]): number[] | null {
  const vsota = utezi.reduce((s, u) => s + u, 0);
  if (vsota <= 0) return skupaj === 0 ? utezi.map(() => 0) : null;
  const deli = utezi.map((u) => r3((u * skupaj) / vsota));
  const ostanek = r3(skupaj - deli.reduce((s, d) => s + d, 0));
  if (ostanek !== 0) {
    const i = deli.indexOf(Math.max(...deli));
    deli[i] = r3(deli[i] + ostanek);
  }
  return deli;
}

/**
 * Pravilo: skupni normativ = vsota oddelkov.
 * - sprememba oddelka -> skupni se preračuna
 * - sprememba skupnega -> oddelki se sorazmerno razdelijo
 * Vrne nov normativ ali besedilo napake.
 */
export function uskladiNormativ(n: Normativ, polje: NormativPolje, vrednost: number): Normativ | string {
  if (polje !== "normativ_skupni") {
    const nov = { ...n, [polje]: r3(vrednost) };
    return { ...nov, normativ_skupni: vsotaDelov(nov) };
  }
  const deli = razdeliSorazmerno(r3(vrednost), DELI.map((p) => n[p]));
  if (!deli) return "Skupnega normativa ni mogoče razdeliti, ker so vsi oddelki 0. Najprej vpiši normative po oddelkih.";
  return { ...n, normativ_skupni: r3(vrednost), ...Object.fromEntries(DELI.map((p, i) => [p, deli[i]])) };
}

/** Vnos v oknu "Spremeni normative": null = ne spremeni. */
export type SkupnaSprememba = {
  druzina: string | null;
  velikost: number | null;
  normativ_skupni: number | null;
  normativ_proizvodnja: number | null;
  normativ_montaza: number | null;
  normativ_elektro: number | null;
  normativ_testiranje: number | null;
  barvanje: boolean | null;
  cleaning: boolean | null;
};

/**
 * Uporabi skupno spremembo na en normativ (skupni = vsota oddelkov ostane veljavno):
 * - vpisani oddelki se nastavijo,
 * - če je vpisan tudi skupni, se nevpisani oddelki sorazmerno razdelijo na preostanek,
 * - če je vpisan samo skupni, se vsi oddelki sorazmerno razdelijo,
 * - če skupni ni vpisan, je skupni = vsota oddelkov.
 */
export function uporabiSkupnoSpremembo(n: Normativ, s: SkupnaSprememba): Normativ | string {
  const out: Normativ = {
    ...n,
    druzina: s.druzina ?? n.druzina,
    velikost: s.velikost ?? n.velikost,
    barvanje: s.barvanje ?? n.barvanje,
    cleaning: s.cleaning ?? n.cleaning,
  };
  const vpisani = DELI.filter((p) => s[p] !== null);
  for (const p of vpisani) out[p] = r3(s[p]!);

  if (s.normativ_skupni === null) {
    out.normativ_skupni = vsotaDelov(out);
    return out;
  }
  const skupni = r3(s.normativ_skupni);
  const nevpisani = DELI.filter((p) => s[p] === null);
  const preostanek = r3(skupni - vpisani.reduce((v, p) => v + out[p], 0));
  if (nevpisani.length === 0) {
    if (Math.abs(preostanek) > 0.0005) return "vsota vpisanih oddelkov ni enaka skupnemu normativu";
  } else {
    if (preostanek < 0) return "vpisani oddelki skupaj presegajo skupni normativ";
    const deli = razdeliSorazmerno(preostanek, nevpisani.map((p) => n[p]));
    if (!deli) return "ostanka skupnega normativa ni mogoče razdeliti (nevpisani oddelki so 0)";
    nevpisani.forEach((p, i) => (out[p] = deli[i]));
  }
  out.normativ_skupni = skupni;
  return out;
}

// =====================================================================
// BRANJE
// =====================================================================

export async function naloziDruzine(): Promise<Druzina[]> {
  const { data, error } = await getSupabase()
    .from("spl_druzine")
    .select("id, koda")
    .eq("visible", true)
    .order("koda");
  if (error) throw error;
  return data ?? [];
}

type NormativRow = Omit<Normativ, "druzina"> & { druzina: { koda: string } | { koda: string }[] | null };

function izVrstice(r: NormativRow): Normativ {
  const d = Array.isArray(r.druzina) ? r.druzina[0] : r.druzina;
  return {
    ...r,
    druzina: d?.koda ?? "",
    velikost: r.velikost === null ? null : Number(r.velikost),
    normativ_skupni: Number(r.normativ_skupni),
    normativ_proizvodnja: Number(r.normativ_proizvodnja),
    normativ_montaza: Number(r.normativ_montaza),
    normativ_elektro: Number(r.normativ_elektro),
    normativ_testiranje: Number(r.normativ_testiranje),
  };
}

/** Vsi normativi (tudi skriti - filtrira jih urejevalnik). */
export async function naloziNormative(samoVidni = false): Promise<Normativ[]> {
  const rows = await fetchAll<NormativRow>((from, to) => {
    let q = getSupabase()
      .from("spl_normativi")
      .select(
        "id, ident, naziv, velikost, normativ_skupni, normativ_proizvodnja, normativ_montaza, normativ_elektro, normativ_testiranje, barvanje, cleaning, opomba, visible, druzina:spl_druzine(koda)",
      )
      .order("ident")
      .range(from, to);
    if (samoVidni) q = q.eq("visible", true);
    return q;
  });
  return rows.map(izVrstice);
}

// =====================================================================
// SHRANJEVANJE
// =====================================================================

/** Zagotovi, da družine obstajajo; vrne mapo koda -> id. */
async function zagotoviDruzine(kode: string[]): Promise<Map<string, number>> {
  const sb = getSupabase();
  const unikatne = [...new Set(kode.map((k) => k.trim()).filter(Boolean))];
  if (unikatne.length) {
    const { error } = await sb
      .from("spl_druzine")
      .upsert(
        unikatne.map((koda) => ({ koda })),
        { onConflict: "koda", ignoreDuplicates: true },
      );
    if (error) throw error;
  }
  const vse = await naloziDruzine();
  return new Map(vse.map((d) => [d.koda, d.id]));
}

type NormativVnos = Omit<Normativ, "id" | "visible"> & { id?: number; visible?: boolean };

function vVrstico(n: NormativVnos, druzine: Map<string, number>) {
  return {
    ...(n.id && n.id > 0 ? { id: n.id } : {}),
    ident: n.ident.trim(),
    naziv: n.naziv.trim(),
    druzina_id: n.druzina ? (druzine.get(n.druzina.trim()) ?? null) : null,
    velikost: n.velikost,
    normativ_skupni: n.normativ_skupni,
    normativ_proizvodnja: n.normativ_proizvodnja,
    normativ_montaza: n.normativ_montaza,
    normativ_elektro: n.normativ_elektro,
    normativ_testiranje: n.normativ_testiranje,
    barvanje: n.barvanje,
    cleaning: n.cleaning,
    opomba: n.opomba,
    ...(n.visible !== undefined ? { visible: n.visible } : {}),
  };
}

/** Shrani urejene (id > 0) in nove (id <= 0) normative iz urejevalnika. */
export async function shraniNormative(spremenjeni: Normativ[]) {
  const sb = getSupabase();
  const druzine = await zagotoviDruzine(spremenjeni.map((n) => n.druzina));
  const obstojeci = spremenjeni.filter((n) => n.id > 0).map((n) => vVrstico(n, druzine));
  const novi = spremenjeni.filter((n) => n.id <= 0).map((n) => vVrstico(n, druzine));

  for (const kos of kosi(obstojeci)) {
    const { error } = await sb.from("spl_normativi").upsert(kos, { onConflict: "id" });
    if (error) throw new Error(prevediNapako(error.message));
  }
  for (const kos of kosi(novi)) {
    const { error } = await sb.from("spl_normativi").insert(kos);
    if (error) throw new Error(prevediNapako(error.message));
  }
}

/** Skrij / prikaži izbrane (podatkov ne brišemo). */
export async function nastaviVidnost(ids: number[], visible: boolean) {
  for (const kos of kosi(ids)) {
    const { error } = await getSupabase().from("spl_normativi").update({ visible }).in("id", kos);
    if (error) throw error;
  }
}

function prevediNapako(msg: string) {
  if (msg.includes("spl_normativi_ident_key")) return "Šifra (ident) že obstaja. Vsaka šifra je lahko le enkrat.";
  if (msg.includes("spl_normativi_nenegativni")) return "Normativi ne smejo biti negativni.";
  if (msg.includes("spl_normativi_vsota")) return "Skupni normativ mora biti enak vsoti normativov oddelkov.";
  return msg;
}

// =====================================================================
// CSV UVOZ / IZVOZ
// =====================================================================

export const CSV_STOLPCI = [
  "ident",
  "naziv",
  "druzina",
  "velikost",
  "normativ_skupni",
  "normativ_proizvodnja",
  "normativ_montaza",
  "normativ_elektro",
  "normativ_testiranje",
  "barvanje",
  "cleaning",
] as const;

export const CSV_OBVEZNI = ["ident", "naziv"] as const;
const NORMATIV_STOLPCI_CSV = ["normativ_skupni", ...DELI] as const;

export type CsvRezultat = {
  vrstice: NormativVnos[];
  napake: string[];
  /** Stolpci, ki so v datoteki - pri uvozu se posodobijo samo ti. */
  stolpci: string[];
};

/** Razdeli CSV vrstico (podpira narekovaje in ; ali , kot ločilo). */
function razdeli(vrstica: string, locilo: string): string[] {
  const out: string[] = [];
  let cur = "";
  let vNarekovaju = false;
  for (let i = 0; i < vrstica.length; i++) {
    const c = vrstica[i];
    if (vNarekovaju) {
      if (c === '"' && vrstica[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') vNarekovaju = false;
      else cur += c;
    } else if (c === '"') vNarekovaju = true;
    else if (c === locilo) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function daNe(v: string | undefined): boolean {
  return ["da", "1", "true", "x", "yes"].includes((v ?? "").trim().toLowerCase());
}

/** `obstojeci`: trenutni normativi - potrebni za sorazmerno razdelitev, ko CSV spremeni samo skupni normativ. */
export function preberiCsv(besedilo: string, obstojeci: Normativ[]): CsvRezultat {
  const napake: string[] = [];
  const vrstice: NormativVnos[] = [];
  const lines = besedilo.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { vrstice, napake: ["Datoteka je prazna ali nima podatkov pod glavo."], stolpci: [] };

  const locilo = lines[0].includes(";") ? ";" : ",";
  const glava = razdeli(lines[0], locilo).map((h) => h.toLowerCase());
  const manjkajo = CSV_OBVEZNI.filter((s) => !glava.includes(s));
  if (manjkajo.length) {
    return { vrstice, napake: [`V glavi manjkajo obvezni stolpci: ${manjkajo.join(", ")}`], stolpci: [] };
  }
  if (!NORMATIV_STOLPCI_CSV.some((s) => glava.includes(s))) {
    return { vrstice, napake: ["V glavi ni nobenega stolpca z normativom (normativ_skupni ali normativ_...)."], stolpci: [] };
  }
  const idx = (s: string) => glava.indexOf(s);
  const videni = new Set<string>();
  const poIdentu = new Map(obstojeci.map((n) => [n.ident, n]));

  lines.slice(1).forEach((line, i) => {
    const st = i + 2;
    const c = razdeli(line, locilo);
    const get = (s: string) => (idx(s) >= 0 ? c[idx(s)] : undefined);
    const ident = get("ident")?.trim() ?? "";
    const naziv = get("naziv")?.trim() ?? "";
    if (!ident) return napake.push(`Vrstica ${st}: manjka ident.`);
    if (!naziv) return napake.push(`Vrstica ${st} (${ident}): manjka naziv.`);
    if (videni.has(ident)) return napake.push(`Vrstica ${st}: ident ${ident} je v datoteki večkrat.`);
    videni.add(ident);

    const stevilo = (s: string, privzeto: number | null) => {
      const raw = get(s);
      if (raw === undefined || raw === "") return privzeto;
      const n = parseNum(raw);
      if (n === null || n < 0) {
        napake.push(`Vrstica ${st} (${ident}): "${raw}" v stolpcu ${s} ni veljavno število.`);
        return privzeto;
      }
      return n;
    };

    // Pravilo skupni = vsota oddelkov (prazna celica = ne spremeni)
    const osnova: Normativ = poIdentu.get(ident) ?? {
      id: 0,
      ident,
      naziv,
      druzina: "",
      velikost: null,
      normativ_skupni: 0,
      normativ_proizvodnja: 0,
      normativ_montaza: 0,
      normativ_elektro: 0,
      normativ_testiranje: 0,
      barvanje: false,
      cleaning: false,
      opomba: null,
      visible: true,
    };
    const uskladen = uporabiSkupnoSpremembo(osnova, {
      druzina: null,
      velikost: null,
      barvanje: null,
      cleaning: null,
      normativ_skupni: stevilo("normativ_skupni", null),
      normativ_proizvodnja: stevilo("normativ_proizvodnja", null),
      normativ_montaza: stevilo("normativ_montaza", null),
      normativ_elektro: stevilo("normativ_elektro", null),
      normativ_testiranje: stevilo("normativ_testiranje", null),
    });
    if (typeof uskladen === "string") return napake.push(`Vrstica ${st} (${ident}): ${uskladen}.`);

    vrstice.push({
      ident,
      naziv,
      druzina: get("druzina")?.trim() ?? "",
      velikost: stevilo("velikost", null),
      normativ_skupni: uskladen.normativ_skupni,
      normativ_proizvodnja: uskladen.normativ_proizvodnja,
      normativ_montaza: uskladen.normativ_montaza,
      normativ_elektro: uskladen.normativ_elektro,
      normativ_testiranje: uskladen.normativ_testiranje,
      barvanje: daNe(get("barvanje")),
      cleaning: daNe(get("cleaning")),
      opomba: null,
      visible: true,
    });
  });

  // Normativi se vedno shranijo vsi skupaj (usklajeni), ostali stolpci samo, če so v datoteki
  return {
    vrstice,
    napake,
    stolpci: CSV_STOLPCI.filter(
      (st) => glava.includes(st) || (NORMATIV_STOLPCI_CSV as readonly string[]).includes(st),
    ),
  };
}

/**
 * Uvoz: obstoječe šifre posodobi, nove doda.
 * Posodobijo se samo stolpci, ki so v CSV (ostali ostanejo nespremenjeni).
 */
export async function uvoziNormative({ vrstice, stolpci }: CsvRezultat) {
  const druzine = await zagotoviDruzine(vrstice.map((v) => v.druzina));
  const kljuci = new Set<string>([...stolpci.map((s) => (s === "druzina" ? "druzina_id" : s)), "visible"]);
  const podatki = vrstice.map((v) =>
    Object.fromEntries(Object.entries(vVrstico({ ...v, id: undefined }, druzine)).filter(([k]) => kljuci.has(k))),
  );
  for (const kos of kosi(podatki)) {
    const { error } = await getSupabase().from("spl_normativi").upsert(kos, { onConflict: "ident" });
    if (error) throw new Error(prevediNapako(error.message));
  }
}

const csvCelica = (v: string | number | boolean | null) => {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "DA" : "NE";
  if (typeof v === "number") return String(v).replace(".", ",");
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function normativiVCsv(normativi: Normativ[]): string {
  const vrstice = normativi.map((n) => CSV_STOLPCI.map((s) => csvCelica(n[s] as string | number | boolean | null)).join(";"));
  // BOM: Excel pravilno prikaže šumnike
  return "﻿" + [CSV_STOLPCI.join(";"), ...vrstice].join("\r\n");
}

export const CSV_PREDLOGA =
  "﻿" +
  [
    CSV_STOLPCI.join(";"),
    "100-116;Podstavek nevtralni OP-611/1011;RN-CU;;4,5;4,5;0;0;0;NE;NE",
    "110-10245;Peč etažna FD64H2/3-S;ODC;3;13,5;1,89;7,83;1,755;2,16;DA;NE",
  ].join("\r\n");

export function prenesiDatoteko(vsebina: string | Blob, ime: string, tip = "text/csv;charset=utf-8") {
  const blob = typeof vsebina === "string" ? new Blob([vsebina], { type: tip }) : vsebina;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ime;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
