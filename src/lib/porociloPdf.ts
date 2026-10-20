// Skupni gradniki poročil PDF (pdf-lib + pisava DejaVu Sans zaradi č, š, ž) in e-mailov za Outlook (.eml).
// Uporabljata jih Gemba walk (Produktivnost) in Auditi (Management). Modul se naloži šele ob kliku (dinamičen import).
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatShort, toIso } from "./dates";
import { prenesiPrilogo, type Priloga } from "./priloge";

export const A4: [number, number] = [595.28, 841.89];
export const ROB = 42;
export const SIRINA = A4[0] - 2 * ROB;
const ORANZNA = rgb(202 / 255, 80 / 255, 16 / 255);
export const TEMNA = rgb(0.11, 0.11, 0.12);
export const SIVA = rgb(0.42, 0.42, 0.45);
const CRTA = rgb(0.86, 0.86, 0.87);
const GLAVA_TABELE = rgb(0.17, 0.17, 0.18);
const SKUPINA = rgb(0.86, 0.86, 0.87);
const OZADJE_SLIKE = rgb(0.95, 0.95, 0.96);

// ---------------------------------------------------------------------------
// Pomožno

export const naloziBajte = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Prenos ni uspel: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
};

/** Nov PDF s pisavama DejaVu Sans (navadna, krepka) in logotipom (null, če se ne naloži). */
export async function novDokument(naslov: string) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(naslov);
  pdf.setAuthor("FINES d.o.o.");
  const [navadna, krepka, logo] = await Promise.all([
    naloziBajte("/fonts/DejaVuSans.ttf").then((b) => pdf.embedFont(b, { subset: true })),
    naloziBajte("/fonts/DejaVuSans-Bold.ttf").then((b) => pdf.embedFont(b, { subset: true })),
    naloziBajte("/fines-logo.png")
      .then((b) => pdf.embedPng(b))
      .catch(() => null),
  ]);
  return { pdf, navadna, krepka, logo };
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

export type Stolpec = { naslov: string; sirina: number; desno?: boolean };
export type Vrstica = { celice: string[]; skupina?: undefined; poudari?: number[] } | { skupina: string; celice?: undefined };

/** Piše dokument od zgoraj navzdol in sam doda novo stran, ko zmanjka prostora. */
export class Pisec {
  stran: PDFPage;
  y: number;

  private constructor(
    readonly pdf: PDFDocument,
    readonly navadna: PDFFont,
    readonly krepka: PDFFont,
    readonly logo: PDFImage | null,
  ) {
    this.stran = pdf.addPage(A4);
    this.y = A4[1] - ROB;
  }

  static async ustvari(naslov: string) {
    const { pdf, navadna, krepka, logo } = await novDokument(naslov);
    return new Pisec(pdf, navadna, krepka, logo);
  }

  novaStran() {
    this.stran = this.pdf.addPage(A4);
    this.y = A4[1] - ROB;
  }

  /** true = začela se je nova stran. */
  prostor(visina: number) {
    if (this.y - visina < ROB + 30) {
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
    if (this.logo) {
      const s = this.logo.scaleToFit(120, 32);
      this.stran.drawImage(this.logo, { x: ROB, y: this.y - s.height, width: s.width, height: s.height });
    }
    this.desno(naslovDokumenta, this.y - 14, 16, this.krepka);
    this.desno(`Natisnjeno: ${formatShort(toIso(new Date()))}`, this.y - 28, 9, this.navadna, SIVA);
    this.y -= 44;
    this.stran.drawRectangle({ x: ROB, y: this.y, width: SIRINA, height: 2, color: ORANZNA });
    this.y -= 26;
  }

  /** Naslov razdelka; potrebno = koliko prostora mora ostati pod njim. */
  podnaslov(t: string, potrebno = 50) {
    this.y -= 8;
    this.prostor(potrebno);
    this.stran.drawRectangle({ x: ROB, y: this.y - 4, width: 3, height: 16, color: ORANZNA });
    this.tekst(t, ROB + 10, 13, this.krepka);
    this.y -= 24;
  }

  /** Manjši naslov znotraj razdelka. */
  oznaka(t: string, potrebno = 40) {
    this.y -= 4;
    this.prostor(potrebno);
    this.tekst(t.toUpperCase(), ROB, 8.5, this.krepka, ORANZNA);
    this.y -= 14;
  }

  /** Tabela oznaka / vrednost v 1 ali 2 stolpcih. */
  pari(pari: [string, string][], stolpcev: 1 | 2 = 2) {
    const sirinaStolpca = (SIRINA - (stolpcev - 1) * 20) / stolpcev;
    const sirinaOznake = Math.min(110, sirinaStolpca * 0.42);
    for (let i = 0; i < pari.length; i += stolpcev) {
      const vrsta = pari.slice(i, i + stolpcev).map(([o, v]) => ({
        o,
        vrstice: prelomi(v || "–", this.krepka, 10, sirinaStolpca - sirinaOznake),
      }));
      const visina = Math.max(...vrsta.map((c) => c.vrstice.length)) * 13;
      this.prostor(visina + 5);
      vrsta.forEach((c, j) => {
        const x = ROB + j * (sirinaStolpca + 20);
        this.stran.drawText(c.o, { x, y: this.y, size: 9, font: this.navadna, color: SIVA });
        c.vrstice.forEach((v, k) =>
          this.stran.drawText(v, { x: x + sirinaOznake, y: this.y - k * 13, size: 10, font: this.krepka, color: TEMNA }),
        );
      });
      this.y -= visina + 5;
    }
  }

  besedilo(t: string, velikost = 10, barva: RGB = TEMNA) {
    const vis = velikost + 4;
    for (const v of prelomi(t, this.navadna, velikost, SIRINA)) {
      this.prostor(vis);
      this.tekst(v, ROB, velikost, this.navadna, barva);
      this.y -= vis;
    }
  }

  /** Tabela s temno glavo (ponovi se na novi strani), prelomom besedila in vrsticami skupin. */
  tabela(stolpci: Stolpec[], vrstice: Vrstica[], velikost = 8) {
    const vis = velikost + 2.5;
    const PAD = 3;
    const glavaTabele = () => {
      const h = 16;
      this.stran.drawRectangle({ x: ROB, y: this.y - h + 4, width: SIRINA, height: h, color: GLAVA_TABELE });
      let x = ROB;
      for (const s of stolpci) {
        const t = s.naslov.toUpperCase();
        const w = this.krepka.widthOfTextAtSize(t, 7);
        this.stran.drawText(t, { x: s.desno ? x + s.sirina - PAD - w : x + PAD, y: this.y - 7, size: 7, font: this.krepka, color: rgb(1, 1, 1) });
        x += s.sirina;
      }
      this.y -= h + 6;
    };
    this.prostor(40);
    glavaTabele();
    for (const v of vrstice) {
      if (v.skupina !== undefined) {
        if (this.prostor(36)) glavaTabele();
        this.stran.drawRectangle({ x: ROB, y: this.y - 5, width: SIRINA, height: 16, color: SKUPINA });
        this.stran.drawRectangle({ x: ROB, y: this.y - 5, width: 3, height: 16, color: GLAVA_TABELE });
        this.tekst(v.skupina, ROB + 8, 9, this.krepka);
        this.y -= 22;
        continue;
      }
      const celice = v.celice.map((c, i) => prelomi(c || "–", i === 0 ? this.krepka : this.navadna, velikost, stolpci[i].sirina - 2 * PAD));
      const h = Math.max(...celice.map((c) => c.length)) * vis + 4;
      if (this.prostor(h + 2)) glavaTabele();
      let x = ROB;
      celice.forEach((vr, i) => {
        const s = stolpci[i];
        const font = v.poudari?.includes(i) ? this.krepka : this.navadna;
        vr.forEach((t, k) => {
          const w = font.widthOfTextAtSize(t, velikost);
          this.stran.drawText(t, { x: s.desno ? x + s.sirina - PAD - w : x + PAD, y: this.y - k * vis, size: velikost, font, color: TEMNA });
        });
        x += s.sirina;
      });
      this.y -= h;
      this.stran.drawRectangle({ x: ROB, y: this.y + 4, width: SIRINA, height: 0.5, color: CRTA });
      this.y -= 6;
    }
    this.y -= 6;
  }

  slikaVOkvir(slika: PDFImage | null, x: number, yZgoraj: number, w: number, h: number) {
    this.stran.drawRectangle({ x, y: yZgoraj - h, width: w, height: h, color: OZADJE_SLIKE });
    if (!slika) {
      const t = "Slike ni bilo mogoče naložiti";
      this.stran.drawText(t, { x: x + (w - this.navadna.widthOfTextAtSize(t, 9)) / 2, y: yZgoraj - h / 2 - 3, size: 9, font: this.navadna, color: SIVA });
      return;
    }
    const s = slika.scaleToFit(w, h);
    this.stran.drawImage(slika, { x: x + (w - s.width) / 2, y: yZgoraj - h + (h - s.height) / 2, width: s.width, height: s.height });
  }

  /** Mreža slik z opisom pod sliko. */
  mrezaSlik(slike: { opis: string; slika: PDFImage | null }[], stolpcev: 1 | 2) {
    const w = (SIRINA - (stolpcev - 1) * 16) / stolpcev;
    const h = stolpcev === 1 ? Math.min(w * 0.68, 380) : w * 0.72;
    for (let i = 0; i < slike.length; i += stolpcev) {
      this.prostor(h + 30);
      slike.slice(i, i + stolpcev).forEach((s, j) => {
        const x = ROB + j * (w + 16);
        this.slikaVOkvir(s.slika, x, this.y, w, h);
        const opis = prelomi(s.opis, this.navadna, 8.5, w)[0] ?? "";
        this.stran.drawText(opis, { x, y: this.y - h - 12, size: 8.5, font: this.navadna, color: SIVA });
      });
      this.y -= h + 26;
    }
  }

  async koncaj(nogaLevo: string) {
    const strani = this.pdf.getPages();
    strani.forEach((s, i) => {
      const desno = `Stran ${i + 1} / ${strani.length}`;
      s.drawRectangle({ x: ROB, y: ROB - 2, width: SIRINA, height: 0.5, color: CRTA });
      s.drawText(nogaLevo, { x: ROB, y: ROB - 16, size: 8, font: this.navadna, color: SIVA });
      s.drawText(desno, { x: A4[0] - ROB - this.navadna.widthOfTextAtSize(desno, 8), y: ROB - 16, size: 8, font: this.navadna, color: SIVA });
    });
    const bajti = await this.pdf.save();
    return new Blob([bajti as BlobPart], { type: "application/pdf" });
  }
}

// ---------------------------------------------------------------------------
// Prenos

/** Ime datoteke samo z ASCII znaki (č -> c ...), da ga razume vsak e-mail odjemalec. */
export const asciiIme = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/_$/, "");

export function prenesiDatoteko(blob: Blob, ime: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ime;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
