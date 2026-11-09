// Matrika usposobljenosti (Proizvodnja → Management) in izobraževanja.
// Obe matriki imata isto strukturo: vrstice so zaposleni, stolpci so v fp_usp_stolpci (delovna mesta ali družine).
// Vsaka ocena je zapis izpitne pole; trenutna stopnja je zadnji zapis z oceno. Pisanje samo s funkcijami v bazi.
import { formatShort, isoWeek, toIso, type IsoDate } from "./dates";
import { fetchAll, getSupabase } from "./supabase";

export type Matrika = "PROIZVODNJA" | "MONTAZA";

export const MATRIKE: Record<Matrika, { label: string; oddelek: number; stolpci: string }> = {
  PROIZVODNJA: { label: "Proizvodnja", oddelek: 2, stolpci: "delovnih mestih" },
  MONTAZA: { label: "Montaža", oddelek: 3, stolpci: "družinah izdelkov" },
};
export const SEZNAM_MATRIK: Matrika[] = ["PROIZVODNJA", "MONTAZA"];

export const STOPNJE = [
  { value: 1, naziv: "Nesamostojen", opis: "Dela izrecno po navodilih" },
  { value: 2, naziv: "Začetnik", opis: "Dela pod stalnim nadzorom" },
  { value: 3, naziv: "Delno samostojen", opis: "Osnovno delo sam, pri zahtevnem pomoč" },
  { value: 4, naziv: "Samostojen", opis: "Dela samostojno in brez nadzora" },
  { value: 5, naziv: "Mentor", opis: "Lahko uči druge" },
];
export const opisStopnje = (s: number) => {
  const x = STOPNJE.find((t) => t.value === s);
  return x ? `${x.naziv} - ${x.opis.toLowerCase()}` : "";
};

export type Zaposleni = { id: number; ime: string; priimek: string; id_oddelek: number | null; visible: boolean };
export type Stolpec = { id: number; matrika: Matrika; naziv: string; vrstni_red: number; visible: boolean };
export type Termin = { id: number; zaposleni_id: number | null; stolpec_id: number; datum_od: IsoDate; datum_do: IsoDate; opomba: string | null; visible: boolean };
export type Ocena = {
  id: number;
  zaposleni_id: number;
  stolpec_id: number;
  termin_id: number | null;
  cas: string;
  ocenjevalec: string;
  opravil: boolean;
  prejsnja_ocena: number | null;
  ocena: number | null;
  razlogi: string | null;
  komentar: string | null;
};

export type Podatki = { ime: string; zaposleni: Zaposleni[]; stolpci: Stolpec[]; termini: Termin[]; ocene: Ocena[] };

/** Skripti 034 / 035 še nista zagnani. */
export class NiBaze extends Error {}
const MANJKA = ["PGRST202", "42883", "PGRST205", "42P01", "42703"];

export async function naloziPodatke(): Promise<Podatki> {
  const sb = getSupabase();
  // Najprej funkcija: uskladi stolpce z delovnimi mesti in družinami
  const { data, error } = await sb.rpc("fp_usp_nalozi");
  if (error) throw MANJKA.includes(error.code) ? new NiBaze(error.message) : new Error(error.message);
  const osnova = data as { ime: string; zaposleni: Zaposleni[] };
  const [stolpci, termini, ocene] = await Promise.all([
    fetchAll<Stolpec>((od, do_) => sb.from("fp_usp_stolpci").select("id, matrika, naziv, vrstni_red, visible").order("vrstni_red").order("id").range(od, do_)),
    fetchAll<Termin>((od, do_) => sb.from("fp_usp_termini").select("id, zaposleni_id, stolpec_id, datum_od, datum_do, opomba, visible").order("datum_od").order("id").range(od, do_)),
    fetchAll<Ocena>((od, do_) =>
      sb
        .from("fp_usp_ocene")
        .select("id, zaposleni_id, stolpec_id, termin_id, cas, ocenjevalec, opravil, prejsnja_ocena, ocena, razlogi, komentar")
        .eq("visible", true)
        .order("cas")
        .order("id")
        .range(od, do_),
    ),
  ]).catch((e: Error) => {
    if (e.message.includes("zaposleni_id")) throw new NiBaze(e.message);
    throw e;
  });
  return { ime: osnova.ime, zaposleni: osnova.zaposleni, stolpci, termini, ocene };
}

export type NovaOcena = {
  zaposleni: number;
  stolpec: number;
  termin: number | null;
  cas: string;
  ocenjevalec: string;
  opravil: boolean;
  ocena: number | null;
  razlogi: string;
  komentar: string;
};

export async function shraniOceno(o: NovaOcena) {
  const { error } = await getSupabase().rpc("fp_usp_ocena_shrani", {
    p_zaposleni: o.zaposleni,
    p_stolpec: o.stolpec,
    p_termin: o.termin,
    p_cas: o.cas,
    p_ocenjevalec: o.ocenjevalec,
    p_opravil: o.opravil,
    p_ocena: o.ocena,
    p_razlogi: o.razlogi,
    p_komentar: o.komentar,
  });
  if (error) throw new Error(error.message);
}

/** Izbris ocene (zapis se skrije); poznejšim izpitom iste celice baza preračuna prejšnjo stopnjo. */
export async function izbrisiOceno(id: number) {
  const { error } = await getSupabase().rpc("fp_usp_ocena_skrij", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function shraniTermin(id: number | null, zaposleni: number[], stolpci: number[], od: IsoDate, do_: IsoDate, opomba: string) {
  const { error } = await getSupabase().rpc("fp_usp_termin_shrani", { p_id: id, p_zaposleni: zaposleni, p_stolpci: stolpci, p_od: od, p_do: do_, p_opomba: opomba });
  if (error) throw new Error(error.message);
}

export async function skrijTermin(id: number) {
  const { error } = await getSupabase().rpc("fp_usp_termin_skrij", { p_id: id });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Izračuni

export const imeZaposlenega = (z: Zaposleni) => `${z.ime} ${z.priimek}`;
export const stolpciMatrike = (p: Podatki, m: Matrika) => p.stolpci.filter((s) => s.matrika === m && s.visible);
export const zaposleniMatrike = (p: Podatki, m: Matrika) => p.zaposleni.filter((z) => z.visible && z.id_oddelek === MATRIKE[m].oddelek);

const kljuc = (zaposleni: number, stolpec: number) => `${zaposleni}:${stolpec}`;

/** Trenutna stopnja vsake celice - zadnja ocena po času (ocene so naložene naraščajoče). */
export function trenutneOcene(ocene: Ocena[]) {
  const m = new Map<string, Ocena>();
  for (const o of ocene) if (o.ocena !== null) m.set(kljuc(o.zaposleni_id, o.stolpec_id), o);
  return {
    za: (zaposleni: number, stolpec: number) => m.get(kljuc(zaposleni, stolpec)) ?? null,
  };
}

/** Prvi termin osebe za temo, ki še ni končan (termini so naloženi po datumu). */
export function naslednjiTermin(zaposleni: number, stolpec: number, termini: Termin[], danes: IsoDate): Termin | null {
  return termini.find((t) => t.visible && t.zaposleni_id === zaposleni && t.stolpec_id === stolpec && t.datum_do >= danes) ?? null;
}

/** Termin osebe za temo, v katerega pade datum. */
export const terminNaDan = (zaposleni: number, stolpec: number, termini: Termin[], dan: IsoDate) =>
  termini.find((t) => t.visible && t.zaposleni_id === zaposleni && t.stolpec_id === stolpec && t.datum_od <= dan && t.datum_do >= dan) ?? null;

/** "T48-T51" (en teden: "T48"). */
export function oznakaTermina(t: Pick<Termin, "datum_od" | "datum_do">) {
  const od = isoWeek(t.datum_od);
  const do_ = isoWeek(t.datum_do);
  return od === do_ ? `T${od}` : `T${od}-T${do_}`;
}
export const obdobjeTermina = (t: Pick<Termin, "datum_od" | "datum_do">) => `${formatShort(t.datum_od)} - ${formatShort(t.datum_do)}`;

export type StanjeTermina = "PRIHAJA" | "V_TEKU" | "ZAMUJA" | "ZAKLJUCEN";

/** cls = celica koledarja (barve kot v koledarju tednov Produktivnosti), znacka = statusna značka. */
export const STANJE_TERMINA: Record<StanjeTermina, { label: string; cls: string; znacka: string; legenda: string }> = {
  ZAMUJA: { label: "Zamuja", cls: "bg-nok-50 text-nok-600 border-nok-500", znacka: "bg-nok-500 text-white", legenda: "Termin je mimo, ocene ni" },
  V_TEKU: { label: "V teku", cls: "bg-warn-50 text-warn-700 border-warn-400", znacka: "bg-warn-400 text-ink-900", legenda: "Ocenjevanje poteka" },
  PRIHAJA: { label: "Prihaja", cls: "bg-fines-50 text-fines-700 border-fines-500", znacka: "bg-fines-500 text-white", legenda: "Ocenjevanje prihaja" },
  ZAKLJUCEN: { label: "Zaključen", cls: "bg-ok-500 text-white border-ok-500", znacka: "bg-ok-500 text-white", legenda: "Vsi so ocenjeni" },
};
/** Vrstni red pomembnosti: teden v koledarju dobi barvo najpomembnejšega termina. */
export const VRSTNI_RED_STANJ: StanjeTermina[] = ["ZAMUJA", "V_TEKU", "PRIHAJA", "ZAKLJUCEN"];

export function stanjeTermina(p: Podatki, t: Termin, danes: IsoDate): StanjeTermina {
  if (p.ocene.some((o) => o.termin_id === t.id)) return "ZAKLJUCEN";
  if (danes > t.datum_do) return "ZAMUJA";
  return danes >= t.datum_od ? "V_TEKU" : "PRIHAJA";
}

const fmtCas = new Intl.DateTimeFormat("sl-SI", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const formatCas = (cas: string) => fmtCas.format(new Date(cas));
/** Lokalni čas za polje datetime-local. */
export function casZaVnos(d = new Date()) {
  return `${toIso(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Excel

/** Excel izbrane matrike: stopnje kot števila, termini osebe in prazen stolpec za zapiske. */
export async function izvoziMatrikoXlsx(matrika: Matrika, stolpci: Stolpec[], vrstice: { ime: string; ocene: (number | null)[]; termini: string[] }[], ime: string) {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = [
    ["Zaposleni", ...stolpci.map((s) => s.naziv), "Naslednje ocenjevanje", "Zapiski"],
    ...vrstice.map((v) => [
      v.ime,
      ...v.ocene.map((o) => o ?? ""),
      stolpci.flatMap((s, i) => (v.termini[i] ? [`${s.naziv} ${v.termini[i]}`] : [])).join("; "),
      "",
    ]),
    [],
    ["Legenda"],
    ...STOPNJE.map((s) => [`${s.value} - ${s.naziv}: ${s.opis}`]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 26 }, ...stolpci.map(() => ({ wch: 14 })), { wch: 30 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, MATRIKE[matrika].label);
  XLSX.writeFile(wb, ime);
}

export type VrsticaZgodovine = {
  o: Ocena;
  zaposleni: string;
  stolpec: string;
  matrika: string;
  termin: string;
};

/** Excel zgodovine (isti filtri in razvrščanje kot na zaslonu). */
export async function izvoziZgodovinoXlsx(vrstice: VrsticaZgodovine[], ime: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(
    vrstice.map((v) => ({
      Čas: formatCas(v.o.cas),
      Zaposleni: v.zaposleni,
      Matrika: v.matrika,
      "Delovno mesto / družina": v.stolpec,
      Termin: v.termin,
      "Prejšnja stopnja": v.o.prejsnja_ocena ?? "",
      Stopnja: v.o.ocena ?? "",
      Rezultat: v.o.opravil ? "Opravil" : "Ni opravil",
      Ocenjevalec: v.o.ocenjevalec,
      Razlogi: v.o.razlogi ?? "",
      Komentar: v.o.komentar ?? "",
    })),
  );
  ws["!cols"] = [18, 24, 13, 22, 12, 9, 9, 11, 22, 40, 40].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Zgodovina");
  XLSX.writeFile(wb, ime);
}
