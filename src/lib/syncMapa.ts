// Branje izvozov iz mape na serverju podjetja v brskalniku (File System Access API - Edge, Chrome).
// Uporabnik mapo enkrat izbere ("Poveži mapo"); brskalnik si ročaj zapomni (IndexedDB), ob syncu pa
// vpraša za dovoljenje branja (enkrat na sejo ali "vedno"). Aplikacija na Vercelu tako bere datoteke
// brez namestitve dodatnih programov.
import { getSupabase } from "./supabase";
import { SYNC_DATOTEKE, TABELE_UVOZOV, SYNC_KLJUCI, type SyncDatotekaKljuc } from "./syncDatoteke";

type Dovoljenje = "granted" | "prompt" | "denied";

/** Ročaj mape (deli API-ja, ki jih TypeScript še ne pozna). */
type RocajMape = {
  name: string;
  getFileHandle(ime: string): Promise<{ getFile(): Promise<File> }>;
  queryPermission(o: { mode: "read" }): Promise<Dovoljenje>;
  requestPermission(o: { mode: "read" }): Promise<Dovoljenje>;
};
type Izbirnik = (o: { id?: string; mode?: "read" }) => Promise<RocajMape>;

export type StanjeMape = {
  /** Brskalnik podpira branje map (Edge, Chrome na računalniku). */
  podprto: boolean;
  /** Ime povezane mape ali null. */
  ime: string | null;
  dovoljenje: Dovoljenje | null;
};

export type DatotekaVMapi = { naServerju: number; velikost: number } | null;

const izbirnik = () =>
  typeof window === "undefined" ? undefined : (window as unknown as { showDirectoryPicker?: Izbirnik }).showDirectoryPicker;
export const mapaPodprta = () => !!izbirnik();

// ---- IndexedDB (en zapis: ročaj mape)
const DB = "fines-sync";
const STORE = "mapa";
const KLJUC = "izvozi";

function odpriDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function shranjenRocaj(): Promise<RocajMape | null> {
  try {
    const db = await odpriDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KLJUC);
      req.onsuccess = () => resolve((req.result as RocajMape | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null; // zasebno okno ali blokirana shramba
  }
}

async function shraniRocaj(h: RocajMape) {
  const db = await odpriDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(h, KLJUC);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Stanje brez vprašanja uporabniku (deluje tudi brez klika). */
export async function stanjeMape(): Promise<StanjeMape> {
  if (!mapaPodprta()) return { podprto: false, ime: null, dovoljenje: null };
  const h = await shranjenRocaj();
  if (!h) return { podprto: true, ime: null, dovoljenje: null };
  return { podprto: true, ime: h.name, dovoljenje: await h.queryPermission({ mode: "read" }) };
}

/** Odpre izbiro mape (samo ob kliku). Vrne ime mape ali null, če je uporabnik preklical. */
export async function izberiMapo(): Promise<string | null> {
  const pick = izbirnik();
  if (!pick) throw new Error("Ta brskalnik ne zna brati map - uporabi Edge ali Chrome na računalniku.");
  try {
    const h = await pick({ id: "fines-izvozi", mode: "read" });
    await shraniRocaj(h);
    return h.name;
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return null;
    throw e;
  }
}

/**
 * Ročaj z dovoljenjem za branje. `vprasaj` = ob kliku uporabnika (brskalnik pokaže vprašanje);
 * brez klika (samodejni sync) vrne null, če dovoljenje ni že dano.
 */
async function rocajZDovoljenjem(vprasaj: boolean): Promise<RocajMape | null> {
  const h = await shranjenRocaj();
  if (!h) return null;
  if ((await h.queryPermission({ mode: "read" })) === "granted") return h;
  if (!vprasaj) return null;
  return (await h.requestPermission({ mode: "read" })) === "granted" ? h : null;
}

/** Čas spremembe in velikost datotek v mapi (vsebina se ne bere). */
export async function infoDatotek(vprasaj = false): Promise<Record<SyncDatotekaKljuc, DatotekaVMapi> | null> {
  const h = await rocajZDovoljenjem(vprasaj);
  if (!h) return null;
  const out = {} as Record<SyncDatotekaKljuc, DatotekaVMapi>;
  for (const k of SYNC_KLJUCI) {
    const f = await preberi(h, SYNC_DATOTEKE[k].datoteka);
    out[k] = f ? { naServerju: f.lastModified, velikost: f.size } : null;
  }
  return out;
}

async function preberi(h: RocajMape, ime: string): Promise<File | null> {
  try {
    return await (await h.getFileHandle(ime)).getFile();
  } catch (e) {
    if ((e as DOMException).name === "NotFoundError") return null;
    throw e;
  }
}

/** Datoteka iz povezane mape (null = mapa ni povezana / ni dovoljenja, napaka = datoteke ni). */
export async function datotekaIzMape(kljuc: SyncDatotekaKljuc, vprasaj: boolean): Promise<File | null> {
  const h = await rocajZDovoljenjem(vprasaj);
  if (!h) return null;
  const f = await preberi(h, SYNC_DATOTEKE[kljuc].datoteka);
  if (!f) throw new Error(`Datoteke ${SYNC_DATOTEKE[kljuc].datoteka} ni v mapi ${h.name}.`);
  return f;
}

// ---- brez povezane mape (Firefox, Safari) in skupina povlečenih datotek

/**
 * Odpre izbiro mape (`webkitdirectory`) - deluje v vseh brskalnikih na računalniku, a si mape ne zapomni.
 * Klicati takoj ob kliku (brskalnik okno odpre samo kot odziv na klik). Vrne [] ob preklicu.
 */
export function izberiDatotekeIzMape(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.webkitdirectory = true;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/**
 * Razporedi datoteke po imenu (brez razlikovanja velikih črk) na znane izvoze. Neznane se prezrejo -
 * ko bo izvoz dodan na seznam (syncDatoteke), se bo začel uvažati sam. Ob podvojenem imenu (podmape) velja novejša.
 */
export function razporediDatoteke(files: File[]): { po: Map<SyncDatotekaKljuc, File>; neznane: string[] } {
  const poImenu = new Map(SYNC_KLJUCI.map((k) => [SYNC_DATOTEKE[k].datoteka.toLowerCase(), k]));
  const po = new Map<SyncDatotekaKljuc, File>();
  const neznane = new Set<string>();
  for (const f of files) {
    const k = poImenu.get(f.name.toLowerCase());
    if (!k) {
      // skrite / začasne datoteke (~$ Excel, desktop.ini) niso vredne omembe
      if (!f.name.startsWith("~$") && !f.name.startsWith(".") && f.name.toLowerCase() !== "desktop.ini") neznane.add(f.name);
      continue;
    }
    const prej = po.get(k);
    if (!prej || f.lastModified > prej.lastModified) po.set(k, f);
  }
  return { po, neznane: [...neznane].sort((a, b) => a.localeCompare(b, "sl")) };
}

// ---- stanje in zaklep v bazi (SQL 025)

/** Napaka, ko tabela / funkcije iz SQL 025 še ne obstajajo - sync deluje brez zaklepa (kot prej). */
const brez025 = (m: string) => /fp_sync_|does not exist|schema cache|Could not find the function/i.test(m);

/** Čas datoteke, ki je bila nazadnje uvožena (ms), za vsak izvoz; null brez SQL 025. */
export async function uvozeniIzvozi(): Promise<Partial<Record<SyncDatotekaKljuc, number>> | null> {
  const { data, error } = await getSupabase().from("fp_sync_stanje").select("kljuc, izvoz_cas").eq("visible", true);
  if (error) return null;
  const out: Partial<Record<SyncDatotekaKljuc, number>> = {};
  for (const r of data as { kljuc: SyncDatotekaKljuc; izvoz_cas: string | null }[])
    if (r.izvoz_cas) out[r.kljuc] = Date.parse(r.izvoz_cas);
  return out;
}

export type Zaklep = "ok" | "uvozeno" | { zaklenil: string } | "brez_zaklepa";

/**
 * Zaklene uvoz izvoza za tega uporabnika (en uvoz naenkrat). `cas` = čas datoteke: če je ta ali novejša že uvožena,
 * vrne "uvozeno"; null = vsiljen uvoz (samo zaklep). Brez SQL 025 vrne "brez_zaklepa".
 */
export async function zakleniUvoz(kljuc: SyncDatotekaKljuc, cas: number | null): Promise<Zaklep> {
  const { data, error } = await getSupabase().rpc("fp_sync_zakleni", {
    p_kljuc: kljuc,
    p_tabela: TABELE_UVOZOV[kljuc],
    p_cas: cas === null ? null : new Date(cas).toISOString(),
  });
  if (error) {
    if (brez025(error.message)) return "brez_zaklepa";
    throw new Error(error.message);
  }
  const r = String(data);
  return r.startsWith("zaklenjeno")
    ? { zaklenil: r.slice("zaklenjeno:".length) || "drug uporabnik" }
    : r === "uvozeno"
      ? "uvozeno"
      : "ok";
}

/** Uvoz uspel: zapiše čas uvožene datoteke in sprosti zaklep. */
export async function koncajUvoz(kljuc: SyncDatotekaKljuc, cas: number) {
  await getSupabase().rpc("fp_sync_koncaj", { p_kljuc: kljuc, p_cas: new Date(cas).toISOString() });
}

/** Uvoz ni uspel: sprosti zaklep (drugi lahko poskusi takoj). */
export async function odkleniUvoz(kljuc: SyncDatotekaKljuc) {
  await getSupabase().rpc("fp_sync_odkleni", { p_kljuc: kljuc });
}

// ---- zadnji uvozi v bazi

/** Čas zadnjega aktivnega uvoza (ISO) za vsako datoteko; null = še ni uvoza ali tabele. */
export async function zadnjiUvozi(kljuci: SyncDatotekaKljuc[] = SYNC_KLJUCI): Promise<Record<SyncDatotekaKljuc, string | null>> {
  const sb = getSupabase();
  const vrednosti = await Promise.all(
    kljuci.map(async (k) => {
      const { data, error } = await sb
        .from(TABELE_UVOZOV[k])
        .select("created_at")
        .eq("aktiven", true)
        .eq("visible", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return error ? null : ((data?.created_at as string | undefined) ?? null);
    }),
  );
  return Object.fromEntries(kljuci.map((k, i) => [k, vrednosti[i]])) as Record<SyncDatotekaKljuc, string | null>;
}
