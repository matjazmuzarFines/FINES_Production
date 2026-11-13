// "Delo - prejšnji dan" (FIN:TV): štempljane ure enega dne proti delovnemu planu po celicah, za vsak oddelek.
// Isti izračun kot stran Zasedenost -> Produktivnost (izracunajPlanOddelka + izracunajProduktivnost), samo za en dan.
import { addDays, toIso, type IsoDate } from "./dates";
import { naloziNormative, type OddelekKoda } from "./normativi";
import { naloziCelice, naloziPostavitve, naloziZaposlene, zdruziKrovne } from "./plan";
import { naloziNalogeKrovnih, naloziPorocano } from "./porocanoDelo";
import { izracunajPlanOddelka, izracunajProduktivnost, kljucDneva } from "./produktivnostPlana";
import { izracunajNaloge, naloziZadnjiUvoz, naloziZasOddelke } from "./zasedenost";

/** Krovni nalog na celici ta dan: planirane in štempljane ure. */
export type DeloKrovnega = {
  krovni: string;
  narocnik: string | null;
  plan: number;
  ure: number;
  /** Krovni ni planiran ta dan: delan pred planiranim začetkom / po planiranem koncu. */
  izvenDneva: "pred" | "po" | null;
};

export type DeloCelice = {
  naziv: string;
  /** Mesto "Dodatno delo" - ne šteje v oddelek skupaj. */
  dodatno: boolean;
  plan: number;
  /** Vse štempljane ure na celici (krovni iz plana + izven plana + režija). */
  ure: number;
  izven: number;
  rezija: number;
  osebe: number;
  krovni: DeloKrovnega[];
};

export type DeloOddelka = { koda: OddelekKoda; naziv: string; datum: IsoDate; celice: DeloCelice[] };

/** Poraba (štempljano / plan); null = brez plana. */
export const poraba = (ure: number, plan: number) => (plan > 0 ? ure / plan : null);

/** Stanje porabe: do 100 % v redu (zeleno), do 110 % opozorilo (rumeno), nad 110 % preveč (rdeče). */
export function stanjePorabe(p: number | null): "brez" | "ok" | "opozorilo" | "prevec" {
  if (p === null) return "brez";
  const pct = Math.round(p * 100);
  return pct <= 100 ? "ok" : pct <= 110 ? "opozorilo" : "prevec";
}

/** Delo dneva `datum` za izbrane oddelke (vrstni red oddelkov kot v bazi). */
export async function pripraviDelo(datum: IsoDate, kode: OddelekKoda[]): Promise<DeloOddelka[]> {
  const danes = toIso(new Date());
  const [oddelki, uvoz, normativi, celice, postavitve, zaposleni, porocano] = await Promise.all([
    naloziZasOddelke(),
    naloziZadnjiUvoz(),
    naloziNormative(true),
    naloziCelice(datum),
    naloziPostavitve(),
    naloziZaposlene(addDays(danes, -400), addDays(danes, 400)),
    naloziPorocano(datum, datum),
  ]);
  const izracun = izracunajNaloge(uvoz.nalogi, normativi);
  const zgodovina = await naloziNalogeKrovnih([...new Set(postavitve.filter((p) => !p.prosta).map((p) => p.krovni_dn))]);

  const izid: DeloOddelka[] = [];
  for (const oddelek of oddelki) {
    if (!kode.includes(oddelek.koda)) continue;
    const celiceOdd = celice.filter((c) => c.oddelek_id === oddelek.id);
    const krovni = zdruziKrovne(izracun, oddelek.koda);
    const narocnik = new Map(krovni.map((k) => [k.kljuc, k.narocnik]));
    const plan = izracunajPlanOddelka({
      oddelek,
      celice: celiceOdd,
      postavitve: postavitve.filter((p) => p.oddelek_id === oddelek.id),
      zaposleni,
      krovni,
    });
    const { dnevi } = izracunajProduktivnost({ koda: oddelek.koda, celice: celiceOdd, plan, krovni, zgodovina, porocano });

    const vrstice: DeloCelice[] = celiceOdd.map((c) => {
      const dan = dnevi.get(kljucDneva(c.id, datum));
      const poKrovnem = new Map<string, DeloKrovnega>();
      const krovnega = (k: string) => {
        let x = poKrovnem.get(k);
        if (!x) {
          x = { krovni: k, narocnik: narocnik.get(k) ?? null, plan: 0, ure: 0, izvenDneva: null };
          poKrovnem.set(k, x);
        }
        return x;
      };
      for (const p of dan?.plan ?? []) krovnega(p.krovni).plan += p.ure;
      for (const v of dan?.delo ?? []) {
        if (!v.krovni || (v.kategorija !== "plan" && v.kategorija !== "pred" && v.kategorija !== "po")) continue;
        const x = krovnega(v.krovni);
        x.ure += v.ure;
        if (v.kategorija !== "plan" && !x.plan) x.izvenDneva = v.kategorija;
      }
      return {
        naziv: c.naziv,
        dodatno: c.dodatno_delo,
        plan: dan?.planUre ?? 0,
        ure: dan?.porocano ?? 0,
        izven: dan?.ure.izven ?? 0,
        rezija: dan?.ure.rezija ?? 0,
        osebe: dan?.osebe.length ?? 0,
        // najprej planirani (največ ur plana), nato delani izven plana dneva
        krovni: [...poKrovnem.values()]
          .filter((k) => k.plan > 0.05 || k.ure > 0.05)
          .sort((a, b) => b.plan - a.plan || b.ure - a.ure),
      };
    });
    izid.push({
      koda: oddelek.koda,
      naziv: oddelek.naziv,
      datum,
      // Dodatno delo samo, če je imelo plan ali delo
      celice: vrstice.filter((c) => !c.dodatno || c.plan > 0.05 || c.ure > 0.05),
    });
  }
  return izid;
}
