// PDF navodil za pakiranje: za vsako odpremo checklista (A4 pokončno) in listi z lokacijo za palete (A4 ležeče).
// Modul se naloži šele ob kliku (dinamičen import).
import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatShort, toIso } from "./dates";
import {
  IME_KATEGORIJE,
  imeLokacije,
  paleteOdpreme,
  skupinePostavk,
  steviloListov,
  type BarvaLista,
  type NastavitvePdf,
  type OdpremaPak,
  type PostavkaPak,
} from "./pakiranje";
import { A4, ROB, SIRINA, SIVA, TEMNA, asciiIme, novDokument, prelomi, prenesiDatoteko } from "./porociloPdf";
import { formatNum } from "./stevila";

const ORANZNA = rgb(202 / 255, 80 / 255, 16 / 255);
const RDECA = rgb(185 / 255, 28 / 255, 28 / 255);
const ZELENA = rgb(21 / 255, 128 / 255, 61 / 255);
const CRTA = rgb(0.86, 0.86, 0.87);
const GLAVA_TABELE = rgb(0.17, 0.17, 0.18);
const SKUPINA = rgb(0.9, 0.9, 0.91);
const LEZECE: [number, number] = [A4[1], A4[0]];
const NI_LOKACIJE = "LOKACIJA NI VPISANA";

const hexRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const jeBela = (hex: string) => hex.toUpperCase() === "#FFFFFF";

type Pisave = { navadna: PDFFont; krepka: PDFFont; logo: PDFImage | null };

/** Največja velikost pisave, pri kateri besedilo (do `maxVrstic` vrstic) ustreza okvirju. */
function prilagodi(t: string, font: PDFFont, sirina: number, visina: number, max: number, min: number, maxVrstic = 3) {
  for (let v = max; v > min; v -= 2) {
    const vrstice = prelomi(t, font, v, sirina);
    if (vrstice.length <= maxVrstic && vrstice.length * v * 1.12 <= visina) return { velikost: v, vrstice };
  }
  return { velikost: min, vrstice: prelomi(t, font, min, sirina) };
}

const sredina = (s: PDFPage, t: string, y: number, velikost: number, font: PDFFont, barva: RGB = TEMNA) =>
  s.drawText(t, { x: (s.getWidth() - font.widthOfTextAtSize(t, velikost)) / 2, y, size: velikost, font, color: barva });

// =====================================================================
// CHECKLISTA
// =====================================================================

/** Osnovna pisava tabele (9 pt = 12 px). Če checklista ne gre na 1 list, se manjša po 0,5 px do 11 px. */
const PISAVA = 9;
const PX = 0.75; // 1 px = 0,75 pt
const MIN_PISAVA = 11 * PX;
const KORAK_PISAVE = 0.5 * PX;
/** Nad toliko paletami se pisava ne manjša - checklista gre na več listov v osnovni velikosti. */
const MAX_PALET_ZA_1_LIST = 4;
const STOLPCI = [
  { naslov: "", sirina: 26 },
  { naslov: "Kol", sirina: 40, desno: true },
  { naslov: "EM", sirina: 30 },
  { naslov: "Ident", sirina: 86 },
  { naslov: "Naziv", sirina: 229 },
  { naslov: "Opomba", sirina: 100 },
];

function opombaPostavke(p: PostavkaPak): { t: string; barva: RGB } {
  if (p.izdano) return { t: "izdano iz skladišča", barva: ZELENA };
  if (p.pokrito === null || p.pokrito >= p.kolicina) return { t: "", barva: SIVA };
  return { t: p.pokrito > 0 ? `na zalogi samo ${formatNum(p.pokrito)}` : "ni na zalogi", barva: RDECA };
}

/** Vrstica tabele: naslov skupine ali postavka s količino. */
type VrstaTabele = { skupina: string; peci: number } | { p: PostavkaPak; kolicina: number };

/**
 * Piše checklisto od zgoraj navzdol; `y` je vedno zgornji rob naslednjega elementa.
 * Tabela je en blok: če ne gre na preostanek strani, gre cela na naslednjo stran.
 */
class Checklista {
  stran!: PDFPage;
  y = 0;
  /** y, kjer se začne vsebina strani (pod glavo) - stran je še prazna. */
  private vrhStrani = 0;
  private vTabeli = false;
  readonly strani: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly f: Pisave,
    private readonly d: OdpremaPak,
    private readonly barva: BarvaLista,
    /** true = tabela za vsako paleto posebej (1 peč na paleto). */
    private readonly poPaletah: boolean,
    /** Velikost pisave v tabeli (pt). */
    private readonly pisava = PISAVA,
  ) {}

  /** Merilo vrstic glede na osnovno pisavo. */
  private get k() {
    return this.pisava / PISAVA;
  }
  private get vrstica() {
    return this.pisava * 1.28;
  }

  novaStran(nadaljevanje = false) {
    this.stran = this.pdf.addPage(A4);
    this.strani.push(this.stran);
    this.y = A4[1] - ROB;
    const { logo, krepka, navadna } = this.f;
    if (logo) {
      const s = logo.scaleToFit(110, 28);
      this.stran.drawImage(logo, { x: ROB, y: this.y - s.height, width: s.width, height: s.height });
    }
    const naslov = "NAVODILO ZA PAKIRANJE";
    this.stran.drawText(naslov, { x: A4[0] - ROB - krepka.widthOfTextAtSize(naslov, 15), y: this.y - 13, size: 15, font: krepka, color: TEMNA });
    const pod = `Odprema ${this.d.stevilka}${nadaljevanje ? " (nadaljevanje)" : ""} · natisnjeno ${formatShort(toIso(new Date()))}`;
    this.stran.drawText(pod, { x: A4[0] - ROB - navadna.widthOfTextAtSize(pod, 8.5), y: this.y - 26, size: 8.5, font: navadna, color: SIVA });
    this.y -= 36;
    this.stran.drawRectangle({ x: ROB, y: this.y - 2, width: SIRINA, height: 2, color: ORANZNA });
    this.y -= 16;
    this.vrhStrani = this.y;
  }

  private get dno() {
    return ROB + 30;
  }

  /** Če zmanjka prostora, nova stran (sredi tabele, ki je večja od strani, z glavo tabele). */
  prostor(h: number) {
    if (this.y - h < this.dno) {
      this.novaStran(true);
      if (this.vTabeli) this.glavaTabele();
    }
  }

  /** Lokacija na barvnem ozadju (ista barva kot listi na paletah) in podatki odpreme. */
  uvod() {
    const { krepka, navadna } = this.f;
    const lokacija = imeLokacije(this.d);
    const lok = (lokacija ?? NI_LOKACIJE).toUpperCase();
    const { velikost, vrstice } = prilagodi(lok, krepka, SIRINA - 24, 64, 26, 12, 2);
    const vis = velikost * 1.15;
    const h = vrstice.length * vis + 18;
    const bela = jeBela(this.barva.hex);
    this.stran.drawRectangle({
      x: ROB,
      y: this.y - h,
      width: SIRINA,
      height: h,
      color: hexRgb(this.barva.hex),
      borderColor: bela ? CRTA : undefined,
      borderWidth: bela ? 1 : 0,
    });
    vrstice.forEach((v, i) =>
      this.stran.drawText(v, { x: ROB + 12, y: this.y - 9 - velikost * 0.8 - i * vis, size: velikost, font: krepka, color: lokacija ? TEMNA : RDECA }),
    );
    this.y -= h + 14;

    // Podatki v dveh stolpcih (manjše - za delavce je glavna tabela)
    const pari: [string, string][] = [
      ["Kupec", this.d.partner ?? "–"],
      ["Datum odpreme", this.d.datum ? formatShort(this.d.datum) : "–"],
      ["Odpremni nalog", this.d.stevilka],
      ["Naročilo VD200", this.d.narocilo ?? "–"],
      ["Kupčevo naročilo", this.d.kupcevo_narocilo ?? "–"],
      ["Država", this.d.drzava ?? "–"],
    ];
    const sirStolpca = (SIRINA - 20) / 2;
    for (let i = 0; i < pari.length; i += 2) {
      const vrsta = pari.slice(i, i + 2).map(([o, v]) => ({ o, vr: prelomi(v, krepka, 7.5, sirStolpca - 78) }));
      const visVrste = Math.max(...vrsta.map((x) => x.vr.length)) * 10;
      vrsta.forEach((x, j) => {
        const xx = ROB + j * (sirStolpca + 20);
        this.stran.drawText(x.o, { x: xx, y: this.y - 7, size: 7, font: navadna, color: SIVA });
        x.vr.forEach((t, k) => this.stran.drawText(t, { x: xx + 78, y: this.y - 7 - k * 10, size: 7.5, font: krepka, color: TEMNA }));
      });
      this.y -= visVrste + 2;
    }
    this.y -= 8;

    for (const o of this.d.opombe) {
      const vr = prelomi(`Opomba iz VD300: ${o}`, navadna, 9, SIRINA - 20);
      const h2 = vr.length * 12 + 10;
      this.stran.drawRectangle({ x: ROB, y: this.y - h2, width: SIRINA, height: h2, color: rgb(1, 0.98, 0.92) });
      this.stran.drawRectangle({ x: ROB, y: this.y - h2, width: 3, height: h2, color: rgb(0.96, 0.62, 0.04) });
      vr.forEach((t, k) => this.stran.drawText(t, { x: ROB + 10, y: this.y - 13 - k * 12, size: 9, font: navadna, color: rgb(0.55, 0.3, 0.05) }));
      this.y -= h2 + 6;
    }
    this.y -= 4;
  }

  /** Majhen povzetek desno nad glavo tabele. */
  povzetek(t: string) {
    const w = this.f.navadna.widthOfTextAtSize(t, 7.5);
    this.stran.drawText(t, { x: A4[0] - ROB - w, y: this.y - 8, size: 7.5, font: this.f.navadna, color: SIVA });
  }

  private get visGlave() {
    return Math.max(14, 18 * this.k);
  }
  private get visSkupine() {
    return Math.max(16, 20 * this.k);
  }

  glavaTabele() {
    const h = this.visGlave;
    this.stran.drawRectangle({ x: ROB, y: this.y - h, width: SIRINA, height: h, color: GLAVA_TABELE });
    let x = ROB;
    for (const s of STOLPCI) {
      const t = s.naslov.toUpperCase();
      const w = this.f.krepka.widthOfTextAtSize(t, 7);
      this.stran.drawText(t, { x: s.desno ? x + s.sirina - 4 - w : x + 4, y: this.y - h / 2 - 2.5, size: 7, font: this.f.krepka, color: rgb(1, 1, 1) });
      x += s.sirina;
    }
    this.y -= h;
  }

  skupina(naslov: string, peci: number) {
    const h = this.visSkupine;
    this.prostor(h + this.visGlave);
    this.stran.drawRectangle({ x: ROB, y: this.y - h, width: SIRINA, height: h, color: SKUPINA });
    this.stran.drawRectangle({ x: ROB, y: this.y - h, width: 3, height: h, color: GLAVA_TABELE });
    this.stran.drawText(naslov, { x: ROB + 9, y: this.y - h / 2 - 3.3, size: this.pisava + 0.5, font: this.f.krepka, color: TEMNA });
    if (peci > 0) {
      const t = `${formatNum(peci)} ${peci === 1 ? "peč" : "peči"}`;
      this.stran.drawText(t, { x: A4[0] - ROB - 8 - this.f.navadna.widthOfTextAtSize(t, 8.5), y: this.y - h / 2 - 3, size: 8.5, font: this.f.navadna, color: SIVA });
    }
    this.y -= h;
  }

  private celicePostavke(p: PostavkaPak, kolicina: number) {
    const { navadna, krepka } = this.f;
    const op = opombaPostavke(p);
    const celice = ["", formatNum(kolicina), p.em.toLowerCase(), p.ident, p.opis ?? "", op.t];
    const pisava = (i: number) => (i === 1 || i === 3 || (i === 4 && p.kategorija === "pec") ? krepka : navadna);
    const vr = celice.map((c, i) => (c ? prelomi(c, pisava(i), this.pisava, STOLPCI[i].sirina - 8) : []));
    const h = Math.max(24 * this.k, Math.max(...vr.map((v) => v.length)) * this.vrstica + 10 * this.k);
    return { op, pisava, vr, h };
  }

  postavka(p: PostavkaPak, kolicina = p.kolicina) {
    const { op, pisava, vr, h } = this.celicePostavke(p, kolicina);
    this.prostor(h);
    const vrh = this.y;
    const sredinaVrste = vrh - h / 2;
    const kv = 13 * Math.min(1, this.k + 0.1);
    // Okvirček za kljukico - na sredini vrstice
    this.stran.drawRectangle({ x: ROB + 7, y: sredinaVrste - kv / 2, width: kv, height: kv, borderColor: TEMNA, borderWidth: 1.2 });
    let x = ROB;
    vr.forEach((vrstice, i) => {
      const s = STOLPCI[i];
      // Besedilo celice navpično na sredini vrstice (osnovnica = sredina bloka + 1/3 velikosti pisave)
      const prva = sredinaVrste + ((vrstice.length - 1) * this.vrstica) / 2 - this.pisava * 0.33;
      vrstice.forEach((t, k) => {
        const w = pisava(i).widthOfTextAtSize(t, this.pisava);
        this.stran.drawText(t, {
          x: s.desno ? x + s.sirina - 4 - w : x + 4,
          y: prva - k * this.vrstica,
          size: this.pisava,
          font: pisava(i),
          color: i === 5 ? op.barva : TEMNA,
        });
      });
      x += s.sirina;
    });
    this.y -= h;
    this.stran.drawRectangle({ x: ROB, y: this.y, width: SIRINA, height: 0.5, color: CRTA });
  }

  /** Višina tabele (naslov + glava + vrstice). */
  private visinaTabele(vrste: VrstaTabele[], naslov: boolean) {
    return (
      (naslov ? 16 : 12) +
      this.visGlave +
      vrste.reduce((s, v) => s + ("skupina" in v ? this.visSkupine : this.celicePostavke(v.p, v.kolicina).h), 0)
    );
  }

  /** Cela tabela na eni strani: če ne gre na preostanek strani, začne na novi strani. */
  private tabelaBlok(vrste: VrstaTabele[], naslov: { levo: string; sivo?: string } | null, povzetek: string | null, presledek: number) {
    const { krepka, navadna } = this.f;
    const h = this.visinaTabele(vrste, !!naslov) + presledek;
    if (this.y - h < this.dno && this.y < this.vrhStrani) this.novaStran(true);
    else this.y -= presledek;
    if (naslov) {
      this.stran.drawText(naslov.levo, { x: ROB, y: this.y - 11, size: 11, font: krepka, color: TEMNA });
      if (naslov.sivo)
        this.stran.drawText(naslov.sivo, { x: ROB + krepka.widthOfTextAtSize(naslov.levo, 11) + 10, y: this.y - 11, size: 8.5, font: navadna, color: SIVA });
    }
    if (povzetek) this.povzetek(povzetek);
    this.y -= naslov ? 16 : 12;
    this.glavaTabele();
    this.vTabeli = true;
    for (const v of vrste) {
      if ("skupina" in v) this.skupina(v.skupina, v.peci);
      else this.postavka(v.p, v.kolicina);
    }
    this.vTabeli = false;
  }

  /** Število tabel na checklisti (palete ali 1). */
  steviloTabel() {
    return this.poPaletah ? Math.max(1, paleteOdpreme(this.d).length) : 1;
  }

  tabela() {
    const povzetek = `${formatNum(this.d.peci)} ${this.d.peci === 1 ? "peč" : "peči"} · ${this.d.stPostavk} postavk`;
    const palete = this.poPaletah ? paleteOdpreme(this.d) : [];

    if (palete.length > 1) {
      // Vsaka paleta svoja manjša tabela: naslov, glava, postavke s količino za to paleto
      palete.forEach((pl, i) =>
        this.tabelaBlok(
          pl.postavke.map((x) => ({ p: x.p, kolicina: x.kolicina })),
          { levo: `PALETA ${i + 1} / ${palete.length}`, sivo: pl.pec?.opis ?? undefined },
          i === 0 ? povzetek : null,
          i === 0 ? 0 : 14,
        ),
      );
      return;
    }

    const skupine = skupinePostavk(this.d.postavke.filter((p) => p.kategorija !== "storitev"));
    const vrste: VrstaTabele[] = skupine.flatMap((sk) => {
      const peci = sk.postavke.filter((p) => p.kategorija === "pec").reduce((s, p) => s + p.kolicina, 0);
      const naslov = sk.naslov ?? (skupine.length > 1 ? "Ostale postavke" : null);
      return [...(naslov ? [{ skupina: naslov, peci }] : []), ...sk.postavke.map((p) => ({ p, kolicina: p.kolicina }))];
    });
    this.tabelaBlok(vrste, null, povzetek, 0);
    if (this.d.stPostavk === 0) {
      this.stran.drawText("Odprema nima postavk za pakiranje.", { x: ROB + 4, y: this.y - 14, size: 10, font: this.f.navadna, color: SIVA });
      this.y -= 20;
    }
  }

  /** Storitve (se ne pakirajo) in prazno polje za ročno opombo po tisku. */
  noga() {
    const { navadna, krepka } = this.f;
    const storitve = this.d.postavke.filter((p) => p.kategorija === "storitev");
    if (storitve.length) {
      this.y -= 6;
      const t = `${IME_KATEGORIJE.storitev.mnozina} (se ne pakirajo): ${storitve.map((p) => `${p.opis ?? p.ident} × ${formatNum(p.kolicina)}`).join(", ")}`;
      for (const v of prelomi(t, navadna, 8.5, SIRINA)) {
        this.prostor(12);
        this.stran.drawText(v, { x: ROB, y: this.y - 9, size: 8.5, font: navadna, color: SIVA });
        this.y -= 12;
      }
    }
    this.y -= 12;
    const h = 62;
    this.prostor(h + 4);
    this.stran.drawRectangle({ x: ROB, y: this.y - h, width: SIRINA, height: h, borderColor: TEMNA, borderWidth: 0.8 });
    this.stran.drawText("Opomba", { x: ROB + 6, y: this.y - 12, size: 8.5, font: krepka, color: SIVA });
    for (const k of [1, 2]) this.stran.drawRectangle({ x: ROB + 6, y: this.y - 14 - k * 16, width: SIRINA - 12, height: 0.4, color: CRTA });
    this.y -= h;
  }
}

// =====================================================================
// LIST Z LOKACIJO (paleta)
// =====================================================================

function listLokacije(pdf: PDFDocument, f: Pisave, d: OdpremaPak, barva: BarvaLista, paleta: { i: number; n: number; pec: string | null } | null) {
  const s = pdf.addPage(LEZECE);
  const [W, H] = LEZECE;
  const r = 30;
  const { krepka, navadna, logo } = f;
  const bela = jeBela(barva.hex);

  // Zgoraj: odprema in datum levo, paleta desno
  const levo = `Odprema ${d.stevilka}${d.datum ? `  ·  ${formatShort(d.datum)}` : ""}`;
  s.drawText(levo, { x: r, y: H - r - 18, size: 18, font: krepka, color: TEMNA });
  if (paleta && paleta.n > 1) {
    const t = `PALETA ${paleta.i} / ${paleta.n}`;
    s.drawText(t, { x: W - r - krepka.widthOfTextAtSize(t, 26), y: H - r - 22, size: 26, font: krepka, color: TEMNA });
  }

  // Sredina: lokacija na barvnem ozadju
  const lokacija = imeLokacije(d);
  const lok = (lokacija ?? NI_LOKACIJE).toUpperCase();
  const { velikost, vrstice } = prilagodi(lok, krepka, W - 2 * r - 50, H - 230, 150, 28, 3);
  const vis = velikost * 1.12;
  const visPasu = vrstice.length * vis + 50;
  const yPas = (H - visPasu) / 2 - 4;
  s.drawRectangle({
    x: r,
    y: yPas,
    width: W - 2 * r,
    height: visPasu,
    color: hexRgb(barva.hex),
    borderColor: bela ? TEMNA : undefined,
    borderWidth: bela ? 2 : 0,
  });
  const prva = yPas + visPasu - 25 - velikost * 0.8;
  vrstice.forEach((v, i) => sredina(s, v, prva - i * vis, velikost, krepka, lokacija ? TEMNA : RDECA));

  // Spodaj: kupec in peč na tej paleti
  let y = yPas - 34;
  if (d.partner) {
    sredina(s, d.partner.trim(), y, 20, navadna, SIVA);
    y -= 28;
  }
  if (paleta?.pec) sredina(s, paleta.pec, y, 16, krepka, TEMNA);

  if (logo) {
    const sl = logo.scaleToFit(90, 22);
    s.drawImage(logo, { x: r, y: r - 6, width: sl.width, height: sl.height });
  }
}

// =====================================================================
// IZVOZ
// =====================================================================

/**
 * Checklista na 1 list: če ne gre, se pisava tabele manjša po 0,5 px do 11 px.
 * Če tudi tako ne gre ali je palet več kot MAX_PALET_ZA_1_LIST, ostane osnovna velikost
 * in vsaka tabela je cela na eni strani (ne prelomi se).
 */
function narisiChecklisto(pdf: PDFDocument, f: Pisave, d: OdpremaPak, b: BarvaLista, poPaletah: boolean) {
  const narisi = (pisava: number) => {
    const c = new Checklista(pdf, f, d, b, poPaletah, pisava);
    c.novaStran();
    c.uvod();
    c.tabela();
    c.noga();
    return c;
  };
  const odstrani = (c: Checklista) => {
    for (const s of [...c.strani].reverse()) pdf.removePage(pdf.getPages().indexOf(s));
  };

  const c = narisi(PISAVA);
  if (c.strani.length === 1 || c.steviloTabel() > MAX_PALET_ZA_1_LIST) return c;
  for (let v = PISAVA - KORAK_PISAVE; v >= MIN_PISAVA - 0.001; v -= KORAK_PISAVE) {
    const manjsa = narisi(v);
    if (manjsa.strani.length === 1) {
      odstrani(c);
      return manjsa;
    }
    odstrani(manjsa);
  }
  return c;
}

/** PDF za izbrane odpreme: po vrsti checklista in listi z lokacijo (vsaka odprema skupaj). */
export async function prenesiNavodilaPdf(odpreme: OdpremaPak[], n: NastavitvePdf, barva: (d: OdpremaPak) => BarvaLista, ime: string) {
  const { pdf, navadna, krepka, logo } = await novDokument("Navodila za pakiranje");
  const f = { navadna, krepka, logo };
  const checkliste: PDFPage[] = [];

  for (const d of odpreme) {
    const b = barva(d);
    checkliste.push(...narisiChecklisto(pdf, f, d, b, n.listi === "pec").strani);

    const listov = steviloListov(d, n.listi);
    const palete = n.listi === "pec" ? paleteOdpreme(d) : [];
    for (let k = 0; k < listov; k++)
      listLokacije(pdf, f, d, b, n.listi === "pec" ? { i: k + 1, n: listov, pec: palete[k]?.pec?.opis ?? null } : null);
  }

  // Noga samo na checklistah (list z lokacijo ostane čist)
  checkliste.forEach((s, i) => {
    const levo = "FINES d.o.o. | Production | Navodilo za pakiranje";
    const desno = `Stran ${i + 1} / ${checkliste.length}`;
    s.drawRectangle({ x: ROB, y: ROB - 2, width: SIRINA, height: 0.5, color: CRTA });
    s.drawText(levo, { x: ROB, y: ROB - 16, size: 8, font: navadna, color: SIVA });
    s.drawText(desno, { x: A4[0] - ROB - navadna.widthOfTextAtSize(desno, 8), y: ROB - 16, size: 8, font: navadna, color: SIVA });
  });

  const bajti = await pdf.save();
  prenesiDatoteko(new Blob([bajti as BlobPart], { type: "application/pdf" }), `${asciiIme(ime)}.pdf`);
}
