// Zgodovina verzij - prikazana v "i" popupu (desni zgornji kot).
// Pravilo: male spremembe 1.01 -> 1.02, večje spremembe / nova funkcija / podstran -> 2.01.

export type ChangelogEntry = {
  verzija: string;
  datum: string;
  spremembe: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    verzija: "13.01",
    datum: "13. 10. 2026",
    spremembe: [
      "Produktivnost: stran ima zavihka - Koledar (privzet: koledar gemb in tabla izboljšav) in KPI (grafi in statistika).",
      "Nov KPI 5 Faktor investicije: letni prihranek izvedenih akcij / investirano (enkratni stroški teh akcij); cilj 1,5 (100 € → 150 € na leto).",
      "KPI kartice so manjše - vseh 5 grafov v eni vrsti na monitorju; krajša besedila.",
      "Statistika v zavihku KPI: potencial, akcije, doslednost, strošek ukrepov in tabela akcij po vrsti izgube.",
      "SQL: 013_produktivnost_faktor_investicije.sql (cilj faktorja v nastavitvah leta).",
    ],
  },
  {
    verzija: "12.01",
    datum: "13. 10. 2026",
    spremembe: [
      "Produktivnost: na prvi strani 4 KPI-ji z grafi - 1. izvedene gembe (%), 2. prihranek €/leto, 3. prihranek dela h/leto, 4. zmanjšanje normativov (%); cilji po letih (2026 od 42. tedna: 80 %, 10.000 €, 40 h, 10 %; 2027: 80 %, 50.000 €, 200 h, 10 %).",
      "Kalkulator prihranka: 2 vpisa - čas (min/kos) in material (€/kos); čas × urna postavka + material = €/kos, × letna količina družine = €/leto in h/leto.",
      "Akcija ima družino pečic (in po potrebi lastno letno količino); tabla izboljšav kaže min/kos, €/kos in €/leto.",
      "Novo okno Družine: letna količina in cilj zmanjšanja normativa po družini, povprečni normativ ob izhodišču in zdaj, prihranek h/leto zaradi nižjega normativa.",
      "Posnetki normativov: izhodišče 13. 10. 2026 (migracija 012), gumb Nov posnetek shrani trenutno stanje; KPI 4 primerja normative ident z identom.",
      "Pod grafi kazalniki: potencial odprtih akcij (€ in h), akcije, doslednost, strošek ukrepov s povračilom. Nastavitve: cilji leta, začetni teden gemb, urna postavka.",
      "PDF in e-mail gembe prikazujeta prihranek v min/kos, €/kos in €/leto.",
    ],
  },
  {
    verzija: "11.01",
    datum: "13. 10. 2026",
    spremembe: [
      "Gemba (teden): izvoz poročila - gumb PDF (prenos) in gumb E-mail (Outlook .eml s PDF v priponki in osnovnimi podatki v besedilu).",
      "PDF po vrsti: osnovni podatki (teden, datum, čas začetka, trajanje, celica, udeleženci, tema), zapisnik z meritvami operacij, števci, KPI tedna in oceno prihranka, celotna tabla izboljšav, priloge (slike, skice, povpraševanja).",
      "Časovnik gembe shrani uro začetka in trajanje (ob pavzi) - prikazano v PDF in e-mailu.",
      "Prilagojeno za pečice (1-2 h na kos): štoparica meri posamezne operacije, KPI je tedenski (človek-ure / dobre pečice v tednu) in se ne meri na gembi.",
    ],
  },
  {
    verzija: "10.03",
    datum: "13. 10. 2026",
    spremembe: [
      "Časovnik gembe in štoparica: številke ob zagonu ne utripnejo več in ob ponovnem zagonu ne skočijo nazaj.",
      "Časovnik gembe: odstranjen gumb za vpis trajanja v zapisnik (za beleženje časa dogodka je gumb Ura ob zapisniku).",
    ],
  },
  {
    verzija: "10.02",
    datum: "13. 10. 2026",
    spremembe: [
      "Tabla za skiciranje: poteza se pokaže takoj, ko dvigneš prst (prej je včasih izginila do naslednjega dotika).",
      "Tabla je hitrejša pri veliko potezah (ozadje in risba se ne rišeta znova ob vsakem premiku), hitri gibi so gladkejši, drugi prst ali dlan med potezo ne pokvari risbe.",
    ],
  },
  {
    verzija: "10.01",
    datum: "13. 10. 2026",
    spremembe: [
      "Rutina ima podmeni: Rutina vodij (dosedanja dnevna rutina) in Produktivnost (nova stran).",
      "Produktivnost: tedenski Gemba walk - koledar tednov (zaključena / v delu / ni izvedena), kazalniki prihranka, graf prihranka in človek-ur na kos, tabla vseh akcij, nastavitve (urna postavka, tedni, cilj).",
      "Zapisnik tedna: podatki gembe (datum, celica, udeleženci, tema tedna s predlogom), velik zapisnik, vodič gembe po korakih, vprašanja po 10 temah izgub (klik vstavi vprašanje v zapisnik), orodja (časovnik, štoparica ciklov, števci, KPI človek-ure / dober kos, kalkulator prihranka).",
      "Tabla izboljšav: akcije s problemom, ukrepom, izgubo, odgovornim, rokom, statusom, oceno prihranka (h/teden, EUR/leto) in rezultatom; odprte akcije prejšnjih tednov se pokažejo na vsaki gembi; opozorilo nad 3 odprte akcije.",
      "Priloge gembe: slike (več naenkrat), tabla za skiciranje (pero, marker, oblike, puščice, tekst, radirka, mreža, risanje na sliko) in povpraševanja (PDF, Word, Excel, Outlook) s statusom.",
      "Datoteke so v bucketu fp-rutina-slike v mapi prod/ (ločeno od rutin). SQL: 011_produktivnost.sql.",
    ],
  },
  {
    verzija: "9.01",
    datum: "12. 10. 2026",
    spremembe: [
      "Prioritete: nov zavihek Zasedenost naročil - ure po normativu za del naročil, ki ni na zalogi ali v odpremi, po tednih (datum odpreme - rezerva) v primerjavi z razpoložljivostjo iz Zasedenosti.",
      "Pod pregledom tabela postavk izbranega tedna z urami P / M / E / T; veljajo isti filtri kot na Prioritetah (grupa, iskanje, statusi, nepotrjena naročila, vsi identi) in Excel izvoz.",
      "Zasedenost in Zasedenost naročil uporabljata iste gradnike pregleda; vrstica Skupaj pokaže tudi presežek / primanjkljaj ur.",
    ],
  },
  {
    verzija: "8.03",
    datum: "12. 10. 2026",
    spremembe: [
      "Zasedenost: filtri tabele nalogov (iskanje, Normativ, oddelki, razvrščanje) ostanejo nespremenjeni ob kliku na drug teden.",
      "Zasedenost: razpoložljivost se računa s 7 h/dan na osebo (prej 6,5 h).",
    ],
  },
  {
    verzija: "8.02",
    datum: "12. 10. 2026",
    spremembe: [
      "Zasedenost: checkbox \"Samo brez normativa\" zamenjan s preklopnikom Normativ: Vsi / Brez normativa (število) / Z normativom. Z normativom skrije naloge brez normativa.",
    ],
  },
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
