"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SYNC_DATOTEKE, SYNC_KLJUCI, type SyncDatotekaKljuc } from "@/lib/syncDatoteke";
import {
  datotekaIzMape,
  infoDatotek,
  izberiDatotekeIzMape,
  izberiMapo,
  koncajUvoz,
  mapaPodprta,
  odkleniUvoz,
  razporediDatoteke,
  stanjeMape,
  uvozeniIzvozi,
  zadnjiUvozi,
  zakleniUvoz,
  type DatotekaVMapi,
  type StanjeMape,
} from "@/lib/syncMapa";
import { useToast } from "./ui/Toast";

/** Pregled stanja vseh datotek in samodejni sync (če je vklopljen v tem brskalniku). */
const PREVERI_MS = 5 * 60 * 1000;
const SAMODEJNO_KLJUC = "sync-samodejno";
/** Firefox: zadnja izbira mape (čas datotek) velja še 30 min po osvežitvi strani. */
const IZBRANE_KLJUC = "sync-izbrane";
const IZBRANE_VELJA_MS = 30 * 60 * 1000;

export type StanjeDatoteke =
  | "sinhronizirano" // zadnji uvoz je novejši od datoteke v mapi
  | "novo" // v mapi je novejša datoteka
  | "ni_datoteke" // datoteke ni v mapi
  | "neznano" // mapa ni povezana ali ni dovoljenja - znan je samo zadnji uvoz
  | "uvazam"
  | "napaka";

export type SyncDatoteka = {
  kljuc: SyncDatotekaKljuc;
  naslov: string;
  datoteka: string;
  strani: string;
  /** Čas spremembe datoteke v mapi (ms) ali null. */
  naServerju: number | null;
  velikost: number | null;
  /** Zadnji aktivni uvoz v bazi (ISO) ali null. */
  uvozeno: string | null;
  /** Čas datoteke, ki je bila nazadnje uvožena (ms) - s tem se primerja čas datoteke v mapi. */
  uvozenIzvoz: number | null;
  stanje: StanjeDatoteke;
  /** Rezultat zadnjega synca v tej seji. */
  rezultat: { ok: boolean; opis: string; opozorila: string[]; cas: Date } | null;
};

export type SkupnoStanje = "sinhronizirano" | "v_teku" | "ni_sinhronizirano" | "neznano";

type SyncApi = {
  mapa: StanjeMape;
  datoteke: SyncDatoteka[];
  skupno: SkupnoStanje;
  delam: boolean;
  /** Kdaj so bili nazadnje prebrani časi datotek v mapi (ms) ali null. */
  preverjeno: number | null;
  /** V bazi ni tabele / funkcij za zaklep (SQL 025). */
  brezZaklepa: boolean;
  /** Poveča se po vsakem uvozu - strani ob spremembi znova naložijo podatke. */
  verzija: number;
  samodejno: boolean;
  setSamodejno: (v: boolean) => void;
  poveziMapo: () => Promise<void>;
  /** Uvozi vse datoteke, ki so v mapi novejše od zadnjega uvoza. */
  syncVse: () => Promise<void>;
  /** Uvozi eno datoteko iz mape (tudi, če je že uvožena). */
  syncEna: (k: SyncDatotekaKljuc) => Promise<void>;
  /** Uvozi datoteko, izbrano ročno (povleci in spusti). */
  uvoziRocno: (k: SyncDatotekaKljuc, f: File) => Promise<void>;
  /** Uvozi skupino datotek: razvrsti jih po imenu, neznane prezre, že uvožene preskoči. */
  uvoziVec: (files: File[]) => Promise<void>;
  preveri: () => Promise<void>;
};

const Kontekst = createContext<SyncApi | null>(null);

export function useSync(): SyncApi {
  const api = useContext(Kontekst);
  if (!api) throw new Error("useSync mora biti znotraj SyncProvider");
  return api;
}

/** Pokliče `fn` po vsakem uvozu (glava, stran Podatki, samodejni sync) - stran znova naloži podatke. */
export function usePoSyncu(fn: () => void) {
  const { verzija } = useSync();
  const ref = useRef(fn);
  const prejsnja = useRef(verzija);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (verzija === prejsnja.current) return;
    prejsnja.current = verzija;
    ref.current();
  }, [verzija]);
}

type Izbrane = { preverjeno: number; datoteke: Record<SyncDatotekaKljuc, DatotekaVMapi> };

function preberiIzbrane(): Izbrane | null {
  try {
    const x = JSON.parse(localStorage.getItem(IZBRANE_KLJUC) ?? "null") as Izbrane | null;
    return x && Date.now() - x.preverjeno < IZBRANE_VELJA_MS ? x : null;
  } catch {
    return null;
  }
}

function preberiSamodejno() {
  try {
    return localStorage.getItem(SAMODEJNO_KLJUC) === "1";
  } catch {
    return false;
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [mapa, setMapa] = useState<StanjeMape>(() => ({ podprto: mapaPodprta(), ime: null, dovoljenje: null }));
  const [uvozi, setUvozi] = useState<Partial<Record<SyncDatotekaKljuc, string | null>>>({});
  const [vMapi, setVMapi] = useState<Record<SyncDatotekaKljuc, DatotekaVMapi> | null>(null);
  // Brskalnik brez povezane mape (Firefox): čas datotek je znan iz zadnje izbire mape
  const [izbrane, setIzbrane] = useState<Izbrane | null>(preberiIzbrane);
  const [izvozi, setIzvozi] = useState<Partial<Record<SyncDatotekaKljuc, number>>>({});
  const [brezZaklepa, setBrezZaklepa] = useState(false);
  const [preverjenaMapa, setPreverjenaMapa] = useState<number | null>(null);
  const [uvazam, setUvazam] = useState<SyncDatotekaKljuc | null>(null);
  const [rezultati, setRezultati] = useState<Partial<Record<SyncDatotekaKljuc, SyncDatoteka["rezultat"]>>>({});
  const [verzija, setVerzija] = useState(0);
  // Prikaz po prijavi (glava se izriše samo v brskalniku) - branje localStorage ob inicializaciji je varno
  const [samodejno, setSamodejnoStanje] = useState(preberiSamodejno);
  const delam = useRef(false);

  // Drugi zavihki / okna istega brskalnika (npr. zaslon v skladišču na drugem monitorju) izvejo za uvoz takoj
  const kanal = useRef<BroadcastChannel | null>(null);
  const poUvozu = useCallback(() => {
    setVerzija((v) => v + 1);
    kanal.current?.postMessage("uvoz");
  }, []);

  const preveri = useCallback(async (vprasaj = false) => {
    const [u, iz, m] = await Promise.all([zadnjiUvozi(), uvozeniIzvozi(), stanjeMape()]);
    setUvozi(u);
    setIzvozi(iz ?? {});
    setBrezZaklepa(iz === null);
    setMapa(m);
    const info = m.ime ? await infoDatotek(vprasaj) : null;
    setVMapi(info);
    if (info) setPreverjenaMapa(Date.now());
  }, []);

  const zapisi = (k: SyncDatotekaKljuc, r: SyncDatoteka["rezultat"]) => setRezultati((x) => ({ ...x, [k]: r }));

  /**
   * Uvoz ene datoteke. Zaklep v bazi (SQL 025) zagotovi, da isti izvoz uvaža samo en uporabnik naenkrat in da se
   * datoteka, ki je že uvožena (ali novejša), ne uvozi znova. Brez SQL 025 samo preverjanje časa zadnjega uvoza.
   */
  const uvozi1 = useCallback(
    async (
      k: SyncDatotekaKljuc,
      f: File,
      samoNovo: boolean,
    ): Promise<"uvozeno" | "preskoceno" | "napaka" | { zaklenil: string }> => {
      let zaklep: Awaited<ReturnType<typeof zakleniUvoz>>;
      try {
        zaklep = await zakleniUvoz(k, samoNovo ? f.lastModified : null);
      } catch (e) {
        zapisi(k, { ok: false, opis: (e as Error).message, opozorila: [], cas: new Date() });
        return "napaka";
      }
      if (zaklep === "uvozeno") return "preskoceno";
      if (typeof zaklep === "object") return zaklep;
      if (zaklep === "brez_zaklepa" && samoNovo) {
        const zadnji = (await zadnjiUvozi([k]))[k];
        if (zadnji && Date.parse(zadnji) >= f.lastModified) return "preskoceno";
      }
      setUvazam(k);
      try {
        const { uvoziDatoteko } = await import("@/lib/sync");
        const r = await uvoziDatoteko(k, f);
        if (zaklep === "ok") await koncajUvoz(k, f.lastModified).catch(() => {});
        zapisi(k, { ok: true, opis: r.opis, opozorila: r.opozorila, cas: new Date() });
        return "uvozeno";
      } catch (e) {
        if (zaklep === "ok") await odkleniUvoz(k).catch(() => {});
        zapisi(k, { ok: false, opis: (e as Error).message, opozorila: [], cas: new Date() });
        return "napaka";
      } finally {
        setUvazam(null);
      }
    },
    [],
  );

  /**
   * Uvoz iz vira po vrstnem redu `kljuci`. Vir vrne datoteko, null (datoteke ni) ali "ni_dovoljenja".
   * `manjka`: ali je manjkajoča datoteka napaka (sync iz mape) ali se samo preskoči (skupina povlečenih datotek).
   */
  const izvediZ = useCallback(
    async (
      kljuci: SyncDatotekaKljuc[],
      vir: (k: SyncDatotekaKljuc) => Promise<File | null | "ni_dovoljenja">,
      {
        samoNovo,
        glasno,
        manjka,
        dodatek = "",
      }: { samoNovo: boolean; glasno: boolean; manjka: "napaka" | "prezri"; dodatek?: string },
    ) => {
      if (delam.current) return;
      delam.current = true;
      let uvozenih = 0;
      let napak = 0;
      let preskocenih = 0;
      const drugi: string[] = [];
      try {
        for (const k of kljuci) {
          let f: File | null | "ni_dovoljenja";
          try {
            f = await vir(k);
          } catch (e) {
            zapisi(k, { ok: false, opis: (e as Error).message, opozorila: [], cas: new Date() });
            napak++;
            continue;
          }
          if (f === "ni_dovoljenja") {
            if (glasno) notify("error", "Ni dovoljenja za branje mape - klikni Poveži mapo.", 8000);
            return;
          }
          if (!f) {
            if (manjka === "napaka") {
              zapisi(k, {
                ok: false,
                opis: `Datoteke ${SYNC_DATOTEKE[k].datoteka} ni v izbrani mapi.`,
                opozorila: [],
                cas: new Date(),
              });
              napak++;
            }
            continue;
          }
          const izid = await uvozi1(k, f, samoNovo);
          if (izid === "uvozeno") uvozenih++;
          else if (izid === "napaka") napak++;
          else if (izid === "preskoceno") preskocenih++;
          else drugi.push(`${SYNC_DATOTEKE[k].naslov} (${izid.zaklenil})`);
        }
      } finally {
        delam.current = false;
        await preveri().catch(() => {});
        if (uvozenih) poUvozu();
      }
      if (glasno) {
        const deli = [
          uvozenih ? `uvoženih ${uvozenih}` : "",
          preskocenih ? `že uvoženih ${preskocenih}` : "",
          napak ? `napak ${napak}` : "",
          drugi.length ? `ravnokar uvaža drug uporabnik: ${drugi.join(", ")}` : "",
        ].filter(Boolean);
        const besedilo = uvozenih || napak || drugi.length ? `Sync: ${deli.join(", ")}.` : "Vse datoteke so že sinhronizirane.";
        notify(napak ? "error" : "success", `${besedilo}${dodatek}`, napak || dodatek ? 10000 : 5000);
      }
    },
    [notify, preveri, uvozi1, poUvozu],
  );

  /** Sync iz povezane mape (Edge, Chrome). `vprasaj` = ob kliku (brskalnik lahko vpraša za dovoljenje). */
  const izvedi = useCallback(
    (kljuci: SyncDatotekaKljuc[], { samoNovo, vprasaj }: { samoNovo: boolean; vprasaj: boolean }) =>
      izvediZ(kljuci, async (k) => (await datotekaIzMape(k, vprasaj)) ?? "ni_dovoljenja", {
        samoNovo,
        glasno: vprasaj,
        manjka: "napaka",
      }),
    [izvediZ],
  );

  /** Brskalnik brez povezane mape (Firefox): ob vsakem syncu uporabnik izbere mapo z izvozi. */
  const izIzbraneMape = useCallback(
    async (kljuci: SyncDatotekaKljuc[], samoNovo: boolean) => {
      const files = await izberiDatotekeIzMape(); // okno se mora odpreti takoj ob kliku (brez await prej)
      if (files.length === 0) return;
      const { po } = razporediDatoteke(files);
      const nove: Izbrane = {
        preverjeno: Date.now(),
        datoteke: Object.fromEntries(
          SYNC_KLJUCI.map((k) => {
            const f = po.get(k);
            return [k, f ? { naServerju: f.lastModified, velikost: f.size } : null];
          }),
        ) as Record<SyncDatotekaKljuc, DatotekaVMapi>,
      };
      setIzbrane(nove);
      try {
        localStorage.setItem(IZBRANE_KLJUC, JSON.stringify(nove));
      } catch {
        // brez shrambe velja do osvežitve
      }
      await izvediZ(kljuci, async (k) => po.get(k) ?? null, { samoNovo, glasno: true, manjka: "napaka" });
    },
    [izvediZ],
  );

  const syncVse = useCallback(
    () => (mapaPodprta() ? izvedi(SYNC_KLJUCI, { samoNovo: true, vprasaj: true }) : izIzbraneMape(SYNC_KLJUCI, true)),
    [izvedi, izIzbraneMape],
  );
  const syncEna = useCallback(
    (k: SyncDatotekaKljuc) => (mapaPodprta() ? izvedi([k], { samoNovo: false, vprasaj: true }) : izIzbraneMape([k], false)),
    [izvedi, izIzbraneMape],
  );

  const uvoziVec = useCallback(
    async (files: File[]) => {
      const { po, neznane } = razporediDatoteke(files);
      const prezrte = neznane.length ? ` Prezrte (niso na seznamu): ${neznane.join(", ")}.` : "";
      if (po.size === 0) {
        notify("error", `Nobena datoteka ni prepoznana.${prezrte}`, 10000);
        return;
      }
      await izvediZ(
        SYNC_KLJUCI.filter((k) => po.has(k)),
        async (k) => po.get(k) ?? null,
        { samoNovo: true, glasno: true, manjka: "prezri", dodatek: prezrte },
      );
    },
    [izvediZ, notify],
  );

  const uvoziRocno = useCallback(
    async (k: SyncDatotekaKljuc, f: File) => {
      if (delam.current) return;
      delam.current = true;
      try {
        const izid = await uvozi1(k, f, false);
        if (izid === "uvozeno") {
          poUvozu();
          notify("success", `Uvoženo: ${SYNC_DATOTEKE[k].naslov}.`);
        } else if (typeof izid === "object")
          notify("warning", `${SYNC_DATOTEKE[k].naslov} ravnokar uvaža ${izid.zaklenil} - poskusi čez minuto.`, 8000);
        else notify("error", `Uvoz ni uspel: ${SYNC_DATOTEKE[k].naslov} - glej stran Podatki.`, 10000);
      } finally {
        delam.current = false;
        await preveri().catch(() => {});
      }
    },
    [notify, preveri, uvozi1, poUvozu],
  );

  const poveziMapo = useCallback(async () => {
    try {
      const ime = await izberiMapo();
      if (ime) {
        notify("success", `Povezana mapa: ${ime}.`);
        await preveri(true);
      }
    } catch (e) {
      notify("error", `Mape ni mogoče povezati: ${(e as Error).message}`, 10000);
    }
  }, [notify, preveri]);

  const setSamodejno = useCallback((v: boolean) => {
    setSamodejnoStanje(v);
    try {
      localStorage.setItem(SAMODEJNO_KLJUC, v ? "1" : "0");
    } catch {
      // brez shrambe velja do osvežitve
    }
  }, []);

  // Uvoz v drugem zavihku / oknu: strani tukaj znova naložijo podatke, stanje synca se osveži
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const k = new BroadcastChannel("fines-sync");
    k.onmessage = () => {
      setVerzija((v) => v + 1);
      preveri().catch(() => {});
    };
    kanal.current = k;
    return () => {
      k.close();
      kanal.current = null;
    };
  }, [preveri]);

  // Preverjanje ob prihodu in vsakih 5 minut; samodejni sync samo z že danim dovoljenjem (brez vprašanja)
  useEffect(() => {
    const krog = () => {
      preveri()
        .then(() => (samodejno ? izvedi(SYNC_KLJUCI, { samoNovo: true, vprasaj: false }) : undefined))
        .catch(() => {});
    };
    krog();
    const t = setInterval(krog, PREVERI_MS);
    return () => clearInterval(t);
  }, [preveri, izvedi, samodejno]);

  const datoteke = useMemo<SyncDatoteka[]>(
    () =>
      SYNC_KLJUCI.map((k) => {
        const znane = vMapi ?? izbrane?.datoteke;
        const f = znane?.[k];
        const uvozeno = uvozi[k] ?? null;
        // Čas uvožene datoteke (SQL 025), sicer čas uvoza (uvozi pred SQL 025 / brez nje)
        const uvozenIzvoz = izvozi[k] ?? null;
        const primerjava = uvozenIzvoz ?? (uvozeno ? Date.parse(uvozeno) : null);
        const rezultat = rezultati[k] ?? null;
        const stanje: StanjeDatoteke =
          uvazam === k
            ? "uvazam"
            : rezultat && !rezultat.ok
              ? "napaka"
              : f === undefined
                ? "neznano"
                : f === null
                  ? "ni_datoteke"
                  : primerjava !== null && primerjava >= f.naServerju
                    ? "sinhronizirano"
                    : "novo";
        return {
          kljuc: k,
          ...SYNC_DATOTEKE[k],
          naServerju: f?.naServerju ?? null,
          velikost: f?.velikost ?? null,
          uvozeno,
          uvozenIzvoz,
          stanje,
          rezultat,
        };
      }),
    [vMapi, izbrane, uvozi, izvozi, rezultati, uvazam],
  );

  const skupno: SkupnoStanje = uvazam
    ? "v_teku"
    : datoteke.some((d) => d.stanje === "novo" || d.stanje === "napaka" || d.stanje === "ni_datoteke")
      ? "ni_sinhronizirano"
      : datoteke.every((d) => d.stanje === "sinhronizirano")
        ? "sinhronizirano"
        : "neznano";

  const api: SyncApi = {
    mapa,
    datoteke,
    skupno,
    delam: uvazam !== null,
    brezZaklepa,
    preverjeno: vMapi ? preverjenaMapa : (izbrane?.preverjeno ?? null),
    verzija,
    samodejno,
    setSamodejno,
    poveziMapo,
    syncVse,
    syncEna,
    uvoziRocno,
    uvoziVec,
    preveri: () => preveri(),
  };
  return <Kontekst.Provider value={api}>{children}</Kontekst.Provider>;
}
