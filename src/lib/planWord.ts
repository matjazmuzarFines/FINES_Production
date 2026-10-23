// Delovni plan kot workflow v Wordu (.docx) - ista vsebina kot PDF, da se lahko popravi in dopiše.
// 1. stran je prerazporeditev zaposlenih (ena tabela za vse celice), nato za vsako delovno mesto svoja stran, koraki so tabele, med njimi puščica. Modul se naloži šele ob kliku.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextDirection,
  TextRun,
  VerticalAlign,
  WidthType,
  type ParagraphChild,
} from "docx";
import { formatShort, toIso } from "./dates";
import { barvaCelice, besediloOdprem, danInDatum, danKratko, ddmm, nalogiKoraka, oznakaKoraka, type WorkflowCelica, type WorkflowKorak, type WorkflowPlan } from "./plan";
import { imePlana } from "./planPdf";
import { naloziBajte, prenesiDatoteko } from "./porociloPdf";
import { formatNum, formatUre } from "./stevila";

const PISAVA = "Calibri";
const ORANZNA = "CA5010";
const TEMNA = "2B2B2E";
const SIVA = "6B6B72";
const SVETLO_SIVA = "C7C7CC";
const CRTA = "DCDCDE";
const RDECA = "D12E2E";
const ZELENA = "16803D";
const ZELENA_SVETLA = "4ADE80";
// A4 pokončno, robovi 1,5 cm (v twipih)
const ROB = 850;
const SIRINA = 11906 - 2 * ROB;

const t = (text: string, o: { size?: number; bold?: boolean; color?: string } = {}) =>
  new TextRun({ text, font: PISAVA, size: (o.size ?? 10) * 2, bold: o.bold, color: o.color ?? TEMNA });

const p = (children: ParagraphChild[], o: { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ children, spacing: { before: o.before ?? 0, after: o.after ?? 60 }, alignment: o.align });

const brez = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const crta = { style: BorderStyle.SINGLE, size: 6, color: CRTA };

/** Velikost PNG iz glave datoteke (IHDR). */
function velikostPng(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

function korak(k: WorkflowKorak, st: number): Table {
  const robBarva = k.poOdpremi || k.brezKapacitete > 0 ? RDECA : k.delni ? ORANZNA : CRTA;
  const rob = { style: BorderStyle.SINGLE, size: k.poOdpremi || k.delni ? 12 : 6, color: robBarva };

  const levo = new TableCell({
    width: { size: 26, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: TEMNA, color: "auto" },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 120, bottom: 120, left: 160, right: 120 },
    children: [
      p([t(`KORAK ${st}`, { size: 8, bold: true, color: ORANZNA })], { after: 20 }),
      p([t(k.prosta ? "DODATNO DELO" : "KROVNI NALOG", { size: 7, bold: true, color: SVETLO_SIVA })], { after: 0 }),
      p([t(k.krovni, { size: 24, bold: true, color: "FFFFFF" })], { after: 40 }),
      p([t(oznakaKoraka(k), { size: 10, bold: true, color: k.delni ? ORANZNA : k.vseh === null ? SVETLO_SIVA : ZELENA_SVETLA })], { after: 0 }),
    ],
  });

  const desnoVsebina: Paragraph[] = [
    new Paragraph({
      tabStops: [{ type: TabStopType.LEFT, position: 2800 }],
      spacing: { after: 0 },
      children: [t("ZAČETEK", { size: 7, bold: true, color: SIVA }), new TextRun({ text: "\t" }), t("KONEC", { size: 7, bold: true, color: SIVA })],
    }),
    new Paragraph({
      tabStops: [{ type: TabStopType.LEFT, position: 2800 }],
      spacing: { after: 60 },
      children: [
        t(danInDatum(k.od), { size: 15, bold: true }),
        t("  →", { size: 12, color: SVETLO_SIVA }),
        new TextRun({ text: "\t" }),
        t(danInDatum(k.do), { size: 15, bold: true, color: k.poOdpremi ? RDECA : TEMNA }),
      ],
    }),
    p([
      t(`${formatUre(k.ure)} h${k.prvaOdprema ? ` · prva odprema ${ddmm(k.prvaOdprema)}` : ""}`, { size: 9, color: SIVA }),
      ...(k.poOdpremi ? [t("   PO ODPREMI", { size: 9, bold: true, color: RDECA })] : []),
    ]),
  ];
  if (k.narocnik) desnoVsebina.push(p([t(k.narocnik, { size: 9, bold: true })]));
  if (k.brezKapacitete > 0) desnoVsebina.push(p([t(`${formatUre(k.brezKapacitete)} h brez kapacitete v planu`, { size: 9, bold: true, color: RDECA })]));
  if (k.nalogi.length) {
    desnoVsebina.push(
      p(
        [
          t(k.vseh === null ? `NALOGI (${k.nalogi.length})` : k.delni ? `VKLJUČENI NALOGI ${k.nalogi.length}/${k.vseh}` : `VSI NALOGI ${k.vseh}/${k.vseh}`, {
            size: 10,
            bold: true,
            color: k.delni ? ORANZNA : k.vseh === null ? SIVA : ZELENA,
          }),
        ],
        { before: 80, after: 20 },
      ),
    );
    for (const n of k.nalogi) {
      desnoVsebina.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.LEFT, position: 900 },
            { type: TabStopType.RIGHT, position: 7400 },
          ],
          spacing: { after: 10 },
          children: [
            t(n.st_naloga, { size: 9, bold: true }),
            new TextRun({ text: "\t" }),
            t([n.ident, n.naziv].filter(Boolean).join(" "), { size: 8.5, color: SIVA }),
            new TextRun({ text: "\t" }),
            t(n.kos === null ? "" : `${formatNum(n.kos)} kos`, { size: 9, bold: true }),
          ],
        }),
      );
      if (n.odpreme.length)
        desnoVsebina.push(
          new Paragraph({
            indent: { left: 900 },
            spacing: { after: 10 },
            children: [
              t("ODPREMA  ", { size: 7, bold: true, color: SIVA }),
              t(besediloOdprem(n.odpreme), { size: 8.5, bold: true, color: n.odpreme[0] < k.do ? RDECA : ORANZNA }),
            ],
          }),
        );
    }
  }
  if (k.opomba) desnoVsebina.push(p([t("Opomba: ", { size: 9, bold: true }), t(k.opomba, { size: 9 })], { before: 80 }));

  return new Table({
    width: { size: SIRINA, type: WidthType.DXA },
    borders: { top: rob, bottom: rob, left: rob, right: rob, insideHorizontal: brez, insideVertical: brez },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          levo,
          new TableCell({
            width: { size: 74, type: WidthType.PERCENTAGE },
            margins: { top: 120, bottom: 120, left: 200, right: 160 },
            children: desnoVsebina,
          }),
        ],
      }),
    ],
  });
}

const osebeBesedilo = (n: number) => formatNum(Math.round(n * 10) / 10);

/** Prerazporeditev zaposlenih (1. stran): ena tabela za vse celice, levo navpično ime celice (kot v PDF). */
function prerazporeditev(plan: WorkflowPlan): (Paragraph | Table)[] {
  const n = plan.dnevi.length;
  const pasW = 420;
  const labelW = 2000;
  const danW = Math.floor((SIRINA - pasW - labelW) / n);
  const celicaT = (
    children: ParagraphChild[],
    o: { w: number; fill?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; columnSpan?: number },
  ) =>
    new TableCell({
      width: { size: o.w, type: WidthType.DXA },
      columnSpan: o.columnSpan,
      shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 20, bottom: 20, left: 40, right: 40 },
      children: [new Paragraph({ alignment: o.align ?? AlignmentType.CENTER, spacing: { after: 0 }, children })],
    });
  const vrstica = (pas: TableCell | null, oznaka: ParagraphChild[], vrednosti: { t: string; fill?: string; color?: string }[]) =>
    new TableRow({
      cantSplit: true,
      children: [
        ...(pas ? [pas] : []),
        celicaT(oznaka, { w: labelW, align: AlignmentType.LEFT }),
        ...vrednosti.map((v) => celicaT(v.t ? [t(v.t, { size: 8, bold: true, color: v.color })] : [], { w: danW, fill: v.fill })),
      ],
    });
  const rob = { style: BorderStyle.SINGLE, size: 4, color: "FFFFFF" };

  const vrstice = plan.celice.flatMap((c, ci) => {
    const barva = barvaCelice(ci);
    const prosto = c.zaposleniPoDnevih.map((z, i) => Math.max(0, Math.round((z - c.koraki.reduce((s, k) => s + k.osebe[i], 0)) * 10) / 10));
    const imaProste = prosto.some((x) => x > 0);
    const pas = new TableCell({
      width: { size: pasW, type: WidthType.DXA },
      rowSpan: c.koraki.length + 1 + (imaProste ? 1 : 0),
      textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT,
      shading: { type: ShadingType.CLEAR, fill: barva, color: "auto" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 40, bottom: 40, left: 20, right: 20 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [t(c.naziv, { size: 8.5, bold: true, color: "FFFFFF" })] })],
    });
    return [
      ...c.koraki.map((k, j) =>
        vrstica(
          j === 0 ? pas : null,
          [
            t(`${j + 1}  `, { size: 8, bold: true, color: barva }),
            t(k.krovni, { size: 8.5, bold: true }),
            t(`  ${nalogiKoraka(k)}`, { size: 7.5, color: SIVA }),
          ],
          k.osebe.map((o) => (o > 0 ? { t: osebeBesedilo(o), fill: barva, color: "FFFFFF" } : { t: "" })),
        ),
      ),
      vrstica(
        null,
        [t("Zaposleni na celici", { size: 8, bold: true })],
        c.zaposleniPoDnevih.map((z) => (z > 0 ? { t: osebeBesedilo(z), fill: TEMNA, color: "FFFFFF" } : { t: "–", color: SIVA })),
      ),
      ...(imaProste
        ? [
            vrstica(
              null,
              [t("Prosto (brez naloga)", { size: 8, bold: true, color: ZELENA })],
              prosto.map((x) => (x > 0 ? { t: osebeBesedilo(x), fill: "DCF5E4", color: ZELENA } : { t: "" })),
            ),
          ]
        : []),
    ];
  });

  const stKorakov = plan.celice.reduce((s, c) => s + c.koraki.length, 0);
  return [
    new Paragraph({
      spacing: { after: 40 },
      border: { left: { style: BorderStyle.SINGLE, size: 36, color: ORANZNA, space: 8 } },
      children: [t("PRERAZPOREDITEV ZAPOSLENIH", { size: 20, bold: true })],
    }),
    p(
      [
        t(
          `${formatShort(plan.od)} – ${formatShort(plan.do)} · ${plan.celice.length} ${plan.celice.length === 1 ? "celica" : "celic"} · ${stKorakov} krovnih nalogov · število oseb na krovnem nalogu po dnevih, številka = korak na strani celice`,
          { size: 9, color: SIVA },
        ),
      ],
      { after: 160 },
    ),
    new Table({
      width: { size: pasW + labelW + n * danW, type: WidthType.DXA },
      columnWidths: [pasW, labelW, ...plan.dnevi.map(() => danW)],
      borders: { top: rob, bottom: rob, left: rob, right: rob, insideHorizontal: rob, insideVertical: rob },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            celicaT([], { w: pasW + labelW, columnSpan: 2 }),
            ...plan.dnevi.map((d) =>
              celicaT([t(danKratko(d), { size: 6.5, bold: true, color: SIVA }), new TextRun({ break: 1 }), t(ddmm(d), { size: 7.5, bold: true })], { w: danW }),
            ),
          ],
        }),
        ...vrstice,
      ],
    }),
  ];
}

function celica(c: WorkflowCelica, plan: WorkflowPlan): (Paragraph | Table)[] {
  const ure = c.koraki.reduce((s, k) => s + k.ure, 0);
  const vsebina: (Paragraph | Table)[] = [
    new Paragraph({
      pageBreakBefore: true,
      spacing: { after: 40 },
      border: { left: { style: BorderStyle.SINGLE, size: 36, color: ORANZNA, space: 8 } },
      children: [t(c.naziv, { size: 22, bold: true })],
    }),
    p(
      [
        t(
          `${formatShort(plan.od)} – ${formatShort(plan.do)} · ${c.koraki.length} ${c.koraki.length === 1 ? "krovni nalog" : "krovnih nalogov"} · ${formatUre(ure)} h · privzeto ${formatNum(c.zaposleni)} oseb`,
          { size: 10, color: SIVA },
        ),
      ],
      { after: 200 },
    ),
  ];
  c.koraki.forEach((k, i) => {
    if (i > 0) vsebina.push(p([t("▼", { size: 16, color: ORANZNA })], { align: AlignmentType.CENTER, before: 40, after: 40 }));
    vsebina.push(korak(k, i + 1));
  });
  return vsebina;
}

export async function ustvariPlanDocx(plan: WorkflowPlan): Promise<Blob> {
  if (plan.celice.length === 0) throw new Error("V prikazanem obdobju ni postavitev.");
  const logo = await naloziBajte("/fines-logo.png").catch(() => null);
  const velikost = logo ? velikostPng(logo) : null;
  const logoVisina = 30;

  const glava = new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: SIRINA }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ORANZNA, space: 4 } },
        children: [
          ...(logo && velikost
            ? [new ImageRun({ type: "png", data: logo, transformation: { width: Math.round((velikost.w / velikost.h) * logoVisina), height: logoVisina } })]
            : [t("FINES", { size: 16, bold: true })]),
          new TextRun({ text: "\t" }),
          t(`Delovni plan · ${plan.oddelek}`, { size: 14, bold: true }),
        ],
      }),
      p([t(`Natisnjeno ${formatShort(toIso(new Date()))}`, { size: 8, color: SIVA })], { align: AlignmentType.RIGHT }),
    ],
  });

  const noga = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: SIRINA }],
        border: { top: { ...crta, space: 4 } },
        children: [
          t(`FINES d.o.o. | Production | Delovni plan ${plan.oddelek}`, { size: 8, color: SIVA }),
          new TextRun({ text: "\t" }),
          new TextRun({ children: ["Stran ", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: PISAVA, size: 16, color: SIVA }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: "FINES d.o.o.",
    title: `Delovni plan ${plan.oddelek}`,
    styles: { default: { document: { run: { font: PISAVA } } } },
    sections: [
      {
        properties: { page: { margin: { top: ROB, bottom: ROB, left: ROB, right: ROB, header: 400, footer: 400 } } },
        headers: { default: glava },
        footers: { default: noga },
        children: [...prerazporeditev(plan), ...plan.celice.flatMap((c) => celica(c, plan))],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function prenesiPlanDocx(plan: WorkflowPlan) {
  prenesiDatoteko(await ustvariPlanDocx(plan), `${imePlana(plan)}.docx`);
}
