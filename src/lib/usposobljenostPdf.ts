// PDF matrike usposobljenosti za delovna mesta: A4 ležeče, legenda z obrazi Fineska, termin ocenjevanja v celici osebe.
// Modul se naloži šele ob odprtju predogleda (dinamičen import).
import { rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { formatShort, toIso } from "./dates";
import { SIVA, TEMNA, naloziBajte, novDokument, prelomi } from "./porociloPdf";
import { STOPNJE, type Stolpec } from "./usposobljenost";

const STRAN: [number, number] = [841.89, 595.28];
const ROB = 28;
const SIRINA = STRAN[0] - 2 * ROB;
const ORANZNA = rgb(202 / 255, 80 / 255, 16 / 255);
const CRTA = rgb(0.86, 0.86, 0.87);
const OKVIR_PRAZNO = rgb(0.76, 0.76, 0.78);
const GLAVA_TABELE = rgb(0.17, 0.17, 0.18);
const BELA = rgb(1, 1, 1);

const SIRINA_IMENA = 128;
const VISINA_GLAVE = 30;
const VISINA_NOGE = 26;
const VRSTICA_MAX = 56;
const VRSTICA_MIN = 38;

export type PdfMatrike = {
  naslov: string;
  stolpci: Stolpec[];
  /** Po stolpcih: stopnja (null = brez ocene) in oznaka naslednjega termina ("" = ni določen). */
  vrstice: { ime: string; ocene: (number | null)[]; termini: string[] }[];
};

export async function matrikaPdf({ naslov, stolpci, vrstice }: PdfMatrike): Promise<Blob> {
  const { pdf, navadna, krepka, logo } = await novDokument(naslov);
  const slike = new Map<number, PDFImage>();
  await Promise.all(
    STOPNJE.map(async (s) => {
      slike.set(s.value, await pdf.embedPng(await naloziBajte(`/finesek/stopnja-${s.value}.png`)));
    }),
  );
  const slika = (s: number) => slike.get(s)!;

  const glavaStrani = (stran: PDFPage) => {
    let y = STRAN[1] - ROB;
    if (logo) {
      const s = logo.scaleToFit(110, 28);
      stran.drawImage(logo, { x: ROB, y: y - s.height, width: s.width, height: s.height });
    }
    const desno = (t: string, yy: number, vel: number, f = navadna, barva = TEMNA) =>
      stran.drawText(t, { x: STRAN[0] - ROB - f.widthOfTextAtSize(t, vel), y: yy, size: vel, font: f, color: barva });
    desno(naslov, y - 14, 15, krepka);
    desno(`Natisnjeno: ${formatShort(toIso(new Date()))}`, y - 27, 8.5, navadna, SIVA);
    y -= 36;
    stran.drawRectangle({ x: ROB, y, width: SIRINA, height: 2, color: ORANZNA });
    y -= 8;

    // Legenda: brez ocene in obrazi Fineska 1-5
    const VISINA_LEGENDE = 46;
    const w = SIRINA / (STOPNJE.length + 1);
    const tekst = (x: number, naziv: string, opis: string) => {
      const nazivi = prelomi(naziv, krepka, 8, w - 50).slice(0, 2);
      nazivi.forEach((v, k) => stran.drawText(v, { x, y: y - 11 - k * 9.5, size: 8, font: krepka, color: TEMNA }));
      const yOpis = y - 11 - nazivi.length * 9.5;
      prelomi(opis, navadna, 7, w - 50)
        .slice(0, 3)
        .forEach((v, k) => stran.drawText(v, { x, y: yOpis - k * 8.5, size: 7, font: navadna, color: SIVA }));
    };
    stran.drawRectangle({ x: ROB + 18, y: y - 30, width: 22, height: 22, borderColor: OKVIR_PRAZNO, borderWidth: 1 });
    tekst(ROB + 52, "Brez ocene", "Še ni ocenjen");
    STOPNJE.forEach((s, i) => {
      const x = ROB + (i + 1) * w;
      const sl = slika(s.value).scaleToFit(42, 30);
      stran.drawImage(slika(s.value), { x: x + 1, y: y - 34, width: sl.width, height: sl.height });
      tekst(x + 46, `${s.value} · ${s.naziv}`, s.opis);
    });
    return y - VISINA_LEGENDE - 4;
  };

  const sirinaStolpca = (SIRINA - SIRINA_IMENA) / Math.max(1, stolpci.length);

  const glavaTabele = (stran: PDFPage, y: number) => {
    stran.drawRectangle({ x: ROB, y: y - VISINA_GLAVE, width: SIRINA, height: VISINA_GLAVE, color: GLAVA_TABELE });
    stran.drawText("ZAPOSLENI", { x: ROB + 6, y: y - 18, size: 8, font: krepka, color: BELA });
    stolpci.forEach((s, i) => {
      const x = ROB + SIRINA_IMENA + i * sirinaStolpca;
      const vrstice2 = prelomi(s.naziv.toUpperCase(), krepka, 7, sirinaStolpca - 6).slice(0, 2);
      const yTekst = y - (vrstice2.length > 1 ? 13 : 18);
      vrstice2.forEach((t, k) => {
        stran.drawText(t, { x: x + (sirinaStolpca - krepka.widthOfTextAtSize(t, 7)) / 2, y: yTekst - k * 9, size: 7, font: krepka, color: BELA });
      });
    });
    return y - VISINA_GLAVE;
  };

  let stran = pdf.addPage(STRAN);
  let y = glavaTabele(stran, glavaStrani(stran));
  const dno = ROB + VISINA_NOGE;
  const visinaVrstice = Math.min(VRSTICA_MAX, Math.max(VRSTICA_MIN, (y - dno) / Math.max(1, vrstice.length)));

  for (const v of vrstice) {
    if (y - visinaVrstice < dno) {
      stran = pdf.addPage(STRAN);
      y = glavaTabele(stran, glavaStrani(stran));
    }
    const yDno = y - visinaVrstice;
    stran.drawText(prelomi(v.ime, krepka, 9.5, SIRINA_IMENA - 10)[0] ?? "", { x: ROB + 6, y: yDno + visinaVrstice / 2 - 3.5, size: 9.5, font: krepka, color: TEMNA });
    v.ocene.forEach((o, i) => {
      const x = ROB + SIRINA_IMENA + i * sirinaStolpca;
      stran.drawLine({ start: { x, y }, end: { x, y: yDno }, thickness: 0.5, color: CRTA });
      const termin = v.termini[i];
      const prostorSpodaj = termin ? 9 : 0;
      const visinaSlike = visinaVrstice - 6 - prostorSpodaj;
      const ySredina = yDno + prostorSpodaj + (visinaVrstice - prostorSpodaj) / 2;
      if (termin) stran.drawText(termin, { x: x + (sirinaStolpca - krepka.widthOfTextAtSize(termin, 6.5)) / 2, y: yDno + 3, size: 6.5, font: krepka, color: ORANZNA });
      if (o === null) {
        const k = Math.min(18, visinaSlike);
        stran.drawRectangle({ x: x + (sirinaStolpca - k) / 2, y: ySredina - k / 2, width: k, height: k, borderColor: OKVIR_PRAZNO, borderWidth: 1 });
        return;
      }
      const sl = slika(o).scaleToFit(sirinaStolpca - 18, visinaSlike);
      const xSlika = x + (sirinaStolpca - sl.width - 12) / 2;
      stran.drawImage(slika(o), { x: xSlika, y: ySredina - sl.height / 2, width: sl.width, height: sl.height });
      stran.drawText(String(o), { x: xSlika + sl.width + 3, y: ySredina - 4.5, size: 12, font: krepka, color: ORANZNA });
    });
    stran.drawLine({ start: { x: STRAN[0] - ROB, y }, end: { x: STRAN[0] - ROB, y: yDno }, thickness: 0.5, color: CRTA });
    stran.drawLine({ start: { x: ROB, y }, end: { x: ROB, y: yDno }, thickness: 0.5, color: CRTA });
    stran.drawLine({ start: { x: ROB, y: yDno }, end: { x: STRAN[0] - ROB, y: yDno }, thickness: 0.5, color: CRTA });
    y = yDno;
  }

  const strani = pdf.getPages();
  strani.forEach((s, i) => {
    const desno = `Stran ${i + 1} / ${strani.length}`;
    const levo = "FINES d.o.o. | Production | Matrika usposobljenosti";
    s.drawLine({ start: { x: ROB, y: ROB + 2 }, end: { x: STRAN[0] - ROB, y: ROB + 2 }, thickness: 0.5, color: CRTA });
    s.drawText(levo, { x: ROB, y: ROB - 10, size: 8, font: navadna, color: SIVA });
    s.drawText(desno, { x: STRAN[0] - ROB - navadna.widthOfTextAtSize(desno, 8), y: ROB - 10, size: 8, font: navadna, color: SIVA });
  });
  const bajti = await pdf.save();
  return new Blob([bajti as BlobPart], { type: "application/pdf" });
}
