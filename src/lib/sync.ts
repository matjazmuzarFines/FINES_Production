// Sinhronizacija izvozov s serverja podjetja (brskalnik).
// Strežnik (/api/sync) prebere datoteke iz mape na serverju, brskalnik jih uvozi z istimi funkcijami
// kot ročni uvoz (povleci in spusti). Datoteka je sinhronizirana, če je zadnji uvoz v bazi
// narejen po času izvoza datoteke (lastnost Excela ModifiedDate).
import { getSupabase, supabaseConfigured } from "./supabase";
import { SYNC_DATOTEKE, type SyncDatotekaKljuc, type SyncInfo } from "./syncDatoteke";
import { preberiVd200Xlsx, preberiVd300Xlsx, shraniOdpUvoz, shraniPriUvoz } from "./prioritete";
import { preberiNalogeXlsx, shraniUvoz } from "./zasedenost";

export type SyncStanje = "sinhronizirano" | "ni_sinhronizirano" | "napaka";

export type SyncDatoteka = SyncInfo & {
  naslov: string;
  /** Zadnji aktivni uvoz v bazi (ISO) ali null. */
  uvozeno: string | null;
  stanje: SyncStanje;
};

/** Tabela uvozov v bazi za vsako datoteko. */
const UVOZI: Record<SyncDatotekaKljuc, string> = {
  nalogi: "fp_zas_uvozi",
  narocila: "fp_pri_uvozi",
  odpreme: "fp_pri_odp_uvozi",
};

/** Uvoz datoteke v bazo (isto kot ročni uvoz) - vrne opis rezultata. */
const UVOZ: Record<SyncDatotekaKljuc, (f: File) => Promise<string>> = {
  nalogi: async (f) => {
    const { nalogi, opozorila } = await preberiNalogeXlsx(f);
    await shraniUvoz(f.name, nalogi);
    return `${nalogi.length} nalogov${opozorila.length ? `, ${opozorila.length} opozoril` : ""}`;
  },
  narocila: async (f) => {
    const { postavke, opozorila } = await preberiVd200Xlsx(f);
    await shraniPriUvoz(f.name, postavke);
    return `${postavke.length} postavk${opozorila.length ? `, ${opozorila.length} opozoril` : ""}`;
  },
  odpreme: async (f) => {
    const { odpreme, opozorila } = await preberiVd300Xlsx(f);
    await shraniOdpUvoz(f.name, odpreme);
    return `${odpreme.length} postavk${opozorila.length ? `, ${opozorila.length} opozoril` : ""}`;
  },
};

async function glave(): Promise<HeadersInit> {
  if (!supabaseConfigured) return {};
  const { data } = await getSupabase().auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function zadnjiUvoz(kljuc: SyncDatotekaKljuc): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from(UVOZI[kljuc])
    .select("created_at")
    .eq("aktiven", true)
    .eq("visible", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.created_at ?? null;
}

/** Stanje datotek: server (čas izvoza) proti zadnjemu uvozu v bazi. */
export async function preveriSync(kljuci: SyncDatotekaKljuc[]): Promise<SyncDatoteka[]> {
  const res = await fetch(`/api/sync?datoteke=${kljuci.join(",")}`, { headers: await glave(), cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 401 ? "Ni prijave - prijavi se znova." : `Server za sync ni dosegljiv (${res.status}).`);
  const { datoteke } = (await res.json()) as { datoteke: SyncInfo[] };
  const uvozi = await Promise.all(datoteke.map((d) => zadnjiUvoz(d.kljuc)));
  return datoteke.map((d, i) => ({
    ...d,
    naslov: SYNC_DATOTEKE[d.kljuc].naslov,
    uvozeno: uvozi[i],
    // Supabase vrne "…+00:00", strežnik "…Z" - primerjaj čase, ne besedila
    stanje:
      d.napaka || !d.spremenjena
        ? "napaka"
        : uvozi[i] && Date.parse(uvozi[i]!) >= Date.parse(d.spremenjena)
          ? "sinhronizirano"
          : "ni_sinhronizirano",
  }));
}

/** Prenese datoteko s serverja in jo uvozi v bazo. */
export async function sinhroniziraj(kljuc: SyncDatotekaKljuc): Promise<string> {
  const res = await fetch(`/api/sync/${kljuc}`, { headers: await glave(), cache: "no-store" });
  if (!res.ok) {
    const napaka = await res.json().catch(() => null);
    throw new Error(napaka?.napaka ?? `Prenos ni uspel (${res.status}).`);
  }
  const f = new File([await res.blob()], SYNC_DATOTEKE[kljuc].datoteka);
  return UVOZ[kljuc](f);
}
