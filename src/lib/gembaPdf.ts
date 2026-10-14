// Poročilo gemba walka: PDF (ustvari se v brskalniku) in e-mail za Outlook (.eml s PDF priponko).
// Enak način kot v projektu Rabljena oprema: pdf-lib + pisava DejaVu Sans (č, š, ž).
// Knjižnica se naloži šele ob kliku na gumb (dinamičen import).
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatShort, isoWeek, toIso, type IsoDate } from "./dates";
import { izgubaPoKodi } from "./gembaVodic";
import {
  akcijaZamuja,
  formatCas,
  formatEur,
  formatEur2,
  formatH,
  formatHKos,
  formatMinKos,
  formatTrajanje,
  hNaKos,
  letoTedna,
  obdobjeTedna,
  prenesiPrilogo,
  prihranekAkcije,
  statistika,
  type Akcija,
  type AkcijaStatus,
  type GembaPolja,
  type GembaStatus,
  type Nastavitve,
  type PovpStatus,
  type Priloga,
} from "./produktivnost";
import { formatNum } from "./stevila";

export type GembaPorocilo = {
  teden: IsoDate;
  status: GembaStatus | null;
  polja: GembaPolja;
  akcijeTedna: Akcija[];
  odprtePrej: Akcija[];
  priloge: Priloga[];
  nastavitve: Nastavitve;
};

const A4: [number, number] = [595.28, 841.89];
const ROB = 42;
const SIRINA = A4[0] - 2 * ROB;
const ORANZNA = rgb(202 / 255, 80 / 255, 16 / 255);
const TEMNA = rgb(0.11, 0.11, 0.12);
const SIVA = rgb(0.42, 0.42, 0.45);
const CRTA = rgb(0.86, 0.86, 0.87);
const GLAVA_TABELE = rgb(0.17, 0.17, 0.18);
const SKUPINA = rgb(0.86, 0.86, 0.87);
const OZADJE_SLIKE = rgb(0.95, 0.95, 0.96);

const STATUS_AKCIJE: Record<AkcijaStatus, string> = {
  ODPRTO: "Odprto",
  V_DELU: "V delu",
  IZVEDENO: "Izvedeno",
  PREVERJENO: "Preverjeno",
  OPUSCENO: "Opuščeno",
};
const STATUS_POVP: Record<PovpStatus, string> = {
  POSLANO: "Poslano",
  PONUDBA: "Prejeta ponudba",
  NAROCENO: "Naročeno",
  ZAVRNJENO: "Zavrnjeno",
};

// ---------------------------------------------------------------------------
// Pomožno

const naloziBajte = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Prenos ni uspel: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
};

/** Slika ali skica -> pomanjšan JPG v PDF (bela podlaga). Ob napaki PDF nastane brez slike. */
async function vgradiSliko(pdf: PDFDocument, p: Priloga, maxStranica = 1400): Promise<PDFImage | null> {
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
function prelomi(besedilo: string, font: PDFFont, velikost: number, sirina: number): string[] {
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

type Stolpec = { naslov: string; sirina: number; desno?: boolean };
type Vrstica = { celice: string[]; skupina?: undefined; poudari?: number[] } | { skupina: string; celice?: undefined };

/** Piše dokument od zgoraj navzdol in sam doda novo stran, ko zmanjka prostora. */
class Pisec {
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
// Vsebina

const naslovGembe = (p: GembaPorocilo) => `Gemba walk · ${isoWeek(p.teden)}. teden ${letoTedna(p.teden)}`;

/** Osnovni podatki (PDF in telo e-maila). */
function osnovniPodatki(p: GembaPorocilo): [string, string][] {
  const o = p.polja.orodja;
  const tema = izgubaPoKodi(p.polja.tema);
  return [
    ["Teden", `${obdobjeTedna(p.teden)} ${letoTedna(p.teden)}`],
    ["Datum izvedbe", p.polja.datum ? formatShort(p.polja.datum) : ""],
    ["Čas začetka", o.zacetek_ura ?? ""],
    ["Trajanje", o.trajanje_s ? formatTrajanje(o.trajanje_s) : ""],
    ["Celica / družina", p.polja.lokacija],
    ["Udeleženci", p.polja.udelezenci],
    ["Tema tedna", tema?.naziv ?? ""],
    ["Status", p.status === "ZAKLJUCEN" ? "Zaključena" : p.status ? "V delu" : "Ni začeto"],
  ];
}

/** Seštevek prihrankov akcij (brez opuščenih): EUR/leto, h/leto in akcije brez letne količine. */
function prihranek(akcije: Akcija[], n: Nastavitve) {
  const sez = akcije.filter((a) => a.status !== "OPUSCENO").map((a) => prihranekAkcije(a, n)).filter((x) => x.imaPrihranek);
  return {
    st: sez.length,
    eurLeto: sez.reduce((s, x) => s + (x.eurLeto ?? 0), 0),
    hLeto: sez.reduce((s, x) => s + (x.hLeto ?? 0), 0),
    brezKolicine: sez.filter((x) => x.kolicina === null).length,
  };
}

/** Celica tabele: min/kos, EUR/kos in EUR/leto (vsak v svoji vrstici). */
function prihranekCelica(a: Akcija, n: Nastavitve) {
  const p = prihranekAkcije(a, n);
  if (!p.imaPrihranek) return "";
  return [
    a.prihranek_min_kos ? formatMinKos(a.prihranek_min_kos) : null,
    `${formatEur2(p.eurKos)}/kos`,
    p.eurLeto !== null ? `${formatEur(p.eurLeto)}/leto` : "ni količine",
  ]
    .filter(Boolean)
    .join("\n");
}

function statusAkcije(a: Akcija, danes: IsoDate) {
  return akcijaZamuja(a, danes) ? "Zamuja" : STATUS_AKCIJE[a.status];
}

export async function ustvariPdf(p: GembaPorocilo): Promise<Blob> {
  const w = await Pisec.ustvari(naslovGembe(p));
  const danes = toIso(new Date());
  const slike = p.priloge.filter((x) => x.tip === "SLIKA");
  const skice = p.priloge.filter((x) => x.tip === "SKICA");
  const povp = p.priloge.filter((x) => x.tip === "POVPRASEVANJE");
  const [vSlike, vSkice] = await Promise.all([
    Promise.all(slike.map(async (s) => ({ opis: s.opis ?? "", slika: await vgradiSliko(w.pdf, s) }))),
    Promise.all(skice.map(async (s) => ({ opis: s.opis ?? "", slika: await vgradiSliko(w.pdf, s, 1800) }))),
  ]);

  w.glava("Gemba walk - zapisnik");
  w.tekst(naslovGembe(p), ROB, 18, w.krepka);
  w.y -= 22;
  w.tekst("Produktivnost - tedenski sprehod po proizvodnji", ROB, 10, w.navadna, SIVA);
  w.y -= 16;

  // 1. Osnovni podatki
  w.podnaslov("Osnovni podatki");
  w.pari(osnovniPodatki(p));

  // 2. Zapisnik + orodja
  w.podnaslov("Zapisnik");
  if (p.polja.zapisnik.trim()) w.besedilo(p.polja.zapisnik.trim());
  else w.besedilo("Ni zapisa.", 10, SIVA);

  const o = p.polja.orodja;
  const meritve = o.meritve.filter((m) => m.casi.length);
  if (meritve.length) {
    w.oznaka("Meritve operacij (štoparica)", 60);
    w.tabela(
      [
        { naslov: "Operacija", sirina: 150 },
        { naslov: "Meritev", sirina: 45, desno: true },
        { naslov: "Povprečje", sirina: 55, desno: true },
        { naslov: "Min", sirina: 45, desno: true },
        { naslov: "Max", sirina: 45, desno: true },
        { naslov: "Časi", sirina: SIRINA - 340 },
      ],
      meritve.map((m) => {
        const st = statistika(m.casi)!;
        return {
          celice: [m.naziv, String(st.n), formatCas(st.povp), formatCas(st.min), formatCas(st.max), m.casi.map(formatCas).join(", ")],
          poudari: [2],
        };
      }),
    );
  }
  if (o.stevci.length) {
    w.oznaka("Števci dogodkov", 50);
    w.tabela(
      [
        { naslov: "Dogodek", sirina: 220 },
        { naslov: "Število", sirina: 60, desno: true },
      ],
      o.stevci.map((s) => ({ celice: [s.naziv, `${s.stevilo}×`], poudari: [1] })),
    );
  }
  const h = hNaKos(p.polja);
  if (h !== null) {
    w.oznaka("KPI tedna");
    w.besedilo(`${formatNum(p.polja.kpi_ure)} človek-ur / ${formatNum(p.polja.kpi_kosi)} dobrih pečic = ${formatHKos(h)}`);
  }
  const pt = prihranek(p.akcijeTedna, p.nastavitve);
  if (pt.st > 0) {
    w.oznaka("Ocena prihranka akcij tega tedna (kalkulator)");
    w.besedilo(
      `${formatEur(pt.eurLeto)} na leto · ${formatH(pt.hLeto)} dela na leto (${formatNum(p.nastavitve.urnaPostavka)} EUR/h, letne količine družin)` +
        (pt.brezKolicine ? ` · brez letne količine (ni všteto): ${pt.brezKolicine}` : ""),
    );
  }

  // 3. Tabla izboljšav
  w.podnaslov("Tabla izboljšav", 80);
  const vrsticeAkcij = (akcije: Akcija[]): Vrstica[] =>
    akcije.map((a) => ({
      celice: [
        a.problem,
        [a.ukrep, a.rezultat ? `Rezultat: ${a.rezultat}` : null].filter(Boolean).join("\n"),
        izgubaPoKodi(a.kategorija)?.naziv ?? "",
        a.odgovoren ?? "",
        a.rok ? formatShort(a.rok) : "",
        statusAkcije(a, danes),
        prihranekCelica(a, p.nastavitve),
      ],
      poudari: [5],
    }));
  const vrstice: Vrstica[] = [];
  if (p.akcijeTedna.length) vrstice.push({ skupina: `Nove akcije tega tedna (${p.akcijeTedna.length})` }, ...vrsticeAkcij(p.akcijeTedna));
  if (p.odprtePrej.length) vrstice.push({ skupina: `Odprte iz prejšnjih tednov (${p.odprtePrej.length})` }, ...vrsticeAkcij(p.odprtePrej));
  if (vrstice.length) {
    w.tabela(
      [
        { naslov: "Problem", sirina: 104 },
        { naslov: "Ukrep / rezultat", sirina: 106 },
        { naslov: "Izguba", sirina: 58 },
        { naslov: "Odgovoren", sirina: 54 },
        { naslov: "Rok", sirina: 62 },
        { naslov: "Status", sirina: 46 },
        { naslov: "Prihranek", sirina: SIRINA - 430, desno: true },
      ],
      vrstice,
    );
  } else {
    w.besedilo("Ni akcij.", 10, SIVA);
  }

  // 4. Priloge
  if (vSlike.length || vSkice.length || povp.length) {
    w.podnaslov("Priloge", 80);
    if (vSlike.length) {
      w.oznaka(`Slike (${vSlike.length})`, 220);
      w.mrezaSlik(vSlike, 2);
    }
    if (vSkice.length) {
      w.oznaka(`Skice (${vSkice.length})`, 300);
      w.mrezaSlik(vSkice, 1);
    }
    if (povp.length) {
      w.oznaka(`Povpraševanja (${povp.length})`, 50);
      w.tabela(
        [
          { naslov: "Datoteka", sirina: 170 },
          { naslov: "Opis", sirina: 190 },
          { naslov: "Status", sirina: 85 },
          { naslov: "Dodano", sirina: SIRINA - 445 },
        ],
        povp.map((x) => ({
          celice: [x.ime ?? "", x.opis ?? "", x.status ? STATUS_POVP[x.status] : "", formatShort(toIso(new Date(x.created_at)))],
        })),
      );
    }
  }

  return w.koncaj(`FINES d.o.o. | Production | Gemba walk T${isoWeek(p.teden)} ${letoTedna(p.teden)}`);
}

// ---------------------------------------------------------------------------
// Prenos

/** Ime datoteke samo z ASCII znaki (č -> c ...), da ga razume vsak e-mail odjemalec. */
const asciiIme = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/_$/, "");

const imeDatoteke = (p: GembaPorocilo) => asciiIme(`Gemba_T${isoWeek(p.teden)}_${letoTedna(p.teden)}_${p.polja.lokacija}`);

function prenesiDatoteko(blob: Blob, ime: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ime;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function prenesiPdf(p: GembaPorocilo) {
  prenesiDatoteko(await ustvariPdf(p), `${imeDatoteke(p)}.pdf`);
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
const URL_APLIKACIJE = (process.env.NEXT_PUBLIC_APP_URL || "https://finesproduction.vercel.app").replace(/\/$/, "");
const PISAVA = "16px";
const PISAVA_NASLOV = "21px";
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function teloEmaila(p: GembaPorocilo) {
  const pt = prihranek(p.akcijeTedna, p.nastavitve);
  const pari: [string, string][] = [
    ...osnovniPodatki(p).filter(([o]) => o !== "Status"),
    ["Nove akcije", String(p.akcijeTedna.length)],
    ["Odprte iz prejšnjih tednov", String(p.odprtePrej.length)],
    ...(pt.st > 0
      ? ([["Ocena prihranka", `${formatEur(pt.eurLeto)} / leto · ${formatH(pt.hLeto)} dela / leto`]] as [string, string][])
      : []),
  ];
  const td = "padding:3px 12px 3px 0;vertical-align:top";
  const tabela =
    `<table style="border-collapse:collapse;font-size:${PISAVA}">` +
    pari
      .filter(([, v]) => v)
      .map(([o, v]) => `<tr><td style="${td};color:#6b6b72">${esc(o)}</td><td style="${td};font-weight:bold">${esc(v)}</td></tr>`)
      .join("") +
    `</table>`;
  const akcije = p.akcijeTedna.length
    ? `<p style="margin:18px 0 6px;font-size:${PISAVA_NASLOV};font-weight:bold">Nove akcije</p><ul style="margin-top:0">` +
      p.akcijeTedna
        .map((a) => {
          const kdo = [a.odgovoren ? `<b>${esc(a.odgovoren)}</b>` : "", a.rok ? `rok <b>${esc(formatShort(a.rok))}</b>` : ""].filter(Boolean).join(", ");
          return (
            `<li style="margin-bottom:4px">${esc(a.problem)}${a.ukrep ? ` &rarr; ${esc(a.ukrep)}` : ""}` +
            `${kdo ? ` <span style="color:#45454b">(${kdo})</span>` : ""}</li>`
          );
        })
        .join("") +
      `</ul>` +
      `<p>Prosim, da odgovorni javite, ko akcijo zaključite, in na kratko opišete, kaj ste naredili.</p>`
    : "";
  const povezava = `${URL_APLIKACIJE}/proizvodnja/rutina/produktivnost/${p.teden}`;
  return (
    `<html><body style="font-family:Calibri,Arial,sans-serif;font-size:${PISAVA}">` +
    `<p>Pozdravljeni,</p><p>v priponki pošiljam zapisnik gemba walka (${isoWeek(p.teden)}. teden).</p>` +
    `<p>Zapisnik v aplikaciji: <a href="${esc(povezava)}">${esc(povezava)}</a></p>` +
    tabela +
    akcije +
    `</body></html>`
  );
}

export async function pripraviEmail(p: GembaPorocilo) {
  const pdf = new Uint8Array(await (await ustvariPdf(p)).arrayBuffer());
  const imePdf = `${imeDatoteke(p)}.pdf`;
  const tema = izgubaPoKodi(p.polja.tema);
  const zadeva = [
    `Gemba walk T${isoWeek(p.teden)}`,
    tema ? `Tedenska tema: ${tema.naziv}` : "",
    p.polja.lokacija,
    p.polja.datum ? formatShort(p.polja.datum) : obdobjeTedna(p.teden),
  ]
    .filter(Boolean)
    .join(" – ");
  const meja = `----=_GEMBA_${Date.now().toString(36)}`;
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
    vrstice76(base64(new TextEncoder().encode(teloEmaila(p)))),
    `--${meja}`,
    `Content-Type: application/pdf; name="${imePdf}"`,
    `Content-Disposition: attachment; filename="${imePdf}"`,
    "Content-Transfer-Encoding: base64",
    "",
    vrstice76(base64(pdf)),
    `--${meja}--`,
    "",
  ];
  prenesiDatoteko(new Blob([deli.join(CRLF)], { type: "message/rfc822" }), `E-mail_${imeDatoteke(p)}.eml`);
}
