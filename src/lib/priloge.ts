// Priloge zapisnikov (slike, skice s table, povpraševanja / datoteke) - skupno za
// Produktivnost (gembe) in Management (auditi). Datoteke so v bucketu fp-rutina-slike,
// vsak modul v svoji mapi (prod/, aud/); vrstice v tabeli modula (visible = false ob odstranitvi).

import { getSupabase, SLIKE_BUCKET } from "./supabase";

export type PrilogaTip = "SLIKA" | "SKICA" | "POVPRASEVANJE";
export const POVP_STATUSI = ["POSLANO", "PONUDBA", "NAROCENO", "ZAVRNJENO"] as const;
export type PovpStatus = (typeof POVP_STATUSI)[number];

export type Priloga = {
  id: number;
  tip: PrilogaTip;
  storage_path: string;
  ime: string | null;
  opis: string | null;
  status: PovpStatus | null;
  velikost: number | null;
  created_at: string;
  url?: string;
  /** Slika akcije (samo auditi): akcija in faza pred / po. */
  akcija_id?: number | null;
  faza?: "PRED" | "PO" | null;
};

const TIP_V_POTI: Record<PrilogaTip, string> = { SLIKA: "slika", SKICA: "skica", POVPRASEVANJE: "povp" };

/** Vrsta datoteke po končnici (Outlook .msg brskalnik pogosto pošlje brez tipa). */
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  txt: "text/plain",
};
export const POVP_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.msg,.eml,.txt,.jpg,.jpeg,.png,.webp";
export const MAX_VELIKOST = 10 * 1024 * 1024;

export const koncnica = (ime: string) => (ime.includes(".") ? ime.split(".").pop()!.toLowerCase() : "");
export const dovoljenaDatoteka = (ime: string) => koncnica(ime) in MIME;

async function podpisaniUrlji(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await getSupabase().storage.from(SLIKE_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

async function uploadDatoteke(path: string, blob: Blob, contentType: string) {
  const { error } = await getSupabase().storage.from(SLIKE_BUCKET).upload(path, blob, { contentType, upsert: true });
  if (error) throw new Error(error.message);
}

/** Datoteke se brišejo (prostor). Napaka pri brisanju ne ustavi shranjevanja. */
async function odstraniDatoteko(path: string) {
  await getSupabase().storage.from(SLIKE_BUCKET).remove([path]);
}

/** Vsebina datoteke (npr. skica ali slika kot ozadje table, slika v PDF). */
export async function prenesiPrilogo(p: Pick<Priloga, "storage_path">): Promise<Blob> {
  const { data, error } = await getSupabase().storage.from(SLIKE_BUCKET).download(p.storage_path);
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Priloge ene tabele modula.
 * - tabela: npr. fp_prod_priloge, stolpec: tuji ključ zapisnika (gemba_id, audit_id)
 * - pot: {mapa}/{kljuc}/{kljuc}-{oznaka}-{slika|skica|povp}-{čas}.{končnica}
 */
export function virPrilog({
  tabela,
  stolpec,
  mapa,
  oznaka,
  dodatniStolpci = "",
}: {
  tabela: string;
  stolpec: string;
  mapa: string;
  oznaka: string;
  /** Dodatni stolpci tabele (npr. "akcija_id, faza"); brez njih (stara baza) se prebere osnova. */
  dodatniStolpci?: string;
}) {
  const pot = (kljuc: string, tip: PrilogaTip, ext: string) => {
    const nakljucno = Math.random().toString(36).slice(2, 6);
    return `${mapa}/${kljuc}/${kljuc}-${oznaka}-${TIP_V_POTI[tip]}-${Date.now()}${nakljucno}.${ext}`;
  };

  const OSNOVA = "id, tip, storage_path, ime, opis, status, velikost, created_at";

  /** Priloge, kjer je polje = vrednost (privzeto vse priloge zapisnika). */
  async function naloziKjer(polje: string, vrednost: number): Promise<Priloga[]> {
    const beri = (stolpci: string) =>
      getSupabase().from(tabela).select(stolpci).eq("visible", true).eq(polje, vrednost).order("created_at");
    let { data, error } = await beri(dodatniStolpci ? `${OSNOVA}, ${dodatniStolpci}` : OSNOVA);
    // 42703 = stolpec ne obstaja (migracija še ni zagnana)
    if (error && dodatniStolpci && error.code === "42703" && polje === stolpec) ({ data, error } = await beri(OSNOVA));
    if (error) throw new Error(error.message);
    const priloge = (data ?? []) as unknown as Priloga[];
    // Podpisani URL-ji samo za slike in skice (povpraševanja se prenesejo na klik).
    const urls = await podpisaniUrlji(priloge.filter((p) => p.tip !== "POVPRASEVANJE").map((p) => p.storage_path));
    return priloge.map((p) => ({ ...p, url: urls[p.storage_path] }));
  }

  const nalozi = (zapisnikId: number) => naloziKjer(stolpec, zapisnikId);

  async function dodaj(
    zapisnikId: number,
    kljuc: string,
    tip: PrilogaTip,
    blob: Blob,
    ime: string,
    opis: string | null = null,
    /** Dodatni stolpci vrstice (npr. akcija_id, faza). */
    dodatno: Record<string, unknown> = {},
  ) {
    const ext = tip === "SKICA" ? "png" : tip === "SLIKA" ? "jpg" : koncnica(ime);
    const contentType = MIME[ext] ?? blob.type;
    const path = pot(kljuc, tip, ext);
    await uploadDatoteke(path, blob, contentType);
    const { error } = await getSupabase()
      .from(tabela)
      .insert({
        [stolpec]: zapisnikId,
        tip,
        storage_path: path,
        ime,
        opis,
        status: tip === "POVPRASEVANJE" ? "POSLANO" : null,
        velikost: blob.size,
        ...dodatno,
      });
    if (error) {
      await odstraniDatoteko(path);
      throw new Error(error.message);
    }
  }

  /** Zamenjaj datoteko obstoječe priloge (npr. popravljena skica); stara datoteka se izbriše. */
  async function zamenjaj(p: Priloga, kljuc: string, blob: Blob) {
    const path = pot(kljuc, p.tip, koncnica(p.storage_path) || "png");
    await uploadDatoteke(path, blob, blob.type || "image/png");
    const { error } = await getSupabase().from(tabela).update({ storage_path: path, velikost: blob.size }).eq("id", p.id);
    if (error) {
      await odstraniDatoteko(path);
      throw new Error(error.message);
    }
    await odstraniDatoteko(p.storage_path);
  }

  async function posodobi(id: number, v: { opis?: string | null; status?: PovpStatus | null }) {
    const { error } = await getSupabase().from(tabela).update(v).eq("id", id);
    if (error) throw new Error(error.message);
  }

  /** Slika / datoteka se izbriše iz storage, vrstica ostane skrita (zgodovina). */
  async function odstrani(p: Priloga) {
    const { error } = await getSupabase().from(tabela).update({ visible: false }).eq("id", p.id);
    if (error) throw new Error(error.message);
    await odstraniDatoteko(p.storage_path);
  }

  return { nalozi, naloziKjer, dodaj, zamenjaj, posodobi, odstrani };
}

/** Priloge ene tabele modula (fp_prod_priloge, fp_aud_priloge). */
export type VirPrilog = ReturnType<typeof virPrilog>;
