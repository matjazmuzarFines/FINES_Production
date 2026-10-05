import { getSupabase, SLIKE_BUCKET } from "./supabase";
import { calendarWorkdays, inValidity, monthEnd, monthStart, todayWorkday, type IsoDate } from "./dates";

// =====================================================================
// SKUPNO
// =====================================================================

export type DanStatus = "OK" | "NOK" | "NEIZPOLNJENO" | "PRAZNO" | "PRIHODNJE";

export type DanPovzetek = {
  datum: IsoDate;
  aktivnih: number;
  izpolnjenih: number;
  status: DanStatus;
};

type StatusRow = { datum: IsoDate; kljuc: number; izpolnjeno: boolean; ima_odstopanje: boolean };

/** Status dneva - enaka logika kot v Power Appu (koledar na domači strani). */
export function povzetekDneva(datum: IsoDate, aktivniKljuci: number[], rows: StatusRow[]): DanPovzetek {
  const dnevni = rows.filter((r) => r.datum === datum && aktivniKljuci.includes(r.kljuc));
  const izpolnjenih = dnevni.filter((r) => r.izpolnjeno).length;
  const nok = dnevni.some((r) => r.ima_odstopanje);
  const aktivnih = aktivniKljuci.length;

  let status: DanStatus;
  if (aktivnih === 0) status = "PRAZNO";
  else if (izpolnjenih < aktivnih) status = datum > todayWorkday() && izpolnjenih === 0 ? "PRIHODNJE" : "NEIZPOLNJENO";
  else status = nok ? "NOK" : "OK";

  return { datum, aktivnih, izpolnjenih, status };
}

async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await getSupabase().storage.from(SLIKE_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

async function uploadSlika(path: string, blob: Blob) {
  const { error } = await getSupabase().storage
    .from(SLIKE_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
}

async function removeSlika(path: string) {
  // Slike se brišejo (prostor). Napaka pri brisanju stare slike ne ustavi shranjevanja.
  await getSupabase().storage.from(SLIKE_BUCKET).remove([path]);
}

const compact = (iso: IsoDate) => iso.replaceAll("-", "");

// =====================================================================
// PROIZVODNJA
// =====================================================================

export const PR_PODROCJA = ["PLAN", "UREJENOST", "KAKOVOST", "PROCES"] as const;
export type PrPodrocje = (typeof PR_PODROCJA)[number];

export type DelovnoMesto = {
  id: number;
  naziv: string;
  oddelek: string;
  vrstni_red: number;
  rutina_aktivna: boolean;
  velja_od: string | null;
  velja_do: string | null;
};

export type PrOdgovori = {
  plan_pripravljen: "DA" | "NE" | null;
  delovno_mesto_urejeno: "DA" | "NE" | null;
  kakovost_izdelka: number | null;
  ocena_procesa: number | null;
  komentar: string | null;
};

export type PrRutinaZapis = PrOdgovori & {
  id: number;
  datum: IsoDate;
  delovno_mesto_id: number;
  izpolnjeno: boolean;
  ima_odstopanje: boolean;
};

export type PrSlika = { id: number; rutina_id: number; podrocje: PrPodrocje; storage_path: string; url?: string };

export async function naloziDelovnaMesta(): Promise<DelovnoMesto[]> {
  const { data, error } = await getSupabase()
    .from("fp_delovna_mesta")
    .select("id, naziv, vrstni_red, rutina_aktivna, velja_od, velja_do, oddelek:fp_oddelki(naziv)")
    .eq("visible", true)
    .order("vrstni_red");
  if (error) throw error;
  return (data ?? []).map((d) => {
    const odd = d.oddelek as unknown as { naziv: string } | { naziv: string }[] | null;
    return {
      ...d,
      oddelek: (Array.isArray(odd) ? odd[0]?.naziv : odd?.naziv) ?? "",
    } as DelovnoMesto;
  });
}

export function aktivnaDelovnaMesta(mesta: DelovnoMesto[], datum: IsoDate) {
  return mesta.filter((m) => m.rutina_aktivna && inValidity(datum, m.velja_od, m.velja_do));
}

export async function naloziPrRutino(od: IsoDate, doo: IsoDate): Promise<PrRutinaZapis[]> {
  const { data, error } = await getSupabase()
    .from("fp_pr_rutina")
    .select(
      "id, datum, delovno_mesto_id, plan_pripravljen, delovno_mesto_urejeno, kakovost_izdelka, ocena_procesa, komentar, izpolnjeno, ima_odstopanje",
    )
    .eq("visible", true)
    .gte("datum", od)
    .lte("datum", doo);
  if (error) throw error;
  return (data ?? []) as PrRutinaZapis[];
}

export async function naloziPrSlike(datum: IsoDate): Promise<PrSlika[]> {
  const { data, error } = await getSupabase()
    .from("fp_pr_rutina_slike")
    .select("id, rutina_id, podrocje, storage_path, rutina:fp_pr_rutina!inner(datum)")
    .eq("visible", true)
    .eq("rutina.datum", datum);
  if (error) throw error;
  const slike = (data ?? []) as unknown as PrSlika[];
  const urls = await signedUrls(slike.map((s) => s.storage_path));
  return slike.map(({ id, rutina_id, podrocje, storage_path }) => ({
    id,
    rutina_id,
    podrocje,
    storage_path,
    url: urls[storage_path],
  }));
}

export function prMesecPovzetek(mesec: IsoDate, mesta: DelovnoMesto[], rutina: PrRutinaZapis[]) {
  const rows = rutina.map((r) => ({ ...r, kljuc: r.delovno_mesto_id }));
  return calendarWorkdays(mesec)
    .filter((d) => d >= monthStart(mesec) && d <= monthEnd(mesec))
    .map((d) => povzetekDneva(d, aktivnaDelovnaMesta(mesta, d).map((m) => m.id), rows));
}

export function prImaOdstopanje(o: PrOdgovori) {
  return (
    o.plan_pripravljen === "NE" ||
    o.delovno_mesto_urejeno === "NE" ||
    (o.kakovost_izdelka !== null && o.kakovost_izdelka <= 2) ||
    (o.ocena_procesa !== null && o.ocena_procesa <= 2)
  );
}

export function prPodrocjeNok(o: PrOdgovori, p: PrPodrocje) {
  switch (p) {
    case "PLAN":
      return o.plan_pripravljen === "NE";
    case "UREJENOST":
      return o.delovno_mesto_urejeno === "NE";
    case "KAKOVOST":
      return o.kakovost_izdelka !== null && o.kakovost_izdelka <= 2;
    case "PROCES":
      return o.ocena_procesa !== null && o.ocena_procesa <= 2;
  }
}

export type PrNovaSlika = { delovnoMestoId: number; podrocje: PrPodrocje; blob: Blob };

/**
 * Shrani spremenjene zapise in nove slike.
 * izpolnjeno / ima_odstopanje / odstopanja izračuna baza (triggerji).
 */
export async function shraniPrRutino(
  datum: IsoDate,
  spremembe: { delovnoMestoId: number; odgovori: PrOdgovori }[],
  noveSlike: PrNovaSlika[],
  obstojeceSlike: PrSlika[],
  obstojeciZapisi: PrRutinaZapis[],
) {
  const sb = getSupabase();

  // Zapis rutine mora obstajati tudi, če je dodana samo slika.
  const vrstice = new Map<number, PrOdgovori>();
  for (const s of spremembe) vrstice.set(s.delovnoMestoId, s.odgovori);
  for (const s of noveSlike) {
    if (!vrstice.has(s.delovnoMestoId)) {
      const obst = obstojeciZapisi.find((z) => z.delovno_mesto_id === s.delovnoMestoId);
      vrstice.set(s.delovnoMestoId, {
        plan_pripravljen: obst?.plan_pripravljen ?? null,
        delovno_mesto_urejeno: obst?.delovno_mesto_urejeno ?? null,
        kakovost_izdelka: obst?.kakovost_izdelka ?? null,
        ocena_procesa: obst?.ocena_procesa ?? null,
        komentar: obst?.komentar ?? null,
      });
    }
  }
  if (vrstice.size === 0) return;

  const { data: shranjeni, error } = await sb
    .from("fp_pr_rutina")
    .upsert(
      [...vrstice].map(([delovno_mesto_id, o]) => ({ datum, delovno_mesto_id, ...o })),
      { onConflict: "datum,delovno_mesto_id" },
    )
    .select("id, delovno_mesto_id");
  if (error) throw error;

  const idPoMestu = new Map((shranjeni ?? []).map((r) => [r.delovno_mesto_id as number, r.id as number]));
  const napakeSlik: string[] = [];

  for (const s of noveSlike) {
    const rutinaId = idPoMestu.get(s.delovnoMestoId);
    if (!rutinaId) continue;
    const path = `pr/${compact(datum)}/${compact(datum)}-${s.delovnoMestoId}-${s.podrocje}-${Date.now()}.jpg`;
    try {
      await uploadSlika(path, s.blob);
      const stara = obstojeceSlike.find((x) => x.rutina_id === rutinaId && x.podrocje === s.podrocje);
      const { error: e } = await sb
        .from("fp_pr_rutina_slike")
        .upsert(
          { rutina_id: rutinaId, podrocje: s.podrocje, storage_path: path, visible: true },
          { onConflict: "rutina_id,podrocje" },
        );
      if (e) throw e;
      if (stara && stara.storage_path !== path) await removeSlika(stara.storage_path);
    } catch {
      napakeSlik.push(s.podrocje);
    }
  }
  if (napakeSlik.length) {
    throw new Error(`Rutina je shranjena, vendar ${napakeSlik.length} slik ni bilo mogoče naložiti. Poskusi znova.`);
  }
}

// =====================================================================
// SKLADIŠČE
// =====================================================================

export type KontrolnaTocka = {
  id: number;
  koda: string;
  naziv: string;
  vprasanje: string;
  navodilo: string | null;
  sekcija: string;
  vrstni_red: number;
  cas_kontrole: string | null;
  tip_vnosa: "DA_NE" | "PROCENT";
  ciljni_procent: number | null;
  opis_obvezen_pri_nok: boolean;
  slika_obvezna_pri_nok: boolean;
  casovne_izgube_omogocene: boolean;
  aktivna: boolean;
  velja_od: string | null;
  velja_do: string | null;
};

export type SklOdgovori = {
  odgovor: "DA" | "NE" | null;
  dosezen_procent: number | null;
  komentar: string | null;
  casovne_izgube_min: number;
};

export type SklRutinaZapis = SklOdgovori & {
  id: number;
  datum: IsoDate;
  kontrolna_tocka_id: number;
  ciljni_procent: number | null;
  izpolnjeno: boolean;
  ima_odstopanje: boolean;
};

export type SklSlika = { id: number; rutina_id: number; storage_path: string; url?: string };

export async function naloziKontrolneTocke(): Promise<KontrolnaTocka[]> {
  const { data, error } = await getSupabase()
    .from("fp_skl_kontrolne_tocke")
    .select("*, sekcija:fp_skl_sekcije(naziv)")
    .eq("visible", true)
    .order("vrstni_red");
  if (error) throw error;
  return (data ?? []).map((d) => {
    const s = d.sekcija as { naziv: string } | { naziv: string }[] | null;
    return {
      ...d,
      sekcija: (Array.isArray(s) ? s[0]?.naziv : s?.naziv) ?? "",
      cas_kontrole: d.cas_kontrole ? String(d.cas_kontrole).slice(0, 5) : null,
    } as KontrolnaTocka;
  });
}

export function aktivneTocke(tocke: KontrolnaTocka[], datum: IsoDate) {
  return tocke.filter((t) => t.aktivna && inValidity(datum, t.velja_od, t.velja_do));
}

export async function naloziSklRutino(od: IsoDate, doo: IsoDate): Promise<SklRutinaZapis[]> {
  const { data, error } = await getSupabase()
    .from("fp_skl_rutina")
    .select(
      "id, datum, kontrolna_tocka_id, ciljni_procent, odgovor, dosezen_procent, komentar, casovne_izgube_min, izpolnjeno, ima_odstopanje",
    )
    .eq("visible", true)
    .gte("datum", od)
    .lte("datum", doo);
  if (error) throw error;
  return (data ?? []) as SklRutinaZapis[];
}

export async function naloziSklSlike(datum: IsoDate): Promise<SklSlika[]> {
  const { data, error } = await getSupabase()
    .from("fp_skl_rutina_slike")
    .select("id, rutina_id, storage_path, rutina:fp_skl_rutina!inner(datum)")
    .eq("visible", true)
    .eq("rutina.datum", datum);
  if (error) throw error;
  const slike = (data ?? []) as unknown as SklSlika[];
  const urls = await signedUrls(slike.map((s) => s.storage_path));
  return slike.map(({ id, rutina_id, storage_path }) => ({ id, rutina_id, storage_path, url: urls[storage_path] }));
}

export function sklMesecPovzetek(mesec: IsoDate, tocke: KontrolnaTocka[], rutina: SklRutinaZapis[]) {
  const rows = rutina.map((r) => ({ ...r, kljuc: r.kontrolna_tocka_id }));
  return calendarWorkdays(mesec)
    .filter((d) => d >= monthStart(mesec) && d <= monthEnd(mesec))
    .map((d) => povzetekDneva(d, aktivneTocke(tocke, d).map((t) => t.id), rows));
}

export function sklIzpolnjeno(t: KontrolnaTocka, o: SklOdgovori) {
  return t.tip_vnosa === "DA_NE" ? o.odgovor !== null : (o.dosezen_procent ?? 0) > 0;
}

export function sklImaOdstopanje(t: KontrolnaTocka, o: SklOdgovori, cilj: number | null) {
  if (t.tip_vnosa === "DA_NE") return o.odgovor === "NE";
  const p = o.dosezen_procent ?? 0;
  return p > 0 && cilj !== null && p < cilj;
}

export type SklNovaSlika = { kontrolnaTockaId: number; blob: Blob };

export async function shraniSklRutino(
  datum: IsoDate,
  spremembe: { kontrolnaTockaId: number; odgovori: SklOdgovori }[],
  noveSlike: SklNovaSlika[],
  obstojeceSlike: SklSlika[],
  obstojeciZapisi: SklRutinaZapis[],
) {
  const sb = getSupabase();

  const vrstice = new Map<number, SklOdgovori>();
  for (const s of spremembe) vrstice.set(s.kontrolnaTockaId, s.odgovori);
  for (const s of noveSlike) {
    if (!vrstice.has(s.kontrolnaTockaId)) {
      const obst = obstojeciZapisi.find((z) => z.kontrolna_tocka_id === s.kontrolnaTockaId);
      vrstice.set(s.kontrolnaTockaId, {
        odgovor: obst?.odgovor ?? null,
        dosezen_procent: obst?.dosezen_procent ?? null,
        komentar: obst?.komentar ?? null,
        casovne_izgube_min: obst?.casovne_izgube_min ?? 0,
      });
    }
  }
  if (vrstice.size === 0) return;

  const { data: shranjeni, error } = await sb
    .from("fp_skl_rutina")
    .upsert(
      [...vrstice].map(([kontrolna_tocka_id, o]) => ({ datum, kontrolna_tocka_id, ...o })),
      { onConflict: "datum,kontrolna_tocka_id" },
    )
    .select("id, kontrolna_tocka_id");
  if (error) throw error;

  const idPoTocki = new Map((shranjeni ?? []).map((r) => [r.kontrolna_tocka_id as number, r.id as number]));
  let napake = 0;

  for (const s of noveSlike) {
    const rutinaId = idPoTocki.get(s.kontrolnaTockaId);
    if (!rutinaId) continue;
    const path = `skl/${compact(datum)}/${compact(datum)}-${s.kontrolnaTockaId}-${Date.now()}.jpg`;
    try {
      await uploadSlika(path, s.blob);
      const stara = obstojeceSlike.find((x) => x.rutina_id === rutinaId);
      const { error: e } = await sb
        .from("fp_skl_rutina_slike")
        .upsert({ rutina_id: rutinaId, storage_path: path, visible: true }, { onConflict: "rutina_id" });
      if (e) throw e;
      if (stara && stara.storage_path !== path) await removeSlika(stara.storage_path);
    } catch {
      napake++;
    }
  }
  if (napake) {
    throw new Error(`Rutina je shranjena, vendar ${napake} slik ni bilo mogoče naložiti. Poskusi znova.`);
  }
}
