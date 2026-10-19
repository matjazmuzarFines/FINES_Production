// Šifranti auditov, ki se urejajo v aplikaciji (Auditi -> Nastavitve):
// oddelki z vodji, teme oddelka, vprašanja (Opazuj, Vprašaj zaposlene), tipični ukrepi,
// splošna vprašanja in nastavitve (cilji, roki prioritet). Dokler migracija 016 ni zagnana,
// se uporabi privzeta vsebina iz auditVodic.ts (samo za branje).

import { PRIVZETI_ODDELKI, SPLOSNA_VPRASANJA } from "./auditVodic";
import { getSupabase } from "./supabase";

export type SkupinaPostavke = "OPAZUJ" | "VPRASAJ" | "UKREP" | "SPLOSNO";
/** Vprašanje ali tipični ukrep; id = null pri privzeti vsebini (brez baze). */
export type Postavka = { id: number | null; besedilo: string; vrstni_red: number };

export type Tema = {
  id: number | null;
  oddelek: string;
  koda: string;
  naziv: string;
  opis: string;
  vrstni_red: number;
  aktivna: boolean;
  opazuj: Postavka[];
  vprasaj: Postavka[];
  ukrepi: Postavka[];
};

export type Oddelek = {
  id: number | null;
  koda: string;
  naziv: string;
  barva: string;
  opis: string;
  /** Primer področja (placeholder polja Področje). */
  podrocje: string;
  vodja: string;
  vodja_email: string;
  vrstni_red: number;
  /** Neaktiven oddelek se ne ponuja za nove audite; stari auditi ga še prikazujejo. */
  aktiven: boolean;
  teme: Tema[];
};

export type AuditNastavitve = {
  ciljAuditovTeden: number;
  dniBrezAudita: number;
  rokA: number;
  rokB: number;
  rokC: number;
  ciljPravocasnoPct: number;
};

export type Sifranti = {
  oddelki: Oddelek[];
  splosna: Postavka[];
  nastavitve: AuditNastavitve;
  /** false = migracija 016 še ni zagnana (privzeta vsebina, urejanje ni mogoče). */
  izBaze: boolean;
};

export const PRIVZETE_NASTAVITVE: AuditNastavitve = {
  ciljAuditovTeden: 3,
  dniBrezAudita: 14,
  rokA: 1,
  rokB: 7,
  rokC: 30,
  ciljPravocasnoPct: 90,
};

const KLJUCI: Record<keyof AuditNastavitve, string> = {
  ciljAuditovTeden: "CILJ_AUDITOV_TEDEN",
  dniBrezAudita: "DNI_BREZ_AUDITA",
  rokA: "ROK_A_DNI",
  rokB: "ROK_B_DNI",
  rokC: "ROK_C_DNI",
  ciljPravocasnoPct: "CILJ_PRAVOCASNO_PCT",
};

export const BREZ_MIGRACIJE_016 = "Manjkajo tabele nastavitev auditov - v Supabase zaženi migracijo 016_auditi_nastavitve_ocena.sql.";
const niTabele = (e: { code?: string; message: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /fp_aud_(oddelki|teme|nastavitve)|vrstni_red/.test(e.message);
const napaka = (e: { code?: string; message: string }) => new Error(niTabele(e) ? BREZ_MIGRACIJE_016 : e.message);

const postavke = (sez: string[]): Postavka[] => sez.map((besedilo, i) => ({ id: null, besedilo, vrstni_red: (i + 1) * 10 }));

/** Privzeta vsebina (dokler migracija 016 ni zagnana). */
export function privzetiSifranti(): Sifranti {
  return {
    izBaze: false,
    nastavitve: PRIVZETE_NASTAVITVE,
    splosna: postavke(SPLOSNA_VPRASANJA),
    oddelki: PRIVZETI_ODDELKI.map((o, i) => ({
      id: null,
      koda: o.koda,
      naziv: o.naziv,
      barva: o.barva,
      opis: o.opis,
      podrocje: o.podrocje,
      vodja: "",
      vodja_email: "",
      vrstni_red: (i + 1) * 10,
      aktiven: true,
      teme: o.teme.map((t, j) => ({
        id: null,
        oddelek: o.koda,
        koda: t.koda,
        naziv: t.naziv,
        opis: t.opis,
        vrstni_red: (j + 1) * 10,
        aktivna: true,
        opazuj: postavke(t.opazuj),
        vprasaj: postavke(t.vprasaj),
        ukrepi: postavke(t.ukrepi),
      })),
    })),
  };
}

const poRedu = <T extends { vrstni_red: number; id: number | null }>(a: T, b: T) => a.vrstni_red - b.vrstni_red || (a.id ?? 0) - (b.id ?? 0);

type OddelekRow = { id: number; koda: string; naziv: string; barva: string; opis: string | null; podrocje: string | null; vodja: string | null; vodja_email: string | null; vrstni_red: number; visible: boolean };
type TemaRow = { id: number; oddelek: string; koda: string; naziv: string; opis: string | null; vrstni_red: number; visible: boolean };
type PostavkaRow = { id: number; oddelek: string; tema: string; skupina: SkupinaPostavke; besedilo: string; vrstni_red: number };

export async function naloziSifrante(): Promise<Sifranti> {
  const sb = getSupabase();
  const [o, t, v, n] = await Promise.all([
    sb.from("fp_aud_oddelki").select("id, koda, naziv, barva, opis, podrocje, vodja, vodja_email, vrstni_red, visible"),
    sb.from("fp_aud_teme").select("id, oddelek, koda, naziv, opis, vrstni_red, visible"),
    sb.from("fp_aud_vprasanja").select("id, oddelek, tema, skupina, besedilo, vrstni_red").eq("visible", true),
    sb.from("fp_aud_nastavitve").select("kljuc, vrednost").eq("visible", true),
  ]);
  const e = o.error ?? t.error ?? v.error ?? n.error;
  if (e) {
    if (niTabele(e)) return privzetiSifranti();
    throw new Error(e.message);
  }
  const vprasanja = (v.data ?? []) as PostavkaRow[];
  const izberi = (oddelek: string, tema: string, skupina: SkupinaPostavke): Postavka[] =>
    vprasanja
      .filter((x) => x.oddelek === oddelek && x.tema === tema && x.skupina === skupina)
      .map((x) => ({ id: x.id, besedilo: x.besedilo, vrstni_red: x.vrstni_red }))
      .sort(poRedu);
  const teme = (t.data ?? []) as TemaRow[];
  const vrednosti = new Map((n.data ?? []).map((x) => [x.kljuc as string, Number(x.vrednost)]));
  const nastavitve = Object.fromEntries(
    (Object.keys(KLJUCI) as (keyof AuditNastavitve)[]).map((k) => [k, vrednosti.get(KLJUCI[k]) ?? PRIVZETE_NASTAVITVE[k]]),
  ) as AuditNastavitve;

  return {
    izBaze: true,
    nastavitve,
    splosna: izberi("", "", "SPLOSNO"),
    oddelki: ((o.data ?? []) as OddelekRow[])
      .map((r) => ({
        id: r.id,
        koda: r.koda,
        naziv: r.naziv,
        barva: r.barva,
        opis: r.opis ?? "",
        podrocje: r.podrocje ?? "",
        vodja: r.vodja ?? "",
        vodja_email: r.vodja_email ?? "",
        vrstni_red: r.vrstni_red,
        aktiven: r.visible,
        teme: teme
          .filter((x) => x.oddelek === r.koda)
          .map((x) => ({
            id: x.id,
            oddelek: x.oddelek,
            koda: x.koda,
            naziv: x.naziv,
            opis: x.opis ?? "",
            vrstni_red: x.vrstni_red,
            aktivna: x.visible,
            opazuj: izberi(r.koda, x.koda, "OPAZUJ"),
            vprasaj: izberi(r.koda, x.koda, "VPRASAJ"),
            ukrepi: izberi(r.koda, x.koda, "UKREP"),
          }))
          .sort(poRedu),
      }))
      .sort(poRedu),
  };
}

// =====================================================================
// POMOŽNO
// =====================================================================

export const aktivniOddelki = (s: Sifranti) => s.oddelki.filter((o) => o.aktiven);
export const oddelekPoKodi = (s: Sifranti, koda: string | null | undefined) => s.oddelki.find((o) => o.koda === koda);
export const temaPoKodi = (s: Sifranti, oddelek: string | null | undefined, tema: string | null | undefined) =>
  oddelekPoKodi(s, oddelek)?.teme.find((t) => t.koda === tema);
export const nazivOddelka = (s: Sifranti, koda: string | null | undefined) => oddelekPoKodi(s, koda)?.naziv ?? koda ?? "";
export const nazivTeme = (s: Sifranti, oddelek: string | null | undefined, tema: string | null | undefined) =>
  temaPoKodi(s, oddelek, tema)?.naziv ?? "";

/** Koda iz naziva: "Vzdrževanje strojev" -> VZDRZEVANJE_STROJEV (enolična med obstoječimi). */
export function novaKoda(naziv: string, obstojece: string[]) {
  const osnova =
    naziv
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 30) || "NOVO";
  let koda = osnova;
  for (let i = 2; obstojece.includes(koda); i++) koda = `${osnova}_${i}`;
  return koda;
}

/** Vrstni red za novo postavko na koncu seznama. */
export const novRed = (sez: { vrstni_red: number }[]) => Math.max(0, ...sez.map((x) => x.vrstni_red)) + 10;

// =====================================================================
// SHRANJEVANJE (podatkov ne brišemo - visible = false)
// =====================================================================

export type OddelekVnos = Pick<Oddelek, "naziv" | "barva" | "opis" | "podrocje" | "vodja" | "vodja_email" | "vrstni_red" | "aktiven">;

export async function shraniOddelek(o: Oddelek | null, v: OddelekVnos & { koda?: string }) {
  const sb = getSupabase();
  const vrstica = {
    naziv: v.naziv.trim(),
    barva: v.barva,
    opis: v.opis.trim() || null,
    podrocje: v.podrocje.trim() || null,
    vodja: v.vodja.trim() || null,
    vodja_email: v.vodja_email.trim() || null,
    vrstni_red: v.vrstni_red,
    visible: v.aktiven,
  };
  const { error } = o?.id ? await sb.from("fp_aud_oddelki").update(vrstica).eq("id", o.id) : await sb.from("fp_aud_oddelki").insert({ ...vrstica, koda: v.koda });
  if (error) throw napaka(error);
}

export type TemaVnos = Pick<Tema, "naziv" | "opis" | "vrstni_red" | "aktivna">;

export async function shraniTemo(t: Tema | null, v: TemaVnos & { oddelek: string; koda?: string }) {
  const sb = getSupabase();
  const vrstica = { naziv: v.naziv.trim(), opis: v.opis.trim() || null, vrstni_red: v.vrstni_red, visible: v.aktivna };
  const { error } = t?.id
    ? await sb.from("fp_aud_teme").update(vrstica).eq("id", t.id)
    : await sb.from("fp_aud_teme").insert({ ...vrstica, oddelek: v.oddelek, koda: v.koda });
  if (error) throw napaka(error);
}

export async function dodajPostavko(v: { oddelek: string; tema: string; skupina: SkupinaPostavke; besedilo: string; vrstni_red: number }): Promise<Postavka> {
  const { data, error } = await getSupabase()
    .from("fp_aud_vprasanja")
    .insert({ ...v, besedilo: v.besedilo.trim() })
    .select("id, besedilo, vrstni_red")
    .single();
  if (error) throw napaka(error);
  return data as Postavka;
}

/** Popravi besedilo / vrstni red ali odstrani (visible = false). */
export async function posodobiPostavko(id: number, v: { besedilo?: string; vrstni_red?: number; visible?: boolean }) {
  const { error } = await getSupabase()
    .from("fp_aud_vprasanja")
    .update(v.besedilo !== undefined ? { ...v, besedilo: v.besedilo.trim() } : v)
    .eq("id", id);
  if (error) throw napaka(error);
}

export async function shraniNastavitve(n: AuditNastavitve) {
  const vrstice = (Object.keys(KLJUCI) as (keyof AuditNastavitve)[]).map((k) => ({ kljuc: KLJUCI[k], vrednost: n[k] }));
  const { error } = await getSupabase().from("fp_aud_nastavitve").upsert(vrstice, { onConflict: "kljuc" });
  if (error) throw napaka(error);
}
