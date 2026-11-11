// PDF matrike usposobljenosti za delovna mesta: A4 ležeče, legenda z obrazi Fineska, termin ocenjevanja v celici osebe.
// Modul se naloži šele ob odprtju predogleda (dinamičen import).
import { rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { BELA, CRTA, ORANZNA, SIVA, TEMNA, VEL, glavaStrani, naloziBajte, noga, novDokument, prelomi, preliv, zaobljen } from "./porociloPdf";
import { STOPNJE, type Stolpec } from "./usposobljenost";

const STRAN: [number, number] = [841.89, 595.28];
const ROB = 28;
const SIRINA = STRAN[0] - 2 * ROB;
const OKVIR_PRAZNO = rgb(0.76, 0.77, 0.79);
const OZADJE_LEGENDE = rgb(0.961, 0.965, 0.973);
const ZEBRA = rgb(0.98, 0.98, 0.985);

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
  const d = await novDokument(naslov);
  const { pdf, navadna, polkrepka, logo } = d;
  const slike = new Map<number, PDFImage>();
  await Promise.all(
    STOPNJE.map(async (s) => {
      slike.set(s.value, await pdf.embedPng(await naloziBajte(`/finesek/stopnja-${s.value}.png`)));
    }),
  );
  const slika = (s: number) => slike.get(s)!;

  const glava = (stran: PDFPage) => {
    let y = glavaStrani(stran, d, logo, naslov, STRAN[1] - ROB, ROB, STRAN[0] - ROB) + 6;

    // Legenda (osenčen okvir): brez ocene in obrazi Fineska 1-5
    const VISINA_LEGENDE = 44;
    zaobljen(stran, ROB, y - VISINA_LEGENDE, SIRINA, VISINA_LEGENDE, 5, OZADJE_LEGENDE, CRTA);
    y -= 7;
    const w = SIRINA / (STOPNJE.length + 1);
    const tekst = (x: number, naziv: string, opis: string) => {
      const nazivi = prelomi(naziv, polkrepka, VEL.besedilo - 0.25, w - 50).slice(0, 2);
      nazivi.forEach((v, k) => stran.drawText(v, { x, y: y - 9 - k * 9.5, size: VEL.besedilo - 0.25, font: polkrepka, color: TEMNA }));
      const yOpis = y - 9 - nazivi.length * 9.5;
      prelomi(opis, navadna, VEL.majhno, w - 50)
        .slice(0, 3)
        .forEach((v, k) => stran.drawText(v, { x, y: yOpis - k * 8.5, size: VEL.majhno, font: navadna, color: SIVA }));
    };
    zaobljen(stran, ROB + 18, y - 26, 20, 20, 3, BELA, OKVIR_PRAZNO, 1);
    tekst(ROB + 50, "Brez ocene", "Še ni ocenjen");
    STOPNJE.forEach((s, i) => {
      const x = ROB + (i + 1) * w;
      const sl = slika(s.value).scaleToFit(40, 28);
      stran.drawImage(slika(s.value), { x: x + 1, y: y - 31, width: sl.width, height: sl.height });
      tekst(x + 46, `${s.value} · ${s.naziv}`, s.opis);
    });
    return y - VISINA_LEGENDE + 7 - 10;
  };

  const sirinaStolpca = (SIRINA - SIRINA_IMENA) / Math.max(1, stolpci.length);

  const glavaTabele = (stran: PDFPage, y: number) => {
    preliv(stran, ROB, y - VISINA_GLAVE, SIRINA, VISINA_GLAVE);
    stran.drawRectangle({ x: ROB, y: y - VISINA_GLAVE - 1.2, width: SIRINA, height: 1.2, color: ORANZNA });
    stran.drawText("Zaposleni", { x: ROB + 8, y: y - 18, size: VEL.besedilo, font: polkrepka, color: BELA });
    stolpci.forEach((s, i) => {
      const x = ROB + SIRINA_IMENA + i * sirinaStolpca;
      const vel = VEL.tabela - 0.25;
      const vrstice2 = prelomi(s.naziv, polkrepka, vel, sirinaStolpca - 6).slice(0, 2);
      const yTekst = y - (vrstice2.length > 1 ? 13 : 18);
      vrstice2.forEach((t, k) => {
        stran.drawText(t, { x: x + (sirinaStolpca - polkrepka.widthOfTextAtSize(t, vel)) / 2, y: yTekst - k * 9, size: vel, font: polkrepka, color: BELA });
      });
    });
    return y - VISINA_GLAVE - 1.2;
  };

  let stran = pdf.addPage(STRAN);
  let y = glavaTabele(stran, glava(stran));
  const dno = ROB + VISINA_NOGE;
  const visinaVrstice = Math.min(VRSTICA_MAX, Math.max(VRSTICA_MIN, (y - dno) / Math.max(1, vrstice.length)));

  for (const [iv, v] of vrstice.entries()) {
    if (y - visinaVrstice < dno) {
      stran = pdf.addPage(STRAN);
      y = glavaTabele(stran, glava(stran));
    }
    const yDno = y - visinaVrstice;
    if (iv % 2) stran.drawRectangle({ x: ROB, y: yDno, width: SIRINA, height: visinaVrstice, color: ZEBRA });
    stran.drawText(prelomi(v.ime, polkrepka, VEL.poudarek, SIRINA_IMENA - 12)[0] ?? "", { x: ROB + 8, y: yDno + visinaVrstice / 2 - 3.2, size: VEL.poudarek, font: polkrepka, color: TEMNA });
    v.ocene.forEach((o, i) => {
      const x = ROB + SIRINA_IMENA + i * sirinaStolpca;
      stran.drawLine({ start: { x, y }, end: { x, y: yDno }, thickness: 0.5, color: CRTA });
      const termin = v.termini[i];
      const prostorSpodaj = termin ? 9 : 0;
      const visinaSlike = visinaVrstice - 6 - prostorSpodaj;
      const ySredina = yDno + prostorSpodaj + (visinaVrstice - prostorSpodaj) / 2;
      if (termin) stran.drawText(termin, { x: x + (sirinaStolpca - polkrepka.widthOfTextAtSize(termin, VEL.majhno)) / 2, y: yDno + 3, size: VEL.majhno, font: polkrepka, color: ORANZNA });
      if (o === null) {
        const k = Math.min(17, visinaSlike);
        zaobljen(stran, x + (sirinaStolpca - k) / 2, ySredina - k / 2, k, k, 3, undefined, OKVIR_PRAZNO, 1);
        return;
      }
      const sl = slika(o).scaleToFit(sirinaStolpca - 18, visinaSlike);
      const xSlika = x + (sirinaStolpca - sl.width - 12) / 2;
      stran.drawImage(slika(o), { x: xSlika, y: ySredina - sl.height / 2, width: sl.width, height: sl.height });
      stran.drawText(String(o), { x: xSlika + sl.width + 3, y: ySredina - 4, size: 11, font: d.krepka, color: ORANZNA });
    });
    stran.drawLine({ start: { x: STRAN[0] - ROB, y }, end: { x: STRAN[0] - ROB, y: yDno }, thickness: 0.5, color: CRTA });
    stran.drawLine({ start: { x: ROB, y }, end: { x: ROB, y: yDno }, thickness: 0.5, color: CRTA });
    stran.drawLine({ start: { x: ROB, y: yDno }, end: { x: STRAN[0] - ROB, y: yDno }, thickness: 0.5, color: CRTA });
    y = yDno;
  }

  noga(pdf, navadna, "FINES d.o.o. | Production | Matrika usposobljenosti", ROB);
  const bajti = await pdf.save();
  return new Blob([bajti as BlobPart], { type: "application/pdf" });
}
