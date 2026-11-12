// Delovni plan - PREGLED (PDF za obešanje na celico / FIN:TV): poudarek na ROKIH. Vsaka celica na svojem listu
// A4 pokončno kot navpičen procesni flow (vzor: data/plan_overview.png): levo velika puščica časa z datumi (rok in
// začetek vsakega koraka), na sredini krogi s številko koraka, povezani s puščicami, ob krogu pasica s krovnim
// nalogom in pod njo nalogi in kosi. Če gre, so vse pasice desno (širše); sicer izmenično levo / desno (kot na vzoru),
// po potrebi manjše; če še vedno ne gre, se celica nadaljuje na naslednjem listu. Oranžna oznaka DANES na puščici.
// Workflow PDF (planPdf.ts) kaže, KAJ je treba narediti; ta pregled, DO KDAJ. Modul se naloži šele ob kliku.
import { rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatShort, toIso } from "./dates";
import { barvaCelice, danKratko, ddmm, type WorkflowCelica, type WorkflowKorak, type WorkflowPlan } from "./plan";
import { A4, asciiIme, novDokument, prenesiDatoteko } from "./porociloPdf";
import { formatNum } from "./stevila";

const [W, H] = A4; // pokončno
const ROB = 30;
const VRH = H - ROB - 92; // vrh vsebine (pod glavo)
const DNO = ROB + 22; // nad nogo
const PUSCICA_X = ROB + 2; // leva puščica časa
const DATUM_X = ROB + 56;

const ORANZNA = rgb(202 / 255, 80 / 255, 16 / 255);
const BESEDILO = rgb(0.11, 0.11, 0.12);
const SIVA = rgb(0.42, 0.42, 0.45);
const CRTA = rgb(0.2, 0.2, 0.22);
const RDECA = rgb(0.82, 0.18, 0.18);
const BELA = rgb(1, 1, 1);
const SVETLO = rgb(0.95, 0.95, 0.96);

/** Barve korakov (kot vzor: zelena, rumena, modra, oranžna ...). */
const BARVE_KORAKOV = ["22C55E", "EAB308", "3B82F6", "F97316", "84CC16", "8B5CF6", "EC4899", "0EA5E9", "14B8A6", "F43F5E"];

type Pisave = { navadna: PDFFont; krepka: PDFFont };
type Strana = "levo" | "desno";

const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const temnejsa = (c: RGB, t = 0.25) => rgb(c.red * (1 - t), c.green * (1 - t), c.blue * (1 - t));

function skrajsaj(t: string, font: PDFFont, velikost: number, sirina: number) {
  if (sirina <= 0) return "";
  if (font.widthOfTextAtSize(t, velikost) <= sirina) return t;
  let n = t.length;
  while (n > 1 && font.widthOfTextAtSize(`${t.slice(0, n)}…`, velikost) > sirina) n--;
  return n <= 1 ? "" : `${t.slice(0, n).trimEnd()}…`;
}

const kosiKoraka = (k: WorkflowKorak) => k.nalogi.reduce((s, n) => s + (n.kos ?? 0), 0);
const besediloNalogov = (n: number) => `${n} ${n === 1 ? "nalog" : n === 2 ? "naloga" : n <= 4 ? "nalogi" : "nalogov"}`;

// ---------------------------------------------------------------------
// Razporeditev
// ---------------------------------------------------------------------
type Nacin = "desno" | "izmenicno";
type Mere = { s: number; r: number; pas: number; vrstica: number; najvecNalogov: number };
const mere = (s: number, nacin: Nacin): Mere => ({ s, r: 24 * s, pas: 24 * s, vrstica: 11.5 * s, najvecNalogov: nacin === "desno" ? 8 : 5 });

type Vrstica = { t: string; krepko?: boolean; rdece?: boolean };

/** Vrstice pod pasico koraka (povzetek, odprema, naročnik, nalogi, več, opomba). */
function vrsticeKoraka(k: WorkflowKorak, m: Mere): Vrstica[] {
  const kosi = kosiKoraka(k);
  const v: Vrstica[] = [];
  if (!k.prosta) v.push({ t: `${besediloNalogov(k.nalogi.length)}${kosi ? ` · ${formatNum(kosi)} kos` : ""}${k.vseh !== null && k.delni ? ` (od ${k.vseh})` : ""}`, krepko: true });
  if (k.poOdpremi && k.prvaOdprema) v.push({ t: `Konec po odpremi ${danKratko(k.prvaOdprema)} ${ddmm(k.prvaOdprema)}!`, krepko: true, rdece: true });
  if (k.narocnik) v.push({ t: k.narocnik });
  const nalogi = k.nalogi.slice(0, k.nalogi.length > m.najvecNalogov ? m.najvecNalogov - 1 : m.najvecNalogov);
  nalogi.forEach((n, i) => v.push({ t: `${i + 1}. ${n.st_naloga}${n.naziv ? ` · ${n.naziv}` : ""}${n.kos ? ` · ${formatNum(n.kos)} kos` : ""}` }));
  if (k.nalogi.length > nalogi.length) v.push({ t: `+ še ${k.nalogi.length - nalogi.length}` });
  if (k.opomba) v.push({ t: `Opomba: ${k.opomba}` });
  return v;
}
/** Višina bloka pod središčem kroga: polovica pasice + vrstice. */
const visinaBloka = (k: WorkflowKorak, m: Mere) => m.pas / 2 + 7 * m.s + vrsticeKoraka(k, m).length * m.vrstica;

/** Središča krogov (y) od vrha navzdol; null, če ne gre na list. */
function postavi(koraki: WorkflowKorak[], m: Mere, nacin: Nacin): number[] | null {
  const najmanj = 2 * m.r + 26 * m.s; // prostor za puščico med krogoma
  const y: number[] = [];
  let dno = VRH;
  koraki.forEach((k, i) => {
    let cy = i === 0 ? VRH - m.r - 22 * m.s : y[i - 1] - najmanj;
    // blok na isti strani (prejšnji oz. predprejšnji korak) se ne sme prekrivati z novo pasico in datumom
    const prejsnji = nacin === "desno" ? i - 1 : i - 2;
    if (prejsnji >= 0) cy = Math.min(cy, y[prejsnji] - visinaBloka(koraki[prejsnji], m) - m.pas / 2 - 10 * m.s);
    // datumi levo: rok nad črto + začetek pod njo (~30 pt na korak)
    if (i > 0) cy = Math.min(cy, y[i - 1] - 34 * m.s);
    y.push(cy);
    dno = Math.min(dno, cy - Math.max(m.r, visinaBloka(k, m)));
  });
  return dno >= DNO ? y : null;
}

/** Najboljša razporeditev za korake na enem listu: vse desno, nato izmenično, nato manjše. */
function razporedi(koraki: WorkflowKorak[]): { m: Mere; nacin: Nacin; y: number[] } | null {
  for (const s of [1, 0.92, 0.85, 0.78, 0.72, 0.66]) {
    for (const nacin of ["desno", "izmenicno"] as Nacin[]) {
      const m = mere(s, nacin);
      const y = postavi(koraki, m, nacin);
      if (y) return { m, nacin, y };
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Risanje
// ---------------------------------------------------------------------
function glava(stran: PDFPage, f: Pisave, logo: Awaited<ReturnType<typeof novDokument>>["logo"], plan: WorkflowPlan, c: WorkflowCelica, barva: RGB, nadaljevanje: string) {
  const vrh = H - ROB;
  if (logo) {
    const s = logo.scaleToFit(70, 18);
    stran.drawImage(logo, { x: ROB, y: vrh - s.height, width: s.width, height: s.height });
  }
  const desno = (t: string, y: number, v: number, font: PDFFont, col: RGB) => stran.drawText(t, { x: W - ROB - font.widthOfTextAtSize(t, v), y, size: v, font, color: col });
  desno(`Delovni plan - pregled · ${plan.oddelek}`, vrh - 8, 9.5, f.krepka, BESEDILO);
  desno(`${formatShort(plan.od)} – ${formatShort(plan.do)} · natisnjeno ${formatShort(toIso(new Date()))}`, vrh - 18, 7, f.navadna, SIVA);
  stran.drawRectangle({ x: ROB, y: vrh - 25, width: W - 2 * ROB, height: 1.5, color: ORANZNA });
  // ime celice
  const y = vrh - 56;
  stran.drawRectangle({ x: ROB, y: y - 4, width: 6, height: 26, color: barva });
  stran.drawText(skrajsaj(c.naziv.toUpperCase(), f.krepka, 22, W - 2 * ROB - 200), { x: ROB + 14, y, size: 22, font: f.krepka, color: BESEDILO });
  stran.drawText(`DO KDAJ?${nadaljevanje}`, { x: ROB + 14, y: y - 16, size: 8.5, font: f.krepka, color: ORANZNA });
  const kosov = c.koraki.reduce((s, k) => s + kosiKoraka(k), 0);
  desno(`${c.koraki.length} ${c.koraki.length === 1 ? "krovni" : "krovnih"} · ${formatNum(kosov)} kos`, y + 6, 11, f.krepka, BESEDILO);
  desno(`privzeto ${formatNum(c.zaposleni)} oseb na celici`, y - 8, 8, f.navadna, SIVA);
}

/** Velika puščica časa levo (obroba kot na vzoru). */
function puscicaCasa(stran: PDFPage, od: number, do_: number) {
  const sirina = 18;
  const glavaW = 44;
  const h = od - do_;
  const glavaH = Math.min(110, h * 0.3);
  const pot = `M ${(glavaW - sirina) / 2} 0 H ${(glavaW + sirina) / 2} V ${h - glavaH} H ${glavaW} L ${glavaW / 2} ${h} L 0 ${h - glavaH} H ${(glavaW - sirina) / 2} Z`;
  stran.drawSvgPath(pot, { x: PUSCICA_X, y: od, color: SVETLO, borderColor: CRTA, borderWidth: 1.6 });
}

/** Puščica med krogoma: lijak, ki proti dnu postane poln (preliv s prosojnostjo), in konica. */
function puscicaKoraka(stran: PDFPage, cx: number, y1: number, y2: number, barva: RGB, s: number) {
  const h = y1 - y2;
  if (h < 6) return;
  const konica = Math.min(12 * s, h * 0.45);
  const telo = h - konica;
  const deli = 10;
  for (let i = 0; i < deli; i++) {
    const t0 = i / deli;
    const t1 = (i + 1) / deli;
    const w0 = (26 - 12 * t0) * s;
    const w1 = (26 - 12 * t1) * s;
    const ya = y1 - telo * t0;
    const yb = y1 - telo * t1;
    stran.drawSvgPath(`M ${-w0 / 2} 0 H ${w0 / 2} L ${w1 / 2} ${ya - yb + 0.4} H ${-w1 / 2} Z`, { x: cx, y: ya, color: barva, opacity: 0.12 + 0.88 * t1 });
  }
  stran.drawSvgPath(`M ${-14 * s} 0 H ${14 * s} L 0 ${konica} Z`, { x: cx, y: y2 + konica, color: barva });
}

/** Pasica (trak) s krovnim nalogom: desno = konica proti krogu levo, zareza desno; levo = obratno. */
function pasica(stran: PDFPage, f: Pisave, x: number, cy: number, w: number, h: number, barva: RGB, besedilo: string, s: number, strana: Strana) {
  const z = 11 * s;
  const pot =
    strana === "desno"
      ? `M 0 ${h / 2} L ${z} 0 H ${w} L ${w - z} ${h / 2} L ${w} ${h} H ${z} Z`
      : `M 0 0 H ${w - z} L ${w} ${h / 2} L ${w - z} ${h} H 0 L ${z} ${h / 2} Z`;
  stran.drawSvgPath(pot, { x, y: cy + h / 2, color: barva });
  const v = 11.5 * s;
  const t = skrajsaj(besedilo, f.krepka, v, w - 2 * z - 6);
  stran.drawText(t, { x: x + w / 2 - f.krepka.widthOfTextAtSize(t, v) / 2, y: cy - v * 0.36, size: v, font: f.krepka, color: BELA });
}

/** `doKroga` = črta datuma do kroga; false = konča se pred stolpcem levih pasic (tam je blok prejšnjega koraka). */
function korak(stran: PDFPage, f: Pisave, k: WorkflowKorak, st: number, cy: number, m: Mere, strana: Strana, barva: RGB, cx: number, doKroga: boolean) {
  const { s, r } = m;
  // datum: črta od puščice časa do kroga, nad njo rok (krepko), pod njo začetek
  const yCrte = cy + r * 0.55;
  const levaMeja = DATUM_X + 86 * s; // levo od pasic so datumi
  stran.drawLine({ start: { x: PUSCICA_X + 31, y: yCrte }, end: { x: doKroga ? cx - r - 4 : levaMeja - 6, y: yCrte }, thickness: 1.3, color: CRTA });
  const rdec = k.poOdpremi || k.brezKapacitete > 0;
  stran.drawText(`do ${danKratko(k.do)} ${ddmm(k.do)}`, { x: DATUM_X, y: yCrte + 4, size: 12 * s, font: f.krepka, color: rdec ? RDECA : BESEDILO });
  stran.drawText(`od ${danKratko(k.od)} ${ddmm(k.od)}`, { x: DATUM_X, y: yCrte - 10 * s, size: 7.5 * s, font: f.navadna, color: SIVA });

  // krog s številko
  stran.drawCircle({ x: cx, y: cy, size: r, color: barva });
  const stT = String(st);
  const vs = 17 * s;
  stran.drawText(stT, { x: cx - f.krepka.widthOfTextAtSize(stT, vs) / 2, y: cy - vs * 0.36, size: vs, font: f.krepka, color: BELA });

  // pasica in vrstice
  const xPas = strana === "desno" ? cx + r + 8 * s : levaMeja;
  const wPas = strana === "desno" ? W - ROB - xPas : cx - r - 8 * s - levaMeja;
  pasica(stran, f, xPas, cy, wPas, m.pas, barva, k.krovni, s, strana);
  let y = cy - m.pas / 2 - 7 * s - m.vrstica * 0.75;
  for (const v of vrsticeKoraka(k, m)) {
    const font = v.krepko ? f.krepka : f.navadna;
    const vel = (v.krepko ? 8.8 : 8.2) * s;
    stran.drawText(skrajsaj(v.t, font, vel, wPas - 14 * s), { x: xPas + 10 * s, y, size: vel, font, color: v.rdece ? RDECA : v.krepko ? temnejsa(barva, 0.35) : SIVA });
    y -= m.vrstica;
  }
}

/** Oznaka DANES na puščici časa: pred prvim korakom, katerega rok še ni minil. */
function danes(stran: PDFPage, f: Pisave, koraki: WorkflowKorak[], y: number[], m: Mere) {
  const d = toIso(new Date());
  const i = koraki.findIndex((k) => k.do >= d);
  if (i < 0 || koraki[0].od > d) return;
  const yd = i === 0 ? Math.min(VRH - 8, y[0] + m.r + 10) : (y[i - 1] + y[i]) / 2 + 4;
  const t = "DANES";
  const w = f.krepka.widthOfTextAtSize(t, 7) + 8;
  stran.drawRectangle({ x: PUSCICA_X - 3, y: yd - 1.2, width: 50, height: 2.4, color: ORANZNA });
  stran.drawRectangle({ x: PUSCICA_X + 22 - w / 2, y: yd + 3, width: w, height: 11, color: ORANZNA });
  stran.drawText(t, { x: PUSCICA_X + 22 - w / 2 + 4, y: yd + 5.6, size: 7, font: f.krepka, color: BELA });
}

export async function ustvariPlanPregledPdf(plan: WorkflowPlan): Promise<Blob> {
  if (plan.celice.length === 0) throw new Error("V prikazanem obdobju ni postavitev.");
  const { pdf, navadna, krepka, logo } = await novDokument(`Delovni plan - pregled ${plan.oddelek}`, "dejavu");
  const f: Pisave = { navadna, krepka };

  plan.celice.forEach((c, ci) => {
    const barvaCel = hex(barvaCelice(ci));
    // koraki po listih: čim več na list, ostanek na naslednji list
    const listi: WorkflowKorak[][] = [];
    let ostalo = c.koraki;
    while (ostalo.length) {
      let n = ostalo.length;
      while (n > 1 && !razporedi(ostalo.slice(0, n))) n--;
      listi.push(ostalo.slice(0, n));
      ostalo = ostalo.slice(n);
    }
    let zacetek = 0;
    listi.forEach((koraki, li) => {
      const stran = pdf.addPage([W, H]);
      glava(stran, f, logo, plan, c, barvaCel, listi.length > 1 ? `  (${li + 1}/${listi.length})` : "");
      const m0 = mere(0.66, "izmenicno");
      const { m, nacin, y } = razporedi(koraki) ?? { m: m0, nacin: "izmenicno" as Nacin, y: [VRH - m0.r - 20] };
      // vse desno: krogi bolj levo (širše pasice); izmenično: krogi na sredini med pasicama
      const cx = nacin === "desno" ? DATUM_X + 86 * m.s + m.r + 14 : DATUM_X + 86 * m.s + (W - ROB - DATUM_X - 76 * m.s) / 2;
      const zadnji = koraki.length - 1;
      puscicaCasa(stran, VRH - 2, Math.max(DNO, y[zadnji] - Math.max(m.r, visinaBloka(koraki[zadnji], m)) - 4));
      koraki.forEach((k, i) => {
        const barva = hex(BARVE_KORAKOV[(zacetek + i) % BARVE_KORAKOV.length]);
        if (i < zadnji) puscicaKoraka(stran, cx, y[i] - m.r - 3, y[i + 1] + m.r + 3, barva, m.s);
        // izmenično: blok prejšnjega (levega) koraka lahko sega do višine te črte datuma
        const levi = nacin === "izmenicno" && i % 2 === 0 && i > 0 ? i - 1 : -1;
        const yCrte = y[i] + m.r * 0.55;
        const doKroga = levi < 0 || yCrte + 4 < y[levi] - visinaBloka(koraki[levi], m) - 2;
        korak(stran, f, k, zacetek + i + 1, y[i], m, nacin === "desno" || i % 2 === 0 ? "desno" : "levo", barva, cx, doKroga);
      });
      danes(stran, f, koraki, y, m);
      zacetek += koraki.length;
    });
  });

  // noga
  const strani = pdf.getPages();
  const noga = `FINES d.o.o. | Production | Delovni plan - pregled ${plan.oddelek} | levo: rok (do) in začetek (od) koraka`;
  strani.forEach((st, i) => {
    const t = `Stran ${i + 1} / ${strani.length}`;
    st.drawText(noga, { x: ROB, y: ROB - 10, size: 6.5, font: navadna, color: SIVA });
    st.drawText(t, { x: W - ROB - navadna.widthOfTextAtSize(t, 6.5), y: ROB - 10, size: 6.5, font: navadna, color: SIVA });
  });
  const bajti = await pdf.save();
  return new Blob([bajti as BlobPart], { type: "application/pdf" });
}

export const imePregleda = (plan: WorkflowPlan) => asciiIme(`Delovni_plan_pregled_${plan.oddelek}_${plan.od}`);

export async function prenesiPlanPregledPdf(plan: WorkflowPlan) {
  prenesiDatoteko(await ustvariPlanPregledPdf(plan), `${imePregleda(plan)}.pdf`);
}
