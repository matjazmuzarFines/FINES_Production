// Delovni plan - PREGLED (PDF za obešanje / FIN:TV): poudarek na ROKIH. Levo navpična časovnica z dnevi, nato stolpec
// za vsako celico; v stolpcu krovni nalogi kot okvirčki od dneva začetka do dneva konca (navpični procesni workflow,
// povezani s puščicami). V okvirčku krovni nalog, desno število nalogov in skupno kosov, spodaj rok ("do Pet 24.10").
// Vzporedni krovni v isti celici gredo v vzporedne pasove. Danes = oranžen pas čez vse stolpce.
// Workflow PDF (planPdf.ts) kaže, KAJ je treba narediti; ta pregled, DO KDAJ. Modul se naloži šele ob kliku.
import { rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatShort, toIso, weekday, type IsoDate } from "./dates";
import { barvaCelice, danKratko, ddmm, type WorkflowCelica, type WorkflowKorak, type WorkflowPlan } from "./plan";
import { A4, asciiIme, novDokument, prenesiDatoteko } from "./porociloPdf";
import { formatNum } from "./stevila";

const A3: [number, number] = [841.89, 1190.55];
const ROB = 20;
const CASOVNICA = 66; // širina stolpca z dnevi
const GLAVA_STOLPCA = 40;
const NAJMANJ_VRSTICA = 17; // najnižja vrstica dneva; sicer se plan razdeli na več strani (po tednih)
const NAJVEC_VRSTICA = 64;

const ORANZNA = rgb(202 / 255, 80 / 255, 16 / 255);
const SVETLO_ORANZNA = rgb(253 / 255, 236 / 255, 224 / 255);
const BESEDILO = rgb(0.11, 0.11, 0.12);
const SIVA = rgb(0.42, 0.42, 0.45);
const CRTA = rgb(0.86, 0.86, 0.87);
const CRTA_TEDNA = rgb(0.62, 0.62, 0.65);
const OZADJE = rgb(0.965, 0.965, 0.97);
const RDECA = rgb(0.82, 0.18, 0.18);
const BELA = rgb(1, 1, 1);

type Pisave = { navadna: PDFFont; krepka: PDFFont };

const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const mesaj = (a: RGB, b: RGB, t: number) => rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);

function skrajsaj(t: string, font: PDFFont, velikost: number, sirina: number) {
  if (sirina <= 0) return "";
  if (font.widthOfTextAtSize(t, velikost) <= sirina) return t;
  let n = t.length;
  while (n > 1 && font.widthOfTextAtSize(`${t.slice(0, n)}…`, velikost) > sirina) n--;
  return n <= 1 ? "" : `${t.slice(0, n).trimEnd()}…`;
}

/** Zaobljen pravokotnik; x, yZgoraj = levi zgornji kot. */
function zaobljen(stran: PDFPage, x: number, yZgoraj: number, w: number, h: number, r: number, o: { color?: RGB; borderColor?: RGB; borderWidth?: number }) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const pot = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  stran.drawSvgPath(pot, { x, y: yZgoraj, ...o });
}

const kosiKoraka = (k: WorkflowKorak) => k.nalogi.reduce((s, n) => s + (n.kos ?? 0), 0);
const besediloNalogov = (n: number) => `${n} ${n === 1 ? "nalog" : n === 2 ? "naloga" : n <= 4 ? "nalogi" : "nalogov"}`;

/** Dnevi po straneh: celi tedni, kolikor jih gre na stran (vrstica vsaj NAJMANJ_VRSTICA). */
function straniDni(dnevi: IsoDate[], visina: number): IsoDate[][] {
  const naStran = Math.max(5, Math.floor(visina / NAJMANJ_VRSTICA));
  if (dnevi.length <= naStran) return [dnevi];
  const tedni: IsoDate[][] = [];
  for (const d of dnevi) {
    if (!tedni.length || weekday(d) === 1) tedni.push([]);
    tedni[tedni.length - 1].push(d);
  }
  const strani: IsoDate[][] = [[]];
  for (const t of tedni) {
    if (strani[strani.length - 1].length && strani[strani.length - 1].length + t.length > naStran) strani.push([]);
    strani[strani.length - 1].push(...t);
  }
  return strani;
}

/** Korak na strani: indeks prve in zadnje vrstice (dneva) + ali se nadaljuje izven strani. */
type Postavljen = { k: WorkflowKorak; od: number; do: number; prej: boolean; potem: boolean; pas: number };

function postavi(koraki: WorkflowKorak[], dnevi: IsoDate[]): { postavljeni: Postavljen[]; pasov: number } {
  const prvi = dnevi[0];
  const zadnji = dnevi[dnevi.length - 1];
  const izbrani = koraki
    .filter((k) => k.od <= zadnji && k.do >= prvi)
    .map((k) => {
      let od = dnevi.findIndex((d) => d >= k.od);
      let doo = dnevi.length - 1 - [...dnevi].reverse().findIndex((d) => d <= k.do);
      if (od < 0) od = dnevi.length - 1;
      if (doo >= dnevi.length) doo = 0;
      return { k, od, do: Math.max(od, doo), prej: k.od < prvi, potem: k.do > zadnji, pas: 0 };
    })
    .sort((a, b) => a.od - b.od || a.do - b.do);
  // vzporedni krovni -> pasovi (prvi prost pas)
  const konecPasu: number[] = [];
  for (const p of izbrani) {
    let i = konecPasu.findIndex((konec) => konec < p.od);
    if (i < 0) i = konecPasu.length;
    konecPasu[i] = p.do;
    p.pas = i;
  }
  return { postavljeni: izbrani, pasov: Math.max(1, konecPasu.length) };
}

function puscicaDol(stran: PDFPage, x1: number, y1: number, x2: number, y2: number, barva: RGB) {
  const sredina = (y1 + y2) / 2;
  if (Math.abs(x1 - x2) > 1) {
    stran.drawLine({ start: { x: x1, y: y1 }, end: { x: x1, y: sredina }, thickness: 1.6, color: barva });
    stran.drawLine({ start: { x: x1, y: sredina }, end: { x: x2, y: sredina }, thickness: 1.6, color: barva });
    stran.drawLine({ start: { x: x2, y: sredina }, end: { x: x2, y: y2 + 5 }, thickness: 1.6, color: barva });
  } else stran.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 + 5 }, thickness: 1.6, color: barva });
  stran.drawSvgPath("M 0 0 L -4 -6 L 4 -6 Z", { x: x2, y: y2, color: barva });
}

/** Okvirček krovnega naloga od vrstice od do vrstice do. Vsebina se prilagodi višini. */
function okvircek(stran: PDFPage, f: Pisave, p: Postavljen, x: number, yZgoraj: number, w: number, h: number, barva: RGB) {
  const k = p.k;
  const rdec = k.poOdpremi || k.brezKapacitete > 0;
  zaobljen(stran, x, yZgoraj, w, h, 5, { color: BELA, borderColor: rdec ? RDECA : barva, borderWidth: rdec ? 1.6 : 1 });
  zaobljen(stran, x, yZgoraj, 4, h, 2, { color: rdec ? RDECA : barva });

  const pad = 7;
  const notri = w - pad - 4 - 5;
  const xb = x + pad + 2;
  const desno = (t: string, y: number, v: number, font: PDFFont, c: RGB) => stran.drawText(t, { x: x + w - 5 - font.widthOfTextAtSize(t, v), y, size: v, font, color: c });
  const kosi = kosiKoraka(k);
  const stevila = k.prosta ? "" : `${besediloNalogov(k.nalogi.length)}${kosi ? ` · ${formatNum(kosi)} kos` : ""}`;
  const rok = `${p.potem ? "↓ " : ""}do ${danKratko(k.do)} ${ddmm(k.do)}`;
  const vel = Math.min(10, Math.max(7, h / 3.2));

  if (h < 30) {
    // ena vrsta: krovni levo, številke / rok desno
    const yv = yZgoraj - h / 2 - vel * 0.35;
    const desnoT = notri > 150 ? `${stevila}${stevila ? " · " : ""}${rok}` : notri > 95 ? stevila || rok : "";
    const sDesno = desnoT ? f.navadna.widthOfTextAtSize(desnoT, vel - 1.5) + 6 : 0;
    stran.drawText(skrajsaj(k.krovni, f.krepka, vel, notri - sDesno), { x: xb, y: yv, size: vel, font: f.krepka, color: BESEDILO });
    if (desnoT) desno(desnoT, yv, vel - 1.5, f.navadna, SIVA);
    return;
  }
  // več vrst - od zgoraj: krovni (krepko, pisava se zmanjša do širine), nalogi / kosi, naročnik;
  // od spodaj: rok (krepko, oranžno / rdeče), nad njim začetek ali odprema (rdeče). Vrstica, ki ne gre, se izpusti.
  let velK = Math.min(11, h / 3);
  const krovniT = `${p.prej ? "↑ " : ""}${k.krovni}`;
  while (velK > 7 && f.krepka.widthOfTextAtSize(krovniT, velK) > notri) velK -= 0.25;
  const mali = Math.max(6.5, Math.min(8.5, velK - 1.5));
  let velRok = Math.min(11, Math.max(7, h / 4));
  while (velRok > 6.5 && f.krepka.widthOfTextAtSize(rok, velRok) > notri) velRok -= 0.25;
  // ozek pas: kratka oblika "2 nal. · 20 kos"
  const stevilaT = stevila && f.krepka.widthOfTextAtSize(stevila, mali) > notri ? `${k.nalogi.length} nal.${kosi ? ` · ${formatNum(kosi)} kos` : ""}` : stevila;
  const spodaj: { t: string; v: number; font: PDFFont; c: RGB }[] = [
    { t: rok, v: velRok, font: f.krepka, c: rdec ? RDECA : ORANZNA },
    k.poOdpremi && k.prvaOdprema
      ? { t: `odprema ${danKratko(k.prvaOdprema)} ${ddmm(k.prvaOdprema)}`, v: mali, font: f.krepka, c: RDECA }
      : { t: `${p.prej ? "↑ " : ""}od ${danKratko(k.od)} ${ddmm(k.od)}`, v: mali, font: f.navadna, c: SIVA },
  ];
  const zgoraj: { t: string; v: number; font: PDFFont; c: RGB }[] = [
    { t: krovniT, v: velK, font: f.krepka, c: BESEDILO },
    // še vedno preširoko: nalogi in kosi vsak v svoji vrstici
    ...(stevilaT && f.krepka.widthOfTextAtSize(stevilaT, mali) > notri
      ? [`${k.nalogi.length} nal.`, kosi ? `${formatNum(kosi)} kos` : ""].filter(Boolean).map((t) => ({ t, v: mali, font: f.krepka, c: barva }))
      : stevilaT
        ? [{ t: stevilaT, v: mali, font: f.krepka, c: barva }]
        : []),
    ...(k.narocnik ? [{ t: k.narocnik, v: mali, font: f.navadna, c: SIVA }] : []),
  ];
  let y = yZgoraj - 4;
  let meja = yZgoraj - h + 4; // spodnji rob prostega prostora
  const dno: typeof spodaj = [];
  for (const v of spodaj) {
    if (meja + v.v + 2 > y - velK - 2) break;
    dno.push(v);
    meja += v.v + 3;
  }
  for (const v of zgoraj) {
    if (y - v.v < meja + 1) break;
    y -= v.v + 2;
    stran.drawText(skrajsaj(v.t, v.font, v.v, notri), { x: xb, y, size: v.v, font: v.font, color: v.c });
    y -= 1;
  }
  let yd = yZgoraj - h + 5;
  for (const v of dno) {
    stran.drawText(skrajsaj(v.t, v.font, v.v, notri), { x: xb, y: yd, size: v.v, font: v.font, color: v.c });
    yd += v.v + 3;
  }
}

function glava(stran: PDFPage, f: Pisave, logo: Awaited<ReturnType<typeof novDokument>>["logo"], plan: WorkflowPlan, sirina: number, vrh: number, nadaljevanje: string) {
  if (logo) {
    const s = logo.scaleToFit(78, 20);
    stran.drawImage(logo, { x: ROB, y: vrh - s.height, width: s.width, height: s.height });
  }
  const desno = (t: string, y: number, v: number, font: PDFFont, c: RGB) => stran.drawText(t, { x: ROB + sirina - font.widthOfTextAtSize(t, v), y, size: v, font, color: c });
  desno(`Delovni plan - pregled · ${plan.oddelek} · ${formatShort(plan.od)} – ${formatShort(plan.do)}`, vrh - 9, 10, f.krepka, BESEDILO);
  desno(`natisnjeno ${formatShort(toIso(new Date()))}`, vrh - 19, 7, f.navadna, SIVA);
  stran.drawRectangle({ x: ROB, y: vrh - 25, width: sirina, height: 1.5, color: ORANZNA });
  const y = vrh - 45;
  stran.drawRectangle({ x: ROB, y: y - 3, width: 4, height: 18, color: ORANZNA });
  stran.drawText(`DO KDAJ?${nadaljevanje}`, { x: ROB + 11, y, size: 16, font: f.krepka, color: BESEDILO });
  const krovnih = plan.celice.reduce((s, c) => s + c.koraki.length, 0);
  const kosov = plan.celice.reduce((s, c) => s + c.koraki.reduce((t, k) => t + kosiKoraka(k), 0), 0);
  desno(`${plan.celice.length} celic · ${krovnih} krovnih nalogov · ${formatNum(kosov)} kos · okvirček = od začetka do roka`, y + 2, 9, f.navadna, SIVA);
}

export async function ustvariPlanPregledPdf(plan: WorkflowPlan): Promise<Blob> {
  if (plan.celice.length === 0) throw new Error("V prikazanem obdobju ni postavitev.");
  const { pdf, navadna, krepka, logo } = await novDokument(`Delovni plan - pregled ${plan.oddelek}`, "dejavu");
  const f: Pisave = { navadna, krepka };
  // A4 ležeče do 6 celic, sicer A3 ležeče (stolpci ostanejo berljivi)
  const STRAN: [number, number] = plan.celice.length <= 6 ? [A4[1], A4[0]] : [A3[1], A3[0]];
  const sirina = STRAN[0] - 2 * ROB;
  const vrhMreze = STRAN[1] - ROB - 58;
  const dno = ROB + 14;
  const visinaVrstic = vrhMreze - GLAVA_STOLPCA - dno;
  const danes = toIso(new Date());
  const delovni = plan.dnevi.filter((d) => weekday(d) <= 5);
  const sklopi = straniDni(delovni.length ? delovni : plan.dnevi, visinaVrstic);

  sklopi.forEach((dnevi, si) => {
    const stran = pdf.addPage(STRAN);
    stran.drawRectangle({ x: 0, y: 0, width: STRAN[0], height: STRAN[1], color: OZADJE });
    glava(stran, f, logo, plan, sirina, STRAN[1] - ROB, sklopi.length > 1 ? `  (${si + 1}/${sklopi.length}: ${ddmm(dnevi[0])} – ${ddmm(dnevi[dnevi.length - 1])})` : "");

    const vrsta = Math.min(NAJVEC_VRSTICA, visinaVrstic / dnevi.length);
    const yVrha = vrhMreze - GLAVA_STOLPCA; // vrh prve vrstice
    const yDna = yVrha - vrsta * dnevi.length;
    const stolpec = (sirina - CASOVNICA) / plan.celice.length;
    const xCelic = ROB + CASOVNICA;

    // ozadje mreže
    zaobljen(stran, ROB, vrhMreze, sirina, vrhMreze - yDna, 8, { color: BELA, borderColor: CRTA, borderWidth: 0.8 });

    // vrstice dni: danes (oranžen pas), črte, nov teden = debelejša črta
    dnevi.forEach((d, i) => {
      const y = yVrha - i * vrsta;
      if (d === danes) {
        stran.drawRectangle({ x: ROB + 1, y: y - vrsta, width: sirina - 2, height: vrsta, color: SVETLO_ORANZNA });
      }
      const novTeden = i > 0 && weekday(d) < weekday(dnevi[i - 1]);
      stran.drawLine({ start: { x: ROB + (novTeden ? 0 : CASOVNICA), y }, end: { x: ROB + sirina, y }, thickness: novTeden ? 1.2 : 0.5, color: novTeden ? CRTA_TEDNA : CRTA });
      // časovnica: dan in datum
      const danT = danKratko(d).toUpperCase();
      const datT = ddmm(d);
      const v = Math.min(12, Math.max(7.5, vrsta * 0.42));
      const jeDanes = d === danes;
      const barva = jeDanes ? ORANZNA : BESEDILO;
      if (vrsta >= 26) {
        stran.drawText(datT, { x: ROB + 8, y: y - vrsta / 2 - 1, size: v, font: f.krepka, color: barva });
        stran.drawText(jeDanes ? "DANES" : danT, { x: ROB + 8, y: y - vrsta / 2 - v * 0.95 - 1, size: v * 0.62, font: f.krepka, color: jeDanes ? ORANZNA : SIVA });
      } else {
        stran.drawText(datT, { x: ROB + 8, y: y - vrsta / 2 - v * 0.35, size: v, font: f.krepka, color: barva });
        stran.drawText(jeDanes ? "DANES" : danT, { x: ROB + 8 + f.krepka.widthOfTextAtSize(datT, v) + 4, y: y - vrsta / 2 - v * 0.35, size: v * 0.68, font: f.krepka, color: jeDanes ? ORANZNA : SIVA });
      }
    });
    stran.drawLine({ start: { x: ROB + CASOVNICA, y: vrhMreze }, end: { x: ROB + CASOVNICA, y: yDna }, thickness: 1.2, color: CRTA_TEDNA });
    stran.drawText("DAN", { x: ROB + 8, y: vrhMreze - GLAVA_STOLPCA / 2 - 3, size: 7.5, font: f.krepka, color: SIVA });

    // stolpci celic
    plan.celice.forEach((c: WorkflowCelica, ci) => {
      const barva = hex(barvaCelice(ci));
      const x = xCelic + ci * stolpec;
      if (ci > 0) stran.drawLine({ start: { x, y: vrhMreze }, end: { x, y: yDna }, thickness: 0.6, color: CRTA });
      // glava stolpca: ime v barvni ploščici, pod njim povzetek
      const { postavljeni, pasov } = postavi(c.koraki, dnevi);
      const kosov = postavljeni.reduce((s, p) => s + kosiKoraka(p.k), 0);
      zaobljen(stran, x + 4, vrhMreze - 4, stolpec - 8, 17, 4, { color: barva });
      const ime = skrajsaj(c.naziv.toUpperCase(), f.krepka, 8.5, stolpec - 16);
      stran.drawText(ime, { x: x + stolpec / 2 - f.krepka.widthOfTextAtSize(ime, 8.5) / 2, y: vrhMreze - 16, size: 8.5, font: f.krepka, color: BELA });
      const pov = skrajsaj(`${postavljeni.length} krovnih · ${formatNum(kosov)} kos`, f.navadna, 7, stolpec - 10);
      stran.drawText(pov, { x: x + stolpec / 2 - f.navadna.widthOfTextAtSize(pov, 7) / 2, y: vrhMreze - 31, size: 7, font: f.navadna, color: SIVA });
      // rahel ton celice pod okvirčki
      stran.drawRectangle({ x: x + 1, y: yDna + 1, width: stolpec - 2, height: yVrha - yDna - 1, color: mesaj(barva, BELA, 0.95), opacity: 0.6 });

      const notri = stolpec - 10;
      const pasW = notri / pasov;
      const okvir = (p: Postavljen) => {
        const yZ = yVrha - p.od * vrsta - 2.5;
        const h = (p.do - p.od + 1) * vrsta - 5;
        return { x: x + 5 + p.pas * pasW + (p.pas ? 2 : 0), y: yZ, w: pasW - (pasov > 1 ? 2 : 0), h };
      };
      // puščice med zaporednimi koraki (konec prejšnjega -> začetek naslednjega)
      postavljeni.forEach((p, i) => {
        const nasl = postavljeni[i + 1];
        if (!nasl) return;
        const a = okvir(p);
        const b = okvir(nasl);
        if (b.y < a.y - a.h - 4) puscicaDol(stran, a.x + a.w / 2, a.y - a.h, b.x + b.w / 2, b.y, mesaj(barva, BELA, 0.25));
      });
      postavljeni.forEach((p) => {
        const o = okvir(p);
        okvircek(stran, f, p, o.x, o.y, o.w, o.h, barva);
      });
    });
  });

  // noga
  const strani = pdf.getPages();
  const noga = `FINES d.o.o. | Production | Delovni plan - pregled ${plan.oddelek} | rdeče = konec po odpremi ali brez kapacitete`;
  strani.forEach((st, i) => {
    const t = `Stran ${i + 1} / ${strani.length}`;
    const [w] = [st.getWidth()];
    st.drawText(noga, { x: ROB, y: ROB - 8, size: 7, font: navadna, color: SIVA });
    st.drawText(t, { x: w - ROB - navadna.widthOfTextAtSize(t, 7), y: ROB - 8, size: 7, font: navadna, color: SIVA });
  });
  const bajti = await pdf.save();
  return new Blob([bajti as BlobPart], { type: "application/pdf" });
}

export const imePregleda = (plan: WorkflowPlan) => asciiIme(`Delovni_plan_pregled_${plan.oddelek}_${plan.od}`);

export async function prenesiPlanPregledPdf(plan: WorkflowPlan) {
  prenesiDatoteko(await ustvariPlanPregledPdf(plan), `${imePregleda(plan)}.pdf`);
}
