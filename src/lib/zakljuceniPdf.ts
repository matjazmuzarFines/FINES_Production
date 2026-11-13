// PDF "Zaključeni krovni" (tisk in FIN:TV): stran 16:9 na celico oddelka. Stran je razdeljena na toliko STOLPCEV, kolikor
// je zaključenih krovnih (največ 6 na stran, sicer nadaljevanje na naslednji strani) - en krovni = en stolpec čez celo
// višino, krovni nikoli pod krovnim. Glava stolpca: velika PRODUKTIVNOST krovnega (normativne ÷ štempljane ure) v barvi
// stanja, pod njo nalogi z manjšim % ob številki naloga. Skupna oblika: porociloPdf.ts (Inter, glava strani, noga).
import { rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatShort } from "./dates";
import { PREVERI_NAD, PREVERI_POD, type KrovniZakljucen, type NalogZakljucen } from "./produktivnostPlana";
import { asciiIme, prenesiDatoteko } from "./prenos";
import { BELA, SIVA, TEMNA, glavaStrani, noga, novDokument, prelomi, zaobljen, type Pisave } from "./porociloPdf";
import { formatNum, formatUre } from "./stevila";
import { DNI_ZAKLJUCENI, type ZakljuceniOddelka } from "./zakljuceniKrovni";

/** Stran 16:9 (pt) - kot Delo - prejšnji dan. */
const W = 960;
const H = 540;
const ROB = 28;
const RAZMAK = 10;
const NAJVEC_STOLPCEV = 6;
/** Največja širina stolpca (en ali dva krovna ne raztegneta stolpca čez pol strani). */
const NAJVEC_SIRINA = 300;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const ZELENA = hex("#16a34a");
const RUMENA = hex("#f59e0b");
const RUMENA_BESEDILO = hex("#b45309");
const RDECA = hex("#dc2626");
const ROB_KARTICE = hex("#e1e4e8");
const CRTA = hex("#eceef1");
const OZADJE_NOGE = hex("#f5f6f8");
const TON = { ok: hex("#e9f7ee"), opozorilo: hex("#fef5e2"), slabo: hex("#fdecec"), brez: hex("#f5f6f8") };

type Stanje = "ok" | "opozorilo" | "slabo" | "brez";
/** Iste meje kot v aplikaciji: ≥ 100 % zelena, 85-99 % rumena, pod 85 % rdeča. */
const stanje = (p: number | null): Stanje => (p === null ? "brez" : p >= 0.995 ? "ok" : p >= 0.85 ? "opozorilo" : "slabo");
const BARVA: Record<Stanje, { crta: RGB; besedilo: RGB }> = {
  ok: { crta: ZELENA, besedilo: ZELENA },
  opozorilo: { crta: RUMENA, besedilo: RUMENA_BESEDILO },
  slabo: { crta: RDECA, besedilo: RDECA },
  brez: { crta: SIVA, besedilo: SIVA },
};
const pct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)} %`);
const nalogov = (n: number) => `${n} ${n === 1 ? "nalog" : n === 2 ? "naloga" : n <= 4 ? "nalogi" : "nalogov"}`;

const desno = (s: PDFPage, t: string, x: number, y: number, vel: number, font: PDFFont, barva: RGB) =>
  s.drawText(t, { x: x - font.widthOfTextAtSize(t, vel), y, size: vel, font, color: barva });
const sredina = (s: PDFPage, t: string, cx: number, y: number, vel: number, font: PDFFont, barva: RGB) =>
  s.drawText(t, { x: cx - font.widthOfTextAtSize(t, vel) / 2, y, size: vel, font, color: barva });

const PAD = 9;
const VEL_NALOGA = 10;
const VEL_NAZIVA = 7.5;
const VEL_META = 7;

/** Vsebina vrstice naloga (za višino in risanje). */
function vrsticaNaloga(n: NalogZakljucen, f: Pisave, sirina: number) {
  const naziv = n.naziv ? prelomi(n.naziv, f.navadna, VEL_NAZIVA, sirina) : [];
  const meta =
    n.normUre === null
      ? `ni normativa · štempljano ${formatUre(n.ure)} h`
      : `${formatNum(n.kos)} kos · normativ ${formatUre(n.normUre)} h · štempljano ${formatUre(n.ure)} h`;
  const metaVrstice = prelomi(meta, f.navadna, VEL_META, sirina);
  const h = 6 + VEL_NALOGA + 3 + naziv.length * VEL_NAZIVA * 1.3 + metaVrstice.length * VEL_META * 1.4 + (n.preveri ? 14 : 0) + 5;
  return { naziv, meta: metaVrstice, h };
}

/** Stolpec krovnega čez celo višino (yVrh -> yDno). */
function stolpec(s: PDFPage, f: Pisave, k: KrovniZakljucen, x: number, yVrh: number, yDno: number, w: number) {
  const st = stanje(k.produktivnost);
  const barva = BARVA[st];
  zaobljen(s, x, yDno, w, yVrh - yDno, 6, BELA, ROB_KARTICE);

  // glava: krovni + velika produktivnost; ure se v ozkem stolpcu prelomijo
  const ure = prelomi(`normativ ${formatUre(k.normUre)} h · štempljano ${formatUre(k.ure)} h`, f.navadna, 8, w - 2 * PAD);
  const brez = k.ureBrezNormativa > 0.05 ? prelomi(`+ ${formatUre(k.ureBrezNormativa)} h na nalogih brez normativa`, f.navadna, 7, w - 2 * PAD) : [];
  const glava = 86 + ure.length * 10 + brez.length * 9;
  zaobljen(s, x, yVrh - glava, w, glava, [6, 6, 0, 0], TON[st]);
  s.drawRectangle({ x, y: yVrh - glava, width: w, height: 3, color: barva.crta });
  s.drawText(k.krovni, { x: x + PAD, y: yVrh - 18, size: 13, font: f.krepka, color: TEMNA });
  desno(s, `zaključen ${k.zakljucen.slice(8, 10)}.${k.zakljucen.slice(5, 7)}`, x + w - PAD, yVrh - 17, 7.5, f.navadna, SIVA);
  s.drawText("PRODUKTIVNOST", { x: x + PAD, y: yVrh - 33, size: 7, font: f.polkrepka, color: SIVA });
  if (k.produktivnost !== null && (k.produktivnost > PREVERI_NAD || k.produktivnost < PREVERI_POD)) {
    const t = "preveri štempljanje";
    const tw = f.polkrepka.widthOfTextAtSize(t, 6.75) + 12;
    zaobljen(s, x + w - PAD - tw, yVrh - 36, tw, 10.5, 5.25, BELA, RDECA, 0.5);
    s.drawText(t, { x: x + w - PAD - tw + 6, y: yVrh - 33.2, size: 6.75, font: f.polkrepka, color: RDECA });
  }
  s.drawText(pct(k.produktivnost), { x: x + PAD, y: yVrh - 66, size: 34, font: f.krepka, color: barva.besedilo });
  let yu = yVrh - 82;
  for (const t of ure) {
    s.drawText(t, { x: x + PAD, y: yu, size: 8, font: f.navadna, color: TEMNA });
    yu -= 10;
  }
  for (const t of brez) {
    s.drawText(t, { x: x + PAD, y: yu + 1, size: 7, font: f.navadna, color: SIVA });
    yu -= 9;
  }

  // nalogi
  const steti = k.nalogi.filter((n) => !n.izlocen);
  const izloceni = k.nalogi.filter((n) => n.izlocen);
  const noga = izloceni.length ? 16 : 0;
  const sirina = w - 2 * PAD;
  let y = yVrh - glava - 2;
  let narisanih = 0;
  for (const [i, n] of steti.entries()) {
    const v = vrsticaNaloga(n, f, sirina);
    const ostali = steti.length - i - 1;
    // ne gre več: "+ še n" (rezerva za to vrstico, če niso vsi)
    if (y - v.h < yDno + noga + (ostali > 0 ? 14 : 0)) break;
    if (i > 0) s.drawRectangle({ x: x + PAD, y, width: sirina, height: 0.6, color: CRTA });
    let yy = y - 6 - VEL_NALOGA;
    s.drawText(n.st, { x: x + PAD, y: yy, size: VEL_NALOGA, font: f.polkrepka, color: TEMNA });
    const sn = n.normUre === null ? BARVA.brez : BARVA[stanje(n.produktivnost)];
    desno(s, n.normUre === null ? "–" : pct(n.produktivnost), x + w - PAD, yy - 0.5, 12, f.krepka, sn.besedilo);
    yy -= 3;
    for (const t of v.naziv) {
      yy -= VEL_NAZIVA * 1.3;
      s.drawText(t, { x: x + PAD, y: yy, size: VEL_NAZIVA, font: f.navadna, color: TEMNA });
    }
    for (const t of v.meta) {
      yy -= VEL_META * 1.4;
      s.drawText(t, { x: x + PAD, y: yy, size: VEL_META, font: n.normUre === null ? f.lezeca : f.navadna, color: SIVA });
    }
    if (n.preveri) {
      const t = "preveri štempljanje";
      const tw = f.polkrepka.widthOfTextAtSize(t, 6.75) + 12;
      zaobljen(s, x + PAD, yy - 14, tw, 10.5, 5.25, TON.slabo, RDECA, 0.5);
      s.drawText(t, { x: x + PAD + 6, y: yy - 11.2, size: 6.75, font: f.polkrepka, color: RDECA });
    }
    y -= v.h;
    narisanih++;
  }
  if (narisanih < steti.length)
    s.drawText(`+ še ${nalogov(steti.length - narisanih)}`, { x: x + PAD, y: y - 11, size: 7.5, font: f.lezeca, color: SIVA });
  if (izloceni.length) {
    zaobljen(s, x + 0.6, yDno + 0.6, w - 1.2, noga, [0, 0, 5.5, 5.5], OZADJE_NOGE);
    s.drawText(`${nalogov(izloceni.length)} ni štetih (brez štempljanja ali kosov)`, { x: x + PAD, y: yDno + 5.5, size: 6.75, font: f.navadna, color: SIVA });
  }
}

/** Legenda barv (spodaj levo). */
function legenda(s: PDFPage, f: Pisave, x: number, y: number) {
  const vnosi: [RGB, string][] = [
    [ZELENA, "≥ 100 % · manj ur od normativa"],
    [RUMENA, "85–99 %"],
    [RDECA, "pod 85 %"],
  ];
  for (const [barva, t] of vnosi) {
    s.drawCircle({ x: x + 4, y: y + 3, size: 4, color: barva });
    s.drawText(t, { x: x + 12, y, size: 7.5, font: f.navadna, color: SIVA });
    x += 22 + f.navadna.widthOfTextAtSize(t, 7.5);
  }
  const t = `preveri: pod ${Math.round(PREVERI_POD * 100)} % ali nad ${Math.round(PREVERI_NAD * 100)} %`;
  const tw = f.polkrepka.widthOfTextAtSize(t, 7) + 12;
  zaobljen(s, x, y - 2.5, tw, 11, 5.5, TON.slabo, RDECA, 0.5);
  s.drawText(t, { x: x + 6, y, size: 7, font: f.polkrepka, color: RDECA });
  x += tw + 12;
  s.drawText("PRODUKTIVNOST = normativne ure ÷ štempljane ure × 100 (samo ure operacij oddelka)", { x, y, size: 7.5, font: f.lezeca, color: SIVA });
}

/** Glava strani + naslov; vrne y pod naslovom. */
function naslov(s: PDFPage, f: Pisave, logo: Parameters<typeof glavaStrani>[2], d: ZakljuceniOddelka, celica: string, pod: string) {
  const y = glavaStrani(s, f, logo, `Zaključeni krovni · ${d.naziv}`, H - 20, ROB, W - ROB);
  s.drawText(celica, { x: ROB, y: y - 18, size: 20, font: f.krepka, color: TEMNA });
  s.drawText(pod, { x: ROB, y: y - 32, size: 9, font: f.navadna, color: SIVA });
  return y - 44;
}

/** PDF za oddelek: strani 16:9, za vsako celico s zaključenimi krovnimi svoja stran (ali več). */
export async function ustvariZakljucenePdf(d: ZakljuceniOddelka): Promise<Blob> {
  const doc = await novDokument(`Zaključeni krovni · ${d.naziv}`);
  const { pdf, logo } = doc;
  const f: Pisave = doc;
  const obdobje = `zaključeni od ${formatShort(d.od)} (zadnjih ${DNI_ZAKLJUCENI} dni)`;

  if (!d.celice.length) {
    const s = pdf.addPage([W, H]);
    naslov(s, f, logo, d, d.naziv, `Zaključeni krovni nalogi · ${obdobje}`);
    sredina(s, `V zadnjih ${DNI_ZAKLJUCENI} dneh ni zaključenih krovnih iz delovnega plana.`, W / 2, H / 2, 14, f.lezeca, SIVA);
  }
  for (const c of d.celice) {
    const listov = Math.ceil(c.krovni.length / NAJVEC_STOLPCEV);
    for (let l = 0; l < listov; l++) {
      const s = pdf.addPage([W, H]);
      const krovni = c.krovni.slice(l * NAJVEC_STOLPCEV, (l + 1) * NAJVEC_STOLPCEV);
      const pod = `${d.naziv} · zaključeni krovni nalogi · ${obdobje} · ${c.krovni.length} ${c.krovni.length === 1 ? "krovni" : "krovnih"}${listov > 1 ? ` · stran ${l + 1}/${listov}` : ""}`;
      const yVrh = naslov(s, f, logo, d, c.naziv, pod);
      const yDno = ROB + 16;
      const n = krovni.length;
      const w = Math.min(NAJVEC_SIRINA, (W - 2 * ROB - (n - 1) * RAZMAK) / n);
      krovni.forEach((k, i) => stolpec(s, f, k, ROB + i * (w + RAZMAK), yVrh, yDno, w));
      legenda(s, f, ROB, ROB + 1);
    }
  }
  noga(pdf, f.navadna, `FINES d.o.o. | Production | Zaključeni krovni · ${d.naziv}`, ROB);
  const bajti = await pdf.save();
  return new Blob([bajti as BlobPart], { type: "application/pdf" });
}

export async function prenesiZakljucenePdf(d: ZakljuceniOddelka) {
  prenesiDatoteko(await ustvariZakljucenePdf(d), `${asciiIme(`Zakljuceni_krovni_${d.naziv}_${d.od}`)}.pdf`);
}
