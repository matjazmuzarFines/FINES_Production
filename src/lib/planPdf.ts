// Delovni plan kot workflow v PDF: za vsako delovno mesto (celico) en list A4 (ležeče) s koraki (krovni nalogi)
// v vrstnem redu začetka, povezanimi s puščicami. Za obešanje na celico - velike, berljive oznake.
// Celica je vedno na enem listu: do 3 koraki v vrsti, do 6 na list; če ne gre, se kartice sorazmerno pomanjšajo.
// Modul se naloži šele ob kliku (dinamičen import).
import { rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatShort, toIso } from "./dates";
import { danInDatum, type WorkflowCelica, type WorkflowKorak, type WorkflowPlan } from "./plan";
import { A4, asciiIme, novDokument, prelomi, prenesiDatoteko } from "./porociloPdf";
import { formatNum, formatUre } from "./stevila";

const STRAN: [number, number] = [A4[1], A4[0]]; // ležeče
const ROB = 20;
const SIRINA = STRAN[0] - 2 * ROB;
const STOLPCEV = 3;
const RAZMIK = 30; // prostor za puščico med koraki
const KORAK_W = (SIRINA - (STOLPCEV - 1) * RAZMIK) / STOLPCEV;
const RAZMIK_VRST = 26;
const VRH_VSEBINE = STRAN[1] - ROB - 58;
const DNO = ROB + 14; // nad nogo
const MAX_NALOGOV = 12;
const NAJMANJ = 0.5; // najmanjše pomanjšanje kartic

const ORANZNA = rgb(202 / 255, 80 / 255, 16 / 255);
const SVETLO_ORANZNA = rgb(253 / 255, 238 / 255, 228 / 255);
const ZELENA = rgb(22 / 255, 128 / 255, 61 / 255);
const TEMNA = rgb(0.17, 0.17, 0.18);
const BESEDILO = rgb(0.11, 0.11, 0.12);
const SIVA = rgb(0.42, 0.42, 0.45);
const SVETLO_SIVA = rgb(0.78, 0.78, 0.8);
const CRTA = rgb(0.86, 0.86, 0.87);
const OZADJE = rgb(0.965, 0.965, 0.97);
const RDECA = rgb(0.82, 0.18, 0.18);
const BELA = rgb(1, 1, 1);

type Pisave = { navadna: PDFFont; krepka: PDFFont };

/** Skrajša besedilo s tropičjem, da ustreza širini. */
function skrajsaj(t: string, font: PDFFont, velikost: number, sirina: number) {
  if (font.widthOfTextAtSize(t, velikost) <= sirina) return t;
  let n = t.length;
  while (n > 1 && font.widthOfTextAtSize(`${t.slice(0, n)}…`, velikost) > sirina) n--;
  return `${t.slice(0, n).trimEnd()}…`;
}

/** Pravokotnik z zaobljenimi koti; x, yZgoraj = levi zgornji kot. */
function zaobljen(
  stran: PDFPage,
  x: number,
  yZgoraj: number,
  w: number,
  h: number,
  r: number,
  o: { color?: RGB; borderColor?: RGB; borderWidth?: number },
) {
  const pot = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  stran.drawSvgPath(pot, { x, y: yZgoraj, ...o });
}

/** Značka (zaobljen pravokotnik z besedilom); x = levi rob, y = osnovna črta besedila. Vrne širino. */
function znacka(stran: PDFPage, t: string, x: number, y: number, velikost: number, font: PDFFont, ozadje: RGB, barva: RGB) {
  const pad = velikost * 0.7;
  const w = font.widthOfTextAtSize(t, velikost) + 2 * pad;
  const h = velikost * 1.9;
  zaobljen(stran, x, y + velikost * 1.25, w, h, h / 2, { color: ozadje });
  stran.drawText(t, { x: x + pad, y, size: velikost, font, color: barva });
  return w;
}
const sirinaZnacke = (t: string, velikost: number, font: PDFFont) => font.widthOfTextAtSize(t, velikost) + 1.4 * velikost;

/** Mere kartice pri pomanjšanju s (1 = polna velikost). */
function mere(s: number) {
  return {
    pad: 10 * s,
    pasica: 38 * s,
    naziv: 8 * s, // velikost pisave naziva nalogov
    vrsticaNaziva: 9.8 * s,
  };
}

/**
 * Nariše en korak (če je stran podana) in vrne njegovo višino.
 * Brez strani samo izmeri višino (za razporeditev na list).
 */
function korak(stran: PDFPage | null, f: Pisave, k: WorkflowKorak, st: number, x: number, yZgoraj: number, s: number): number {
  const m = mere(s);
  const sirinaBesedila = KORAK_W - 2 * m.pad;
  const nalogi = k.nalogi.slice(0, k.nalogi.length > MAX_NALOGOV ? MAX_NALOGOV - 1 : MAX_NALOGOV);
  const vec = k.nalogi.length - nalogi.length;
  // naziv vsakega naloga v celoti (prelom v več vrstic)
  const nazivi = nalogi.map((n) => (n.naziv ? prelomi(n.naziv, f.navadna, m.naziv, sirinaBesedila - 8 * s) : []));
  const opomba = k.opomba ? prelomi(`Opomba: ${k.opomba}`, f.navadna, 8 * s, sirinaBesedila) : [];

  const visina =
    m.pasica +
    13 * s + // naslova datumov
    17 * s + // datuma
    13 * s + // ure in rok
    (k.narocnik ? 12 * s : 0) +
    (k.brezKapacitete > 0 ? 12 * s : 0) +
    (nalogi.length || vec
      ? 9 * s + 13 * s + nalogi.reduce((sum, _, i) => sum + 12 * s + nazivi[i].length * m.vrsticaNaziva + 2 * s, 0) + (vec ? 11 * s : 0)
      : 0) +
    (opomba.length ? 6 * s + opomba.length * 10 * s + 2 * s : 0) +
    8 * s;
  if (!stran) return visina;

  // okvir in temna pasica
  const robBarva = k.poRoku || k.brezKapacitete > 0 ? RDECA : k.delni ? ORANZNA : CRTA;
  const r = 9 * s;
  zaobljen(stran, x, yZgoraj, KORAK_W, visina, r, { color: BELA, borderColor: robBarva, borderWidth: k.poRoku || k.delni ? 2 : 1 });
  zaobljen(stran, x, yZgoraj, KORAK_W, m.pasica, r, { color: TEMNA });
  stran.drawRectangle({ x, y: yZgoraj - m.pasica, width: KORAK_W, height: r, color: TEMNA });

  // številka koraka
  const sx = x + m.pad + 11 * s;
  const sy = yZgoraj - m.pasica / 2;
  stran.drawCircle({ x: sx, y: sy, size: 11 * s, color: ORANZNA });
  const stT = String(st);
  stran.drawText(stT, { x: sx - f.krepka.widthOfTextAtSize(stT, 11 * s) / 2, y: sy - 3.9 * s, size: 11 * s, font: f.krepka, color: BELA });

  // krovni nalog
  const kx = x + m.pad + 29 * s;
  stran.drawText("KROVNI NALOG", { x: kx, y: yZgoraj - 12 * s, size: 6 * s, font: f.krepka, color: SVETLO_SIVA });
  stran.drawText(skrajsaj(k.krovni, f.krepka, 18 * s, KORAK_W - 130 * s), { x: kx, y: yZgoraj - 30 * s, size: 18 * s, font: f.krepka, color: BELA });

  // cel / delni krovni (značka desno v pasici)
  const nt = k.vseh === null ? "ni v uvozu" : k.delni ? `${k.nalogi.length}/${k.vseh} nalogov` : `cel krovni · ${k.vseh}`;
  const nv = 8.5 * s;
  const nw = sirinaZnacke(nt, nv, f.krepka);
  znacka(stran, nt, x + KORAK_W - m.pad - nw, sy - nv * 0.35, nv, f.krepka, k.delni ? ORANZNA : k.vseh === null ? SIVA : ZELENA, BELA);

  // začetek -> konec
  let y = yZgoraj - m.pasica - 13 * s;
  const x2 = x + KORAK_W / 2 + 6 * s;
  stran.drawText("ZAČETEK", { x: x + m.pad, y, size: 6.5 * s, font: f.krepka, color: SIVA });
  stran.drawText("KONEC", { x: x2, y, size: 6.5 * s, font: f.krepka, color: SIVA });
  if (k.poRoku) {
    const t = "PO ROKU";
    const v = 7 * s;
    znacka(stran, t, x + KORAK_W - m.pad - sirinaZnacke(t, v, f.krepka), y, v, f.krepka, RDECA, BELA);
  }
  y -= 17 * s;
  stran.drawText(danInDatum(k.od), { x: x + m.pad, y, size: 14 * s, font: f.krepka, color: BESEDILO });
  stran.drawText(danInDatum(k.do), { x: x2, y, size: 14 * s, font: f.krepka, color: k.poRoku ? RDECA : BESEDILO });
  stran.drawText("→", { x: x2 - 15 * s, y: y + 1 * s, size: 11 * s, font: f.krepka, color: SVETLO_SIVA });

  // ure in rok izdelave
  y -= 13 * s;
  const info = `${formatUre(k.ure)} h${k.rok ? ` · rok izdelave ${formatShort(k.rok)}` : ""}`;
  stran.drawText(info, { x: x + m.pad, y, size: 8.5 * s, font: f.navadna, color: k.poRoku ? RDECA : SIVA });
  if (k.narocnik) {
    y -= 12 * s;
    stran.drawText(skrajsaj(k.narocnik, f.krepka, 8.5 * s, sirinaBesedila), { x: x + m.pad, y, size: 8.5 * s, font: f.krepka, color: BESEDILO });
  }
  if (k.brezKapacitete > 0) {
    y -= 12 * s;
    stran.drawText(`${formatUre(k.brezKapacitete)} h brez kapacitete v planu`, { x: x + m.pad, y, size: 8 * s, font: f.krepka, color: RDECA });
  }

  // nalogi: vrstica številka · ident · kosi, pod njo cel naziv
  if (nalogi.length || vec) {
    y -= 9 * s;
    stran.drawRectangle({ x: x + m.pad, y, width: sirinaBesedila, height: 0.6, color: CRTA });
    y -= 13 * s;
    const naslov =
      k.vseh === null ? `NALOGI (${k.nalogi.length})` : k.delni ? `VKLJUČENI NALOGI ${k.nalogi.length}/${k.vseh}` : `VSI NALOGI ${k.vseh}/${k.vseh}`;
    stran.drawText(naslov, { x: x + m.pad, y: y + 2 * s, size: 9.5 * s, font: f.krepka, color: k.delni ? ORANZNA : k.vseh === null ? SIVA : ZELENA });
    nalogi.forEach((n, i) => {
      y -= 12 * s;
      const kos = n.kos === null ? "" : `${formatNum(n.kos)} kos`;
      const kw = f.krepka.widthOfTextAtSize(kos, 8.5 * s);
      stran.drawText(n.st_naloga, { x: x + m.pad, y, size: 8.5 * s, font: f.krepka, color: BESEDILO });
      const sw = f.krepka.widthOfTextAtSize(n.st_naloga, 8.5 * s);
      stran.drawText(skrajsaj(n.ident, f.navadna, 8 * s, sirinaBesedila - sw - kw - 14 * s), {
        x: x + m.pad + sw + 6 * s,
        y,
        size: 8 * s,
        font: f.navadna,
        color: SIVA,
      });
      stran.drawText(kos, { x: x + KORAK_W - m.pad - kw, y, size: 8.5 * s, font: f.krepka, color: BESEDILO });
      for (const v of nazivi[i]) {
        y -= m.vrsticaNaziva;
        stran.drawText(v, { x: x + m.pad + 8 * s, y, size: m.naziv, font: f.navadna, color: BESEDILO });
      }
      y -= 2 * s;
    });
    if (vec) {
      y -= 11 * s;
      stran.drawText(`+ še ${vec} nalogov (glej Word / Excel)`, { x: x + m.pad, y, size: 8 * s, font: f.navadna, color: SIVA });
    }
  }

  // opomba
  if (opomba.length) {
    y -= 6 * s;
    zaobljen(stran, x + m.pad - 3 * s, y - 1 * s, sirinaBesedila + 6 * s, opomba.length * 10 * s + 4 * s, 3 * s, { color: SVETLO_ORANZNA });
    for (const v of opomba) {
      y -= 10 * s;
      stran.drawText(v, { x: x + m.pad, y: y + 2 * s, size: 8 * s, font: f.navadna, color: BESEDILO });
    }
  }
  return visina;
}

/** Puščica (črta + konica); konica v točki (x2, y2), smer "desno" ali "dol". */
function puscica(stran: PDFPage, x1: number, y1: number, x2: number, y2: number, smer: "desno" | "dol") {
  const konec = smer === "desno" ? { x: x2 - 7, y: y2 } : { x: x2, y: y2 + 7 };
  stran.drawLine({ start: { x: x1, y: y1 }, end: konec, thickness: 2.2, color: ORANZNA });
  const pot = smer === "desno" ? "M 0 0 L -9 -5 L -9 5 Z" : "M 0 0 L -5 -9 L 5 -9 Z";
  stran.drawSvgPath(pot, { x: x2, y: y2, color: ORANZNA });
}

function glavaStrani(stran: PDFPage, f: Pisave, logo: PDFImage | null, plan: WorkflowPlan, c: WorkflowCelica) {
  const vrh = STRAN[1] - ROB;
  if (logo) {
    const s = logo.scaleToFit(78, 20);
    stran.drawImage(logo, { x: ROB, y: vrh - s.height, width: s.width, height: s.height });
  }
  const desno = (t: string, y: number, velikost: number, font: PDFFont, barva: RGB) =>
    stran.drawText(t, { x: STRAN[0] - ROB - font.widthOfTextAtSize(t, velikost), y, size: velikost, font, color: barva });
  desno(`Delovni plan · ${plan.oddelek} · ${formatShort(plan.od)} – ${formatShort(plan.do)}`, vrh - 9, 10, f.krepka, BESEDILO);
  desno(`natisnjeno ${formatShort(toIso(new Date()))}`, vrh - 19, 7, f.navadna, SIVA);
  stran.drawRectangle({ x: ROB, y: vrh - 25, width: SIRINA, height: 1.5, color: ORANZNA });

  // delovno mesto
  const y = vrh - 45;
  stran.drawRectangle({ x: ROB, y: y - 3, width: 4, height: 18, color: ORANZNA });
  stran.drawText(c.naziv, { x: ROB + 11, y, size: 16, font: f.krepka, color: BESEDILO });
  const ure = c.koraki.reduce((s, k) => s + k.ure, 0);
  const povzetek = `${c.koraki.length} ${c.koraki.length === 1 ? "krovni nalog" : "krovnih nalogov"} · ${formatUre(ure)} h · privzeto ${formatNum(c.zaposleni)} oseb`;
  desno(povzetek, y + 2, 9, f.navadna, SIVA);
}

/** Največja velikost kartic, pri kateri gre cela celica na en list. */
function razporeditev(f: Pisave, koraki: WorkflowKorak[]) {
  const razpolozljivo = VRH_VSEBINE - DNO;
  for (let s = 1; ; s = Math.round((s - 0.02) * 100) / 100) {
    const vrste: number[] = [];
    for (let i = 0; i < koraki.length; i += STOLPCEV) {
      vrste.push(Math.max(...koraki.slice(i, i + STOLPCEV).map((k) => korak(null, f, k, 0, 0, 0, s))));
    }
    const skupaj = vrste.reduce((a, b) => a + b, 0) + (vrste.length - 1) * RAZMIK_VRST;
    if (skupaj <= razpolozljivo || s <= NAJMANJ) return { s, vrste };
  }
}

export async function ustvariPlanPdf(plan: WorkflowPlan): Promise<Blob> {
  if (plan.celice.length === 0) throw new Error("V prikazanem obdobju ni postavitev.");
  const { pdf, navadna, krepka, logo } = await novDokument(`Delovni plan ${plan.oddelek}`);
  const f = { navadna, krepka };

  for (const c of plan.celice) {
    const stran = pdf.addPage(STRAN);
    stran.drawRectangle({ x: 0, y: 0, width: STRAN[0], height: STRAN[1], color: OZADJE });
    glavaStrani(stran, f, logo, plan, c);
    const { s, vrste } = razporeditev(f, c.koraki);
    const sredinaPasice = (19 * s);
    let y = VRH_VSEBINE;
    let prejsnja: { x: number; dno: number } | null = null; // zadnji korak prejšnje vrste (za povezavo)

    vrste.forEach((visinaVrste, v) => {
      const vrsta = c.koraki.slice(v * STOLPCEV, v * STOLPCEV + STOLPCEV);
      // povezava iz zadnjega koraka prejšnje vrste v prvi korak te vrste
      if (prejsnja) {
        const sredina = y + RAZMIK_VRST / 2;
        const xPrvi = ROB + KORAK_W / 2;
        stran.drawLine({ start: { x: prejsnja.x, y: prejsnja.dno }, end: { x: prejsnja.x, y: sredina }, thickness: 2.2, color: ORANZNA });
        stran.drawLine({ start: { x: prejsnja.x, y: sredina }, end: { x: xPrvi, y: sredina }, thickness: 2.2, color: ORANZNA });
        puscica(stran, xPrvi, sredina, xPrvi, y + 1, "dol");
      }
      let dnoZadnjega = y;
      vrsta.forEach((k, j) => {
        const x = ROB + j * (KORAK_W + RAZMIK);
        dnoZadnjega = y - korak(stran, f, k, v * STOLPCEV + j + 1, x, y, s);
        if (j < vrsta.length - 1) puscica(stran, x + KORAK_W + 4, y - sredinaPasice, x + KORAK_W + RAZMIK - 3, y - sredinaPasice, "desno");
      });
      prejsnja = { x: ROB + (vrsta.length - 1) * (KORAK_W + RAZMIK) + KORAK_W / 2, dno: dnoZadnjega };
      y -= visinaVrste + RAZMIK_VRST;
    });
  }

  // noga
  const strani = pdf.getPages();
  const noga = `FINES d.o.o. | Production | Delovni plan ${plan.oddelek}`;
  strani.forEach((st, i) => {
    const desno = `Stran ${i + 1} / ${strani.length}`;
    st.drawText(noga, { x: ROB, y: ROB - 8, size: 7, font: navadna, color: SIVA });
    st.drawText(desno, { x: STRAN[0] - ROB - navadna.widthOfTextAtSize(desno, 7), y: ROB - 8, size: 7, font: navadna, color: SIVA });
  });
  const bajti = await pdf.save();
  return new Blob([bajti as BlobPart], { type: "application/pdf" });
}

export const imePlana = (plan: WorkflowPlan) => asciiIme(`Delovni_plan_${plan.oddelek}_${plan.od}`);

export async function prenesiPlanPdf(plan: WorkflowPlan) {
  prenesiDatoteko(await ustvariPlanPdf(plan), `${imePlana(plan)}.pdf`);
}
