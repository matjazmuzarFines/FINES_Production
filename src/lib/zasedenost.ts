import * as XLSX from "xlsx";
import { addDays, mondayOf, parseAnyDate, type IsoDate } from "./dates";
import { ODDELKI_NORMATIVA, type Normativ, type OddelekKoda } from "./normativi";
import { parseNum } from "./stevila";
import { fetchAll, getSupabase, kosi } from "./supabase";

// =====================================================================
// TIPI
// =====================================================================

export type Nalog = {
  st_naloga: string;
  krovni_dn: string | null;
  skupina_dn: string | null;
  koda_artikla: string;
  naziv_artikla: string | null;
  razpisana_kolicina: number;
  izdelana_kolicina: number;
  datum: IsoDate | null;
  datum_pricetka: IsoDate | null;
  rok_izdelave: IsoDate | null;
  narocnik: string | null;
  status: string | null;
  tip_naloga: string | null;
  status_naloga: string | null;
  pripadnost: string | null;
};

export type Uvoz = { id: number; datoteka: string; st_nalogov: number; created_at: string };

export type ZasOddelek = {
  id: number;
  koda: OddelekKoda;
  naziv: string;
  privzeto_zaposlenih: number;
  ure_na_dan: number;
};

export type Kapaciteta = { oddelek_id: number; teden_od: IsoDate; st_zaposlenih: number; ure_na_dan: number | null };
export type Teden = { teden_od: IsoDate; delovnih_dni: number };

/** Nalog z izračunanimi urami po oddelkih. */
export type NalogIzracun = Nalog & {
  preostala: number;
  teden: IsoDate | null; // ponedeljek tedna roka izdelave
  normativ: Normativ | null;
  ure: Record<OddelekKoda, number>;
  ureSkupaj: number;
};

export const KODE: OddelekKoda[] = ODDELKI_NORMATIVA.map((o) => o.koda);

// =====================================================================
// UVOZ XLSX
// =====================================================================

/** Stolpci izvoza delovnih nalogov (iz ERP) -> polja. Primerjava brez velikih črk in presledkov. */
const STOLPCI: Record<string, keyof Nalog> = {
  "zap.številka naloga": "st_naloga",
  "krovni dn": "krovni_dn",
  "skupina dn": "skupina_dn",
  "koda artikla": "koda_artikla",
  "naziv artikla": "naziv_artikla",
  "razpisana količina": "razpisana_kolicina",
  "izdelana količina": "izdelana_kolicina",
  datum: "datum",
  "datum pričetka": "datum_pricetka",
  "rok izdelave": "rok_izdelave",
  naročnik: "narocnik",
  status: "status",
  "tip naloga": "tip_naloga",
  "status naloga": "status_naloga",
  pripadnost: "pripadnost",
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export type UvozPregled = { nalogi: Nalog[]; opozorila: string[] };

export async function preberiNalogeXlsx(file: File): Promise<UvozPregled> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  // Glava je lahko v 1. ali 2. vrstici (izvoz ima nad glavo naslove skupin)
  const glavaIdx = rows.slice(0, 15).findIndex((r) => r.some((c) => norm(c) === "koda artikla"));
  if (glavaIdx < 0) throw new Error('V datoteki ni stolpca "Koda artikla". Ali je to izvoz delovnih nalogov?');
  const glava = rows[glavaIdx].map(norm);
  const indeksi = Object.entries(STOLPCI)
    .map(([ime, polje]) => [glava.indexOf(ime), polje] as const)
    .filter(([i]) => i >= 0);
  if (!indeksi.some(([, p]) => p === "st_naloga")) throw new Error('V datoteki ni stolpca "Zap.številka naloga".');

  const opozorila: string[] = [];
  const videni = new Set<string>();
  const nalogi: Nalog[] = [];

  for (const r of rows.slice(glavaIdx + 1)) {
    const v: Partial<Record<keyof Nalog, unknown>> = {};
    for (const [i, polje] of indeksi) v[polje] = r[i];
    const st = String(v.st_naloga ?? "").trim();
    const koda = String(v.koda_artikla ?? "").trim();
    if (!st || !koda) continue;
    if (videni.has(st)) {
      opozorila.push(`Nalog ${st} je v datoteki večkrat - uporabljen je prvi.`);
      continue;
    }
    videni.add(st);
    const txt = (x: unknown) => (x === null || x === undefined || String(x).trim() === "" ? null : String(x).trim());
    const rok = parseAnyDate(v.rok_izdelave);
    if (!rok) opozorila.push(`Nalog ${st}: manjka ali ni veljaven rok izdelave.`);
    nalogi.push({
      st_naloga: st,
      krovni_dn: txt(v.krovni_dn),
      skupina_dn: txt(v.skupina_dn),
      koda_artikla: koda,
      naziv_artikla: txt(v.naziv_artikla),
      razpisana_kolicina: parseNum(v.razpisana_kolicina) ?? 0,
      izdelana_kolicina: parseNum(v.izdelana_kolicina) ?? 0,
      datum: parseAnyDate(v.datum),
      datum_pricetka: parseAnyDate(v.datum_pricetka),
      rok_izdelave: rok,
      narocnik: txt(v.narocnik),
      status: txt(v.status),
      tip_naloga: txt(v.tip_naloga),
      status_naloga: txt(v.status_naloga),
      pripadnost: txt(v.pripadnost),
    });
  }
  if (nalogi.length === 0) throw new Error("V datoteki ni najdenih nalogov.");
  return { nalogi, opozorila };
}

/** Shrani nov uvoz. Ko so vsi nalogi vpisani, ga aktivira (prejšnji postanejo neaktivni). */
export async function shraniUvoz(datoteka: string, nalogi: Nalog[]) {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb
    .from("fp_zas_uvozi")
    .insert({ datoteka, st_nalogov: nalogi.length })
    .select("id")
    .single();
  if (error) throw error;

  for (const kos of kosi(nalogi)) {
    const { error: e } = await sb.from("fp_zas_nalogi").insert(kos.map((n) => ({ ...n, uvoz_id: uvoz.id })));
    if (e) throw new Error(`Nalogi niso bili v celoti shranjeni (uvoz ni aktiviran): ${e.message}`);
  }
  const { error: e2 } = await sb.from("fp_zas_uvozi").update({ aktiven: true }).eq("id", uvoz.id);
  if (e2) throw e2;
}

// =====================================================================
// BRANJE
// =====================================================================

export async function naloziZadnjiUvoz(): Promise<{ uvoz: Uvoz | null; nalogi: Nalog[] }> {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb
    .from("fp_zas_uvozi")
    .select("id, datoteka, st_nalogov, created_at")
    .eq("aktiven", true)
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!uvoz) return { uvoz: null, nalogi: [] };

  const nalogi = await fetchAll<Nalog>((from, to) =>
    sb
      .from("fp_zas_nalogi")
      .select(
        "st_naloga, krovni_dn, skupina_dn, koda_artikla, naziv_artikla, razpisana_kolicina, izdelana_kolicina, datum, datum_pricetka, rok_izdelave, narocnik, status, tip_naloga, status_naloga, pripadnost",
      )
      .eq("uvoz_id", uvoz.id)
      .eq("visible", true)
      .order("rok_izdelave")
      .order("st_naloga")
      .range(from, to),
  );
  return {
    uvoz,
    nalogi: nalogi.map((n) => ({
      ...n,
      razpisana_kolicina: Number(n.razpisana_kolicina),
      izdelana_kolicina: Number(n.izdelana_kolicina),
    })),
  };
}

export async function naloziZasOddelke(): Promise<ZasOddelek[]> {
  const { data, error } = await getSupabase()
    .from("fp_oddelki")
    .select("id, koda, naziv, privzeto_zaposlenih, ure_na_dan")
    .eq("visible", true)
    .not("koda", "is", null)
    .order("vrstni_red");
  if (error) throw error;
  return (data ?? [])
    .filter((o) => KODE.includes(o.koda))
    .map((o) => ({ ...o, privzeto_zaposlenih: Number(o.privzeto_zaposlenih), ure_na_dan: Number(o.ure_na_dan) }));
}

export async function naloziKapacitete(od: IsoDate, doo: IsoDate): Promise<{ kapacitete: Kapaciteta[]; tedni: Teden[] }> {
  const sb = getSupabase();
  const [k, t] = await Promise.all([
    sb
      .from("fp_zas_kapacitete")
      .select("oddelek_id, teden_od, st_zaposlenih, ure_na_dan")
      .eq("visible", true)
      .gte("teden_od", od)
      .lte("teden_od", doo),
    sb.from("fp_zas_tedni").select("teden_od, delovnih_dni").eq("visible", true).gte("teden_od", od).lte("teden_od", doo),
  ]);
  if (k.error) throw k.error;
  if (t.error) throw t.error;
  return {
    kapacitete: (k.data ?? []).map((r) => ({
      ...r,
      st_zaposlenih: Number(r.st_zaposlenih),
      ure_na_dan: r.ure_na_dan === null ? null : Number(r.ure_na_dan),
    })),
    tedni: (t.data ?? []).map((r) => ({ ...r, delovnih_dni: Number(r.delovnih_dni) })),
  };
}

export async function shraniKapacitete(kapacitete: Kapaciteta[], tedni: Teden[]) {
  const sb = getSupabase();
  if (kapacitete.length) {
    const { error } = await sb.from("fp_zas_kapacitete").upsert(kapacitete, { onConflict: "oddelek_id,teden_od" });
    if (error) throw error;
  }
  if (tedni.length) {
    const { error } = await sb.from("fp_zas_tedni").upsert(tedni, { onConflict: "teden_od" });
    if (error) throw error;
  }
}

/** Spremeni privzeto število zaposlenih / ur na dan oddelka (velja za tedne brez posebnega vnosa). */
export async function shraniPrivzeteOddelka(id: number, privzeto_zaposlenih: number, ure_na_dan: number) {
  const { error } = await getSupabase().from("fp_oddelki").update({ privzeto_zaposlenih, ure_na_dan }).eq("id", id);
  if (error) throw error;
}

// =====================================================================
// IZRAČUN
// =====================================================================

export function izracunajNaloge(nalogi: Nalog[], normativi: Normativ[]): NalogIzracun[] {
  const poIdentu = new Map(normativi.filter((n) => n.visible).map((n) => [n.ident, n]));
  return nalogi.map((n) => {
    const normativ = poIdentu.get(n.koda_artikla) ?? null;
    const preostala = Math.max(0, n.razpisana_kolicina - n.izdelana_kolicina);
    const ure = Object.fromEntries(
      ODDELKI_NORMATIVA.map((o) => [o.koda, normativ ? preostala * normativ[o.polje] : 0]),
    ) as Record<OddelekKoda, number>;
    return {
      ...n,
      preostala,
      teden: n.rok_izdelave ? mondayOf(n.rok_izdelave) : null,
      normativ,
      ure,
      ureSkupaj: KODE.reduce((s, k) => s + ure[k], 0),
    };
  });
}

/** Seznam ponedeljkov od `od` (vključno), `stevilo` tednov. */
export function tedniOd(od: IsoDate, stevilo: number): IsoDate[] {
  return Array.from({ length: stevilo }, (_, i) => addDays(mondayOf(od), i * 7));
}

export function razpolozljivo(
  oddelek: ZasOddelek,
  teden: IsoDate,
  kapacitete: Kapaciteta[],
  tedni: Teden[],
): { zaposlenih: number; ureNaDan: number; dni: number; ure: number } {
  const k = kapacitete.find((x) => x.oddelek_id === oddelek.id && x.teden_od === teden);
  const zaposlenih = k?.st_zaposlenih ?? oddelek.privzeto_zaposlenih;
  const ureNaDan = k?.ure_na_dan ?? oddelek.ure_na_dan;
  const dni = tedni.find((t) => t.teden_od === teden)?.delovnih_dni ?? 5;
  return { zaposlenih, ureNaDan, dni, ure: zaposlenih * ureNaDan * dni };
}

// =====================================================================
// IZVOZ
// =====================================================================

export function izvoziNalogeXlsx(nalogi: NalogIzracun[], ime: string) {
  const vrstice = nalogi.map((n) => ({
    "Zap. številka naloga": n.st_naloga,
    "Krovni DN": n.krovni_dn ?? "",
    "Skupina DN": n.skupina_dn ?? "",
    "Koda artikla": n.koda_artikla,
    "Naziv artikla": n.naziv_artikla ?? "",
    "Rok izdelave": n.rok_izdelave ? new Date(`${n.rok_izdelave}T00:00:00`) : "",
    "Razpisana količina": n.razpisana_kolicina,
    "Izdelana količina": n.izdelana_kolicina,
    "Preostala količina": n.preostala,
    Normativ: n.normativ ? n.normativ.normativ_skupni : "Ni normativa",
    "Ure P": round2(n.ure.P),
    "Ure M": round2(n.ure.M),
    "Ure E": round2(n.ure.E),
    "Ure T": round2(n.ure.T),
    "Ure skupaj": round2(n.ureSkupaj),
    Naročnik: n.narocnik ?? "",
    "Status naloga": n.status_naloga ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(vrstice, { cellDates: true, dateNF: "d. m. yyyy" });
  ws["!cols"] = [10, 10, 18, 16, 45, 12, 10, 10, 10, 10, 8, 8, 8, 8, 10, 30, 20].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Nalogi");
  XLSX.writeFile(wb, ime);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
