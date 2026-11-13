"use client";

// Objava na FIN:TV (FinOS -> Administracija -> FIN:TV -> Komponente). Komponenta = vrstica v fos_tv_viri (migracija FinOS
// 025); objava = strani dokumenta kot slike WebP 3840 px v košari fos-tv-viri + klic fos_tv_objavi. Vsaka stran ima lahko
// veljavnost (od - do, datum): TV kaže samo strani, ki veljajo danes.
//
// Delovni plan - pregled: ob "Shrani plan" se za VSAK TEDEN, za katerega je plan narejen (od tekočega tedna naprej),
// ustvari svoj PDF pregled; strani tedna veljajo pon - ned. TV v ponedeljek sam preklopi na nov teden. Nova objava
// zamenja vse tedne naenkrat. Izklopljena / manjkajoča komponenta = nič se ne ustvari.
import { addDays, mondayOf, toIso, type IsoDate } from "./dates";
import type { OddelekKoda } from "./normativi";
import type { WorkflowPlan } from "./plan";
import { ustvariPlanPregledPdf, type DruzineNormativov } from "./planPregledPdf";
import { getSupabase } from "./supabase";

const KOSARA = "fos-tv-viri";
/** Širina slike strani (4K). */
const SIRINA = 3840;
/** Največ tednov naprej (plan za pol leta). */
const NAJVEC_TEDNOV = 26;

/** Koda komponente pregleda plana za oddelek (FinOS 025). */
export const kodaPregleda = (oddelek: OddelekKoda) => `fp_plan_pregled_${oddelek.toLowerCase()}`;

/** PDF -> slike strani (pdf.js, kot pdfStrani.ts v FinOS) + razmerje strani (višina / širina). */
async function pdfVSlike(pdfBlob: Blob): Promise<{ slike: Blob[]; razmerja: number[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()) }).promise;
  const slike: Blob[] = [];
  const razmerja: number[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const stran = await pdf.getPage(i);
      const osnova = stran.getViewport({ scale: 1 });
      const viewport = stran.getViewport({ scale: SIRINA / osnova.width });
      razmerja.push(Math.round((osnova.height / osnova.width) * 1000) / 1000);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await stran.render({ canvas, canvasContext: ctx, viewport }).promise;
      slike.push(await new Promise<Blob>((ok, ne) => canvas.toBlob((b) => (b ? ok(b) : ne(new Error("Strani ni mogoče shraniti."))), "image/webp", 0.9)));
      stran.cleanup();
      canvas.width = canvas.height = 0;
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
  return { slike, razmerja };
}

/** Ali je komponenta v FinOS in vklopljena (sicer se nič ne ustvari). */
async function vklopljena(koda: string): Promise<boolean> {
  const { data, error } = await getSupabase().from("fos_tv_viri").select("vklopljen").eq("koda", koda).eq("visible", true).maybeSingle();
  return !error && !!data?.vklopljen;
}

export type IzidObjave = { tednov: number; strani: number } | null;

/**
 * Pregled plana po tednih na FIN:TV. `planTedna(dnevi)` = WorkflowPlan za 5 delovnih dni tedna (pripraviWorkflow),
 * `zadnjiDan` = konec zadnjega koraka v planu. Vrne null, ko komponente ni / je izklopljena ali plana od tega tedna naprej ni.
 */
export async function objaviPregledPlana({
  oddelek,
  nazivOddelka,
  planTedna,
  druzine,
  zadnjiDan,
}: {
  oddelek: OddelekKoda;
  nazivOddelka: string;
  planTedna: (dnevi: IsoDate[]) => WorkflowPlan;
  druzine: DruzineNormativov;
  zadnjiDan: IsoDate | null;
}): Promise<IzidObjave> {
  const koda = kodaPregleda(oddelek);
  if (!(await vklopljena(koda))) return null;
  const prvi = mondayOf(toIso(new Date()));
  if (!zadnjiDan || zadnjiDan < prvi) return null;

  const mapa = `${koda}/${Date.now()}`;
  const strani: string[] = [];
  const razmerja: number[] = [];
  const veljaOd: IsoDate[] = [];
  const veljaDo: IsoDate[] = [];
  const zadnji = mondayOf(zadnjiDan);
  let tednov = 0;
  for (let pon = prvi, n = 0; pon <= zadnji && n < NAJVEC_TEDNOV; pon = addDays(pon, 7), n++) {
    const plan = planTedna(Array.from({ length: 5 }, (_, i) => addDays(pon, i)));
    if (!plan.celice.length) continue;
    const { slike, razmerja: r } = await pdfVSlike(await ustvariPlanPregledPdf(plan, druzine));
    for (let i = 0; i < slike.length; i++) {
      const pot = `${mapa}/${pon}-${i + 1}.webp`;
      const { error } = await getSupabase().storage.from(KOSARA).upload(pot, slike[i], { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (error) throw new Error(`Nalaganje strani na TV: ${error.message}`);
      strani.push(pot);
      razmerja.push(r[i]);
      veljaOd.push(pon);
      veljaDo.push(addDays(pon, 6));
    }
    tednov++;
  }
  if (!strani.length) return null;

  const { error } = await getSupabase().rpc("fos_tv_objavi", {
    p_koda: koda,
    p_strani: strani,
    p_razmerja: razmerja,
    p_izvor: `Production: Shrani plan · ${nazivOddelka}`,
    p_velja_od: veljaOd,
    p_velja_do: veljaDo,
  });
  if (error) throw new Error(error.message);
  return { tednov, strani: strani.length };
}
