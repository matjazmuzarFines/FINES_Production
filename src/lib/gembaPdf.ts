// Poročilo gemba walka: PDF (ustvari se v brskalniku) in e-mail za Outlook (.eml s PDF priponko).
// Enak način kot v projektu Rabljena oprema: pdf-lib + pisava DejaVu Sans (č, š, ž).
// Knjižnica se naloži šele ob kliku na gumb (dinamičen import).
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
import { ROB, SIRINA, SIVA, Pisec, URL_APLIKACIJE, PISAVA, PISAVA_NASLOV, asciiIme, emailPari, esc, prenesiDatoteko, prenesiEmail, vgradiSliko, type Vrstica } from "./porociloPdf";
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

const imeDatoteke = (p: GembaPorocilo) => asciiIme(`Gemba_T${isoWeek(p.teden)}_${letoTedna(p.teden)}_${p.polja.lokacija}`);

export async function prenesiPdf(p: GembaPorocilo) {
  prenesiDatoteko(await ustvariPdf(p), `${imeDatoteke(p)}.pdf`);
}

// ---------------------------------------------------------------------------
// E-mail za Outlook: .eml z oznako X-Unsent - Outlook ga odpre kot novo (neposlano) sporočilo s PDF priponko.

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
  const tabela = emailPari(pari);
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
  await prenesiEmail(zadeva, teloEmaila(p), await ustvariPdf(p), imePdf, `E-mail_${imeDatoteke(p)}.eml`);
}
