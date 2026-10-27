// Orodja -> Pakiranje: odpreme VD300 kot navodila za pakiranje (checklista + list z lokacijo)
// in povzetek za skladišče (kaj nabrati in poslati v montažo).
import { formatShort, type IsoDate } from "./dates";
import type { Material } from "./material";
import type { Odprema } from "./prioritete";
import { formatNum } from "./stevila";
import { fetchAll, getSupabase } from "./supabase";

// =====================================================================
// KATEGORIJE POSTAVK
// =====================================================================

export type Kategorija =
  | "pec"
  | "vzhajalnik"
  | "napa"
  | "podstavek"
  | "vozicek"
  | "pladenj"
  | "mehcalec"
  | "komplet"
  | "ostalo"
  | "storitev";

/** Vrstni red = vrstni red v povzetku za skladišče. */
export const KATEGORIJE: { koda: Kategorija; label: string; mnozina: string }[] = [
  { koda: "pec", label: "Peč", mnozina: "Peči" },
  { koda: "vzhajalnik", label: "Vzhajalnik", mnozina: "Vzhajalniki" },
  { koda: "napa", label: "Napa", mnozina: "Nape" },
  { koda: "podstavek", label: "Podstavek", mnozina: "Podstavki" },
  { koda: "vozicek", label: "Voziček", mnozina: "Vozički" },
  { koda: "pladenj", label: "Pladenj", mnozina: "Pladnji" },
  { koda: "mehcalec", label: "Mehčalec", mnozina: "Mehčalci" },
  { koda: "komplet", label: "Povezovalni komplet", mnozina: "Povezovalni kompleti" },
  { koda: "ostalo", label: "Ostalo", mnozina: "Ostalo" },
  { koda: "storitev", label: "Storitev", mnozina: "Storitve" },
];
export const IME_KATEGORIJE = Object.fromEntries(KATEGORIJE.map((k) => [k.koda, k])) as Record<
  Kategorija,
  (typeof KATEGORIJE)[number]
>;

/** Kategorija po identu in nazivu (storitve - montaža, prevoz - se ne pakirajo). */
export function kategorijaPostavke(ident: string, opis: string | null): Kategorija {
  const o = (opis ?? "").toLowerCase();
  if (/^SE-/i.test(ident) || /storitev|montaža|prevoz|demontaž|zagon|šolanje/.test(o)) return "storitev";
  if (o.includes("komplet povezovalni") || o.includes("povezovalni komplet")) return "komplet";
  if (o.includes("napa")) return "napa";
  if (o.includes("podstavek")) return "podstavek";
  if (o.includes("voziček")) return "vozicek";
  if (o.includes("pladenj") || o.includes("pladnj")) return "pladenj";
  if (o.includes("mehčalec") || o.includes("mehcalec")) return "mehcalec";
  if (o.includes("vzhajalnik")) return "vzhajalnik";
  if (o.includes("peč") || /\bpec\b/.test(o)) return "pec";
  return "ostalo";
}

// =====================================================================
// ODPREME ZA PAKIRANJE
// =====================================================================

export type PostavkaPak = {
  kljuc: string;
  zap: number | null;
  ident: string;
  opis: string | null;
  kolicina: number;
  em: string;
  oddelek: string | null;
  kategorija: Kategorija;
  /** Dobavnica v VD300 - skladišče je postavko že izdalo. */
  izdano: boolean;
  dokument: string | null;
  /** Zaloga matično (izpis materiala, sicer VD300); null = ni podatka. */
  zaloga: number | null;
  /** Koliko pokrije zaloga (FIFO po datumu odpreme); null = ni podatka o zalogi. */
  pokrito: number | null;
};

export type OdpremaPak = {
  stevilka: string;
  partner: string | null;
  lokacija: string | null;
  drzava: string | null;
  datum: IsoDate | null;
  status: string | null;
  narocilo: string | null;
  kupcevo_narocilo: string | null;
  opombe: string[];
  postavke: PostavkaPak[];
  /** Število peči = število palet (vsaka peč s pripadajočimi artikli na svojo paleto). */
  peci: number;
  /** Postavke za pakiranje (brez storitev). */
  stPostavk: number;
  /** Postavke, ki jih zaloga ne pokrije v celoti (brez izdanih in storitev). */
  manjka: number;
  /** Postavke brez podatka o zalogi. */
  neznano: number;
  /** Vse postavke za pakiranje imajo dobavnico. */
  vseIzdano: boolean;
};

/** Zaključene in stornirane odpreme / naročila se ne pakirajo. */
export const jeOdprtaOdprema = (o: Odprema) =>
  !/zaklju|storn/i.test(o.status ?? "") && !/zaklju|storn|ni več aktualno|realizirano/i.test(o.narocilo_status ?? "");

/** Lokacija dostave iz stolpca "Lokacija" v VD300 (null = ni vpisana; kupec ni lokacija). */
export const imeLokacije = (o: Pick<OdpremaPak, "lokacija">) => o.lokacija?.replace(/\s+/g, " ").trim() || null;

/** Kupec + lokacija za sezname (TXT). */
const kupecLokacija = (d: OdpremaPak) => [d.partner?.trim(), imeLokacije(d)].filter(Boolean).join(" / ") || d.stevilka;

/**
 * Odprte odpreme VD300 po dokumentih. Zaloga matičnega skladišča (izpis materiala, sicer stolpec VD300)
 * se razdeli FIFO po datumu odpreme med postavke, ki še nimajo dobavnice.
 */
export function odpremeZaPakiranje(odpreme: Odprema[], material: Map<string, Material>): OdpremaPak[] {
  const odprte = odpreme.filter(jeOdprtaOdprema);

  const zalogaVd300 = new Map<string, number>();
  for (const o of odprte) if (o.zaloga !== null && !zalogaVd300.has(o.ident)) zalogaVd300.set(o.ident, o.zaloga);
  const zalogaIdenta = (ident: string) => material.get(ident)?.zaloga ?? zalogaVd300.get(ident) ?? null;

  const poDokumentih = new Map<string, Odprema[]>();
  for (const o of odprte) poDokumentih.set(o.stevilka, [...(poDokumentih.get(o.stevilka) ?? []), o]);

  const dokumenti: OdpremaPak[] = [...poDokumentih.entries()].map(([stevilka, vrstice]) => {
    const prva = vrstice[0];
    const opombe = [...new Set(vrstice.flatMap((v) => [v.opis_dokumenta, v.interne_opombe, v.zaznamek]).filter((x): x is string => !!x))];
    const postavke = [...vrstice]
      .sort((a, b) => (a.zap ?? 0) - (b.zap ?? 0))
      .map((v, i): PostavkaPak => ({
        kljuc: `${stevilka}/${v.zap ?? ""}/${v.ident}/${i}`,
        zap: v.zap,
        ident: v.ident,
        opis: v.opis,
        kolicina: v.kolicina,
        em: v.em ?? "KOS",
        oddelek: v.oddelek,
        kategorija: kategorijaPostavke(v.ident, v.opis),
        izdano: !!v.dokument,
        dokument: v.dokument,
        zaloga: zalogaIdenta(v.ident),
        pokrito: null,
      }));
    return {
      stevilka,
      partner: prva.partner,
      lokacija: vrstice.find((v) => v.lokacija)?.lokacija ?? null,
      drzava: prva.drzava,
      datum: prva.datum_odpreme,
      status: prva.status,
      narocilo: prva.narocilo,
      kupcevo_narocilo: prva.kupcevo_narocilo,
      opombe,
      postavke,
      peci: 0,
      stPostavk: 0,
      manjka: 0,
      neznano: 0,
      vseIzdano: false,
    };
  });

  dokumenti.sort(
    (a, b) => (a.datum ?? "9999").localeCompare(b.datum ?? "9999") || a.stevilka.localeCompare(b.stevilka, "sl", { numeric: true }),
  );

  // FIFO: najzgodnejša odprema dobi zalogo prva
  const ostanek = new Map<string, number>();
  for (const d of dokumenti) {
    for (const p of d.postavke) {
      if (p.izdano || p.kategorija === "storitev" || p.zaloga === null) continue;
      const na = ostanek.get(p.ident) ?? Math.max(0, p.zaloga);
      p.pokrito = Math.min(p.kolicina, na);
      ostanek.set(p.ident, na - p.pokrito);
    }
    const zaPakiranje = d.postavke.filter((p) => p.kategorija !== "storitev");
    d.peci = zaPakiranje.filter((p) => p.kategorija === "pec").reduce((s, p) => s + p.kolicina, 0);
    d.stPostavk = zaPakiranje.length;
    d.manjka = zaPakiranje.filter((p) => !p.izdano && p.pokrito !== null && p.pokrito < p.kolicina).length;
    d.neznano = zaPakiranje.filter((p) => !p.izdano && p.pokrito === null).length;
    d.vseIzdano = zaPakiranje.length > 0 && zaPakiranje.every((p) => p.izdano);
  }
  return dokumenti;
}

/** Postavke po skupinah dokumenta (stolpec "Oddelek"), v vrstnem redu prve pojavitve. */
export function skupinePostavk(postavke: PostavkaPak[]): { naslov: string | null; postavke: PostavkaPak[] }[] {
  const m = new Map<string, PostavkaPak[]>();
  for (const p of postavke) m.set(p.oddelek ?? "", [...(m.get(p.oddelek ?? "") ?? []), p]);
  return [...m.entries()].map(([k, xs]) => ({ naslov: k || null, postavke: xs }));
}

// =====================================================================
// POVZETEK ZA SKLADIŠČE (TXT)
// =====================================================================

export type NastavitveSkladisca = {
  kategorije: Kategorija[];
  /** Samo kar je na zalogi (kar zaloga ne pokrije, je v ločenem razdelku). */
  samoNaZalogi: boolean;
  /** Izpusti postavke, ki že imajo dobavnico. */
  brezIzdanih: boolean;
  prikaz: "skupaj" | "po_odpremah";
};

export const PRIVZETO_SKLADISCE: NastavitveSkladisca = {
  kategorije: KATEGORIJE.filter((k) => k.koda !== "storitev").map((k) => k.koda),
  samoNaZalogi: true,
  brezIzdanih: true,
  prikaz: "skupaj",
};

type Vrsta = { ident: string; opis: string | null; em: string; kolicina: number; kategorija: Kategorija; zaloga: number | null };

const kol = (n: number, em: string) => `${formatNum(n)} ${em.toLowerCase()}`.padStart(8);
const datumTxt = (iso: IsoDate | null) => (iso ? formatShort(iso) : "brez datuma");

/** Seštej enake idente (po kategorijah, znotraj po identu). */
function sestej(vrste: Vrsta[]): Vrsta[] {
  const m = new Map<string, Vrsta>();
  for (const v of vrste) {
    const prej = m.get(v.ident);
    m.set(v.ident, prej ? { ...prej, kolicina: prej.kolicina + v.kolicina } : { ...v });
  }
  const red = new Map(KATEGORIJE.map((k, i) => [k.koda, i]));
  return [...m.values()].sort((a, b) => red.get(a.kategorija)! - red.get(b.kategorija)! || a.ident.localeCompare(b.ident, "sl", { numeric: true }));
}

function vrsticeKategorij(vrste: Vrsta[], zZalogo: boolean): string[] {
  const out: string[] = [];
  let kat: Kategorija | null = null;
  for (const v of sestej(vrste)) {
    if (v.kategorija !== kat) {
      kat = v.kategorija;
      out.push(`  ${IME_KATEGORIJE[kat].mnozina.toUpperCase()}`);
    }
    const z = zZalogo ? `  (zaloga ${v.zaloga === null ? "?" : formatNum(v.zaloga)})` : "";
    out.push(`  [ ] ${kol(v.kolicina, v.em)}  ${v.ident.padEnd(14)} ${v.opis ?? ""}${z}`);
  }
  return out;
}

/** Razdeli postavke na del, ki ga pokrije zaloga, in del, ki manjka. */
function razdeli(d: OdpremaPak, n: NastavitveSkladisca) {
  const naZalogi: Vrsta[] = [];
  const manjka: Vrsta[] = [];
  for (const p of d.postavke) {
    if (!n.kategorije.includes(p.kategorija) || (n.brezIzdanih && p.izdano)) continue;
    const osnova = { ident: p.ident, opis: p.opis, em: p.em, kategorija: p.kategorija, zaloga: p.zaloga };
    if (!n.samoNaZalogi || p.izdano) {
      naZalogi.push({ ...osnova, kolicina: p.kolicina });
      continue;
    }
    const pokrito = p.pokrito ?? 0;
    if (pokrito > 0) naZalogi.push({ ...osnova, kolicina: pokrito });
    if (p.kolicina - pokrito > 0) manjka.push({ ...osnova, kolicina: p.kolicina - pokrito });
  }
  return { naZalogi, manjka };
}

/** Sporočilo za skladišče: kaj nabrati za izbrane odpreme in poslati v montažo. */
export function skladisceTxt(odpreme: OdpremaPak[], n: NastavitveSkladisca, danes: IsoDate): string {
  const vrstice: string[] = [
    "NABIRANJE MATERIALA ZA ODPREME - POŠLJI V MONTAŽO",
    `Datum: ${formatShort(danes)} · odprem: ${odpreme.length} · peči: ${formatNum(odpreme.reduce((s, d) => s + d.peci, 0))}`,
    `Vključeno: ${n.kategorije.map((k) => IME_KATEGORIJE[k].mnozina).join(", ") || "nič"}`,
    "",
    "ODPREME:",
    ...odpreme.map((d) => `  ${d.stevilka}  ${datumTxt(d.datum)}  ${kupecLokacija(d)}${d.peci ? `  (${formatNum(d.peci)} ${d.peci === 1 ? "peč" : "peči"})` : ""}`),
    "",
  ];
  const deli = odpreme.map((d) => ({ d, ...razdeli(d, n) }));

  if (n.prikaz === "skupaj") {
    const naZalogi = deli.flatMap((x) => x.naZalogi);
    vrstice.push(n.samoNaZalogi ? "NABERI (na zalogi):" : "NABERI:");
    vrstice.push(...(naZalogi.length ? vrsticeKategorij(naZalogi, false) : ["  Ni postavk za nabiranje."]));
    const manjka = deli.flatMap((x) => x.manjka);
    if (manjka.length) {
      vrstice.push("", "NI (DOVOLJ) NA ZALOGI - ne nabiraj, javi vodji:");
      vrstice.push(...vrsticeKategorij(manjka, true));
    }
  } else {
    for (const { d, naZalogi, manjka } of deli) {
      if (!naZalogi.length && !manjka.length) continue;
      vrstice.push(`=== ${d.stevilka} · ${kupecLokacija(d)} · odprema ${datumTxt(d.datum)} ===`);
      vrstice.push(...(naZalogi.length ? vrsticeKategorij(naZalogi, false) : ["  Ni postavk na zalogi."]));
      if (manjka.length) {
        vrstice.push("  ! ni (dovolj) na zalogi:");
        vrstice.push(...vrsticeKategorij(manjka, true));
      }
      vrstice.push("");
    }
  }
  return vrstice.join("\n").trimEnd() + "\n";
}

// =====================================================================
// BARVE LISTOV Z LOKACIJO
// =====================================================================

export type BarvaLista = { koda: string; label: string; hex: string };

/** Fluorescentne barve ozadja lokacije (tiskalnik jih natisne kot čim bolj žive). */
export const BARVE_LISTOV: BarvaLista[] = [
  { koda: "bela", label: "Bela", hex: "#FFFFFF" },
  { koda: "rumena", label: "Fluo rumena", hex: "#FFF200" },
  { koda: "zelena", label: "Fluo zelena", hex: "#5CFF3A" },
  { koda: "modra", label: "Svetleča modra", hex: "#2EE6FF" },
  { koda: "roza", label: "Fluo roza", hex: "#FF4FD8" },
  { koda: "oranzna", label: "Fluo oranžna", hex: "#FF9A1F" },
  ];

export type ListiLokacije = "odprema" | "pec" | "brez";

export type NastavitvePdf = {
  /** Barve, ki so na voljo za izbiro pri vsaki odpremi. */
  barve: string[];
  listi: ListiLokacije;
};

export const NASTAVITVE_PAKIRANJA = "fp-pakiranje-nastavitve-v3";
export const PRIVZETO_PDF: NastavitvePdf = { barve: ["bela", "rumena"], listi: "odprema" };

export const barvaPoKodi = (koda: string | undefined) => BARVE_LISTOV.find((b) => b.koda === koda) ?? BARVE_LISTOV.find((b) => b.koda === "bela")!;

/** Število listov z lokacijo za odpremo (1 na paleto = 1 na peč; brez peči 1 list). */
export const steviloListov = (d: OdpremaPak, listi: ListiLokacije) => (listi === "brez" ? 0 : listi === "pec" ? paleteOdpreme(d).length : 1);

// =====================================================================
// PALETE (1 peč na paleto)
// =====================================================================

export type PostavkaPalete = { p: PostavkaPak; kolicina: number };
export type Paleta = { pec: PostavkaPak | null; postavke: PostavkaPalete[] };

/**
 * Razdelitev odpreme na palete: vsaka peč je na svoji paleti.
 * Postavke skupine (komplet) s pečmi se razdelijo med palete te skupine,
 * ostale postavke (vozički, pladnji ...) med vse palete - enakomerno, ostanek na prve palete.
 * Brez peči ali z eno pečjo je vse na eni paleti.
 */
export function paleteOdpreme(d: OdpremaPak): Paleta[] {
  const za = d.postavke.filter((p) => p.kategorija !== "storitev");
  const peci = za.filter((p) => p.kategorija === "pec" && Number.isInteger(p.kolicina) && p.kolicina > 0);
  const n = peci.reduce((s, p) => s + p.kolicina, 0);
  if (n <= 1) return [{ pec: peci[0] ?? null, postavke: za.map((p) => ({ p, kolicina: p.kolicina })) }];

  const palete = peci.flatMap((p) => Array.from({ length: p.kolicina }, () => ({ pec: p, postavke: [{ p, kolicina: 1 }] as PostavkaPalete[] })));
  const skupineSPecmi = new Set(peci.map((p) => p.oddelek).filter((x): x is string => !!x));
  for (const p of za) {
    if (peci.includes(p)) continue;
    const cilj = p.oddelek && skupineSPecmi.has(p.oddelek) ? palete.filter((x) => x.pec?.oddelek === p.oddelek) : palete;
    if (!Number.isInteger(p.kolicina)) {
      cilj[0].postavke.push({ p, kolicina: p.kolicina });
      continue;
    }
    const osnova = Math.floor(p.kolicina / cilj.length);
    const ostanek = p.kolicina % cilj.length;
    cilj.forEach((x, i) => {
      const k = osnova + (i < ostanek ? 1 : 0);
      if (k > 0) x.postavke.push({ p, kolicina: k });
    });
  }
  // Na paleti: peč prva, nato po vrstnem redu dokumenta
  const red = new Map(za.map((p, i) => [p, i]));
  for (const x of palete) x.postavke.sort((a, b) => (a.p === x.pec ? -1 : b.p === x.pec ? 1 : red.get(a.p)! - red.get(b.p)!));
  return palete;
}

// =====================================================================
// PRINTANO (SQL 022)
// =====================================================================

export type Printano = { stevilka: string; barva: string; prvic_at: string; zadnjic_at: string; uporabnik: string | null };

/** Natisnjene odpreme po številki. */
export async function naloziPrintano(): Promise<Map<string, Printano>> {
  const sb = getSupabase();
  const vrstice = await fetchAll<Printano>((from, to) =>
    sb.from("fp_pak_printano").select("stevilka, barva, prvic_at, zadnjic_at, uporabnik").eq("visible", true).order("id").range(from, to),
  );
  return new Map(vrstice.map((v) => [v.stevilka, v]));
}

/** Zapiše tisk PDF: barva lista in čas (prvi tisk ostane v prvic_at). */
export async function shraniPrintano(odpreme: { stevilka: string; barva: string }[], prej: Map<string, Printano>) {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const zdaj = new Date().toISOString();
  const vrstice = odpreme.map((o) => ({
    stevilka: o.stevilka,
    barva: o.barva,
    prvic_at: prej.get(o.stevilka)?.prvic_at ?? zdaj,
    zadnjic_at: zdaj,
    uporabnik: data.session?.user.email ?? null,
  }));
  const { error } = await sb.from("fp_pak_printano").upsert(vrstice, { onConflict: "stevilka" });
  if (error) throw new Error(error.message);
  return vrstice;
}
