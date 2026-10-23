import type { IsoDate } from "./dates";
import type { OddelekKoda } from "./normativi";
import type { PostavkaIzracun } from "./prioritete";
import type { NalogIzracun } from "./zasedenost";

// =====================================================================
// KONTROLA DELOVNEGA PLANA
// Postavke naročil, ki morajo skozi proizvodnjo (ista FIFO razdelitev kot na Prioritetah),
// in ali so nalogi, ki jih pokrijejo, na delovnem planu oddelka z dovolj kosi.
// =====================================================================

/**
 * ok = vsi potrebni kosi so na planu, delno = samo del kosov, ne = nič na planu,
 * ni_naloga = za kose ni zaloge ne naloga (manjka),
 * dn = kose pokrije planirana količina DN v ERP, naloga pa ni v uvozu nalogov (npr. zaključen ali drug status),
 * ni_dela = nalogi v tem oddelku nimajo dela (normativ 0).
 */
export type KontrolaStatus = "ok" | "delno" | "ne" | "ni_naloga" | "dn" | "ni_dela";

export type KontrolaVrstica = {
  p: PostavkaIzracun;
  status: KontrolaStatus;
  /** Kosi iz nalogov z delom v oddelku. */
  potrebno: number;
  /** Del teh kosov, ki ga pokrijejo planirani kosi (najprej najzgodnejša naročila). */
  planirano: number;
  /** Kosi brez zaloge in brez naloga. */
  manjka: number;
  /** Kosi, ki jih pokrije planirana količina DN v ERP brez naloga v uvozu nalogov. */
  dnBrezNaloga: number;
  /** Ključi krovnih nalogov (kot na delovnem planu: Krovni DN, sicer številka naloga). */
  krovni: string[];
  /** Najkasnejši konec plana nalogov postavke. */
  konec: IsoDate | null;
  /** Plan se konča po roku (datum odpreme - zamik). */
  pozno: boolean;
};

/** Vrstni red statusov za razvrščanje (najprej odprti). */
export const RANG_KONTROLE: Record<KontrolaStatus, number> = { ni_naloga: 0, ne: 1, delno: 2, dn: 3, ok: 4, ni_dela: 5 };

/** Postavka je odprta: ni (v celoti) na planu ali je planirana prepozno. */
export const jeOdprta = (v: KontrolaVrstica) => v.status === "ne" || v.status === "delno" || v.status === "ni_naloga" || v.pozno;

export function kontrolaPlana({
  postavke,
  nalogi,
  koda,
  planKos,
  konecNaloga,
}: {
  /** Rezultat izracunajPrioritete. */
  postavke: PostavkaIzracun[];
  /** Nalogi zadnjega uvoza po številki. */
  nalogi: Map<string, NalogIzracun>;
  koda: OddelekKoda;
  /** Planirani kosi naloga na planu oddelka. */
  planKos: (st: string) => number;
  /** Konec plana naloga na planu oddelka. */
  konecNaloga: (st: string) => IsoDate | null;
}): KontrolaVrstica[] {
  const vrstice = postavke
    .filter((p) => !p.nepotrjeno && p.status !== "V_ODPREMI" && p.deli.some((d) => d.vir === "nalog" || d.vir === "manjka" || d.vir === "dn"))
    .sort((a, b) => (a.datum_odpreme ?? "9999").localeCompare(b.datum_odpreme ?? "9999") || (a.zap ?? 0) - (b.zap ?? 0));

  // Nalog brez normativa šteje, da ima delo (treba ga je planirati)
  const imaDelo = (st: string) => {
    const n = nalogi.get(st);
    return !n || !n.normativ || n.ure[koda] > 0;
  };
  const porabljeno = new Map<string, number>(); // nalog -> kosi naročil do zdaj (FIFO po datumu odpreme)

  return vrstice.map((p) => {
    let potrebno = 0;
    let planirano = 0;
    let manjka = 0;
    let dnBrezNaloga = 0;
    let konec: IsoDate | null = null;
    const krovni = new Set<string>();
    for (const d of p.deli) {
      if (d.vir === "manjka") manjka += d.kolicina;
      if (d.vir === "dn") dnBrezNaloga += d.kolicina;
      if (d.vir !== "nalog" || !imaDelo(d.nalog)) continue;
      const prej = porabljeno.get(d.nalog) ?? 0;
      porabljeno.set(d.nalog, prej + d.kolicina);
      const pokrito = Math.max(0, Math.min(d.kolicina, planKos(d.nalog) - prej));
      potrebno += d.kolicina;
      planirano += pokrito;
      krovni.add(d.krovni ?? d.nalog);
      const k = pokrito > 0 ? konecNaloga(d.nalog) : null;
      if (k && (!konec || k > konec)) konec = k;
    }
    const status: KontrolaStatus =
      potrebno <= 0
        ? manjka > 0
          ? "ni_naloga"
          : dnBrezNaloga > 0
            ? "dn"
            : "ni_dela"
        : planirano >= potrebno - 1e-6
          ? "ok"
          : planirano > 0
            ? "delno"
            : "ne";
    return {
      p,
      status,
      potrebno,
      planirano,
      manjka,
      dnBrezNaloga,
      krovni: [...krovni],
      konec,
      pozno: !!konec && !!p.potrebnoDo && konec > p.potrebnoDo,
    };
  });
}
