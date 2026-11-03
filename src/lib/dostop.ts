// Dostop uporabnikov po straneh (Podatki → Nastavitve). Vse = vidi vse strani, sicer samo strani v `strani`.
// Meni, domača stran in AppShell skrijejo strani brez dostopa; zapis v bazo varujejo funkcije v bazi.
import { createContext, useContext } from "react";
import { NAV, filtrirajNav, listiNav, type NavGroup, type NavItem, type NavSekcija } from "./nav";
import { getSupabase } from "./supabase";

export type Uporabnik = {
  user_id: string;
  email: string;
  vse: boolean;
  strani: string[];
  zadnji_obisk: string | null;
};

export const NASTAVITVE_HREF = "/podatki/nastavitve";

export class Dostop {
  constructor(
    readonly vse: boolean,
    readonly strani: string[],
  ) {}

  /** Domača stran (null) je vedno dovoljena. */
  ima(href: string | null): boolean {
    return href === null || this.vse || this.strani.includes(href);
  }

  get nav(): NavGroup[] {
    return this.vse ? NAV : filtrirajNav((h) => this.ima(h));
  }

  /** Dovoljene strani v vrstnem redu menija. */
  get dovoljene(): NavItem[] {
    return this.nav.flatMap((g) => g.sekcije.flatMap((s) => listiNav(s.items)));
  }
}

export const POLN_DOSTOP = new Dostop(true, []);
export const DostopContext = createContext<Dostop>(POLN_DOSTOP);
export const useDostop = () => useContext(DostopContext);

/** Dostop prijavljenega (ob tem zabeleži obisk). Brez tabele v bazi (skripta 033 še ni zagnana) = poln dostop. */
export async function naloziMojDostop(): Promise<Dostop> {
  const { data, error } = await getSupabase().rpc("fp_moj_dostop");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return POLN_DOSTOP;
    throw new Error(error.message);
  }
  const u = data as Uporabnik;
  return new Dostop(u.vse, u.strani ?? []);
}

export async function naloziUporabnike(): Promise<Uporabnik[]> {
  const { data, error } = await getSupabase()
    .from("fp_uporabniki")
    .select("user_id, email, vse, strani, zadnji_obisk")
    .eq("visible", true)
    .order("email");
  if (error) throw new Error(error.message);
  return (data ?? []) as Uporabnik[];
}

export async function nastaviDostop(u: Pick<Uporabnik, "user_id" | "vse" | "strani">): Promise<Uporabnik> {
  const { data, error } = await getSupabase().rpc("fp_nastavi_dostop", { p_user: u.user_id, p_vse: u.vse, p_strani: u.strani });
  if (error) throw new Error(error.message);
  return data as Uporabnik;
}

/** Vse strani iz menija (stolpci tabele dostopa), z modulom in razdelkom. */
export function vseStrani(): { group: NavGroup; sekcija: NavSekcija; item: NavItem }[] {
  return NAV.flatMap((group) => group.sekcije.flatMap((sekcija) => listiNav(sekcija.items).map((item) => ({ group, sekcija, item }))));
}
