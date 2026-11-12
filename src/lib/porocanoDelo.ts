// Poročano delo (štempljanje po nalogih) iz ERP - uvoz in branje za stran Produktivnost.
import * as XLSX from "xlsx";
import { addDays, type IsoDate } from "./dates";
import type { OddelekKoda } from "./normativi";
import { parseNum } from "./stevila";
import { fetchAll, getSupabase, kosi } from "./supabase";

/** Seštete poročane ure delavca na nalogu in operaciji v enem dnevu. */
export type PorocanoDelo = {
  id: number;
  datum: IsoDate;
  st_naloga: string;
  delavec: string;
  ime_delavca: string | null;
  operacija: string;
  naziv_operacije: string | null;
  delovno_mesto: string | null;
  opis: string | null;
  ident: string | null;
  status: string | null;
  ure: number;
  /** Prvi začetek in zadnji konec dela ("2026-11-10T06:30:00", lokalni čas). */
  zacetek: string | null;
  konec: string | null;
  st_vnosov: number;
};

export type PorocanoVrstica = Omit<PorocanoDelo, "id">;

// =====================================================================
// OPERACIJE -> ODDELEK
// =====================================================================

/**
 * Oddelek, kateremu se šteje operacija iz ERP (šifra operacije). Operacije brez oddelka (vzdrževanje, logistika,
 * ostalo) so režija - na celico se štejejo samo kot delo izven plana ljudi, ki so ta dan delali na celici.
 */
export const OPERACIJE_ODDELKA: Record<OddelekKoda, string[]> = {
  // razrez, prebijanje, krivljenje, varjenje, vtiskovanje, brušenje, folija, vrtanje, izolacija, TS
  P: ["03", "05", "06", "07", "08", "09", "10", "11", "12", "14", "26", "27", "28", "32", "47", "48", "50", "51", "53"],
  // sestavljanje, vrata, prezračevanje, čiščenje in zaključno sestavljanje, pakiranje
  M: ["13", "19", "20", "22", "24"],
  // vezava proizvoda, vezava ožičenja, izdelava ožičenja
  E: ["15", "16", "17"],
  // preizkušanje
  T: ["18"],
};

const ODDELEK_OPERACIJE = new Map<string, OddelekKoda>(
  (Object.entries(OPERACIJE_ODDELKA) as [OddelekKoda, string[]][]).flatMap(([k, ops]) => ops.map((o) => [o, k] as const)),
);
/** Oddelek operacije; null = režija (vzdrževanje, logistika, ostalo ...). */
export const oddelekOperacije = (operacija: string): OddelekKoda | null => ODDELEK_OPERACIJE.get(operacija.padStart(2, "0")) ?? null;

// =====================================================================
// UVOZ XLSX
// =====================================================================

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const STOLPCI = {
  st_naloga: "številka",
  opis: "opis",
  status: "status",
  ident: "šifra",
  zacetek: "pričetek dela",
  konec: "konec dela",
  delavec: "delavec",
  ime_delavca: "ime delavca",
  operacija: "operacija",
  naziv_operacije: "naziv operacije",
  delovno_mesto: "naziv delovnega mesta",
  ure: "poročane ure",
} as const;

/** Excel datum / ura (serijska številka ali besedilo) -> "YYYY-MM-DDTHH:MM:SS" brez časovnega pasu. */
function casExcel(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.y}-${p(d.m)}-${p(d.d)}T${p(d.H)}:${p(d.M)}:${p(Math.floor(d.S))}`;
  }
  // "14. 05. 2026 06:34" ali "2026-05-14 06:34"
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5]}:00`;
  m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00`;
  return null;
}

/**
 * Prebere izvoz "Poročano delo" in sešteje vrstice po dnevu + nalogu + delavcu + operaciji
 * (izvoz ima za isti nalog več vrstic, npr. laser po pozicijah).
 */
export async function preberiPorocanoXlsx(file: File): Promise<{ vrstice: PorocanoVrstica[]; vnosov: number; opozorila: string[] }> {
  const wb = XLSX.read(await file.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const glavaIdx = rows.slice(0, 15).findIndex((r) => r.some((c) => norm(c) === "poročane ure"));
  if (glavaIdx < 0) throw new Error('V datoteki ni stolpca "Poročane ure". Ali je to izvoz poročanega dela?');
  const glava = rows[glavaIdx].map(norm);
  const idx = Object.fromEntries(Object.entries(STOLPCI).map(([polje, ime]) => [polje, glava.indexOf(ime)])) as Record<keyof typeof STOLPCI, number>;
  const manjka = (Object.keys(STOLPCI) as (keyof typeof STOLPCI)[]).filter((k) => idx[k] < 0 && k !== "delovno_mesto");
  if (manjka.length) throw new Error(`V izvozu manjkajo stolpci: ${manjka.map((k) => STOLPCI[k]).join(", ")}.`);

  const opozorila: string[] = [];
  const m = new Map<string, PorocanoVrstica>();
  let vnosov = 0;
  let brezCasa = 0;
  for (const r of rows.slice(glavaIdx + 1)) {
    const delavec = txt(r[idx.delavec]);
    const zacetek = casExcel(r[idx.zacetek]);
    if (!delavec) continue;
    if (!zacetek) {
      brezCasa++;
      continue;
    }
    vnosov++;
    const v = {
      datum: zacetek.slice(0, 10),
      st_naloga: txt(r[idx.st_naloga]) ?? "",
      delavec,
      operacija: txt(r[idx.operacija]) ?? "",
    };
    const kljuc = `${v.datum}|${v.st_naloga}|${v.delavec}|${v.operacija}`;
    const konec = casExcel(r[idx.konec]);
    const ure = parseNum(r[idx.ure]) ?? 0;
    const prej = m.get(kljuc);
    if (prej) {
      prej.ure += ure;
      prej.st_vnosov++;
      if (prej.zacetek === null || zacetek < prej.zacetek) prej.zacetek = zacetek;
      if (konec && (prej.konec === null || konec > prej.konec)) prej.konec = konec;
    } else {
      m.set(kljuc, {
        ...v,
        ime_delavca: txt(r[idx.ime_delavca]),
        naziv_operacije: txt(r[idx.naziv_operacije]),
        delovno_mesto: idx.delovno_mesto >= 0 ? txt(r[idx.delovno_mesto]) : null,
        opis: txt(r[idx.opis]),
        ident: txt(r[idx.ident]),
        status: txt(r[idx.status]),
        ure,
        zacetek,
        konec,
        st_vnosov: 1,
      });
    }
  }
  if (brezCasa) opozorila.push(`${brezCasa} vrstic brez začetka dela ni uvoženih.`);
  if (!m.size) throw new Error("V datoteki ni poročanega dela.");
  const vrstice = [...m.values()].map((v) => ({ ...v, ure: Math.round(v.ure * 10000) / 10000 }));
  return { vrstice, vnosov, opozorila };
}

/** Koliko dni nazaj od zadnjega shranjenega dneva uvoz posodobi (starejše vrstice se ne spreminjajo). */
const OKNO_DNI = 60;

/**
 * Shrani uvoz: posodobi vrstice zadnjih 60 dni (prvi uvoz: vse), vrstice tega obdobja, ki jih ni več v izvozu,
 * skrije (visible = false). Ko je vse vpisano, uvoz aktivira.
 */
export async function shraniPorocanoUvoz(datoteka: string, vrstice: PorocanoVrstica[]): Promise<{ posodobljeno: number }> {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb.from("fp_por_uvozi").insert({ datoteka, st_postavk: vrstice.length }).select("id").single();
  if (error) throw new Error(`Uvoz poročanega dela ni pripravljen. Zaženi skripto 036_porocano_delo.sql. ${error.message}`);

  const { data: zadnji, error: e1 } = await sb
    .from("fp_por_delo")
    .select("datum")
    .eq("visible", true)
    .order("datum", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  const od: IsoDate | null = zadnji?.datum ? addDays(zadnji.datum as IsoDate, -OKNO_DNI) : null;
  const nove = od ? vrstice.filter((v) => v.datum >= od) : vrstice;

  for (const kos of kosi(nove, 1000)) {
    const { error: e } = await sb
      .from("fp_por_delo")
      .upsert(kos.map((v) => ({ ...v, uvoz_id: uvoz.id, visible: true })), { onConflict: "datum,st_naloga,delavec,operacija" });
    if (e) throw new Error(`Poročano delo ni bilo v celoti shranjeno (uvoz ni aktiviran - ponovi uvoz): ${e.message}`);
  }

  // Vrstice obdobja, ki jih ni več v izvozu (popravek v ERP), se skrijejo
  if (od) {
    const obstojece = await fetchAll<{ id: number; datum: string; st_naloga: string; delavec: string; operacija: string }>((from, to) =>
      sb
        .from("fp_por_delo")
        .select("id, datum, st_naloga, delavec, operacija")
        .eq("visible", true)
        .gte("datum", od)
        .order("id")
        .range(from, to),
    );
    const vIzvozu = new Set(nove.map((v) => `${v.datum}|${v.st_naloga}|${v.delavec}|${v.operacija}`));
    const skrij = obstojece.filter((v) => !vIzvozu.has(`${v.datum}|${v.st_naloga}|${v.delavec}|${v.operacija}`)).map((v) => v.id);
    for (const ids of kosi(skrij, 200)) {
      const { error: e } = await sb.from("fp_por_delo").update({ visible: false }).in("id", ids);
      if (e) throw e;
    }
  }

  const { error: e2 } = await sb.from("fp_por_uvozi").update({ aktiven: true }).eq("id", uvoz.id);
  if (e2) throw e2;
  return { posodobljeno: nove.length };
}

// =====================================================================
// BRANJE
// =====================================================================

const STOLPCI_BRANJA =
  "id, datum, st_naloga, delavec, ime_delavca, operacija, naziv_operacije, delovno_mesto, opis, ident, status, ure, zacetek, konec, st_vnosov";

const vVrstico = (v: PorocanoDelo): PorocanoDelo => ({ ...v, ure: Number(v.ure), st_vnosov: Number(v.st_vnosov) });

/** Poročano delo v obdobju (vsi nalogi). */
export async function naloziPorocano(od: IsoDate, doo: IsoDate): Promise<PorocanoDelo[]> {
  const sb = getSupabase();
  const vrstice = await fetchAll<PorocanoDelo>((from, to) =>
    sb.from("fp_por_delo").select(STOLPCI_BRANJA).eq("visible", true).gte("datum", od).lte("datum", doo).order("id").range(from, to),
  );
  return vrstice.map(vVrstico);
}

/** Vse poročano delo na nalogih (za kontrolo produktivnosti krovnih nalogov). */
export async function naloziPorocanoNalogov(nalogi: string[]): Promise<PorocanoDelo[]> {
  const sb = getSupabase();
  const out: PorocanoDelo[] = [];
  for (const kos of kosi([...new Set(nalogi)], 150)) {
    const vrstice = await fetchAll<PorocanoDelo>((from, to) =>
      sb.from("fp_por_delo").select(STOLPCI_BRANJA).eq("visible", true).in("st_naloga", kos).order("id").range(from, to),
    );
    out.push(...vrstice.map(vVrstico));
  }
  return out;
}

export type NalogKrovnega = { st_naloga: string; krovni_dn: string | null; koda_artikla: string | null; naziv_artikla: string | null };

/** Nalogi krovnih nalogov iz vseh uvozov nalogov (tudi zaključeni, ki jih ni več v zadnjem uvozu). */
export async function naloziNalogeKrovnih(krovni: string[]): Promise<NalogKrovnega[]> {
  const sb = getSupabase();
  const out: NalogKrovnega[] = [];
  for (const kos of kosi([...new Set(krovni)], 200)) {
    const { data, error } = await sb.rpc("fp_nalogi_krovnih", { p_krovni: kos });
    if (error) throw error;
    out.push(...((data ?? []) as NalogKrovnega[]));
  }
  return out;
}

/** Zadnji aktiven uvoz poročanega dela (null = še ni uvoza); napaka, če tabel ni (skripta 036). */
export async function zadnjiPorocanoUvoz(): Promise<{ datoteka: string; created_at: string } | null> {
  const { data, error } = await getSupabase()
    .from("fp_por_uvozi")
    .select("datoteka, created_at")
    .eq("aktiven", true)
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
