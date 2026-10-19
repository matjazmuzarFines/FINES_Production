// Samo za strežnik (route handlerji v src/app/api/sync): branje izvozov iz mape na serverju podjetja.
// Deluje samo, ko strežnik Next.js teče v omrežju podjetja (lokalno), ne na Vercelu.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { SYNC_DATOTEKE, type SyncDatotekaKljuc, type SyncInfo } from "./syncDatoteke";

export const syncMapa = () => process.env.SYNC_MAPA ?? "//rokadasrv/RISPSQL$/Dokumentacija/Podatki za aplikacije";

const potDatoteke = (kljuc: SyncDatotekaKljuc) => path.join(syncMapa(), SYNC_DATOTEKE[kljuc].datoteka);

/** Podatki o datoteki na serverju; čas izvoza je iz lastnosti Excela (ModifiedDate), sicer čas zadnje spremembe datoteke. */
export async function infoDatoteke(kljuc: SyncDatotekaKljuc): Promise<SyncInfo> {
  const { datoteka } = SYNC_DATOTEKE[kljuc];
  try {
    const pot = potDatoteke(kljuc);
    const s = await stat(pot);
    let excel: string | null = null;
    try {
      const wb = XLSX.read(await readFile(pot), { type: "buffer", bookProps: true, bookSheets: true });
      const d = wb.Props?.ModifiedDate ?? wb.Props?.CreatedDate;
      if (d) excel = new Date(d).toISOString();
    } catch {
      // Lastnosti ni mogoče prebrati - uporabi čas datoteke
    }
    return { kljuc, datoteka, obstaja: true, velikost: s.size, spremenjena: excel ?? s.mtime.toISOString(), napaka: null };
  } catch (e) {
    const koda = (e as NodeJS.ErrnoException).code;
    return {
      kljuc,
      datoteka,
      obstaja: false,
      velikost: 0,
      spremenjena: null,
      napaka: koda === "ENOENT" ? "Datoteke ni na serverju" : `Server ni dosegljiv (${koda ?? (e as Error).message})`,
    };
  }
}

export const preberiDatoteko = (kljuc: SyncDatotekaKljuc) => readFile(potDatoteke(kljuc));

/** Dostop samo s prijavo (Supabase žeton v glavi Authorization) - strežnik je dosegljiv v omrežju. */
export async function preveriPrijavo(req: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return true; // brez Supabase aplikacija ni zaklenjena (kot AppShell)
  const zeton = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!zeton) return false;
  const { data, error } = await createClient(url, key).auth.getUser(zeton);
  return !error && !!data.user;
}
