import * as XLSX from "xlsx";
import { addDays, formatDayMonth, inValidity, weekday, type IsoDate } from "./dates";
import type { OddelekKoda } from "./normativi";
import { formatNum } from "./stevila";
import { getSupabase, kosi } from "./supabase";
import type { NalogIzracun } from "./zasedenost";

// =====================================================================
// TIPI
// =====================================================================

/** Delovno mesto (celica) iz rutine. */
export type Celica = {
  id: number;
  naziv: string;
  oddelek_id: number;
  vrstni_red: number;
  privzeto_zaposlenih: number;
  /** Mesto "Dodatno delo": delo izven redne proizvodnje, ne šteje v "oddelek skupaj". */
  dodatno_delo: boolean;
};

/** Planirani kosi naloga v postavitvi: kos = planirano, od = preostala količina ob vpisu (za odštevanje izdelanih). */
export type KosNaloga = { kos: number; od: number };

/** Krovni nalog na delovnem mestu od izbranega dne. Novi (neshranjeni) imajo id < 0. */
export type Postavitev = {
  id: number;
  oddelek_id: number;
  delovno_mesto_id: number;
  krovni_dn: string;
  datum_zacetka: IsoDate;
  /** Ročne ure ali zadnje znane ure nalogov (če krovnega ni v uvozu). */
  ure: number;
  opomba: string | null;
  /** Vključeni nalogi krovnega; null = vsi nalogi krovnega. */
  nalogi: string[] | null;
  /** Planirani kosi po nalogih; null / nalog brez vpisa = vsi preostali kosi. */
  kosi: Record<string, KosNaloga> | null;
  /** true: ure so vpisane ročno; false: ure = vsota ur vključenih nalogov. */
  rocne_ure: boolean;
  /** Prosta naloga (ni iz uvoza): krovni_dn = naziv naloge, ure so ročne. */
  prosta: boolean;
};

export type ZaposleniDan = { delovno_mesto_id: number; datum: IsoDate; st_zaposlenih: number };

/** Krovni nalog = skupina nalogov z istim "Krovni DN" (brez krovnega: nalog sam). */
export type Krovni = {
  kljuc: string;
  nalogi: NalogIzracun[];
  ure: number; // potrebne ure izbranega oddelka
  brezNormativa: number;
  rok: IsoDate | null; // najzgodnejši rok izdelave
  narocnik: string | null;
};

/** Izračunan razpored postavitve: ure po dnevih. */
export type Razpored = {
  dnevi: Map<IsoDate, number>;
  od: IsoDate | null;
  do: IsoDate | null;
  nerazporejeno: number; // ure, ki v obzorju niso našle kapacitete
};

const OBZORJE_DNI = 400;

// =====================================================================
// BRANJE
// =====================================================================

export async function naloziCelice(datum: IsoDate): Promise<Celica[]> {
  const { data, error } = await getSupabase()
    .from("fp_delovna_mesta")
    .select("id, naziv, oddelek_id, vrstni_red, privzeto_zaposlenih, velja_od, velja_do, dodatno_delo")
    .eq("visible", true)
    .order("vrstni_red");
  if (error) throw error;
  return (data ?? [])
    .filter((d) => inValidity(datum, d.velja_od, d.velja_do))
    .map((d) => ({
      id: d.id,
      naziv: d.naziv,
      oddelek_id: d.oddelek_id,
      vrstni_red: d.vrstni_red,
      privzeto_zaposlenih: Number(d.privzeto_zaposlenih ?? 1),
      dodatno_delo: !!d.dodatno_delo,
    }));
}

export async function naloziPostavitve(): Promise<Postavitev[]> {
  const { data, error } = await getSupabase()
    .from("fp_plan_postavitve")
    .select("id, oddelek_id, delovno_mesto_id, krovni_dn, datum_zacetka, ure, opomba, nalogi, kosi, rocne_ure, prosta")
    .eq("visible", true)
    .order("datum_zacetka")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, ure: Number(p.ure), nalogi: p.nalogi ?? null, kosi: p.kosi ?? null, rocne_ure: !!p.rocne_ure, prosta: !!p.prosta }));
}

export async function naloziZaposlene(od: IsoDate, doo: IsoDate): Promise<ZaposleniDan[]> {
  const { data, error } = await getSupabase()
    .from("fp_plan_zaposleni")
    .select("delovno_mesto_id, datum, st_zaposlenih")
    .eq("visible", true)
    .gte("datum", od)
    .lte("datum", doo);
  if (error) throw error;
  return (data ?? []).map((z) => ({ ...z, st_zaposlenih: Number(z.st_zaposlenih) }));
}

// =====================================================================
// SHRANJEVANJE
// =====================================================================

export async function shraniPlan({
  nove,
  spremenjene,
  odstranjene,
  zaposleni,
}: {
  nove: Postavitev[];
  spremenjene: Postavitev[];
  odstranjene: number[];
  zaposleni: ZaposleniDan[];
}) {
  const sb = getSupabase();
  if (nove.length) {
    const { error } = await sb.from("fp_plan_postavitve").insert(
      nove.map((p) => ({
        oddelek_id: p.oddelek_id,
        delovno_mesto_id: p.delovno_mesto_id,
        krovni_dn: p.krovni_dn,
        datum_zacetka: p.datum_zacetka,
        ure: p.ure,
        opomba: p.opomba,
        nalogi: p.nalogi,
        kosi: p.kosi,
        rocne_ure: p.rocne_ure,
        prosta: p.prosta,
      })),
    );
    if (error) throw error;
  }
  if (spremenjene.length) {
    const { error } = await sb.from("fp_plan_postavitve").upsert(spremenjene, { onConflict: "id" });
    if (error) throw error;
  }
  if (odstranjene.length) {
    const { error } = await sb.from("fp_plan_postavitve").update({ visible: false }).in("id", odstranjene);
    if (error) throw error;
  }
  for (const kos of kosi(zaposleni)) {
    const { error } = await sb.from("fp_plan_zaposleni").upsert(kos, { onConflict: "delovno_mesto_id,datum" });
    if (error) throw error;
  }
}

export async function shraniPrivzetoCelice(id: number, privzeto_zaposlenih: number) {
  const { error } = await getSupabase().from("fp_delovna_mesta").update({ privzeto_zaposlenih }).eq("id", id);
  if (error) throw error;
}

// =====================================================================
// IZRAČUN
// =====================================================================

/** Ključ krovnega naloga: Krovni DN, sicer številka naloga. */
export const krovniKljuc = (n: { krovni_dn: string | null; st_naloga: string }) => n.krovni_dn ?? n.st_naloga;

export function zdruziKrovne(izracun: NalogIzracun[], koda: OddelekKoda): Krovni[] {
  const m = new Map<string, NalogIzracun[]>();
  for (const n of izracun) {
    const k = krovniKljuc(n);
    m.set(k, [...(m.get(k) ?? []), n]);
  }
  return [...m]
    .map(([kljuc, nalogi]) => {
      const roki = nalogi.map((n) => n.rok_izdelave).filter((r): r is IsoDate => !!r).sort();
      return {
        kljuc,
        nalogi,
        ure: nalogi.reduce((s, n) => s + n.ure[koda], 0),
        brezNormativa: nalogi.filter((n) => !n.normativ).length,
        rok: roki[0] ?? null,
        narocnik: najpogostejsi(nalogi.map((n) => n.narocnik)),
      };
    })
    .sort((a, b) => (a.rok ?? "9999").localeCompare(b.rok ?? "9999") || a.kljuc.localeCompare(b.kljuc));
}

function najpogostejsi(vrednosti: (string | null)[]): string | null {
  const c = new Map<string, number>();
  for (const v of vrednosti) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Nalogi krovnega, ki jih zajame postavitev (null = vsi). */
export function nalogiPostavitve(p: Postavitev, k: Krovni | undefined): NalogIzracun[] {
  if (!k) return [];
  if (!p.nalogi) return k.nalogi;
  const s = new Set(p.nalogi);
  return k.nalogi.filter((n) => s.has(n.st_naloga));
}

/** Ure oddelka za en kos naloga. */
export const urePoKosu = (n: NalogIzracun, koda: OddelekKoda) => (n.preostala > 0 ? n.ure[koda] / n.preostala : 0);

/** Vsota ur nalogov; s `kos` samo za planirane kose (sicer vsi preostali). */
export const ureNalogov = (nalogi: NalogIzracun[], koda: OddelekKoda, kos?: (st: string) => number) =>
  round2(nalogi.reduce((s, n) => s + (kos ? urePoKosu(n, koda) * kos(n.st_naloga) : n.ure[koda]), 0));

/**
 * Ure, ki jih postavitev porabi: ročne ure ali vsota ur planiranih kosov vključenih nalogov iz zadnjega uvoza.
 * Če krovnega ni v uvozu ali so nalogi izdelani, ostanejo zadnje shranjene ure.
 */
export function urePostavitve(p: Postavitev, k: Krovni | undefined, koda: OddelekKoda, kosi?: Map<string, number>): number {
  if (p.rocne_ure || !k) return p.ure;
  const ure = ureNalogov(nalogiPostavitve(p, k), koda, kosi && ((st) => kosi.get(st) ?? 0));
  return ure > 0 ? ure : p.ure;
}

const vrstniRed = (p: Postavitev) => (p.id < 0 ? Number.MAX_SAFE_INTEGER + p.id : p.id);
/** Zgodnejši začetek prej, nato starejše postavitve. */
const poZacetku = (a: Postavitev, b: Postavitev) => a.datum_zacetka.localeCompare(b.datum_zacetka) || vrstniRed(a) - vrstniRed(b);

/**
 * Planirani kosi nalogov po postavitvah krovnega (postavitev id -> nalog -> kos).
 * Izdelani kosi (od ob vpisu - preostala zdaj) se odštejejo od najzgodnejših postavitev naloga;
 * nalog brez vpisanih kosov dobi preostale kose, ki jih ne pokrijejo druge postavitve.
 * Postavitve po urah (ročne ure brez izbire nalogov) niso zajete.
 */
export function kosiKrovnega(k: Krovni, postavitve: Postavitev[]): Map<number, Map<string, number>> {
  const svoje = postavitve
    .filter((p) => !p.prosta && p.krovni_dn === k.kljuc && !(p.rocne_ure && !p.nalogi))
    .sort(poZacetku);
  const out = new Map(svoje.map((p) => [p.id, new Map<string, number>()]));
  for (const n of k.nalogi) {
    const st = n.st_naloga;
    const vsebujejo = svoje.filter((p) => !p.nalogi || p.nalogi.includes(st));
    const delne = vsebujejo.filter((p) => p.kosi?.[st]);
    let izdelano = Math.max(0, Math.max(0, ...delne.map((p) => p.kosi![st].od)) - n.preostala);
    let prosto = n.preostala;
    for (const p of delne) {
      const plan = p.kosi![st].kos;
      const odstej = Math.min(plan, izdelano);
      izdelano -= odstej;
      const kos = Math.min(plan - odstej, prosto);
      prosto -= kos;
      out.get(p.id)!.set(st, kos);
    }
    for (const p of vsebujejo) {
      if (p.kosi?.[st]) continue;
      out.get(p.id)!.set(st, prosto);
      prosto = 0;
    }
  }
  return out;
}

export type StanjeKrovnega = {
  /** Nalogi, ki so v celoti (vsi kosi) v postavitvah. */
  razporejeni: Set<string>;
  /** Nalogi, ki še niso (ali niso v celoti) v planu. */
  ostali: NalogIzracun[];
  /** Planirani kosi po nalogih (vse postavitve). */
  planKosi: Map<string, number>;
  /** Nerazporejeni kosi po nalogih. */
  prostiKosi: Map<string, number>;
  /** Nerazporejene ure oddelka. */
  ostane: number;
  /** Krovni ima postavitev z ročnimi urami brez izbire nalogov (razporejanje po urah, kot prej). */
  poUrah: boolean;
};

/** Kateri nalogi (in kosi) krovnega so že v planu in koliko ur ostane (postavitve istega oddelka). */
export function stanjeKrovnega(k: Krovni, postavitve: Postavitev[], koda: OddelekKoda): StanjeKrovnega {
  const urne = postavitve.filter((p) => !p.prosta && p.krovni_dn === k.kljuc && !p.nalogi && p.rocne_ure);
  const planKosi = new Map<string, number>();
  for (const m of kosiKrovnega(k, postavitve).values())
    for (const [st, kos] of m) planKosi.set(st, (planKosi.get(st) ?? 0) + kos);
  const prostiKosi = new Map(k.nalogi.map((n) => [n.st_naloga, Math.max(0, n.preostala - (planKosi.get(n.st_naloga) ?? 0))]));
  const razporejeni = new Set(
    k.nalogi.filter((n) => planKosi.has(n.st_naloga) && prostiKosi.get(n.st_naloga)! <= 0).map((n) => n.st_naloga),
  );
  const ostali = k.nalogi.filter((n) => !razporejeni.has(n.st_naloga));
  const ureUrnih = urne.reduce((s, p) => s + p.ure, 0);
  const ureOstalih = ureNalogov(ostali, koda, (st) => prostiKosi.get(st) ?? 0);
  return { razporejeni, ostali, planKosi, prostiKosi, ostane: Math.max(0, round2(ureOstalih - ureUrnih)), poUrah: urne.length > 0 };
}

export const jeDelovniDan = (d: IsoDate) => weekday(d) <= 5;

/**
 * Razporedi postavitve po dnevih glede na kapaciteto celic.
 * Na isti celici imajo prednost postavitve z zgodnejšim začetkom (nato starejše);
 * vsaka porabi prosto kapaciteto od svojega začetka naprej, dokler ne porabi vseh ur.
 */
export function razporedi(
  postavitve: Postavitev[],
  kapaciteta: (celicaId: number, datum: IsoDate) => number,
): { razpored: Map<number, Razpored>; zasedeno: Map<string, number> } {
  const zasedeno = new Map<string, number>(); // `${celica}|${datum}` -> ure
  const razpored = new Map<number, Razpored>();
  const urejene = [...postavitve].sort(poZacetku);
  for (const p of urejene) {
    const dnevi = new Map<IsoDate, number>();
    let ostanek = p.ure;
    let d = p.datum_zacetka;
    for (let i = 0; ostanek > 1e-6 && i < OBZORJE_DNI; i++, d = addDays(d, 1)) {
      const kljuc = `${p.delovno_mesto_id}|${d}`;
      const prosto = kapaciteta(p.delovno_mesto_id, d) - (zasedeno.get(kljuc) ?? 0);
      if (prosto <= 1e-6) continue;
      const ure = Math.min(prosto, ostanek);
      dnevi.set(d, ure);
      zasedeno.set(kljuc, (zasedeno.get(kljuc) ?? 0) + ure);
      ostanek -= ure;
    }
    const kljuci = [...dnevi.keys()];
    razpored.set(p.id, {
      dnevi,
      od: kljuci[0] ?? null,
      do: kljuci[kljuci.length - 1] ?? null,
      nerazporejeno: Math.max(0, ostanek),
    });
  }
  return { razpored, zasedeno };
}

// =====================================================================
// IZVOZ
// =====================================================================

export function izvoziPlanXlsx(
  vrstice: { celica: string; postavitev: Postavitev; razpored?: Razpored; krovni?: Krovni; kosi?: Map<string, number> }[],
  ime: string,
) {
  const datum = (d: IsoDate | null | undefined) => (d ? new Date(`${d}T00:00:00`) : "");
  const ws = XLSX.utils.json_to_sheet(
    vrstice.map(({ celica, postavitev: p, razpored: r, krovni: k, kosi }) => ({
      "Delovno mesto": celica,
      "Krovni DN": p.krovni_dn,
      "Št. nalogov": k ? `${nalogiPostavitve(p, k).length}/${k.nalogi.length}` : "",
      Nalogi: p.nalogi ? p.nalogi.map((st) => (p.kosi?.[st] ? `${st} (${kosi?.get(st) ?? p.kosi[st].kos} kos)` : st)).join(", ") : "vsi",
      Naročnik: k?.narocnik ?? "",
      "Rok izdelave": datum(k?.rok),
      "Plan od": datum(r?.od),
      "Plan do": datum(r?.do),
      "Ure plan": p.ure,
      Opomba: p.opomba ?? "",
    })),
    { cellDates: true, dateNF: "d. m. yyyy" },
  );
  ws["!cols"] = [22, 14, 10, 30, 30, 12, 12, 12, 10, 30].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Delovni plan");
  XLSX.writeFile(wb, ime);
}

// =====================================================================
// WORKFLOW (PDF / Word) - zaporedje krovnih nalogov po delovnih mestih
// =====================================================================

export type WorkflowNalog = {
  st_naloga: string;
  ident: string;
  naziv: string | null;
  /** Planirani kosi v postavitvi. */
  kos: number | null;
  /** Vsi preostali kosi naloga (večje od kos = delni nalog). */
  kosVseh: number | null;
  /** Datumi odprem naročil, ki jih pokrije nalog (FIFO kot na Prioritetah), naraščajoče. */
  odpreme: IsoDate[];
};

export type WorkflowKorak = {
  krovni: string;
  narocnik: string | null;
  od: IsoDate;
  do: IsoDate;
  ure: number;
  /** Vseh nalogov krovnega v uvozu; null = krovnega ni v zadnjem uvozu. */
  vseh: number | null;
  /** V postavitvi je samo del nalogov krovnega. */
  delni: boolean;
  /** Prosta naloga na mestu Dodatno delo (ni iz uvoza). */
  prosta: boolean;
  nalogi: WorkflowNalog[];
  /** Najzgodnejša odprema med nalogi koraka. */
  prvaOdprema: IsoDate | null;
  /** Plan se konča po najzgodnejši odpremi. */
  poOdpremi: boolean;
  brezKapacitete: number;
  opomba: string | null;
  /** Planirane osebe po dnevih plana (ure dneva / ure na dan), poravnano z WorkflowPlan.dnevi. */
  osebe: number[];
};

export type WorkflowCelica = {
  naziv: string;
  zaposleni: number;
  /** Zaposleni na celici po dnevih plana, poravnano z WorkflowPlan.dnevi. */
  zaposleniPoDnevih: number[];
  koraki: WorkflowKorak[];
};
export type WorkflowPlan = { oddelek: string; od: IsoDate; do: IsoDate; dnevi: IsoDate[]; celice: WorkflowCelica[] };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Postavitve, ki so v prikazanih dnevih, po delovnih mestih v vrstnem redu začetka (za PDF / Word workflow). */
export function pripraviWorkflow({
  oddelek,
  celice,
  postavitve,
  razpored,
  krovniPoKljucu,
  kosiPostavitev,
  dnevi,
  ureNaDan,
  zaposleni,
  odpreme,
}: {
  oddelek: string;
  celice: Celica[];
  postavitve: Postavitev[];
  razpored: Map<number, Razpored>;
  krovniPoKljucu: Map<string, Krovni>;
  /** Planirani kosi nalogov po postavitvah (kosiKrovnega). */
  kosiPostavitev: Map<number, Map<string, number>>;
  /** Prikazani (delovni) dnevi, naraščajoče. */
  dnevi: IsoDate[];
  ureNaDan: number;
  zaposleni: (celicaId: number, datum: IsoDate) => number;
  /** Datumi odprem po številkah nalogov (FIFO dodelitev naročil). */
  odpreme: Map<string, IsoDate[]>;
}): WorkflowPlan {
  const od = dnevi[0];
  const doo = dnevi[dnevi.length - 1];
  return {
    oddelek,
    od,
    do: doo,
    dnevi,
    celice: celice
      .map((c) => ({
        naziv: c.naziv,
        zaposleni: c.privzeto_zaposlenih,
        zaposleniPoDnevih: dnevi.map((d) => (jeDelovniDan(d) ? zaposleni(c.id, d) : 0)),
        koraki: postavitve
          .filter((p) => p.delovno_mesto_id === c.id)
          .map((p) => ({ p, r: razpored.get(p.id) }))
          .filter((x): x is { p: Postavitev; r: Razpored & { od: IsoDate; do: IsoDate } } => !!x.r?.od && !!x.r.do && x.r.od <= doo && x.r.do >= od)
          .sort((a, b) => a.r.od.localeCompare(b.r.od) || a.r.do.localeCompare(b.r.do))
          .map(({ p, r }): WorkflowKorak => {
            const k = p.prosta ? undefined : krovniPoKljucu.get(p.krovni_dn);
            const kosi = kosiPostavitev.get(p.id);
            const nalogi: WorkflowNalog[] = k
              ? nalogiPostavitve(p, k).map((n) => ({
                  st_naloga: n.st_naloga,
                  ident: n.koda_artikla,
                  naziv: n.naziv_artikla,
                  kos: kosi?.get(n.st_naloga) ?? n.preostala,
                  kosVseh: n.preostala,
                  odpreme: odpreme.get(n.st_naloga) ?? [],
                }))
              : (p.nalogi ?? []).map((st) => ({ st_naloga: st, ident: "", naziv: null, kos: null, kosVseh: null, odpreme: odpreme.get(st) ?? [] }));
            const prvaOdprema = nalogi.flatMap((n) => n.odpreme.slice(0, 1)).sort()[0] ?? null;
            return {
              krovni: p.krovni_dn,
              narocnik: k?.narocnik ?? null,
              od: r.od,
              do: r.do,
              ure: p.ure,
              vseh: k ? k.nalogi.length : null,
              delni: !!k && ((!!p.nalogi && nalogi.length < k.nalogi.length) || nalogi.some((n) => (n.kos ?? 0) < (n.kosVseh ?? 0))),
              prosta: p.prosta,
              nalogi,
              prvaOdprema,
              poOdpremi: !!prvaOdprema && r.do > prvaOdprema,
              brezKapacitete: r.nerazporejeno,
              opomba: p.opomba,
              osebe: dnevi.map((d) => (ureNaDan > 0 ? round1((r.dnevi.get(d) ?? 0) / ureNaDan) : 0)),
            };
          }),
      }))
      .filter((c) => c.koraki.length > 0),
  };
}

const DAN_KRATKO = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];
/** "Pon 20. 10." */
export const danInDatum = (d: IsoDate) => `${DAN_KRATKO[weekday(d) - 1]} ${formatDayMonth(d)}`;
/** "Pon" */
export const danKratko = (d: IsoDate) => DAN_KRATKO[weekday(d) - 1];
/** Barve celic v prerazporeditvi zaposlenih (hex, z belim besedilom; zelena je rezervirana za proste ljudi). */
export const BARVE_CELIC = ["CA5010", "2563EB", "7C3AED", "0F766E", "DB2777", "4338CA", "B45309", "0E7490", "9F1239", "475569"];
export const barvaCelice = (i: number) => BARVE_CELIC[i % BARVE_CELIC.length];
/** Nalogi koraka "(2/5)"; če krovnega ni v uvozu, samo število; prosta naloga brez. */
export const nalogiKoraka = (k: { nalogi: unknown[]; vseh: number | null; prosta: boolean }) =>
  k.prosta ? "" : `(${k.vseh === null ? k.nalogi.length : `${k.nalogi.length}/${k.vseh}`})`;
/** Značka koraka: dodatno delo / ni v uvozu / delni / cel krovni. */
export const oznakaKoraka = (k: WorkflowKorak) =>
  k.prosta ? "dodatno delo" : k.vseh === null ? "ni v uvozu" : k.delni ? `${k.nalogi.length}/${k.vseh} nalogov` : `cel krovni · ${k.vseh}`;
/** "40 kos" ali "40/100 kos", če je planiran samo del kosov naloga. */
export const besediloKosov = (n: { kos: number | null; kosVseh: number | null }) =>
  n.kos === null ? "" : n.kosVseh !== null && n.kos < n.kosVseh ? `${formatNum(n.kos)}/${formatNum(n.kosVseh)} kos` : `${formatNum(n.kos)} kos`;
/** "24.10" */
export const ddmm = (d: IsoDate) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
/** Datumi odprem "24.10, 31.10" (največ `najvec`, nato "+n"). */
export function besediloOdprem(datumi: IsoDate[], najvec = 8) {
  const t = datumi.slice(0, najvec).map(ddmm).join(", ");
  return datumi.length > najvec ? `${t} +${datumi.length - najvec}` : t;
}
