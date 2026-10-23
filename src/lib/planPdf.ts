// Delovni plan kot workflow v PDF: za vsako delovno mesto (celico) en list A4 (ležeče) s koraki (krovni nalogi)
// v vrstnem redu začetka, povezanimi s puščicami. Za obešanje na celico - velike, berljive oznake.
// 1. stran je prerazporeditev zaposlenih: ena tabela za vse celice - koliko oseb dela na katerem krovnem nalogu
// po dnevih (planirane ure / ure na dan). Celica je vedno na enem listu: do 3 koraki v vrsti, do 6 na list; če ne gre, se kartice sorazmerno pomanjšajo.
// Modul se naloži šele ob kliku (dinamičen import).
import { degrees, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatShort, toIso } from "./dates";
import { barvaCelice, besediloKosov, besediloOdprem, danInDatum, danKratko, ddmm, nalogiKoraka, oznakaKoraka, type WorkflowCelica, type WorkflowKorak, type WorkflowPlan } from "./plan";
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
const SVETLO_ZELENA = rgb(220 / 255, 245 / 255, 228 / 255);
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
      ? 9 * s +
        13 * s +
        nalogi.reduce((sum, n, i) => sum + 12 * s + (nazivi[i].length + (n.odpreme.length ? 1 : 0)) * m.vrsticaNaziva + 2 * s, 0) +
        (vec ? 11 * s : 0)
      : 0) +
    (opomba.length ? 6 * s + opomba.length * 10 * s + 2 * s : 0) +
    8 * s;
  if (!stran) return visina;

  // okvir in temna pasica
  const robBarva = k.poOdpremi || k.brezKapacitete > 0 ? RDECA : k.delni ? ORANZNA : CRTA;
  const r = 9 * s;
  zaobljen(stran, x, yZgoraj, KORAK_W, visina, r, { color: BELA, borderColor: robBarva, borderWidth: k.poOdpremi || k.delni ? 2 : 1 });
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
  stran.drawText(k.prosta ? "DODATNO DELO" : "KROVNI NALOG", { x: kx, y: yZgoraj - 12 * s, size: 6 * s, font: f.krepka, color: SVETLO_SIVA });
  stran.drawText(skrajsaj(k.krovni, f.krepka, 18 * s, KORAK_W - 130 * s), { x: kx, y: yZgoraj - 30 * s, size: 18 * s, font: f.krepka, color: BELA });

  // cel / delni krovni (značka desno v pasici)
  const nt = oznakaKoraka(k);
  const nv = 8.5 * s;
  const nw = sirinaZnacke(nt, nv, f.krepka);
  znacka(stran, nt, x + KORAK_W - m.pad - nw, sy - nv * 0.35, nv, f.krepka, k.delni ? ORANZNA : k.vseh === null ? SIVA : ZELENA, BELA);

  // začetek -> konec
  let y = yZgoraj - m.pasica - 13 * s;
  const x2 = x + KORAK_W / 2 + 6 * s;
  stran.drawText("ZAČETEK", { x: x + m.pad, y, size: 6.5 * s, font: f.krepka, color: SIVA });
  stran.drawText("KONEC", { x: x2, y, size: 6.5 * s, font: f.krepka, color: SIVA });
  if (k.poOdpremi) {
    const t = "PO ODPREMI";
    const v = 7 * s;
    znacka(stran, t, x + KORAK_W - m.pad - sirinaZnacke(t, v, f.krepka), y, v, f.krepka, RDECA, BELA);
  }
  y -= 17 * s;
  stran.drawText(danInDatum(k.od), { x: x + m.pad, y, size: 14 * s, font: f.krepka, color: BESEDILO });
  stran.drawText(danInDatum(k.do), { x: x2, y, size: 14 * s, font: f.krepka, color: k.poOdpremi ? RDECA : BESEDILO });
  stran.drawText("→", { x: x2 - 15 * s, y: y + 1 * s, size: 11 * s, font: f.krepka, color: SVETLO_SIVA });

  // ure in prva odprema
  y -= 13 * s;
  const info = `${formatUre(k.ure)} h${k.prvaOdprema ? ` · prva odprema ${ddmm(k.prvaOdprema)}` : ""}`;
  stran.drawText(info, { x: x + m.pad, y, size: 8.5 * s, font: f.navadna, color: k.poOdpremi ? RDECA : SIVA });
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
      const kos = besediloKosov(n);
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
      if (n.odpreme.length) {
        y -= m.vrsticaNaziva;
        const oznaka = "ODPREMA";
        const ow = f.krepka.widthOfTextAtSize(oznaka, 6.5 * s) + 5 * s;
        stran.drawText(oznaka, { x: x + m.pad + 8 * s, y: y + 0.5 * s, size: 6.5 * s, font: f.krepka, color: SIVA });
        stran.drawText(skrajsaj(besediloOdprem(n.odpreme, 6), f.krepka, m.naziv, sirinaBesedila - 8 * s - ow), {
          x: x + m.pad + 8 * s + ow,
          y,
          size: m.naziv,
          font: f.krepka,
          color: n.odpreme[0] < k.do ? RDECA : ORANZNA,
        });
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

function glava(stran: PDFPage, f: Pisave, logo: PDFImage | null, plan: WorkflowPlan, naslov: string, povzetek: string) {
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

  const y = vrh - 45;
  stran.drawRectangle({ x: ROB, y: y - 3, width: 4, height: 18, color: ORANZNA });
  stran.drawText(naslov, { x: ROB + 11, y, size: 16, font: f.krepka, color: BESEDILO });
  desno(povzetek, y + 2, 9, f.navadna, SIVA);
}

function glavaCelice(stran: PDFPage, f: Pisave, logo: PDFImage | null, plan: WorkflowPlan, c: WorkflowCelica) {
  const ure = c.koraki.reduce((s, k) => s + k.ure, 0);
  glava(
    stran,
    f,
    logo,
    plan,
    c.naziv,
    `${c.koraki.length} ${c.koraki.length === 1 ? "krovni nalog" : "krovnih nalogov"} · ${formatUre(ure)} h · privzeto ${formatNum(c.zaposleni)} oseb`,
  );
}

// =====================================================================
// PRERAZPOREDITEV ZAPOSLENIH (1. stran): ena tabela za vse celice -
// vrstica na korak, stolpec na dan, v celici število oseb; levo navpično ime celice.
// =====================================================================
const LJ_PAD = 10;
const LJ_PAS = 24; // navpični pas z imenom celice
const LJ_LABEL = 165; // stolpec s krovnimi nalogi
const LJ_GLAVA = 24; // vrstica z dnevi
const LJ_MAX_DAN = 62;
const LJ_MAX_VRSTICA = 16;
const LJ_MIN_VRSTICA = 10;
const LJ_RAZMIK_SKUPIN = 5;

const osebeBesedilo = (n: number) => formatNum(Math.round(n * 10) / 10);
/** Prosti ljudje po dnevih: zaposleni na celici - planirane osebe. */
const prosti = (c: WorkflowCelica) =>
  c.zaposleniPoDnevih.map((z, i) => Math.max(0, Math.round((z - c.koraki.reduce((s, k) => s + k.osebe[i], 0)) * 10) / 10));
/** Vrstice celice v tabeli: koraki, zaposleni in (če so) prosti. */
const vrsticCelice = (c: WorkflowCelica) => c.koraki.length + 1 + (prosti(c).some((p) => p > 0) ? 1 : 0);

/** Navpično ime celice: ena vrstica, če gre; sicer dve (prelom pri presledku blizu sredine). */
function imeCelice(f: Pisave, naziv: string, visinaVrstic: number) {
  const sirina = (t: string, v: number) => f.krepka.widthOfTextAtSize(t, v);
  if (sirina(naziv, 7) + 10 <= visinaVrstic || !naziv.includes(" ")) {
    let velikost = 9;
    while (velikost > 7 && sirina(naziv, velikost) + 10 > visinaVrstic) velikost -= 0.25;
    return { vrstice: [naziv], velikost, visina: Math.max(visinaVrstic, sirina(naziv, velikost) + 10) };
  }
  const besede = naziv.split(" ");
  let najboljsa: string[] = [naziv];
  let najmanj = Infinity;
  for (let i = 1; i < besede.length; i++) {
    const v = [besede.slice(0, i).join(" "), besede.slice(i).join(" ")];
    const w = Math.max(...v.map((x) => sirina(x, 7)));
    if (w < najmanj) [najmanj, najboljsa] = [w, v];
  }
  return { vrstice: najboljsa, velikost: 7, visina: Math.max(visinaVrstic, najmanj + 10) };
}
/** Višina skupine celice v tabeli (vrstice ali, če je ime daljše, ime). */
const visinaSkupine = (f: Pisave, c: WorkflowCelica, h: number) => imeCelice(f, c.naziv, vrsticCelice(c) * h).visina;

/** Celice razdeli na strani (celica se ne deli) in določi višino vrstice, da gre vse na čim manj strani. */
function straniLjudi(f: Pisave, celice: WorkflowCelica[]) {
  const razpolozljivo = VRH_VSEBINE - DNO - 2 * LJ_PAD - LJ_GLAVA;
  const potrebno = (cs: WorkflowCelica[], h: number) => cs.reduce((s, c) => s + visinaSkupine(f, c, h), 0) + (cs.length - 1) * LJ_RAZMIK_SKUPIN;
  const vse = celice.reduce((s, c) => s + vrsticCelice(c), 0);
  const h = Math.max(LJ_MIN_VRSTICA, Math.min(LJ_MAX_VRSTICA, (razpolozljivo - (celice.length - 1) * LJ_RAZMIK_SKUPIN) / vse));
  const strani: WorkflowCelica[][] = [[]];
  for (const c of celice) {
    const zadnja = strani[strani.length - 1];
    if (zadnja.length && potrebno([...zadnja, c], h) > razpolozljivo) strani.push([c]);
    else zadnja.push(c);
  }
  return { h, strani };
}

/** Nariše tabelo prerazporeditve za podane celice čez celo stran. */
function tabelaLjudi(stran: PDFPage, f: Pisave, plan: WorkflowPlan, celice: WorkflowCelica[], h: number) {
  const n = plan.dnevi.length;
  const xL = ROB + LJ_PAD;
  const dw = Math.min(LJ_MAX_DAN, (SIRINA - 2 * LJ_PAD - LJ_PAS - LJ_LABEL) / n);
  const xDan = (i: number) => xL + LJ_PAS + LJ_LABEL + i * dw;
  const sirinaMreze = LJ_PAS + LJ_LABEL + n * dw;
  const visinaMreze = celice.reduce((s, c) => s + visinaSkupine(f, c, h), 0) + (celice.length - 1) * LJ_RAZMIK_SKUPIN;
  const yVrh = VRH_VSEBINE;
  const visina = 2 * LJ_PAD + LJ_GLAVA + visinaMreze;
  zaobljen(stran, ROB, yVrh, SIRINA, visina, 8, { color: BELA, borderColor: CRTA, borderWidth: 1 });
  const pisava = Math.min(7.5, h * 0.52);

  // glava dni
  const vrhMreze = yVrh - LJ_PAD;
  const dnoMreze = vrhMreze - LJ_GLAVA - visinaMreze;
  stran.drawText("ŠT. OSEB NA KROVNEM NALOGU PO DNEVIH", { x: xL, y: vrhMreze - 15, size: 7, font: f.krepka, color: SIVA });
  plan.dnevi.forEach((d, i) => {
    const sredina = xDan(i) + dw / 2;
    const dan = danKratko(d);
    const datum = ddmm(d);
    stran.drawText(dan, { x: sredina - f.krepka.widthOfTextAtSize(dan, 6.5) / 2, y: vrhMreze - 9, size: 6.5, font: f.krepka, color: SIVA });
    stran.drawText(datum, { x: sredina - f.krepka.widthOfTextAtSize(datum, 7.5) / 2, y: vrhMreze - 19, size: 7.5, font: f.krepka, color: BESEDILO });
    if (i > 0 && dan === "Pon")
      stran.drawLine({ start: { x: xDan(i), y: vrhMreze }, end: { x: xDan(i), y: dnoMreze }, thickness: 0.8, color: SVETLO_SIVA });
  });

  /** Ploščica s številom oseb v vrstici z zgornjim robom yV. */
  const ploscica = (i: number, yV: number, t: string, ozadje: RGB, barva: RGB) => {
    zaobljen(stran, xDan(i) + 1.5, yV - 1.2, dw - 3, h - 2.4, 3, { color: ozadje });
    stran.drawText(t, { x: xDan(i) + dw / 2 - f.krepka.widthOfTextAtSize(t, pisava) / 2, y: yV - h / 2 - pisava * 0.36, size: pisava, font: f.krepka, color: barva });
  };
  const oznaka = (yV: number, t: string, barva: RGB) =>
    stran.drawText(t, { x: xL + LJ_PAS + 6, y: yV - h / 2 - pisava * 0.36, size: Math.min(7, pisava), font: f.krepka, color: barva });

  let y = vrhMreze - LJ_GLAVA;
  celice.forEach((c, ci) => {
    if (ci > 0) {
      y -= LJ_RAZMIK_SKUPIN;
      stran.drawRectangle({ x: xL, y: y + LJ_RAZMIK_SKUPIN / 2, width: sirinaMreze, height: 0.8, color: CRTA });
    }
    const ime = imeCelice(f, c.naziv, vrsticCelice(c) * h);
    const hex = barvaCelice(plan.celice.indexOf(c));
    const barva = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);

    // navpično ime celice (od spodaj navzgor)
    zaobljen(stran, xL, y - 0.8, LJ_PAS - 4, ime.visina - 1.6, 4, { color: barva });
    const sredinaPasu = xL + (LJ_PAS - 4) / 2;
    ime.vrstice.forEach((v, i) => {
      const t = skrajsaj(v, f.krepka, ime.velikost, ime.visina - 8);
      const odmik = (i - (ime.vrstice.length - 1) / 2) * ime.velikost * 1.1; // 1. vrstica levo
      stran.drawText(t, {
        x: sredinaPasu + odmik + ime.velikost * 0.36,
        y: y - ime.visina + (ime.visina - f.krepka.widthOfTextAtSize(t, ime.velikost)) / 2,
        size: ime.velikost,
        font: f.krepka,
        color: BELA,
        rotate: degrees(90),
      });
    });

    // koraki (številka kot na kartici celice)
    c.koraki.forEach((k, j) => {
      const yV = y - j * h;
      if (j % 2 === 1) stran.drawRectangle({ x: xL + LJ_PAS, y: yV - h, width: sirinaMreze - LJ_PAS, height: h, color: OZADJE });
      const cy = yV - h / 2;
      const r = Math.min(5.5, h * 0.36);
      const xk = xL + LJ_PAS + 6;
      stran.drawCircle({ x: xk + r, y: cy, size: r, color: barva });
      const st = String(j + 1);
      stran.drawText(st, { x: xk + r - f.krepka.widthOfTextAtSize(st, r * 1.2) / 2, y: cy - r * 0.42, size: r * 1.2, font: f.krepka, color: BELA });
      const kw = f.krepka.widthOfTextAtSize(k.krovni, pisava + 0.5);
      stran.drawText(k.krovni, { x: xk + 2 * r + 5, y: cy - pisava * 0.36, size: pisava + 0.5, font: f.krepka, color: BESEDILO });
      stran.drawText(nalogiKoraka(k), { x: xk + 2 * r + 9 + kw, y: cy - pisava * 0.36, size: pisava - 0.5, font: f.navadna, color: SIVA });
      k.osebe.forEach((o, i) => {
        if (o > 0) ploscica(i, yV, osebeBesedilo(o), barva, BELA);
      });
    });

    // zaposleni na celici in prosti
    let yV = y - c.koraki.length * h;
    stran.drawRectangle({ x: xL + LJ_PAS, y: yV - 0.4, width: sirinaMreze - LJ_PAS, height: 0.8, color: SVETLO_SIVA });
    oznaka(yV, "ZAPOSLENI NA CELICI", BESEDILO);
    c.zaposleniPoDnevih.forEach((z, i) => ploscica(i, yV, z > 0 ? osebeBesedilo(z) : "–", z > 0 ? TEMNA : OZADJE, z > 0 ? BELA : SIVA));
    const prosto = prosti(c);
    if (prosto.some((p) => p > 0)) {
      yV -= h;
      oznaka(yV, "PROSTO (brez naloga)", ZELENA);
      prosto.forEach((p, i) => {
        if (p > 0) ploscica(i, yV, osebeBesedilo(p), SVETLO_ZELENA, ZELENA);
      });
    }
    y -= ime.visina;
  });
}

/** Največja velikost kartic, pri kateri gre cela celica na en list (pod vrhom vrh). */
function razporeditev(f: Pisave, koraki: WorkflowKorak[], vrh: number) {
  const razpolozljivo = vrh - DNO;
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

  const novaStran = () => {
    const stran = pdf.addPage(STRAN);
    stran.drawRectangle({ x: 0, y: 0, width: STRAN[0], height: STRAN[1], color: OZADJE });
    return stran;
  };

  // 1. stran: prerazporeditev zaposlenih (če ne gre na en list, se nadaljuje)
  const { h, strani: skupine } = straniLjudi(f, plan.celice);
  const stKorakov = plan.celice.reduce((s, c) => s + c.koraki.length, 0);
  skupine.forEach((celice, i) => {
    const stran = novaStran();
    const povzetek = `${plan.celice.length} ${plan.celice.length === 1 ? "celica" : "celic"} · ${stKorakov} krovnih nalogov · številka = korak na listu celice`;
    glava(stran, f, logo, plan, `PRERAZPOREDITEV ZAPOSLENIH${i > 0 ? " (nadaljevanje)" : ""}`, povzetek);
    tabelaLjudi(stran, f, plan, celice, h);
  });

  // od 2. strani: koraki po celicah
  for (const c of plan.celice) {
    const stran = novaStran();
    glavaCelice(stran, f, logo, plan, c);
    const vrh = VRH_VSEBINE;
    const { s, vrste } = razporeditev(f, c.koraki, vrh);
    const sredinaPasice = 19 * s;
    let y = vrh;
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
