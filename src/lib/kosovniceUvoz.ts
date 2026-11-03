import * as XLSX from "xlsx";
import { getSupabase, kosi } from "./supabase";
import { parseNum } from "./stevila";
import { zgradiDrevo, type KosovnicaVrstica } from "./kosovnice";

const txt = (v: unknown) => String(v ?? "").trim() || null;
const bool = (v: unknown) => txt(v) === "DA" ? true : txt(v) === "NE" ? false : null;
export const IDENT_STOLPCI: Record<string, string> = {
  "Proizvodna šifra": "sifra", "ŠIFRA (RISP)": "risp_sifra", "Vrsta": "vrsta", "RD": "rd", "RDP": "rdp", "PM": "pm", "VK": "vk",
  "Naziv": "naziv", "Urejenost tehnične dokumentacije": "urejenost_teh_dok", "Urejenost nabavnih parametrov": "urejenost_nab_param",
  "Vgradnja": "vgradnja", "Status": "status", "Kataloška št.": "kataloska_st", "EM": "em", "Klasifikacija": "klasifikacija",
  "Tip materiala": "tip_materiala", "Pripadnost": "pripadnost", "Dobavitelj": "dobavitelj", "Proizvajalec": "proizvajalec",
  "Material": "material", "Standard": "standard", "Faktor 1": "faktor_1", "Faktor 2": "faktor_2", "Neakt.": "neaktiven",
  "Oznaka dokumenta": "oznaka_dokumenta", "Dodatni naziv": "dodatni_naziv", "Poreklo": "poreklo", "Rabatna skupina": "rabatna_skupina",
  "Bruto teža": "bruto_teza", "Neto teža": "neto_teza", "Tarifna številka": "tarifna_stevilka", "Naziv ANG": "naziv_ang",
  "Kratica": "kratica", "Družina": "druzina", "Karakteristično število": "karakteristicno_stevilo", "Odpiranje": "odpiranje",
  "Upravljanje": "upravljanje", "Partner": "partner", "Model": "model", "Uporabnik (KREIRAL)": "kreiral_uporabnik",
  "Datum/ura (KREIRAL)": "kreiral_cas", "Uporabnik (AŽURIRAL)": "azuriral_uporabnik", "Datum/ura (AŽURIRAL)": "azuriral_cas",
  "Prodajna cena": "prodajna_cena", "Nabavna cena": "nabavna_cena", "Cena v kooperaciji": "cena_kooperacija",
  "Povprečna cena": "povprecna_cena", "Cena zadnjega prevzema": "cena_zadnjega_prevzema", "Datum zad. prevzema": "datum_zad_prevzema",
  "Faktor vrednosti": "faktor_vrednosti", "Planirana lastna cena": "planirana_lastna_cena", "Planirana prodajna cena": "planirana_prodajna_cena",
  "Prodajna cena indeks (%)": "prodajna_cena_indeks",
};
const BOOL = new Set(["rd", "rdp", "pm", "vk", "urejenost_teh_dok", "urejenost_nab_param", "neaktiven"]);
const NUM = new Set(["faktor_1", "faktor_2", "bruto_teza", "neto_teza", "prodajna_cena", "nabavna_cena", "cena_kooperacija", "povprecna_cena", "cena_zadnjega_prevzema", "faktor_vrednosti", "planirana_lastna_cena", "planirana_prodajna_cena", "prodajna_cena_indeks"]);
function datum(v: unknown, samoDatum: boolean) {
  if (v == null || v === "") return null;
  if (typeof v !== "number") throw new Error(`Neveljaven Excel datum: ${v}`);
  const d = XLSX.SSF.parse_date_code(v);
  if (!d) throw new Error("Neveljaven datum v izvozu identov.");
  const dan = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  return samoDatum ? dan : `${dan}T${String(d.H).padStart(2, "0")}:${String(d.M).padStart(2, "0")}:${String(Math.floor(d.S)).padStart(2, "0")}`;
}
async function tabela(file: File, obvezni: string[]) {
  const wb = XLSX.read(await file.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const idx = rows.slice(0, 15).findIndex(r => obvezni.every(g => r.some(v => txt(v) === g)));
  if (idx < 0) throw new Error(`Manjkajo stolpci: ${obvezni.join(", ")}. Preveri izvoz.`);
  return rows.slice(idx + 1).filter(r => r.some(v => txt(v))).map((r, i) => ({ r: Object.fromEntries(rows[idx].map((g, j) => [txt(g) ?? "", r[j]])), vrstica: idx + i + 2 }));
}
export async function preberiIdenteXlsx(file: File) {
  const rows = await tabela(file, ["Proizvodna šifra", "ŠIFRA (RISP)", "Naziv", "Status", ...Object.keys(IDENT_STOLPCI)]);
  const opozorila: string[] = [];
  const poSifri = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const sifra = txt(row.r["Proizvodna šifra"]);
    if (!sifra) throw new Error(`Manjka proizvodna šifra v vrstici ${row.vrstica}.`);
    const prejsnji = poSifri.get(sifra);
    if (prejsnji) {
      // ERP lahko isti ident ponovi zaradi zgodovine prevzemov. Ostala polja morajo biti identična.
      const osnovni = (r: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !["Cena zadnjega prevzema", "Datum zad. prevzema"].includes(k))));
      if (osnovni(prejsnji.r) !== osnovni(row.r)) throw new Error(`Neskladna podvojena proizvodna šifra ${sifra}. Uvoz je preklican.`);
      const nov = parseNum(row.r["Datum zad. prevzema"]) ?? -1, star = parseNum(prejsnji.r["Datum zad. prevzema"]) ?? -1;
      if (nov === star && txt(row.r["Cena zadnjega prevzema"]) !== txt(prejsnji.r["Cena zadnjega prevzema"])) throw new Error(`Ident ${sifra} ima neskladni ceni istega prevzema.`);
      if (nov > star) poSifri.set(sifra, row);
      opozorila.push(`Ident ${sifra} je podvojen zaradi prevzemov; upoštevan je zapis z najnovejšim datumom prevzema.`);
    } else poSifri.set(sifra, row);
  }
  const identi = [...poSifri.values()].map(({ r, vrstica }) => {
    const sifra = txt(r["Proizvodna šifra"]);
    if (!sifra || !txt(r["ŠIFRA (RISP)"])) throw new Error(`Manjka šifra identa v vrstici ${vrstica}.`);
    const v: Record<string, string | number | boolean | null> = {};
    for (const [glava, polje] of Object.entries(IDENT_STOLPCI)) {
      v[polje] = BOOL.has(polje) ? bool(r[glava]) : NUM.has(polje) ? parseNum(r[glava]) : polje.endsWith("_cas") || polje === "datum_zad_prevzema" ? datum(r[glava], polje === "datum_zad_prevzema") : txt(r[glava]);
    }
    v.klasifikat = /^([0-9]{3})/.exec(sifra)?.[1] ?? null;
    return v;
  });
  if (!identi.length) throw new Error("Izvoz identov je prazen.");
  return { identi, opozorila };
}
export async function preberiKosovniceXlsx(file: File): Promise<{ vrstice: KosovnicaVrstica[]; opozorila: string[] }> {
  const rows = await tabela(file, ["Izdelek", "Nivo", "Šifra", "Proiz.šifra", "Naziv", "Količina", "Klasifikat", "Vrsta"]);
  const vrstice = rows.map(({ r, vrstica }) => {
    const qty = parseNum(r["Količina"]), nivo = parseNum(r["Nivo"]);
    if (!txt(r["Izdelek"]) || !txt(r["Šifra"]) || nivo == null || qty == null || qty < 0) throw new Error(`Neveljavna postavka kosovnice v vrstici ${vrstica}.`);
    return { vrstica, izdelek: txt(r["Izdelek"])!, nivo, risp_sifra: txt(r["Šifra"])!, sifra: txt(r["Proiz.šifra"]) ?? `RISP:${txt(r["Šifra"])}`, naziv: txt(r["Naziv"]) ?? "Manjka proizvodna šifra / naziv v izvozu ERP", klasifikat: txt(r["Klasifikat"]), vrsta: txt(r["Vrsta"]), kolicina: qty };
  });
  const po = new Map<string, KosovnicaVrstica[]>();
  for (const v of vrstice) { const skupina = po.get(v.izdelek) ?? []; skupina.push(v); po.set(v.izdelek, skupina); }
  if (!po.size) throw new Error("Izvoz kosovnic je prazen.");
  for (const skupina of po.values()) {
    const koren = zgradiDrevo(skupina);
    if (koren.risp_sifra !== koren.izdelek) throw new Error(`Neskladen korenski ident ${koren.sifra}.`);
  }
  const neznani = vrstice.filter(v => v.sifra.startsWith("RISP:"));
  return { vrstice, opozorila: neznani.length ? [`${neznani.length} postavk nima proizvodne šifre; ohranjene so z oznako RISP in brez potrjene zaloge.`] : [] };
}
/** Upsert po proizvodni šifri v skupni spl_identi (tudi FINES_WorkInstructions). Nobena šifra se ne skrije. */
export async function shraniIdenteUvoz(datoteka: string, identi: Awaited<ReturnType<typeof preberiIdenteXlsx>>["identi"]) {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb.from("spl_identi_uvozi").insert({ datoteka, st_postavk: identi.length }).select("id").single();
  if (error) throw new Error(`Uvoz identov ni pripravljen. Preveri skripto 030. ${error.message}`);
  for (const kos of kosi(identi)) {
    // klasifikat je v bazi GENERATED ALWAYS (iz sifra), zato ga ne pošljemo.
    const vrstice = kos.map((v) => { const r: Record<string, unknown> = { ...v, visible: true }; delete r.klasifikat; return r; });
    const { error: e } = await sb.from("spl_identi").upsert(vrstice, { onConflict: "sifra" });
    if (e) throw new Error(`Identi niso bili v celoti shranjeni (uvoz ni aktiviran - ponovi uvoz): ${e.message}`);
  }
  const { error: e2 } = await sb.from("spl_identi_uvozi").update({ aktiven: true }).eq("id", uvoz.id);
  if (e2) throw e2;
}
export async function shraniKosovniceUvoz(datoteka: string, vrstice: KosovnicaVrstica[]) {
  const sb = getSupabase();
  const { data, error } = await sb.from("spl_kosovnice_uvozi").insert({ datoteka, st_postavk: vrstice.length }).select("id").single();
  if (error) throw new Error(`Kosovnice niso pripravljene. Preveri skripto 027. ${error.message}`);
  for (const kos of kosi(vrstice, 1000)) {
    const { error: e } = await sb.from("spl_kosovnice").insert(kos.map(v => ({ ...v, uvoz_id: data.id })));
    if (e) throw new Error(`Uvoz kosovnic ni aktiviran; prejšnji ostaja veljaven. ${e.message}`);
    const { error: heartbeat } = await sb.rpc("spl_kosovnice_podaljsaj_zaklep");
    if (heartbeat) throw new Error(heartbeat.message);
  }
  const { error: e } = await sb.rpc("spl_kosovnice_aktiviraj", { p_uvoz: data.id });
  if (e) throw new Error(`Uvoz kosovnic ni aktiviran. ${e.message}`);
}
