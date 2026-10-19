// Poročilo audita (Management): PDF (ustvari se v brskalniku) in e-mail za Outlook (.eml s PDF priponko).
// Isti gradniki kot Gemba walk (porociloPdf.ts). Knjižnica se naloži šele ob kliku na gumb (dinamičen import).
import { formatShort, toIso, type IsoDate } from "./dates";
import { nazivOddelka, nazivTeme, oddelekPoKodi, type Sifranti } from "./auditSifranti";
import { VRSTA, pomenAkcije, zamuja, type AuditAkcija, type AuditPolja } from "./auditi";
import { formatEur, formatTrajanje, type AkcijaStatus, type GembaStatus, type PovpStatus, type Priloga } from "./produktivnost";
import {
  PISAVA,
  PISAVA_NASLOV,
  Pisec,
  ROB,
  SIRINA,
  SIVA,
  URL_APLIKACIJE,
  asciiIme,
  emailPari,
  esc,
  prenesiDatoteko,
  prenesiEmail,
  vgradiSliko,
  type Vrstica,
} from "./porociloPdf";

export type AuditPorocilo = {
  sifranti: Sifranti;
  id: number;
  status: GembaStatus | null;
  polja: AuditPolja;
  akcijeAudita: AuditAkcija[];
  odprtePrej: AuditAkcija[];
  priloge: Priloga[];
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

const naslovAudita = (p: AuditPorocilo) =>
  `Audit · ${nazivOddelka(p.sifranti, p.polja.oddelek)}${p.polja.datum ? ` · ${formatShort(p.polja.datum)}` : ""}`;

/** Osnovni podatki (PDF in telo e-maila). */
function osnovniPodatki(p: AuditPorocilo): [string, string][] {
  const o = p.polja.orodja;
  return [
    ["Datum", p.polja.datum ? formatShort(p.polja.datum) : ""],
    ["Oddelek", nazivOddelka(p.sifranti, p.polja.oddelek)],
    ["Vodja oddelka", oddelekPoKodi(p.sifranti, p.polja.oddelek)?.vodja ?? ""],
    ["Tema", nazivTeme(p.sifranti, p.polja.oddelek, p.polja.tema) || "Vse teme oddelka"],
    ["Področje", p.polja.lokacija],
    ["Izvajalec", p.polja.izvajalec],
    ["Udeleženci", p.polja.udelezenci],
    ["Čas začetka", o.zacetek_ura ?? ""],
    ["Trajanje", o.trajanje_s ? formatTrajanje(o.trajanje_s) : ""],
    ["Status", p.status === "ZAKLJUCEN" ? "Zaključen" : p.status ? "V delu" : "Ni začeto"],
  ];
}

const statusAkcije = (a: AuditAkcija, danes: IsoDate) =>
  a.vrsta === "DOBRA_PRAKSA" ? "Dobra praksa" : zamuja(a, danes) ? "Zamuja" : `${STATUS_AKCIJE[a.status]}${a.reseno_na_mestu ? " (na mestu)" : ""}`;

/** Ocena akcije v eni celici: pomen, prihranek, cena. */
function ocenaCelica(a: AuditAkcija) {
  const p = pomenAkcije(a);
  return [
    p !== null ? `Pomen ${p}/25` : null,
    a.prihranek_eur ? `${formatEur(a.prihranek_eur)}/leto` : null,
    a.strosek_eur ? `cena ${formatEur(a.strosek_eur)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function ustvariPdf(p: AuditPorocilo): Promise<Blob> {
  const w = await Pisec.ustvari(naslovAudita(p));
  const danes = toIso(new Date());
  const slike = p.priloge.filter((x) => x.tip === "SLIKA" && !x.akcija_id);
  const akcijeIdji = new Map([...p.akcijeAudita, ...p.odprtePrej].map((a) => [a.id, a]));
  const slikeAkcij = p.priloge.filter((x) => x.tip === "SLIKA" && x.akcija_id && akcijeIdji.has(x.akcija_id));
  const skice = p.priloge.filter((x) => x.tip === "SKICA");
  const povp = p.priloge.filter((x) => x.tip === "POVPRASEVANJE");
  const [vSlike, vSkice, vSlikeAkcij] = await Promise.all([
    Promise.all(slike.map(async (s) => ({ opis: s.opis ?? "", slika: await vgradiSliko(w.pdf, s) }))),
    Promise.all(skice.map(async (s) => ({ opis: s.opis ?? "", slika: await vgradiSliko(w.pdf, s, 1800) }))),
    Promise.all(
      slikeAkcij.map(async (s) => ({
        opis: `${s.faza === "PO" ? "PO" : "PRED"}: ${akcijeIdji.get(s.akcija_id!)?.problem ?? ""}`,
        slika: await vgradiSliko(w.pdf, s),
      })),
    ),
  ]);

  w.glava("Audit - zapisnik");
  w.tekst(naslovAudita(p), ROB, 18, w.krepka);
  w.y -= 22;
  w.tekst("Management - gemba walk vodstva", ROB, 10, w.navadna, SIVA);
  w.y -= 16;

  // 1. Osnovni podatki
  w.podnaslov("Osnovni podatki");
  w.pari(osnovniPodatki(p));

  // 2. Zapisnik + števci
  w.podnaslov("Zapisnik");
  if (p.polja.zapisnik.trim()) w.besedilo(p.polja.zapisnik.trim());
  else w.besedilo("Ni zapisa.", 10, SIVA);

  const stevci = p.polja.orodja.stevci;
  if (stevci.length) {
    w.oznaka("Števci", 50);
    w.tabela(
      [
        { naslov: "Dogodek", sirina: 220 },
        { naslov: "Število", sirina: 60, desno: true },
      ],
      stevci.map((s) => ({ celice: [s.naziv, `${s.stevilo}×`], poudari: [1] })),
    );
  }

  // 3. Ugotovitve in akcije
  w.podnaslov("Ugotovitve in akcije", 80);
  const vrsticeAkcij = (akcije: AuditAkcija[]): Vrstica[] =>
    akcije.map((a) => ({
      celice: [
        `${VRSTA[a.vrsta].kratko}${a.prioriteta ? ` · ${a.prioriteta}` : ""}`,
        [a.problem, nazivTeme(p.sifranti, a.oddelek, a.kategorija)].filter(Boolean).join("\n"),
        [a.ukrep, a.rezultat ? `Rezultat: ${a.rezultat}` : null].filter(Boolean).join("\n"),
        a.odgovoren ?? "",
        a.rok ? formatShort(a.rok) : "",
        statusAkcije(a, danes),
        ocenaCelica(a),
      ],
      poudari: [5],
    }));
  const vrstice: Vrstica[] = [];
  if (p.akcijeAudita.length) vrstice.push({ skupina: `Ugotovitve tega audita (${p.akcijeAudita.length})` }, ...vrsticeAkcij(p.akcijeAudita));
  if (p.odprtePrej.length) vrstice.push({ skupina: `Odprte iz prejšnjih auditov oddelka (${p.odprtePrej.length})` }, ...vrsticeAkcij(p.odprtePrej));
  if (vrstice.length) {
    w.tabela(
      [
        { naslov: "Vrsta", sirina: 58 },
        { naslov: "Ugotovitev", sirina: 118 },
        { naslov: "Ukrep / rezultat", sirina: 118 },
        { naslov: "Odgovoren", sirina: 56 },
        { naslov: "Rok", sirina: 46 },
        { naslov: "Status", sirina: 52 },
        { naslov: "Ocena", sirina: SIRINA - 448 },
      ],
      vrstice,
    );
  } else {
    w.besedilo("Ni akcij.", 10, SIVA);
  }

  // 4. Priloge
  if (vSlikeAkcij.length) {
    w.podnaslov(`Slike ugotovitev (${vSlikeAkcij.length})`, 220);
    w.mrezaSlik(vSlikeAkcij, 2);
  }
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

  return w.koncaj(`FINES d.o.o. | Production | ${naslovAudita(p)}`);
}

// ---------------------------------------------------------------------------
// Prenos

const imeDatoteke = (p: AuditPorocilo) =>
  asciiIme(`Audit_${nazivOddelka(p.sifranti, p.polja.oddelek)}_${p.polja.datum ?? ""}_${p.polja.lokacija}`);

export async function prenesiPdf(p: AuditPorocilo) {
  prenesiDatoteko(await ustvariPdf(p), `${imeDatoteke(p)}.pdf`);
}

function teloEmaila(p: AuditPorocilo) {
  const pari: [string, string][] = [
    ...osnovniPodatki(p).filter(([o]) => o !== "Status"),
    ["Ugotovitve", String(p.akcijeAudita.length)],
    ["Odprte iz prejšnjih auditov", String(p.odprtePrej.length)],
  ];
  const prave = p.akcijeAudita.filter((a) => a.vrsta !== "DOBRA_PRAKSA");
  const dobre = p.akcijeAudita.filter((a) => a.vrsta === "DOBRA_PRAKSA");
  const akcije = prave.length
    ? `<p style="margin:18px 0 6px;font-size:${PISAVA_NASLOV};font-weight:bold">Nove akcije</p><ul style="margin-top:0">` +
      prave
        .map((a) => {
          const kdo = [a.odgovoren ? `<b>${esc(a.odgovoren)}</b>` : "", a.rok ? `rok <b>${esc(formatShort(a.rok))}</b>` : ""].filter(Boolean).join(", ");
          return (
            `<li style="margin-bottom:4px">${a.prioriteta ? `<b>[${a.prioriteta}]</b> ` : ""}${esc(a.problem)}${a.ukrep ? ` &rarr; ${esc(a.ukrep)}` : ""}` +
            `${a.reseno_na_mestu ? " <i>(rešeno na mestu)</i>" : ""}` +
            `${kdo ? ` <span style="color:#45454b">(${kdo})</span>` : ""}</li>`
          );
        })
        .join("") +
      `</ul>` +
      `<p>Prosim, da odgovorni javite, ko akcijo zaključite, in na kratko opišete, kaj ste naredili.</p>`
    : "";
  const pohvale = dobre.length
    ? `<p style="margin:18px 0 6px;font-size:${PISAVA_NASLOV};font-weight:bold">Dobra praksa - pohvala</p><ul style="margin-top:0">` +
      dobre.map((a) => `<li style="margin-bottom:4px">${esc(a.problem)}</li>`).join("") +
      `</ul>`
    : "";
  const povezava = `${URL_APLIKACIJE}/management/auditi/${p.id}`;
  return (
    `<html><body style="font-family:Calibri,Arial,sans-serif;font-size:${PISAVA}">` +
    `<p>Pozdravljeni,</p><p>v priponki pošiljam zapisnik audita (${esc(nazivOddelka(p.sifranti, p.polja.oddelek))}).</p>` +
    `<p>Zapisnik v aplikaciji: <a href="${esc(povezava)}">${esc(povezava)}</a></p>` +
    emailPari(pari) +
    akcije +
    pohvale +
    `</body></html>`
  );
}

export async function pripraviEmail(p: AuditPorocilo) {
  const tema = nazivTeme(p.sifranti, p.polja.oddelek, p.polja.tema);
  const zadeva = [
    `Audit ${nazivOddelka(p.sifranti, p.polja.oddelek)}`,
    tema ? `Tema: ${tema}` : "",
    p.polja.lokacija,
    p.polja.datum ? formatShort(p.polja.datum) : "",
  ]
    .filter(Boolean)
    .join(" – ");
  await prenesiEmail(zadeva, teloEmaila(p), await ustvariPdf(p), `${imeDatoteke(p)}.pdf`, `E-mail_${imeDatoteke(p)}.eml`);
}
