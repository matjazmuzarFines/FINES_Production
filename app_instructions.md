# Navodila in smernice za izdelavo aplikacije

## Generalne smernice
- Vse komponente morajo biti standardne in enotne - (enake oblike, enake barve, enake velikost, enako osenčenje za vsako posamezno komponento - dropdown, score, button, tabela)
- Vsaka stran mora imeti Fines logo, gumb nazaj (razen homepage), gumb izhod oz. close app
- GUI mora biti izdelan in variabilno nastavljen tako, da se komponente lepo zlagajo in prikažejo tako za katere koli velikosti monitor, televizijo in prav tako za tablico in telefon.


## Barve
Uporabljaj izključno barve podjetja Fines d.o.o.
- Primary: Temno oranžna
- Secondary: Temno siva ali odtenki sive, bela, črna

Razni funkcijski gumbi in opozorila so seveda druge barve.
- Add gumb / potrdi / shrani je živo zelen
- Izbriši, odstrani je rdeč
- Razna opozorila rumena
- Razni synki in ostali funkcijski gumbi ki kličejo zunanje funkcije izven vercel appa so modri

## Gumbi, Sliderji, Prikazovalniki

- Vsi gumbi, sliderji, ikonce, prikazovalniki morajo nujno imeti hover text, ki pove kaj točno bo ta gumb naredil. Maximum 6 do 8 besed. Recimo gumb "Dodaj" mora imeti hover "Dodaj nov kontrolni postopek" če gumb doda nov kontrolni postopek itd.

## Baza SQL
- Podatkov se ne sme brisati. Posložujemo se visible = true/false. Če bo potrebno brisanje bo to izrecno povedano
- Slike se v večini morajo brisati, zaradi prostora in synca
- Vsaka tabela mora imeti svoje IDje zaradi povezav. V primeru večih tabel na isti komponenti je potrebno narediti tudi povezovalno tabelo
- tabele se morajo imenovati: {ime projekta v 2 ali 3 črkah}_......, povezovalne tabele so: ln_{ime projekta v 2 ali 3 črkah}_{tabela 1}_{tabela 2}... Primer: Projekt Kontrolni postopki: kp_..., ln_kp_... Projekt Rabljena oprema: rbo_..., ln_rbo_....

## Spremembe
- App mora imeti v desnem zgornjem kotu ikonco "i" kot informacije. na klik se odpre popup kjer bova pisala vse spremembe in verzije. Vsakič ko narediš spremembe dodaj številko in summariziraj kaj je bilo spremenjeno in narejeno. Številke delaj 1.XX. Recimo 1.01, potem spremembe 1.02, ... in če narediva večje spremembe ali dodava kompletno novo funkcijo ali podstran je potrebno dvigniti številko na 2.01. in potem male spremembe naprej. Številko dvignejo, večje spremembe. Majhni popravki oblik, tekstov ne sodijo v večje spremembe.

## Standardne komponente
Veljajo za vse projekte. Referenčna izvedba je v `src/components/ui/` (projekt Fines - Production), barve so v `src/app/globals.css`.

**Pravilo usklajevanja:** vsakič, ko se popravi ali dogovori kakršna koli komponenta (barva, oblika, obnašanje, postavitev), je potrebno:
1. posodobiti ta razdelek (Standardne komponente),
2. isto spremembo uveljaviti na **vseh** mestih v projektu, kjer se ta komponenta pojavi (ne samo na strani, kjer je bila opažena),
3. po možnosti komponento imeti samo enkrat (v `src/components/ui/` ali kot skupni CSS razred), da se sprememba avtomatsko prenese povsod.

### Barvni žetoni
| Žeton | Barva | Uporaba |
|---|---|---|
| `fines-500/600/700` (+ `50/100/200`) | temno oranžna `#ca5010` | primarna akcija, izbran zavihek, fokus, vlečenje datoteke čez polje |
| `ink-50 … ink-900` | sive | besedilo, obrobe, ozadja; `ink-800` = glava tabele in meni |
| `ok-500/600` (+ `ok-50`) | zelena | dodaj / potrdi / shrani, uspešno naloženo, "na zalogi" |
| `nok-500/600` (+ `nok-50`) | rdeča | izbriši / odstrani, napaka, "manjka" |
| `warn-400/500/700` (+ `warn-50`) | rumena | opozorila, neshranjene spremembe, "nedorečeno" |
| `sync-500/600` (+ `sync-50`) | modra | sync / zunanje funkcije, nalaganje v teku, "v proizvodnji" |
Svetli odtenek (`-50`) je ozadje, srednji (`-500`) obroba/ikona, temni (`-600/700`) besedilo na svetlem ozadju.

### Postavitev strani
- Glava aplikacije: logo, gumb nazaj (razen domače strani), "i" (spremembe), izhod; spodaj 4 px oranžna črta. Leva navigacija temno siva.
- Vrh strani: levo naslov (`text-xl font-bold`) in podnaslov (`text-sm text-ink-500`), **desno zgoraj** polja za uvoz datotek.
- Pod tem po vrsti: opozorila → kartice-filtri (povzetek statusov) → zavihki pogledov → element s filtri → vsebina pogleda.
- Vsebina je v karticah `fp-card` (belo, siva obroba, zaobljeno 12 px, rahla senca). Razmik med elementi `gap-4`, notranji odmik `p-3 sm:p-4`.
- Vse mora delovati na telefonu, tablici, monitorju in TV (mreže `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, `flex-wrap`).

### Gumbi (`Button`, `IconButton`)
- Višina 40 px (`lg` 48 px), zaobljeno 8 px, krepko besedilo, ikona levo (lucide, 16 px).
- Variante: `primary` oranžna, `success` zelena, `danger` rdeča, `warning` rumena, `sync` modra, `neutral` bel z obrobo (sekundarno, npr. Izvoz, Prekliči).
- `IconButton`: okrogel 40 px samo z ikono (puščice, info, zapri, nastavitve).
- **Vsak** gumb, ikona, polje in prikazovalnik ima hover tekst (`hint`, 6-8 besed), ki pove, kaj naredi.
- Gumbi **izvoza** (neutral) so vedno v desnem zgornjem kotu elementa, ki ga izvažajo, pod naslovom "Izvoz":
  - **Excel** (ikona Download) izvozi točno tisto, kar je na zaslonu v **izbranem zavihku** (isti filtri in isto razvrščanje). Vsak zavihek ima svoj izvoz in svoje ime datoteke.
  - **TXT** (ikona FileText) - kratko sporočilo za Teams (npr. za montažo). Odpre okno s predogledom ter gumboma **Kopiraj** (oranžen) in **Prenesi .txt** (neutral, UTF-8 z BOM). Kasneje bo dodan gumb za pošiljanje v Teams prek webhooka (moder, sync).

### Uvoz datotek (`UvozDropzone`)
- Polje "povleci in spusti ali klikni", desno zgoraj na strani, širina ~288 px. Ikona oblaka levo, naslov + status v besedilu, **ikona stanja v desnem zgornjem kotu polja**.
- Stanja:
  - **Ni podatkov:** sivo ozadje, črtkana siva obroba, ikona prazen krožec (siva), tekst "Ni podatkov - povleci datoteko sem ali klikni".
  - **Nalaganje:** modro ozadje (`sync-50`), modra obroba, vrteča ikona (modra), tekst "Nalagam ...".
  - **Naloženo:** svetlo zeleno ozadje (`ok-50`), zelena obroba, kljukica (zelena), tekst "N postavk · datum ura" (ime datoteke v hover tekstu).
  - **Vlečenje datoteke čez polje:** oranžna obroba in svetlo oranžno ozadje.
- Po izbiri datoteke se odpre okno s povzetkom in opozorili; podatki se shranijo šele s klikom "Uvozi" (zelen).
- Vsak vir podatkov se uvozi **enkrat** in se deli med vsemi stranmi (npr. nalogi: Zasedenost in Prioritete). Kasneje gumb "Osveži podatke" (moder, sync) namesto uvoza.

### Kartice-filtri (`FilterKartica`)
- Kartica z barvnim trakom levo, naslovom in številom (npr. "12 postavk · 30 kos"); ikona stanja v desnem zgornjem kotu.
- **Izklopljena:** belo ozadje, siva obroba, siv tekst, bled trak, prazen krožec.
- **Hover:** sivo ozadje (`ink-100`) in temnejša obroba.
- **Vklopljena:** obroba 2 px in svetlo ozadje v barvi kartice, polna kljukica v barvi kartice, temen tekst.

### Zavihki (`Zavihki`)
- Pogledi iste strani so zavihki nad elementom s filtri (ne med filtri). Ikona + ime.
- Izbran: bel, oranžna črta zgoraj, oranžno besedilo, zlije se s kartico pod njim (kartica `rounded-tl-none`).
- Neizbran: sivo ozadje (`ink-200`), hover svetlejši.
- Pod zavihki je element s filtri in checkboxi, ki urejajo izbran pogled (prikazani so samo filtri, ki veljajo za ta pogled).

### Filtri in vnosna polja (`FilterVrstica`, `FilterPolje`, `FilterIskanje`, `FilterIzbira`, `FilterCheckbox`, `MultiSelect`)
- **Poravnava:** naslovi filtrov / gumbov so v svoji vrstici **nad** poljem (`text-xs font-semibold text-ink-600`), vsa polja in gumbi so visoki 40 px in **poravnani spodaj** v isti vrsti. Polje brez naslova se vseeno poravna z ostalimi. Predolg naslov se prelomi **navzgor**, polje ostane v vrsti.
- Vsak filter ima naslov (tudi iskanje: "Iskanje"); skupina gumbov ima skupen naslov (npr. "Prikaz", "Oddelki", "Izvoz").
- Iskanje: polje 40 px z ikono lupe levo, oranžen fokus (`focus:border-fines-500 ring-fines-100`).
- Večkratni izbor: `MultiSelect` (checkboxi + Izberi vse). Enojni izbor: `FilterIzbira` (`select` 40 px z obrobo).
- Checkbox v filtrih: `FilterCheckbox` - okvir 40 px z obrobo (kot ostala polja), checkbox 16 px oranžen (`accent-fines-500`), besedilo desno; vklopljen ima oranžno obrobo in svetlo oranžno ozadje, hover sivo.
- Gumbi-filtri (čipi): višina 40 px, zaobljeni, izbran oranžen polni, neizbran bel z obrobo.

### Tabele (`TabelaOkvir`, `SortTh`, razred `fp-thead`)
- Glava tabele: temno siva (`ink-800`), svetlo besedilo, male črke `xs`, VELIKE ČRKE, krepko.
- Koti tabele so zaobljeni (8 px): zgornja kota glave in spodnja kota zadnje vrstice - brez ostrih kotov.
- **Glava se pri drsenju strani prilepi pod glavo aplikacije** (tabela je v `TabelaOkvir`, `<thead className="fp-thead">`). Če je tabela širša od zaslona, dobi lastni drsnik in glava ostane na vrhu okvirja.
- **Razvrščanje:** klik na stolpec glave → naraščajoče (puščica gor), 2. klik padajoče (puščica dol), 3. klik privzeti vrstni red. Neaktivni stolpci imajo bledo ikono ↕. Prazne vrednosti so vedno na koncu. Razvrščanje ne podira sklopov (npr. "Zamuja" ostane nad ostalimi).
- Vrstice: `text-sm`, spodnja siva črta, hover sivo. Številke desno poravnane, `tabular-nums`. Šifre (ident, nalog) v `font-mono`.
- Vrstice sklopov / skupin: polna širina, izrazito ozadje v barvi sklopa (`-100` / `ink-200`) in debela barvna črta levo (4 px, `-500` / `ink-600`), besedilo `text-base`, krepek naslov + število + kratek opis. Sklop mora biti jasno viden med vrsticami.
- Vrstico, ki se razpre (podrobnosti), označuje puščica ▸/▾ v prvem stolpcu; podrobnosti na sivem ozadju.
- Prazna tabela: "Ni … za izbrane filtre." na sredini, siv tekst.

### Statusne značke in opozorila
- Značka: zaobljena, `text-xs font-bold`, polna barva statusa (rdeča manjka, oranžna zamuja, rumena nedorečeno, modra v delu, zelena v redu).
- Opozorilo (`WarningText`): rumeno ozadje, ikona trikotnika, temno rumen tekst.
- Obvestila (`Toast`): zgoraj na sredini, barvna leva črta (zelena uspeh, rdeča napaka).
- Neshranjene spremembe: spodnja lepljiva vrstica (`SaveBar`) s številom sprememb, Prekliči (neutral) in Shrani (zelen); opozorilo pred odhodom s strani.
