// Zgodovina verzij - prikazana v "i" popupu (desni zgornji kot).
// Pravilo: male spremembe 1.01 -> 1.02, večje spremembe / nova funkcija / podstran -> 2.01.

export type ChangelogEntry = {
  verzija: string;
  datum: string;
  spremembe: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    verzija: "1.01",
    datum: "05. 10. 2026",
    spremembe: [
      "Nov projekt Fines - Production (Next.js + Supabase, Vercel).",
      "Domača stran in leva navigacija: Proizvodnja in Skladišče s podzavihki.",
      "Rutina proizvodnje prenesena iz Power Appa (delovna mesta, ocene, komentar, fotografije, odstopanja).",
      "Rutina skladišča prenesena iz Power Appa (kontrolne točke DA/NE in procent, časovne izgube, fotografija).",
      "Mesečni koledar s statusom rutine (OK / odstopanje / neizpolnjeno).",
      "Zavihka Zasedenost in Prioritete pripravljena (v izdelavi).",
      "SQL shema s predpono fp_, brez brisanja podatkov (visible).",
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].verzija;
