import * as XLSX from "xlsx";
import { addDays, inValidity, weekday, type IsoDate } from "./dates";
import type { OddelekKoda } from "./normativi";
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
};

/** Krovni nalog na delovnem mestu od izbranega dne. Novi (neshranjeni) imajo id < 0. */
export type Postavitev = {
  id: number;
  oddelek_id: number;
  delovno_mesto_id: number;
  krovni_dn: string;
  datum_zacetka: IsoDate;
  ure: number;
  opomba: string | null;
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
    .select("id, naziv, oddelek_id, vrstni_red, privzeto_zaposlenih, velja_od, velja_do")
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
    }));
}

export async function naloziPostavitve(): Promise<Postavitev[]> {
  const { data, error } = await getSupabase()
    .from("fp_plan_postavitve")
    .select("id, oddelek_id, delovno_mesto_id, krovni_dn, datum_zacetka, ure, opomba")
    .eq("visible", true)
    .order("datum_zacetka")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, ure: Number(p.ure) }));
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
  const vrstni = (p: Postavitev) => (p.id < 0 ? Number.MAX_SAFE_INTEGER + p.id : p.id);
  const urejene = [...postavitve].sort(
    (a, b) => a.datum_zacetka.localeCompare(b.datum_zacetka) || vrstni(a) - vrstni(b),
  );
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
  vrstice: { celica: string; postavitev: Postavitev; razpored?: Razpored; krovni?: Krovni }[],
  ime: string,
) {
  const datum = (d: IsoDate | null | undefined) => (d ? new Date(`${d}T00:00:00`) : "");
  const ws = XLSX.utils.json_to_sheet(
    vrstice.map(({ celica, postavitev: p, razpored: r, krovni: k }) => ({
      "Delovno mesto": celica,
      "Krovni DN": p.krovni_dn,
      "Št. nalogov": k?.nalogi.length ?? "",
      Naročnik: k?.narocnik ?? "",
      "Rok izdelave": datum(k?.rok),
      "Plan od": datum(r?.od),
      "Plan do": datum(r?.do),
      "Ure plan": p.ure,
      Opomba: p.opomba ?? "",
    })),
    { cellDates: true, dateNF: "d. m. yyyy" },
  );
  ws["!cols"] = [22, 14, 10, 30, 12, 12, 12, 10, 30].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Delovni plan");
  XLSX.writeFile(wb, ime);
}
