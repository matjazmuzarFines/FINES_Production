// Zgodovina verzij - prikazana v "i" popupu (desni zgornji kot).
// Pravilo: male spremembe 1.01 -> 1.02, večje spremembe / nova funkcija / podstran -> 2.01.

export type ChangelogEntry = {
  verzija: string;
  datum: string;
  spremembe: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    verzija: "8.01",
    datum: "09. 10. 2026",
    spremembe: [
      "Prioritete: nov uvoz Odpreme VD300 (tretje polje za uvoz). Postavka naročila, za katero je v VD300 izdana dobavnica, dobi status V odpremi in ne porabi zaloge matičnega skladišča (oprema je že vzeta z zaloge).",
      "Status naročila VD200 \"V odpremi\" se ne upošteva več - tako naročilo je še odprto in se pokriva normalno (zaloga, nalogi).",
      "Pokritje pokaže \"v odpremi\" s številko dobavnice; pogled po artiklih ima stolpec V odpremi; TXT sporočilo izpiše \"v odpremi\".",
      "Ob uvozu VD300 opozorilo za postavke s statusom Pripravljena odprema / Priprava blaga brez dobavnice (štejejo se še na zalogi).",
    ],
  },
  {
    verzija: "7.03",
    datum: "09. 10. 2026",
    spremembe: [
      "Prioritete: nov status V odpremi (naročila s statusom VD200-V odpremi) - enakovreden Na zalogi, privzeto skrit; prikažeš ga s klikom na kartico.",
      "Oznaka V odpremi pri naročilu je zelena (kot status).",
    ],
  },
  {
    verzija: "7.02",
    datum: "09. 10. 2026",
    spremembe: [
      "Vodja operacij: 3 grafi (Proizvodnja, Skladišče, Tehnologija + razvoj) namesto 8; podrobna področja so zdaj cilji pod grafom (npr. Organizacija: jasne prioritete, ...).",
      "Change management: manjši grafi in kartice - 3 v vrsti na monitorju (2 na tablici, 1 na telefonu).",
      "Cilji pod grafom v enem stolpcu, pričakovanja se pokažejo samo, če so vpisana.",
    ],
  },
  {
    verzija: "7.01",
    datum: "09. 10. 2026",
    spremembe: [
      "Change management: zavihka Vodji proizvodnje in montaže ter Vodja operacij.",
      "Vodja operacij ima 8 področij v treh sklopih: Proizvodnja (organizacija, produktivnost, oprema), Skladišče (organizacija, izdaja, prevzemi materiala) ter Tehnologija + razvoj (sodelovanje, prototipi).",
      "Sklopi so ločeni z naslovom v barvi sklopa in tanko črto; v oknu za vpis tedna je nad področjem izpisan sklop.",
      "Grafi so nižji, razlaga barv črt je v hover tekstu legende (čistejši pogled).",
    ],
  },
  {
    verzija: "6.03",
    datum: "09. 10. 2026",
    spremembe: [
      "Aplikacija je zaklenjena: brez prijave (e-mail + geslo) se pokaže samo prijavno okno.",
      "Izhod odjavi uporabnika; prijavljeni uporabnik je izpisan v glavi.",
      "Baza dovoli branje in pisanje samo prijavljenim uporabnikom (migracija 006).",
    ],
  },
  {
    verzija: "6.02",
    datum: "09. 10. 2026",
    spremembe: [
      "Change management prenovljen: 7 grafov (eden na področje), na vsakem dve črti - vodja proizvodnje (modra) in vodja montaže (oranžna). Svetel odsek = napredek, temen črtkan = nazadovanje, siv = brez spremembe.",
      "Grafi v slogu Excela: siv preliv, senca, točke z vrednostjo; os do cilja 40 % in črta pričakovanega tempa v 13 tednih.",
      "Področja obarvana po infografiki Upravljanje sprememb; pod grafom cilj, na čem se dela in pričakovanja (urejanje s svinčnikom).",
      "Tabela vpisov pod vsakim grafom (zložljiva) z razvrščanjem po stolpcih; na vrhu glavno sporočilo in povzetek po vodjih z gumbom Vpiši teden.",
      "Prioritete: tabela odprem ima standardno temno glavo in razvrščanje po stolpcih (znotraj naročila); Excel izvoz upošteva razvrščanje.",
    ],
  },
  {
    verzija: "6.01",
    datum: "09. 10. 2026",
    spremembe: [
      "Nov razdelek Management in stran Change management: tedenski napredek vodje proizvodnje in vodje montaže na 7 področjih (plan dela, ljudje, rutina in sestanki, pomoč, organizacija, napredek, odnos do dela).",
      "Za vsako področje mali graf, ki se riše teden po tednu od 5. 10. 2026 (0 %); hover / tap pokaže spremembo, skupno vrednost in komentar.",
      "Vpis tedna za vsa področja naenkrat: sprememba v % (hitri gumbi -1 do +1) in obvezen komentar; vpis lahko kasneje popraviš.",
      "Klik na graf odpre tabelo vseh vpisov področja. Sekcija Vodja operacij je pripravljena za lastna področja.",
    ],
  },
  {
    verzija: "5.07",
    datum: "09. 10. 2026",
    spremembe: [
      "Meni: moduli (Proizvodnja, Skladišče) so zložljivi bloki z rahlo svetlejšim ozadjem; vsebina modula je zamaknjena desno.",
      "Modul trenutne strani je vedno razprt, ostale razpreš s klikom - meni ostane pregleden tudi na telefonu in tablici.",
    ],
  },
  {
    verzija: "5.06",
    datum: "09. 10. 2026",
    spremembe: [
      "Leva navigacija razdeljena na razdelke: Rutinsko delo (Rutina), Planiranje (Zasedenost, Prioritete) in Podatki proizvodnje (Normativi); v Skladišču Rutinsko delo (Rutina).",
      "Razdelki v meniju ločeni z oranžnim naslovom in tanko oranžno črto; meni drsi, če je postavk veliko.",
      "Domača stran prikazuje kartice po istih razdelkih.",
    ],
  },
  {
    verzija: "5.05",
    datum: "08. 10. 2026",
    spremembe: [
      "Navodila preseljena v skupni repo FINES_Standardi (enaka za vse Fines aplikacije).",
      "Barve gumbov po novem pravilu: izvoz (Excel, CSV, TXT, predloga), prenos .txt in Izhod so oranžni; bel ostane samo za prikaz (nazaj, naprej, prekliči).",
      "Puščice za listanje (tedni, meseci, strani) in nastavitve so beli okrogli gumbi z obrobo.",
      "Normativi: gumb Prikaži (ponovno prikaže skrite) je zelen.",
      "Rutina: enoten izbirnik DA/NE in lestvica ocen 1-5 (obarvane stopnje do izbrane, desno opis ocene).",
      "Napake pri uvozu normativov in skupni spremembi v enotnem rdečem obvestilu.",
    ],
  },
  {
    verzija: "5.04",
    datum: "07. 10. 2026",
    spremembe: [
      "Prioritete: izvoz v Excel za vsak zavihek posebej (odpreme, prioritete nalogov, artikli) - izvozi se to, kar je na zaslonu.",
      "Nov TXT izvoz odprem za montažo (Teams sporočilo): datum, količina, ident, naziv, kupec in krovni nalog; kopiraj ali prenesi .txt.",
      "Filtri na vseh straneh poravnani: naslovi v svoji vrstici nad polji, vsa polja in gumbi enake višine v isti vrsti.",
      "Checkbox filtri v okvirju enake višine kot ostala polja (vklopljen oranžen).",
    ],
  },
  {
    verzija: "5.03",
    datum: "07. 10. 2026",
    spremembe: [
      "Prioritete nalogov: vrstici sklopov (Zamuja, Po prvi odpremi) bolj vidni - izrazitejše ozadje in barvna črta levo.",
      "Vse tabele s temno glavo imajo zaobljene kote (glava zgoraj, zadnja vrstica spodaj).",
      "Navodila: pravilo usklajevanja komponent po celotnem projektu.",
    ],
  },
  {
    verzija: "5.02",
    datum: "07. 10. 2026",
    spremembe: [
      "Enotno polje za uvoz datotek: sivo (ni podatkov), modro (nalaganje), zeleno (naloženo), ikona stanja v desnem zgornjem kotu.",
      "Kartice statusov na Prioritetah: jasno vidno vklopljeno (barvna obroba, ozadje, kljukica) in hover.",
      "Pogledi Prioritet so zavihki nad filtri; pod njimi filtri izbranega pogleda, Izvoz v desnem zgornjem kotu.",
      "Prioritete nalogov razdeljene na sklopa: Zamuja (pospeši) in Po prvi odpremi.",
      "Vse tabele s temno glavo (Prioritete, Zasedenost, Normativi): razvrščanje s klikom na stolpec in glava, ki ostane vidna pri drsenju.",
      "Navodila: nov razdelek Standardne komponente v app_instructions.md.",
    ],
  },
  {
    verzija: "5.01",
    datum: "07. 10. 2026",
    spremembe: [
      "Nov zavihek Prioritete (prvi osnutek): uvoz izvoza naročil izvozvd200.xlsx z drag & drop (zgoraj desno).",
      "Delovni nalogi se ne uvažajo ponovno - uporabi se zadnji uvoz iz Zasedenosti (lahko se uvozi tudi tu, velja za obe strani).",
      "Zaloga in nalogi se razdelijo po naročilih po datumu odpreme: kaj gre z zaloge, iz katerega naloga, kaj manjka.",
      "Statusi: Manjka, Nalog zamuja, Nedorečeno, V proizvodnji, Na zalogi (pravila iz Excela + roki nalogov).",
      "Pogled Odpreme po tednih (kot pivot), Prioritete nalogov (prodano / prosto, predlog za vodjo montaže) in Po artiklih.",
      "Opomba in oznaka pregledano za vsako postavko (ostane tudi po novem uvozu); izvoz v Excel.",
      "SQL 005: fp_pri_uvozi, fp_pri_postavke, fp_pri_opombe.",
    ],
  },
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
