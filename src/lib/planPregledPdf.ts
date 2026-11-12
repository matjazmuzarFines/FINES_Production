// Delovni plan - PREGLED (PDF za obešanje na celico / FIN:TV): poudarek na ROKIH. Vsaka celica na svojem listu A4
// pokončno. Pod naslovom razdelek "Plan po tednih" (tabela: krovni nalog, od - do, kosi po glavnih družinah - stolpci so
// vedno iste družine v istem vrstnem redu in širini). Nato časovnica: levo stolpec rokov, na sredini moderna puščica
// čez celotno časovnico z oštevilčenimi vozlišči, desno krovni nalogi kot kartice (oranžna zaobljena glava + osenčen
// okvir z razdelki: podatki, opozorila, tabela nalogov, opomba). Oranžna črta DANES pred prvim nedokončanim korakom.
// Oblika po skupnih gradnikih (porociloPdf.ts). Workflow PDF (planPdf.ts) kaže, KAJ je treba narediti; ta pregled,
// DO KDAJ. Modul se naloži šele ob kliku.
import {
  PDFName,
  drawSvgPath,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFArray,
  type PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFOperator,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { addDays, formatShort, isoWeek, mondayOf, toIso } from "./dates";
import { barvaCelice, besediloKosov, danKratko, ddmm, oznakaKoraka, type WorkflowCelica, type WorkflowKorak, type WorkflowPlan } from "./plan";
import {
  A4,
  BELA,
  CRTA,
  GLAVA_TABELE,
  ORANZNA,
  PRELIV,
  ROB,
  SIVA,
  TEMNA,
  VEL,
  asciiIme,
  glavaStrani,
  ikona,
  noga,
  novDokument,
  potZaobljen,
  prelomi,
  prenesiDatoteko,
  preliv,
  zaobljen,
  type Pisave,
} from "./porociloPdf";
import { formatNum, formatUre } from "./stevila";

/** Družine iz normativov: ident -> koda družine in seznam vseh kod (za stalne stolpce). */
export type DruzineNormativov = { poIdentu: Map<string, string>; vse: string[] };

const [W, H] = A4; // pokončno
const DNO = ROB + 24; // nad nogo
const SIRINA = W - 2 * ROB;

// Stolpci časovnice: roki | puščica časa | kartice
const DATUM_DESNO = ROB + 54;
const OS_X = ROB + 70;
const KARTICA_X = ROB + 92;
const KARTICA_W = W - ROB - KARTICA_X;

const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const mesaj = (a: RGB, b: RGB, t: number) => rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);

const RDECA = hex("D12E2E");
const RDECA_SVETLA = hex("FDECEC");
const ORANZNA_SVETLA = hex("E8803F");
const ORANZNA_BLEDA = hex("F6D9C6");
const OZADJE = hex("F5F6F8");
const ROB_OKVIRJA = hex("E1E4E8");
const SKUPINA = hex("ECEEF1");
const MINULO = hex("B9BEC6");
const SVETLO_NA_ORANZNI = hex("FDE6D6");

// Kartica
const GLAVA_MIN = 24;
const VRSTICA_NASLOVA = 13;
const VEL_NASLOVA = VEL.razdelek + 0.5;
const PAD = 9;
const PODATKI = 24;
const OPOZORILO = 15;
const GLAVA_TAB = 13;
const VRSTICA_TAB = 12.5;
const VRSTICA_TAB_DODATNA = VEL.tabela * 1.3;
const NAJVEC_NALOGOV = 12;
const VRSTICA_OPOMBE = VEL.besedilo * 1.4;
const RAZMAK = 16; // med karticami (prostor za DANES)
const DANES_VRH = 16; // DANES nad prvo kartico lista
const KONICA = 18; // prostor za konico puščice pod zadnjo kartico

const BREZ_DRUZINE = "Brez";
/** Glavna družina: brez pripone različice (OCB-e, OCB-k, OCB-o -> OCB). */
const glavnaDruzina = (koda: string) => koda.trim().replace(/-[a-z]+$/, "");

const kosiKoraka = (k: WorkflowKorak) => k.nalogi.reduce((s, n) => s + (n.kos ?? 0), 0);
const opozorilo = (k: WorkflowKorak) => k.brezKapacitete > 0;
const besediloNalogov = (n: number) => `${n} ${n === 1 ? "nalog" : n === 2 ? "naloga" : n <= 4 ? "nalogi" : "nalogov"}`;

const desnoPoravnano = (stran: PDFPage, t: string, xDesno: number, y: number, velikost: number, font: PDFFont, barva: RGB) =>
  stran.drawText(t, { x: xDesno - font.widthOfTextAtSize(t, velikost), y, size: velikost, font, color: barva });

/** Velikost pisave, pri kateri besedilo gre v širino (največ `najvec`). */
const vSirino = (t: string, font: PDFFont, najvec: number, sirina: number) => Math.min(najvec, (najvec * sirina) / Math.max(1, font.widthOfTextAtSize(t, najvec)));

// ---------------------------------------------------------------------
// List (stran) z glavo; nov list se doda, ko zmanjka prostora
// ---------------------------------------------------------------------
type Kontekst = { pdf: PDFDocument; f: Pisave; logo: PDFImage | null; plan: WorkflowPlan };
type List = { stran: PDFPage; y: number };

/** Glava strani in naslov celice. Vrne list z y pod naslovom. */
function novList(kx: Kontekst, c: WorkflowCelica, barva: RGB, nadaljevanje: boolean): List {
  const { f } = kx;
  const stran = kx.pdf.addPage([W, H]);
  let y = glavaStrani(stran, f, kx.logo, `Delovni plan - pregled · ${kx.plan.oddelek}`, H - ROB);
  y -= 15;
  zaobljen(stran, ROB, y - 4, 4.5, 20, 2, barva);
  const naziv = prelomi(c.naziv, f.krepka, 18, SIRINA - 12)[0] ?? "";
  stran.drawText(naziv, { x: ROB + 12, y, size: 18, font: f.krepka, color: TEMNA });
  y -= 14;
  const pod = `Do kdaj? Roki krovnih nalogov · ${formatShort(kx.plan.od)} – ${formatShort(kx.plan.do)}${nadaljevanje ? " (nadaljevanje)" : ""}`;
  stran.drawText(pod, { x: ROB + 12, y, size: VEL.besedilo, font: f.navadna, color: SIVA });
  return { stran, y: y - 18 };
}

// ---------------------------------------------------------------------
// Plan po tednih: krovni nalog | od - do | kosi po glavnih družinah
// ---------------------------------------------------------------------
type Teden = { pon: string; vrstice: { k: WorkflowKorak; kosi: Map<string, number> }[]; vsota: Map<string, number> };

/** Kosi koraka po tednih (sorazmerno planiranim uram po dnevih) in po glavnih družinah; zaokroženo kumulativno. */
function tedniCelice(c: WorkflowCelica, plan: WorkflowPlan, druzinaNaloga: (ident: string) => string): Teden[] {
  const tedni = new Map<string, Teden>();
  for (const k of c.koraki) {
    if (k.prosta) continue;
    // delež po tednih: planirane osebe (ure) po dnevih; brez ur -> teden začetka
    const delez = new Map<string, number>();
    plan.dnevi.forEach((d, i) => {
      if ((k.osebe[i] ?? 0) > 0) delez.set(mondayOf(d), (delez.get(mondayOf(d)) ?? 0) + k.osebe[i]);
    });
    if (!delez.size) delez.set(mondayOf(k.od < plan.od ? plan.od : k.od), 1);
    const skupaj = [...delez.values()].reduce((s, x) => s + x, 0);
    const poDruzinah = new Map<string, number>();
    for (const n of k.nalogi) {
      const d = druzinaNaloga(n.ident);
      poDruzinah.set(d, (poDruzinah.get(d) ?? 0) + (n.kos ?? 0));
    }
    const ponedeljki = [...delez.keys()].sort();
    let pred = 0; // kumulativni delež: zaokroževanje brez izgube kosov
    for (const pon of ponedeljki) {
      const po = pred + (delez.get(pon) ?? 0) / skupaj;
      const kosi = new Map<string, number>();
      for (const [d, vseh] of poDruzinah) {
        const v = Math.round(vseh * po) - Math.round(vseh * pred);
        if (v) kosi.set(d, v);
      }
      pred = po;
      const t: Teden = tedni.get(pon) ?? { pon, vrstice: [], vsota: new Map() };
      t.vrstice.push({ k, kosi });
      for (const [d, v] of kosi) t.vsota.set(d, (t.vsota.get(d) ?? 0) + v);
      tedni.set(pon, t);
    }
  }
  return [...tedni.values()].sort((a, b) => a.pon.localeCompare(b.pon));
}

const STOLPEC_KROVNI = 112;
const STOLPEC_OD_DO = 56;

function razdelekGlava(stran: PDFPage, f: Pisave, y: number, naslov: string, desno: string, h = 20) {
  preliv(stran, ROB, y - h, SIRINA, h, PRELIV);
  stran.drawRectangle({ x: ROB, y: y - h - 1.2, width: SIRINA, height: 1.2, color: ORANZNA });
  const iv = h * 0.55;
  ikona(stran, "matrika", ROB + 9, y - (h - iv) / 2, iv);
  const v = h === 20 ? VEL.razdelek : 8;
  stran.drawText(naslov, { x: ROB + 15 + iv, y: y - h / 2 - v * 0.36, size: v, font: f.polkrepka, color: BELA });
  if (desno) desnoPoravnano(stran, desno, ROB + SIRINA - 9, y - h / 2 - 2.7, VEL.besedilo - 0.5, f.navadna, hex("C9CED6"));
}

/** Razdelek "Plan po tednih" s tabelo; ob prelomu se tabela nadaljuje na novem listu. Vrne list pod razdelkom. */
function planPoTednih(kx: Kontekst, c: WorkflowCelica, barva: RGB, l: List, druzine: string[], druzinaNaloga: (ident: string) => string): List {
  const { f } = kx;
  const tedni = tedniCelice(c, kx.plan, druzinaNaloga);
  if (!tedni.length) return l;
  const notranja = SIRINA - 20;
  const vt = VEL.tabela;
  const P = 4;
  // širine družin: oznaka + odmik, preostanek enakomerno (odvisno samo od seznama družin - povsod enako)
  const potrebno = druzine.map((d) => f.polkrepka.widthOfTextAtSize(d, vt - 0.5) + 2 * P);
  const ostanek = Math.max(0, notranja - STOLPEC_KROVNI - STOLPEC_OD_DO - potrebno.reduce((a, b) => a + b, 0));
  const wD = potrebno.map((w) => w + ostanek / druzine.length);
  const xD = wD.map((_, i) => ROB + 10 + STOLPEC_KROVNI + STOLPEC_OD_DO + wD.slice(0, i).reduce((a, b) => a + b, 0));
  const vis = vt * 1.3;

  type Odsek = { stran: PDFPage; vrh: number; dno: number };
  const odseki: Odsek[] = [];
  let vrhOdseka = l.y;
  const glavaTabele = () => {
    const h = 15;
    zaobljen(l.stran, ROB + 10, l.y - h, notranja, h, [3, 3, 0, 0], GLAVA_TABELE);
    const tekst = (t: string, x: number, w: number, desno: boolean) => {
      const v = vSirino(t, f.polkrepka, vt - 0.5, w - 2 * P);
      const tx = desno ? x + w - P - f.polkrepka.widthOfTextAtSize(t, v) : x + P;
      l.stran.drawText(t, { x: tx, y: l.y - h / 2 - v * 0.36, size: v, font: f.polkrepka, color: BELA });
    };
    tekst("Krovni nalog", ROB + 10, STOLPEC_KROVNI, false);
    tekst("Od – do", ROB + 10 + STOLPEC_KROVNI, STOLPEC_OD_DO, false);
    druzine.forEach((d, i) => tekst(d, xD[i], wD[i], true));
    l.y -= h;
  };
  const zacni = (nadaljevanje: boolean) => {
    razdelekGlava(l.stran, f, l.y, nadaljevanje ? "Plan po tednih (nadaljevanje)" : "Plan po tednih", nadaljevanje ? "" : "kosi po družinah", nadaljevanje ? 14 : 20);
    l.y -= (nadaljevanje ? 14 : 20) + 11;
    glavaTabele();
  };
  /** Prostor za vrstico; sicer zapre okvir na tem listu in nadaljuje na novem. */
  const prostor = (h: number) => {
    if (l.y - h >= DNO + 10) return;
    odseki.push({ stran: l.stran, vrh: vrhOdseka, dno: l.y });
    l = novList(kx, c, barva, true);
    vrhOdseka = l.y;
    zacni(true);
  };
  const vrednosti = (kosi: Map<string, number>, y: number, font: PDFFont) =>
    druzine.forEach((d, i) => {
      const v = kosi.get(d);
      if (!v) return;
      const t = formatNum(v);
      desnoPoravnano(l.stran, t, xD[i] + wD[i] - P, y, vt, font, TEMNA);
    });

  // celoten razdelek skupaj z glavo in prvim tednom na isti list
  const prvi = 20 + 11 + 15 + 15 + tedni[0].vrstice.length * (VRSTICA_TAB + 4);
  if (l.y - Math.min(prvi, 250) < DNO + 10) l = novList(kx, c, barva, true);
  vrhOdseka = l.y;
  zacni(false);

  const skupaj = new Map<string, number>();
  tedni.forEach((t) => {
    // vrstica tedna: oznaka + vsote po družinah
    prostor(15 + VRSTICA_TAB);
    const h = 15;
    l.stran.drawRectangle({ x: ROB + 10, y: l.y - h, width: notranja, height: h, color: SKUPINA });
    l.stran.drawRectangle({ x: ROB + 10, y: l.y - h, width: 2.5, height: h, color: ORANZNA });
    l.stran.drawText(`Teden ${isoWeek(t.pon)} · ${ddmm(t.pon)} – ${ddmm(addDays(t.pon, 4))}`, { x: ROB + 18, y: l.y - h / 2 - 2.8, size: vt + 0.25, font: f.polkrepka, color: TEMNA });
    vrednosti(t.vsota, l.y - h / 2 - 2.8, f.polkrepka);
    for (const [d, v] of t.vsota) skupaj.set(d, (skupaj.get(d) ?? 0) + v);
    l.y -= h;
    t.vrstice.forEach((v) => {
      const krovni = prelomi(v.k.krovni, f.polkrepka, vt, STOLPEC_KROVNI - 2 * P);
      const hv = (krovni.length - 1) * vis + VRSTICA_TAB;
      prostor(hv);
      l.stran.drawRectangle({ x: ROB + 10, y: l.y - hv, width: notranja, height: hv, color: BELA });
      const y0 = l.y - VRSTICA_TAB / 2 - vt * 0.36;
      krovni.forEach((t2, j) => l.stran.drawText(t2, { x: ROB + 10 + P, y: y0 - j * vis, size: vt, font: f.polkrepka, color: TEMNA }));
      l.stran.drawText(`${ddmm(v.k.od)} – ${ddmm(v.k.do)}`, { x: ROB + 10 + STOLPEC_KROVNI + P, y: y0, size: vt, font: f.navadna, color: SIVA });
      vrednosti(v.kosi, y0, f.navadna);
      l.y -= hv;
      l.stran.drawRectangle({ x: ROB + 10, y: l.y, width: notranja, height: 0.5, color: CRTA });
    });
  });
  // skupaj
  prostor(16);
  const h = 15;
  zaobljen(l.stran, ROB + 10, l.y - h, notranja, h, [0, 0, 3, 3], GLAVA_TABELE);
  l.stran.drawText("Skupaj", { x: ROB + 10 + P, y: l.y - h / 2 - vt * 0.36, size: vt, font: f.polkrepka, color: BELA });
  druzine.forEach((d, i) => {
    const v = skupaj.get(d);
    if (!v) return;
    desnoPoravnano(l.stran, formatNum(v), xD[i] + wD[i] - P, l.y - h / 2 - vt * 0.36, vt, f.polkrepka, BELA);
  });
  l.y -= h;

  // osenčeni okvirji pod tabelo (na vsakem listu, čez katerega sega)
  odseki.push({ stran: l.stran, vrh: vrhOdseka, dno: l.y });
  for (const o of odseki) {
    const ops = drawSvgPath(potZaobljen(SIRINA, o.vrh - (o.dno - 10), 5), { x: ROB, y: o.vrh, scale: 1, color: OZADJE, borderColor: ROB_OKVIRJA, borderWidth: 0.6 });
    podlaga(kx.pdf, o.stran, ops);
  }
  l.y -= 10 + 18;
  return l;
}

/** Nariše pod obstoječo vsebino strani (svoj tok vsebine na začetku strani) - kot Pisec.podlaga. */
function podlaga(pdf: PDFDocument, stran: PDFPage, ops: PDFOperator[]) {
  const ctx = pdf.context;
  const ref = ctx.register(ctx.contentStream([pushGraphicsState(), ...ops, popGraphicsState()]));
  const vsebina = stran.node.normalizedEntries().Contents ?? ctx.obj([]);
  stran.node.set(PDFName.of("Contents"), vsebina);
  (vsebina as PDFArray).insert(0, ref);
}

// ---------------------------------------------------------------------
// Kartica krovnega naloga
// ---------------------------------------------------------------------
type Postavitev = {
  naslov: string[];
  glava: number;
  desno: string;
  nalogi: { n: WorkflowKorak["nalogi"][number]; naziv: string[]; druzina: string; h: number }[];
  vec: number;
  opomba: string[];
  opozorila: string[];
  h: number;
};

const ST_NALOGI = { st: 22, nalog: 64, druzina: 56, kos: 62 };
const sirinaNaziva = (wn: number) => wn - ST_NALOGI.st - ST_NALOGI.nalog - ST_NALOGI.druzina - ST_NALOGI.kos;

/** Vsebina in višina kartice (kartica se ne deli med listi, zato je število nalogov omejeno). */
function postaviKartico(k: WorkflowKorak, f: Pisave, druzinaNaloga: (ident: string) => string): Postavitev {
  const wn = KARTICA_W - 2 * PAD;
  const desno = oznakaKoraka(k);
  const naslov = prelomi(k.krovni, f.polkrepka, VEL_NASLOVA, KARTICA_W - 20 - f.navadna.widthOfTextAtSize(desno, VEL.besedilo) - 12);
  const glava = Math.max(GLAVA_MIN, 11 + naslov.length * VRSTICA_NASLOVA);
  const vec = k.nalogi.length > NAJVEC_NALOGOV ? k.nalogi.length - (NAJVEC_NALOGOV - 1) : 0;
  const nalogi = (vec ? k.nalogi.slice(0, NAJVEC_NALOGOV - 1) : k.nalogi).map((n) => {
    const naziv = prelomi(n.naziv ?? "", f.navadna, VEL.tabela, sirinaNaziva(wn) - 10);
    return { n, naziv, druzina: n.ident ? druzinaNaloga(n.ident) : "", h: VRSTICA_TAB + (naziv.length - 1) * VRSTICA_TAB_DODATNA };
  });
  const opomba = k.opomba ? prelomi(`Opomba: ${k.opomba}`, f.lezeca, VEL.besedilo, wn) : [];
  const opozorila = k.brezKapacitete > 0 ? [`${formatUre(k.brezKapacitete)} h brez kapacitete v planu`] : [];
  let h = glava + PAD + PODATKI;
  if (opozorila.length) h += 4 + opozorila.length * OPOZORILO;
  if (nalogi.length) h += 8 + GLAVA_TAB + nalogi.reduce((s, x) => s + x.h, 0) + (vec ? VRSTICA_TAB : 0);
  if (opomba.length) h += 8 + opomba.length * VRSTICA_OPOMBE;
  return { naslov, glava, desno, nalogi, vec, opomba, opozorila, h: h + PAD };
}

/** Moderna puščica časa: tanek trak s prelivom (bled -> oranžen) in konica v obliki puščice. */
function puscicaCasa(stran: PDFPage, od: number, do_: number) {
  const sir = 5;
  const konica = 16;
  const telo = od - do_ - konica + 4;
  if (telo <= 0) return;
  stran.drawCircle({ x: OS_X, y: od - sir / 2, size: sir / 2, color: ORANZNA_BLEDA });
  const korak = 3;
  for (let d = sir / 2; d < telo; d += korak) {
    const h = Math.min(korak + 0.4, telo - d);
    stran.drawRectangle({ x: OS_X - sir / 2, y: od - d - h, width: sir, height: h, color: mesaj(ORANZNA_BLEDA, ORANZNA, d / telo) });
  }
  stran.drawSvgPath(`M -10 0 L 0 4 L 10 0 L 0 ${konica + 4} Z`, { x: OS_X, y: od - telo + 4, color: ORANZNA });
}

/** Rok levo od puščice: dan, velik datum, začetek. */
function datumKoraka(stran: PDFPage, f: Pisave, k: WorkflowKorak, yS: number, minulo: boolean) {
  const barva = opozorilo(k) ? RDECA : minulo ? SIVA : TEMNA;
  desnoPoravnano(stran, `rok · ${danKratko(k.do)}`, DATUM_DESNO, yS + 8, VEL.majhno, f.navadna, SIVA);
  desnoPoravnano(stran, ddmm(k.do), DATUM_DESNO, yS - 5, 14, f.krepka, barva);
  desnoPoravnano(stran, `od ${danKratko(k.od)} ${ddmm(k.od)}`, DATUM_DESNO, yS - 15, VEL.majhno, f.navadna, SIVA);
}

/** Vozlišče na puščici: krog s številko koraka (minuli koraki sivi, opozorila rdeča). */
function vozlisce(stran: PDFPage, f: Pisave, st: number, yS: number, barva: RGB) {
  stran.drawLine({ start: { x: OS_X + 10, y: yS }, end: { x: KARTICA_X, y: yS }, thickness: 1, color: ROB_OKVIRJA });
  stran.drawCircle({ x: OS_X, y: yS, size: 12.5, color: BELA });
  stran.drawCircle({ x: OS_X, y: yS, size: 10.5, color: barva });
  const t = String(st);
  const v = st > 99 ? 7.5 : 9;
  stran.drawText(t, { x: OS_X - f.krepka.widthOfTextAtSize(t, v) / 2, y: yS - v * 0.36, size: v, font: f.krepka, color: BELA });
}

function kartica(stran: PDFPage, f: Pisave, k: WorkflowKorak, p: Postavitev, vrh: number) {
  const x = KARTICA_X;
  const w = KARTICA_W;
  const rdeca = opozorilo(k);
  zaobljen(stran, x, vrh - p.h, w, p.h, 6, OZADJE, rdeca ? RDECA : ROB_OKVIRJA, rdeca ? 1.2 : 0.6);
  preliv(stran, x, vrh - p.glava, w, p.glava, [ORANZNA, ORANZNA_SVETLA], 6);
  const yPrve = vrh - GLAVA_MIN / 2 - VEL_NASLOVA * 0.36;
  desnoPoravnano(stran, p.desno, x + w - 10, vrh - GLAVA_MIN / 2 - VEL.besedilo * 0.36, VEL.besedilo, f.navadna, SVETLO_NA_ORANZNI);
  p.naslov.forEach((t, i) => stran.drawText(t, { x: x + 10, y: yPrve - i * VRSTICA_NASLOVA, size: VEL_NASLOVA, font: f.polkrepka, color: BELA }));

  // podatki
  let y = vrh - p.glava - PAD;
  const xn = x + PAD;
  const wn = w - 2 * PAD;
  const kosov = kosiKoraka(k);
  const podatki: [string, string, RGB?][] = [
    ...(k.prosta ? ([["Vrsta", "Dodatno delo"]] as [string, string][]) : []),
    ["Začetek", `${danKratko(k.od)} ${ddmm(k.od)}`],
    ["Rok", `${danKratko(k.do)} ${ddmm(k.do)}`, rdeca ? RDECA : undefined],
    ["Planirano delo", `${formatUre(k.ure)} h`],
    ...(k.prosta ? [] : ([["Nalogi", besediloNalogov(k.nalogi.length)], ["Kosov", kosov ? formatNum(kosov) : "–"]] as [string, string][])),
  ];
  const wc = wn / 5;
  podatki.forEach(([o, v, b], i) => {
    const xp = xn + i * wc;
    stran.drawText(o, { x: xp, y: y - 7, size: VEL.majhno, font: f.navadna, color: SIVA });
    stran.drawText(v, { x: xp, y: y - 19, size: VEL.poudarek, font: f.polkrepka, color: b ?? TEMNA });
  });
  y -= PODATKI;

  // opozorila
  if (p.opozorila.length) {
    y -= 4;
    for (const o of p.opozorila) {
      const tw = f.polkrepka.widthOfTextAtSize(o, VEL.besedilo);
      zaobljen(stran, xn, y - 12, tw + 26, 12, 6, RDECA_SVETLA, RDECA, 0.6);
      stran.drawCircle({ x: xn + 8, y: y - 6, size: 2.2, color: RDECA });
      stran.drawText(o, { x: xn + 15, y: y - 9, size: VEL.besedilo, font: f.polkrepka, color: RDECA });
      y -= OPOZORILO;
    }
  }

  // tabela nalogov
  if (p.nalogi.length) {
    y -= 8;
    const st = [
      { n: "#", w: ST_NALOGI.st, desno: false },
      { n: "Nalog", w: ST_NALOGI.nalog, desno: false },
      { n: "Naziv", w: sirinaNaziva(wn), desno: false },
      { n: "Družina", w: ST_NALOGI.druzina, desno: false },
      { n: "Kos", w: ST_NALOGI.kos, desno: true },
    ];
    const P = 5;
    const vt = VEL.tabela;
    zaobljen(stran, xn, y - GLAVA_TAB, wn, GLAVA_TAB, [3, 3, 0, 0], GLAVA_TABELE);
    let xc = xn;
    for (const s of st) {
      const tx = s.desno ? xc + s.w - P - f.polkrepka.widthOfTextAtSize(s.n, vt - 0.5) : xc + P;
      stran.drawText(s.n, { x: tx, y: y - GLAVA_TAB / 2 - (vt - 0.5) * 0.36, size: vt - 0.5, font: f.polkrepka, color: BELA });
      xc += s.w;
    }
    y -= GLAVA_TAB;
    const vrstic = p.nalogi.length + (p.vec ? 1 : 0);
    p.nalogi.forEach(({ n, naziv, druzina, h }, i) => {
      const zadnja = i === vrstic - 1;
      zaobljen(stran, xn, y - h, wn, h, zadnja ? [0, 0, 3, 3] : 0, BELA);
      const y0 = y - VRSTICA_TAB / 2 - vt * 0.36;
      const celice: [string, PDFFont, RGB][] = [
        [String(i + 1), f.navadna, SIVA],
        [n.st_naloga, f.polkrepka, TEMNA],
        ["", f.navadna, TEMNA],
        [druzina, f.navadna, SIVA],
        [besediloKosov(n) || "–", f.navadna, TEMNA],
      ];
      let x2 = xn;
      celice.forEach(([t, font, barva], j) => {
        const s = st[j];
        if (j === 2) naziv.forEach((v, r) => stran.drawText(v, { x: x2 + P, y: y0 - r * VRSTICA_TAB_DODATNA, size: vt, font, color: barva }));
        else {
          const v = vSirino(t, font, vt, s.w - 2 * P);
          stran.drawText(t, { x: s.desno ? x2 + s.w - P - font.widthOfTextAtSize(t, v) : x2 + P, y: y0, size: v, font, color: barva });
        }
        x2 += s.w;
      });
      y -= h;
      if (!zadnja) stran.drawRectangle({ x: xn, y, width: wn, height: 0.5, color: CRTA });
    });
    if (p.vec) {
      zaobljen(stran, xn, y - VRSTICA_TAB, wn, VRSTICA_TAB, [0, 0, 3, 3], BELA);
      stran.drawText(`+ še ${besediloNalogov(p.vec)}`, { x: xn + ST_NALOGI.st + P, y: y - VRSTICA_TAB / 2 - vt * 0.36, size: vt, font: f.lezeca, color: SIVA });
      y -= VRSTICA_TAB;
    }
  }

  // opomba
  if (p.opomba.length) {
    y -= 8;
    for (const v of p.opomba) {
      stran.drawText(v, { x: xn, y: y - VEL.besedilo, size: VEL.besedilo, font: f.lezeca, color: SIVA });
      y -= VRSTICA_OPOMBE;
    }
  }
}

/** Oznaka DANES: oranžna črtkana črta čez list in značka nad stolpcem rokov. */
function danes(stran: PDFPage, f: Pisave, y: number) {
  stran.drawLine({ start: { x: ROB, y }, end: { x: W - ROB, y }, thickness: 1, color: ORANZNA, dashArray: [3, 2.5] });
  const t = `DANES ${ddmm(toIso(new Date()))}`;
  const w = f.krepka.widthOfTextAtSize(t, VEL.majhno) + 12;
  zaobljen(stran, DATUM_DESNO - w, y - 6, w, 12, 6, ORANZNA);
  stran.drawText(t, { x: DATUM_DESNO - w + 6, y: y - 2.4, size: VEL.majhno, font: f.krepka, color: BELA });
}

/** Časovnica s karticami od lista `l` naprej; kartica, ki ne gre na preostanek lista, gre na nov list. */
function casovnica(kx: Kontekst, c: WorkflowCelica, barva: RGB, l: List, kartice: Postavitev[], iDanes: number) {
  const { f } = kx;
  const danesIso = toIso(new Date());
  let i = 0;
  while (i < kartice.length) {
    // kartice na tem listu
    const vrhDanes = i === iDanes ? DANES_VRH : 0;
    let y = l.y - vrhDanes;
    const naListu: { i: number; vrh: number }[] = [];
    while (i < kartice.length && (naListu.length === 0 || y - kartice[i].h - KONICA >= DNO)) {
      if (naListu.length === 0 && y - kartice[i].h - KONICA < DNO && l.y < H - ROB - 120) break; // prazen začetek lista - nov list
      naListu.push({ i, vrh: y });
      y -= kartice[i].h + RAZMAK;
      i++;
    }
    if (!naListu.length) {
      l = novList(kx, c, barva, true);
      continue;
    }
    const dno = y + RAZMAK;
    puscicaCasa(l.stran, naListu[0].vrh + 4, dno - KONICA);
    naListu.forEach(({ i: ik, vrh }, j) => {
      const k = c.koraki[ik];
      const yS = vrh - GLAVA_MIN / 2;
      const minulo = k.do < danesIso;
      kartica(l.stran, f, k, kartice[ik], vrh);
      vozlisce(l.stran, f, ik + 1, yS, opozorilo(k) ? RDECA : minulo ? MINULO : ORANZNA);
      datumKoraka(l.stran, f, k, yS, minulo);
      if (ik === iDanes) danes(l.stran, f, j === 0 ? vrh + DANES_VRH - 2 : vrh + RAZMAK / 2);
    });
    if (i < kartice.length) l = novList(kx, c, barva, true);
  }
}

export async function ustvariPlanPregledPdf(plan: WorkflowPlan, druzine: DruzineNormativov): Promise<Blob> {
  if (plan.celice.length === 0) throw new Error("V prikazanem obdobju ni postavitev.");
  const { pdf, logo, ...f } = await novDokument(`Delovni plan - pregled ${plan.oddelek}`);
  const kx: Kontekst = { pdf, f, logo, plan };
  const danesIso = toIso(new Date());

  // stalni stolpci: vse glavne družine (abecedno) + "Brez"
  const stolpci = [...new Set(druzine.vse.map(glavnaDruzina).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  stolpci.push(BREZ_DRUZINE);
  const druzinaNaloga = (ident: string) => {
    const d = glavnaDruzina(druzine.poIdentu.get(ident) ?? "");
    return d && stolpci.includes(d) ? d : BREZ_DRUZINE;
  };

  plan.celice.forEach((c, ci) => {
    const barva = hex(barvaCelice(ci));
    let l = novList(kx, c, barva, false);
    l = planPoTednih(kx, c, barva, l, stolpci, druzinaNaloga);
    const kartice = c.koraki.map((k) => postaviKartico(k, f, druzinaNaloga));
    const iDanes = c.koraki[0] && c.koraki[0].od <= danesIso ? c.koraki.findIndex((k) => k.do >= danesIso) : -1;
    casovnica(kx, c, barva, l, kartice, iDanes);
  });

  noga(pdf, f.navadna, `FINES d.o.o. | Production | Delovni plan - pregled ${plan.oddelek} | levo: rok (velik datum) in začetek koraka`);
  const bajti = await pdf.save();
  return new Blob([bajti as BlobPart], { type: "application/pdf" });
}

export const imePregleda = (plan: WorkflowPlan) => asciiIme(`Delovni_plan_pregled_${plan.oddelek}_${plan.od}`);

export async function prenesiPlanPregledPdf(plan: WorkflowPlan, druzine: DruzineNormativov) {
  prenesiDatoteko(await ustvariPlanPregledPdf(plan, druzine), `${imePregleda(plan)}.pdf`);
}
