import { addDays, mondayOf, weekday, type IsoDate } from "./dates";
import type { OddelekKoda } from "./normativi";
import { jeDelovniDan, urePoKosu, type Krovni, type Postavitev, type Razpored } from "./plan";
import type { PostavkaIzracun } from "./prioritete";
import type { NalogIzracun } from "./zasedenost";

// =====================================================================
// ZAMUDE DOBAV ZARADI PRESEŽKA DELOVNEGA PLANA
//
// Plan pove, KAJ se dela (postavitve od-do), kapaciteta celice pa, KOLIKO se res naredi:
//   - dan do 100 %: naredi se vse planirano,
//   - dan nad 100 %: naredi se samo za kapaciteto (presežek ur se ne naredi).
// Kosi se delajo po vrsti najzgodnejših odprem (EDF), kosi brez naročila (zaloga) so zadnji.
// Zamuda zaradi poznega plana (po roku / zapadlo): proizvodnja se ne ustavi, zamujeni kosi se naredijo
// takoj, ko je mogoče, in vzamejo kose naslednjim odpremam.
// Zamuda zaradi presežka (dnevi nad 100 %): ujame se z nadurami - ob roku se odpiše in ne prenaša naprej.
// Isti izračun brez omejitve kapacitete pove, koliko zamudi že sam plan.
// =====================================================================

export type ZamudaStatus = "presezek" | "zapadlo" | "po_roku" | "ni_na_planu" | "ok";

export type ZamudaVrstica = {
  p: PostavkaIzracun;
  potrebnoDo: IsoDate;
  /** Kosi iz nalogov z delom v oddelku. */
  potrebno: number;
  /** Narejeno pravočasno po planu (z omejitvijo kapacitete). */
  pravocasno: number;
  /** Ne bo pravočasno zaradi presežka (dnevi nad 100 %). */
  presezek: number;
  /** Plan je tudi brez presežka po roku (postavitev se konča prepozno ali je rok že mimo) - naredijo se kasneje. */
  poRoku: number;
  /** Dan, ko je po planu narejen zadnji kos odpreme (pri presežku z nadurami: dan pred rokom); null = ne v planu. */
  narejeno: IsoDate | null;
  /** Kosi naloga, ki niso v nobeni postavitvi oddelka. */
  niNaPlanu: number;
  nalogi: string[];
  krovni: string[];
  celice: number[];
  status: ZamudaStatus;
};

export type PrezasedenOdsek = {
  celicaId: number;
  od: IsoDate;
  do: IsoDate;
  dni: number;
  maxPct: number;
  /** Planirane ure nad kapaciteto v odseku. */
  presezekUr: number;
  krovni: string[];
};

/** Ure, ki jih je treba dodatno narediti v tednu na celici, da odpreme ne zamudijo. */
export type UreZamude = {
  /** Ponedeljek tedna. */
  teden: IsoDate;
  celicaId: number | null;
  peci: number;
  ure: number;
  odpreme: { stevilka: string; partner: string | null; potrebnoDo: IsoDate; kos: number }[];
  krovni: string[];
};

/**
 * Teden, v katerem je treba narediti peči za odpremo: teden pred odpremo; če je odprema v četrtek ali kasneje,
 * isti teden. Zapadle (teden je že mimo) gredo v tekoči teden.
 */
export function tedenZaOdpremo(rok: IsoDate, danes: IsoDate): IsoDate {
  const pon = mondayOf(rok);
  const teden = weekday(rok) >= 4 ? pon : addDays(pon, -7);
  const zdaj = mondayOf(danes);
  return teden < zdaj ? zdaj : teden;
}

/** Rang statusa za razvrščanje (najprej zamude zaradi presežka). */
export const RANG_ZAMUDE: Record<ZamudaStatus, number> = { presezek: 0, zapadlo: 1, po_roku: 2, ni_na_planu: 3, ok: 4 };

/** Preostali planirani kosi naloga v eni postavitvi. */
type Reza = { postavitev: Postavitev; ident: string; ostane: number; urNaKos: number };
/** Potreba naročila po identu z rokom (del vrstice, ki ga pokrijejo nalogi). */
type Potreba = { vrstica: number; ident: string; rok: IsoDate; ostane: number };

const EPS = 1e-6;
/** Delni kos zamude se šteje kot cel (peč je ali ni narejena). */
const kosov = (x: number) => Math.max(0, Math.ceil(x - 0.01));

export function zamudePlana({
  postavke,
  nalogi,
  krovni,
  koda,
  postavitve,
  razpored,
  zasedeno,
  preostaliKosi,
  kapaciteta,
  danes,
  doDatuma,
}: {
  /** Rezultat izracunajPrioritete (potrjena naročila). */
  postavke: PostavkaIzracun[];
  /** Nalogi zadnjega uvoza po številki. */
  nalogi: Map<string, NalogIzracun>;
  krovni: Map<string, Krovni>;
  koda: OddelekKoda;
  /** Postavitve oddelka z urami (efektivne). */
  postavitve: Postavitev[];
  razpored: Map<number, Razpored>;
  /** Planirane ure po `${celica}|${datum}`. */
  zasedeno: Map<string, number>;
  /** Preostali (še ne izdelani) planirani kosi nalogov po postavitvah (kosiKrovnega). */
  preostaliKosi: Map<number, Map<string, number>>;
  kapaciteta: (celicaId: number, datum: IsoDate) => number;
  danes: IsoDate;
  doDatuma: IsoDate;
}): { vrstice: ZamudaVrstica[]; odseki: PrezasedenOdsek[]; ureZamud: UreZamude[] } {
  const imaDelo = (st: string) => {
    const n = nalogi.get(st);
    return !n || !n.normativ || n.ure[koda] > 0;
  };

  // ---------- potrebe po nalogih (isti FIFO kot na Prioritetah, najzgodnejše odpreme najprej) ----------
  const izbrane = postavke
    .filter((p) => !p.nepotrjeno && p.status !== "V_ODPREMI" && p.potrebnoDo && p.potrebnoDo <= doDatuma)
    .filter((p) => p.deli.some((d) => d.vir === "nalog" && imaDelo(d.nalog)))
    .sort((a, b) => a.potrebnoDo!.localeCompare(b.potrebnoDo!) || (a.zap ?? 0) - (b.zap ?? 0));
  const vrstice: ZamudaVrstica[] = izbrane.map((p) => ({
    p,
    potrebnoDo: p.potrebnoDo!,
    potrebno: 0,
    pravocasno: 0,
    presezek: 0,
    poRoku: 0,
    niNaPlanu: 0,
    narejeno: null,
    nalogi: [],
    krovni: [],
    celice: [],
    status: "ok",
  }));
  // Potrebe po identu (peči istega identa so zamenljive: najzgodnejša odprema dobi prvo narejeno peč)
  const potrebe: Potreba[] = [];
  izbrane.forEach((p, i) => {
    let kolicina = 0;
    for (const d of p.deli) {
      if (d.vir !== "nalog" || !imaDelo(d.nalog)) continue;
      const v = vrstice[i];
      v.potrebno += d.kolicina;
      kolicina += d.kolicina;
      if (!v.nalogi.includes(d.nalog)) v.nalogi.push(d.nalog);
      const kr = d.krovni ?? d.nalog;
      if (!v.krovni.includes(kr)) v.krovni.push(kr);
    }
    if (kolicina > EPS) potrebe.push({ vrstica: i, ident: p.ident, rok: p.potrebnoDo!, ostane: kolicina });
  });

  // ---------- preostali planirani kosi po postavitvah ----------
  const reze: Reza[] = [];
  const dodajRezo = (postavitev: Postavitev, st: string, kos: number) => {
    const n = nalogi.get(st);
    if (!n || kos <= EPS) return;
    reze.push({ postavitev, ident: n.koda_artikla, ostane: kos, urNaKos: urePoKosu(n, koda) });
  };
  const poZacetku = [...postavitve].sort((a, b) => a.datum_zacetka.localeCompare(b.datum_zacetka) || a.id - b.id);
  const vPostavitvah = new Map<string, number>();
  for (const p of poZacetku) {
    if (p.prosta) continue;
    for (const [st, kos] of preostaliKosi.get(p.id) ?? []) {
      dodajRezo(p, st, kos);
      vPostavitvah.set(st, (vPostavitvah.get(st) ?? 0) + kos);
    }
  }
  // Razporejanje po urah (brez izbire nalogov): zajame kose krovnega, ki niso v drugih postavitvah
  for (const p of poZacetku) {
    if (p.prosta || p.nalogi || !p.rocne_ure) continue;
    for (const n of krovni.get(p.krovni_dn)?.nalogi ?? []) {
      const kos = n.preostala - (vPostavitvah.get(n.st_naloga) ?? 0);
      dodajRezo(p, n.st_naloga, kos);
      vPostavitvah.set(n.st_naloga, n.preostala);
    }
  }

  // ---------- ni na planu: potrebe, za katere ni dovolj planiranih kosov identa ----------
  const planIdenta = new Map<string, number>();
  for (const r of reze) planIdenta.set(r.ident, (planIdenta.get(r.ident) ?? 0) + r.ostane);
  for (const pot of potrebe) {
    const na = planIdenta.get(pot.ident) ?? 0;
    const pokrito = Math.min(na, pot.ostane);
    planIdenta.set(pot.ident, na - pokrito);
    vrstice[pot.vrstica].niNaPlanu += pot.ostane - pokrito;
    pot.ostane = pokrito;
  }

  // ---------- simulacija po dnevih ----------
  // Proizvodnja se ob zamujenem roku ne ustavi: zamujene peči ostanejo dolžne in se naredijo takoj, ko je mogoče
  // (vzamejo peči naslednjim odpremam). Izjema je del zamude zaradi presežka (dnevi nad 100 %) - ta se ujame
  // z nadurami in se ob roku odpiše (ne prenaša se naprej).
  let konec = doDatuma;
  for (const p of postavitve) {
    const d = razpored.get(p.id)?.do;
    if (d && d > konec) konec = d;
  }

  type Izid = { zamuda: number[]; nadure: number[]; narejeno: (IsoDate | null)[] };
  function simuliraj(omejeno: boolean, zamudaPlana?: number[]): Izid {
    const zamuda = vrstice.map(() => 0);
    const nadure = vrstice.map(() => 0);
    const narejeno: (IsoDate | null)[] = vrstice.map(() => null);
    const pot = potrebe.map((x) => ({ ...x, preverjen: false }));
    const rz = reze.map((x) => ({ ...x }));
    const potPoIdentu = new Map<string, typeof pot>();
    for (const x of pot) potPoIdentu.set(x.ident, [...(potPoIdentu.get(x.ident) ?? []), x]);
    // Najzgodnejša odprta potreba identa (tudi zamujena - ta ima prednost)
    const prvaOdprta = (ident: string) => potPoIdentu.get(ident)?.find((x) => x.ostane > EPS) ?? null;
    const celice = new Map<number, Reza[]>();
    for (const r of rz) celice.set(r.postavitev.delovno_mesto_id, [...(celice.get(r.postavitev.delovno_mesto_id) ?? []), r]);
    for (const x of pot) if (x.ostane <= EPS) narejeno[x.vrstica] = danes;

    for (let d = danes; d <= konec; d = addDays(d, 1)) {
      // Rok: koliko do tega dne (brez njega) ni narejeno
      for (const x of pot) {
        if (x.preverjen || x.rok > d) continue;
        x.preverjen = true;
        if (x.ostane <= EPS) continue;
        zamuda[x.vrstica] += x.ostane;
        if (omejeno && zamudaPlana) {
          // Del zamude, ki ga brez presežka ne bi bilo, se ujame z nadurami
          const odpis = Math.min(x.ostane, Math.max(0, x.ostane - zamudaPlana[x.vrstica]));
          if (odpis > EPS) {
            x.ostane -= odpis;
            nadure[x.vrstica] += odpis;
            if (x.ostane <= EPS) narejeno[x.vrstica] = addDays(x.rok, -1);
          }
        }
      }
      for (const [celica, rezeCelice] of celice) {
        const ure = new Map<number, number>();
        for (const r of rezeCelice) {
          const h = razpored.get(r.postavitev.id)?.dnevi.get(d) ?? 0;
          if (h > EPS) ure.set(r.postavitev.id, h);
        }
        if (!ure.size) continue;
        const plan = [...ure.values()].reduce((s, h) => s + h, 0);
        let budget = omejeno ? Math.min(plan, kapaciteta(celica, d)) : plan;
        // Vsakič naredi kose z najzgodnejšo odprto odpremo; kosi brez naročila (zaloga) so zadnji
        for (let korak = 0; korak < 500 && budget > EPS; korak++) {
          let izbran: Reza | null = null;
          let izbranRok = "";
          let izbranaVrstica = Infinity;
          for (const r of rezeCelice) {
            if (r.ostane <= EPS || (ure.get(r.postavitev.id) ?? 0) <= EPS) continue;
            const odprta = prvaOdprta(r.ident);
            const rok = odprta?.rok ?? "9999";
            // Isti rok: vrstni red naročil kot na Prioritetah, nato zgodnejša postavitev
            const vrstica = odprta?.vrstica ?? Infinity;
            if (
              !izbran ||
              rok < izbranRok ||
              (rok === izbranRok &&
                (vrstica < izbranaVrstica ||
                  (vrstica === izbranaVrstica &&
                    (r.postavitev.datum_zacetka < izbran.postavitev.datum_zacetka ||
                      (r.postavitev.datum_zacetka === izbran.postavitev.datum_zacetka && r.postavitev.id < izbran.postavitev.id)))))
            ) {
              izbran = r;
              izbranRok = rok;
              izbranaVrstica = vrstica;
            }
          }
          if (!izbran) break;
          const potreba = prvaOdprta(izbran.ident);
          const meja = potreba ? potreba.ostane : Infinity;
          let kos: number;
          if (izbran.urNaKos <= EPS) {
            kos = Math.min(izbran.ostane, meja); // brez normativa: ur ni mogoče oceniti - šteje kot narejeno
          } else {
            const na = Math.min(budget, ure.get(izbran.postavitev.id)!);
            kos = Math.min(izbran.ostane, meja, na / izbran.urNaKos);
            budget -= kos * izbran.urNaKos;
            ure.set(izbran.postavitev.id, ure.get(izbran.postavitev.id)! - kos * izbran.urNaKos);
          }
          izbran.ostane -= kos;
          if (potreba) {
            potreba.ostane -= kos;
            const v = vrstice[potreba.vrstica];
            if (!v.celice.includes(celica)) v.celice.push(celica);
            if (potreba.ostane <= 0.01) {
              potreba.ostane = 0;
              narejeno[potreba.vrstica] = d;
            }
          }
        }
      }
    }
    return { zamuda, nadure, narejeno };
  }

  // Najprej brez omejitve kapacitete (koliko zamudi že sam plan), nato s kapaciteto (presežek = nadure)
  const brezOmejitve = simuliraj(false);
  const zOmejitvijo = simuliraj(true, brezOmejitve.zamuda);
  vrstice.forEach((v, i) => {
    const vse = kosov(zOmejitvijo.zamuda[i]);
    v.niNaPlanu = kosov(v.niNaPlanu);
    v.presezek = Math.min(vse, kosov(zOmejitvijo.nadure[i]));
    v.poRoku = vse - v.presezek;
    v.pravocasno = Math.max(0, v.potrebno - v.niNaPlanu - v.poRoku - v.presezek);
    v.narejeno = zOmejitvijo.narejeno[i];
    v.status =
      v.presezek > 0
        ? "presezek"
        : v.poRoku > 0
          ? v.potrebnoDo <= danes
            ? "zapadlo"
            : "po_roku"
          : v.niNaPlanu > 0
            ? "ni_na_planu"
            : "ok";
  });

  // ---------- prezasedeni odseki po celicah ----------
  const odseki: PrezasedenOdsek[] = [];
  const celice = [...new Set(postavitve.map((p) => p.delovno_mesto_id))];
  for (const c of celice) {
    let tek: PrezasedenOdsek | null = null;
    for (let d = danes; d <= doDatuma; d = addDays(d, 1)) {
      const kap = kapaciteta(c, d);
      if (!jeDelovniDan(d) || kap <= EPS) continue; // vikend / celica ne dela: odsek se ne prekine
      const plan = zasedeno.get(`${c}|${d}`) ?? 0;
      if (plan > kap + 0.01) {
        const pct = (plan / kap) * 100;
        const krovniDne = postavitve
          .filter((p) => p.delovno_mesto_id === c && (razpored.get(p.id)?.dnevi.get(d) ?? 0) > 0)
          .map((p) => p.krovni_dn);
        if (!tek) {
          tek = { celicaId: c, od: d, do: d, dni: 0, maxPct: 0, presezekUr: 0, krovni: [] };
          odseki.push(tek);
        }
        tek.do = d;
        tek.dni++;
        tek.maxPct = Math.max(tek.maxPct, pct);
        tek.presezekUr += plan - kap;
        for (const k of krovniDne) if (!tek.krovni.includes(k)) tek.krovni.push(k);
      } else tek = null;
    }
  }

  // ---------- ure za pokritje zamud (po tednih in celicah) ----------
  // Zamujene peči (po roku, zapadlo, presežek) × ure na peč postavitve, ki bi jih naredila (najzgodnejša z identom)
  const prvaReza = new Map<string, Reza>();
  for (const r of reze) {
    const prej = prvaReza.get(r.ident);
    if (!prej || r.postavitev.datum_zacetka < prej.postavitev.datum_zacetka) prvaReza.set(r.ident, r);
  }
  const ureZamud = new Map<string, UreZamude>();
  for (const v of vrstice) {
    const kos = v.poRoku + v.presezek;
    if (kos <= 0) continue;
    const r = prvaReza.get(v.p.ident);
    const teden = tedenZaOdpremo(v.potrebnoDo, danes);
    const celicaId = r?.postavitev.delovno_mesto_id ?? null;
    const kljuc = `${teden}|${celicaId}`;
    const u = ureZamud.get(kljuc) ?? { teden, celicaId, peci: 0, ure: 0, odpreme: [], krovni: [] };
    u.peci += kos;
    u.ure += kos * (r?.urNaKos ?? 0);
    u.odpreme.push({ stevilka: v.p.stevilka, partner: v.p.partner, potrebnoDo: v.potrebnoDo, kos });
    for (const k of v.krovni) if (!u.krovni.includes(k)) u.krovni.push(k);
    ureZamud.set(kljuc, u);
  }

  return { vrstice, odseki, ureZamud: [...ureZamud.values()] };
}
