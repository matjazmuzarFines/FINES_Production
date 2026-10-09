// Change management: tedenski napredek vodij po področjih.
// Vsak teden se za področje vpiše sprememba v odstotnih točkah (+0,5, +1, -0,5 ...) s komentarjem.
// Graf je seštevek sprememb od začetka (ponedeljek začetka = 0 %).

import { addDays, formatDayMonth, fromIso, mondayOf, toIso, type IsoDate } from "./dates";
import { getSupabase } from "./supabase";

export type CmVodja = { id: number; koda: string; naziv: string; zacetek: IsoDate; vrstni_red: number };
export type CmPodrocje = {
  id: number;
  koda: string;
  naziv: string;
  vrstni_red: number;
  /** Barva področja (infografika "Upravljanje sprememb"). */
  barva: string;
  geslo: string | null;
  /** Na čem se dela - ena točka v vrstici. */
  tocke: string | null;
  pricakovanja: string | null;
  /** Cilj v % (v 3 mesecih). */
  cilj: number;
  /** Sklop, po katerem se področja združujejo (npr. Skladišče); null = brez sklopa. */
  sklop: string | null;
};

/** Barve črt vodij: osnovna (točke, legenda), svetla = raste, temna = pada. Siva = brez spremembe. */
export type BarvaVodje = { osnovna: string; raste: string; pada: string };
const BARVE_VODIJ: Record<string, BarvaVodje> = {
  VP: { osnovna: "#1f6fb8", raste: "#4aa3f0", pada: "#0b3a66" },
  VM: { osnovna: "#e36f1e", raste: "#f59a4a", pada: "#9a3d0a" },
  VO: { osnovna: "#7c4dcc", raste: "#a383e6", pada: "#4b2a8a" },
};
export const BARVA_RAVNO = "#8a8a92";
export const barvaVodje = (koda: string): BarvaVodje => BARVE_VODIJ[koda] ?? BARVE_VODIJ.VO;
export type CmOcena = {
  id: number;
  vodja_id: number;
  podrocje_id: number;
  teden: IsoDate;
  sprememba: number;
  komentar: string;
};

export type CmPodatki = {
  vodje: CmVodja[];
  podrocja: CmPodrocje[];
  /** Področja posameznega vodje (po vrstnem redu). */
  podrocjaVodje: Map<number, CmPodrocje[]>;
  ocene: CmOcena[];
};

/** Graf privzeto pokaže vsaj 3 mesece (13 tednov), potem se podaljšuje. */
export const PRIKAZ_TEDNOV = 13;
/** Privzeti cilj v % v 3 mesecih. */
export const PRIVZETI_CILJ = 40;

export async function naloziCm(): Promise<CmPodatki> {
  const sb = getSupabase();
  const [v, p, ln, o] = await Promise.all([
    sb.from("fp_cm_vodje").select("id, koda, naziv, zacetek, vrstni_red").eq("visible", true).order("vrstni_red"),
    // "*": stran deluje tudi pred migracijo 005 (barva, geslo, točke, cilj)
    sb.from("fp_cm_podrocja").select("*").eq("visible", true).order("vrstni_red"),
    sb.from("ln_fp_cm_vodje_podrocja").select("vodja_id, podrocje_id, vrstni_red").eq("visible", true).order("vrstni_red"),
    sb
      .from("fp_cm_ocene")
      .select("id, vodja_id, podrocje_id, teden, sprememba, komentar")
      .eq("visible", true)
      .order("teden"),
  ]);
  const napaka = v.error ?? p.error ?? ln.error ?? o.error;
  if (napaka) throw new Error(napaka.message);

  const podrocja: CmPodrocje[] = (p.data ?? []).map((x) => ({
    id: x.id,
    koda: x.koda,
    naziv: x.naziv,
    vrstni_red: x.vrstni_red,
    barva: x.barva ?? "#ca5010",
    geslo: x.geslo ?? null,
    tocke: x.tocke ?? null,
    pricakovanja: x.pricakovanja ?? null,
    cilj: x.cilj === undefined || x.cilj === null ? PRIVZETI_CILJ : Number(x.cilj),
    sklop: x.sklop ?? null,
  }));
  const poId = new Map(podrocja.map((x) => [x.id, x]));
  const podrocjaVodje = new Map<number, CmPodrocje[]>();
  for (const l of ln.data ?? []) {
    const pod = poId.get(l.podrocje_id);
    if (!pod) continue;
    const seznam = podrocjaVodje.get(l.vodja_id) ?? [];
    seznam.push(pod);
    podrocjaVodje.set(l.vodja_id, seznam);
  }
  return {
    vodje: (v.data ?? []) as CmVodja[],
    podrocja,
    podrocjaVodje,
    ocene: ((o.data ?? []) as CmOcena[]).map((x) => ({ ...x, sprememba: Number(x.sprememba) })),
  };
}

/** Vpis za en teden enega področja. Prazna sprememba (null) = odstrani obstoječi vpis. */
export type CmVnos = {
  podrocje_id: number;
  sprememba: number | null;
  komentar: string;
  /** Obstoječi vpis tega tedna (če obstaja). */
  obstojeci?: CmOcena;
};

export async function shraniTeden(vodjaId: number, teden: IsoDate, vnosi: CmVnos[]) {
  const sb = getSupabase();
  for (const v of vnosi) {
    const o = v.obstojeci;
    if (v.sprememba === null) {
      // Podatkov ne brišemo - vpis skrijemo.
      if (o) {
        const { error } = await sb.from("fp_cm_ocene").update({ visible: false }).eq("id", o.id);
        if (error) throw new Error(error.message);
      }
      continue;
    }
    const komentar = v.komentar.trim();
    if (o) {
      if (o.sprememba === v.sprememba && o.komentar === komentar) continue;
      const { error } = await sb.from("fp_cm_ocene").update({ sprememba: v.sprememba, komentar }).eq("id", o.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("fp_cm_ocene")
        .insert({ vodja_id: vodjaId, podrocje_id: v.podrocje_id, teden, sprememba: v.sprememba, komentar });
      if (error) throw new Error(error.message);
    }
  }
}

/** Cilji in opis področja (urejanje pod grafom). */
export async function shraniPodrocje(
  id: number,
  v: Pick<CmPodrocje, "geslo" | "tocke" | "pricakovanja" | "cilj">,
) {
  const { error } = await getSupabase().from("fp_cm_podrocja").update(v).eq("id", id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// TEDNI
// =====================================================================

/** Zaporedna številka tedna od začetka (teden začetka = 1). */
export function tedenSt(zacetek: IsoDate, iso: IsoDate): number {
  const dni = Math.round((fromIso(mondayOf(iso)).getTime() - fromIso(zacetek).getTime()) / 86400000);
  return Math.floor(dni / 7) + 1;
}

/** Ponedeljek n-tega tedna. */
export const tedenOd = (zacetek: IsoDate, n: number): IsoDate => addDays(zacetek, (n - 1) * 7);

/** "5. 10. – 9. 10." (delovni teden) */
export const tedenObdobje = (zacetek: IsoDate, n: number) =>
  `${formatDayMonth(tedenOd(zacetek, n))} – ${formatDayMonth(addDays(tedenOd(zacetek, n), 4))}`;

/** Trenutni teden (vsaj 1). */
export const trenutniTeden = (zacetek: IsoDate) => Math.max(1, tedenSt(zacetek, toIso(new Date())));

// =====================================================================
// SERIJA ZA GRAF
// =====================================================================

export type CmTocka = {
  /** 0 = začetek (0 %), n = po oceni n-tega tedna. */
  teden: number;
  skupaj: number;
  /** Vpis tega tedna (če obstaja). */
  ocena?: CmOcena;
};

/** Kumulativna serija od začetka do zadnjega tedna z vpisom. Tedni brez vpisa = brez spremembe. */
export function serija(zacetek: IsoDate, ocene: CmOcena[]): CmTocka[] {
  const poTednu = new Map(ocene.map((o) => [tedenSt(zacetek, o.teden), o]));
  const zadnji = Math.max(0, ...poTednu.keys());
  const tocke: CmTocka[] = [{ teden: 0, skupaj: 0 }];
  let skupaj = 0;
  for (let n = 1; n <= zadnji; n++) {
    const ocena = poTednu.get(n);
    skupaj += ocena?.sprememba ?? 0;
    tocke.push({ teden: n, skupaj: Math.round(skupaj * 100) / 100, ocena });
  }
  return tocke;
}

const fmtPct = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2, signDisplay: "exceptZero" });

/** "+1,5 %", "-0,5 %", "0 %" */
export const formatPct = (n: number) => `${fmtPct.format(n)} %`;
