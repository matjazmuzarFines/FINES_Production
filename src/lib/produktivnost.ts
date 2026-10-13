// Produktivnost: tedenski Gemba walk (en zapisnik na teden).
// Na gembi se zapisujejo akcije (problem -> ukrep -> odgovoren -> rok -> ocena prihranka),
// slike, skice (tabla) in povpraševanja. Datoteke so v bucketu fp-rutina-slike pod "prod/".

import { addDays, formatDayMonth, fromIso, isoWeek, mondayOf, toIso, type IsoDate } from "./dates";
import { fetchAll, getSupabase, kosi, SLIKE_BUCKET } from "./supabase";

// =====================================================================
// TIPI
// =====================================================================

export type GembaStatus = "OSNUTEK" | "ZAKLJUCEN";

/** Meritev s štoparico: zaporedni časi (krogi) v sekundah. */
export type Meritev = { id: string; naziv: string; casi: number[] };
/** Števec dogodkov (npr. hoja po orodje). */
export type Stevec = { id: string; naziv: string; stevilo: number };
/** Orodja gembe; trajanje (s) in ura začetka se shranita iz časovnika. */
export type Orodja = { meritve: Meritev[]; stevci: Stevec[]; trajanje_s?: number; zacetek_ura?: string };

export type GembaPolja = {
  datum: IsoDate | null;
  udelezenci: string;
  lokacija: string;
  tema: string;
  zapisnik: string;
  orodja: Orodja;
  kpi_ure: number | null;
  kpi_kosi: number | null;
};

export type Gemba = GembaPolja & { id: number; teden: IsoDate; status: GembaStatus };

export const AKCIJA_STATUSI = ["ODPRTO", "V_DELU", "IZVEDENO", "PREVERJENO", "OPUSCENO"] as const;
export type AkcijaStatus = (typeof AKCIJA_STATUSI)[number];

export type Akcija = {
  id: number;
  gemba_id: number;
  /** Ponedeljek tedna gembe, na kateri je bila akcija zapisana. */
  teden: IsoDate;
  problem: string;
  ukrep: string | null;
  kategorija: string | null;
  odgovoren: string | null;
  rok: IsoDate | null;
  status: AkcijaStatus;
  /** Prihranek časa na kos (min). */
  prihranek_min_kos: number | null;
  /** Prihranek materiala na kos (EUR) - lepilo, silikon, čistila ... */
  prihranek_eur_kos: number | null;
  /** Družina pečic (spl_druzine) - za letno količino. */
  druzina_id: number | null;
  /** Letna količina kosov; null = letna količina družine. */
  kolicina_leto: number | null;
  strosek_eur: number | null;
  rezultat: string | null;
  zakljuceno: IsoDate | null;
};

export type AkcijaVnos = Omit<Akcija, "id" | "gemba_id" | "teden">;

export type PrilogaTip = "SLIKA" | "SKICA" | "POVPRASEVANJE";
export const POVP_STATUSI = ["POSLANO", "PONUDBA", "NAROCENO", "ZAVRNJENO"] as const;
export type PovpStatus = (typeof POVP_STATUSI)[number];

export type Priloga = {
  id: number;
  gemba_id: number;
  tip: PrilogaTip;
  storage_path: string;
  ime: string | null;
  opis: string | null;
  status: PovpStatus | null;
  velikost: number | null;
  created_at: string;
  url?: string;
};

/** Družina pečic z letno količino (ocena) in ciljem zmanjšanja normativa. */
export type ProdDruzina = { druzina_id: number; koda: string; kolicina_leto: number | null; cilj_normativ_pct: number | null };

/** Urna postavka in družine - vse, kar je potrebno za izračun prihranka akcije. */
export type Nastavitve = { urnaPostavka: number; druzine: ProdDruzina[] };

/** Letni cilji KPI. */
export type LetniCilji = {
  leto: number;
  /** Gembe se štejejo od tega tedna (null = od začetka leta). */
  zacetni_teden: IsoDate | null;
  cilj_doslednost_pct: number;
  cilj_eur_leto: number;
  cilj_h_leto: number;
  cilj_normativ_pct: number;
  /** KPI 5: letni prihranek / investirano (1,5 = 150 EUR na 100 EUR). */
  cilj_faktor_inv: number;
};

export const PRAZNA_ORODJA: Orodja = { meritve: [], stevci: [] };

export const PRAZNA_POLJA: GembaPolja = {
  datum: null,
  udelezenci: "",
  lokacija: "",
  tema: "",
  zapisnik: "",
  orodja: PRAZNA_ORODJA,
  kpi_ure: null,
  kpi_kosi: null,
};

// =====================================================================
// GEMBA
// =====================================================================

const GEMBA_SELECT = "id, teden, datum, udelezenci, lokacija, tema, zapisnik, orodja, kpi_ure, kpi_kosi, status";

type GembaRow = Omit<Gemba, "orodja" | "udelezenci" | "lokacija" | "tema" | "zapisnik"> & {
  orodja: Partial<Orodja> | null;
  udelezenci: string | null;
  lokacija: string | null;
  tema: string | null;
  zapisnik: string | null;
};

const vStevilo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function izVrstice(r: GembaRow): Gemba {
  return {
    ...r,
    udelezenci: r.udelezenci ?? "",
    lokacija: r.lokacija ?? "",
    tema: r.tema ?? "",
    zapisnik: r.zapisnik ?? "",
    orodja: { ...r.orodja, meritve: r.orodja?.meritve ?? [], stevci: r.orodja?.stevci ?? [] },
    kpi_ure: vStevilo(r.kpi_ure),
    kpi_kosi: vStevilo(r.kpi_kosi),
  };
}

export async function naloziGembe(): Promise<Gemba[]> {
  const { data, error } = await getSupabase()
    .from("fp_prod_gemba")
    .select(GEMBA_SELECT)
    .eq("visible", true)
    .order("teden");
  if (error) throw new Error(error.message);
  return ((data ?? []) as GembaRow[]).map(izVrstice);
}

export async function naloziGembo(teden: IsoDate): Promise<Gemba | null> {
  const { data, error } = await getSupabase()
    .from("fp_prod_gemba")
    .select(GEMBA_SELECT)
    .eq("visible", true)
    .eq("teden", teden)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? izVrstice(data as GembaRow) : null;
}

function zaBazo(p: Partial<GembaPolja>) {
  const out: Record<string, unknown> = { ...p };
  for (const k of ["udelezenci", "lokacija", "tema", "zapisnik"] as const) {
    if (k in p) out[k] = (p[k] as string).trim() || null;
  }
  return out;
}

/** Shrani polja gembe; če gemba tega tedna še ne obstaja, jo ustvari. */
export async function shraniGembo(
  teden: IsoDate,
  id: number | null,
  polja: Partial<GembaPolja> & { status?: GembaStatus },
): Promise<Gemba> {
  const sb = getSupabase();
  const q = id
    ? sb.from("fp_prod_gemba").update(zaBazo(polja)).eq("id", id)
    : sb.from("fp_prod_gemba").insert({ teden, ...zaBazo(polja) });
  const { data, error } = await q.select(GEMBA_SELECT).single();
  if (error) throw new Error(error.message);
  return izVrstice(data as GembaRow);
}

// =====================================================================
// AKCIJE
// =====================================================================

export async function naloziAkcije(): Promise<Akcija[]> {
  const { data, error } = await getSupabase()
    .from("fp_prod_akcije")
    .select(
      "id, gemba_id, problem, ukrep, kategorija, odgovoren, rok, status, prihranek_min_kos, prihranek_eur_kos, druzina_id, kolicina_leto, strosek_eur, rezultat, zakljuceno, gemba:fp_prod_gemba!inner(teden, visible)",
    )
    .eq("visible", true)
    .eq("gemba.visible", true)
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const g = r.gemba as unknown as { teden: IsoDate } | { teden: IsoDate }[];
    const { gemba: _g, ...ostalo } = r;
    void _g;
    return {
      ...ostalo,
      teden: Array.isArray(g) ? g[0]?.teden : g.teden,
      prihranek_min_kos: vStevilo(r.prihranek_min_kos),
      prihranek_eur_kos: vStevilo(r.prihranek_eur_kos),
      kolicina_leto: vStevilo(r.kolicina_leto),
      strosek_eur: vStevilo(r.strosek_eur),
    } as Akcija;
  });
}

export async function shraniAkcijo(gembaId: number, id: number | null, v: AkcijaVnos) {
  const sb = getSupabase();
  const vrstica = {
    ...v,
    problem: v.problem.trim(),
    ukrep: v.ukrep?.trim() || null,
    odgovoren: v.odgovoren?.trim() || null,
    rezultat: v.rezultat?.trim() || null,
  };
  const { error } = id
    ? await sb.from("fp_prod_akcije").update(vrstica).eq("id", id)
    : await sb.from("fp_prod_akcije").insert({ gemba_id: gembaId, ...vrstica });
  if (error) throw new Error(error.message);
}

/** Podatkov ne brišemo - akcijo skrijemo. */
export async function skrijAkcijo(id: number) {
  const { error } = await getSupabase().from("fp_prod_akcije").update({ visible: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export const akcijaOdprta = (a: Akcija) => a.status === "ODPRTO" || a.status === "V_DELU";
export const akcijaIzvedena = (a: Akcija) => a.status === "IZVEDENO" || a.status === "PREVERJENO";
export const akcijaZamuja = (a: Akcija, danes: IsoDate) => akcijaOdprta(a) && !!a.rok && a.rok < danes;

// =====================================================================
// PRILOGE (bucket fp-rutina-slike, mapa prod/)
// =====================================================================

const compact = (iso: IsoDate) => iso.replaceAll("-", "");

const TIP_V_POTI: Record<PrilogaTip, string> = { SLIKA: "slika", SKICA: "skica", POVPRASEVANJE: "povp" };

/** Vrsta datoteke po končnici (Outlook .msg brskalnik pogosto pošlje brez tipa). */
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  txt: "text/plain",
};
export const POVP_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.msg,.eml,.txt,.jpg,.jpeg,.png,.webp";
export const MAX_VELIKOST = 10 * 1024 * 1024;

export const koncnica = (ime: string) => (ime.includes(".") ? ime.split(".").pop()!.toLowerCase() : "");
export const dovoljenaDatoteka = (ime: string) => koncnica(ime) in MIME;

/**
 * Pot datoteke: prod/{YYYYMMDD}/{YYYYMMDD}-gemba-{slika|skica|povp}-{čas}.{končnica}
 * (rutine imajo pr/ in skl/, zato so datoteke gembe ločene).
 */
function potPriloge(teden: IsoDate, tip: PrilogaTip, ext: string) {
  const t = compact(teden);
  const nakljucno = Math.random().toString(36).slice(2, 6);
  return `prod/${t}/${t}-gemba-${TIP_V_POTI[tip]}-${Date.now()}${nakljucno}.${ext}`;
}

async function podpisaniUrlji(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await getSupabase().storage.from(SLIKE_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export async function naloziPriloge(gembaId: number): Promise<Priloga[]> {
  const { data, error } = await getSupabase()
    .from("fp_prod_priloge")
    .select("id, gemba_id, tip, storage_path, ime, opis, status, velikost, created_at")
    .eq("visible", true)
    .eq("gemba_id", gembaId)
    .order("created_at");
  if (error) throw new Error(error.message);
  const priloge = (data ?? []) as Priloga[];
  // Podpisani URL-ji samo za slike in skice (povpraševanja se prenesejo na klik).
  const urls = await podpisaniUrlji(priloge.filter((p) => p.tip !== "POVPRASEVANJE").map((p) => p.storage_path));
  return priloge.map((p) => ({ ...p, url: urls[p.storage_path] }));
}

async function uploadDatoteke(path: string, blob: Blob, contentType: string) {
  const { error } = await getSupabase().storage.from(SLIKE_BUCKET).upload(path, blob, { contentType, upsert: true });
  if (error) throw new Error(error.message);
}

/** Datoteke se brišejo (prostor). Napaka pri brisanju ne ustavi shranjevanja. */
async function odstraniDatoteko(path: string) {
  await getSupabase().storage.from(SLIKE_BUCKET).remove([path]);
}

export async function dodajPrilogo(
  gembaId: number,
  teden: IsoDate,
  tip: PrilogaTip,
  blob: Blob,
  ime: string,
  opis: string | null = null,
) {
  const ext = tip === "SKICA" ? "png" : tip === "SLIKA" ? "jpg" : koncnica(ime);
  const contentType = MIME[ext] ?? blob.type;
  const path = potPriloge(teden, tip, ext);
  await uploadDatoteke(path, blob, contentType);
  const { error } = await getSupabase()
    .from("fp_prod_priloge")
    .insert({
      gemba_id: gembaId,
      tip,
      storage_path: path,
      ime,
      opis,
      status: tip === "POVPRASEVANJE" ? "POSLANO" : null,
      velikost: blob.size,
    });
  if (error) {
    await odstraniDatoteko(path);
    throw new Error(error.message);
  }
}

/** Zamenjaj datoteko obstoječe priloge (npr. popravljena skica); stara datoteka se izbriše. */
export async function zamenjajPrilogo(p: Priloga, teden: IsoDate, blob: Blob) {
  const path = potPriloge(teden, p.tip, koncnica(p.storage_path) || "png");
  await uploadDatoteke(path, blob, blob.type || "image/png");
  const { error } = await getSupabase()
    .from("fp_prod_priloge")
    .update({ storage_path: path, velikost: blob.size })
    .eq("id", p.id);
  if (error) {
    await odstraniDatoteko(path);
    throw new Error(error.message);
  }
  await odstraniDatoteko(p.storage_path);
}

export async function posodobiPrilogo(id: number, v: { opis?: string | null; status?: PovpStatus | null }) {
  const { error } = await getSupabase().from("fp_prod_priloge").update(v).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Slika / datoteka se izbriše iz storage, vrstica ostane skrita (zgodovina). */
export async function odstraniPrilogo(p: Priloga) {
  const { error } = await getSupabase().from("fp_prod_priloge").update({ visible: false }).eq("id", p.id);
  if (error) throw new Error(error.message);
  await odstraniDatoteko(p.storage_path);
}

/** Vsebina datoteke (npr. skica ali slika kot ozadje table). */
export async function prenesiPrilogo(p: Priloga): Promise<Blob> {
  const { data, error } = await getSupabase().storage.from(SLIKE_BUCKET).download(p.storage_path);
  if (error) throw new Error(error.message);
  return data;
}

// =====================================================================
// NASTAVITVE
// =====================================================================

const PRIVZETA_URNA_POSTAVKA = 25;

/** Urna postavka + vse družine (spl_druzine) z letno količino in ciljem normativa (fp_prod_druzine). */
export async function naloziNastavitve(): Promise<Nastavitve> {
  const sb = getSupabase();
  const [n, d, pd] = await Promise.all([
    sb.from("fp_prod_nastavitve").select("kljuc, vrednost").eq("visible", true).eq("kljuc", "URNA_POSTAVKA"),
    sb.from("spl_druzine").select("id, koda").eq("visible", true).order("koda"),
    sb.from("fp_prod_druzine").select("druzina_id, kolicina_leto, cilj_normativ_pct").eq("visible", true),
  ]);
  const napaka = n.error ?? d.error ?? pd.error;
  if (napaka) throw new Error(napaka.message);
  const poDruzini = new Map((pd.data ?? []).map((x) => [x.druzina_id as number, x]));
  return {
    urnaPostavka: n.data?.[0] ? Number(n.data[0].vrednost) : PRIVZETA_URNA_POSTAVKA,
    druzine: (d.data ?? []).map((x) => {
      const p = poDruzini.get(x.id);
      return {
        druzina_id: x.id,
        koda: x.koda,
        kolicina_leto: vStevilo(p?.kolicina_leto),
        cilj_normativ_pct: vStevilo(p?.cilj_normativ_pct),
      };
    }),
  };
}

export async function shraniUrnoPostavko(urnaPostavka: number) {
  const { error } = await getSupabase()
    .from("fp_prod_nastavitve")
    .upsert({ kljuc: "URNA_POSTAVKA", vrednost: urnaPostavka }, { onConflict: "kljuc" });
  if (error) throw new Error(error.message);
}

export async function shraniDruzine(druzine: Pick<ProdDruzina, "druzina_id" | "kolicina_leto" | "cilj_normativ_pct">[]) {
  if (!druzine.length) return;
  const { error } = await getSupabase().from("fp_prod_druzine").upsert(druzine, { onConflict: "druzina_id" });
  if (error) throw new Error(error.message);
}

// =====================================================================
// LETNI CILJI
// =====================================================================

export async function naloziCilje(): Promise<LetniCilji[]> {
  const { data, error } = await getSupabase()
    .from("fp_prod_cilji")
    .select("*")
    .eq("visible", true)
    .order("leto");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    leto: r.leto,
    zacetni_teden: r.zacetni_teden,
    cilj_doslednost_pct: Number(r.cilj_doslednost_pct),
    cilj_eur_leto: Number(r.cilj_eur_leto),
    cilj_h_leto: Number(r.cilj_h_leto),
    cilj_normativ_pct: Number(r.cilj_normativ_pct),
    // stran deluje tudi pred migracijo 013
    cilj_faktor_inv: r.cilj_faktor_inv === undefined || r.cilj_faktor_inv === null ? 1.5 : Number(r.cilj_faktor_inv),
  }));
}

export async function shraniCilje(c: LetniCilji) {
  const { error } = await getSupabase().from("fp_prod_cilji").upsert(c, { onConflict: "leto" });
  if (error) throw new Error(error.message);
}

/** Prvi teden gemb (najzgodnejši začetni teden) - tedni pred njim ne štejejo. */
export const zacetekGemb = (cilji: LetniCilji[]): IsoDate | null =>
  cilji.map((c) => c.zacetni_teden).filter((t): t is IsoDate => !!t).sort()[0] ?? null;

/** Cilji leta; če jih ni, veljajo cilji zadnjega leta pred njim (ali privzeti). */
export function ciljiLeta(cilji: LetniCilji[], leto: number): LetniCilji {
  const c = cilji.find((x) => x.leto === leto) ?? [...cilji].reverse().find((x) => x.leto < leto);
  return c
    ? { ...c, leto, zacetni_teden: c.leto === leto ? c.zacetni_teden : null }
    : { leto, zacetni_teden: null, cilj_doslednost_pct: 80, cilj_eur_leto: 0, cilj_h_leto: 0, cilj_normativ_pct: 0, cilj_faktor_inv: 1.5 };
}

// =====================================================================
// POSNETKI NORMATIVOV (KPI 4)
// =====================================================================

export type Posnetek = { id: number; datum: IsoDate; opis: string | null; created_at: string };
/** Normativ ida v posnetku ali trenutno stanje. */
export type NormStanje = { normativ_id: number; druzina_id: number | null; normativ_skupni: number };

export async function naloziPosnetke(): Promise<Posnetek[]> {
  const { data, error } = await getSupabase()
    .from("fp_prod_norm_posnetki")
    .select("id, datum, opis, created_at")
    .eq("visible", true)
    .order("datum")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as Posnetek[];
}

export async function naloziStanjePosnetka(posnetekId: number): Promise<NormStanje[]> {
  const rows = await fetchAll<NormStanje>((from, to) =>
    getSupabase()
      .from("fp_prod_norm_posnetki_postavke")
      .select("normativ_id, druzina_id, normativ_skupni")
      .eq("posnetek_id", posnetekId)
      .eq("visible", true)
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({ ...r, normativ_skupni: Number(r.normativ_skupni) }));
}

/** Trenutno stanje normativov (vidni, normativ > 0). */
export async function naloziTrenutneNormative(): Promise<(NormStanje & Omit<NormativVrstica, "normativ_skupni">)[]> {
  const rows = await fetchAll<NormativVrstica & { id: number; druzina_id: number | null }>((from, to) =>
    getSupabase()
      .from("spl_normativi")
      .select("id, ident, druzina_id, normativ_skupni, normativ_proizvodnja, normativ_montaza, normativ_elektro, normativ_testiranje")
      .eq("visible", true)
      .gt("normativ_skupni", 0)
      .order("id")
      .range(from, to),
  );
  return rows.map(({ id, ...r }) => ({ ...r, normativ_id: id, normativ_skupni: Number(r.normativ_skupni) }));
}

type NormativVrstica = {
  ident: string;
  normativ_skupni: number;
  normativ_proizvodnja: number;
  normativ_montaza: number;
  normativ_elektro: number;
  normativ_testiranje: number;
};

/** Nov posnetek trenutnega stanja normativov. */
export async function ustvariPosnetek(opis: string | null): Promise<Posnetek> {
  const sb = getSupabase();
  const stanje = await naloziTrenutneNormative();
  const { data, error } = await sb
    .from("fp_prod_norm_posnetki")
    .insert({ datum: toIso(new Date()), opis: opis?.trim() || null })
    .select("id, datum, opis, created_at")
    .single();
  if (error) throw new Error(error.message);
  for (const kos of kosi(stanje)) {
    const { error: e } = await sb.from("fp_prod_norm_posnetki_postavke").insert(kos.map((s) => ({ posnetek_id: data.id, ...s })));
    if (e) {
      // nepopoln posnetek skrijemo
      await sb.from("fp_prod_norm_posnetki").update({ visible: false }).eq("id", data.id);
      throw new Error(e.message);
    }
  }
  return data as Posnetek;
}

export type PrimerjavaDruzine = {
  druzina_id: number | null;
  /** Število identov, ki so v obeh stanjih. */
  identov: number;
  povprecjeIzhodisce: number;
  povprecjeZdaj: number;
  /** Zmanjšanje v % (pozitivno = manj ur). */
  zmanjsanjePct: number;
};

/**
 * Primerja normative ident z identom (samo identi v obeh stanjih - novi ali skriti identi ne vplivajo).
 * Zmanjšanje = (vsota izhodišča - vsota zdaj) / vsota izhodišča; družina po izhodiščnem stanju.
 */
export function primerjajNormative(izhodisce: NormStanje[], zdaj: NormStanje[]) {
  const poId = new Map(zdaj.map((z) => [z.normativ_id, z.normativ_skupni]));
  const skupine = new Map<number | null, { n: number; base: number; zdaj: number }>();
  let base = 0;
  let cur = 0;
  for (const i of izhodisce) {
    const z = poId.get(i.normativ_id);
    if (z === undefined || i.normativ_skupni <= 0) continue;
    const s = skupine.get(i.druzina_id) ?? { n: 0, base: 0, zdaj: 0 };
    s.n++;
    s.base += i.normativ_skupni;
    s.zdaj += z;
    skupine.set(i.druzina_id, s);
    base += i.normativ_skupni;
    cur += z;
  }
  const druzine: PrimerjavaDruzine[] = [...skupine].map(([druzina_id, s]) => ({
    druzina_id,
    identov: s.n,
    povprecjeIzhodisce: s.base / s.n,
    povprecjeZdaj: s.zdaj / s.n,
    zmanjsanjePct: s.base ? ((s.base - s.zdaj) / s.base) * 100 : 0,
  }));
  return { druzine, skupajPct: base ? ((base - cur) / base) * 100 : 0, identov: druzine.reduce((x, d) => x + d.identov, 0) };
}

// =====================================================================
// TEDNI
// =====================================================================

/** "12. 10. – 16. 10." (delovni teden) */
export const obdobjeTedna = (pon: IsoDate) => `${formatDayMonth(pon)} – ${formatDayMonth(addDays(pon, 4))}`;

/** Ponedeljki vseh ISO tednov leta (teden spada v leto svojega četrtka). */
export function tedniLeta(leto: number): IsoDate[] {
  let pon = mondayOf(toIso(new Date(leto, 0, 4)));
  const out: IsoDate[] = [];
  while (fromIso(addDays(pon, 3)).getFullYear() === leto) {
    out.push(pon);
    pon = addDays(pon, 7);
  }
  return out;
}

/** Mesec tedna (po četrtku) 0-11. */
export const mesecTedna = (pon: IsoDate) => fromIso(addDays(pon, 3)).getMonth();
/** Leto tedna (po četrtku). */
export const letoTedna = (pon: IsoDate) => fromIso(addDays(pon, 3)).getFullYear();

export { isoWeek };

// =====================================================================
// PRIHRANEK
// =====================================================================

/**
 * Prihranek akcije: čas (min/kos) × urna postavka + material (EUR/kos) = EUR/kos.
 * Letno: × letna količina (akcije ali družine). Brez količine je letni prihranek neznan (null).
 */
export function prihranekAkcije(
  a: Pick<Akcija, "prihranek_min_kos" | "prihranek_eur_kos" | "druzina_id" | "kolicina_leto">,
  n: Nastavitve,
) {
  const min = a.prihranek_min_kos ?? 0;
  const eurKos = (min / 60) * n.urnaPostavka + (a.prihranek_eur_kos ?? 0);
  const kolicina = a.kolicina_leto ?? n.druzine.find((d) => d.druzina_id === a.druzina_id)?.kolicina_leto ?? null;
  const imaPrihranek = min > 0 || (a.prihranek_eur_kos ?? 0) > 0;
  return {
    imaPrihranek,
    eurKos,
    kolicina,
    hLeto: kolicina !== null ? (min * kolicina) / 60 : null,
    eurLeto: kolicina !== null ? eurKos * kolicina : null,
  };
}

/** Teden, v katerem akcija prinaša prihranek (izvedba; brez datuma = teden gembe). */
const tedenIzvedbe = (a: Akcija) => mondayOf(a.zakljuceno ?? a.teden);

export type KpiPovzetek = {
  cilji: LetniCilji;
  /** Tedni gemb v letu (od začetnega tedna). */
  tedni: IsoDate[];
  /** KPI 1: kumulativni % izvedenih gemb po tednih (null = prihodnji teden). */
  doslednost: (number | null)[];
  izvedenih: number;
  doZdaj: number;
  doslednostPct: number | null;
  /** KPI 2 / 3: kumulativni letni učinek izvedenih akcij (EUR/leto, h/leto) po tednu izvedbe. */
  eur: (number | null)[];
  h: (number | null)[];
  eurLeto: number;
  hLeto: number;
  /** Potencial odprtih akcij (EUR/leto, h/leto). */
  potencialEur: number;
  potencialH: number;
  /** Izvedene akcije s prihrankom, ki nimajo letne količine (ni v EUR/leto). */
  brezKolicine: number;
  strosekEur: number;
  /** KPI 5: investirano v izvedene akcije leta in faktor (EUR/leto / investirano) po tednih. */
  investirano: number;
  faktor: number | null;
  faktorTedni: (number | null)[];
};

/** Izračun KPI 1-3 za leto. */
export function kpiLeta(leto: number, gembe: Gemba[], akcije: Akcija[], n: Nastavitve, cilji: LetniCilji[], danes: IsoDate): KpiPovzetek {
  const c = ciljiLeta(cilji, leto);
  const zacetek = zacetekGemb(cilji);
  const tedni = tedniLeta(leto).filter((t) => (!c.zacetni_teden || t >= c.zacetni_teden) && (!zacetek || t >= zacetek));
  const taTeden = mondayOf(danes);
  const zakljucene = new Set(gembe.filter((g) => g.status === "ZAKLJUCEN").map((g) => g.teden));

  // KPI 1: teden šteje, ko je pretekel (ali je gemba tega tedna že zaključena)
  let izvedenih = 0;
  let steti = 0;
  const doslednost = tedni.map((t) => {
    if (t > taTeden || (t === taTeden && !zakljucene.has(t))) return null;
    steti++;
    if (zakljucene.has(t)) izvedenih++;
    return Math.round((izvedenih / steti) * 1000) / 10;
  });

  // KPI 2, 3: letni učinek akcij, izvedenih v tem letu
  const izvedene = akcije
    .filter((a) => akcijaIzvedena(a) && letoTedna(tedenIzvedbe(a)) === leto)
    .map((a) => ({ a, t: tedenIzvedbe(a), p: prihranekAkcije(a, n) }));
  const eurLeto = izvedene.reduce((s, x) => s + (x.p.eurLeto ?? 0), 0);
  const investirano = izvedene.reduce((s, x) => s + (x.a.strosek_eur ?? 0), 0);
  const kumulativno = (f: (p: ReturnType<typeof prihranekAkcije>) => number | null) =>
    tedni.map((t) =>
      t > taTeden ? null : Math.round(izvedene.filter((x) => x.t <= t).reduce((s, x) => s + (f(x.p) ?? 0), 0) * 10) / 10,
    );
  const vsota = (sez: Akcija[], f: (p: ReturnType<typeof prihranekAkcije>) => number | null) =>
    sez.reduce((s, a) => s + (f(prihranekAkcije(a, n)) ?? 0), 0);
  const odprte = akcije.filter(akcijaOdprta);

  return {
    cilji: c,
    tedni,
    doslednost,
    izvedenih,
    doZdaj: steti,
    doslednostPct: steti ? (izvedenih / steti) * 100 : null,
    eur: kumulativno((p) => p.eurLeto),
    h: kumulativno((p) => p.hLeto),
    eurLeto,
    hLeto: izvedene.reduce((s, x) => s + (x.p.hLeto ?? 0), 0),
    potencialEur: vsota(odprte, (p) => p.eurLeto),
    potencialH: vsota(odprte, (p) => p.hLeto),
    brezKolicine: izvedene.filter((x) => x.p.imaPrihranek && x.p.kolicina === null).length,
    strosekEur: akcije.filter((a) => a.status !== "OPUSCENO").reduce((s, a) => s + (a.strosek_eur ?? 0), 0),
    investirano,
    faktor: investirano > 0 ? eurLeto / investirano : null,
    faktorTedni: tedni.map((t) => {
      if (t > taTeden) return null;
      const inv = izvedene.filter((x) => x.t <= t).reduce((s, x) => s + (x.a.strosek_eur ?? 0), 0);
      const eur = izvedene.filter((x) => x.t <= t).reduce((s, x) => s + (x.p.eurLeto ?? 0), 0);
      return inv > 0 ? Math.round((eur / inv) * 100) / 100 : null;
    }),
  };
}

const fmtH = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 1 });
const fmtEur = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtEur2 = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtHKos = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 3 });
const fmtMin = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 });

export const formatH = (n: number) => `${fmtH.format(n)} h`;
export const formatEur = (n: number) => fmtEur.format(n);
/** EUR na 2 decimalki (EUR/kos). */
export const formatEur2 = (n: number) => fmtEur2.format(n);
export const formatMinKos = (n: number) => `${fmtMin.format(n)} min/kos`;
export const formatHKos = (n: number) => `${fmtHKos.format(n)} h/kos`;

/** Človek-ure na dober kos (null, če ni podatkov). */
export const hNaKos = (g: Pick<GembaPolja, "kpi_ure" | "kpi_kosi">) =>
  g.kpi_ure && g.kpi_kosi ? g.kpi_ure / g.kpi_kosi : null;

/** Čas v sekundah -> "1:05,3" / "12,4 s" */
export function formatCas(s: number) {
  if (s < 60) return `${s.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).replace(".", ",").padStart(4, "0")}`;
}

/** Statistika meritve s štoparico (s). */
export function statistika(casi: number[]) {
  if (!casi.length) return null;
  const vsota = casi.reduce((a, b) => a + b, 0);
  return { n: casi.length, povp: vsota / casi.length, min: Math.min(...casi), max: Math.max(...casi) };
}

export function opisMeritve(m: Meritev) {
  const st = statistika(m.casi);
  if (!st) return `${m.naziv}: ni meritev`;
  return `${m.naziv}: ${st.n} meritev, povprečje ${formatCas(st.povp)} (min ${formatCas(st.min)}, max ${formatCas(st.max)}) - ${m.casi.map(formatCas).join(", ")}`;
}

/** "45 min" / "1 h 05 min" */
export function formatTrajanje(s: number) {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export const novId = () => Math.random().toString(36).slice(2, 10);
