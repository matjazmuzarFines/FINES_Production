// Uvoz izvoza iz ERP v bazo - iste funkcije za sync iz mape na serverju in ročni uvoz (stran Podatki).
// Modul uvozi vse bralnike Excela (knjižnica xlsx), zato ga glava aplikacije naloži šele ob syncu.
import { preberiIzdajeXlsx, preberiPrevzemeXlsx, shraniIzdajeUvoz, shraniPrevzemeUvoz } from "./doizdaja";
import { preberiMaterialXlsx, shraniMaterialUvoz } from "./material";
import type { SyncDatotekaKljuc } from "./syncDatoteke";
import { preberiVd200Xlsx, preberiVd300Xlsx, shraniOdpUvoz, shraniPriUvoz } from "./prioritete";
import { preberiNalogeXlsx, shraniUvoz } from "./zasedenost";

export type RezultatUvoza = { opis: string; opozorila: string[] };

const UVOZ: Record<SyncDatotekaKljuc, (f: File) => Promise<RezultatUvoza>> = {
  nalogi: async (f) => {
    const { nalogi, opozorila } = await preberiNalogeXlsx(f);
    await shraniUvoz(f.name, nalogi);
    return { opis: `${nalogi.length} nalogov`, opozorila };
  },
  material: async (f) => {
    const { material, opozorila } = await preberiMaterialXlsx(f);
    await shraniMaterialUvoz(f.name, material);
    return { opis: `${material.length} artiklov`, opozorila };
  },
  narocila: async (f) => {
    const { postavke, opozorila } = await preberiVd200Xlsx(f);
    await shraniPriUvoz(f.name, postavke);
    return { opis: `${postavke.length} postavk naročil`, opozorila };
  },
  odpreme: async (f) => {
    const { odpreme, opozorila, izlocenih } = await preberiVd300Xlsx(f);
    await shraniOdpUvoz(f.name, odpreme);
    return { opis: `${odpreme.length} postavk odprem (izločenih ${izlocenih} starih)`, opozorila };
  },
  prevzemi: async (f) => {
    const p = await preberiPrevzemeXlsx(f);
    await shraniPrevzemeUvoz(f.name, p);
    return { opis: `${p.prevzemi.length} postavk prevzemov`, opozorila: p.opozorila };
  },
  izdaje: async (f) => {
    const p = await preberiIzdajeXlsx(f);
    await shraniIzdajeUvoz(f.name, p);
    return { opis: `${p.vrstice.length} vrstic, ${p.nalogov} aktivnih nalogov`, opozorila: p.opozorila };
  },
};

/** Prebere izvoz in ga shrani kot nov aktiven uvoz. */
export const uvoziDatoteko = (kljuc: SyncDatotekaKljuc, f: File) => UVOZ[kljuc](f);
