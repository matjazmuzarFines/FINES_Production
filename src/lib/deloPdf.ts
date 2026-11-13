// PDF "Delo - prejšnji dan" (FIN:TV): ena stran 16:9 na oddelek - za vsako celico krog porabe ur (štempljano / plan)
// in ure po krovnih nalogih. Krog: zelena krožnica do plana, čez plan dodatna širša krožnica (do +10 % rumena, nad rdeča).
// Krožnica čez plan je ZUNAJ zelene (ne prekriva besedila v krogu).
// Številke so v URAH (štempljano, razlika do plana) - procent je v aplikaciji rezerviran za produktivnost.
// Stran je 16:9, da jo TV pokaže čez cel zaslon brez raztega (krogi ostanejo okrogli). Skupna oblika: porociloPdf.ts.
import { LineCapStyle, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatLong } from "./dates";
import { poraba, stanjePorabe, type DeloCelice, type DeloOddelka } from "./deloVceraj";
import { asciiIme, prenesiDatoteko } from "./prenos";
import { formatRazlikaUr, formatUre } from "./stevila";
import { BELA, ORANZNA, PRELIV, SIVA, TEMNA, glavaStrani, novDokument, noga, preliv, zaobljen, type Pisave } from "./porociloPdf";

/** Stran 16:9 (pt). */
const W = 960;
const H = 540;
const ROB = 28;
const RAZMAK = 10;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const ZELENA = hex("#16a34a");
const RUMENA = hex("#f59e0b");
const RUMENA_BESEDILO = hex("#b45309");
const RDECA = hex("#dc2626");
const SLED = hex("#e3e6ea");
const OZADJE = hex("#f5f6f8");
const ROB_KARTICE = hex("#e1e4e8");

const BARVA_STANJA: Record<ReturnType<typeof stanjePorabe>, { krog: RGB; besedilo: RGB }> = {
  brez: { krog: SIVA, besedilo: SIVA },
  ok: { krog: ZELENA, besedilo: ZELENA },
  opozorilo: { krog: RUMENA, besedilo: RUMENA_BESEDILO },
  prevec: { krog: RDECA, besedilo: RDECA },
};

const ure = (n: number) => `${formatUre(n)} h`;

/** Lok od kota a0 do a1 (radiani, 0 = zgoraj, v smeri urinega kazalca) - SVG pot z izhodiščem v središču. */
function potLoka(r: number, a0: number, a1: number) {
  const tocka = (a: number) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
  if (a1 - a0 >= 2 * Math.PI - 1e-3) return `M${tocka(0)} A${r} ${r} 0 1 1 ${tocka(Math.PI)} A${r} ${r} 0 1 1 ${tocka(0)}`;
  return `M${tocka(a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${tocka(a1)}`;
}

function lok(s: PDFPage, cx: number, cy: number, r: number, a0: number, a1: number, barva: RGB, debelina: number, okroglo = true) {
  if (a1 - a0 < 1e-3) return;
  s.drawSvgPath(potLoka(r, a0, a1), {
    x: cx,
    y: cy,
    borderColor: barva,
    borderWidth: debelina,
    borderLineCap: okroglo ? LineCapStyle.Round : LineCapStyle.Butt,
  });
}

/** Krožnica čez plan: debelina (× d) in odmik središča od zelene krožnice (× d). Zunanji rob = r + ZUNANJI_ROB × d. */
const DEBELINA_CEZ = 0.9;
const ODMIK_CEZ = 0.5 + 0.3 + DEBELINA_CEZ / 2;
const ZUNANJI_ROB = ODMIK_CEZ + DEBELINA_CEZ / 2;

/**
 * Krog porabe: siva sled, zelena krožnica do 100 %, nad 100 % dodatna krožnica (rumena / rdeča) ZUNAJ zelene, od vrha
 * naprej - notranjost kroga ostane prosta za besedilo. (cx, cy) = središče, r = polmer zelene, d = debelina zelene.
 */
function krogPorabe(s: PDFPage, cx: number, cy: number, r: number, d: number, p: number | null) {
  lok(s, cx, cy, r, 0, 2 * Math.PI, SLED, d, false);
  if (p === null || p <= 0) return;
  const polno = 2 * Math.PI;
  lok(s, cx, cy, r, 0, Math.min(p, 1) * polno, ZELENA, d, p < 1);
  if (p > 1) lok(s, cx, cy, r + d * ODMIK_CEZ, 0, Math.min(p - 1, 1) * polno, stanjePorabe(p) === "opozorilo" ? RUMENA : RDECA, d * DEBELINA_CEZ, p < 2);
}

/** Velikost pisave, da besedilo ne preseže širine (največ `vel`). */
const naSirino = (t: string, font: PDFFont, vel: number, sirina: number) => Math.min(vel, (sirina / Math.max(1, font.widthOfTextAtSize(t, 1))));

const sredina = (s: PDFPage, t: string, cx: number, y: number, vel: number, font: PDFFont, barva: RGB) =>
  s.drawText(t, { x: cx - font.widthOfTextAtSize(t, vel) / 2, y, size: vel, font, color: barva });
const desno = (s: PDFPage, t: string, x: number, y: number, vel: number, font: PDFFont, barva: RGB) =>
  s.drawText(t, { x: x - font.widthOfTextAtSize(t, vel), y, size: vel, font, color: barva });

/** Skrajša besedilo na širino (s tropičjem). */
function skrajsaj(t: string, font: PDFFont, vel: number, sirina: number) {
  if (font.widthOfTextAtSize(t, vel) <= sirina) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, vel) > sirina) t = t.slice(0, -1);
  return `${t}…`;
}

/** Kartica celice: glava v prelivu z imenom, krog, ure po krovnih nalogih, izven plana / režija. */
function kartica(s: PDFPage, f: Pisave, c: DeloCelice, x: number, yVrh: number, w: number, h: number) {
  const GLAVA = 22;
  zaobljen(s, x, yVrh - h, w, h, 6, OZADJE, ROB_KARTICE);
  preliv(s, x, yVrh - GLAVA, w, GLAVA, PRELIV, 6);
  s.drawRectangle({ x, y: yVrh - GLAVA - 1.2, width: w, height: 1.2, color: ORANZNA });
  s.drawText(skrajsaj(c.naziv, f.polkrepka, 11, w - 70), { x: x + 9, y: yVrh - 15, size: 11, font: f.polkrepka, color: BELA });
  if (c.osebe) desno(s, `${c.osebe} ${c.osebe === 1 ? "oseba" : c.osebe === 2 ? "osebi" : c.osebe <= 4 ? "osebe" : "oseb"}`, x + w - 9, yVrh - 15, 8.25, f.navadna, hex("#c9ced6"));

  const p = poraba(c.ure, c.plan);
  const barva = BARVA_STANJA[stanjePorabe(p)];
  const PAD = 10;
  const vrh = yVrh - GLAVA - PAD;
  const visina = h - GLAVA - 2 * PAD;
  // krog: ~55 % višine vsebine, največ 62 % širine
  const premer = Math.min(visina * 0.55, (w - 2 * PAD) * 0.62, 210);
  const debelina = Math.max(4.5, premer * 0.065);
  // prostor zunaj zelene je rezerviran za krožnico čez plan
  const r = premer / 2 - debelina * ZUNANJI_ROB;
  const cx = x + w / 2;
  const cy = vrh - premer / 2;
  krogPorabe(s, cx, cy, r, debelina, p);
  // besedilo znotraj notranjega roba zelene (z malo zraka)
  const notranji = r - debelina / 2 - 3;
  const velPct = premer * 0.2;
  const yGor = cy - velPct * 0.2;
  const yDol = yGor - premer * 0.12;
  // širina tetive kroga na višini vrstice (spodnja vrstica je nižje -> ožja)
  const tetiva = (yv: number, vel: number) => 2 * Math.sqrt(Math.max(0, notranji ** 2 - (cy - yv + vel * 0.3) ** 2));
  const vrstica = (t: string, yv: number, vel: number, font: PDFFont, barva: RGB) => {
    const v = naSirino(t, font, vel, Math.min(2 * notranji * 0.9, tetiva(yv, vel)));
    sredina(s, t, cx, yv, v, font, barva);
  };
  if (p === null) {
    vrstica(c.ure > 0 ? ure(c.ure) : "–", yGor - velPct * 0.1, velPct * (c.ure > 0 ? 0.7 : 1), f.krepka, SIVA);
    vrstica(c.ure > 0 ? "brez plana" : "ni plana", yDol - velPct * 0.1, Math.max(6.75, premer * 0.07), f.navadna, SIVA);
  } else {
    // sredina: štempljane ure (veliko), pod njimi razlika do plana in plan
    vrstica(ure(c.ure), yGor, velPct * 0.8, f.krepka, TEMNA);
    vrstica(`${formatRazlikaUr(c.ure - c.plan)} · plan ${ure(c.plan)}`, yDol, Math.max(6.75, premer * 0.075), f.polkrepka, barva.besedilo);
  }

  // ure po krovnih nalogih
  const vel = Math.max(9, Math.min(13, premer * 0.07));
  const vrsta = vel * 1.85;
  let y = vrh - premer - 8;
  const dno = yVrh - h + PAD;
  const ostanek = [c.izven > 0.05 ? `izven plana ${ure(c.izven)}` : "", c.rezija > 0.05 ? `režija ${ure(c.rezija)}` : ""].filter(Boolean).join(" · ");
  const prostor = Math.floor((y - dno - (ostanek ? vel * 1.5 : 0)) / vrsta);
  const krovni = c.krovni.length > prostor ? c.krovni.slice(0, Math.max(0, prostor - 1)) : c.krovni;
  const levo = x + PAD;
  const sirina = w - 2 * PAD;
  for (const k of krovni) {
    const pk = poraba(k.ure, k.plan);
    const st = BARVA_STANJA[stanjePorabe(pk)];
    const vrednost = k.plan > 0 ? `${formatUre(k.ure)} / ${ure(k.plan)}` : ure(k.ure);
    const odstotek = k.plan > 0 ? formatRazlikaUr(k.ure - k.plan) : k.izvenDneva === "pred" ? "pred planom" : k.izvenDneva === "po" ? "po planu" : "";
    const wOdst = Math.max(f.krepka.widthOfTextAtSize("+10,0 h", vel), f.lezeca.widthOfTextAtSize(odstotek, vel * 0.8)) + 4;
    const wVred = f.navadna.widthOfTextAtSize(vrednost, vel);
    const ime = [k.krovni, k.narocnik].filter(Boolean).join(" · ");
    s.drawText(skrajsaj(ime, f.polkrepka, vel, sirina - wVred - wOdst - 12), { x: levo, y: y - vel, size: vel, font: f.polkrepka, color: TEMNA });
    desno(s, vrednost, levo + sirina - wOdst - 6, y - vel, vel, f.navadna, SIVA);
    desno(s, odstotek, levo + sirina, y - vel, k.plan > 0 ? vel : vel * 0.8, k.plan > 0 ? f.krepka : f.lezeca, k.plan > 0 ? st.besedilo : SIVA);
    // pas porabe krovnega: zeleno do plana, nad planom rumeno / rdeče
    const yPas = y - vel - 4.5;
    s.drawRectangle({ x: levo, y: yPas, width: sirina, height: 2.5, color: SLED });
    if (k.plan > 0) {
      s.drawRectangle({ x: levo, y: yPas, width: sirina * Math.min(pk ?? 0, 1), height: 2.5, color: ZELENA });
      if ((pk ?? 0) > 1) s.drawRectangle({ x: levo, y: yPas - 0.75, width: sirina * Math.min((pk ?? 0) - 1, 1), height: 4, color: st.krog });
    } else if (k.ure > 0) s.drawRectangle({ x: levo, y: yPas, width: sirina, height: 2.5, color: hex("#b8bec7") });
    y -= vrsta;
  }
  if (krovni.length < c.krovni.length) {
    s.drawText(`+ še ${c.krovni.length - krovni.length} krovnih (${ure(c.krovni.slice(krovni.length).reduce((a, k) => a + k.ure, 0))})`, {
      x: levo,
      y: y - vel,
      size: vel * 0.85,
      font: f.lezeca,
      color: SIVA,
    });
    y -= vrsta;
  }
  if (!c.krovni.length && c.ure <= 0.05 && c.plan <= 0.05) sredina(s, "Ni plana ne štempljanja.", cx, y - vel, vel, f.lezeca, SIVA);
  if (ostanek) s.drawText(ostanek, { x: levo, y: dno, size: vel * 0.85, font: f.navadna, color: SIVA });
}

/** Legenda barv krožnice (spodaj levo). */
function legenda(s: PDFPage, f: Pisave, x: number, y: number) {
  const vnosi: [RGB, string][] = [
    [ZELENA, "v planu"],
    [RUMENA, "malo čez plan (do +10 %)"],
    [RDECA, "čez plan (nad +10 %)"],
    [SLED, "brez plana"],
  ];
  for (const [barva, t] of vnosi) {
    s.drawCircle({ x: x + 4, y: y + 3, size: 4, color: barva });
    s.drawText(t, { x: x + 12, y, size: 7.5, font: f.navadna, color: SIVA });
    x += 20 + f.navadna.widthOfTextAtSize(t, 7.5);
  }
  s.drawText("Krog = štempljane ure celice proti planiranim uram (delovni plan); številke so ure, + = čez plan.", { x: x + 6, y, size: 7.5, font: f.lezeca, color: SIVA });
}

/** Prenos PDF "Delo - prejšnji dan" za oddelek (stran Produktivnost). */
export async function prenesiDeloPdf(d: DeloOddelka) {
  prenesiDatoteko(await ustvariDeloPdf(d), `${asciiIme(`Delo_${d.naziv}_${d.datum}`)}.pdf`);
}

/** PDF ene strani 16:9 za oddelek. */
export async function ustvariDeloPdf(d: DeloOddelka): Promise<Blob> {
  const naslov = "Delo - prejšnji dan";
  const doc = await novDokument(`${naslov} · ${d.naziv}`);
  const { pdf, logo } = doc;
  const f: Pisave = doc;
  const s = pdf.addPage([W, H]);
  let y = glavaStrani(s, f, logo, `${naslov} · ${d.naziv}`, H - 20, ROB, W - ROB);

  // naslov + oddelek skupaj (brez mest Dodatno delo)
  s.drawText(d.naziv, { x: ROB, y: y - 18, size: 20, font: f.krepka, color: TEMNA });
  s.drawText(`${naslov} · ${formatLong(d.datum)} · štempljane ure proti delovnemu planu`, { x: ROB, y: y - 32, size: 9, font: f.navadna, color: SIVA });
  const redne = d.celice.filter((c) => !c.dodatno);
  const planSk = redne.reduce((a, c) => a + c.plan, 0);
  const ureSk = redne.reduce((a, c) => a + c.ure, 0);
  const pSk = poraba(ureSk, planSk);
  const rSk = 13;
  const cxSk = W - ROB - rSk - 8;
  const cySk = y - 18;
  krogPorabe(s, cxSk, cySk, rSk, 4, pSk);
  desno(s, planSk > 0 ? formatRazlikaUr(ureSk - planSk) : "–", cxSk - rSk - 16, y - 16, 16, f.krepka, BARVA_STANJA[stanjePorabe(pSk)].besedilo);
  desno(s, `Oddelek skupaj · štempljano ${formatUre(ureSk)} / plan ${ure(planSk)}`, cxSk - rSk - 16, y - 30, 8.25, f.navadna, SIVA);
  y -= 44;

  // mreža kartic: do 4 celice v eni vrsti, več v dveh
  const dnoMreze = ROB + 14;
  const n = Math.max(1, d.celice.length);
  const vrst = n <= 4 ? 1 : 2;
  const stolpcev = Math.ceil(n / vrst);
  const wK = (W - 2 * ROB - (stolpcev - 1) * RAZMAK) / stolpcev;
  const hK = (y - dnoMreze - (vrst - 1) * RAZMAK) / vrst;
  if (!d.celice.length) sredina(s, "Oddelek nima celic.", W / 2, H / 2, 14, f.lezeca, SIVA);
  d.celice.forEach((c, i) => kartica(s, f, c, ROB + (i % stolpcev) * (wK + RAZMAK), y - Math.floor(i / stolpcev) * (hK + RAZMAK), wK, hK));

  legenda(s, f, ROB, ROB + 1);
  noga(pdf, f.navadna, `FINES d.o.o. | Production | ${naslov}`, ROB);
  const bajti = await pdf.save();
  return new Blob([bajti as BlobPart], { type: "application/pdf" });
}
