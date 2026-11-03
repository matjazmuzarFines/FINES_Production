import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { preberiIdenteXlsx, preberiKosovniceXlsx } from "@/lib/kosovniceUvoz";
import { zgradiDrevo, type Ident, type KosovnicaVrstica } from "@/lib/kosovnice";

export const runtime = "nodejs";
type Predogled = { cas: string; identi: Ident[]; po: Map<string, KosovnicaVrstica[]>; opozorila: string[] };
let cache: Predogled | null = null;
let nalaganje: Promise<Predogled> | null = null;
async function podatki(): Promise<Predogled> {
  const mapa = path.join(process.cwd(), "data");
  const datoteki = ["Identi.xlsx", "Kosovnice.xlsx"];
  const cas = (await Promise.all(datoteki.map(f => stat(path.join(mapa, f))))).map(s => s.mtimeMs).join(";");
  if (cache?.cas === cas) return cache;
  if (nalaganje) return nalaganje;
  nalaganje = (async () => {
    const files = await Promise.all(datoteki.map(async f => new File([new Uint8Array(await readFile(path.join(mapa, f)))], f)));
    const i = await preberiIdenteXlsx(files[0]), k = await preberiKosovniceXlsx(files[1]);
    const po = new Map<string, KosovnicaVrstica[]>();
    const skupine = new Map<string, KosovnicaVrstica[]>();
    for (const r of k.vrstice) { const v = skupine.get(r.izdelek) ?? []; v.push(r); skupine.set(r.izdelek, v); }
    for (const v of skupine.values()) po.set(v[0].sifra, v);
    cache = { cas, identi: i.identi.map(v => ({ sifra: String(v.sifra), risp_sifra: v.risp_sifra as string | null, naziv: v.naziv as string | null, klasifikat: v.klasifikat as string | null, klasifikacija: v.klasifikacija as string | null, status: v.status as string | null, neaktiven: v.neaktiven as boolean | null, em: v.em as string | null })), po, opozorila: [...i.opozorila, ...k.opozorila] };
    return cache;
  })();
  try { return await nalaganje; } finally { nalaganje = null; }
}

/** Izrecno vključen lokalni predogled; samo branje, vedno zahteva prijavo. */
export async function GET(req: Request) {
  if (process.env.KOSOVNICE_LOKALNI_PREDOGLED !== "1") return Response.json({ napaka: "Lokalni predogled ni omogočen na tem strežniku." }, { status: 404 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !key || !token) return Response.json({ napaka: "Ni prijave." }, { status: 401 });
  const { data, error } = await createClient(url, key).auth.getUser(token);
  if (error || !data.user) return Response.json({ napaka: "Ni veljavne prijave." }, { status: 401 });
  try {
    const p = await podatki();
    const sifra = new URL(req.url).searchParams.get("sifra");
    return Response.json(sifra ? { drevo: p.po.has(sifra) ? zgradiDrevo(p.po.get(sifra)!) : null } : { identi: p.identi, opozorila: p.opozorila }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ napaka: `Lokalnega izvoza ni mogoče prebrati: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
