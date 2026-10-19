// Vodič za audite (splošne gemba walke vodstva) po oddelkih podjetja.
// Vodja izbere oddelek, po želji eno temo oddelka in odgovarja na konkretna vprašanja.
// Vir: Leader Standard Work, gemba walk ("pojdi, poglej, vprašaj zakaj, pokaži spoštovanje"), docs/auditi_teorija.md.
//
// Oddelki, teme in vprašanja se urejajo v aplikaciji (Auditi -> Nastavitve, tabele fp_aud_*).
// PRIVZETI_ODDELKI so začetna vsebina (migracija 016) in rezerva, dokler migracija ni zagnana.

/** Privzeta tema audita znotraj oddelka. Koda se shrani v fp_aud_audit.tema in fp_aud_akcije.kategorija. */
type TemaAudita = {
  koda: string;
  naziv: string;
  /** Kaj preverjam - en stavek. */
  opis: string;
  /** Vprašanja za opazovanje (vodja si odgovori sam). */
  opazuj: string[];
  /** Vprašanja za zaposlene. */
  vprasaj: string[];
  /** Tipični ukrepi. */
  ukrepi: string[];
};

type PrivzetiOddelek = {
  koda: string;
  naziv: string;
  /** Barva oddelka (pika, trak). */
  barva: string;
  opis: string;
  /** Primer področja (placeholder polja Področje). */
  podrocje: string;
  teme: TemaAudita[];
};

/** Teme, ki so enake v vseh oddelkih (vprašanja so prilagojena oddelku). */
const varnost = (opazuj: string[], ukrepi: string[]): TemaAudita => ({
  koda: "VARNOST",
  naziv: "Varnost in ergonomija",
  opis: "Varno delo, zaščitna oprema, prometne poti, dvigovanje bremen in drža pri delu.",
  opazuj,
  vprasaj: ["Kdaj se pri delu ne počutiš varno?", "Kaj te pri delu najbolj fizično utrudi?"],
  ukrepi,
});

const red5s = (opazuj: string[], ukrepi: string[]): TemaAudita => ({
  koda: "RED_5S",
  naziv: "Red in 5S",
  opis: "Sortiraj, sistematiziraj, čisti, standardiziraj, vzdržuj - vsaka stvar ima svoje označeno mesto.",
  opazuj,
  vprasaj: ["Kaj na tvojem delovnem mestu najpogosteje iščeš?", "Kaj bi odstranil, ker ga ne potrebuješ?"],
  ukrepi,
});

const ljudje = (opazuj: string[]): TemaAudita => ({
  koda: "LJUDJE",
  naziv: "Ljudje, komunikacija in vizualno vodenje",
  opis: "Ali ekipa ve, kaj je cilj dneva, kako ji gre, in ali so težave vidne in rešene.",
  opazuj,
  vprasaj: [
    "Kaj je danes tvoja najpomembnejša naloga?",
    "Katero težavo si zadnjič javil vodji? Kaj se je zgodilo?",
    "Kaj bi spremenil, če bi bil ti vodja oddelka?",
  ],
  ukrepi: [
    "Tabla oddelka s cilji, rezultati in odprtimi težavami",
    "Kratek dnevni sestanek ob tabli (5-10 min)",
    "Odgovor na vsak predlog zaposlenega v enem tednu",
  ],
});

export const PRIVZETI_ODDELKI: PrivzetiOddelek[] = [
  {
    koda: "PROIZVODNJA",
    naziv: "Proizvodnja",
    barva: "#2563eb",
    opis: "Razrez, krivljenje, varjenje in obdelava delov.",
    podrocje: "npr. Laser, krivljenje, varjenje",
    teme: [
      varnost(
        [
          "Ali so zaščite strojev nameščene in delujejo (svetlobne zavese, varovala, izklop v sili)?",
          "Ali vsi nosijo predpisano zaščitno opremo (očala, rokavice, čevlji, zaščita pri varjenju)?",
          "Ali so prometne poti in izhodi v sili prosti in označeni?",
          "Ali se težki ali veliki kosi dvigujejo s pripomočki ali ročno?",
        ],
        ["Označitev in sprostitev prometnih poti", "Pripomoček za dvig / prenos težkih kosov", "Kontrolni seznam zaščit stroja ob začetku izmene"],
      ),
      red5s(
        [
          "Ali ima vsako orodje in pripomoček (orodja za krivljenje, šablone) svoje označeno mesto?",
          "Ali so ob strojih kosi, ostanki ali material, ki ga trenutno ne potrebujejo?",
          "Ali so tla, stroji in delovne mize čisti (ostružki, ostanki pločevine, olje)?",
          "Ali bi nov sodelavec takoj našel vse potrebno?",
        ],
        ["5S akcija na delovnem mestu (odstrani, uredi, označi)", "Senčna tabla za orodje", "Urnik čiščenja z odgovornimi"],
      ),
      {
        koda: "STANDARD",
        naziv: "Standardno delo in navodila",
        opis: "Ali obstaja najboljši način dela, je zapisan in ga vsi upoštevajo.",
        opazuj: [
          "Ali so ob stroju navodila, programi in risbe, ki veljajo za trenutni nalog?",
          "Ali dva delavca isto operacijo delata različno? Kdo hitreje in zakaj?",
          "Ali je jasno, kdo je usposobljen za kateri stroj (matrika usposobljenosti)?",
          "Ali se nastavitev stroja preveri s prvim kosom?",
        ],
        vprasaj: ["Kje najdeš navodila, ko nečesa ne veš?", "Kaj bi novemu sodelavcu najprej pokazal?"],
        ukrepi: ["Navodilo s sliko na delovnem mestu", "Matrika usposobljenosti oddelka", "Usposabljanje po TWI (pokaži - naredi - preveri)"],
      },
      {
        koda: "KAKOVOST",
        naziv: "Kakovost in napake",
        opis: "Napake, dodelave in izmet - kje nastanejo in kje jih opazimo.",
        opazuj: [
          "Ali je ob delovnem mestu izmet ali kosi za dodelavo? Koliko in zakaj?",
          "Ali ima delavec jasen kriterij dobrega kosa (mera, vzorec, slika)?",
          "Ali so merila na voljo in v dobrem stanju?",
          "Ali bi preprosta šablona ali omejilo preprečilo napako (poka-yoke)?",
        ],
        vprasaj: ["Kaj moraš najpogosteje popravljati?", "Kdaj nisi prepričan, ali je kos dober?"],
        ukrepi: ["Vzorec / slika dobrega kosa na delovnem mestu", "Šablona ali omejilo (poka-yoke)", "Povratna informacija na mesto nastanka napake"],
      },
      {
        koda: "PRETOK",
        naziv: "Plan, pretok in zaloge",
        opis: "Ali se dela po planu, koliko polizdelkov čaka in ali delo teče brez čakanja.",
        opazuj: [
          "Ali je plan dela viden in ali se dela po prioritetah?",
          "Koliko polizdelkov čaka med operacijami? Ali so na označenem mestu?",
          "Ali kdo čaka na material, stroj, program ali odločitev?",
          "Ali je delo, ki je v teku, res potrebno za naslednje naloge montaže?",
        ],
        vprasaj: ["Na kaj si ta teden najdlje čakal?", "Kdaj ne veš, kaj je naslednje delo?"],
        ukrepi: ["Vidna prioritetna lista nalogov ob stroju", "Označena mesta in največja zaloga med operacijami", "Material in program pripravljen pred začetkom naloga"],
      },
      {
        koda: "STROJI",
        naziv: "Stroji in vzdrževanje",
        opis: "Stanje strojev, zastoji, avtonomno vzdrževanje (čiščenje, mazanje, pregled).",
        opazuj: [
          "Ali kateri stroj stoji? Zakaj in koliko časa?",
          "Ali se izvaja dnevno čiščenje in pregled strojev? Ali je zapis?",
          "Ali so na strojih iztekanja olja, poškodbe ali improvizirani popravki?",
          "Ali so okvare javljene in kdo jih rešuje?",
        ],
        vprasaj: ["Kateri stroj te najbolj ovira in zakaj?", "Kaj bi na stroju popravil, če bi lahko?"],
        ukrepi: ["Kontrolni seznam dnevnega pregleda stroja", "Oznake za mazanje in kontrolne točke", "Seznam okvar z odgovornim in rokom"],
      },
      ljudje([
        "Ali je na oddelku tabla s plani in rezultati? Je ažurna?",
        "Ali vodja oddelka ve, kje so danes težave?",
        "Ali so zaposleni razporejeni glede na plan dela?",
      ]),
    ],
  },
  {
    koda: "MONTAZA",
    naziv: "Montaža",
    barva: "#7c4dcc",
    opis: "Montaža, elektro montaža in testiranje pečic.",
    podrocje: "npr. Montažna linija 1, elektro, testiranje",
    teme: [
      varnost(
        [
          "Ali se pri delu z elektriko upošteva izklop in preverjanje brez napetosti?",
          "Ali so ročna orodja (vijačniki, kleščice) v dobrem stanju in pravilno shranjena?",
          "Ali se pečice obračajo in prenašajo s pripomočki?",
          "Ali so delovne mize na primerni višini in je dovolj svetlobe?",
        ],
        ["Dvižna / nastavljiva miza ali vrtljivo stojalo", "Pripomoček za obračanje pečice", "Označen prostor za testiranje pod napetostjo"],
      ),
      red5s(
        [
          "Ali so deli in vijačni material na točki uporabe (v dosegu roke)?",
          "Ali je na delovnem mestu material, ki ne pripada trenutnemu nalogu?",
          "Ali ima orodje svoje mesto in je vrnjeno po uporabi?",
          "Ali so embalaža in odpadki sproti odstranjeni?",
        ],
        ["Regal / voziček za material na točki uporabe", "Senčna tabla za orodje", "Zabojniki za embalažo in ločevanje odpadkov"],
      ),
      {
        koda: "STANDARD",
        naziv: "Standardno delo in navodila",
        opis: "Zaporedje montaže, navodila in kontrolne točke - enako pri vseh delavcih.",
        opazuj: [
          "Ali so montažna navodila in elektro sheme na voljo za trenutni izdelek?",
          "Ali vsi delavci montirajo isti sklop v enakem zaporedju?",
          "Ali so kritične točke (pritezni momenti, tesnila, ožičenje) označene v navodilih?",
          "Ali se nov izdelek ali sprememba pravočasno predstavi montaži?",
        ],
        vprasaj: ["Kje se pri montaži najpogosteje ustaviš, ker nečesa ne veš?", "Katero navodilo bi popravil?"],
        ukrepi: ["Slikovno navodilo za sklop", "Kontrolni seznam kritičnih točk", "Predstavitev spremembe izdelka pred začetkom serije"],
      },
      {
        koda: "KAKOVOST",
        naziv: "Kakovost in testiranje",
        opis: "Napake pri montaži, rezultati testiranja in dodelave pred odpremo.",
        opazuj: [
          "Katere napake se najpogosteje pokažejo pri testiranju?",
          "Ali so napake zapisane in vrnjene na mesto nastanka?",
          "Ali so pečice za dodelavo ločene in označene?",
          "Ali so napake dobaviteljev (deli) javljene nabavi in kakovosti?",
        ],
        vprasaj: ["Kaj moraš na pečici najpogosteje popravljati?", "Kateri del ti povzroča največ težav?"],
        ukrepi: ["Seznam najpogostejših napak na tabli (Pareto)", "Kontrola sklopa pred naslednjo operacijo", "Reklamacija dobavitelju z dokazi (slike)"],
      },
      {
        koda: "MATERIAL",
        naziv: "Material na liniji",
        opis: "Ali je material za nalog pripravljen, popoln in pravočasno na liniji.",
        opazuj: [
          "Ali je bil ob začetku naloga pripravljen ves material?",
          "Ali montaža čaka na dele iz proizvodnje ali skladišča?",
          "Ali so manjkajoči deli zapisani in javljeni?",
          "Kolikokrat delavec zapusti delovno mesto, da gre po material?",
        ],
        vprasaj: ["Kaj ti najpogosteje manjka, ko začneš delo?", "Po kaj moraš največkrat hoditi?"],
        ukrepi: ["Komplet materiala pred nalogom (kitting)", "Dogovor s skladiščem o času dostave", "Seznam manjkajočih delov s potrditvijo dobave"],
      },
      {
        koda: "IZHOD",
        naziv: "Plan in izhod",
        opis: "Ali montaža dosega plan dneva in ve, zakaj ga ne.",
        opazuj: [
          "Koliko pečic je bilo danes končanih? Koliko je bilo planiranih?",
          "Ali so razlogi za zaostanek zapisani?",
          "Ali je ozko grlo linije znano in zasedeno ves čas?",
          "Ali so pečice za odpremo pravočasno testirane in pripravljene?",
        ],
        vprasaj: ["Kaj te danes največkrat prekine?", "Kaj bi pomagalo, da bi naredili plan?"],
        ukrepi: ["Tabla plan / dejansko po urah", "Izravnava dela med delovnimi mesti", "Prioritete odprem vidne na liniji"],
      },
      ljudje([
        "Ali je na liniji tabla s plani in rezultati? Je ažurna?",
        "Ali delavci vedo, za katere kupce in roke delajo?",
        "Ali so predlogi zaposlenih zapisani in odgovorjeni?",
      ]),
    ],
  },
  {
    koda: "SKLADISCE",
    naziv: "Skladišče",
    barva: "#15803d",
    opis: "Prevzem, skladiščenje, točnost zalog in izdaja materiala.",
    podrocje: "npr. Prevzem, regalno skladišče, izdaja",
    teme: [
      varnost(
        [
          "Ali so regali nepoškodovani, označena nosilnost in ni preobremenjeni?",
          "Ali so poti viličarjev ločene od peš poti in proste?",
          "Ali viličaristi vozijo varno (hitrost, breme, vidljivost)?",
          "Ali se težki paketi dvigujejo s pripomočki?",
        ],
        ["Označitev poti viličarjev in peš poti", "Pregled in zaščita regalov", "Oznake nosilnosti na regalih"],
      ),
      red5s(
        [
          "Ali ima vsaka lokacija oznako in je material na pravi lokaciji?",
          "Ali so v skladišču stari, poškodovani ali nepotrebni materiali?",
          "Ali so prehodi in prostor za prevzem prosti?",
          "Ali so embalaža in odpadki sproti odstranjeni?",
        ],
        ["Označevanje lokacij", "Odpis / odstranitev starega materiala", "Označeno mesto za prevzem in izdajo"],
      ),
      {
        koda: "ZALOGE",
        naziv: "Točnost zalog",
        opis: "Ali se stanje v sistemu ujema z dejanskim stanjem na lokaciji.",
        opazuj: [
          "Vzemi 3-5 naključnih postavk: ali se količina na lokaciji ujema s sistemom?",
          "Ali so postavke brez lokacije ali na več lokacijah?",
          "Ali se premiki in izdaje sproti knjižijo?",
          "Ali so ostanki in vračila iz proizvodnje vknjiženi?",
        ],
        vprasaj: ["Kdaj se stanje v sistemu najpogosteje ne ujema?", "Kaj bi pomagalo, da bi bilo stanje vedno točno?"],
        ukrepi: ["Ciklično štetje (vsak dan nekaj postavk)", "Knjiženje ob premiku (ne na koncu dneva)", "Ena lokacija na postavko"],
      },
      {
        koda: "PREVZEM",
        naziv: "Prevzem materiala",
        opis: "Prevzem, kontrola količine in kakovosti ter hitrost vknjiženja.",
        opazuj: [
          "Koliko časa čaka prevzet material, preden je vknjižen in na lokaciji?",
          "Ali se ob prevzemu preveri količina in poškodbe?",
          "Ali so neskladne dobave ločene in označene?",
          "Ali so dobavnice in dokumentacija urejene?",
        ],
        vprasaj: ["Kaj te pri prevzemu najbolj zadrži?", "Kateri dobavitelj ti povzroča največ dela?"],
        ukrepi: ["Označeno mesto za neskladne dobave", "Rok za vknjiženje prevzema (npr. isti dan)", "Povratna informacija nabavi o dobaviteljih"],
      },
      {
        koda: "IZDAJA",
        naziv: "Izdaja materiala za proizvodnjo",
        opis: "Komisioniranje in dostava materiala proizvodnji in montaži.",
        opazuj: [
          "Ali je material za naloge pripravljen pred začetkom dela?",
          "Ali proizvodnja ali montaža prihaja po material sama?",
          "Kolikokrat je izdan napačen ali nepopoln material?",
          "Ali je jasno, kateri nalog je naslednji (prioritete)?",
        ],
        vprasaj: ["Kdaj ne veš, kaj moraš pripraviti?", "Kaj bi pospešilo pripravo materiala?"],
        ukrepi: ["Seznam za pripravo po prioritetah nalogov", "Dogovorjeni časi dostave na linijo", "Komplet materiala po nalogu (kitting)"],
      },
      ljudje([
        "Ali ekipa skladišča ve, katere naloge in odpreme so danes prioritetne?",
        "Ali so težave z zalogami javljene in rešene?",
        "Ali je delo enakomerno razporejeno med zaposlene?",
      ]),
    ],
  },
  {
    koda: "LOGISTIKA",
    naziv: "Logistika",
    barva: "#0d9488",
    opis: "Pakiranje, odprema, nakladanje in notranji transport.",
    podrocje: "npr. Pakiranje, odprema, nakladalna rampa",
    teme: [
      varnost(
        [
          "Ali je nakladanje varno (zavarovano vozilo, rampa, osvetlitev)?",
          "Ali so tovori pravilno pritrjeni in zaščiteni?",
          "Ali so poti viličarjev in peš poti ločene?",
          "Ali so pripomočki za pakiranje (folija, trakovi, rezila) varno shranjeni?",
        ],
        ["Kontrolni seznam varnega nakladanja", "Označitev poti in con nakladanja", "Varna rezila in pripomočki za pakiranje"],
      ),
      red5s(
        [
          "Ali so pripravljene odpreme na označenem mestu po kupcih / datumih?",
          "Ali je embalažni material na voljo in urejen?",
          "Ali so v coni odpreme stvari, ki tja ne sodijo?",
          "Ali so prehodi in rampa prosti?",
        ],
        ["Označene cone za odpreme po dnevih", "Urejen prostor za embalažni material", "Dnevno čiščenje cone odpreme"],
      ),
      {
        koda: "PAKIRANJE",
        naziv: "Pakiranje in embalaža",
        opis: "Ali je izdelek zaščiten, pravilno označen in pakiran po standardu.",
        opazuj: [
          "Ali obstaja standard pakiranja za izdelek (slika, navodilo)?",
          "Ali so pečice in dodatki pravilno zaščiteni pred poškodbami?",
          "Ali so oznake, tablice in dokumentacija priložene in pravilne?",
          "Ali se pakira na enak način pri vseh zaposlenih?",
        ],
        vprasaj: ["Kaj pri pakiranju najpogosteje manjka?", "Katera embalaža ti dela težave?"],
        ukrepi: ["Slikovni standard pakiranja", "Kontrolni seznam dodatkov in dokumentacije", "Zamenjava neustrezne embalaže"],
      },
      {
        koda: "ODPREMA",
        naziv: "Odprema in dokumentacija",
        opis: "Pravočasnost odprem, točnost dokumentacije in komunikacija s prevozniki.",
        opazuj: [
          "Ali so današnje odpreme pripravljene pravočasno?",
          "Ali so dobavnice, izvozni dokumenti in oznake pripravljeni brez iskanja?",
          "Ali je bila v zadnjem času odprema napačna ali nepopolna? Zakaj?",
          "Ali je znan čas prihoda prevoznika?",
        ],
        vprasaj: ["Kaj te pri pripravi odpreme najbolj zadrži?", "Kdaj izveš za spremembo odpreme?"],
        ukrepi: ["Plan odprem za teden vidno na tabli", "Kontrolni seznam pred nakladanjem", "Dogovor o rokih za spremembe odprem"],
      },
      {
        koda: "TRANSPORT",
        naziv: "Notranji transport",
        opis: "Premiki materiala in izdelkov med oddelki - koliko, kako daleč in zakaj.",
        opazuj: [
          "Kolikokrat se izdelek ali material prestavi, preden je odpremljen?",
          "Ali so poti transporta kratke in proste?",
          "Ali so transportna sredstva (vozički, palete) na voljo in v dobrem stanju?",
          "Ali kdo čaka na viličar ali prevoz?",
        ],
        vprasaj: ["Kaj moraš prestavljati, kar bi lahko stalo na pravem mestu?", "Kje najdlje čakaš na prevoz?"],
        ukrepi: ["Določene poti in časi notranjega transporta", "Dodatni vozički / palete", "Nova postavitev cone odpreme bliže montaži"],
      },
      ljudje([
        "Ali ekipa ve, katere odpreme so danes in jutri?",
        "Ali so težave z odpremami javljene prodaji in proizvodnji?",
        "Ali so predlogi zaposlenih zapisani in odgovorjeni?",
      ]),
    ],
  },
  {
    koda: "KAKOVOST",
    naziv: "Kakovost",
    barva: "#be123c",
    opis: "Vhodna, medfazna in končna kontrola, neskladnosti, reklamacije in merila.",
    podrocje: "npr. Vhodna kontrola, končna kontrola",
    teme: [
      {
        koda: "VHODNA",
        naziv: "Vhodna kontrola",
        opis: "Kontrola materiala in delov dobaviteljev pred uporabo.",
        opazuj: [
          "Ali je jasno, katere postavke se kontrolirajo in kako (plan kontrole)?",
          "Ali so neskladni deli ločeni, označeni in zapisani?",
          "Koliko časa material čaka na kontrolo?",
          "Ali so rezultati kontrole zapisani?",
        ],
        vprasaj: ["Pri katerih dobaviteljih najdeš največ napak?", "Kaj potrebuješ, da bi kontrola tekla hitreje?"],
        ukrepi: ["Plan vhodne kontrole po postavkah", "Označeno mesto za neskladen material", "Mesečno poročilo o dobaviteljih"],
      },
      {
        koda: "PROCES",
        naziv: "Kontrola v procesu in končna kontrola",
        opis: "Ali se napake odkrijejo čim bližje mestu nastanka.",
        opazuj: [
          "Ali so kontrolne točke v proizvodnji in montaži določene in se izvajajo?",
          "Ali so zapisi kontrol popolni in ažurni?",
          "Kje v procesu se najdejo napake, ki so nastale veliko prej?",
          "Ali je končna kontrola pečice standardizirana (kontrolni seznam)?",
        ],
        vprasaj: ["Katera napaka najpogosteje pride do končne kontrole?", "Kje bi jo lahko ujeli prej?"],
        ukrepi: ["Kontrolna točka po kritični operaciji", "Kontrolni seznam končne kontrole", "Povratna informacija na mesto nastanka napake"],
      },
      {
        koda: "NESKLADNOSTI",
        naziv: "Neskladnosti in reklamacije",
        opis: "Obravnava neskladnosti in reklamacij kupcev - vzrok, ukrep, preverjanje.",
        opazuj: [
          "Koliko neskladnosti in reklamacij je odprtih? Katere so najstarejše?",
          "Ali ima vsaka reklamacija analizo vzroka (5 zakaj, 8D)?",
          "Ali so ukrepi izvedeni in preverjeni?",
          "Ali se ista napaka ponavlja?",
        ],
        vprasaj: ["Katera reklamacija te je zadnja presenetila?", "Kaj preprečuje, da bi jih zaprli hitreje?"],
        ukrepi: ["Tedenski pregled odprtih reklamacij", "Analiza vzroka (5 zakaj) za vsako reklamacijo", "Preverjanje učinkovitosti ukrepa po 30 dneh"],
      },
      {
        koda: "MERILA",
        naziv: "Merila in kalibracija",
        opis: "Ali so merila ustrezna, umerjena in pravilno uporabljena.",
        opazuj: [
          "Ali imajo merila na delovnih mestih veljavno oznako umerjanja?",
          "Ali so merila primerna za toleranco, ki jo merijo?",
          "Ali so merila shranjena zaščiteno in ne poškodovana?",
          "Ali je evidenca meril ažurna?",
        ],
        vprasaj: ["Kdaj nisi prepričan v rezultat meritve?", "Katero merilo ti manjka?"],
        ukrepi: ["Evidenca meril z roki umerjanja", "Oznake umerjanja na merilih", "Nakup ustreznega merila"],
      },
      {
        koda: "DOKUMENTACIJA",
        naziv: "Dokumentacija in sledljivost",
        opis: "Zapisi kontrol, tablice, serijske številke - ali lahko izdelek izsledimo.",
        opazuj: [
          "Ali lahko za naključno pečico najdeš zapise kontrol in testiranja?",
          "Ali so serijske številke in tablice pravilne in zapisane?",
          "Ali so obrazci za zapise enotni in izpolnjeni?",
          "Ali so veljavne verzije dokumentov na delovnih mestih?",
        ],
        vprasaj: ["Kateri zapis se najpogosteje pozabi izpolniti?", "Kateri obrazec je nepotreben ali podvojen?"],
        ukrepi: ["Poenoten obrazec zapisa kontrole", "Odstranitev zastarelih dokumentov", "Elektronski zapis namesto papirja"],
      },
      ljudje([
        "Ali je stanje kakovosti (napake, reklamacije) vidno na oddelkih?",
        "Ali vodje oddelkov poznajo najpogostejše napake svojega oddelka?",
        "Ali zaposleni vedo, komu javiti napako?",
      ]),
    ],
  },
  {
    koda: "TEHNOLOGIJA",
    naziv: "Tehnologija",
    barva: "#a16207",
    opis: "Tehnična dokumentacija, normativi, programi in uvajanje sprememb v proizvodnjo.",
    podrocje: "npr. Tehnologija, priprava dela, programiranje",
    teme: [
      {
        koda: "DOKUMENTACIJA",
        naziv: "Tehnična dokumentacija",
        opis: "Risbe, kosovnice in navodila - pravilne, popolne in pravočasne.",
        opazuj: [
          "Ali proizvodnja in montaža imata veljavne risbe in kosovnice za trenutne naloge?",
          "Koliko vprašanj ali napak zaradi dokumentacije je bilo ta teden?",
          "Ali so spremembe na risbah jasno označene (verzija)?",
          "Ali se dokumentacija ujema z dejanskim izdelkom?",
        ],
        vprasaj: ["Kaj v dokumentaciji najpogosteje manjka?", "Kdaj delaš po stari risbi?"],
        ukrepi: ["Kontrola dokumentacije pred sprostitvijo naloga", "Označevanje verzij in sprememb", "Povratna informacija iz proizvodnje v tehnologijo"],
      },
      {
        koda: "NORMATIVI",
        naziv: "Normativi in časi",
        opis: "Ali normativi ustrezajo dejanskemu času dela in se posodabljajo.",
        opazuj: [
          "Ali se normativi za izbrane izdelke ujemajo z dejanskimi časi?",
          "Ali so po izboljšavah normativi posodobljeni?",
          "Ali so za nove izdelke normativi določeni pred začetkom proizvodnje?",
          "Kateri izdelki nimajo normativa?",
        ],
        vprasaj: ["Pri katerem izdelku je normativ najmanj realen?", "Kdaj zadnjič si meril dejanski čas?"],
        ukrepi: ["Meritev časa na gembi in popravek normativa", "Seznam izdelkov brez normativa z rokom", "Pregled normativov po vsaki izboljšavi"],
      },
      {
        koda: "PROGRAMI",
        naziv: "Programi in priprava dela",
        opis: "CNC programi, priprava nalogov in nastavitve strojev.",
        opazuj: [
          "Ali so programi za naloge pripravljeni pravočasno?",
          "Ali stroj čaka na program ali popravek programa?",
          "Ali so programi preverjeni in shranjeni v veljavni verziji?",
          "Ali so nastavitve strojev zapisane (parametri, orodja)?",
        ],
        vprasaj: ["Kolikokrat moraš program popravljati na stroju?", "Kaj bi pospešilo pripravo dela?"],
        ukrepi: ["Priprava programov vsaj en dan pred nalogom", "Arhiv veljavnih programov", "Zapis nastavitev za ponavljajoče se izdelke"],
      },
      {
        koda: "SPREMEMBE",
        naziv: "Spremembe in novi izdelki",
        opis: "Uvajanje sprememb in novih izdelkov v proizvodnjo brez zastojev.",
        opazuj: [
          "Ali so spremembe izdelka pravočasno predstavljene proizvodnji in montaži?",
          "Ali so ob uvajanju novega izdelka pripravljeni dokumentacija, programi, orodja in material?",
          "Ali se zaloga starih delov porabi ali zavrže?",
          "Ali so izkušnje prvih kosov zapisane in upoštevane?",
        ],
        vprasaj: ["Katera zadnja sprememba je povzročila težave?", "Kaj bi moral izvedeti prej?"],
        ukrepi: ["Kontrolni seznam uvajanja spremembe", "Sestanek ob prvem kosu nove serije", "Zapis izkušenj in popravkov po prvi seriji"],
      },
      {
        koda: "PODPORA",
        naziv: "Podpora proizvodnji",
        opis: "Odzivnost tehnologije na vprašanja in težave v proizvodnji.",
        opazuj: [
          "Koliko odprtih vprašanj proizvodnje čaka na tehnologijo?",
          "Kako hitro je tehnolog na mestu, ko ga potrebujejo?",
          "Ali so težave in rešitve zapisane, da se ne ponavljajo?",
          "Ali tehnologi redno hodijo v proizvodnjo?",
        ],
        vprasaj: ["Na kakšen odgovor tehnologije najdlje čakaš?", "Kaj bi tehnologija morala videti v proizvodnji?"],
        ukrepi: ["Dnevni obhod tehnologa po proizvodnji", "Seznam odprtih vprašanj z rokom odgovora", "Baza znanih težav in rešitev"],
      },
      ljudje([
        "Ali je seznam odprtih nalog tehnologije viden in prioritiziran?",
        "Ali tehnologija pozna glavne težave proizvodnje ta teden?",
        "Ali so dogovori s proizvodnjo zapisani?",
      ]),
    ],
  },
];

export type KorakVodica = { naslov: string; cas: string; tocke: string[] };

/** Potek audita (30-60 min). */
export const KORAKI: KorakVodica[] = [
  {
    naslov: "Priprava",
    cas: "5 min, pred auditom",
    tocke: [
      "Izpolni datum, oddelek, področje in udeležence; po želji izberi eno temo oddelka.",
      "Preglej odprte akcije prejšnjih auditov tega oddelka (spodaj na strani).",
      "Povej vodji oddelka, da prihajaš - audit ni kontrola ljudi, ampak procesa.",
      "Vzemi tablico / telefon: zapisnik, števci, slike.",
    ],
  },
  {
    naslov: "Preverjanje odprtih akcij",
    cas: "10 min",
    tocke: [
      "Na mestu preveri odprte akcije: je izvedeno? deluje? je postalo način dela?",
      "Izvedeni akciji nastavi status Preverjeno in zapiši rezultat.",
      "Če akcija stoji: zakaj? kdo pomaga? nov rok.",
    ],
  },
  {
    naslov: "Obhod in opazovanje",
    cas: "15-25 min",
    tocke: [
      "Pojdi tja, kjer nastaja vrednost - ne v pisarno.",
      "Opazuj in odgovarjaj na vprašanja teme v zavihku Vprašanja.",
      "Štej, kar se ponavlja (števci), slikaj stanje, nariši skico na tablo.",
      "Zapisuj dejstva (kaj, kje, kolikokrat), ne mnenj.",
    ],
  },
  {
    naslov: "Pogovor z zaposlenimi",
    cas: "10 min",
    tocke: [
      "Vprašaj, poslušaj, zapiši - problem je v procesu, ne v človeku.",
      "Vprašaj odprto: \"Kaj te pri delu najbolj ovira?\" in \"Kaj bi spremenil?\"",
      "Pohvali, kar je dobro narejeno - tudi to zapiši.",
    ],
  },
  {
    naslov: "Akcije",
    cas: "10 min",
    tocke: [
      "Izberi 1-3 najpomembnejše ugotovitve - ne deset.",
      "Vsaka akcija: ugotovitev, ukrep, en odgovoren, rok.",
      "Majhno reši vodja oddelka takoj, večje gre v projekt z nosilcem.",
    ],
  },
  {
    naslov: "Zaključek",
    cas: "5 min",
    tocke: [
      "Povzemi ugotovitve v zapisniku (3 stavki).",
      "Z vodjo oddelka potrdi akcije, odgovorne in roke.",
      "Zaključi audit (zelen gumb zgoraj) in pošlji e-mail s PDF.",
    ],
  },
];

/** Pravila, ki jih vodja vidi vedno. */
export const PRAVILA = [
  "Pojdi in poglej - odločaj na podlagi dejstev z mesta dela.",
  "Vprašaj zakaj in poslušaj - zaposleni najbolje poznajo težave.",
  "Problem je v procesu, ne v človeku; audit ni iskanje krivcev.",
  "Ena zaključena, preverjena akcija je vrednejša od desetih zapisanih.",
  "Varnost je vedno na prvem mestu.",
];

/** Splošna vprašanja (vedno uporabna, v vsakem oddelku). */
export const SPLOSNA_VPRASANJA = [
  "Kaj je danes največja težava oddelka?",
  "Ali oddelek ve, kakšen je cilj dneva in kako mu gre?",
  "Kaj se je spremenilo od zadnjega audita (akcije, ljudje, procesi)?",
  "Kaj bi tukaj videl obiskovalec, ki prvič pride v podjetje?",
  "Kje oddelek potrebuje pomoč vodstva?",
  "Kaj je ena stvar, ki jo lahko popravimo še ta teden?",
];

/** Predloga zapisnika (vstavi se v prazno polje). */
export const PREDLOGA_ZAPISNIKA = `PREGLED ODPRTIH AKCIJ
-

OPAŽANJA (dejstva: kaj, kje, kolikokrat)
-

POGOVOR Z ZAPOSLENIMI
-

DOBRO NAREJENO
-

UGOTOVITVE / VZROKI
-

POVZETEK (3 stavki)
- `;
