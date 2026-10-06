// Zgodovina verzij - prikazana v "i" popupu (desni zgornji kot).
// Pravilo: male spremembe 1.01 -> 1.02, večje spremembe / nova funkcija / podstran -> 2.01.

export type ChangelogEntry = {
  verzija: string;
  datum: string;
  spremembe: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    verzija: "4.01",
    datum: "06. 10. 2026",
    spremembe: [
      "Zasedenost v levem meniju se razpre v podmeni: Pregled zasedenosti (dosedanja stran) in Delovni plan.",
      "Nova podstran Delovni plan: ločen pogled za proizvodnjo, montažo, elektro in testiranje (vsak oddelek svoja delovna mesta iz rutine).",
      "Seznam krovnih nalogov iz zadnjega uvoza: število nalogov, potrebne ure oddelka po normativih, rok, nerazporejene ure.",
      "Krovni nalog povlečeš (ali klikneš in izbereš dan) na delovno mesto - plan se raztegne čez toliko dni, kolikor je delovnih ur.",
      "Število zaposlenih na delovnem mestu za vsak dan (privzeto po delovnem mestu); kapaciteta = zaposleni × ure na dan.",
      "Zasedenost po dnevih za vsako delovno mesto in oddelek skupaj; opozorilo, če plan konča po roku izdelave.",
      "Urejanje postavitve (delovno mesto, začetek, ure, opomba), premik z vlečenjem, odstranitev in izvoz plana v Excel.",
      "SQL 004: fp_plan_postavitve, fp_plan_zaposleni in privzeto število zaposlenih na delovnem mestu.",
    ],
  },
  {
    verzija: "3.04",
    datum: "06. 10. 2026",
    spremembe: [
      "Zasedenost: v tabeli nalogov gumbi Proizvodnja, Montaža, Elektro, Testiranje za filter po oddelkih (normativ > 0).",
      "Nalogi brez normativa so ne glede na filter vedno prikazani (z opozorilom).",
    ],
  },
  {
    verzija: "3.03",
    datum: "06. 10. 2026",
    spremembe: [
      "Normativi: gumb Spremeni normative za več izbranih hkrati (prazno polje = ne spremeni).",
      "Pravilo: skupni normativ je vedno enak vsoti oddelkov (sprememba oddelka preračuna skupni, sprememba skupnega sorazmerno razdeli oddelke).",
      "Enkraten popravek 148 normativov, kjer so se deleži družine sešteli v 101 % (SQL 003) in pravilo v bazi.",
      "CSV uvoz upošteva isto pravilo; normativ_skupni ni več obvezen stolpec.",
    ],
  },
  {
    verzija: "3.02",
    datum: "06. 10. 2026",
    spremembe: [
      "Zasedenost: klik na kodo brez normativa odpre Normative z novo vrstico (ident in naziv že vpisana).",
      "Normativi: med vpisom družine in velikosti novega normativa se tabela sproti filtrira na primerljive normative.",
      "Prikaz povprečja primerljivih normativov (skupni, P, M, E, T) in gumb Nazaj na zasedenost.",
    ],
  },
  {
    verzija: "3.01",
    datum: "05. 10. 2026",
    spremembe: [
      "Nov zavihek Zasedenost: pregled po delovnih tednih (pon–ned) za proizvodnjo, montažo, elektro in testiranje.",
      "Uvoz nalogov z drag & drop (.xlsx izvoz delovnih nalogov); prikazan je zadnji uvoz.",
      "Število zaposlenih in delovni dnevi se vnašajo za vsak teden posebej; privzete vrednosti po oddelkih.",
      "Tabela nalogov izbranega tedna z iskanjem in izvozom v Excel; opozorilo za naloge brez normativa.",
      "Nov zavihek Normativi: urejevalna tabela s filtri (ident, naziv, družina - večkratni izbor, velikost, barvanje).",
      "Multiselect z izbiro vseh, skrivanje normativov, izvoz in CSV uvoz z navodili (gumb i).",
      "Splošne tabele normativov spl_normativi in spl_druzine (za uporabo v vseh projektih).",
    ],
  },
  {
    verzija: "2.01",
    datum: "05. 10. 2026",
    spremembe: [
      "Rutina: zavihek prikaže samo mesečni koledar z navigacijo (mesec nazaj/naprej, Danes).",
      "Klik na dan odpre novo podstran z rutino izbranega dne; gumb Koledar/Nazaj vrne na koledar istega meseca.",
      "Današnji dan je na koledarju obarvan modro (pika v kotu prikazuje status).",
      "Opozorilo pred odhodom s strani, če obstajajo neshranjene spremembe.",
      "Odstranjeni testni ključi iz .env.example.",
    ],
  },
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
