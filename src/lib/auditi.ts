// Management -> Auditi: splošni gemba walki vodstva po oddelkih podjetja.
// Audit = zapisnik obhoda (datum, oddelek, tema, izvajalec ...) z ugotovitvami / akcijami
// (vrsta, ugotovitev -> ukrep -> odgovoren -> prioriteta / rok, ocena), slikami, skicami (tabla)
// in povpraševanji. Datoteke so v bucketu fp-rutina-slike pod "aud/".

import * as XLSX from "xlsx";
import { addDays, type IsoDate } from "./dates";
import { nazivOddelka, nazivTeme, type AuditNastavitve, type Sifranti } from "./auditSifranti";
import { virPrilog } from "./priloge";
import { PRAZNA_ORODJA, akcijaOdprta, akcijaZamuja, type AkcijaStatus, type GembaStatus, type Orodja } from "./produktivnost";
import { getSupabase } from "./supabase";

// =====================================================================
// VRSTE, PRIORITETE, LESTVICE
// =====================================================================

export const VRSTE = ["NEVARNO", "NESKLADNOST", "OPAZANJE", "PREDLOG", "DOBRA_PRAKSA"] as const;
export type Vrsta = (typeof VRSTE)[number];

/** Barve vrst (preverjena kategorična paleta - glej dataviz; vrstni red = vrstni red v grafih). */
export const VRSTA: Record<Vrsta, { label: string; kratko: string; barva: string; hint: string; prioriteta: Prioriteta | null }> = {
  NEVARNO: { label: "Nevarno - takoj", kratko: "Nevarno", barva: "#9f1239", hint: "Nevarnost za ljudi ali opremo - ukrep takoj", prioriteta: "A" },
  NESKLADNOST: { label: "Neskladnost", kratko: "Neskladnost", barva: "#e36f1e", hint: "Odstopanje od standarda, navodila ali dogovora", prioriteta: "B" },
  OPAZANJE: { label: "Opažanje", kratko: "Opažanje", barva: "#0b7bb8", hint: "Ni še napaka, a lahko postane", prioriteta: "C" },
  PREDLOG: { label: "Predlog izboljšave", kratko: "Predlog", barva: "#8b5cf6", hint: "Priložnost, da delo naredimo bolje", prioriteta: "C" },
  DOBRA_PRAKSA: { label: "Dobra praksa", kratko: "Dobra praksa", barva: "#16a34a", hint: "Pohvala - dobro narejeno, prenesi drugam", prioriteta: null },
};

export const PRIORITETE = ["A", "B", "C"] as const;
export type Prioriteta = (typeof PRIORITETE)[number];

export const opisPrioritete = (p: Prioriteta, n: AuditNastavitve) =>
  p === "A" ? `A - nujno (${n.rokA} dan)` : p === "B" ? `B - kmalu (${n.rokB} dni)` : `C - ko bo mogoče (${n.rokC} dni)`;

/** Rok iz prioritete: datum + dnevi iz nastavitev. */
export const rokPrioritete = (p: Prioriteta, od: IsoDate, n: AuditNastavitve) => addDays(od, p === "A" ? n.rokA : p === "B" ? n.rokB : n.rokC);

/** Velikost napake / škode (1-5). */
export const RESNOST = [
  { value: 1, opis: "Zanemarljivo - kozmetično" },
  { value: 2, opis: "Majhno - do ~100 €" },
  { value: 3, opis: "Srednje - do ~1.000 €" },
  { value: 4, opis: "Veliko - zastoj, reklamacija, do ~10.000 €" },
  { value: 5, opis: "Kritično - nevarnost, večja reklamacija, > 10.000 €" },
];

/** Pomembnost za vodstvo (1-5). */
export const POMEMBNOST = [
  { value: 1, opis: "Ko bo čas" },
  { value: 2, opis: "Nizka" },
  { value: 3, opis: "Srednja" },
  { value: 4, opis: "Visoka" },
  { value: 5, opis: "Najvišja - osebno spremljam" },
];

// =====================================================================
// TIPI
// =====================================================================

export type AuditPolja = {
  datum: IsoDate | null;
  oddelek: string;
  /** Koda teme oddelka; "" = vse teme. */
  tema: string;
  izvajalec: string;
  udelezenci: string;
  lokacija: string;
  zapisnik: string;
  /** Časovnik in števci (meritve s štoparico se pri auditih ne uporabljajo). */
  orodja: Orodja;
};

export type Audit = Omit<AuditPolja, "datum"> & {
  id: number;
  datum: IsoDate;
  status: GembaStatus;
};

export type AuditAkcija = {
  id: number;
  audit_id: number;
  /** Datum in oddelek audita, na katerem je bila akcija zapisana. */
  datum: IsoDate;
  oddelek: string;
  vrsta: Vrsta;
  problem: string;
  ukrep: string | null;
  /** Koda teme oddelka. */
  kategorija: string | null;
  odgovoren: string | null;
  prioriteta: Prioriteta | null;
  rok: IsoDate | null;
  status: AkcijaStatus;
  /** Popravljeno takoj med auditom. */
  reseno_na_mestu: boolean;
  /** Velikost napake / škode 1-5. */
  resnost: number | null;
  /** Pomembnost za vodstvo 1-5. */
  pomembnost: number | null;
  /** Ocena prihranka (EUR / leto). */
  prihranek_eur: number | null;
  /** Cena ukrepa (enkratno, EUR). */
  strosek_eur: number | null;
  rezultat: string | null;
  zakljuceno: IsoDate | null;
  created_at: string;
  updated_at: string;
};

export type AuditAkcijaVnos = Omit<AuditAkcija, "id" | "audit_id" | "datum" | "oddelek" | "created_at" | "updated_at">;

export const PRAZNA_POLJA_AUDITA: AuditPolja = {
  datum: null,
  oddelek: "",
  tema: "",
  izvajalec: "",
  udelezenci: "",
  lokacija: "",
  zapisnik: "",
  orodja: PRAZNA_ORODJA,
};

const BREZ_MIGRACIJE = "Manjkajo tabele auditov - v Supabase zaženi migracijo 015_management_auditi.sql.";
const BREZ_MIGRACIJE_016 = "Manjkajo novi stolpci akcij - v Supabase zaženi migracijo 016_auditi_nastavitve_ocena.sql.";
const niTabele = (e: { code?: string; message: string }) => e.code === "42P01" || e.code === "PGRST205" || /fp_aud_/.test(e.message);
const niStolpca = (e: { code?: string }) => e.code === "42703" || e.code === "PGRST204";
const napaka = (e: { code?: string; message: string }) =>
  new Error(niStolpca(e) ? BREZ_MIGRACIJE_016 : niTabele(e) ? BREZ_MIGRACIJE : e.message);

const vStevilo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// =====================================================================
// AUDITI
// =====================================================================

const AUDIT_SELECT = "id, datum, oddelek, tema, izvajalec, udelezenci, lokacija, zapisnik, orodja, status";

type AuditRow = Omit<Audit, "orodja" | "tema" | "izvajalec" | "udelezenci" | "lokacija" | "zapisnik"> & {
  orodja: Partial<Orodja> | null;
  tema: string | null;
  izvajalec: string | null;
  udelezenci: string | null;
  lokacija: string | null;
  zapisnik: string | null;
};

function izVrstice(r: AuditRow): Audit {
  return {
    ...r,
    tema: r.tema ?? "",
    izvajalec: r.izvajalec ?? "",
    udelezenci: r.udelezenci ?? "",
    lokacija: r.lokacija ?? "",
    zapisnik: r.zapisnik ?? "",
    orodja: { ...r.orodja, meritve: r.orodja?.meritve ?? [], stevci: r.orodja?.stevci ?? [] },
  };
}

export async function naloziAudite(): Promise<Audit[]> {
  const { data, error } = await getSupabase()
    .from("fp_aud_audit")
    .select(AUDIT_SELECT)
    .eq("visible", true)
    .order("datum", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw napaka(error);
  return ((data ?? []) as AuditRow[]).map(izVrstice);
}

function zaBazo(p: Partial<AuditPolja>) {
  const out: Record<string, unknown> = { ...p };
  for (const k of ["tema", "izvajalec", "udelezenci", "lokacija", "zapisnik"] as const) {
    if (k in p) out[k] = (p[k] as string).trim() || null;
  }
  return out;
}

/** Manjkajoči podatki, brez katerih audita ni mogoče shraniti (null = v redu). */
export const manjkaZaShranjevanje = (p: Pick<AuditPolja, "datum" | "oddelek">) =>
  !p.datum ? "Najprej vpiši datum audita." : !p.oddelek ? "Najprej izberi oddelek." : null;

/** Shrani audit; brez id ga ustvari (datum in oddelek sta obvezna). */
export async function shraniAudit(id: number | null, polja: Partial<AuditPolja> & { status?: GembaStatus }): Promise<Audit> {
  const sb = getSupabase();
  const q = id ? sb.from("fp_aud_audit").update(zaBazo(polja)).eq("id", id) : sb.from("fp_aud_audit").insert(zaBazo(polja));
  const { data, error } = await q.select(AUDIT_SELECT).single();
  if (error) throw napaka(error);
  return izVrstice(data as AuditRow);
}

/** Podatkov ne brišemo - audit skrijemo (z njim tudi njegove akcije na seznamih). */
export async function skrijAudit(id: number) {
  const { error } = await getSupabase().from("fp_aud_audit").update({ visible: false }).eq("id", id);
  if (error) throw napaka(error);
}

// =====================================================================
// AKCIJE
// =====================================================================

const AKCIJA_OSNOVA = "id, audit_id, problem, ukrep, kategorija, odgovoren, rok, status, rezultat, zakljuceno, created_at, updated_at";
const AKCIJA_NOVO = "vrsta, prioriteta, reseno_na_mestu, resnost, pomembnost, prihranek_eur, strosek_eur";
const AKCIJA_AUDIT = "audit:fp_aud_audit!inner(datum, oddelek, visible)";

export async function naloziAkcijeAuditov(): Promise<AuditAkcija[]> {
  const beri = (stolpci: string) =>
    getSupabase().from("fp_aud_akcije").select(stolpci).eq("visible", true).eq("audit.visible", true).order("id");
  let { data, error } = await beri(`${AKCIJA_OSNOVA}, ${AKCIJA_NOVO}, ${AKCIJA_AUDIT}`);
  // pred migracijo 016 (brez novih stolpcev) beremo osnovo
  if (error && niStolpca(error)) ({ data, error } = await beri(`${AKCIJA_OSNOVA}, ${AKCIJA_AUDIT}`));
  if (error) throw napaka(error);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const a = r.audit as { datum: IsoDate; oddelek: string } | { datum: IsoDate; oddelek: string }[];
    const audit = Array.isArray(a) ? a[0] : a;
    const { audit: _a, ...ostalo } = r;
    void _a;
    return {
      ...ostalo,
      datum: audit?.datum,
      oddelek: audit?.oddelek,
      vrsta: (r.vrsta as Vrsta | undefined) ?? "NESKLADNOST",
      prioriteta: (r.prioriteta as Prioriteta | undefined) ?? null,
      reseno_na_mestu: !!r.reseno_na_mestu,
      resnost: vStevilo(r.resnost),
      pomembnost: vStevilo(r.pomembnost),
      prihranek_eur: vStevilo(r.prihranek_eur),
      strosek_eur: vStevilo(r.strosek_eur),
    } as AuditAkcija;
  });
}

/** Shrani akcijo in vrne njen id. */
export async function shraniAkcijoAudita(auditId: number, id: number | null, v: Partial<AuditAkcijaVnos>): Promise<number> {
  const sb = getSupabase();
  const vrstica: Record<string, unknown> = { ...v };
  if (v.problem !== undefined) vrstica.problem = v.problem.trim();
  for (const k of ["ukrep", "odgovoren", "rezultat"] as const) if (k in v) vrstica[k] = v[k]?.trim() || null;
  const { data, error } = id
    ? await sb.from("fp_aud_akcije").update(vrstica).eq("id", id).select("id").single()
    : await sb.from("fp_aud_akcije").insert({ audit_id: auditId, ...vrstica }).select("id").single();
  if (error) throw napaka(error);
  return (data as { id: number }).id;
}

/** Podatkov ne brišemo - akcijo skrijemo. */
export async function skrijAkcijoAudita(id: number) {
  const { error } = await getSupabase().from("fp_aud_akcije").update({ visible: false }).eq("id", id);
  if (error) throw napaka(error);
}

/** Dobra praksa ni akcija (ni odprta, ne šteje v KPI akcij). */
export const jeAkcija = (a: Pick<AuditAkcija, "vrsta">) => a.vrsta !== "DOBRA_PRAKSA";
export const odprta = (a: AuditAkcija) => jeAkcija(a) && akcijaOdprta(a);
export const zamuja = (a: AuditAkcija, danes: IsoDate) => jeAkcija(a) && akcijaZamuja(a, danes);

/** Pomen akcije = velikost napake × pomembnost (1-25); null, če ni ocenjeno. */
export const pomenAkcije = (a: Pick<AuditAkcija, "resnost" | "pomembnost">) =>
  a.resnost || a.pomembnost ? (a.resnost ?? 3) * (a.pomembnost ?? 3) : null;

/** Povračilo naložbe v mesecih (cena / letni prihranek × 12). */
export const povraciloMes = (a: Pick<AuditAkcija, "prihranek_eur" | "strosek_eur">) =>
  a.prihranek_eur && a.prihranek_eur > 0 && a.strosek_eur ? (a.strosek_eur / a.prihranek_eur) * 12 : null;

/** Pri zaprtju akcije (izvedeno / preverjeno) mora biti dokaz: slika PO ali opis rezultata. */
export const manjkaDokaz = (v: { status: AkcijaStatus; rezultat: string; ukrep: string; reseno_na_mestu: boolean; vrsta: Vrsta }, slikPo: number) =>
  (v.status === "IZVEDENO" || v.status === "PREVERJENO") &&
  v.vrsta !== "DOBRA_PRAKSA" &&
  slikPo === 0 &&
  !v.rezultat.trim() &&
  !(v.reseno_na_mestu && v.ukrep.trim())
    ? "Za zaprtje dodaj sliko PO ali opiši rezultat (kaj je bilo narejeno)."
    : null;

/** Doda vrstico "dd. mm.: komentar" k rezultatu akcije (zgodovina preverjanj). */
export function dodajKRezultatu(rezultat: string | null, komentar: string, datum: IsoDate) {
  const k = komentar.trim();
  if (!k) return rezultat;
  const [, m, d] = datum.split("-");
  const vrstica = `${Number(d)}. ${Number(m)}.: ${k}`;
  return rezultat?.trim() ? `${rezultat.trim()}\n${vrstica}` : vrstica;
}

// =====================================================================
// PRILOGE (bucket fp-rutina-slike, mapa aud/) - tudi slike akcij pred / po
// =====================================================================

/** Pot datoteke: aud/{YYYYMMDD}/{YYYYMMDD}-audit-{slika|skica|povp}-{čas}.{končnica} (dan audita). */
export const PRILOGE_AUDITA = virPrilog({
  tabela: "fp_aud_priloge",
  stolpec: "audit_id",
  mapa: "aud",
  oznaka: "audit",
  dodatniStolpci: "akcija_id, faza",
});

/** Mapa datotek audita (YYYYMMDD dneva audita). */
export const kljucPrilogAudita = (datum: IsoDate) => datum.replaceAll("-", "");

// =====================================================================
// IZVOZ
// =====================================================================

/** Povzetek akcij audita: vse, odprte, zamujene (brez dobrih praks). */
export type AkcijeAudita = { vse: number; odprte: number; zamuja: number; dobre: number };

const xDatum = (iso: IsoDate | null) => (iso ? new Date(`${iso}T00:00:00`) : "");

function zapisiXlsx(list: string, vrstice: Record<string, unknown>[], sirine: number[], ime: string) {
  const ws = XLSX.utils.json_to_sheet(vrstice, { cellDates: true, dateNF: "d. m. yyyy" });
  ws["!cols"] = sirine.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, list);
  XLSX.writeFile(wb, ime);
}

/** Excel: prikazani auditi (isti filtri in razvrščanje kot na zaslonu). */
export function izvoziAuditeXlsx(s: Sifranti, auditi: Audit[], akcije: (a: Audit) => AkcijeAudita, ime: string) {
  zapisiXlsx(
    "Auditi",
    auditi.map((a) => {
      const k = akcije(a);
      return {
        Datum: xDatum(a.datum),
        Oddelek: nazivOddelka(s, a.oddelek),
        Tema: nazivTeme(s, a.oddelek, a.tema),
        Področje: a.lokacija,
        Izvajalec: a.izvajalec,
        Udeleženci: a.udelezenci,
        Akcije: k.vse,
        Odprte: k.odprte,
        Zamuja: k.zamuja,
        "Dobre prakse": k.dobre,
        Status: a.status === "ZAKLJUCEN" ? "Zaključen" : "V delu",
      };
    }),
    [12, 14, 30, 26, 20, 30, 8, 8, 8, 12, 11],
    ime,
  );
}

const STATUS_TXT: Record<AkcijaStatus, string> = { ODPRTO: "Odprto", V_DELU: "V delu", IZVEDENO: "Izvedeno", PREVERJENO: "Preverjeno", OPUSCENO: "Opuščeno" };

/** Excel: prikazane akcije (isti filtri kot na zaslonu). */
export function izvoziAkcijeXlsx(s: Sifranti, akcije: AuditAkcija[], danes: IsoDate, ime: string) {
  zapisiXlsx(
    "Akcije",
    akcije.map((a) => ({
      Audit: xDatum(a.datum),
      Oddelek: nazivOddelka(s, a.oddelek),
      Vrsta: VRSTA[a.vrsta].label,
      Ugotovitev: a.problem,
      Ukrep: a.ukrep ?? "",
      Tema: nazivTeme(s, a.oddelek, a.kategorija),
      Odgovoren: a.odgovoren ?? "",
      Prioriteta: a.prioriteta ?? "",
      Rok: xDatum(a.rok),
      Status: zamuja(a, danes) ? "Zamuja" : a.vrsta === "DOBRA_PRAKSA" ? "Dobra praksa" : STATUS_TXT[a.status],
      "Rešeno na mestu": a.reseno_na_mestu ? "DA" : "",
      "Velikost napake": a.resnost ?? "",
      Pomembnost: a.pomembnost ?? "",
      Pomen: pomenAkcije(a) ?? "",
      "Prihranek €/leto": a.prihranek_eur ?? "",
      "Cena €": a.strosek_eur ?? "",
      Izvedeno: xDatum(a.zakljuceno),
      Rezultat: a.rezultat ?? "",
    })),
    [12, 14, 16, 40, 40, 24, 18, 10, 12, 12, 10, 10, 10, 8, 12, 10, 12, 40],
    ime,
  );
}
