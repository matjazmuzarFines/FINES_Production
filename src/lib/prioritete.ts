import * as XLSX from "xlsx";
import { addDays, isoWeek, mondayOf, parseAnyDate, toIso, type IsoDate } from "./dates";
import { prenesiDatoteko } from "./normativi";
import { parseNum } from "./stevila";
import { fetchAll, getSupabase, kosi } from "./supabase";
import type { Nalog } from "./zasedenost";

// =====================================================================
// TIPI
// =====================================================================

/** Postavka naročila iz izvoza VD200. Zaloga / DN so podatki artikla (enaki v vseh vrsticah istega identa). */
export type Postavka = {
  kljuc: string;
  stevilka: string;
  zap: number | null;
  status: string | null;
  partner: string | null;
  lokacija: string | null;
  drzava: string | null;
  kupcevo_narocilo: string | null;
  datum_odpreme: IsoDate | null;
  ident: string;
  opis: string | null;
  komplet: string | null;
  kolicina: number;
  em: string | null;
  zaloga: number;
  zaloga_ostalo: number;
  planirano_dn: number;
  prosta_zaloga: number;
  prosta_brez_narocil: number;
  sestavil: string | null;
  zaznamek: string | null;
};

export type PriUvoz = { id: number; datoteka: string; st_postavk: number; created_at: string };
export type Opomba = { kljuc: string; opomba: string | null; pregledano: boolean };

/**
 * Status postavke (od najslabšega):
 * MANJKA      - zaloga + delovni nalogi ne pokrijejo količine (ali je prosta zaloga v ERP negativna)
 * ZAMUJA      - pokrito z nalogom, ki ima rok izdelave po datumu odpreme
 * PREGLEJ     - pokrito s planirano količino DN brez znanega naloga, s predvidenim nalogom ali brez datuma
 * V_DELU      - pokrito z nalogom, ki bo končan pravočasno
 * NA_ZALOGI   - v celoti pokrito z zalogo matičnega skladišča
 */
export type Status = "MANJKA" | "ZAMUJA" | "PREGLEJ" | "V_DELU" | "NA_ZALOGI";

export const STATUSI: {
  koda: Status;
  label: string;
  opis: string;
  badge: string;
  pika: string;
  aktivna: string;
  ikona: string;
}[] = [
  {
    koda: "MANJKA",
    label: "Manjka",
    opis: "Ni dovolj zaloge in nalogov - potreben nov nalog",
    badge: "bg-nok-500 text-white",
    pika: "bg-nok-500",
    aktivna: "border-nok-500 bg-nok-50",
    ikona: "text-nok-500",
  },
  {
    koda: "ZAMUJA",
    label: "Nalog zamuja",
    opis: "Nalog je planiran po datumu odpreme",
    badge: "bg-fines-500 text-white",
    pika: "bg-fines-500",
    aktivna: "border-fines-500 bg-fines-50",
    ikona: "text-fines-500",
  },
  {
    koda: "PREGLEJ",
    label: "Nedorečeno",
    opis: "DN brez naloga, predviden nalog ali brez datuma",
    badge: "bg-warn-400 text-ink-900",
    pika: "bg-warn-400",
    aktivna: "border-warn-500 bg-warn-50",
    ikona: "text-warn-500",
  },
  {
    koda: "V_DELU",
    label: "V proizvodnji",
    opis: "Pokrito z nalogom, ki bo pravočasno končan",
    badge: "bg-sync-500 text-white",
    pika: "bg-sync-500",
    aktivna: "border-sync-500 bg-sync-50",
    ikona: "text-sync-500",
  },
  {
    koda: "NA_ZALOGI",
    label: "Na zalogi",
    opis: "V celoti pokrito z zalogo matičnega skladišča",
    badge: "bg-ok-500 text-white",
    pika: "bg-ok-500",
    aktivna: "border-ok-500 bg-ok-50",
    ikona: "text-ok-500",
  },
];
export const STATUS = Object.fromEntries(STATUSI.map((s) => [s.koda, s])) as Record<Status, (typeof STATUSI)[number]>;
const RANG: Record<Status, number> = { MANJKA: 0, ZAMUJA: 1, PREGLEJ: 2, V_DELU: 3, NA_ZALOGI: 4 };

/** Del količine postavke in od kod pride. */
export type Del =
  | { vir: "zaloga"; kolicina: number }
  | { vir: "nalog"; kolicina: number; nalog: string; krovni: string | null; rok: IsoDate | null; predviden: boolean; drugKupec: string | null }
  | { vir: "dn"; kolicina: number } // planirana količina DN, za katero ni naloga v uvozu nalogov
  | { vir: "manjka"; kolicina: number; erp: boolean }; // erp = manjka zaradi negativne proste zaloge v ERP

export type PostavkaIzracun = Postavka & {
  status: Status;
  deli: Del[];
  /** Do kdaj mora biti kos iz proizvodnje (datum odpreme - zamik), če ni vse z zaloge. */
  potrebnoDo: IsoDate | null;
  zapadlo: boolean; // datum odpreme je pred danes
  vOdpremi: boolean;
  nepotrjeno: boolean; // predvideno / definirano naročilo (ne šteje v potrebe, razen če je vklopljeno)
  teden: IsoDate | null; // ponedeljek tedna odpreme
  grupa: string;
};

export type NalogDodelitev = { kljuc: string; stevilka: string; partner: string | null; datum: IsoDate | null; kolicina: number };

export type NalogPrioriteta = {
  st_naloga: string;
  krovni_dn: string | null;
  ident: string;
  opis: string | null;
  narocnik: string | null;
  status_naloga: string | null;
  rok: IsoDate | null;
  preostala: number; // upoštevana odprta količina (po uskladitvi s planirano količino DN)
  dodelitve: NalogDodelitev[];
  prodano: number;
  prosto: number;
  prvaPotreba: IsoDate | null; // najzgodnejši datum odpreme, ki čaka na ta nalog
  zamuja: boolean;
  predviden: boolean;
  predlog: string;
};

export type ArtikelPregled = {
  ident: string;
  opis: string | null;
  grupa: string;
  zaloga: number;
  zaloga_ostalo: number;
  planirano_dn: number;
  prosta_zaloga: number;
  naroceno: number;
  izZaloge: number;
  izProizvodnje: number;
  manjka: number;
  rezerviranoDrugje: number; // del, ki ga ERP rezervira izven postavk tega izvoza
  zalogaDo: IsoDate | null; // zadnji datum odpreme, ki ga še v celoti pokrije zaloga
  naslednjaIzProizvodnje: IsoDate | null; // kdaj potrebujem prvi kos iz proizvodnje
  nalogi: NalogPrioriteta[];
  status: Status;
};

export type Nastavitve = {
  danes: IsoDate;
  /** Koliko dni pred odpremo mora biti nalog končan (pakiranje, test ...). */
  zamikDni: number;
  /** Predvidena / definirana naročila štejejo v potrebe. */
  vkljuciNepotrjena: boolean;
  /** Samo izdelki 100-, 099-, 110- (kot v Excelu). */
  samoIzdelki: boolean;
};

export type Rezultat = {
  postavke: PostavkaIzracun[];
  artikli: ArtikelPregled[];
  nalogi: NalogPrioriteta[];
};

// =====================================================================
// GRUPE (enako kot "Grupa polizdelkov" v Power Query)
// =====================================================================

export function grupaIzOpisa(opis: string | null): string {
  const o = (opis ?? "").toLowerCase();
  if (o.includes("komplet povezovalni")) return "Kitkomplet";
  if (o.includes("napa")) return "Napa";
  if (o.includes("fbm")) return "OC-A";
  if (o.includes("peč konvekcijska")) return "OC-B";
  if (o.includes("peč etažna")) return "OD-C";
  if (o.includes("vzhajalnik")) return "HTBP";
  if (o.includes("peč pica")) return "OD-P";
  if (o.includes("podstavek")) return "RN-CU";
  if (o.includes("vitrina")) return "SCH";
  if (o.includes("voziček")) return "Voziček";
  return "Ostalo";
}

const IZDELEK_RE = /^(100|099|110)-/;
export const jeIzdelek = (ident: string) => IZDELEK_RE.test(ident);

const jePotrjeno = (s: string | null) => (s ?? "").toLowerCase().includes("potrjeno");
const jeVOdpremi = (s: string | null) => (s ?? "").toLowerCase().includes("odprem");

// =====================================================================
// UVOZ XLSX
// =====================================================================

/** Stolpci izvoza VD200 -> polja. Primerjava brez velikih črk in odvečnih presledkov. */
const STOLPCI: Record<string, keyof Postavka> = {
  številka: "stevilka",
  zap: "zap",
  status: "status",
  "naziv partnerja": "partner",
  lokacija: "lokacija",
  država: "drzava",
  "kupčevo naročilo - številka": "kupcevo_narocilo",
  "datum odpreme": "datum_odpreme",
  ident: "ident",
  "kratki opis": "opis",
  komplet: "komplet",
  količina: "kolicina",
  em: "em",
  "zaloga (matično skladišče)": "zaloga",
  "zaloga (ostalo)": "zaloga_ostalo",
  "planirana količina (dn)": "planirano_dn",
  "prosta zaloga": "prosta_zaloga",
  "prosta zaloga (brez naročil)": "prosta_brez_narocil",
  sestavil: "sestavil",
  "zaznamek / komentar": "zaznamek",
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const txt = (x: unknown) => (x === null || x === undefined || String(x).trim() === "" ? null : String(x).trim());

/** Datum odpreme: "30.10.2026", Date, Excelova številka ali ddMMyyyy (npr. 7102026 = 7. 10. 2026). */
function parseDatumOdpreme(v: unknown): IsoDate | null {
  if (typeof v === "number" && v >= 1010000 && v <= 31129999) {
    const t = String(Math.round(v)).padStart(8, "0");
    const iso = `${t.slice(4)}-${t.slice(2, 4)}-${t.slice(0, 2)}`;
    return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(iso) ? iso : null;
  }
  return parseAnyDate(v);
}

export type PriUvozPregled = { postavke: Postavka[]; opozorila: string[] };

export async function preberiVd200Xlsx(file: File): Promise<PriUvozPregled> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  // Glava je v 3. vrstici (nad njo sta naslov in skupini GLAVA / POSTAVKE DOKUMENTA)
  const glavaIdx = rows.slice(0, 15).findIndex((r) => r.some((c) => norm(c) === "ident") && r.some((c) => norm(c) === "številka"));
  if (glavaIdx < 0) throw new Error('V datoteki ni stolpcev "Številka" in "IDENT". Ali je to izvoz izvozvd200?');
  const glava = rows[glavaIdx].map(norm);
  const indeksi = Object.entries(STOLPCI)
    .map(([ime, polje]) => [glava.indexOf(ime), polje] as const)
    .filter(([i]) => i >= 0);
  for (const obvezen of ["datum odpreme", "količina", "zaloga (matično skladišče)", "planirana količina (dn)"]) {
    if (!glava.includes(obvezen)) throw new Error(`V datoteki manjka stolpec "${obvezen}".`);
  }

  const opozorila: string[] = [];
  const videni = new Set<string>();
  const postavke: Postavka[] = [];

  for (const r of rows.slice(glavaIdx + 1)) {
    const v: Partial<Record<keyof Postavka, unknown>> = {};
    for (const [i, polje] of indeksi) v[polje] = r[i];
    const stevilka = txt(v.stevilka);
    const ident = txt(v.ident);
    if (!stevilka || !ident) continue;
    const zap = parseNum(v.zap);
    let kljuc = `${stevilka}/${zap ?? ""}/${ident}`;
    if (videni.has(kljuc)) {
      let i = 2;
      while (videni.has(`${kljuc}#${i}`)) i++;
      kljuc = `${kljuc}#${i}`;
    }
    videni.add(kljuc);
    const status = txt(v.status);
    const datum = parseDatumOdpreme(v.datum_odpreme);
    if (!datum && jePotrjeno(status) && jeIzdelek(ident)) opozorila.push(`Naročilo ${stevilka}: ${ident} nima datuma odpreme.`);
    postavke.push({
      kljuc,
      stevilka,
      zap,
      status,
      partner: txt(v.partner),
      lokacija: txt(v.lokacija),
      drzava: txt(v.drzava),
      kupcevo_narocilo: txt(v.kupcevo_narocilo),
      datum_odpreme: datum,
      ident,
      opis: txt(v.opis),
      komplet: txt(v.komplet),
      kolicina: parseNum(v.kolicina) ?? 0,
      em: txt(v.em),
      zaloga: parseNum(v.zaloga) ?? 0,
      zaloga_ostalo: parseNum(v.zaloga_ostalo) ?? 0,
      planirano_dn: parseNum(v.planirano_dn) ?? 0,
      prosta_zaloga: parseNum(v.prosta_zaloga) ?? 0,
      prosta_brez_narocil: parseNum(v.prosta_brez_narocil) ?? 0,
      sestavil: txt(v.sestavil),
      zaznamek: txt(v.zaznamek),
    });
  }
  if (postavke.length === 0) throw new Error("V datoteki ni najdenih postavk naročil.");
  return { postavke, opozorila };
}

/** Shrani nov uvoz. Ko so vse postavke vpisane, ga aktivira (prejšnji postanejo neaktivni). */
export async function shraniPriUvoz(datoteka: string, postavke: Postavka[]) {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb
    .from("fp_pri_uvozi")
    .insert({ datoteka, st_postavk: postavke.length })
    .select("id")
    .single();
  if (error) throw error;

  for (const kos of kosi(postavke)) {
    const { error: e } = await sb.from("fp_pri_postavke").insert(kos.map((p) => ({ ...p, uvoz_id: uvoz.id })));
    if (e) throw new Error(`Postavke niso bile v celoti shranjene (uvoz ni aktiviran): ${e.message}`);
  }
  const { error: e2 } = await sb.from("fp_pri_uvozi").update({ aktiven: true }).eq("id", uvoz.id);
  if (e2) throw e2;
}

// =====================================================================
// BRANJE / OPOMBE
// =====================================================================

const POLJA_POSTAVKE =
  "kljuc, stevilka, zap, status, partner, lokacija, drzava, kupcevo_narocilo, datum_odpreme, ident, opis, komplet, kolicina, em, zaloga, zaloga_ostalo, planirano_dn, prosta_zaloga, prosta_brez_narocil, sestavil, zaznamek";

export async function naloziZadnjiPriUvoz(): Promise<{ uvoz: PriUvoz | null; postavke: Postavka[] }> {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb
    .from("fp_pri_uvozi")
    .select("id, datoteka, st_postavk, created_at")
    .eq("aktiven", true)
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!uvoz) return { uvoz: null, postavke: [] };

  const postavke = await fetchAll<Postavka>((from, to) =>
    sb.from("fp_pri_postavke").select(POLJA_POSTAVKE).eq("uvoz_id", uvoz.id).eq("visible", true).order("id").range(from, to),
  );
  const st = (x: unknown) => Number(x ?? 0);
  return {
    uvoz,
    postavke: postavke.map((p) => ({
      ...p,
      kolicina: st(p.kolicina),
      zaloga: st(p.zaloga),
      zaloga_ostalo: st(p.zaloga_ostalo),
      planirano_dn: st(p.planirano_dn),
      prosta_zaloga: st(p.prosta_zaloga),
      prosta_brez_narocil: st(p.prosta_brez_narocil),
    })),
  };
}

export async function naloziOpombe(): Promise<Opomba[]> {
  const sb = getSupabase();
  return fetchAll<Opomba>((from, to) =>
    sb.from("fp_pri_opombe").select("kljuc, opomba, pregledano").eq("visible", true).order("id").range(from, to),
  );
}

export async function shraniOpombo(o: Opomba) {
  const { error } = await getSupabase().from("fp_pri_opombe").upsert(o, { onConflict: "kljuc" });
  if (error) throw error;
}

// =====================================================================
// IZRAČUN PRIORITET
// =====================================================================

type Vir = {
  tip: "nalog" | "dn";
  kolicina: number; // preostanek za dodeljevanje
  nalog?: Nalog;
  upostevano: number; // upoštevana odprta količina naloga
  predviden: boolean;
  dodelitve: NalogDodelitev[];
};

/** Prva beseda naziva (za primerjavo kupca na nalogu s kupcem naročila). */
const kupecKljuc = (s: string | null) =>
  (s ?? "")
    .toLowerCase()
    .replace(/["“”'.,]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["d.o.o", "doo", "llc", "jsc", "sas", "ste", "ooo"].includes(w))[0] ?? "";
const jeFines = (s: string | null) => !s || s.toLowerCase().startsWith("fines");

/**
 * Za vsak artikel razdeli zalogo in delovne naloge po naročilih (FIFO po datumu odpreme):
 * 1. naročila v odpremi, nato po datumu odpreme (zapadla najprej), nato po številki naročila;
 * 2. najprej zaloga matičnega skladišča, nato nalogi po roku izdelave, nato planirana količina DN brez naloga;
 * 3. odprte količine nalogov se uskladijo s "Planirano količino (DN)" iz izvoza VD200
 *    (če je nalogov več, se odšteje pri najzgodnejših - te so verjetno že izdelane in na zalogi);
 * 4. če je PROSTA ZALOGA v ERP negativna, je del zaloge/DN rezerviran drugje -
 *    toliko kosov pri najkasnejših naročilih ostane "MANJKA" (pravilo iz Excela: prosta < 0 => MANJKA).
 */
export function izracunajPrioritete(postavke: Postavka[], nalogi: Nalog[], nast: Nastavitve): Rezultat {
  const vse = postavke.filter((p) => !nast.samoIzdelki || jeIzdelek(p.ident));
  const poIdentu = new Map<string, Postavka[]>();
  for (const p of vse) poIdentu.set(p.ident, [...(poIdentu.get(p.ident) ?? []), p]);

  const nalogiPoKodi = new Map<string, Nalog[]>();
  for (const n of nalogi) {
    if (n.razpisana_kolicina - n.izdelana_kolicina <= 0) continue;
    nalogiPoKodi.set(n.koda_artikla, [...(nalogiPoKodi.get(n.koda_artikla) ?? []), n]);
  }

  const izracunane: PostavkaIzracun[] = [];
  const artikli: ArtikelPregled[] = [];
  const vsiNalogi: NalogPrioriteta[] = [];

  for (const [ident, xs] of poIdentu) {
    const a = xs[0];
    const potrebe = xs
      .filter((p) => p.kolicina > 0 && (jePotrjeno(p.status) || jeVOdpremi(p.status) || nast.vkljuciNepotrjena))
      .sort(
        (x, y) =>
          Number(jeVOdpremi(y.status)) - Number(jeVOdpremi(x.status)) ||
          (x.datum_odpreme ?? "9999").localeCompare(y.datum_odpreme ?? "9999") ||
          x.stevilka.localeCompare(y.stevilka) ||
          (x.zap ?? 0) - (y.zap ?? 0),
      );
    const naroceno = potrebe.reduce((s, p) => s + p.kolicina, 0);

    // ---- viri iz proizvodnje
    const odprti = (nalogiPoKodi.get(ident) ?? [])
      .map((n) => ({ n, odprto: n.razpisana_kolicina - n.izdelana_kolicina }))
      .sort((x, y) => (x.n.rok_izdelave ?? "9999").localeCompare(y.n.rok_izdelave ?? "9999") || x.n.st_naloga.localeCompare(y.n.st_naloga));
    let presezek = odprti.reduce((s, x) => s + x.odprto, 0) - Math.max(0, a.planirano_dn);
    const viri: Vir[] = [];
    for (const { n, odprto } of odprti) {
      const odbij = Math.min(odprto, Math.max(0, presezek));
      presezek -= odbij;
      const upostevano = odprto - odbij;
      if (upostevano <= 0) continue;
      viri.push({
        tip: "nalog",
        kolicina: upostevano,
        upostevano,
        nalog: n,
        predviden: (n.status_naloga ?? "").toLowerCase().includes("predviden"),
        dodelitve: [],
      });
    }
    const nalogiSkupaj = viri.reduce((s, v) => s + v.kolicina, 0);
    const dnBrezNaloga = Math.max(0, a.planirano_dn - nalogiSkupaj);
    if (dnBrezNaloga > 0) viri.push({ tip: "dn", kolicina: dnBrezNaloga, upostevano: dnBrezNaloga, predviden: false, dodelitve: [] });

    // ---- omejitev ERP (prosta zaloga < 0)
    const rezerviranoDrugje = Math.max(0, a.zaloga + a.planirano_dn - a.prosta_zaloga - naroceno);
    let pokrijem = a.prosta_zaloga < 0 ? Math.max(0, naroceno + a.prosta_zaloga) : Infinity;
    let zaloga = Math.max(0, a.zaloga);

    let izZaloge = 0;
    let izProizvodnje = 0;
    let manjka = 0;
    let zalogaDo: IsoDate | null = null;
    let zalogaPrekinjena = false;
    let naslednjaIzProizvodnje: IsoDate | null = null;

    for (const p of potrebe) {
      const deli: Del[] = [];
      let ostane = p.kolicina;
      const potrebnoDo = p.datum_odpreme ? addDays(p.datum_odpreme, -nast.zamikDni) : null;

      const vzemi = (k: number) => {
        const x = Math.min(k, ostane, pokrijem);
        ostane -= x;
        pokrijem -= x;
        return x;
      };

      const z = vzemi(zaloga);
      if (z > 0) {
        zaloga -= z;
        izZaloge += z;
        deli.push({ vir: "zaloga", kolicina: z });
      }
      for (const v of viri) {
        if (ostane <= 0 || pokrijem <= 0) break;
        const x = vzemi(v.kolicina);
        if (x <= 0) continue;
        v.kolicina -= x;
        izProizvodnje += x;
        v.dodelitve.push({ kljuc: p.kljuc, stevilka: p.stevilka, partner: p.partner, datum: p.datum_odpreme, kolicina: x });
        if (v.tip === "nalog" && v.nalog) {
          const n = v.nalog;
          const drugKupec = !jeFines(n.narocnik) && kupecKljuc(n.narocnik) !== kupecKljuc(p.partner) ? n.narocnik : null;
          deli.push({ vir: "nalog", kolicina: x, nalog: n.st_naloga, krovni: n.krovni_dn, rok: n.rok_izdelave, predviden: v.predviden, drugKupec });
        } else {
          deli.push({ vir: "dn", kolicina: x });
        }
      }
      if (ostane > 0) {
        manjka += ostane;
        deli.push({ vir: "manjka", kolicina: ostane, erp: a.prosta_zaloga < 0 && pokrijem <= 0 });
      }

      const status = statusDelov(deli, potrebnoDo);
      const samoZaloga = deli.every((d) => d.vir === "zaloga");
      if (samoZaloga && !zalogaPrekinjena) zalogaDo = p.datum_odpreme ?? zalogaDo;
      else zalogaPrekinjena = true;
      if (!samoZaloga && !naslednjaIzProizvodnje) naslednjaIzProizvodnje = potrebnoDo;

      izracunane.push(razsiri(p, nast, { status, deli, potrebnoDo }));
    }

    // Postavke, ki ne štejejo v potrebe (nepotrjene, količina 0) - prikazane brez dodelitve
    for (const p of xs) {
      if (potrebe.includes(p)) continue;
      izracunane.push(razsiri(p, nast, { status: "PREGLEJ", deli: [], potrebnoDo: null }));
    }

    // ---- prioritete nalogov
    const nalogiArtikla: NalogPrioriteta[] = viri
      .filter((v) => v.tip === "nalog" && v.nalog)
      .map((v) => nalogPrioriteta(v, ident, a.opis, nast.zamikDni, a.prosta_zaloga));
    vsiNalogi.push(...nalogiArtikla);

    const statusi = izracunane.filter((p) => p.ident === ident && !p.nepotrjeno).map((p) => p.status);
    artikli.push({
      ident,
      opis: a.opis,
      grupa: grupaIzOpisa(a.opis),
      zaloga: a.zaloga,
      zaloga_ostalo: a.zaloga_ostalo,
      planirano_dn: a.planirano_dn,
      prosta_zaloga: a.prosta_zaloga,
      naroceno,
      izZaloge,
      izProizvodnje,
      manjka,
      rezerviranoDrugje,
      zalogaDo,
      naslednjaIzProizvodnje,
      nalogi: nalogiArtikla,
      status: statusi.reduce<Status>((s, x) => (RANG[x] < RANG[s] ? x : s), "NA_ZALOGI"),
    });
  }

  // Nalogi brez naročil v izvozu (izdelava za zalogo) - za pregled "Po nalogih"
  const vidni = new Set(vsiNalogi.map((n) => n.st_naloga));
  for (const [koda, ns] of nalogiPoKodi) {
    if (nast.samoIzdelki && !jeIzdelek(koda)) continue;
    if (poIdentu.has(koda)) continue;
    for (const n of ns) {
      if (vidni.has(n.st_naloga)) continue;
      const odprto = n.razpisana_kolicina - n.izdelana_kolicina;
      vsiNalogi.push(
        nalogPrioriteta(
          { tip: "nalog", kolicina: odprto, upostevano: odprto, nalog: n, predviden: (n.status_naloga ?? "").toLowerCase().includes("predviden"), dodelitve: [] },
          koda,
          n.naziv_artikla,
          nast.zamikDni,
        ),
      );
    }
  }

  return {
    postavke: izracunane.sort(
      (x, y) =>
        (x.datum_odpreme ?? "9999").localeCompare(y.datum_odpreme ?? "9999") ||
        (x.partner ?? "").localeCompare(y.partner ?? "") ||
        x.stevilka.localeCompare(y.stevilka) ||
        (x.opis ?? "").localeCompare(y.opis ?? ""),
    ),
    artikli: artikli.sort((x, y) => RANG[x.status] - RANG[y.status] || x.ident.localeCompare(y.ident)),
    nalogi: vsiNalogi.sort(
      (x, y) =>
        Number(y.zamuja) - Number(x.zamuja) ||
        (x.prvaPotreba ?? "9999").localeCompare(y.prvaPotreba ?? "9999") ||
        (x.rok ?? "9999").localeCompare(y.rok ?? "9999"),
    ),
  };
}

function statusDelov(deli: Del[], potrebnoDo: IsoDate | null): Status {
  if (deli.some((d) => d.vir === "manjka")) return "MANJKA";
  const nalogi = deli.filter((d): d is Extract<Del, { vir: "nalog" }> => d.vir === "nalog");
  if (nalogi.some((d) => d.rok && potrebnoDo && d.rok > potrebnoDo)) return "ZAMUJA";
  if (deli.some((d) => d.vir === "dn") || nalogi.some((d) => d.predviden || !d.rok) || (nalogi.length > 0 && !potrebnoDo))
    return "PREGLEJ";
  if (nalogi.length > 0) return "V_DELU";
  return "NA_ZALOGI";
}

function razsiri(
  p: Postavka,
  nast: Nastavitve,
  x: { status: Status; deli: Del[]; potrebnoDo: IsoDate | null },
): PostavkaIzracun {
  const vOdpremi = jeVOdpremi(p.status);
  return {
    ...p,
    ...x,
    vOdpremi,
    nepotrjeno: !jePotrjeno(p.status) && !vOdpremi,
    zapadlo: !!p.datum_odpreme && p.datum_odpreme < nast.danes && !vOdpremi,
    teden: p.datum_odpreme ? mondayOf(p.datum_odpreme) : null,
    grupa: grupaIzOpisa(p.opis),
  };
}

function nalogPrioriteta(v: Vir, ident: string, opis: string | null, zamikDni: number, prostaZaloga = 0): NalogPrioriteta {
  const n = v.nalog!;
  const prodano = v.dodelitve.reduce((s, d) => s + d.kolicina, 0);
  const prosto = v.upostevano - prodano;
  const datumi = v.dodelitve.map((d) => d.datum).filter((d): d is IsoDate => !!d).sort();
  const prvaPotreba = datumi[0] ?? null;
  const potrebnoDo = prvaPotreba ? addDays(prvaPotreba, -zamikDni) : null;
  const zamuja = !!(n.rok_izdelave && potrebnoDo && n.rok_izdelave > potrebnoDo);

  // Koliko kosov je potrebnih do roka naloga (in pred njim)
  const predRokom = n.rok_izdelave
    ? v.dodelitve.filter((d) => d.datum && addDays(d.datum, -zamikDni) < n.rok_izdelave!).reduce((s, d) => s + d.kolicina, 0)
    : 0;

  const kos = (k: number) => `${fmtKol(k)} kos`;
  let predlog: string;
  if (prodano === 0) predlog = "Ni vezan na naročila - izdelava za zalogo, ni prioriteten.";
  else if (zamuja)
    predlog = `Pospeši: ${kos(predRokom)} je potrebnih pred rokom naloga (prva odprema ${fmtDatum(prvaPotreba)})${
      prosto > 0 ? `; ${kos(prosto)} ni prodanih - razbij nalog` : ""
    }`;
  else if (prosto > 0)
    predlog = `Najprej ${kos(prodano)} (prodano), ${kos(prosto)} ni vezanih - izdelaj po potrebi ali razbij nalog.`;
  else predlog = `V celoti prodano - izdelaj ves nalog do ${fmtDatum(potrebnoDo)}`;
  if (v.predviden) predlog = `Nalog je samo predviden. ${predlog}`;
  if (prostaZaloga < 0) predlog = `Prosta zaloga v ERP je ${fmtKol(prostaZaloga)} - preveri rezervacije. ${predlog}`;

  return {
    st_naloga: n.st_naloga,
    krovni_dn: n.krovni_dn,
    ident,
    opis: opis ?? n.naziv_artikla,
    narocnik: n.narocnik,
    status_naloga: n.status_naloga,
    rok: n.rok_izdelave,
    preostala: v.upostevano,
    dodelitve: v.dodelitve,
    prodano,
    prosto,
    prvaPotreba,
    zamuja,
    predviden: v.predviden,
    predlog,
  };
}

const fmtKol = (k: number) => new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 }).format(k);
function fmtDatum(iso: IsoDate | null) {
  if (!iso) return "–";
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}.`;
}

/** Kratek opis porekla količine: "2 zaloga · 3 DN 261062 (20. 10.)". */
export function opisDelov(deli: Del[]): string {
  return deli
    .map((d) => {
      const k = fmtKol(d.kolicina);
      if (d.vir === "zaloga") return `${k} z zaloge`;
      if (d.vir === "dn") return `${k} iz DN (ni naloga)`;
      if (d.vir === "manjka") return `${k} manjka${d.erp ? " (ERP)" : ""}`;
      return `${k} iz naloga ${d.nalog} (rok ${fmtDatum(d.rok)})`;
    })
    .join(" · ");
}

export const danesIso = () => toIso(new Date());

// =====================================================================
// IZVOZ
// =====================================================================

const xDatum = (iso: IsoDate | null) => (iso ? new Date(`${iso}T00:00:00`) : "");

function zapisiXlsx(list: string, vrstice: Record<string, unknown>[], sirine: number[], ime: string) {
  const ws = XLSX.utils.json_to_sheet(vrstice, { cellDates: true, dateNF: "d. m. yyyy" });
  ws["!cols"] = sirine.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, list);
  XLSX.writeFile(wb, ime);
}

/** Krovni nalogi, iz katerih pride postavka (brez ponavljanja). */
export const krovniPostavke = (p: PostavkaIzracun) => [
  ...new Set(p.deli.flatMap((d) => (d.vir === "nalog" && d.krovni ? [d.krovni] : []))),
];

/** Zavihek "Odpreme po tednih". */
export function izvoziOdpremeXlsx(postavke: PostavkaIzracun[], ime: string) {
  zapisiXlsx(
    "Odpreme",
    postavke.map((p) => ({
      "Datum odpreme": xDatum(p.datum_odpreme),
      Teden: p.teden ? isoWeek(p.teden) : "",
      Naročilo: p.stevilka,
      Partner: p.partner ?? "",
      Lokacija: p.lokacija ?? "",
      IDENT: p.ident,
      "Kratki opis": p.opis ?? "",
      Grupa: p.grupa,
      Količina: p.kolicina,
      Status: STATUS[p.status].label,
      "Krovni DN": krovniPostavke(p).join(", "),
      Pokritje: opisDelov(p.deli),
      "Potrebno do": xDatum(p.potrebnoDo),
      "Zaloga (MS)": p.zaloga,
      "Planirano DN": p.planirano_dn,
      "Prosta zaloga": p.prosta_zaloga,
      "Status naročila": p.status ?? "",
    })),
    [12, 7, 11, 34, 26, 16, 40, 10, 9, 14, 12, 60, 12, 10, 10, 10, 18],
    ime,
  );
}

/** Zavihek "Prioritete nalogov". */
export function izvoziNalogePrioritetXlsx(nalogi: NalogPrioriteta[], ime: string) {
  zapisiXlsx(
    "Nalogi",
    nalogi.map((n) => ({
      Sklop: n.zamuja ? "Zamuja" : "Po prvi odpremi",
      Nalog: n.st_naloga,
      "Krovni DN": n.krovni_dn ?? "",
      IDENT: n.ident,
      Naziv: n.opis ?? "",
      "Rok izdelave": xDatum(n.rok),
      "Prva odprema": xDatum(n.prvaPotreba),
      "Odprta količina": n.preostala,
      Prodano: n.prodano,
      Prosto: n.prosto,
      Predlog: n.predlog,
      Naročila: n.dodelitve.map((d) => `${fmtKol(d.kolicina)}× ${d.partner ?? d.stevilka} (${fmtDatum(d.datum)})`).join("; "),
    })),
    [14, 10, 10, 16, 40, 12, 12, 10, 9, 9, 70, 80],
    ime,
  );
}

/** Zavihek "Po artiklih". */
export function izvoziArtikleXlsx(artikli: ArtikelPregled[], ime: string) {
  zapisiXlsx(
    "Artikli",
    artikli.map((a) => ({
      Status: STATUS[a.status].label,
      IDENT: a.ident,
      Naziv: a.opis ?? "",
      Grupa: a.grupa,
      "Zaloga (MS)": a.zaloga,
      "Zaloga (ostalo)": a.zaloga_ostalo,
      "Planirano DN": a.planirano_dn,
      "Prosta zaloga": a.prosta_zaloga,
      Naročeno: a.naroceno,
      "Iz zaloge": a.izZaloge,
      "Iz proizvodnje": a.izProizvodnje,
      Manjka: a.manjka,
      "Zaloga zadošča do": xDatum(a.zalogaDo),
      "1. kos iz proizvodnje do": xDatum(a.naslednjaIzProizvodnje),
      Nalogi: a.nalogi.map((n) => `${n.st_naloga} (krovni ${n.krovni_dn ?? "-"}, ${fmtKol(n.preostala)} kos, rok ${fmtDatum(n.rok)})`).join("; "),
    })),
    [14, 16, 40, 10, 10, 10, 10, 10, 10, 10, 12, 9, 14, 16, 70],
    ime,
  );
}

// =====================================================================
// TXT ZA MONTAŽO (Teams sporočilo)
// =====================================================================

const DNEVI_TXT = ["", "Ponedeljek", "Torek", "Sreda", "Četrtek", "Petek", "Sobota", "Nedelja"];
const PRAVNE_OBLIKE = /\b(d\.?\s?o\.?\s?o\.?|d\.?\s?d\.?|s\.?\s?p\.?|llc|jsc|uab|gmbh|bvba|sas|sarl|ste|ltd|pty|ooo|doo|inc)(?=[\s,.]|$)\.?/gi;

/** Kratko ime kupca za sporočilo: "PEKARNA KAUČIČ d.o.o." -> "Pekarna Kaučič". */
export function kratkoIme(partner: string | null): string {
  const besede = (partner ?? "")
    .replace(/["“”„]/g, " ")
    .replace(PRAVNE_OBLIKE, " ")
    .replace(/[,.]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return besede.map((b) => (b.length <= 3 && b === b.toUpperCase() ? b : b.charAt(0).toUpperCase() + b.slice(1).toLowerCase())).join(" ");
}

const datumTxt = (iso: IsoDate) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${y}`;
};

/**
 * Sporočilo za montažo (oblika kot ročno poslana Teams sporočila):
 *
 *   Prioritete - 5.10. -> 6.11. (OC-A, OC-B) - krovni 2329, 2316
 *   Povzetek: 5 delovnih tednov - 8 OC-A, 22 OC-B.
 *
 *   Torek 13.10.2026
 *   7x 100-301.2001; Peč konvekcijska HTB-5 NEW (Tim Zip) - iz 2316
 *
 * Za vsak datum odpreme so artikli združeni (količine kupcev seštete), na koncu vrstice krovni nalog,
 * iz katerega pride (ali z zaloge / MANJKA).
 */
export function prioriteteTxt(postavke: PostavkaIzracun[], od: IsoDate, doo: IsoDate | null): string {
  const xs = postavke.filter((p) => p.datum_odpreme && p.kolicina > 0);
  if (xs.length === 0) return "Ni odprem za izbrane filtre.";

  const datumi = [...new Set(xs.map((p) => p.datum_odpreme!))].sort();
  const grupe = new Map<string, number>();
  for (const p of xs) grupe.set(p.grupa, (grupe.get(p.grupa) ?? 0) + p.kolicina);
  const vsiKrovni = [...new Set(xs.flatMap(krovniPostavke))].sort();
  const zadnji = doo ? addDays(doo, -1) : datumi[datumi.length - 1];
  const tednov = Math.round((fromIsoMs(mondayOf(zadnji)) - fromIsoMs(mondayOf(od))) / (7 * 86400000)) + 1;
  const grupeTxt = [...grupe].sort((a, b) => a[0].localeCompare(b[0]));

  const vrstice: string[] = [
    `Prioritete - ${datumTxt(od).replace(/\d{4}$/, "")} -> ${datumTxt(zadnji).replace(/\d{4}$/, "")} (${grupeTxt.map(([g]) => g).join(", ")})${
      vsiKrovni.length ? ` - krovni ${vsiKrovni.join(", ")}` : ""
    }`,
    `Povzetek: ${tednov} ${tednov === 1 ? "delovni teden" : tednov === 2 ? "delovna tedna" : tednov <= 4 ? "delovni tedni" : "delovnih tednov"} - ${grupeTxt
      .map(([g, k]) => `${fmtKol(k)} ${g}`)
      .join(", ")}.`,
  ];

  for (const datum of datumi) {
    const dneva = xs.filter((p) => p.datum_odpreme === datum);
    const wd = new Date(`${datum}T00:00:00`).getDay();
    vrstice.push("", `${DNEVI_TXT[wd === 0 ? 7 : wd]} ${datumTxt(datum)}${dneva.some((p) => p.zapadlo) ? " - ZAPADLO" : ""}`);

    // Združi po identu (vrstni red: kot v pregledu)
    const poIdentu = new Map<string, PostavkaIzracun[]>();
    for (const p of dneva) poIdentu.set(p.ident, [...(poIdentu.get(p.ident) ?? []), p]);
    for (const [ident, ps] of poIdentu) {
      const skupaj = ps.reduce((s, p) => s + p.kolicina, 0);
      const kupci = new Map<string, number>();
      for (const p of ps) kupci.set(kratkoIme(p.partner), (kupci.get(kratkoIme(p.partner)) ?? 0) + p.kolicina);
      const kupciTxt =
        kupci.size === 1 ? [...kupci.keys()][0] : [...kupci].map(([k, n]) => `${fmtKol(n)}x ${k}`).join(", ");

      const deli = ps.flatMap((p) => p.deli);
      const vsota = (f: (d: Del) => boolean) => deli.filter(f).reduce((s, d) => s + d.kolicina, 0);
      const krovni = [...new Set(ps.flatMap(krovniPostavke))];
      const viri: string[] = [];
      if (krovni.length) viri.push(`iz ${krovni.join(", ")}`);
      const zaloga = vsota((d) => d.vir === "zaloga");
      if (zaloga) viri.push(zaloga === skupaj ? "z zaloge" : `${fmtKol(zaloga)} z zaloge`);
      const dn = vsota((d) => d.vir === "dn");
      if (dn) viri.push(`${fmtKol(dn)} DN brez naloga`);
      const manjka = vsota((d) => d.vir === "manjka");
      if (manjka) viri.push(`MANJKA ${fmtKol(manjka)} (ni naloga)`);
      if (ps.some((p) => p.status === "ZAMUJA")) viri.push("nalog ZAMUJA");

      vrstice.push(`${fmtKol(skupaj)}x ${ident}; ${ps[0].opis ?? ""} (${kupciTxt})${viri.length ? ` - ${viri.join(", ")}` : ""}`);
    }
  }
  return vrstice.join("\n");
}

const fromIsoMs = (iso: IsoDate) => new Date(`${iso}T00:00:00`).getTime();

/** Prenese besedilo kot .txt (UTF-8 z BOM, da se šumniki pravilno prikažejo v Beležnici). */
export function prenesiTxt(besedilo: string, ime: string) {
  prenesiDatoteko(`\uFEFF${besedilo.replace(/\n/g, "\r\n")}`, ime, "text/plain;charset=utf-8");
}
