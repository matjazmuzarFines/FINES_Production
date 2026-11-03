# Primerjava kosovnic

Stran: `/proizvodnja/orodja/primerjava-kosovnic`, Proizvodnja → Orodja.

## Priprava baze in sync

Skripti 027 (kosovnice) in **030_identi_uvoz.sql** (identi) se izvedeta ročno. Prejšnji atomski uvoz identov (RPC `spl_identi_uvozi_excel`, nekdanji 028/029) je odstranjen: celoten uvoz v enem stavku je presegel omejitev 8 s za vlogo `authenticated`. 030 ga v obstoječi bazi pobriše skupaj s stolpcem `spl_identi.uvoz_id` in na novo ustvari `spl_identi_uvozi`.

## Predelava obstoječih izdelkov

Pod izbranima kosovnicama po kliku Primerjaj je ločen načrt **Kaj potrebujem za predelavo?**. Izbereš smer 1 → 2 ali 2 → 1 in število obstoječih izdelkov (npr. 5). Enako število izvornih izdelkov se pretvori v ciljne.

Algoritem najprej ujema skupne celotne sestave z enako šifro in enako strukturo. Njihovi otroci se odstranijo iz nadaljnje zaloge ponovne uporabe. Nato ujema manjše sestave in posamezne komponente tudi med različnimi nadrejenimi sestavi. Vsaka pojavitev se porabi največ enkrat. Poti in količine so sledljive v listu Ponovna uporaba. Skupni deli izginejo iz seznama potreb, različni sestavi ostanejo kot delovni koraki tudi, ko imajo veliko skupnih otrok.

Privzeta nastavitev **Polizdelke 096/097 naroči cele** ohrani obdelane dele in zvarjence kot enoto za prevzem. Pri različnih zvarjencih ne predpostavi, da lahko iz enega povrneš surovino za drugega. Nastavitev je mogoče izključiti. Dele, ki so poškodovani ali jih ni mogoče odstraniti, izključi z Ne uporabi ponovno; izključitev prepreči tudi ponovno uporabo celotnega sestava, ki jih vsebuje.

Zaloga se upošteva šele po odšteti ponovni uporabi. Če sestav uporablja skupne otroke, ga predelamo/sestavimo; hkrati ne naročimo novega celotnega sestava. Sicer lahko zaloga celotnega sestava pokrije njegovo vejo. Ponujeni načrt daje prednost ponovni uporabi in ni optimizacija vseh možnih načinov razstavljanja ali dela.

Obstoječi primerjalni Excel ostane enak in še vedno predstavlja material za novo izdelavo obeh alternativ, ne načrta predelave. Nova izvoza vsebujeta liste:

- **Hierarhija**: potrebni različni sestavi in komponente, količina, zaloga, prevzem, izdelaj/sestavi in manjka materiala; skupine nivojev se v Excelu zlagajo.
- **Za skladišče**: seštet dejanski prevzem in manjkajoči material brez dvojnega štetja sestavov in njihovih otrok.
- **Ponovna uporaba**: kateri sestavi/komponente so bili pokriti iz obstoječih izdelkov in na katerih poteh.
- **Navodila**: smer, količina, izbrani način polizdelkov in razlaga stolpcev.

Preverjen primer `100-301.2002 → 100-301.2001`, 5 kosov: brez zaloge ima načrt 25 preostalih vrstic in 35 povezav ponovne uporabe. Datoteka v `artifacts` je primer brez potrjenih zalog; aktualno zalogo uporabi izvoz v aplikaciji.

**096-10191** v priloženem Excelu nastopa pri `100-301.2001` na dveh poteh: 4 kosi pod `099-10368` in 5 kosov neposredno pod `099-10367` (skupaj 9). Pri `100-301.2002` nastopajo 4 kosi pod `099-10372`. Razlika za predelavo petih peči je zato po tem izvozu 25 kosov. To ni samodejno popravljeno kot napaka ERP; preveriti je treba obe izvorni vrstici kosovnice.

1. Preglej in ročno izvedi `supabase/migrations/027_primerjava_kosovnic.sql` po obstoječi 025, nato `030_identi_uvoz.sql`.
2. V povezano sync mapo dodaj dnevna izvoza `Identi.xlsx` in `Kosovnice.xlsx`.
3. Na strani Podatki sinhroniziraj Idente, Kosovnice in Material. Nova vira sodelujeta v ročnem, skupinskem in samodejnem syncu.

Poslovni podatki so v obstoječi `spl_identi` in novi `spl_kosovnice`. Potrebni sta še tabeli `spl_identi_uvozi` in `spl_kosovnice_uvozi`: čas, ime datoteke, pričakovano število vrstic in aktivacija popolnega uvoza.

Identi se uvozijo enako kot material: upsert po proizvodni šifri `sifra` v kosih po 500, nato se uvoz aktivira v `spl_identi_uvozi`. `spl_identi` je skupna tabela s FINES_WorkInstructions, zato se nobena šifra ne skrije ali izbriše; nove se dodajo, obstoječe posodobijo. Interni `id` ostane isti. `klasifikat` izračuna baza (`GENERATED ALWAYS`, `split_part(sifra, '-', 1)`). `risp_sifra` je ločena ERP šifra in se ne sme zamenjati za interni ID. Pisanje je dovoljeno vsem prijavljenim z dostopom (`fos_dostop`), ne samo `wi_admini`. Prekinjen uvoz pusti že vpisane kose, a uvoza ne aktivira; ponovitev ga dokonča.

Kosovnice se shranijo kot celoten nov posnetek z ohranjenim vrstnim redom in nivoji. Aktivacija preveri število vrstic; prekinjen uvoz ne spremeni aktivnega posnetka. Stari podatki ostanejo, brez brisanja. Veliki uvozi podaljšujejo zaklep. Nove tabele in funkcije so dostopne samo prijavljenim uporabnikom.

## Pravila primerjave

- En kos levega in en kos desnega končnega izdelka. Korenska ERP količina 0 pomeni osnovo 1.
- Količine postavk veljajo na neposrednega starša. Skupna količina je produkt količin po poti od korena.
- Aktivni privzeto vključujejo `AKTIVEN` in `AKTIVEN s posebnostjo` (tudi staro skrajšano obliko). `neaktiven=true` izključi ident. Prazni statusi in vsi ostali so v skupini Ostali. Podrobni statusi se preberejo iz podatkov.
- Strukturna primerjava primerja ident pod isto potjo nadrejenih sestavov. Premik istega materiala drugam zato ostane viden, tudi če je skupni seštevek enak. Ponovitve iste šifre pod istim staršem se seštejejo.
- Materialni pregled vsako alternativo ločeno pokriva z zalogo. Za prevzem uporabi `max(0, min(zaloga, razpolozljiva))`, kjer je `razpolozljiva = zaloga − potreba DN`. Pričakovane dobave in prosta zaloga, ki lahko vsebuje prihodnje prilive, niso osnova za prevzem.
- Zaloga sestava zapre njegovo vejo samo za pokrito količino. Preostanek razvijemo v otroke. Ista zaloga se znotraj alternative porabi največ enkrat; prednost imajo neposredne potrebe, nato globlji nivoji v vrstnem redu izvoza. Gre za določen predlog porabe, ne optimizacijo vseh možnih kombinacij.
- Brez potrjene zaloge se sestav razvije; list brez zaloge je prikazan kot manjkajoč. Odsotnost zapisa zaloge je posebej označena. Predlog ni rezervacija in ni naročilo skladišču.
- Izklop upoštevanja zaloge razvije kosovnico do listov in pokaže bruto materialne potrebe.
- Excel izvoz sledi trenutnemu pogledu, filtrom in razvrščanju.
- Kosovnici sta poimenovani IDENT 1 in IDENT 2 (tudi v rezultatih in Excelu), da se oznake ne zamenjajo z levo/desno izvedbo peči.
- Iskalnik komponent nad kosovnicama išče po proizvodni šifri, nazivu in šifri RISP brez razlikovanja šumnikov. Odpiranje poti je začasno; po čiščenju se ohrani prejšnje stanje razprtih/zaprtih sestavov. Zadetki so fluorescentno rumeni, puščici v glavi posamezne kosovnice premikata med pojavitvami.

## Posebnosti priloženih podatkov

Izvoz Identi vsebuje 8.976 vrstic in 8.975 različnih proizvodnih šifer. Ident `001-10026` je podvojen zaradi zadnjih prevzemov: ostala polja so enaka, zato se uporabi novejši datum prevzema z njegovo ceno in opozorilom. Če se razlikujejo druga polja, se uvoz ustavi.

Kosovnice vsebujejo 134.308 vrstic, 2.356 korenov in nivoje 1–9. 62 vrstic nima proizvodne šifre/naziva. Ohranijo se pod oznako `RISP:<šifra>` z opozorilom; povezava na zalogo se ne ugiba.

## Lokalni predogled brez posegov v bazo

Za testiranje pred izvedbo SQL je dodan prijavljen lokalni predogled datotek iz `data`. Na strežniku mora biti nastavljeno `KOSOVNICE_LOKALNI_PREDOGLED=1`. Ob opozorilu o nepripravljeni bazi izberi **Lokalni predogled Excelov**. Kosovnice in identi se preberejo lokalno, zaloga pa iz obstoječe baze. Predogled ne izvaja synca ali zapisov v bazo. Endpoint brez te nastavitve vrne 404 in vedno zahteva veljavno prijavo.

Preverjanje: `node --test tests/kosovnice.test.cjs`, `npm run lint`, `npm run build`.
