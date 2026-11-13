// Zaključeni krovni nalogi po oddelkih (za PDF in FIN:TV): krovni iz delovnega plana, zaključeni v zadnjih N dneh,
// razdeljeni po celicah. Izračun je v produktivnostPlana.ts (izracunajZakljucene) - ista logika kot na strani Produktivnost.
import { addDays, toIso, type IsoDate } from "./dates";
import { naloziNormative, type OddelekKoda } from "./normativi";
import { naloziCelice, naloziPostavitve, naloziZaposlene, zdruziKrovne, type Celica } from "./plan";
import { naloziKoseNalogov, naloziNalogeKrovnih, naloziPorocanoNalogov } from "./porocanoDelo";
import { NERAZPOREJENO, izracunajPlanOddelka, izracunajZakljucene, zakljuceniKandidati, type KrovniZakljucen } from "./produktivnostPlana";
import { izracunajNaloge, naloziZadnjiUvoz, naloziZasOddelke } from "./zasedenost";

/** Koliko dni nazaj (datum zaključka krovnega). */
export const DNI_ZAKLJUCENI = 30;

export type ZakljuceniCelice = { naziv: string; krovni: KrovniZakljucen[] };
export type ZakljuceniOddelka = { koda: OddelekKoda; naziv: string; od: IsoDate; celice: ZakljuceniCelice[] };

/** Krovni po celicah (vrstni red celic; krovni brez celice na koncu). Celice brez zaključenih krovnih se izpustijo. */
export function poCelicah(celice: Pick<Celica, "id" | "naziv">[], krovni: KrovniZakljucen[]): ZakljuceniCelice[] {
  return [...celice.map((c) => ({ id: c.id, naziv: c.naziv })), { id: NERAZPOREJENO, naziv: "Brez delovnega mesta" }]
    .map((c) => ({ naziv: c.naziv, krovni: krovni.filter((k) => k.celicaId === c.id) }))
    .filter((c) => c.krovni.length > 0);
}

/** Zaključeni krovni za izbrane oddelke (vse naloži sam - za objavo na FIN:TV ob uvozu poročanega dela). */
export async function pripraviZakljucene(kode: OddelekKoda[], dni = DNI_ZAKLJUCENI): Promise<ZakljuceniOddelka[]> {
  const danes = toIso(new Date());
  const od = addDays(danes, -dni);
  const [oddelki, uvoz, normativi, celice, postavitve, zaposleni] = await Promise.all([
    naloziZasOddelke(),
    naloziZadnjiUvoz(),
    naloziNormative(true),
    naloziCelice(danes),
    naloziPostavitve(),
    naloziZaposlene(addDays(danes, -400), addDays(danes, 400)),
  ]);
  const izracun = izracunajNaloge(uvoz.nalogi, normativi);
  const odprti = new Set(uvoz.nalogi.map((n) => n.st_naloga));
  const zgodovina = await naloziNalogeKrovnih([...new Set(postavitve.filter((p) => !p.prosta).map((p) => p.krovni_dn))]);

  const izid: ZakljuceniOddelka[] = [];
  for (const oddelek of oddelki) {
    if (!kode.includes(oddelek.koda)) continue;
    const celiceOdd = celice.filter((c) => c.oddelek_id === oddelek.id);
    const plan = izracunajPlanOddelka({
      oddelek,
      celice: celiceOdd,
      postavitve: postavitve.filter((p) => p.oddelek_id === oddelek.id),
      zaposleni,
      krovni: zdruziKrovne(izracun, oddelek.koda),
    });
    const nalogi = zakljuceniKandidati(plan.postavitve, odprti, zgodovina).flatMap((k) => k.nalogi.map((n) => n.st_naloga));
    const [porocano, kosiNalogov] = nalogi.length ? await Promise.all([naloziPorocanoNalogov(nalogi), naloziKoseNalogov(nalogi)]) : [[], new Map<string, number>()];
    const krovni = izracunajZakljucene({
      koda: oddelek.koda,
      postavitve: plan.postavitve,
      razpored: plan.razpored,
      odprti,
      zgodovina,
      porocano,
      normativi,
      kosiNalogov,
      od,
    });
    izid.push({ koda: oddelek.koda, naziv: oddelek.naziv, od, celice: poCelicah(celiceOdd, krovni) });
  }
  return izid;
}
