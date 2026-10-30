// Zgodovina verzij - prikazana v "i" popupu (desni zgornji kot).
// Pravilo: male spremembe 1.01 -> 1.02, večje spremembe / nova funkcija / podstran -> 2.01.

export type ChangelogEntry = {
  verzija: string;
  datum: string;
  spremembe: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    verzija: "26.09",
    datum: "30. 10. 2026",
    spremembe: [
      "Doizdaja: v filtru »Ne štej v delež izdanega« je pred nazivom skupine še klasifikat (npr. »096 · Pločevina«), skupine so razvrščene po klasifikatu. Iskanje v filtru najde skupino tudi po številki.",
    ],
  },
  {
    verzija: "26.08",
    datum: "29. 10. 2026",
    spremembe: [
      "Doizdaja - celozaslonski prikaz: nov modri gumb Osveži v glavi - podatki se znova naložijo v ozadju, prikaz ostane čez cel zaslon.",
      "Sync na enem zavihku ali oknu (npr. aplikacija na prvem monitorju) takoj osveži tudi ostala odprta okna istega brskalnika (npr. zaslon v skladišču na drugem monitorju) - brez klika in brez izhoda iz celozaslonskega prikaza. Samodejna osvežitev vsaki 2 minuti ostane.",
    ],
  },
  {
    verzija: "26.07",
    datum: "29. 10. 2026",
    spremembe: [
      "Delovni plan: desno zgoraj je zdaj pregled virov podatkov kot na ostalih straneh (krogec stanja in čas uvoza nalogov; z odprto Kontrolo plana še naročila, odpreme in material). Klik odpre stran Podatki.",
      "Po syncu se Delovni plan sam osveži; če imaš neshranjene spremembe plana, se ne osveži (spremembe ostanejo), pokaže pa obvestilo, da so na voljo novi podatki.",
    ],
  },
  {
    verzija: "26.06",
    datum: "29. 10. 2026",
    spremembe: [
      "Meni: razprti razdelki in moduli ostanejo razprti, ko odpreš stran v drugem razdelku - zapreš jih samo s klikom. Razdelki so privzeto zloženi, razdelek strani, na katero greš, se razpre sam.",
    ],
  },
  {
    verzija: "26.05",
    datum: "29. 10. 2026",
    spremembe: [
      "Doizdaja - obvestilo v Teams: na vsakem materialu je kljukica za obvestilo, gumba Izberi vse / Odznači vse in modri gumb Obvesti v Teams. Okno pokaže predogled (material, nalogi s krovnim, količina, rok) in pošlje sporočilo v chat Skladišče obveščanje.",
      "Sporočilo sestavi aplikacija (Teams kartica): za vsak material okvir v barvi dni čakanja (zelena / rumena / rdeča), količina za izdajo, prevzeto, zaloga, nalogi z rokom in gumb Odpri Doizdajo. Več kot 8 materialov gre v več kartic.",
      "Po pošiljanju se pri materialu pokaže »Obveščeno 29. 10. 10:15« (s pošiljateljem v hover tekstu) in število novih nalogov, ki še niso bili v obvestilu - isti material se ne pošilja po nepotrebnem dvakrat.",
      "Pošiljanje gre prek strežnika aplikacije (naslov webhooka je skrit, samo za prijavljene). Baza: migracija 026_doizdaja_obvestilo.sql.",
    ],
  },
  {
    verzija: "26.04",
    datum: "29. 10. 2026",
    spremembe: [
      "Sync: zaklep v bazi - isto datoteko lahko naenkrat uvaža samo en uporabnik. Če dva kliknete Sync hkrati, drugi dobi obvestilo »ravnokar uvaža …« in datoteka se ne uvozi dvakrat. Zaklep po 5 minutah poteče (npr. zaprt brskalnik med uvozom).",
      "Stanje »sinhronizirano« zdaj primerja čas datoteke v mapi s časom datoteke, ki je bila nazadnje uvožena (prej s časom uvoza) - ura na serverju z izvozi ne vpliva več na stanje.",
      "Stran Podatki in okno Sync v glavi: nova podatka »Preverjeno« (kdaj so bile nazadnje prebrane datoteke v mapi) in »Uvožena datoteka« (čas uvožene datoteke). »Uvoženo« ostane čas zadnjega uvoza - če v mapi ni novejše datoteke, se ne spremeni.",
      "Firefox si zadnjo izbiro mape zapomni 30 minut - po osvežitvi strani stanje ostane znano (ne sivo).",
      "Baza: migracija 025_sync_stanje.sql.",
    ],
  },
  {
    verzija: "26.03",
    datum: "29. 10. 2026",
    spremembe: ["Meni: modul Podatki je pritrjen na spodnji rob levega menija, ločen s črto - viden je vedno, tudi ko meni drsi."],
  },
  {
    verzija: "26.02",
    datum: "29. 10. 2026",
    spremembe: [
      "Sync deluje tudi v Firefoxu: Sync vse (v glavi ali na strani Podatki) odpre izbiro mape - izbereš mapo z izvozi in uvozijo se samo novejše datoteke. Firefox si mape ne zapomni, zato samodejni sync in stanje datotek brez klika ostaneta samo v Edge in Chrome.",
      "Stran Podatki: novo polje Uvoz več datotek naenkrat - povlečeš poljubne izvoze (npr. vse iz mape), aplikacija jih razporedi po imenu, uvozi samo novejše od zadnjega uvoza, datoteke, ki jih ne pozna, pa prezre (izpiše jih v obvestilu). Ko bo nov izvoz dodan na seznam, se bo začel uvažati sam.",
    ],
  },
  {
    verzija: "26.01",
    datum: "29. 10. 2026",
    spremembe: [
      "Nov sync podatkov iz ERP: aplikacija bere izvoze neposredno iz mape na serverju (\\\\rokadasrv\\RISPSQL$\\Dokumentacija\\Izvoz_excel_dir), ki jo worker posodablja vsakih nekaj ur. Mapo enkrat povežeš z gumbom Poveži mapo (Edge ali Chrome), brskalnik si jo zapomni - nič ni treba nameščati.",
      "Nov gumb Sync v glavi (levo od »i«): krogec pove stanje (zelen = vse sinhronizirano, rdeč = nova datoteka ni uvožena, moder = sync v teku, siv = mapa ni povezana). Klik pokaže datoteke s časom v mapi in časom uvoza ter gumb Sync vse.",
      "Nov modul Podatki (na dnu menija) s stranjo Sync iz ERP: kvadratek za vsako datoteko (nalogi, material, naročila VD200, odpreme VD300, prevzemi, izdaje) s stanjem, časi, rezultatom uvoza in opozorili, gumb Sync za posamezno datoteko, Sync vse in ročni uvoz (povleci datoteko v kvadratek).",
      "Samodejni sync vsakih 5 minut, vklopljiv za posamezen brskalnik (npr. zaslon v skladišču).",
      "Polja za uvoz so odstranjena s strani Zasedenost, Prioritete, Pakiranje in Doizdaja - desno zgoraj je zdaj vir podatkov (stanje in čas uvoza, klik odpre stran Podatki). Po syncu se strani same osvežijo.",
      "Odstranjen star testni sync prek strežnika (stran /test), ki na spletu ni deloval.",
    ],
  },
  {
    verzija: "25.03",
    datum: "29. 10. 2026",
    spremembe: [
      "Doizdaja: barva kartice pove, koliko delovnih dni material čaka na izdajo od prevzema (dan prevzema = 1. dan): 1.-2. dan zelena, 3. dan rumena, od 4. dne rdeča z oznako dni (npr. »6. dan«).",
      "Kartica ne izgine več po izbranem obdobju: ostane, dokler izvoz izdaj ne pokaže, da je material izdan na nalog. Izbirnik »Prevzemi N dni« je odstranjen.",
      "En stolpec na šifro materiala - vsi prevzemi iste šifre so združeni. Šifra je v glavi stolpca večja (različne šifre s podobnim nazivom, npr. cevovodi čiščenja, se ločijo na prvi pogled).",
      "Nove kartice se zaznajo iz prevzemov zadnjih 4 delovnih dni in se shranijo v bazo (čakajoče izdaje); tako ostanejo tudi po tem obdobju. Če je izvoz izdaj starejši od prevzemov, se nove kartice ne zaznavajo.",
      "Kartice-filtri: Nov prevzem, 3. dan, Zamuja, Ni manjkalo. Privzet vrstni red: najprej material, ki najdlje čaka. Zaloga, ki ne pokrije vsega, je na nalogu označena (na voljo X / ni zaloge).",
      "Po nalogih: nova stolpca Prevzeto (datum) in Čaka (delovni dnevi).",
      "Baza: migracija 024_doizdaja_cakanje.sql.",
    ],
  },
  {
    verzija: "25.02",
    datum: "29. 10. 2026",
    spremembe: [
      "Doizdaja - Aktivni nalogi: klik na nalog (puščica ▸) pokaže njegov material - ident, naziv, skupina, planirano, izdano, za izdajo, zaloga, naročeno in stanje (neizdano / delno izdano / izdano). Tabela se razvršča s klikom na glavo.",
      "Nov filter Material razprtega naloga: privzeto sta prikazana neizdan in delno izdan material, izdan se vklopi po potrebi. Gumb Razpri vse / Zloži vse.",
      "Zaloga neizdanega materiala je zelena, če pokrije izdajo (lahko izdaš), sicer rdeča. Skupine, ki se ne štejejo v delež (npr. pločevina), so označene z »ne šteje«.",
      "Iskanje v zavihku Aktivni nalogi najde tudi naloge, ki iskani ident še potrebujejo.",
    ],
  },
  {
    verzija: "25.01",
    datum: "29. 10. 2026",
    spremembe: [
      "Skladišče - nova stran Doizdaja materiala (Rutinsko delo): pokaže material, ki je bil na aktivne delovne naloge izdan samo delno in je zdaj prispel s prevzemom od dobavitelja, ter na katere naloge in koliko ga je treba še izdati.",
      "Uvoz dveh izvozov iz ERP: Kreiranje izdaj v proizvodnjo (shranijo se samo aktivni nalogi, status O in D) in Prevzem od dobavitelja. Krovni nalogi so iz uvoza delovnih nalogov (Zasedenost).",
      "Upoštevajo se samo nalogi, ki so že nabrani: izdanih vsaj 50 % vrstic (nastavljivo), pločevina in polizdelki (P-...) se v delež ne štejejo, ker se izdajo posebej. Nalog brez izdaje ali še v nabiranju se ne pokaže.",
      "Material, ki ga je bilo že pred prevzemom dovolj na zalogi (trenutna zaloga - prevzeto), ni manjkal in je privzeto skrit (kartica Ni manjkalo).",
      "Pogled Po materialu: stolpec za vsak prevzet material (ident, naziv, prevzeto, zaloga, dobavitelj) in pod njim nalogi, grupirani po krovnem, s količino za izdajo - zelena Izdaj, rumena Delno na zalogi, rdeča Ni zaloge.",
      "Pogleda Po nalogih (razvrstljiva tabela, grupiranje po krovnih) in Aktivni nalogi (delež izdanega in stanje vsakega naloga - za kontrolo filtra).",
      "Gumb Zaslon: celozaslonski prikaz za zaslon v skladišču (tudi s povezavo ?zaslon=1), podatki se osvežijo vsaki 2 minuti. Brskalnik si zapomni nastavitve.",
      "Meni: modul trenutne strani se zdaj lahko zloži, razdelki (oranžni naslovi) se razpirajo in zlagajo s klikom. Privzeto je razprt samo razdelek trenutne strani, brskalnik si zapomni izbiro.",
      "Baza: migracija 023_doizdaja.sql.",
    ],
  },
  {
    verzija: "24.06",
    datum: "28. 10. 2026",
    spremembe: [
      "Uvoz delovnih nalogov podpira novo obliko izvoza iz ERP (naslov »DELOVNI NALOGI«, glava v 3. vrstici, datumi kot pravi Excel datumi). Datumi se berejo brez časovnega zamika; stara oblika se še vedno pravilno prebere.",
    ],
  },
  {
    verzija: "24.05",
    datum: "26. 10. 2026",
    spremembe: [
      "Pakiranje: nov stolpec Printano na koncu tabele odprem. Ko prenesete PDF navodil, se pri vsaki natisnjeni odpremi shrani barva lista in pokaže kvadratek te barve; dokler odprema ni natisnjena, je prazno. Hover pokaže čas tiska, prvi tisk in kdo je natisnil; stolpec se razvršča po času tiska.",
      "Ob ponovnem tisku se barva posodobi na zadnjo natisnjeno. Status odpreme se ne spreminja.",
      "Baza: migracija 022_pakiranje_printano.sql.",
    ],
  },
  {
    verzija: "24.04",
    datum: "26. 10. 2026",
    spremembe: [
      "Pakiranje PDF: tabela se nikoli ne prelomi na dva lista. Če checklista ne gre na 1 list, se pisava tabele manjša po 0,5 px (od 12 px do najmanj 11 px). Če tudi tako ne gre ali je palet več kot 4, ostane osnovna velikost in tabela, ki ne gre več na list, gre cela na naslednji list.",
    ],
  },
  {
    verzija: "24.03",
    datum: "26. 10. 2026",
    spremembe: [
      "Pakiranje - izbira barve: pri vsaki odpremi v oknu PDF je majhen kvadratek z barvo; klik odpre izbiro samo izbranih barv (brez besedila).",
      "Privzeto 1 list z lokacijo na odpremo.",
      "Nova logika »1 na paleto (peč)«: vsaka peč je na svoji paleti, checklista ima za vsako paleto svojo manjšo tabelo (Paleta 1 / 2 in peč). Postavke kompleta s pečjo gredo na palete tega kompleta, ostale (vozički, pladnji ...) se enakomerno razdelijo med vse palete (npr. 30 pladnjev na 2 paleti = 15 + 15).",
      "PDF poenostavljen za proizvodnjo: podatki odpreme (kupec, odpremni nalog ...) so manjši, število peči in postavk je majhno desno nad tabelo, glavna je tabela artiklov s kvadratki.",
    ],
  },
  {
    verzija: "24.02",
    datum: "26. 10. 2026",
    spremembe: [
      "Pakiranje: popravljene glave tabel (odpreme in postavke odpreme) - niso več pod prvo vrstico.",
      "Lokacija na PDF je vedno iz stolpca Lokacija v VD300 (ne več kupec); če lokacije ni, piše »Lokacija ni vpisana«. V tabeli sta kupec in lokacija vsak v svojem stolpcu.",
      "Barve: privzeto na izbiro Bela in Fluo rumena (selektor barv ostane). Barvo lista izbereš za vsako odpremo posebej v oknu PDF (spustni seznam z barvo), ni več samodejnega menjavanja; stolpec barve v tabeli je odstranjen.",
      "Privzeto 1 list z lokacijo na paleto (peč).",
      "Checklista: vrstice navpično poravnane (kvadratek in besedilo na sredini vrstice), odstranjeni stolpec Na peč, navodilo o paleti na peč in polja za podpis; pod tabelo je polje Opomba (2-3 vrstice) za ročni zapis po tisku.",
    ],
  },
  {
    verzija: "24.01",
    datum: "26. 10. 2026",
    spremembe: [
      "Proizvodnja: nov razdelek Orodja s prvim orodjem Pakiranje - pregled odprtih odprem VD300 (brez zaključenih in storniranih) za vodjo pakiranja.",
      "Tabela odprem: odprema, datum, kupec, lokacija, status, število peči (= palet), postavke in stanje zaloge (zaloga iz izpisa materiala, razdeljena po datumu odpreme). Klik na vrstico jo označi, puščica pokaže postavke po skupinah (kompleti) z vrsto artikla in zalogo.",
      "Filtri: iskanje (odprema, kupec, lokacija, artikel), kupec, datum odpreme, s pečmi / brez peči, zaloga manjka / na zalogi in kartice statusov odpreme.",
      "PDF navodila za pakiranje za označene odpreme: za vsako odpremo checklista s kvadratki za kljukanje (postavke po skupinah, količina na peč, opozorilo, če artikla ni na zalogi, storitve posebej, podpis pakiral / kontroliral) in A4 list z veliko lokacijo na fluorescentnem ozadju za paleto. Barvo izbereš (več barv se menja po odpremah), list je lahko 1 na odpremo ali 1 na peč (Paleta 1/2).",
      "Povzetek za skladišče (TXT): izbereš, kaj naj skladišče nabere (peči, nape, podstavki, vozički, pladnji, mehčalci ...), samo kar je na zalogi (kar manjka, je posebej), seštevek ali po odpremah; Kopiraj za Teams ali Prenesi .txt.",
      "Uvoz odprem VD300 shrani še lokacijo dostave, skupine postavk (stolpec Oddelek), državo, kupčevo naročilo in opombe; shranijo se tudi odprte odpreme brez naročila VD200. Baza: migracija 021_odpreme_pakiranje.sql (nato odpreme uvozi znova).",
    ],
  },
  {
    verzija: "23.03",
    datum: "23. 10. 2026",
    spremembe: [
      "Kontrola plana: klik na »manjka« ali »DN brez naloga« odpre stanje artikla - zaloga matično, ostala zaloga, naročeno skupaj, planirano DN in prosta zaloga iz izpisa materiala (opozorilo, če se naročeno v ERP razlikuje od VD200).",
      "Popravek: okna (popup) se vedno prikažejo pred stranjo s temnim ozadjem - okno, odprto iz panela kontrole, je bilo prej prosojno in pod planom.",
      "Pod tem tabela vseh naročil artikla (odprema, naročilo in kupčevo naročilo, kupec z lokacijo in državo, status, kosi, pokritje: zaloga / nalog / DN / v odpremi / manjka) in delovni nalogi artikla iz uvoza (razpisano, izdelano, odprto, rok). Opozorilo, če ima ERP več kosov na DN, kot je odprtih nalogov v uvozu.",
    ],
  },
  {
    verzija: "23.02",
    datum: "23. 10. 2026",
    spremembe: [
      "Kontrola plana: ločeno »manjka« (rdeče, ni zaloge ne naloga) in »DN brez naloga« (oranžno, kose pokrije planirana količina DN v ERP, naloga pa ni v uvozu nalogov - npr. zaključen). Postavka samo z DN brez naloga ni več med odprtimi (enako kot na Prioritetah).",
    ],
  },
  {
    verzija: "23.01",
    datum: "23. 10. 2026",
    spremembe: [
      "Delovni plan: nov gumb Kontrola plana (desno ob oddelkih). Odpre desni panel z naročili po prioritetah, seznam krovnih nalogov se skrije. Brskalnik si zapomni, ali je panel odprt.",
      "Lista je ista kot na Prioritetah (ista FIFO razdelitev, potrjena naročila, samo izdelki, zamik dni iz nastavitev Prioritet), prikazane so samo postavke, ki morajo skozi proizvodnjo: kljukica, odprema, ident in naziv, kosi, krovni.",
      "Kljukica se postavi sama, ko so nalogi postavke na planu oddelka z dovolj kosi (zelena, vrstica prečrtana in siva); oranžna = samo del kosov (npr. 40/60), rdeč X = postavka nima delovnega naloga, – = nalog v tem oddelku nima dela. Osveži se ob vsaki spremembi plana.",
      "Pod datumom odpreme je konec plana; rdeč, če se plan konča po roku. Filter Odprti / Vsi in iskanje.",
      "Klik na krovni: če še ni na planu, se izbere za postavitev s klikom na dan; sicer se njegove postavitve poudarijo na planu.",
    ],
  },
  {
    verzija: "22.01",
    datum: "23. 10. 2026",
    spremembe: [
      "Delovni plan - urejanje krovnega: nov stolpec Plan kos - pri vsakem nalogu vpišeš, koliko kosov delamo v tej postavitvi (npr. 40 od 100). Ure postavitve se izračunajo samo za planirane kose.",
      "Preostali kosi ostanejo nerazporejeni: krovni ostane na seznamu z urami preostalih kosov in ga lahko znova povlečeš na plan (nova postavitev vzame samo še preostale kose). Tako en nalog razdeliš na več dni, tednov ali celic.",
      "Ob novem uvozu se izdelani kosi odštejejo od najzgodnejše postavitve naloga.",
      "Delni kosi so označeni: na seznamu krovnih (npr. 40/100 kos), na postavitvi z * in v hover tekstu, v PDF / Word workflowu (40/100 kos) in v Excel izvozu.",
      "Baza: migracija 020_delovni_plan_kosi.sql.",
    ],
  },
  {
    verzija: "21.01",
    datum: "23. 10. 2026",
    spremembe: [
      "Delovni plan: vsak oddelek (Proizvodnja, Montaža, Elektro montaža, Testiranje) ima novo delovno mesto Dodatno delo za delo izven redne proizvodnje (pakiranje elektronik, povezovalni kompleti ...). Ni v dnevni rutini in ne šteje v seštevek oddelka.",
      "Na Dodatno delo lahko povlečeš krovne naloge ali z gumbom + Naloga dodaš prosto nalogo (naziv, ure, začetek, opomba). Proste naloge so temno sive, v PDF / Word workflowu označene kot dodatno delo.",
      "Delovni plan: višje celice in postavitve, večje polje za zaposlene in več razmaka med delovnimi mesti.",
      "Baza: migracija 019_delovni_plan_dodatno_delo.sql.",
    ],
  },
  {
    verzija: "20.03",
    datum: "22. 10. 2026",
    spremembe: [
      "Delovni plan - PDF / Word workflow: namesto roka izdelave so pri vsakem nalogu datumi odprem naročil, ki jih ta nalog pokrije (npr. 16.11, 25.12). Razdelitev je FIFO, enaka kot na Prioritetah: zaloga pokrije najzgodnejša naročila, nalogi po roku izdelave naslednja; potrjena naročila VD200, odpreme VD300 in material. Na koraku je prva odprema; če se plan konča po njej, je korak označen PO ODPREMI (rdeče).",
      "Nova 1. stran PRERAZPOREDITEV ZAPOSLENIH: ena tabela za vse celice (navpično ime celice) - za vsak korak (krovni nalog) in dan število oseb (planirane ure ÷ ure na dan), pod celico zaposleni in prosti ljudje brez naloga. Od 2. strani naprej so koraki po celicah (en list na celico).",
    ],
  },
  {
    verzija: "20.02",
    datum: "21. 10. 2026",
    spremembe: [
      "Prioritete - odpreme VD300: uvozi se celoten izvoz odprem (tudi zaključene, npr. filter od začetka leta). Aplikacija shrani samo odpreme še odprtih naročil in zadnjih 30 dni.",
      "Odprema, zaključena danes, ko se naročilo zapre šele ponoči, ne kaže več Manjka - postavka je V odpremi in ne porabi zaloge drugih naročil (npr. 100-325.1000 na naročilu 202600790).",
      "Opozorilo, če so odpreme uvožene pred naročili ali niso uvožene.",
    ],
  },
  {
    verzija: "20.01",
    datum: "21. 10. 2026",
    spremembe: [
      "Prioritete: nov uvoz Material (.xlsx) - celoten izpis materiala iz ERP se shrani v splošno tabelo spl_material (en zapis na ident, vsak uvoz jo posodobi) in velja za vse strani.",
      "Zaloga, planirana količina DN in rezervacije se računajo iz izpisa materiala, ne več iz VD200 (prosta zaloga v VD200 je v ERP napačna - npr. kitkompleti so kazali -47). Za idente, ki jih v materialu ni, ostane zaloga iz VD200 (oznaka VD200).",
      "Prosto zalogo računa aplikacija sama: zaloga + DN − razpisano kot material na DN − naročila. Pravilo »prosta zaloga ERP < 0 = Manjka« je odstranjeno.",
      "Nova rezervacija: količina, razpisana kot material na delovne naloge (npr. peč z zaloge za predelavo), se najprej odšteje od zaloge; če zaloga ne zadošča, zmanjša prihod iz naloga. Po artiklih nov stolpec Za DN, pri nalogu Material za DN.",
      "Po artiklih: v podrobnostih izračun proste zaloge in prosta zaloga ERP; opozorilo, ko se naročeno v ERP in v VD200 razlikuje ali sta izvoza uvožena več kot dan narazen.",
      "Sync s serverja: dodana datoteka material.xlsx. Baza: migracija 018_spl_material.sql.",
    ],
  },
  {
    verzija: "19.01",
    datum: "20. 10. 2026",
    spremembe: [
      "Delovni plan: izvoz workflowa v PDF (za tisk in obešanje na celico) - vsako delovno mesto vedno na enem listu (do 3 koraki v vrsti, do 6 na list; več korakov ali nalogov se sorazmerno pomanjša), oštevilčeni koraki (krovni nalog, dan in datum začetka in konca po planu, ure, rok izdelave, naročnik, nalogi s celim nazivom), povezani s puščicami. Cel krovni ima zeleno oznako (VSI NALOGI 4/4), delni oranžno (VKLJUČENI NALOGI 2/6), konec po roku je rdeč.",
      "Delovni plan: isti workflow tudi v Wordu (.docx) za popravke in dopise. Workflow zajame prikazane tedne.",
      "Izvoz z izbiro formata: namesto več gumbov za isti izvoz je izbira formata in en gumb Prenesi (Delovni plan: PDF / Word / Excel, Prioritete: Excel / TXT, Auditi in Gemba walk: PDF / e-mail). Zadnji izbran format si brskalnik zapomni.",
    ],
  },
  {
    verzija: "18.01",
    datum: "20. 10. 2026",
    spremembe: [
      "Delovni plan: v postavitvi krovnega naloga (klik na postavitev) lahko z X izključiš posamezne naloge - na diagramu ostane krovni z oznako vključenih nalogov (npr. 2/7), ure se računajo samo iz vključenih nalogov.",
      "Izključeni nalogi ostanejo v seznamu krovnih (ostane x/y nalogov) - ponovna postavitev istega krovnega zajame samo še nerazporejene naloge. Nalogi, ki so že v planu, so v seznamu označeni s kljukico.",
      "Ure postavitve se po vsakem uvozu nalogov preračunajo iz vključenih nalogov (izdelano se odšteje); ročni vnos ur ostane kot možnost (Ročno vpisane ure). Excel izvoz plana ima stolpec Nalogi.",
      "Baza: migracija 017_delovni_plan_nalogi.sql (stolpca nalogi in rocne_ure; obstoječe postavitve ostanejo z ročnimi urami).",
    ],
  },
  {
    verzija: "17.02",
    datum: "19. 10. 2026",
    spremembe: [
      "Telefon: glava aplikacije ni več širša od zaslona (manjši logo, gumb Izhod kot ikona) - gumb Izhod in plavajoči gumb Nov audit sta spet na zaslonu.",
      "Stran se na telefonu ne more več razširiti čez rob zaslona; preklopniki filtrov (npr. Odprte / Zamuja / Vse) se po potrebi drsijo.",
      "KPI auditov: odstranjena pokritost oddelkov (kartica, tabela in nastavitev).",
    ],
  },
  {
    verzija: "17.01",
    datum: "19. 10. 2026",
    spremembe: [
      "Auditi - ugotovitve: vrsta (Nevarno, Neskladnost, Opažanje, Predlog izboljšave, Dobra praksa), prioriteta A / B / C, ki sama nastavi rok (1 / 7 / 30 dni), in Rešeno na mestu (akcija se zapiše in zapre).",
      "Ocena akcije: velikost napake / škode 1-5, pomembnost za vodstvo 1-5 (pomen = velikost × pomembnost), ocena prihranka €/leto in cena ukrepa (povračilo v mesecih).",
      "Slike akcije PRED in PO (kamera telefona); za zaprtje akcije je potrebna slika PO ali opis rezultata.",
      "Hitro preverjanje odprtih akcij oddelka na auditu: Še odprto (komentar, nov rok) / Izvedeno / Preverjeno z enim klikom, komentar se doda k rezultatu z datumom.",
      "Nova stran Nastavitve auditov: oddelki (barva, vodja, e-mail, aktiven), teme, vprašanja in tipični ukrepi (dodaj, popravi, premakni, odstrani), cilji KPI in roki prioritet. Vodja oddelka je predlagan kot odgovoren in naveden v PDF.",
      "Nov zavihek KPI: auditi na teden, zamujene akcije, pravočasno zaprte, ocenjen prihranek; graf odprtih in zamujenih akcij, ugotovitve po oddelku in vrsti, matrika pomena, najpogostejše teme, top 10 akcij in akcije po odgovornih.",
      "Telefon: zavihki delov audita, spodnja vrstica Slika / + Ugotovitev / Shrani, okna čez cel zaslon z vedno vidnim gumbom Shrani, kartice namesto tabel, plavajoč gumb Nov audit, večja polja (brez povečevanja strani na iPhonu), osnutek audita se sproti hrani v brskalniku.",
      "Tipičen ukrep v vprašanjih odpre novo ugotovitev s tem ukrepom. Excel izvoz tudi na zavihku Akcije. PDF in e-mail z vrsto, prioriteto, oceno, slikami ugotovitev in pohvalami (dobre prakse).",
      "Baza: migracija 016_auditi_nastavitve_ocena.sql (šifranti oddelkov, tem, vprašanj, nastavitve; novi stolpci akcij in slik).",
    ],
  },
  {
    verzija: "16.01",
    datum: "19. 10. 2026",
    spremembe: [
      "Nov modul Management (prvi v meniju in na domači strani) z razdelkom Rutinsko delo.",
      "Nova stran Auditi (/management/auditi): splošni gemba walki vodstva po oddelkih - tabela izvedenih auditov (filtri oddelek, status, iskanje, Excel) z gumbom Nov audit in zavihek Akcije (akcije vseh auditov po oddelkih).",
      "Nov audit se odpre na svoji strani: datum, oddelek (Proizvodnja, Montaža, Skladišče, Logistika, Kakovost, Tehnologija), tema oddelka, področje, izvajalec, udeleženci; zapisnik, vodič, vprašanja po oddelku in temi (dodajanje / odstranjevanje lastnih vprašanj), časovnik, prazni števci, akcije, slike, tabla / skice, povpraševanja, PDF in e-mail - enake funkcije kot pri Produktivnosti.",
      "Baza: migracija 015_management_auditi.sql (tabele fp_aud_audit, fp_aud_akcije, fp_aud_priloge, fp_aud_vprasanja; datoteke v mapi aud/).",
      "Priloge, vprašanja, časovnik, števci in PDF / e-mail so skupne komponente Produktivnosti in Auditov (popravek se prenese v oba modula).",
    ],
  },
  {
    verzija: "15.01",
    datum: "19. 10. 2026",
    spremembe: [
      "Nova testna stran /test: sync izvozov (nalogi, naročila VD200, odpreme VD300) iz mape na serverju \\\\rokadasrv\\RISPSQL$\\Dokumentacija\\Podatki za aplikacije.",
      "Nova komponenta ikona Sync: krogec stanja (zelena = sinhronizirano, modra = sync v teku, rdeča = ni sinhronizirano), klik pokaže datoteke strani s časom izvoza na serverju in časom zadnjega uvoza ter gumb Sync. Po izbiri samodejni sync ob prihodu na stran.",
      "Deluje samo, ko aplikacija teče na strežniku v omrežju podjetja (lokalno), ne na Vercelu.",
      "Popravek: nalog s Krovni DN = 0 (izvoz pri nalogu brez krovnega) ni več prikazan kot krovni nalog \"0\" (grupiranje po krovnih, TXT).",
    ],
  },
  {
    verzija: "14.01",
    datum: "19. 10. 2026",
    spremembe: [
      "Prioritete nalogov: nov prikaz \"Grupiraj po krovnih nalogih\" - krovni nalogi razvrščeni po prvi odpremi (najzgodnejša med njegovimi nalogi), v vsakem krovnem nalogi po prvi odpremi. Nalog brez krovnega je samostojna skupina. Rok naloga ne določa vrstnega reda, nalog, ki ne bo pravočasno končan, ima oznako \"zamuja\".",
      "Grupiran prikaz ima svoj TXT za vodjo montaže (krovni → nalog, količina, ident, naziv, kupci z datumom odpreme) in Excel s stolpcem \"Prva odprema krovnega\". TXT v Odpremah po tednih ostaja nespremenjen.",
    ],
  },
  {
    verzija: "13.03",
    datum: "15. 10. 2026",
    spremembe: [
      "Tabla izboljšav: na začetku vrstice krogec stanja - zelen s kljukico = akcija izvedena (vidno na telefonu brez drsenja do stolpca Status).",
      "Koledar gemb na telefonu: razprt je samo trenutni mesec, ostali so zloženi (pike pokažejo stanje tednov) in se razprejo s klikom. Na tablici in monitorju ostane prikaz vseh mesecev.",
    ],
  },
  {
    verzija: "13.02",
    datum: "14. 10. 2026",
    spremembe: [
      "Popravek: vnosna polja števil (cilji KPI, družine, akcije, normativi, zasedenost) ne pišejo več ločila tisočic - 10.000 se ob ponovnem shranjevanju ni več spremenilo v 10.",
      "Produktivnost: graf KPI 3 kaže točke skrajšano (40k) kot KPI 2.",
      "E-mail gembe: tedenska tema v zadevi, povezava do zapisnika v aplikaciji, večja pisava, naslov \"Nove akcije\", krepka odgovorni in rok, poziv, naj odgovorni javijo, ko akcijo zaključijo.",
      "Zapisnik gembe: odstranjeno orodje KPI tedna; predlog teme se skrije, ko je tema izbrana; ko je tema izbrana, so ostale teme pod vprašanji skrite (gumb Prikaži ostale teme).",
      "Vprašanja: gumb Dodaj vprašanje (zelen +) v vsaki skupini in odstranjevanje vprašanj (koš). SQL: 014_produktivnost_vprasanja.sql.",
      "Tablica: naslov strani se ne stiska več v eno besedo na vrstico - gumbi se prelomijo v novo vrsto.",
      "Koledar gemb: legenda barv tem tedna (krogec levo zgoraj v tednu).",
    ],
  },
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
