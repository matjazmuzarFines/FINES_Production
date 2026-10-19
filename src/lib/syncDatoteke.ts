// Datoteke, ki jih administrativni sistem odlaga na server (skupno za strežnik in brskalnik).

export type SyncDatotekaKljuc = "nalogi" | "narocila" | "odpreme";

export const SYNC_DATOTEKE: Record<SyncDatotekaKljuc, { datoteka: string; naslov: string }> = {
  nalogi: { datoteka: "nalogi.xlsx", naslov: "Delovni nalogi" },
  narocila: { datoteka: "narocila.xlsx", naslov: "Naročila VD200" },
  odpreme: { datoteka: "odpreme.xlsx", naslov: "Odpreme VD300" },
};

export const jeSyncKljuc = (k: string): k is SyncDatotekaKljuc => k in SYNC_DATOTEKE;

/** Stanje datoteke na serverju. */
export type SyncInfo = {
  kljuc: SyncDatotekaKljuc;
  datoteka: string;
  obstaja: boolean;
  velikost: number;
  /** Čas izvoza (ISO) - lastnost Excela ModifiedDate, sicer čas spremembe datoteke. */
  spremenjena: string | null;
  napaka: string | null;
};
