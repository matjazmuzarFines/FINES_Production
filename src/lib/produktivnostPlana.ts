// Produktivnost delovnega plana: planirane ure (delovni plan) proti poročanim uram (štempljanje po nalogih).
import * as XLSX from "xlsx";
import { addDays, mondayOf, type IsoDate } from "./dates";
import { ODDELKI_NORMATIVA, type Normativ, type OddelekKoda } from "./normativi";
import {
  delezNapredka,
  jeDelovniDan,
  kosiKrovnega,
  napredekPostavitve,
  pretvoriStarePostavitve,
  razporedi,
  urePostavitve,
  type Celica,
  type Krovni,
  type Napredek,
  type Postavitev,
  type Razpored,
  type ZaposleniDan,
} from "./plan";
import { oddelekOperacije, type NalogKrovnega, type PorocanoDelo } from "./porocanoDelo";
import type { ZasOddelek } from "./zasedenost";

/**
 * Kam spada poročana ura na celici:
 * - plan:   nalog krovnega, ki je ta dan planiran na celici,
 * - pred:   nalog krovnega iz plana celice, delan PRED planiranim začetkom (začeli prej),
 * - po:     nalog krovnega iz plana celice, delan PO planiranem koncu (zamuda),
 * - izven:  nalog, ki ga ni v planu oddelka (celica po osebi, ki je ta dan delala na celici),
 * - rezija: vzdrževanje, logistika, ostalo ... osebe, ki je ta dan delala na celici.
 */
export type Kategorija = "plan" | "pred" | "po" | "izven" | "rezija";

export const KATEGORIJE: { koda: Kategorija; label: string; opis: string }[] = [
  { koda: "plan", label: "V planu", opis: "Nalogi krovnega, ki je ta dan planiran na celici" },
  { koda: "pred", label: "Pred planom", opis: "Krovni iz plana celice, delan pred planiranim začetkom" },
  { koda: "po", label: "Po planu", opis: "Krovni iz plana celice, delan po planiranem koncu (zamuda)" },
  { koda: "izven", label: "Izven plana", opis: "Nalog, ki ni v delovnem planu oddelka" },
  { koda: "rezija", label: "Režija", opis: "Vzdrževanje, logistika, ostalo - ljudje s celice" },
];
export const labelKategorije = (k: Kategorija) => KATEGORIJE.find((x) => x.koda === k)!.label;

/** Vrstica poročanega dela, pripisana celici (in postavitvi, če je nalog v planu). */
export type PripisanoDelo = PorocanoDelo & {
  kategorija: Kategorija;
  celicaId: number | null; // null = ni mogoče pripisati celici (Nerazporejeno)
  postavitevId: number | null;
  krovni: string | null;
};

export type PlanDela = { postavitevId: number; krovni: string; ure: number };

export type DanCelice = {
  celicaId: number;
  datum: IsoDate;
  plan: PlanDela[];
  planUre: number;
  /** Zaposleni na celici ta dan (iz plana). */
  planOseb: number;
  delo: PripisanoDelo[];
  ure: Record<Kategorija, number>;
  porocano: number;
  osebe: string[];
};

/** Postavitev v kontroli produktivnosti. */
export type KontrolaPostavitve = {
  postavitev: Postavitev;
  celica: string;
  od: IsoDate | null;
  do: IsoDate | null;
  planUre: number;
  napredek: Napredek | null;
  /** Planirane ure, pomnožene z deležem izdelanega (zaslužene ure). */
  zasluzeno: number | null;
  porocano: number;
  ure: Record<"plan" | "pred" | "po", number>;
  osebe: string[];
  /** Zaslužene / poročane ure (100 % = po normativu). */
  produktivnost: number | null;
  delo: PripisanoDelo[];
  /** Prvi in zadnji dan poročanega dela. */
  prviDan: IsoDate | null;
  zadnjiDan: IsoDate | null;
};

export const NERAZPOREJENO = -1;

/** Osebe s poročanimi urami (vnosi z 0 h ne štejejo). */
const imenaOseb = (delo: PorocanoDelo[]) => [...new Set(delo.filter((v) => v.ure > 0).map((v) => v.ime_delavca ?? v.delavec))].sort();
const prazneUre = (): Record<Kategorija, number> => ({ plan: 0, pred: 0, po: 0, izven: 0, rezija: 0 });
const dniMed = (a: IsoDate, b: IsoDate) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// =====================================================================
// PLAN ODDELKA (isti izračun kot na Delovnem planu)
// =====================================================================

export type PlanOddelka = {
  postavitve: Postavitev[]; // z efektivnimi urami
  razpored: Map<number, Razpored>;
  zaposleni: (celicaId: number, d: IsoDate) => number;
};

export function izracunajPlanOddelka({
  oddelek,
  celice,
  postavitve,
  zaposleni,
  krovni,
}: {
  oddelek: ZasOddelek;
  celice: Celica[];
  postavitve: Postavitev[];
  zaposleni: ZaposleniDan[];
  krovni: Krovni[];
}): PlanOddelka {
  const zap = new Map(zaposleni.map((z) => [`${z.delovno_mesto_id}|${z.datum}`, z.st_zaposlenih]));
  const cel = new Map(celice.map((c) => [c.id, c]));
  const stZap = (id: number, d: IsoDate) => zap.get(`${id}|${d}`) ?? cel.get(id)?.privzeto_zaposlenih ?? 0;
  const kap = (id: number, d: IsoDate) => (jeDelovniDan(d) ? stZap(id, d) * oddelek.ure_na_dan : 0);
  const poKljucu = new Map(krovni.map((k) => [k.kljuc, k]));
  const { postavitve: lokalne } = pretvoriStarePostavitve(postavitve, poKljucu, oddelek.koda, kap);
  const kosiPostavitev = new Map<number, Map<string, number>>();
  const vPlanu = new Set(lokalne.map((p) => p.krovni_dn));
  for (const k of krovni) if (vPlanu.has(k.kljuc)) for (const [id, m] of kosiKrovnega(k, lokalne)) kosiPostavitev.set(id, m);
  const efektivne = lokalne.map((p) => ({
    ...p,
    ure: urePostavitve(p, p.prosta ? undefined : poKljucu.get(p.krovni_dn), oddelek.koda, kosiPostavitev.get(p.id)),
  }));
  const { razpored } = razporedi(efektivne, kap);
  return { postavitve: efektivne, razpored, zaposleni: (id, d) => (jeDelovniDan(d) ? stZap(id, d) : 0) };
}

// =====================================================================
// PRIPIS POROČANEGA DELA
// =====================================================================

/** Nalogi postavitve: izbrani nalogi ali vsi nalogi krovnega (tudi zaključeni iz starejših uvozov). */
function nalogiPostavitve(p: Postavitev, krovni: Map<string, Krovni>, zgodovina: Map<string, string[]>): string[] {
  if (p.prosta) return [];
  if (p.nalogi && p.nalogi.length) return p.nalogi;
  const s = new Set<string>([p.krovni_dn]); // krovni brez "Krovni DN" = nalog sam
  for (const n of krovni.get(p.krovni_dn)?.nalogi ?? []) s.add(n.st_naloga);
  for (const st of zgodovina.get(p.krovni_dn) ?? []) s.add(st);
  return [...s];
}

/** Številke vseh nalogov iz plana oddelka (za nalaganje poročanega dela). */
export function nalogiPlana(postavitve: Postavitev[], krovni: Krovni[], zgodovina: NalogKrovnega[]): string[] {
  const zg = zgodovinaPoKrovnem(zgodovina);
  const poKljucu = new Map(krovni.map((k) => [k.kljuc, k]));
  return [...new Set(postavitve.flatMap((p) => nalogiPostavitve(p, poKljucu, zg)))];
}

function zgodovinaPoKrovnem(zgodovina: NalogKrovnega[]) {
  const m = new Map<string, string[]>();
  for (const n of zgodovina) if (n.krovni_dn) m.set(n.krovni_dn, [...(m.get(n.krovni_dn) ?? []), n.st_naloga]);
  return m;
}

export type Produktivnost = {
  dnevi: Map<string, DanCelice>; // `${celicaId}|${datum}`
  delo: PripisanoDelo[];
  kontrola: KontrolaPostavitve[];
};

export const kljucDneva = (celicaId: number, d: IsoDate) => `${celicaId}|${d}`;

export function izracunajProduktivnost({
  koda,
  celice,
  plan,
  krovni,
  zgodovina,
  porocano,
}: {
  koda: OddelekKoda;
  celice: Celica[];
  plan: PlanOddelka;
  krovni: Krovni[];
  zgodovina: NalogKrovnega[];
  porocano: PorocanoDelo[];
}): Produktivnost {
  const poKljucu = new Map(krovni.map((k) => [k.kljuc, k]));
  const zg = zgodovinaPoKrovnem(zgodovina);
  const postPoId = new Map(plan.postavitve.map((p) => [p.id, p]));

  // nalog -> postavitve, ki ga vsebujejo
  const postPoNalogu = new Map<string, Postavitev[]>();
  for (const p of plan.postavitve)
    for (const st of nalogiPostavitve(p, poKljucu, zg)) postPoNalogu.set(st, [...(postPoNalogu.get(st) ?? []), p]);

  // 1) Nalogi iz plana: postavitev, ki je ta dan planirana, sicer najbližja po datumu
  const delo: PripisanoDelo[] = [];
  const ostalo: PorocanoDelo[] = [];
  const unikatno = new Map(porocano.map((v) => [v.id, v]));
  for (const v of unikatno.values()) {
    const odd = oddelekOperacije(v.operacija);
    if (odd !== koda) {
      if (odd === null) ostalo.push(v);
      continue;
    }
    const kandidati = (postPoNalogu.get(v.st_naloga) ?? []).filter((p) => plan.razpored.get(p.id)?.od);
    if (!kandidati.length) {
      ostalo.push(v);
      continue;
    }
    const aktivne = kandidati
      .map((p) => ({ p, ure: plan.razpored.get(p.id)!.dnevi.get(v.datum) ?? 0 }))
      .filter((x) => x.ure > 0)
      .sort((a, b) => b.ure - a.ure);
    if (aktivne.length) {
      const p = aktivne[0].p;
      delo.push({ ...v, kategorija: "plan", celicaId: p.delovno_mesto_id, postavitevId: p.id, krovni: p.krovni_dn });
      continue;
    }
    const najblizja = kandidati
      .map((p) => {
        const r = plan.razpored.get(p.id)!;
        const pred = v.datum < r.od!;
        return { p, pred, razdalja: pred ? dniMed(v.datum, r.od!) : dniMed(r.do!, v.datum) };
      })
      .sort((a, b) => a.razdalja - b.razdalja)[0];
    delo.push({
      ...v,
      kategorija: najblizja.pred ? "pred" : "po",
      celicaId: najblizja.p.delovno_mesto_id,
      postavitevId: najblizja.p.id,
      krovni: najblizja.p.krovni_dn,
    });
  }

  // 2) Oseba -> celica: kjer je oseba ta dan (sicer ta teden) poročala največ ur na nalogih plana
  const poDnevu = new Map<string, Map<number, number>>();
  const poTednu = new Map<string, Map<number, number>>();
  const dodaj = (m: Map<string, Map<number, number>>, k: string, c: number, u: number) => {
    const x = m.get(k) ?? new Map<number, number>();
    x.set(c, (x.get(c) ?? 0) + u);
    m.set(k, x);
  };
  for (const v of delo) {
    dodaj(poDnevu, `${v.delavec}|${v.datum}`, v.celicaId!, v.ure);
    dodaj(poTednu, `${v.delavec}|${mondayOf(v.datum)}`, v.celicaId!, v.ure);
  }
  const najvec = (m?: Map<number, number>) => (m ? [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null);
  const celicaOsebe = (delavec: string, d: IsoDate) =>
    najvec(poDnevu.get(`${delavec}|${d}`)) ?? najvec(poTednu.get(`${delavec}|${mondayOf(d)}`));

  // Glavni oddelek osebe (po urah operacij) - nerazporejeno delo samo za ljudi tega oddelka
  const oddelekOsebe = new Map<string, Map<string, number>>();
  for (const v of unikatno.values()) {
    const o = oddelekOperacije(v.operacija);
    if (!o) continue;
    const m = oddelekOsebe.get(v.delavec) ?? new Map<string, number>();
    m.set(o, (m.get(o) ?? 0) + v.ure);
    oddelekOsebe.set(v.delavec, m);
  }
  const glavniOddelek = (delavec: string) => [...(oddelekOsebe.get(delavec) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  for (const v of ostalo) {
    const rezija = oddelekOperacije(v.operacija) === null;
    const celicaId = celicaOsebe(v.delavec, v.datum);
    if (celicaId === null && (rezija || glavniOddelek(v.delavec) !== koda)) continue;
    delo.push({ ...v, kategorija: rezija ? "rezija" : "izven", celicaId: celicaId ?? NERAZPOREJENO, postavitevId: null, krovni: null });
  }

  // 3) Dnevi celic: plan iz razporeda + pripisano delo
  const dnevi = new Map<string, DanCelice>();
  const dan = (celicaId: number, d: IsoDate) => {
    const k = kljucDneva(celicaId, d);
    let x = dnevi.get(k);
    if (!x) {
      x = { celicaId, datum: d, plan: [], planUre: 0, planOseb: celicaId > 0 ? plan.zaposleni(celicaId, d) : 0, delo: [], ure: prazneUre(), porocano: 0, osebe: [] };
      dnevi.set(k, x);
    }
    return x;
  };
  const celiceIds = new Set(celice.map((c) => c.id));
  for (const p of plan.postavitve) {
    if (!celiceIds.has(p.delovno_mesto_id)) continue;
    for (const [d, ure] of plan.razpored.get(p.id)?.dnevi ?? []) {
      const x = dan(p.delovno_mesto_id, d);
      x.plan.push({ postavitevId: p.id, krovni: p.krovni_dn, ure });
      x.planUre += ure;
    }
  }
  for (const v of delo) {
    const x = dan(v.celicaId!, v.datum);
    x.delo.push(v);
    x.ure[v.kategorija] += v.ure;
    x.porocano += v.ure;
  }
  for (const x of dnevi.values()) x.osebe = imenaOseb(x.delo);

  // 4) Kontrola produktivnosti po postavitvah
  const imeCelice = new Map(celice.map((c) => [c.id, c.naziv]));
  const deloPoPostavitvi = new Map<number, PripisanoDelo[]>();
  for (const v of delo) if (v.postavitevId !== null) deloPoPostavitvi.set(v.postavitevId, [...(deloPoPostavitvi.get(v.postavitevId) ?? []), v]);
  const kontrola: KontrolaPostavitve[] = plan.postavitve
    .filter((p) => celiceIds.has(p.delovno_mesto_id))
    .map((p) => {
      const r = plan.razpored.get(p.id);
      const d = deloPoPostavitvi.get(p.id) ?? [];
      const k = poKljucu.get(p.krovni_dn);
      // Krovnega ni več v uvozu nalogov = vsi nalogi zaključeni (100 %); prazen seznam nalogov = vsi nalogi krovnega
      const napredek = p.prosta
        ? null
        : (napredekPostavitve(p.nalogi && !p.nalogi.length ? { ...p, nalogi: null } : p, k) ?? (k ? null : { razpisano: 0, izdelano: 0, nalogi: [] }));
      const zasluzeno = napredek ? p.ure * delezNapredka(napredek) : null;
      const porocanoUre = d.reduce((s, v) => s + v.ure, 0);
      const datumi = d.map((v) => v.datum).sort();
      return {
        postavitev: postPoId.get(p.id)!,
        celica: imeCelice.get(p.delovno_mesto_id) ?? "",
        od: r?.od ?? null,
        do: r?.do ?? null,
        planUre: p.ure,
        napredek,
        zasluzeno,
        porocano: porocanoUre,
        ure: {
          plan: d.filter((v) => v.kategorija === "plan").reduce((s, v) => s + v.ure, 0),
          pred: d.filter((v) => v.kategorija === "pred").reduce((s, v) => s + v.ure, 0),
          po: d.filter((v) => v.kategorija === "po").reduce((s, v) => s + v.ure, 0),
        },
        osebe: imenaOseb(d),
        produktivnost: zasluzeno !== null && porocanoUre > 0 ? zasluzeno / porocanoUre : null,
        delo: d,
        prviDan: datumi[0] ?? null,
        zadnjiDan: datumi[datumi.length - 1] ?? null,
      };
    })
    .sort((a, b) => (a.od ?? "9999").localeCompare(b.od ?? "9999") || (a.do ?? "9999").localeCompare(b.do ?? "9999"));

  return { dnevi, delo, kontrola };
}

/** Prikazani dnevi: delovni dnevi obdobja + vikendi, na katere je bilo poročano delo. */
export function dneviObdobja(od: IsoDate, doo: IsoDate, delo: { datum: IsoDate }[]): IsoDate[] {
  const zDelom = new Set(delo.map((v) => v.datum));
  const out: IsoDate[] = [];
  for (let d = od; d <= doo; d = addDays(d, 1)) if (jeDelovniDan(d) || zDelom.has(d)) out.push(d);
  return out;
}

/**
 * Poraba ur dneva / obdobja: vse poročane ure na celici / planirane ure (100 % = toliko ur kot plan, nad 100 % = več ur
 * kot plan). Prava produktivnost (zaslužene / poročane ure) je samo pri krovnih nalogih - po dnevih ni znano, koliko je izdelano.
 */
export const porabaDneva = (planUre: number, porocano: number) => (planUre > 0 ? porocano / planUre : null);

// =====================================================================
// ZAKLJUČENI KROVNI NALOGI (produktivnost po zaključku)
//
// Delovni nalog je zaključen, ko ga ni več v zadnjem uvozu nalogov (v štempljanju ima status "Z").
// Krovni je zaključen, ko so zaključeni VSI njegovi nalogi (iz vseh uvozov); datum zaključka = zadnji dan štempljanja.
// Prikažejo se krovni iz delovnega plana oddelka, zaključeni v zadnjih N dneh - vedno v celoti (vse ure, tudi starejše).
// Produktivnost = normativne ure / štempljane ure (samo operacije oddelka): nad 100 % = manj ur od normativa.
// =====================================================================

/** Produktivnost zunaj teh mej je verjetno napaka štempljanja - pokaže se značka "preveri", izločanja ni. */
export const PREVERI_NAD = 1.5;
export const PREVERI_POD = 0.5;

export type NalogZakljucen = {
  st: string;
  naziv: string | null;
  ident: string | null;
  /** Razpisana količina (zaključen nalog = narejeno). */
  kos: number;
  /** Normativne ure oddelka (kos × normativ); null = ni normativa za oddelek. */
  normUre: number | null;
  /** Štempljane ure na operacijah oddelka. */
  ure: number;
  produktivnost: number | null;
  /** Ne šteje se: brez štempljanja v oddelku ali brez kosov. */
  izlocen: "brez_stempljanja" | "brez_kosov" | null;
  preveri: boolean;
};

export type KrovniZakljucen = {
  krovni: string;
  celicaId: number;
  /** Zadnji dan štempljanja na nalogih krovnega (vsi oddelki). */
  zakljucen: IsoDate;
  /** Prvi dan štempljanja v oddelku. */
  prviDan: IsoDate | null;
  /** Vsota nalogov z normativom (brez izločenih). */
  normUre: number;
  ure: number;
  /** Štempljane ure na nalogih brez normativa (niso v produktivnosti). */
  ureBrezNormativa: number;
  produktivnost: number | null;
  nalogi: NalogZakljucen[];
};

/** Nalogi krovnega iz vseh uvozov (krovni brez "Krovni DN" je nalog sam). */
function nalogiKrovnega(krovni: string, zgodovina: NalogKrovnega[]) {
  const m = new Map<string, NalogKrovnega>();
  for (const n of zgodovina) if (n.krovni_dn === krovni || n.st_naloga === krovni) m.set(n.st_naloga, n);
  return [...m.values()];
}

/** Zaključeni krovni iz plana oddelka (brez ur - za nalaganje štempljanja in kosov). */
export function zakljuceniKandidati(postavitve: Postavitev[], odprti: Set<string>, zgodovina: NalogKrovnega[]) {
  const krovni = [...new Set(postavitve.filter((p) => !p.prosta).map((p) => p.krovni_dn))];
  return krovni
    .map((k) => ({ krovni: k, nalogi: nalogiKrovnega(k, zgodovina) }))
    .filter((x) => x.nalogi.length > 0 && !odprti.has(x.krovni) && x.nalogi.every((n) => !odprti.has(n.st_naloga)));
}

export function izracunajZakljucene({
  koda,
  postavitve,
  razpored,
  odprti,
  zgodovina,
  porocano,
  normativi,
  kosiNalogov,
  od,
}: {
  koda: OddelekKoda;
  postavitve: Postavitev[];
  razpored: Map<number, Razpored>;
  /** Nalogi v zadnjem uvozu (odprti). */
  odprti: Set<string>;
  zgodovina: NalogKrovnega[];
  /** Vse štempljanje na nalogih kandidatov (vsi datumi, vse operacije). */
  porocano: PorocanoDelo[];
  normativi: Normativ[];
  kosiNalogov: Map<string, number>;
  /** Krovni, zaključeni na ta dan ali pozneje. */
  od: IsoDate;
}): KrovniZakljucen[] {
  const polje = ODDELKI_NORMATIVA.find((o) => o.koda === koda)!.polje;
  const normPoIdentu = new Map(normativi.map((n) => [n.ident, n]));
  const porPoNalogu = new Map<string, PorocanoDelo[]>();
  for (const v of new Map(porocano.map((x) => [x.id, x])).values()) porPoNalogu.set(v.st_naloga, [...(porPoNalogu.get(v.st_naloga) ?? []), v]);
  // celica krovnega: postavitev z najpoznejšim koncem plana
  const celicaKrovnega = new Map<string, { celicaId: number; konec: string }>();
  for (const p of postavitve) {
    if (p.prosta) continue;
    const konec = razpored.get(p.id)?.do ?? p.datum_zacetka;
    const x = celicaKrovnega.get(p.krovni_dn);
    if (!x || konec > x.konec) celicaKrovnega.set(p.krovni_dn, { celicaId: p.delovno_mesto_id, konec });
  }

  const out: KrovniZakljucen[] = [];
  for (const { krovni, nalogi } of zakljuceniKandidati(postavitve, odprti, zgodovina)) {
    const vseVrstice = nalogi.flatMap((n) => porPoNalogu.get(n.st_naloga) ?? []);
    if (!vseVrstice.length) continue;
    const zakljucen = vseVrstice.reduce((m, v) => (v.datum > m ? v.datum : m), vseVrstice[0].datum);
    if (zakljucen < od) continue;
    const vOddelku = vseVrstice.filter((v) => oddelekOperacije(v.operacija) === koda && v.ure > 0);
    const prviDan = vOddelku.length ? vOddelku.reduce((m, v) => (v.datum < m ? v.datum : m), vOddelku[0].datum) : null;

    const vrstice: NalogZakljucen[] = nalogi.map((n) => {
      const ure = (porPoNalogu.get(n.st_naloga) ?? []).filter((v) => oddelekOperacije(v.operacija) === koda).reduce((s, v) => s + v.ure, 0);
      const kos = kosiNalogov.get(n.st_naloga) ?? 0;
      const norm = n.koda_artikla ? normPoIdentu.get(n.koda_artikla) : undefined;
      const naKos = norm ? Number(norm[polje]) : 0;
      const normUre = naKos > 0 && kos > 0 ? naKos * kos : null;
      const izlocen = ure <= 0.005 ? "brez_stempljanja" : kos <= 0 ? "brez_kosov" : null;
      const produktivnost = !izlocen && normUre !== null ? normUre / ure : null;
      return {
        st: n.st_naloga,
        naziv: n.naziv_artikla,
        ident: n.koda_artikla,
        kos,
        normUre,
        ure,
        produktivnost,
        izlocen,
        preveri: produktivnost !== null && (produktivnost > PREVERI_NAD || produktivnost < PREVERI_POD),
      };
    });
    // krovni brez štempljanja v oddelku ni delo tega oddelka
    if (vrstice.every((v) => v.izlocen)) continue;
    const steti = vrstice.filter((v) => !v.izlocen && v.normUre !== null);
    const normUre = steti.reduce((s, v) => s + v.normUre!, 0);
    const ure = steti.reduce((s, v) => s + v.ure, 0);
    out.push({
      krovni,
      celicaId: celicaKrovnega.get(krovni)?.celicaId ?? NERAZPOREJENO,
      zakljucen,
      prviDan,
      normUre,
      ure,
      ureBrezNormativa: vrstice.filter((v) => !v.izlocen && v.normUre === null).reduce((s, v) => s + v.ure, 0),
      produktivnost: ure > 0 ? normUre / ure : null,
      // nalogi: šteti po vrsti, nato brez normativa, izločeni na koncu
      nalogi: vrstice.sort((a, b) => Number(!!a.izlocen) - Number(!!b.izlocen) || Number(a.normUre === null) - Number(b.normUre === null) || a.st.localeCompare(b.st)),
    });
  }
  return out.sort((a, b) => a.zakljucen.localeCompare(b.zakljucen) || a.krovni.localeCompare(b.krovni));
}

// =====================================================================
// IZVOZ
// =====================================================================

const datumX = (d: IsoDate | null) => (d ? new Date(`${d}T00:00:00`) : "");
const r2 = (n: number | null) => (n === null ? "" : Math.round(n * 100) / 100);

export function izvoziKontroloXlsx(vrstice: KontrolaPostavitve[], ime: string) {
  const ws = XLSX.utils.json_to_sheet(
    vrstice.map((k) => ({
      "Delovno mesto": k.celica,
      "Krovni DN": k.postavitev.krovni_dn,
      "Plan od": datumX(k.od),
      "Plan do": datumX(k.do),
      "Ure plan": r2(k.planUre),
      "Izdelano %": k.napredek ? Math.round(delezNapredka(k.napredek) * 100) : "",
      "Zaslužene ure": r2(k.zasluzeno),
      "Poročane ure": r2(k.porocano),
      "Od tega v planu": r2(k.ure.plan),
      "Pred planom": r2(k.ure.pred),
      "Po planu": r2(k.ure.po),
      Osebe: k.osebe.join(", "),
      "Produktivnost %": k.produktivnost === null ? "" : Math.round(k.produktivnost * 100),
      "Prvi dan dela": datumX(k.prviDan),
      "Zadnji dan dela": datumX(k.zadnjiDan),
    })),
    { cellDates: true, dateNF: "d. m. yyyy" },
  );
  ws["!cols"] = [18, 12, 11, 11, 10, 10, 12, 12, 12, 11, 10, 40, 14, 12, 12].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kontrola produktivnosti");
  XLSX.writeFile(wb, ime);
}

export function izvoziDeloXlsx(vrstice: PripisanoDelo[], celice: Map<number, string>, ime: string) {
  const ws = XLSX.utils.json_to_sheet(
    vrstice.map((v) => ({
      Datum: datumX(v.datum),
      "Delovno mesto": v.celicaId === NERAZPOREJENO ? "Nerazporejeno" : (celice.get(v.celicaId ?? 0) ?? ""),
      Kategorija: labelKategorije(v.kategorija),
      "Krovni DN": v.krovni ?? "",
      Nalog: v.st_naloga,
      Ident: v.ident ?? "",
      Opis: v.opis ?? "",
      Delavec: v.ime_delavca ?? v.delavec,
      Operacija: v.naziv_operacije ?? v.operacija,
      Začetek: v.zacetek ? v.zacetek.slice(11, 16) : "",
      Konec: v.konec ? v.konec.slice(11, 16) : "",
      Ure: r2(v.ure),
    })),
    { cellDates: true, dateNF: "d. m. yyyy" },
  );
  ws["!cols"] = [11, 18, 12, 10, 10, 16, 40, 22, 26, 8, 8, 8].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Poročano delo");
  XLSX.writeFile(wb, ime);
}
