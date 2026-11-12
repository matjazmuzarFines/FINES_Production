// Zaloga vijačnega materiala (Podatki proizvodnje): nadomesti Power App + Microsoft List.
// Zaloga in lokacija se spreminjata samo s funkcijo v bazi (fp_vijacni_spremeni), ki zapiše tudi dnevnik.
import { fetchAll, getSupabase } from "./supabase";

export type VijacniMaterial = {
  id: number;
  sifra: string | null;
  naziv: string;
  em: string;
  zaloga: number;
  lokacija: string | null;
  spremenjeno: string | null;
  spremenil: string | null;
};

/** Prejem = prištej, odpis = odštej, popis = nastavi točno stanje (preštet). */
export type NacinZaloge = "prejem" | "odpis" | "popis";
export type Nacin = NacinZaloge | "lokacija";

export type VijacniLog = {
  id: number;
  material_id: number;
  nacin: Nacin;
  polje: "zaloga" | "lokacija";
  stara: string | null;
  nova: string | null;
  sprememba: number | null;
  uporabnik: string;
  created_at: string;
  material: { sifra: string | null; naziv: string; em: string } | null;
};

export type Postavka =
  | { id: number; nacin: NacinZaloge; kolicina: number; pricakovana: number }
  | { id: number; nacin: "lokacija"; lokacija: string };

export const OPIS_NACINA: Record<Nacin, string> = {
  prejem: "Prejem",
  odpis: "Odpis",
  popis: "Popis",
  lokacija: "Lokacija",
};

const STOLPCI = "id, sifra, naziv, em, zaloga, lokacija, spremenjeno, spremenil";

/** Klasifikati identov, ki so na seznamu vijačnega materiala (seznam in filter sta v bazi: fp_vijacni_seznam). */
export const KLASIFIKATI_VIJACNI = ["028", "060", "064"] as const;

/**
 * Seznam = vsi aktivni identi s klasifikatom 028 / 060 / 064 (nov ident se pojavi sam, z zalogo 0), naziv in EM iz
 * identov, zaloga in lokacija iz fp_vijacni_material. Brez skripte 037 v bazi: stari fiksni seznam.
 */
export async function naloziMaterial(): Promise<VijacniMaterial[]> {
  const sb = getSupabase();
  try {
    // funkcija ob vsakem klicu doda manjkajoče šifre - zato en klic (sto vrstic), ne po straneh
    const { data, error } = await sb.rpc("fp_vijacni_seznam").select(STOLPCI).range(0, 9999);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as VijacniMaterial[];
  } catch (e) {
    if (!/fp_vijacni_seznam/.test((e as Error).message)) throw e;
    return fetchAll<VijacniMaterial>((od, do_) =>
      sb.from("fp_vijacni_material").select(STOLPCI).eq("visible", true).order("naziv").order("id").range(od, do_),
    );
  }
}

/** Zadnjih `koliko` sprememb (najnovejše prve). */
export async function naloziLog(koliko = 500): Promise<VijacniLog[]> {
  const { data, error } = await getSupabase()
    .from("fp_vijacni_material_log")
    .select("id, material_id, nacin, polje, stara, nova, sprememba, uporabnik, created_at, material:fp_vijacni_material(sifra, naziv, em)")
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .limit(koliko);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as VijacniLog[];
}

/** Shrani spremembe (vse ali nič) in vrne posodobljene zapise. */
export async function spremeni(postavke: Postavka[]): Promise<VijacniMaterial[]> {
  const { data, error } = await getSupabase().rpc("fp_vijacni_spremeni", { p_postavke: postavke });
  if (error) throw new Error(error.message);
  return (data ?? []) as VijacniMaterial[];
}

/** Nova zaloga po vnosu (null, če vnos ni veljaven). */
export function novaZaloga(nacin: NacinZaloge, zaloga: number, kolicina: number | null): number | null {
  if (kolicina === null || !Number.isInteger(kolicina) || kolicina < 0) return null;
  if (nacin === "prejem") return zaloga + kolicina;
  if (nacin === "odpis") return zaloga - kolicina;
  return kolicina;
}

/** Celo število iz vnosa (dovoli presledke in pike tisočic: "2 650", "2.650"). */
export function parseKolicina(v: string): number | null {
  const s = v.replace(/[\s.]/g, "");
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}
