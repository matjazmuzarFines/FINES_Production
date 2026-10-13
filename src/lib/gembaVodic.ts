// Vodič za tedenski Gemba walk produktivnosti.
// Vir: dogovor vodstva (data/produktivnost rutina.txt) - Leader Standard Work, TWI, Lean izgube.
// Vsak teden ena tema opazovanja; vodja ne išče "izboljšav", ampak odgovarja na konkretna vprašanja.

/** Izguba / tema opazovanja. Koda se shrani v fp_prod_gemba.tema in fp_prod_akcije.kategorija. */
export type Izguba = {
  koda: string;
  naziv: string;
  /** Barva teme (pika, trak). */
  barva: string;
  /** Kaj opazujem - en stavek. */
  opis: string;
  /** Vprašanja za opazovanje (vodja si odgovori sam). */
  opazuj: string[];
  /** Vprašanja za delavce na delovnem mestu. */
  vprasaj: string[];
  /** Tipični majhni ukrepi. */
  ukrepi: string[];
  /** Kako izmeriš (pred / po). */
  meritev: string;
};

export const IZGUBE: Izguba[] = [
  {
    koda: "GIBANJE",
    naziv: "Gibanje in hoja",
    barva: "#2563eb",
    opis: "Hoja po material, orodje, dokumentacijo; sklanjanje, iztegovanje, obračanje.",
    opazuj: [
      "Kolikokrat delavec zapusti delovno mesto v 30 minutah? Kam gre in zakaj?",
      "Ali hodi po orodje, material, dokumentacijo ali po drugega delavca?",
      "Ali se mora sklanjati, iztegovati ali obračati, da doseže material ali orodje?",
      "Ali so najpogosteje uporabljeni deli in orodja na dosegu roke (v območju 50 cm)?",
      "Ali ista pot nastane pri vsakem kosu ali samo enkrat na serijo?",
      "Nariši pot delavca na skico (špageti diagram) - kje se poti križajo ali ponavljajo?",
    ],
    vprasaj: [
      "Po kaj moraš največkrat hoditi?",
      "Kaj bi moralo biti bližje, da ti ne bi bilo treba vstati?",
    ],
    ukrepi: [
      "Dodatno orodje neposredno na celici",
      "Material na točki uporabe (regal, voziček, kanban)",
      "Prerazporeditev mize / regala po zaporedju operacij",
    ],
    meritev: "Število odhodov na uro ali na kos (števec) in prehojeni metri.",
  },
  {
    koda: "CAKANJE",
    naziv: "Čakanje in prekinitve",
    barva: "#dc2626",
    opis: "Čakanje na material, stroj, sodelavca, navodila, odločitev ali kontrolo.",
    opazuj: [
      "Ali kdo stoji in čaka? Na kaj točno (material, stroj, sodelavca, vodjo, kontrolo)?",
      "Kolikokrat je bilo delo prekinjeno in koliko časa je trajala posamezna prekinitev?",
      "Ali dva delavca čakata tretjega (ozko grlo)?",
      "Ali je jasno, kaj je naslednje delo, ko se trenutno konča?",
      "Ali delavec čaka na odgovor, podpis ali odločitev nekoga drugega?",
    ],
    vprasaj: [
      "Kaj te danes največkrat prekine?",
      "Na kaj si ta teden najdlje čakal?",
      "Kdaj ne veš, kaj je naslednje delo?",
    ],
    ukrepi: [
      "Plan dela in naslednji nalog vidno na celici",
      "Material pripravljen pred začetkom serije",
      "Prerazporeditev operacij med delavci (izravnava)",
    ],
    meritev: "Minute čakanja na izmeno (štoparica / števec) in izhod celice.",
  },
  {
    koda: "ORODJE",
    naziv: "Orodje in pripomočki",
    barva: "#ca5010",
    opis: "Manjkajoče, neustrezno ali skupno orodje; iskanje in izposojanje.",
    opazuj: [
      "Ali ima vsak delavec vse orodje, ki ga potrebuje za svojo operacijo?",
      "Ali si delavci orodje izposojajo med seboj? Kolikokrat?",
      "Ali delavec išče orodje ali pripomoček? Koliko časa?",
      "Ali je orodje v dobrem stanju (obrabljeno, neustrezno, počasno)?",
      "Ali bi namenski pripomoček (šablona, vpenjalo, nastavek) skrajšal operacijo?",
    ],
    vprasaj: [
      "Katero orodje ti najbolj manjka ali te najbolj jezi?",
      "Kateri pripomoček bi ti najbolj olajšal delo?",
    ],
    ukrepi: [
      "Komplet orodja za vsako delovno mesto (senčna tabla)",
      "Nakup / izdelava namenskega pripomočka",
      "Zamenjava obrabljenega orodja",
    ],
    meritev: "Število iskanj / izposoj na uro; čas operacije pred / po.",
  },
  {
    koda: "ORGANIZACIJA",
    naziv: "Organizacija in razporeditev",
    barva: "#7c4dcc",
    opis: "Neenakomerna obremenitev, nejasne naloge, slabo zaporedje dela.",
    opazuj: [
      "Ali nekdo čaka, medtem ko je drugi preobremenjen?",
      "Ali vsak ve, kaj dela danes in kaj je naslednje?",
      "Ali je zaporedje operacij smiselno ali se kos vrača nazaj?",
      "Ali je število ljudi na celici primerno za trenutno serijo?",
      "Ali vodja opravlja delo, ki bi ga lahko opravil nekdo drug?",
    ],
    vprasaj: [
      "Kaj bi spremenil pri razporeditvi dela, če bi lahko?",
      "Kdaj imaš občutek, da delaš nekaj, kar ni tvoje delo?",
    ],
    ukrepi: [
      "Jasna razporeditev operacij po delavcih",
      "Izravnava dela med delovnimi mesti",
      "Dnevni plan na tabli celice",
    ],
    meritev: "Človek-ure na dober kos; izhod celice na izmeno.",
  },
  {
    koda: "SMED",
    naziv: "Priprava in menjava serije (SMED)",
    barva: "#0d9488",
    opis: "Čas od zadnjega dobrega kosa stare serije do prvega dobrega kosa nove serije.",
    opazuj: [
      "Koliko časa traja menjava (od zadnjega dobrega do prvega dobrega kosa)?",
      "Kaj se med menjavo išče, prinaša ali pripravlja? Bi se to dalo narediti prej (zunanja priprava)?",
      "Ali so pred menjavo pripravljeni material, orodje, dokumentacija in navodila?",
      "Ali se ob začetku serije izdela poskusni kos, popravlja ali nastavlja?",
      "Kateri koraki menjave bi lahko potekali vzporedno (dva delavca)?",
    ],
    vprasaj: [
      "Kaj te pri začetku nove serije najbolj zadrži?",
      "Kaj bi lahko pripravil že med prejšnjo serijo?",
    ],
    ukrepi: [
      "Kontrolni seznam priprave pred menjavo",
      "Komplet za menjavo (voziček z vsem potrebnim)",
      "Pripravljen material in nalog pred koncem prejšnje serije",
    ],
    meritev: "Čas menjave (štoparica), število menjav na teden.",
  },
  {
    koda: "NEPOTREBNO",
    naziv: "Nepotrebna opravila",
    barva: "#a16207",
    opis: "Prestavljanje, obračanje, dvojno preverjanje, čiščenje, odvečna obdelava.",
    opazuj: [
      "Kolikokrat se kos prestavi, obrne ali odloži, preden je končan?",
      "Ali se kaj preverja, šteje ali zapisuje večkrat?",
      "Ali se opravlja delo, ki ga kupec ne potrebuje (odvečna obdelava, natančnost)?",
      "Ali se kaj čisti, razpakira ali ureja, kar bi lahko prišlo že pripravljeno?",
      "Katera operacija bi se dala združiti z drugo ali izpustiti?",
    ],
    vprasaj: [
      "Kaj delaš, za kar misliš, da je nepotrebno?",
      "Kaj delaš dvakrat?",
    ],
    ukrepi: [
      "Spremenjeno zaporedje operacij",
      "Opustitev dvojne kontrole / zapisa",
      "Material od dobavitelja v uporabni embalaži",
    ],
    meritev: "Število obratov / prestavljanj na kos; čas cikla.",
  },
  {
    koda: "KAKOVOST",
    naziv: "Kakovost in dodelave",
    barva: "#be123c",
    opis: "Popravila, dodelave, izmet, dodatna kontrola.",
    opazuj: [
      "Ali je treba kaj popravljati, brusiti, ponavljati ali dodatno kontrolirati?",
      "Kje nastane napaka in kje jo opazimo (kako daleč narazen)?",
      "Ali ima delavec jasen kriterij, kaj je dober kos (vzorec, slika, merilo)?",
      "Ali so napake ponavljajoče - vedno na istem mestu ali istem izdelku?",
      "Ali bi preprosta šablona preprečila napako (poka-yoke)?",
    ],
    vprasaj: [
      "Kaj moraš najpogosteje popravljati?",
      "Kdaj nisi prepričan, ali je kos dober?",
    ],
    ukrepi: [
      "Vzorec / slika dobrega kosa na delovnem mestu",
      "Šablona ali omejilo (poka-yoke)",
      "Povratna informacija na mesto nastanka napake",
    ],
    meritev: "Število dodelav na serijo; minute dodelav na kos.",
  },
  {
    koda: "DELOVNO_MESTO",
    naziv: "Delovno mesto in 5S",
    barva: "#4d4d53",
    opis: "Postavitev, red, označenost, ergonomija in varnost delovnega mesta.",
    opazuj: [
      "Ali bi drugačna postavitev materiala, orodja ali mize skrajšala delo?",
      "Ali ima vsaka stvar svoje označeno mesto? Ali je na delovnem mestu kaj odveč?",
      "Ali je višina mize primerna, je dovolj svetlobe in prostora?",
      "Ali so prisotna nevarna ali naporna dela (dvigovanje, neugodna drža)?",
      "Ali bi nov sodelavec takoj našel vse potrebno?",
    ],
    vprasaj: [
      "Kaj ti na delovnem mestu najbolj ovira delo?",
      "Kaj bi odstranil, prestavil ali dodal?",
    ],
    ukrepi: [
      "5S akcija na celici (odstrani, uredi, označi)",
      "Nastavitev višine mize / dvižna miza",
      "Označena mesta za material in orodje",
    ],
    meritev: "Čas iskanja; ocena 5S (1-5) pred / po; slika pred / po.",
  },
  {
    koda: "MATERIAL",
    naziv: "Material in zaloge",
    barva: "#15803d",
    opis: "Nepravočasen ali nepopoln material, zaloge med operacijami, transport.",
    opazuj: [
      "Ali je bil ob začetku serije pripravljen ves material?",
      "Koliko polizdelkov čaka med operacijami? Ali so ovire za pretok?",
      "Kolikokrat se material prestavi, preden pride do delovnega mesta?",
      "Ali kaj manjka, je napačno ali v napačni količini?",
      "Ali skladišče ve, kdaj in kaj celica potrebuje?",
    ],
    vprasaj: [
      "Kaj ti najpogosteje manjka, ko začneš delo?",
      "Kje se ti nabira material, ki ga ne potrebuješ?",
    ],
    ukrepi: [
      "Komplet materiala pred serijo (kitting)",
      "Dogovor s skladiščem o času dostave",
      "Omejitev zaloge med operacijami (označeno mesto, max količina)",
    ],
    meritev: "Minute zamude zaradi materiala; število manjkajočih postavk na serijo.",
  },
  {
    koda: "ZNANJE",
    naziv: "Ljudje, znanje in navodila",
    barva: "#1d4ed8",
    opis: "Različni načini dela, manjkajoča navodila, neizkoriščeno znanje delavcev.",
    opazuj: [
      "Ali dva delavca isto operacijo delata različno? Kdo je hitrejši in zakaj?",
      "Ali obstaja navodilo / standard dela in ali se ga upošteva?",
      "Ali je delavec dovolj usposobljen za delo, ki ga opravlja?",
      "Ali delavci predlagajo izboljšave? Kaj se zgodi s predlogom?",
      "Kdo bi lahko prevzel del organizacije dela od vodje?",
    ],
    vprasaj: [
      "Kaj ti ovira, da bi delo opravil brez ustavljanja?",
      "Kaj bi novemu sodelavcu najprej pokazal?",
      "Katero izboljšavo si že kdaj predlagal?",
    ],
    ukrepi: [
      "Standard dela najboljšega načina (slika / kratko navodilo)",
      "Usposabljanje po TWI (pokaži - naredi - preveri)",
      "Tabla predlogov delavcev z odgovorom v enem tednu",
    ],
    meritev: "Razlika v času cikla med delavci; število predlogov delavcev.",
  },
];

export const izgubaPoKodi = (koda: string | null | undefined) => IZGUBE.find((i) => i.koda === koda);

/** Predlog teme tedna: vsak teden naslednja tema (vodja postopoma spozna vse izgube). */
export const predlogTeme = (stTedna: number) => IZGUBE[(stTedna - 1) % IZGUBE.length];

export type KorakVodica = { naslov: string; cas: string; tocke: string[] };

/** Potek ene gembe (30-60 min). */
export const KORAKI: KorakVodica[] = [
  {
    naslov: "Priprava",
    cas: "5 min, pred gembo",
    tocke: [
      "Izberi celico / družino izdelkov in temo tedna (ena tema!).",
      "Preglej odprte akcije prejšnjih tednov (spodaj na strani).",
      "Zagotovi zaščiten čas - gembe ne prekine operativno delo, razen nujnih primerov.",
      "Vzemi tablico / telefon: zapisnik, štoparica, števci, slike.",
    ],
  },
  {
    naslov: "Preverjanje odprtih akcij",
    cas: "10 min",
    tocke: [
      "Na mestu preveri vsako odprto akcijo: je izvedena? deluje? je postala način dela?",
      "Izvedeno akcijo izmeri (pred / po) in ji nastavi status Preverjeno.",
      "Če akcija stoji: zakaj? kdo pomaga? nov rok.",
    ],
  },
  {
    naslov: "Opazovanje",
    cas: "20-30 min",
    tocke: [
      "Stoj na enem mestu in opazuj (\"krog na tleh\") - ne posegaj v delo.",
      "Opazuj samo temo tedna in odgovarjaj na vprašanja iz zavihka Vprašanja.",
      "Štej (števci) in meri posamezne operacije (štoparica) - cela pečica traja predolgo.",
      "Slikaj pred stanje; pot delavca nariši na tablo (špageti diagram).",
      "Zapisuj dejstva (kaj, kolikokrat, koliko časa), ne mnenj.",
    ],
  },
  {
    naslov: "Pogovor z delavci",
    cas: "10 min",
    tocke: [
      "Vprašaj, poslušaj, zapiši - ne obtožuj (problem je v procesu, ne v človeku).",
      "Vprašaj tudi: \"Kaj te danes največkrat prekine?\" in \"Po kaj moraš hoditi?\"",
      "Delavca vključi v rešitev - kaj bi on naredil?",
    ],
  },
  {
    naslov: "Akcije",
    cas: "10 min",
    tocke: [
      "Izberi 1-3 najpomembnejše izgube - ne deset.",
      "Vsaka akcija: problem, ukrep, en odgovoren, rok, ocena prihranka (kalkulator v Orodjih).",
      "Majhno (do 30 min, nekaj deset EUR) -> izvedi do naslednje serije.",
      "Veliko (investicija, razvoj, tehnologija) -> drug nosilec, ločen projekt.",
    ],
  },
  {
    naslov: "Zaključek",
    cas: "5 min",
    tocke: [
      "Povzemi ugotovitve v zapisniku (3 stavki).",
      "Zahvali se ekipi in povej, kaj bo narejeno in do kdaj.",
      "Zaključi gembo (zelen gumb zgoraj).",
    ],
  },
];

/** Pravila, ki jih vodja vidi vedno. */
export const PRAVILA = [
  "Ena zaključena, preverjena izboljšava je vrednejša od desetih zapisanih predlogov.",
  "Največ 3 odprte akcije naenkrat - najprej dokončaj, nato odpri nove.",
  "Meri pred in po: brez meritve ni prihranka.",
  "Varnost in kakovost sta pred hitrostjo.",
  "Problem je v procesu, ne v človeku.",
];

/** Splošna vprašanja (vedno uporabna). */
export const SPLOSNA_VPRASANJA = [
  "Kaj je ozko grlo celice danes - katera operacija določa izhod?",
  "Koliko dobrih kosov je celica naredila v zadnji uri? Koliko bi jih morala?",
  "Kaj se je spremenilo od zadnje gembe (akcije, ljudje, izdelek)?",
  "Kaj bi tukaj videl obiskovalec, ki prvič pride v proizvodnjo?",
  "Kaj je ena stvar, ki jo lahko popravimo še ta teden?",
];

/** Predloga zapisnika (vstavi se v prazno polje). */
export const PREDLOGA_ZAPISNIKA = `PREGLED ODPRTIH AKCIJ
-

OPAŽANJA (dejstva: kaj, kolikokrat, koliko časa)
-

POGOVOR Z DELAVCI
-

UGOTOVITVE / KORENSKI VZROKI
-

POVZETEK (3 stavki)
- `;
