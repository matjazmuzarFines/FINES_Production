// Skupni gradniki PDF dokumentov (pdf-lib + pisava Inter zaradi č, š, ž in sodobnega videza) in e-mailov za Outlook (.eml).
// Oblika (app_instructions.md → Izvoz → PDF): kompaktna glava, naslov s podnaslovom, razdelki z glavo v prelivu
// (ikona + naslov) in osenčenim okvirjem, tabele s temno glavo, noga. Uporabljajo jo Gemba walk, Auditi in drugi PDF-ji.
// Modul se naloži šele ob kliku (dinamičen import).
import fontkit from "@pdf-lib/fontkit";
import {
  LineCapStyle,
  PDFArray,
  PDFDocument,
  PDFName,
  degrees,
  drawSvgPath,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFOperator,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { formatShort, toIso } from "./dates";
import { vBloke, type Del } from "./obogatenoBesedilo";
import { asciiIme, prenesiDatoteko } from "./prenos";
import { prenesiPrilogo, type Priloga } from "./priloge";

export const A4: [number, number] = [595.28, 841.89];
export const ROB = 36;
export const SIRINA = A4[0] - 2 * ROB;

// Barve
export const ORANZNA = rgb(202 / 255, 80 / 255, 16 / 255);
export const TEMNA = rgb(0.11, 0.12, 0.14);
export const SIVA = rgb(0.42, 0.44, 0.48);
export const BELA = rgb(1, 1, 1);
export const CRTA = rgb(0.88, 0.89, 0.91);
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
/** Preliv glave razdelka (temno siva -> modro siva). */
export const PRELIV: [RGB, RGB] = [hex("#2b313b"), hex("#566070")];
const OZADJE_RAZDELKA = hex("#f5f6f8");
const ROB_RAZDELKA = hex("#e1e4e8");
export const GLAVA_TABELE = hex("#353b45");
const SKUPINA = hex("#eceef1");
const OZADJE_SLIKE = hex("#eef0f2");
const SVETLO_BESEDILO = hex("#c9ced6");

/** Velikosti pisave (pt): naslov razdelka 10,5 (14 px), poudarek 9 (12 px), besedilo 8,25 (11 px). */
export const VEL = { naslov: 14, razdelek: 10.5, poudarek: 9, besedilo: 8.25, tabela: 7.75, majhno: 6.75 };

// Ikone (lucide, viewBox 24) za glave razdelkov
export const IKONE = {
  podatki: "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M12 11h4 M12 16h4 M8 11h.01 M8 16h.01",
  zapisnik: "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4 M2 6h4 M2 10h4 M2 14h4 M2 18h4 M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
  akcije: "M13 5h8 M13 12h8 M13 19h8 M3 17l2 2 4-4 M3 7l2 2 4-4",
  priloge: "M16 6l-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",
  slike: "M22 11l-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16 M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2 M12 7a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M10 2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z",
  ugotovitve: "M8 11l2 2 4-4 M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M21 21l-4.3-4.3",
  matrika: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z M3 9h18 M3 15h18 M9 3v18 M15 3v18",
  paket: "M12 22V12 M16 17l2 2 4-4 M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753 M3.29 7 12 12l8.71-5 M7.5 4.27l8.997 5.148",
  info: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M12 16v-4 M12 8h.01",
} as const;
export type Ikona = keyof typeof IKONE;

// ---------------------------------------------------------------------------
// Pomožno

export const naloziBajte = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Prenos ni uspel: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
};

export type Pisave = {
  navadna: PDFFont;
  /** SemiBold - poudarki, naslovi razdelkov, glave tabel. */
  polkrepka: PDFFont;
  krepka: PDFFont;
  lezeca: PDFFont;
  krepkaLezeca: PDFFont;
};

/**
 * Nov PDF s pisavami in logotipom (null, če se ne naloži).
 * Privzeto Inter; "dejavu" samo za dokumente s posebnimi pravili (workflow plan).
 */
export async function novDokument(naslov: string, pisava: "inter" | "dejavu" = "inter") {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(naslov);
  pdf.setAuthor("FINES d.o.o.");
  const vgradi = (ime: string) => naloziBajte(`/fonts/${ime}.ttf`).then((b) => pdf.embedFont(b, { subset: true }));
  const logoP = naloziBajte("/fines-logo.png")
    .then((b) => pdf.embedPng(b))
    .catch(() => null);
  let f: Pisave;
  if (pisava === "dejavu") {
    const [navadna, krepka] = await Promise.all([vgradi("DejaVuSans"), vgradi("DejaVuSans-Bold")]);
    f = { navadna, polkrepka: krepka, krepka, lezeca: navadna, krepkaLezeca: krepka };
  } else {
    const [navadna, polkrepka, krepka, lezeca, krepkaLezeca] = await Promise.all(
      ["Inter-Regular", "Inter-SemiBold", "Inter-Bold", "Inter-Italic", "Inter-BoldItalic"].map(vgradi),
    );
    f = { navadna, polkrepka, krepka, lezeca, krepkaLezeca };
  }
  return { pdf, ...f, logo: await logoP };
}

/** Slika ali skica -> pomanjšan JPG v PDF (bela podlaga). Ob napaki PDF nastane brez slike. */
export async function vgradiSliko(pdf: PDFDocument, p: Priloga, maxStranica = 1400): Promise<PDFImage | null> {
  try {
    const bmp = await createImageBitmap(await prenesiPrilogo(p));
    const k = Math.min(1, maxStranica / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const jpg = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("jpg"))), "image/jpeg", 0.82));
    return await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Razbije besedilo v vrstice, ki ustrezajo širini (upošteva prelome vrstic in predolge besede). */
export function prelomi(besedilo: string, font: PDFFont, velikost: number, sirina: number): string[] {
  const vrstice: string[] = [];
  for (const odstavek of besedilo.replace(/\r/g, "").replace(/\t/g, "  ").split("\n")) {
    let vrstica = "";
    for (const beseda of odstavek.split(/\s+/).filter(Boolean)) {
      const kandidat = vrstica ? `${vrstica} ${beseda}` : beseda;
      if (font.widthOfTextAtSize(kandidat, velikost) <= sirina) {
        vrstica = kandidat;
        continue;
      }
      if (vrstica) vrstice.push(vrstica);
      let ostanek = beseda;
      while (font.widthOfTextAtSize(ostanek, velikost) > sirina) {
        let n = ostanek.length;
        while (n > 1 && font.widthOfTextAtSize(ostanek.slice(0, n), velikost) > sirina) n--;
        vrstice.push(ostanek.slice(0, n));
        ostanek = ostanek.slice(n);
      }
      vrstica = ostanek;
    }
    vrstice.push(vrstica);
  }
  return vrstice;
}

/** SVG pot zaobljenega pravokotnika (izhodišče levo zgoraj, y navzdol); r = [levo zgoraj, desno zgoraj, desno spodaj, levo spodaj]. */
export function potZaobljen(w: number, h: number, r: number | [number, number, number, number]) {
  const [a, b, c, d] = (typeof r === "number" ? [r, r, r, r] : r).map((x) => Math.max(0, Math.min(x, w / 2, h / 2)));
  return (
    `M${a} 0H${w - b}` +
    (b ? `A${b} ${b} 0 0 1 ${w} ${b}` : "") +
    `V${h - c}` +
    (c ? `A${c} ${c} 0 0 1 ${w - c} ${h}` : "") +
    `H${d}` +
    (d ? `A${d} ${d} 0 0 1 0 ${h - d}` : "") +
    `V${a}` +
    (a ? `A${a} ${a} 0 0 1 ${a} 0` : "") +
    "Z"
  );
}

/** Zaobljen pravokotnik; y = spodnji rob (kot drawRectangle). */
export function zaobljen(
  stran: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number],
  barva?: RGB,
  obroba?: RGB,
  debelina = 0.6,
) {
  stran.drawSvgPath(potZaobljen(w, h, r), { x, y: y + h, color: barva, borderColor: obroba, borderWidth: obroba ? debelina : 0 });
}

/** Vodoraven preliv (levo -> desno) z zaobljenimi zgornjimi koti; y = spodnji rob. */
export function preliv(stran: PDFPage, x: number, y: number, w: number, h: number, barvi: [RGB, RGB] = PRELIV, r = 5) {
  const [a, b] = barvi;
  let dx = 0;
  while (dx < w) {
    const korak = dx < r || dx > w - r - 1 ? 0.5 : 3;
    const sredina = Math.min(dx + korak / 2, w);
    const kot = sredina < r ? r - sredina : sredina > w - r ? sredina - (w - r) : 0;
    const zamik = kot ? r - Math.sqrt(r * r - kot * kot) : 0;
    const t = sredina / w;
    stran.drawRectangle({
      x: x + dx,
      y,
      width: Math.min(korak + 0.4, w - dx),
      height: h - zamik,
      color: rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t),
    });
    dx += korak;
  }
}

/** Ikona (lucide, črte) velikosti `vel` z levim zgornjim kotom v (x, yVrh). */
export function ikona(stran: PDFPage, ime: Ikona, x: number, yVrh: number, vel: number, barva: RGB = BELA) {
  stran.drawSvgPath(IKONE[ime], {
    x,
    y: yVrh,
    scale: vel / 24,
    borderColor: barva,
    borderWidth: 2,
    borderLineCap: LineCapStyle.Round,
  });
}

/** Kompaktna glava strani: logo levo, naslov dokumenta in datum tiska desno, tanka oranžna črta. Vrne y pod glavo. */
export function glavaStrani(stran: PDFPage, f: Pisave, logo: PDFImage | null, naslovDokumenta: string, yVrh: number, levo = ROB, desno = A4[0] - ROB) {
  if (logo) {
    const s = logo.scaleToFit(84, 22);
    stran.drawImage(logo, { x: levo, y: yVrh - s.height, width: s.width, height: s.height });
  }
  const w1 = f.polkrepka.widthOfTextAtSize(naslovDokumenta, 9.5);
  stran.drawText(naslovDokumenta, { x: desno - w1, y: yVrh - 9, size: 9.5, font: f.polkrepka, color: TEMNA });
  const dat = `Natisnjeno: ${formatShort(toIso(new Date()))}`;
  stran.drawText(dat, { x: desno - f.navadna.widthOfTextAtSize(dat, VEL.majhno), y: yVrh - 19, size: VEL.majhno, font: f.navadna, color: SIVA });
  const y = yVrh - 28;
  stran.drawRectangle({ x: levo, y, width: desno - levo, height: 1.5, color: ORANZNA });
  return y - 14;
}

/** Noga na vseh straneh: "FINES d.o.o. | projekt | dokument" levo, "Stran x / y" desno. */
export function noga(pdf: PDFDocument, font: PDFFont, besedilo: string, rob = ROB, samo?: PDFPage[]) {
  const strani = samo ?? pdf.getPages();
  strani.forEach((s, i) => {
    const { width } = s.getSize();
    const desno = `Stran ${i + 1} / ${strani.length}`;
    s.drawRectangle({ x: rob, y: rob - 6, width: width - 2 * rob, height: 0.5, color: CRTA });
    s.drawText(besedilo, { x: rob, y: rob - 17, size: VEL.majhno, font, color: SIVA });
    s.drawText(desno, { x: width - rob - font.widthOfTextAtSize(desno, VEL.majhno), y: rob - 17, size: VEL.majhno, font, color: SIVA });
  });
}

export type Stolpec = { naslov: string; sirina: number; desno?: boolean };
export type Vrstica = { celice: string[]; skupina?: undefined; poudari?: number[] } | { skupina: string; celice?: undefined };

type Odsek = { stran: PDFPage; vrh: number; dno: number };

const PAD = 10; // notranji odmik razdelka
const NOTRANJA = SIRINA - 2 * PAD; // širina vsebine razdelka
const GLAVA_RAZDELKA = 20;
const GLAVA_NADALJEVANJA = 14;
const RAZMAK = 10; // med razdelki
/** Pod glavo razdelka do vrha prve vrstice besedila. */
const POD_GLAVO = PAD + 5;
/** Največ prostora, ki ga ima vsebina na prazni strani (za "premakni celo na novo stran"). */
const MAX_VISINA = A4[1] - 2 * ROB - 24;
/** Prostor, ki ga porabi oznaka (naslov sklopa v razdelku). */
export const VISINA_OZNAKE = 18;

/** Piše dokument od zgoraj navzdol in sam doda novo stran, ko zmanjka prostora. */
export class Pisec {
  stran: PDFPage;
  y: number;
  /** Levi rob in širina vsebine (znotraj razdelka sta zamaknjena za notranji odmik). */
  levo = ROB;
  sirina = SIRINA;
  private razdelekNaslov: string | null = null;
  private odseki: Odsek[] = [];
  private odsekVrh = 0;

  private constructor(
    readonly pdf: PDFDocument,
    readonly f: Pisave,
    readonly logo: PDFImage | null,
  ) {
    this.stran = pdf.addPage(A4);
    this.y = A4[1] - ROB;
  }

  get navadna() {
    return this.f.navadna;
  }
  get krepka() {
    return this.f.krepka;
  }
  get polkrepka() {
    return this.f.polkrepka;
  }

  static async ustvari(naslov: string) {
    const { pdf, logo, ...f } = await novDokument(naslov);
    return new Pisec(pdf, f, logo);
  }

  novaStran() {
    if (this.razdelekNaslov !== null) this.odseki.push({ stran: this.stran, vrh: this.odsekVrh, dno: this.y });
    this.stran = this.pdf.addPage(A4);
    this.y = A4[1] - ROB;
    if (this.razdelekNaslov !== null) {
      this.odsekVrh = this.y;
      this.glavaRazdelka(`${this.razdelekNaslov} (nadaljevanje)`, null, GLAVA_NADALJEVANJA, 8);
      this.y -= GLAVA_NADALJEVANJA + POD_GLAVO;
    }
  }

  /** true = začela se je nova stran. */
  prostor(visina: number) {
    if (this.y - visina < ROB + 24) {
      this.novaStran();
      return true;
    }
    return false;
  }

  tekst(t: string, x: number, velikost: number, font = this.navadna, barva: RGB = TEMNA) {
    this.stran.drawText(t, { x, y: this.y, size: velikost, font, color: barva });
  }

  desno(t: string, y: number, velikost: number, font: PDFFont, barva: RGB = TEMNA) {
    this.stran.drawText(t, { x: A4[0] - ROB - font.widthOfTextAtSize(t, velikost), y, size: velikost, font, color: barva });
  }

  glava(naslovDokumenta: string) {
    this.y = glavaStrani(this.stran, this.f, this.logo, naslovDokumenta, this.y);
  }

  /** Naslov dokumenta in podnaslov (tema) tik pod njim. */
  naslov(t: string, pod?: string) {
    this.y -= VEL.naslov - 3;
    this.tekst(t, ROB, VEL.naslov, this.krepka);
    if (pod) {
      this.y -= 12.5;
      this.tekst(pod, ROB, VEL.besedilo, this.navadna, SIVA);
    }
    this.y -= 16;
  }

  private glavaRazdelka(t: string, ime: Ikona | null, h: number, vel: number, desno?: string) {
    const vrh = this.y;
    preliv(this.stran, ROB, vrh - h, SIRINA, h);
    this.stran.drawRectangle({ x: ROB, y: vrh - h - 1.2, width: SIRINA, height: 1.2, color: ORANZNA });
    let x = ROB + 9;
    if (ime) {
      const iv = h * 0.55;
      ikona(this.stran, ime, x, vrh - (h - iv) / 2, iv);
      x += iv + 6;
    }
    this.stran.drawText(t, { x, y: vrh - h / 2 - vel * 0.36, size: vel, font: this.f.polkrepka, color: BELA });
    if (desno) {
      const w = this.navadna.widthOfTextAtSize(desno, VEL.besedilo - 0.5);
      this.stran.drawText(desno, { x: ROB + SIRINA - 9 - w, y: vrh - h / 2 - 2.7, size: VEL.besedilo - 0.5, font: this.navadna, color: SVETLO_BESEDILO });
    }
  }

  /** Nov razdelek: glava v prelivu z ikono, vsebina v osenčenem okvirju. potrebno = prostor pod glavo. */
  razdelek(t: string, ime: Ikona | null = null, potrebno = 50, desno?: string) {
    this.zapriRazdelek();
    // potrebno = višina vsebine (ali njenega prvega dela), ki mora biti na isti strani kot glava
    this.prostor(Math.min(GLAVA_RAZDELKA + POD_GLAVO + potrebno, MAX_VISINA));
    this.razdelekNaslov = t;
    this.odsekVrh = this.y;
    this.glavaRazdelka(t, ime, GLAVA_RAZDELKA, VEL.razdelek, desno);
    this.y -= GLAVA_RAZDELKA + POD_GLAVO;
    this.levo = ROB + PAD;
    this.sirina = SIRINA - 2 * PAD;
  }

  /** Zapre odprt razdelek in pod vsebino nariše osenčen okvir (na vsaki strani, čez katero sega). */
  zapriRazdelek() {
    if (this.razdelekNaslov === null) return;
    this.odseki.push({ stran: this.stran, vrh: this.odsekVrh, dno: this.y + 2 });
    for (const o of this.odseki) {
      const dno = o.dno - PAD + 6;
      this.podlaga(
        o.stran,
        drawSvgPath(potZaobljen(SIRINA, o.vrh - dno, 5), {
          x: ROB,
          y: o.vrh,
          scale: 1,
          color: OZADJE_RAZDELKA,
          borderColor: ROB_RAZDELKA,
          borderWidth: 0.6,
        }),
      );
    }
    this.y = this.odseki[this.odseki.length - 1].dno - PAD + 6 - RAZMAK;
    this.odseki = [];
    this.razdelekNaslov = null;
    this.levo = ROB;
    this.sirina = SIRINA;
  }

  /** Nariše pod obstoječo vsebino strani (nov tok vsebine na začetku strani). */
  private podlaga(stran: PDFPage, ops: PDFOperator[]) {
    const ctx = this.pdf.context;
    const ref = ctx.register(ctx.contentStream([pushGraphicsState(), ...ops, popGraphicsState()]));
    const vsebina = stran.node.normalizedEntries().Contents ?? ctx.obj([]);
    stran.node.set(PDFName.of("Contents"), vsebina);
    (vsebina as PDFArray).insert(0, ref);
  }

  /** Kompatibilnost: podnaslov = razdelek brez ikone. */
  podnaslov(t: string, potrebno = 50, ime: Ikona | null = null) {
    this.razdelek(t, ime, potrebno);
  }

  /** Manjši naslov znotraj razdelka (oranžen kvadratek + polkrepko besedilo). */
  oznaka(t: string, potrebno = 40) {
    this.y -= 5;
    // sklop (oznaka + vsebina) gre cel na novo stran, če ne gre na preostanek (in gre na prazno stran)
    this.prostor(Math.min(potrebno, MAX_VISINA - GLAVA_NADALJEVANJA - POD_GLAVO));
    zaobljen(this.stran, this.levo, this.y + 1, 4.5, 4.5, 1.2, ORANZNA);
    this.tekst(t, this.levo + 8, VEL.poudarek, this.f.polkrepka);
    this.y -= 13;
  }

  /** Tabela oznaka / vrednost v 1 ali 2 stolpcih. */
  pari(pari: [string, string][], stolpcev: 1 | 2 = 2) {
    const RAZ = 18;
    const sirinaStolpca = (this.sirina - (stolpcev - 1) * RAZ) / stolpcev;
    const sirinaOznake = Math.min(96, sirinaStolpca * 0.4);
    const vis = 12.5;
    for (let i = 0; i < pari.length; i += stolpcev) {
      const vrsta = pari.slice(i, i + stolpcev).map(([o, v]) => ({
        o,
        vrstice: prelomi(v || "–", this.f.polkrepka, VEL.poudarek, sirinaStolpca - sirinaOznake),
      }));
      const visina = Math.max(...vrsta.map((c) => c.vrstice.length)) * vis;
      this.prostor(visina + 4);
      vrsta.forEach((c, j) => {
        const x = this.levo + j * (sirinaStolpca + RAZ);
        this.stran.drawText(c.o, { x, y: this.y, size: VEL.besedilo, font: this.navadna, color: SIVA });
        c.vrstice.forEach((v, k) =>
          this.stran.drawText(v, { x: x + sirinaOznake, y: this.y - k * vis, size: VEL.poudarek, font: this.f.polkrepka, color: TEMNA }),
        );
      });
      this.y -= visina + 4;
    }
  }

  besedilo(t: string, velikost = VEL.besedilo, barva: RGB = TEMNA) {
    const vis = velikost * 1.45;
    for (const v of prelomi(t, this.navadna, velikost, this.sirina)) {
      this.prostor(vis);
      this.tekst(v, this.levo, velikost, this.navadna, barva);
      this.y -= vis;
    }
  }

  /** Besedilo iz urejevalnika (HTML ali staro navadno): naslovi, alineje, številčenje, krepko, ležeče, podčrtano, prečrtano. */
  obogateno(v: string, velikost = VEL.besedilo) {
    const ZAMIK = 16;
    type Kos = Del & { w: number; font: PDFFont; presledek: boolean };
    const pisava = (d: Del) =>
      d.b && d.i ? this.f.krepkaLezeca : d.b ? this.f.krepka : d.i ? this.f.lezeca : this.navadna;
    // DejaVu nima ležeče - nagnemo navadno
    const nagni = this.f.lezeca === this.f.navadna;
    for (const b of vBloke(v)) {
      const vel = b.vrsta === "h" ? VEL.poudarek + 0.5 : velikost;
      const vis = vel * 1.45;
      const x0 = this.levo + b.nivo * ZAMIK;
      const sirina = this.sirina - b.nivo * ZAMIK;
      if (b.vrsta === "h") this.y -= 5;

      // razbij na besede in presledke, prelomi v vrstice
      const vrstice: Kos[][] = [[]];
      let sir = 0;
      const nova = () => {
        const z = vrstice[vrstice.length - 1];
        while (z.length && z[z.length - 1].presledek) z.pop();
        vrstice.push([]);
        sir = 0;
      };
      for (const d of b.deli) {
        const font = pisava(d);
        d.t.split("\n").forEach((odsek, i) => {
          if (i) nova();
          for (const t of odsek.replace(/\t/g, "  ").split(/(\s+)/).filter(Boolean)) {
            const presledek = /^\s+$/.test(t);
            const z = vrstice[vrstice.length - 1];
            if (presledek) {
              if (!z.length) continue;
              const w = font.widthOfTextAtSize(" ", vel);
              z.push({ ...d, t: " ", w, font, presledek });
              sir += w;
              continue;
            }
            let ostanek = t;
            let w = font.widthOfTextAtSize(ostanek, vel);
            if (sir + w > sirina && z.length) nova();
            // predolga beseda: razbij po znakih
            while (w > sirina) {
              let n = ostanek.length;
              while (n > 1 && font.widthOfTextAtSize(ostanek.slice(0, n), vel) > sirina) n--;
              vrstice[vrstice.length - 1].push({ ...d, t: ostanek.slice(0, n), w: font.widthOfTextAtSize(ostanek.slice(0, n), vel), font, presledek: false });
              nova();
              ostanek = ostanek.slice(n);
              w = font.widthOfTextAtSize(ostanek, vel);
            }
            if (ostanek) {
              vrstice[vrstice.length - 1].push({ ...d, t: ostanek, w, font, presledek: false });
              sir += w;
            }
          }
        });
      }

      vrstice.forEach((vr, i) => {
        this.prostor(vis);
        if (i === 0 && b.oznaka) {
          const w = this.f.polkrepka.widthOfTextAtSize(b.oznaka, vel);
          this.stran.drawText(b.oznaka, { x: x0 - 5 - w, y: this.y, size: vel, font: this.f.polkrepka, color: ORANZNA });
        }
        let x = x0;
        for (const k of vr) {
          this.stran.drawText(k.t, { x, y: this.y, size: vel, font: k.font, color: TEMNA, ...(k.i && nagni ? { xSkew: degrees(12) } : {}) });
          if (k.u) this.stran.drawRectangle({ x, y: this.y - 1.5, width: k.w, height: 0.55, color: TEMNA });
          if (k.s) this.stran.drawRectangle({ x, y: this.y + vel * 0.3, width: k.w, height: 0.55, color: TEMNA });
          x += k.w;
        }
        this.y -= vis;
      });
      if (b.vrsta === "h") this.y -= 1;
    }
  }

  /** Višina tabele (za odločitev, ali gre cela na preostanek strani). */
  visinaTabele(stolpciVhod: Stolpec[], vrstice: Vrstica[], velikost = VEL.tabela) {
    const vsota = stolpciVhod.reduce((s, c) => s + c.sirina, 0);
    const sir = stolpciVhod.map((c) => (c.sirina * NOTRANJA) / vsota);
    const vis = velikost * 1.35;
    const glava = Math.max(...stolpciVhod.map((s, i) => prelomi(s.naslov, this.f.polkrepka, velikost - 0.5, sir[i] - 8).length)) * vis + 7;
    let h = glava - 6 + 10;
    for (const v of vrstice) {
      if (v.skupina !== undefined) h += 15;
      else h += Math.max(...v.celice.map((c, i) => prelomi(c || "–", i === 0 ? this.f.polkrepka : this.navadna, velikost, sir[i] - 8).length)) * vis + 8;
    }
    return h;
  }

  private mere(stolpcev: 1 | 2, sirina = this.sirina) {
    const RAZ = 12;
    const w = (sirina - (stolpcev - 1) * RAZ) / stolpcev;
    return { RAZ, w, h: stolpcev === 1 ? Math.min(w * 0.68, 360) : w * 0.72 };
  }

  /** Višina mreže slik. */
  visinaMrezeSlik(n: number, stolpcev: 1 | 2) {
    return Math.ceil(n / stolpcev) * (this.mere(stolpcev, NOTRANJA).h + 22);
  }

  /**
   * Razdelek Priloge (slike, skice, povpraševanja). Če cel razdelek ne gre na preostanek strani, gre na novo stran;
   * če je daljši od strani, gre vsak sklop cel na novo stran, kadar ne gre na preostanek.
   */
  priloge(
    slike: { opis: string; slika: PDFImage | null }[],
    skice: { opis: string; slika: PDFImage | null }[],
    povp: { stolpci: Stolpec[]; vrstice: Vrstica[] } | null,
    naslov = "Priloge",
  ) {
    const sklopi = [
      ...(slike.length ? [{ h: VISINA_OZNAKE + this.visinaMrezeSlik(slike.length, 2), narisi: (h: number) => (this.oznaka(`Slike (${slike.length})`, h), this.mrezaSlik(slike, 2)) }] : []),
      ...(skice.length ? [{ h: VISINA_OZNAKE + this.visinaMrezeSlik(skice.length, 1), narisi: (h: number) => (this.oznaka(`Skice (${skice.length})`, h), this.mrezaSlik(skice, 1)) }] : []),
      ...(povp && povp.vrstice.length
        ? [{ h: VISINA_OZNAKE + this.visinaTabele(povp.stolpci, povp.vrstice), narisi: (h: number) => (this.oznaka(`Povpraševanja (${povp.vrstice.length})`, h), this.tabela(povp.stolpci, povp.vrstice)) }]
        : []),
    ];
    if (!sklopi.length) return;
    // cel razdelek skupaj, če gre na eno stran; sicer mora z glavo na stran vsaj prvi sklop
    const vsota = sklopi.reduce((s, x) => s + x.h, 0);
    this.razdelek(naslov, "priloge", vsota <= MAX_VISINA - GLAVA_RAZDELKA - POD_GLAVO ? vsota : sklopi[0].h);
    sklopi.forEach((x, i) => x.narisi(i === 0 ? 0 : x.h));
  }

  /** Tabela s temno glavo (ponovi se na novi strani), prelomom besedila in vrsticami skupin. Širine stolpcev se prilagodijo prostoru. */
  tabela(stolpciVhod: Stolpec[], vrstice: Vrstica[], velikost = VEL.tabela) {
    const vsota = stolpciVhod.reduce((s, c) => s + c.sirina, 0);
    const k = this.sirina / vsota;
    const stolpci = stolpciVhod.map((c) => ({ ...c, sirina: c.sirina * k }));
    const vis = velikost * 1.35;
    const P = 4;
    const glavaTabele = () => {
      const celice = stolpci.map((s) => prelomi(s.naslov, this.f.polkrepka, velikost - 0.5, s.sirina - 2 * P));
      const h = Math.max(...celice.map((c) => c.length)) * vis + 7;
      zaobljen(this.stran, this.levo, this.y - h + 2, this.sirina, h, [3, 3, 0, 0], GLAVA_TABELE);
      let x = this.levo;
      celice.forEach((vr, i) => {
        const s = stolpci[i];
        vr.forEach((t, j) => {
          const w = this.f.polkrepka.widthOfTextAtSize(t, velikost - 0.5);
          this.stran.drawText(t, {
            x: s.desno ? x + s.sirina - P - w : x + P,
            y: this.y - 5.5 - velikost * 0.55 - j * vis,
            size: velikost - 0.5,
            font: this.f.polkrepka,
            color: BELA,
          });
        });
        x += s.sirina;
      });
      this.y -= h - 2;
    };
    this.prostor(40);
    this.y += 4; // glava tabele se poravna z vrhom besedila
    glavaTabele();
    vrstice.forEach((v, iv) => {
      const zadnja = iv === vrstice.length - 1;
      if (v.skupina !== undefined) {
        if (this.prostor(34)) glavaTabele();
        const h = 15;
        this.stran.drawRectangle({ x: this.levo, y: this.y - h, width: this.sirina, height: h, color: SKUPINA });
        this.stran.drawRectangle({ x: this.levo, y: this.y - h, width: 2.5, height: h, color: ORANZNA });
        this.stran.drawText(v.skupina, { x: this.levo + 8, y: this.y - h / 2 - 2.8, size: velikost + 0.25, font: this.f.polkrepka, color: TEMNA });
        this.y -= h;
        return;
      }
      const celice = v.celice.map((c, i) => prelomi(c || "–", i === 0 ? this.f.polkrepka : this.navadna, velikost, stolpci[i].sirina - 2 * P));
      const h = Math.max(...celice.map((c) => c.length)) * vis + 8;
      if (this.prostor(h + 2)) glavaTabele();
      const r = zadnja ? 3 : 0;
      zaobljen(this.stran, this.levo, this.y - h, this.sirina, h, [0, 0, r, r], BELA);
      let x = this.levo;
      celice.forEach((vr, i) => {
        const s = stolpci[i];
        const font = i === 0 || v.poudari?.includes(i) ? this.f.polkrepka : this.navadna;
        vr.forEach((t, j) => {
          const w = font.widthOfTextAtSize(t, velikost);
          this.stran.drawText(t, { x: s.desno ? x + s.sirina - P - w : x + P, y: this.y - 4 - velikost * 0.8 - j * vis, size: velikost, font, color: TEMNA });
        });
        x += s.sirina;
      });
      this.y -= h;
      if (!zadnja) this.stran.drawRectangle({ x: this.levo, y: this.y, width: this.sirina, height: 0.5, color: CRTA });
    });
    this.y -= 10;
  }

  slikaVOkvir(slika: PDFImage | null, x: number, yZgoraj: number, w: number, h: number) {
    zaobljen(this.stran, x, yZgoraj - h, w, h, 4, OZADJE_SLIKE, CRTA);
    if (!slika) {
      const t = "Slike ni bilo mogoče naložiti";
      this.stran.drawText(t, { x: x + (w - this.navadna.widthOfTextAtSize(t, VEL.besedilo)) / 2, y: yZgoraj - h / 2 - 3, size: VEL.besedilo, font: this.navadna, color: SIVA });
      return;
    }
    const s = slika.scaleToFit(w - 4, h - 4);
    this.stran.drawImage(slika, { x: x + (w - s.width) / 2, y: yZgoraj - h + (h - s.height) / 2, width: s.width, height: s.height });
  }

  /** Mreža slik z opisom pod sliko. */
  mrezaSlik(slike: { opis: string; slika: PDFImage | null }[], stolpcev: 1 | 2) {
    const { RAZ, w, h } = this.mere(stolpcev);
    for (let i = 0; i < slike.length; i += stolpcev) {
      this.prostor(h + 26);
      slike.slice(i, i + stolpcev).forEach((s, j) => {
        const x = this.levo + j * (w + RAZ);
        this.slikaVOkvir(s.slika, x, this.y, w, h);
        const opis = prelomi(s.opis, this.navadna, VEL.besedilo - 0.5, w)[0] ?? "";
        this.stran.drawText(opis, { x, y: this.y - h - 11, size: VEL.besedilo - 0.5, font: this.navadna, color: SIVA });
      });
      this.y -= h + 22;
    }
  }

  async koncaj(nogaLevo: string) {
    this.zapriRazdelek();
    noga(this.pdf, this.navadna, nogaLevo);
    const bajti = await this.pdf.save();
    return new Blob([bajti as BlobPart], { type: "application/pdf" });
  }
}

// ---------------------------------------------------------------------------
// Prenos

export { asciiIme, prenesiDatoteko };

// ---------------------------------------------------------------------------
// E-mail za Outlook: .eml z oznako X-Unsent - Outlook ga odpre kot novo (neposlano) sporočilo s PDF priponko.

const CRLF = "\r\n";

function base64(bajti: Uint8Array) {
  let niz = "";
  for (let i = 0; i < bajti.length; i += 0x8000) niz += String.fromCharCode(...bajti.subarray(i, i + 0x8000));
  return btoa(niz);
}
const vrstice76 = (b64: string) => b64.replace(/.{1,76}/g, (m) => m + CRLF);
const utf8Glava = (t: string) => `=?UTF-8?B?${base64(new TextEncoder().encode(t))}?=`;
/** Naslov aplikacije za povezavo do zapisnika (lokalni build tudi kaže na produkcijo). */
export const URL_APLIKACIJE = (process.env.NEXT_PUBLIC_APP_URL || "https://finesproduction.vercel.app").replace(/\/$/, "");
export const PISAVA = "16px";
export const PISAVA_NASLOV = "21px";
export const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Prenese .eml (HTML telo + PDF priponka), ki ga Outlook odpre kot novo sporočilo. */
export async function prenesiEmail(zadeva: string, html: string, pdf: Blob, imePdf: string, imeEml: string) {
  const bajti = new Uint8Array(await pdf.arrayBuffer());
  const meja = `----=_FINES_${Date.now().toString(36)}`;
  const deli = [
    "X-Unsent: 1",
    "To: ",
    `Subject: ${utf8Glava(zadeva)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${meja}"`,
    "",
    `--${meja}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    vrstice76(base64(new TextEncoder().encode(html))),
    `--${meja}`,
    `Content-Type: application/pdf; name="${imePdf}"`,
    `Content-Disposition: attachment; filename="${imePdf}"`,
    "Content-Transfer-Encoding: base64",
    "",
    vrstice76(base64(bajti)),
    `--${meja}--`,
    "",
  ];
  prenesiDatoteko(new Blob([deli.join(CRLF)], { type: "message/rfc822" }), imeEml);
}

/** Tabela oznaka / vrednost za telo e-maila (prazne vrednosti se izpustijo). */
export function emailPari(pari: [string, string][]) {
  const td = "padding:3px 12px 3px 0;vertical-align:top";
  return (
    `<table style="border-collapse:collapse;font-size:${PISAVA}">` +
    pari
      .filter(([, v]) => v)
      .map(([o, v]) => `<tr><td style="${td};color:#6b6b72">${esc(o)}</td><td style="${td};font-weight:bold">${esc(v)}</td></tr>`)
      .join("") +
    `</table>`
  );
}
