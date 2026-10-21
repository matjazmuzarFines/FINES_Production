// Material (splošna tabela spl_material) - celoten izpis materiala iz ERP.
// Vir zaloge za vse projekte: zaloga, planirana količina DN, rezervacija kot material na DN, naročeno.
import * as XLSX from "xlsx";
import { parseNum } from "./stevila";
import { fetchAll, getSupabase, kosi } from "./supabase";

// =====================================================================
// TIPI
// =====================================================================

/** Zapis materiala. Številka v komentarju je oznaka stolpca v izvozu ERP. */
export type Material = {
  ident: string;
  naziv: string | null;
  em: string | null;
  status_identa: string | null;
  dobavitelj: string | null;
  naziv_dobavitelja: string | null;
  pripadnost: string | null;
  zaloga: number; // (3) matično skladišče
  zaloga_ostalo: number; // (4)
  potreba_dn: number; // (12)
  razpolozljiva: number; // (14 = 3-12)
  narocena_kolicina: number; // (5) naročeno pri dobaviteljih
  naroceno: number; // (6) potrjena naročila kupcev
  predvideno: number;
  definirano: number;
  rezervirano: number;
  planirano_proizvodnja: number; // (7) razpisano kot material na delovne naloge
  planirano_dn: number; // (8) prihod iz delovnih nalogov
  prosta_zaloga: number; // (9 = 3+5-6-7+8)
  prosta_brez_narocil: number; // (15 = 3-6-7+8)
  min_zaloga: number; // (1)
  max_zaloga: number; // (2)
  potrebe_min: number; // (10 = 9-1)
  razlika_max: number; // (11 = 10-(2-1))
};

type Kolicina = Exclude<
  keyof Material,
  "ident" | "naziv" | "em" | "status_identa" | "dobavitelj" | "naziv_dobavitelja" | "pripadnost"
>;

export type MaterialUvoz = { id: number; datoteka: string; st_postavk: number; created_at: string };
export type MaterialUvozPregled = { material: Material[]; opozorila: string[] };

// =====================================================================
// UVOZ XLSX
// =====================================================================

/**
 * Stolpci izvoza -> polja. Glava ima obliko "ZALOGA (MATIČNO)\r\n(3)*" - oznaka ERP v oklepaju
 * in zvezdica se odrežeta (glej normGlava).
 */
const STOLPCI: Record<string, keyof Material> = {
  ident: "ident",
  naziv: "naziv",
  em: "em",
  "status identa": "status_identa",
  dobavitelj: "dobavitelj",
  "naziv dobavitelja": "naziv_dobavitelja",
  pripadnost: "pripadnost",
  "zaloga (matično)": "zaloga",
  "zaloga (ostalo)": "zaloga_ostalo",
  "potreba po delovih nalogih": "potreba_dn",
  "razpoložljiva zaloga": "razpolozljiva",
  "naročena količina": "narocena_kolicina",
  naročeno: "naroceno",
  predvideno: "predvideno",
  definirano: "definirano",
  rezervirano: "rezervirano",
  "planirana količina (proizvodnja)": "planirano_proizvodnja",
  "planirana količina (del.nalogi)": "planirano_dn",
  "prosta zaloga": "prosta_zaloga",
  "prosta zaloga (brez naročil)": "prosta_brez_narocil",
  "minimalna zaloga": "min_zaloga",
  "maksimalna zaloga": "max_zaloga",
  "količina potreb (do min.zaloga)": "potrebe_min",
  "razlika potreb (do max.zaloga)": "razlika_max",
};

const OBVEZNI = [
  "ident",
  "zaloga (matično)",
  "naročeno",
  "planirana količina (proizvodnja)",
  "planirana količina (del.nalogi)",
  "prosta zaloga",
];

/** "ZALOGA (MATIČNO)_x000D_\n(3)*" -> "zaloga (matično)", "PREDVIDENO (*)" -> "predvideno". */
function normGlava(c: unknown): string {
  return String(c ?? "")
    .toLowerCase()
    .replace(/_x000d_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\d+(\)|=).*$/, "") // oznaka ERP: (3)*, (14=3-12), (11=10-(2-1))
    .replace(/\s*\(\*\)\s*$/, "")
    .replace(/\*/g, "")
    .trim();
}

const txt = (x: unknown) => (x === null || x === undefined || String(x).trim() === "" ? null : String(x).trim());

export async function preberiMaterialXlsx(file: File): Promise<MaterialUvozPregled> {
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  const glavaIdx = rows.slice(0, 15).findIndex((r) => r.some((c) => normGlava(c) === "ident") && r.some((c) => normGlava(c) === "zaloga (matično)"));
  if (glavaIdx < 0) throw new Error('V datoteki ni stolpcev "Ident" in "Zaloga (matično)". Ali je to izpis materiala?');
  const glava = rows[glavaIdx].map(normGlava);
  for (const obvezen of OBVEZNI) {
    if (!glava.includes(obvezen)) throw new Error(`V datoteki manjka stolpec "${obvezen}". Ali je to izpis materiala?`);
  }
  const indeksi = Object.entries(STOLPCI)
    .map(([ime, polje]) => [glava.indexOf(ime), polje] as const)
    .filter(([i]) => i >= 0);

  const opozorila: string[] = [];
  const poIdentu = new Map<string, Material>();
  let neskladni = 0;
  for (const r of rows.slice(glavaIdx + 1)) {
    const v: Partial<Record<keyof Material, unknown>> = {};
    for (const [i, polje] of indeksi) v[polje] = r[i];
    const ident = txt(v.ident);
    if (!ident) continue;
    const st = (k: Kolicina) => parseNum(v[k]) ?? 0;
    const m: Material = {
      ident,
      naziv: txt(v.naziv),
      em: txt(v.em),
      status_identa: txt(v.status_identa),
      dobavitelj: txt(v.dobavitelj),
      naziv_dobavitelja: txt(v.naziv_dobavitelja),
      pripadnost: txt(v.pripadnost),
      zaloga: st("zaloga"),
      zaloga_ostalo: st("zaloga_ostalo"),
      potreba_dn: st("potreba_dn"),
      razpolozljiva: st("razpolozljiva"),
      narocena_kolicina: st("narocena_kolicina"),
      naroceno: st("naroceno"),
      predvideno: st("predvideno"),
      definirano: st("definirano"),
      rezervirano: st("rezervirano"),
      planirano_proizvodnja: st("planirano_proizvodnja"),
      planirano_dn: st("planirano_dn"),
      prosta_zaloga: st("prosta_zaloga"),
      prosta_brez_narocil: st("prosta_brez_narocil"),
      min_zaloga: st("min_zaloga"),
      max_zaloga: st("max_zaloga"),
      potrebe_min: st("potrebe_min"),
      razlika_max: st("razlika_max"),
    };
    if (poIdentu.has(ident)) {
      opozorila.push(`Ident ${ident} je v izpisu večkrat - upoštevana je prva vrstica.`);
      continue;
    }
    // Kontrola formule ERP: prosta (9) = 3 + 5 - 6 - 7 + 8
    const prosta = m.zaloga + m.narocena_kolicina - m.naroceno - m.planirano_proizvodnja + m.planirano_dn;
    if (Math.abs(prosta - m.prosta_zaloga) > 0.001) neskladni++;
    poIdentu.set(ident, m);
  }
  if (poIdentu.size === 0) throw new Error("V datoteki ni najdenih artiklov.");
  if (neskladni)
    opozorila.unshift(`${neskladni} artiklov ima prosto zalogo, ki se ne ujema s formulo ERP (3 + 5 - 6 - 7 + 8).`);
  return { material: [...poIdentu.values()], opozorila };
}

/** Posodobi spl_material (po identu) in aktivira uvoz, ko so vsi zapisi vpisani. */
export async function shraniMaterialUvoz(datoteka: string, material: Material[]) {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb
    .from("spl_material_uvozi")
    .insert({ datoteka, st_postavk: material.length })
    .select("id")
    .single();
  if (error) throw error;

  for (const kos of kosi(material)) {
    const { error: e } = await sb
      .from("spl_material")
      .upsert(
        kos.map((m) => ({ ...m, uvoz_id: uvoz.id, visible: true })),
        { onConflict: "ident" },
      );
    if (e) throw new Error(`Material ni bil v celoti shranjen (uvoz ni aktiviran - ponovi uvoz): ${e.message}`);
  }
  const { error: e2 } = await sb.from("spl_material_uvozi").update({ aktiven: true }).eq("id", uvoz.id);
  if (e2) throw e2;
}

// =====================================================================
// BRANJE
// =====================================================================

const POLJA =
  "ident, naziv, em, status_identa, dobavitelj, naziv_dobavitelja, pripadnost, zaloga, zaloga_ostalo, potreba_dn, razpolozljiva, narocena_kolicina, naroceno, predvideno, definirano, rezervirano, planirano_proizvodnja, planirano_dn, prosta_zaloga, prosta_brez_narocil, min_zaloga, max_zaloga, potrebe_min, razlika_max";

/** Material zadnjega aktivnega uvoza, po identu. */
export async function naloziMaterial(): Promise<{ uvoz: MaterialUvoz | null; material: Map<string, Material> }> {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb
    .from("spl_material_uvozi")
    .select("id, datoteka, st_postavk, created_at")
    .eq("aktiven", true)
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!uvoz) return { uvoz: null, material: new Map() };

  const vrstice = await fetchAll<Material>((from, to) =>
    sb.from("spl_material").select(POLJA).eq("uvoz_id", uvoz.id).eq("visible", true).order("id").range(from, to),
  );
  const kolicine: Kolicina[] = [
    "zaloga",
    "zaloga_ostalo",
    "potreba_dn",
    "razpolozljiva",
    "narocena_kolicina",
    "naroceno",
    "predvideno",
    "definirano",
    "rezervirano",
    "planirano_proizvodnja",
    "planirano_dn",
    "prosta_zaloga",
    "prosta_brez_narocil",
    "min_zaloga",
    "max_zaloga",
    "potrebe_min",
    "razlika_max",
  ];
  return {
    uvoz,
    material: new Map(
      vrstice.map((m) => [m.ident, { ...m, ...Object.fromEntries(kolicine.map((k) => [k, Number(m[k] ?? 0)])) } as Material]),
    ),
  };
}
