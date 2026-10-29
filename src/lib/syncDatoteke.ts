// Izvozi iz ERP, ki jih worker vsakih nekaj ur shrani v mapo na serverju podjetja
// (\\rokadasrv\RISPSQL$\Dokumentacija\Izvoz_excel_dir). Brskalnik jih prebere iz mape in uvozi (stran Podatki).

export type SyncDatotekaKljuc = "nalogi" | "material" | "narocila" | "odpreme" | "prevzemi" | "izdaje";

export const SYNC_MAPA = "\\\\rokadasrv\\RISPSQL$\\Dokumentacija\\Izvoz_excel_dir";

export type SyncDatotekaOpis = {
  datoteka: string;
  naslov: string;
  /** Strani, ki uporabljajo te podatke (hover tekst in opis na strani Podatki). */
  strani: string;
};

/** Vrstni red je tudi vrstni red pri "Sync vse" (prevzemi pred izdajami - Doizdaja primerja čase). */
export const SYNC_DATOTEKE: Record<SyncDatotekaKljuc, SyncDatotekaOpis> = {
  nalogi: { datoteka: "nalogi.xlsx", naslov: "Delovni nalogi", strani: "Zasedenost, Delovni plan, Prioritete, Doizdaja" },
  material: { datoteka: "Material_pregled_planirane_porabe.xlsx", naslov: "Material (zaloge)", strani: "Prioritete, Pakiranje" },
  narocila: { datoteka: "narocila.xlsx", naslov: "Naročila VD200", strani: "Prioritete" },
  odpreme: { datoteka: "odpreme.xlsx", naslov: "Odpreme VD300", strani: "Prioritete, Pakiranje" },
  prevzemi: { datoteka: "Prevzem_dobavitelja.xlsx", naslov: "Prevzemi od dobavitelja", strani: "Doizdaja" },
  izdaje: { datoteka: "Kreiranje_izdaj_v_proizvodnjo.xlsx", naslov: "Izdaje v proizvodnjo", strani: "Doizdaja" },
};

export const SYNC_KLJUCI = Object.keys(SYNC_DATOTEKE) as SyncDatotekaKljuc[];

/** Tabela uvozov v bazi za vsako datoteko (aktiven je zadnji uvoz). */
export const TABELE_UVOZOV: Record<SyncDatotekaKljuc, string> = {
  nalogi: "fp_zas_uvozi",
  material: "spl_material_uvozi",
  narocila: "fp_pri_uvozi",
  odpreme: "fp_pri_odp_uvozi",
  prevzemi: "fp_doi_prevzemi_uvozi",
  izdaje: "fp_doi_izdaje_uvozi",
};
