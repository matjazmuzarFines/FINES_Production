"use client";

// Objava na FIN:TV (FinOS -> Administracija -> FIN:TV -> Komponente). Komponenta = vrstica v fos_tv_viri (migracija FinOS
// 025); objava = strani dokumenta kot slike WebP 3840 px v košari fos-tv-viri + klic fos_tv_objavi. Vsaka stran ima lahko
// veljavnost (od - do, datum): TV kaže samo strani, ki veljajo danes.
//
// Delovni plan - workflow in pregled (vsak oddelek svoja komponenta za vsakega): ob "Shrani plan" se za VSAK TEDEN, za
// katerega je plan narejen (od tekočega tedna naprej), ustvari svoj PDF; strani tedna veljajo pon - ned. TV v ponedeljek
// sam preklopi na nov teden. Nova objava zamenja vse tedne naenkrat. Izklopljena / manjkajoča komponenta = nič se ne ustvari.
//
// Delo - prejšnji dan (vsak oddelek svoja komponenta, FinOS 027): ob vsakem uvozu Poročanega dela (Sync) se za prejšnji
// delovni dan ustvari stran 16:9 na oddelek (deloPdf.ts); stran velja samo na dan objave.
import { addDays, mondayOf, prevWorkday, toIso, type IsoDate } from "./dates";
import type { OddelekKoda } from "./normativi";
import type { WorkflowPlan } from "./plan";
import { ustvariPlanPdf } from "./planPdf";
import { ustvariPlanPregledPdf, type DruzineNormativov } from "./planPregledPdf";
import { getSupabase } from "./supabase";

const KOSARA = "fos-tv-viri";
/** Širina slike strani (4K). */
const SIRINA = 3840;
/** Največ tednov naprej (plan za pol leta). */
const NAJVEC_TEDNOV = 26;

/** Koda komponente pregleda plana za oddelek (FinOS 025). */
export const kodaPregleda = (oddelek: OddelekKoda) => `fp_plan_pregled_${oddelek.toLowerCase()}`;
/** Koda komponente workflowa plana za oddelek (FinOS 026). */
export const kodaWorkflowa = (oddelek: OddelekKoda) => `fp_plan_workflow_${oddelek.toLowerCase()}`;

/** Koda komponente "Delo - prejšnji dan" za oddelek (FinOS 027). */
export const kodaDela = (oddelek: OddelekKoda) => `fp_delo_vceraj_${oddelek.toLowerCase()}`;
const ODDELKI: OddelekKoda[] = ["P", "M", "E", "T"];

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
      // intent "print": brez requestAnimationFrame - sicer se izris v zavihku v ozadju ustavi (brskalnik ga zamrzne)
      await stran.render({ canvas, canvasContext: ctx, viewport, intent: "print" }).promise;
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

/** Dokumenti plana na FIN:TV - vsak je za vsak oddelek svoja komponenta (FinOS 025 / 026). */
type DokumentPlana = {
  ime: string;
  koda: (oddelek: OddelekKoda) => string;
  pdf: (plan: WorkflowPlan, druzine: DruzineNormativov) => Promise<Blob>;
};
const DOKUMENTI: DokumentPlana[] = [
  { ime: "workflow", koda: kodaWorkflowa, pdf: (plan) => ustvariPlanPdf(plan) },
  { ime: "pregled", koda: kodaPregleda, pdf: (plan, druzine) => ustvariPlanPregledPdf(plan, druzine) },
];

/** Objavljeni dokumenti (samo vklopljene komponente, ki imajo strani). Prazno = nič objavljeno. */
export type IzidObjave = { ime: string; tednov: number; strani: number }[];

type Zbirka = { dok: DokumentPlana; koda: string; mapa: string; strani: string[]; razmerja: number[]; veljaOd: IsoDate[]; veljaDo: IsoDate[]; tednov: number };

/** Zadnja zagnana objava po oddelku - novejši Shrani plan prekine starejšo objavo istega oddelka. */
const zadnjaObjava = new Map<string, number>();

/**
 * Plan po tednih na FIN:TV (workflow + pregled). `planTedna(dnevi)` = WorkflowPlan za 5 delovnih dni tedna
 * (pripraviWorkflow), `zadnjiDan` = konec zadnjega koraka v planu. Plan tedna se izračuna enkrat za oba dokumenta.
 * Izklopljene / manjkajoče komponente se preskočijo. Tekoči teden se objavi takoj (TV ga pokaže v ~20 s), vsi tedni
 * pa na koncu. `napredek(teden, vseh)` = obvestilo o napredku. Vrne null, ko jo je prekinil novejši Shrani plan.
 */
export async function objaviPlanNaTv({
  oddelek,
  nazivOddelka,
  planTedna,
  druzine,
  zadnjiDan,
  napredek,
}: {
  oddelek: OddelekKoda;
  nazivOddelka: string;
  planTedna: (dnevi: IsoDate[]) => WorkflowPlan;
  druzine: DruzineNormativov;
  zadnjiDan: IsoDate | null;
  napredek?: (teden: number, vseh: number) => void;
}): Promise<IzidObjave | null> {
  const prvi = mondayOf(toIso(new Date()));
  if (!zadnjiDan || zadnjiDan < prvi) return [];
  const zdaj = Date.now();
  zadnjaObjava.set(oddelek, zdaj);
  const prekinjena = () => zadnjaObjava.get(oddelek) !== zdaj;
  const zbirke: Zbirka[] = [];
  for (const dok of DOKUMENTI) {
    const koda = dok.koda(oddelek);
    if (await vklopljena(koda)) zbirke.push({ dok, koda, mapa: `${koda}/${zdaj}`, strani: [], razmerja: [], veljaOd: [], veljaDo: [], tednov: 0 });
  }
  if (!zbirke.length) return [];

  const tedni: IsoDate[] = [];
  for (let pon = prvi; pon <= mondayOf(zadnjiDan) && tedni.length < NAJVEC_TEDNOV; pon = addDays(pon, 7)) tedni.push(pon);
  for (const [t, pon] of tedni.entries()) {
    if (prekinjena()) return null;
    napredek?.(t + 1, tedni.length);
    const plan = planTedna(Array.from({ length: 5 }, (_, i) => addDays(pon, i)));
    if (plan.celice.length) await dodajTeden(zbirke, pon, plan, druzine);
    // tekoči teden takoj na TV, ostali ob koncu (nova objava zamenja prejšnjo)
    if (t === 0 && tedni.length > 1 && !prekinjena()) await objavi(zbirke, nazivOddelka);
  }
  if (prekinjena()) return null;
  return objavi(zbirke, nazivOddelka);
}

/** Strani enega tedna za vse dokumente -> košara. */
async function dodajTeden(zbirke: Zbirka[], pon: IsoDate, plan: WorkflowPlan, druzine: DruzineNormativov) {
  for (const z of zbirke) {
    const { slike, razmerja } = await pdfVSlike(await z.dok.pdf(plan, druzine));
    for (let i = 0; i < slike.length; i++) {
      const pot = `${z.mapa}/${pon}-${i + 1}.webp`;
      const { error } = await getSupabase().storage.from(KOSARA).upload(pot, slike[i], { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (error) throw new Error(`Nalaganje strani na TV (${z.dok.ime}): ${error.message}`);
      z.strani.push(pot);
      z.razmerja.push(razmerja[i]);
      z.veljaOd.push(pon);
      z.veljaDo.push(addDays(pon, 6));
    }
    z.tednov++;
  }
}

/** Objava zbranih strani (vsak dokument svoja komponenta). */
async function objavi(zbirke: Zbirka[], nazivOddelka: string): Promise<IzidObjave> {
  const izid: IzidObjave = [];
  for (const z of zbirke) {
    if (!z.strani.length) continue;
    const { error } = await getSupabase().rpc("fos_tv_objavi", {
      p_koda: z.koda,
      p_strani: z.strani,
      p_razmerja: z.razmerja,
      p_izvor: `Production: Shrani plan · ${nazivOddelka}`,
      p_velja_od: z.veljaOd,
      p_velja_do: z.veljaDo,
    });
    if (error) throw new Error(`${z.dok.ime}: ${error.message}`);
    izid.push({ ime: z.dok.ime, tednov: z.tednov, strani: z.strani.length });
  }
  return izid;
}

/**
 * "Delo - prejšnji dan" na FIN:TV za vse oddelke z vklopljeno komponento: štempljane ure prejšnjega delovnega dne proti
 * planu (deloVceraj.ts -> deloPdf.ts). Stran velja samo danes - naslednji dan je komponenta prazna do novega uvoza.
 * Vrne objavljene oddelke (prazno = nobena komponenta ni vklopljena ali ni dostopa do FIN:TV).
 */
export async function objaviDeloNaTv(izvor = "uvoz poročanega dela"): Promise<{ datum: IsoDate; oddelki: string[] }> {
  const danes = toIso(new Date());
  const datum = prevWorkday(danes);
  const kode: OddelekKoda[] = [];
  for (const o of ODDELKI) if (await vklopljena(kodaDela(o))) kode.push(o);
  if (!kode.length) return { datum, oddelki: [] };
  const [{ pripraviDelo }, { ustvariDeloPdf }] = await Promise.all([import("./deloVceraj"), import("./deloPdf")]);
  const zdaj = Date.now();
  const oddelki: string[] = [];
  for (const d of await pripraviDelo(datum, kode)) {
    const koda = kodaDela(d.koda);
    const { slike, razmerja } = await pdfVSlike(await ustvariDeloPdf(d));
    const strani: string[] = [];
    for (let i = 0; i < slike.length; i++) {
      const pot = `${koda}/${zdaj}/${datum}-${i + 1}.webp`;
      const { error } = await getSupabase().storage.from(KOSARA).upload(pot, slike[i], { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (error) throw new Error(`Nalaganje strani na TV (${d.naziv}): ${error.message}`);
      strani.push(pot);
    }
    const { error } = await getSupabase().rpc("fos_tv_objavi", {
      p_koda: koda,
      p_strani: strani,
      p_razmerja: razmerja,
      p_izvor: `Production: ${izvor} · ${d.naziv}`,
      p_velja_od: strani.map(() => danes),
      p_velja_do: strani.map(() => danes),
    });
    if (error) throw new Error(`${d.naziv}: ${error.message}`);
    oddelki.push(d.naziv);
  }
  return { datum, oddelki };
}
