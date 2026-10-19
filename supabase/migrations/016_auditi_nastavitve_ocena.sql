-- =====================================================================
-- FINES - Production | 016: Auditi - nastavitve (šifranti) in ocena akcij
--
-- 1. Šifranti, ki se urejajo v aplikaciji (Auditi -> Nastavitve):
--    fp_aud_oddelki (oddelki in vodje), fp_aud_teme (teme oddelka),
--    fp_aud_vprasanja (vprašanja OPAZUJ / VPRASAJ, tipični ukrepi UKREP,
--    splošna vprašanja SPLOSNO), fp_aud_nastavitve (cilji, roki).
--    Začetna vsebina = dosedanji vgrajeni vodič. Vprašanja, ki so bila
--    v aplikaciji odstranjena (izbrisano = true), ostanejo skrita.
-- 2. Akcije: vrsta ugotovitve, prioriteta (A/B/C -> rok), rešeno na mestu,
--    velikost napake (1-5), pomembnost (1-5), ocena prihranka, cena ukrepa.
-- 3. Priloge: slika akcije pred / po (akcija_id, faza).
-- Zaženi PO 015_management_auditi.sql. Idempotentno.
-- =====================================================================

-- 1a. Oddelki
create table if not exists fp_aud_oddelki (
  id           bigint generated always as identity primary key,
  koda         text not null unique,
  naziv        text not null,
  barva        text not null default '#4d4d53',
  opis         text,
  podrocje     text,                               -- primer področja (placeholder)
  vodja        text,
  vodja_email  text,
  vrstni_red   int not null default 0,
  visible      boolean not null default true,      -- false = neaktiven (stari auditi ostanejo)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint fp_aud_oddelki_naziv_ck check (length(trim(naziv)) > 0)
);

insert into fp_aud_oddelki (koda, naziv, barva, opis, podrocje, vrstni_red) values
  ('PROIZVODNJA', 'Proizvodnja', '#2563eb', 'Razrez, krivljenje, varjenje in obdelava delov.', 'npr. Laser, krivljenje, varjenje', 10),
  ('MONTAZA', 'Montaža', '#7c4dcc', 'Montaža, elektro montaža in testiranje pečic.', 'npr. Montažna linija 1, elektro, testiranje', 20),
  ('SKLADISCE', 'Skladišče', '#15803d', 'Prevzem, skladiščenje, točnost zalog in izdaja materiala.', 'npr. Prevzem, regalno skladišče, izdaja', 30),
  ('LOGISTIKA', 'Logistika', '#0d9488', 'Pakiranje, odprema, nakladanje in notranji transport.', 'npr. Pakiranje, odprema, nakladalna rampa', 40),
  ('KAKOVOST', 'Kakovost', '#be123c', 'Vhodna, medfazna in končna kontrola, neskladnosti, reklamacije in merila.', 'npr. Vhodna kontrola, končna kontrola', 50),
  ('TEHNOLOGIJA', 'Tehnologija', '#a16207', 'Tehnična dokumentacija, normativi, programi in uvajanje sprememb v proizvodnjo.', 'npr. Tehnologija, priprava dela, programiranje', 60)
on conflict (koda) do nothing;

-- 1b. Teme oddelka
create table if not exists fp_aud_teme (
  id          bigint generated always as identity primary key,
  oddelek     text not null references fp_aud_oddelki(koda),
  koda        text not null,
  naziv       text not null,
  opis        text,
  vrstni_red  int not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fp_aud_teme_uq unique (oddelek, koda),
  constraint fp_aud_teme_naziv_ck check (length(trim(naziv)) > 0)
);

insert into fp_aud_teme (oddelek, koda, naziv, opis, vrstni_red) values
  ('PROIZVODNJA', 'VARNOST', 'Varnost in ergonomija', 'Varno delo, zaščitna oprema, prometne poti, dvigovanje bremen in drža pri delu.', 10),
  ('PROIZVODNJA', 'RED_5S', 'Red in 5S', 'Sortiraj, sistematiziraj, čisti, standardiziraj, vzdržuj - vsaka stvar ima svoje označeno mesto.', 20),
  ('PROIZVODNJA', 'STANDARD', 'Standardno delo in navodila', 'Ali obstaja najboljši način dela, je zapisan in ga vsi upoštevajo.', 30),
  ('PROIZVODNJA', 'KAKOVOST', 'Kakovost in napake', 'Napake, dodelave in izmet - kje nastanejo in kje jih opazimo.', 40),
  ('PROIZVODNJA', 'PRETOK', 'Plan, pretok in zaloge', 'Ali se dela po planu, koliko polizdelkov čaka in ali delo teče brez čakanja.', 50),
  ('PROIZVODNJA', 'STROJI', 'Stroji in vzdrževanje', 'Stanje strojev, zastoji, avtonomno vzdrževanje (čiščenje, mazanje, pregled).', 60),
  ('PROIZVODNJA', 'LJUDJE', 'Ljudje, komunikacija in vizualno vodenje', 'Ali ekipa ve, kaj je cilj dneva, kako ji gre, in ali so težave vidne in rešene.', 70),
  ('MONTAZA', 'VARNOST', 'Varnost in ergonomija', 'Varno delo, zaščitna oprema, prometne poti, dvigovanje bremen in drža pri delu.', 10),
  ('MONTAZA', 'RED_5S', 'Red in 5S', 'Sortiraj, sistematiziraj, čisti, standardiziraj, vzdržuj - vsaka stvar ima svoje označeno mesto.', 20),
  ('MONTAZA', 'STANDARD', 'Standardno delo in navodila', 'Zaporedje montaže, navodila in kontrolne točke - enako pri vseh delavcih.', 30),
  ('MONTAZA', 'KAKOVOST', 'Kakovost in testiranje', 'Napake pri montaži, rezultati testiranja in dodelave pred odpremo.', 40),
  ('MONTAZA', 'MATERIAL', 'Material na liniji', 'Ali je material za nalog pripravljen, popoln in pravočasno na liniji.', 50),
  ('MONTAZA', 'IZHOD', 'Plan in izhod', 'Ali montaža dosega plan dneva in ve, zakaj ga ne.', 60),
  ('MONTAZA', 'LJUDJE', 'Ljudje, komunikacija in vizualno vodenje', 'Ali ekipa ve, kaj je cilj dneva, kako ji gre, in ali so težave vidne in rešene.', 70),
  ('SKLADISCE', 'VARNOST', 'Varnost in ergonomija', 'Varno delo, zaščitna oprema, prometne poti, dvigovanje bremen in drža pri delu.', 10),
  ('SKLADISCE', 'RED_5S', 'Red in 5S', 'Sortiraj, sistematiziraj, čisti, standardiziraj, vzdržuj - vsaka stvar ima svoje označeno mesto.', 20),
  ('SKLADISCE', 'ZALOGE', 'Točnost zalog', 'Ali se stanje v sistemu ujema z dejanskim stanjem na lokaciji.', 30),
  ('SKLADISCE', 'PREVZEM', 'Prevzem materiala', 'Prevzem, kontrola količine in kakovosti ter hitrost vknjiženja.', 40),
  ('SKLADISCE', 'IZDAJA', 'Izdaja materiala za proizvodnjo', 'Komisioniranje in dostava materiala proizvodnji in montaži.', 50),
  ('SKLADISCE', 'LJUDJE', 'Ljudje, komunikacija in vizualno vodenje', 'Ali ekipa ve, kaj je cilj dneva, kako ji gre, in ali so težave vidne in rešene.', 60),
  ('LOGISTIKA', 'VARNOST', 'Varnost in ergonomija', 'Varno delo, zaščitna oprema, prometne poti, dvigovanje bremen in drža pri delu.', 10),
  ('LOGISTIKA', 'RED_5S', 'Red in 5S', 'Sortiraj, sistematiziraj, čisti, standardiziraj, vzdržuj - vsaka stvar ima svoje označeno mesto.', 20),
  ('LOGISTIKA', 'PAKIRANJE', 'Pakiranje in embalaža', 'Ali je izdelek zaščiten, pravilno označen in pakiran po standardu.', 30),
  ('LOGISTIKA', 'ODPREMA', 'Odprema in dokumentacija', 'Pravočasnost odprem, točnost dokumentacije in komunikacija s prevozniki.', 40),
  ('LOGISTIKA', 'TRANSPORT', 'Notranji transport', 'Premiki materiala in izdelkov med oddelki - koliko, kako daleč in zakaj.', 50),
  ('LOGISTIKA', 'LJUDJE', 'Ljudje, komunikacija in vizualno vodenje', 'Ali ekipa ve, kaj je cilj dneva, kako ji gre, in ali so težave vidne in rešene.', 60),
  ('KAKOVOST', 'VHODNA', 'Vhodna kontrola', 'Kontrola materiala in delov dobaviteljev pred uporabo.', 10),
  ('KAKOVOST', 'PROCES', 'Kontrola v procesu in končna kontrola', 'Ali se napake odkrijejo čim bližje mestu nastanka.', 20),
  ('KAKOVOST', 'NESKLADNOSTI', 'Neskladnosti in reklamacije', 'Obravnava neskladnosti in reklamacij kupcev - vzrok, ukrep, preverjanje.', 30),
  ('KAKOVOST', 'MERILA', 'Merila in kalibracija', 'Ali so merila ustrezna, umerjena in pravilno uporabljena.', 40),
  ('KAKOVOST', 'DOKUMENTACIJA', 'Dokumentacija in sledljivost', 'Zapisi kontrol, tablice, serijske številke - ali lahko izdelek izsledimo.', 50),
  ('KAKOVOST', 'LJUDJE', 'Ljudje, komunikacija in vizualno vodenje', 'Ali ekipa ve, kaj je cilj dneva, kako ji gre, in ali so težave vidne in rešene.', 60),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'Tehnična dokumentacija', 'Risbe, kosovnice in navodila - pravilne, popolne in pravočasne.', 10),
  ('TEHNOLOGIJA', 'NORMATIVI', 'Normativi in časi', 'Ali normativi ustrezajo dejanskemu času dela in se posodabljajo.', 20),
  ('TEHNOLOGIJA', 'PROGRAMI', 'Programi in priprava dela', 'CNC programi, priprava nalogov in nastavitve strojev.', 30),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'Spremembe in novi izdelki', 'Uvajanje sprememb in novih izdelkov v proizvodnjo brez zastojev.', 40),
  ('TEHNOLOGIJA', 'PODPORA', 'Podpora proizvodnji', 'Odzivnost tehnologije na vprašanja in težave v proizvodnji.', 50),
  ('TEHNOLOGIJA', 'LJUDJE', 'Ljudje, komunikacija in vizualno vodenje', 'Ali ekipa ve, kaj je cilj dneva, kako ji gre, in ali so težave vidne in rešene.', 60)
on conflict (oddelek, koda) do nothing;

-- 1c. Vprašanja in tipični ukrepi (vse v bazi; stolpec izbrisano se ne uporablja več)
alter table fp_aud_vprasanja add column if not exists vrstni_red int not null default 0;
alter table fp_aud_vprasanja drop constraint if exists fp_aud_vprasanja_skupina_ck;
alter table fp_aud_vprasanja add constraint fp_aud_vprasanja_skupina_ck check (skupina in ('OPAZUJ', 'VPRASAJ', 'SPLOSNO', 'UKREP'));

-- dosedanja lastna vprašanja za vgrajenimi
update fp_aud_vprasanja set vrstni_red = 1000 + id where vrstni_red = 0;

insert into fp_aud_vprasanja (oddelek, tema, skupina, besedilo, vrstni_red)
select v.oddelek, v.tema, v.skupina, v.besedilo, v.vrstni_red
from (values
  ('PROIZVODNJA', 'VARNOST', 'OPAZUJ', 'Ali so zaščite strojev nameščene in delujejo (svetlobne zavese, varovala, izklop v sili)?', 10),
  ('PROIZVODNJA', 'VARNOST', 'OPAZUJ', 'Ali vsi nosijo predpisano zaščitno opremo (očala, rokavice, čevlji, zaščita pri varjenju)?', 20),
  ('PROIZVODNJA', 'VARNOST', 'OPAZUJ', 'Ali so prometne poti in izhodi v sili prosti in označeni?', 30),
  ('PROIZVODNJA', 'VARNOST', 'OPAZUJ', 'Ali se težki ali veliki kosi dvigujejo s pripomočki ali ročno?', 40),
  ('PROIZVODNJA', 'VARNOST', 'VPRASAJ', 'Kdaj se pri delu ne počutiš varno?', 10),
  ('PROIZVODNJA', 'VARNOST', 'VPRASAJ', 'Kaj te pri delu najbolj fizično utrudi?', 20),
  ('PROIZVODNJA', 'VARNOST', 'UKREP', 'Označitev in sprostitev prometnih poti', 10),
  ('PROIZVODNJA', 'VARNOST', 'UKREP', 'Pripomoček za dvig / prenos težkih kosov', 20),
  ('PROIZVODNJA', 'VARNOST', 'UKREP', 'Kontrolni seznam zaščit stroja ob začetku izmene', 30),
  ('PROIZVODNJA', 'RED_5S', 'OPAZUJ', 'Ali ima vsako orodje in pripomoček (orodja za krivljenje, šablone) svoje označeno mesto?', 10),
  ('PROIZVODNJA', 'RED_5S', 'OPAZUJ', 'Ali so ob strojih kosi, ostanki ali material, ki ga trenutno ne potrebujejo?', 20),
  ('PROIZVODNJA', 'RED_5S', 'OPAZUJ', 'Ali so tla, stroji in delovne mize čisti (ostružki, ostanki pločevine, olje)?', 30),
  ('PROIZVODNJA', 'RED_5S', 'OPAZUJ', 'Ali bi nov sodelavec takoj našel vse potrebno?', 40),
  ('PROIZVODNJA', 'RED_5S', 'VPRASAJ', 'Kaj na tvojem delovnem mestu najpogosteje iščeš?', 10),
  ('PROIZVODNJA', 'RED_5S', 'VPRASAJ', 'Kaj bi odstranil, ker ga ne potrebuješ?', 20),
  ('PROIZVODNJA', 'RED_5S', 'UKREP', '5S akcija na delovnem mestu (odstrani, uredi, označi)', 10),
  ('PROIZVODNJA', 'RED_5S', 'UKREP', 'Senčna tabla za orodje', 20),
  ('PROIZVODNJA', 'RED_5S', 'UKREP', 'Urnik čiščenja z odgovornimi', 30),
  ('PROIZVODNJA', 'STANDARD', 'OPAZUJ', 'Ali so ob stroju navodila, programi in risbe, ki veljajo za trenutni nalog?', 10),
  ('PROIZVODNJA', 'STANDARD', 'OPAZUJ', 'Ali dva delavca isto operacijo delata različno? Kdo hitreje in zakaj?', 20),
  ('PROIZVODNJA', 'STANDARD', 'OPAZUJ', 'Ali je jasno, kdo je usposobljen za kateri stroj (matrika usposobljenosti)?', 30),
  ('PROIZVODNJA', 'STANDARD', 'OPAZUJ', 'Ali se nastavitev stroja preveri s prvim kosom?', 40),
  ('PROIZVODNJA', 'STANDARD', 'VPRASAJ', 'Kje najdeš navodila, ko nečesa ne veš?', 10),
  ('PROIZVODNJA', 'STANDARD', 'VPRASAJ', 'Kaj bi novemu sodelavcu najprej pokazal?', 20),
  ('PROIZVODNJA', 'STANDARD', 'UKREP', 'Navodilo s sliko na delovnem mestu', 10),
  ('PROIZVODNJA', 'STANDARD', 'UKREP', 'Matrika usposobljenosti oddelka', 20),
  ('PROIZVODNJA', 'STANDARD', 'UKREP', 'Usposabljanje po TWI (pokaži - naredi - preveri)', 30),
  ('PROIZVODNJA', 'KAKOVOST', 'OPAZUJ', 'Ali je ob delovnem mestu izmet ali kosi za dodelavo? Koliko in zakaj?', 10),
  ('PROIZVODNJA', 'KAKOVOST', 'OPAZUJ', 'Ali ima delavec jasen kriterij dobrega kosa (mera, vzorec, slika)?', 20),
  ('PROIZVODNJA', 'KAKOVOST', 'OPAZUJ', 'Ali so merila na voljo in v dobrem stanju?', 30),
  ('PROIZVODNJA', 'KAKOVOST', 'OPAZUJ', 'Ali bi preprosta šablona ali omejilo preprečilo napako (poka-yoke)?', 40),
  ('PROIZVODNJA', 'KAKOVOST', 'VPRASAJ', 'Kaj moraš najpogosteje popravljati?', 10),
  ('PROIZVODNJA', 'KAKOVOST', 'VPRASAJ', 'Kdaj nisi prepričan, ali je kos dober?', 20),
  ('PROIZVODNJA', 'KAKOVOST', 'UKREP', 'Vzorec / slika dobrega kosa na delovnem mestu', 10),
  ('PROIZVODNJA', 'KAKOVOST', 'UKREP', 'Šablona ali omejilo (poka-yoke)', 20),
  ('PROIZVODNJA', 'KAKOVOST', 'UKREP', 'Povratna informacija na mesto nastanka napake', 30),
  ('PROIZVODNJA', 'PRETOK', 'OPAZUJ', 'Ali je plan dela viden in ali se dela po prioritetah?', 10),
  ('PROIZVODNJA', 'PRETOK', 'OPAZUJ', 'Koliko polizdelkov čaka med operacijami? Ali so na označenem mestu?', 20),
  ('PROIZVODNJA', 'PRETOK', 'OPAZUJ', 'Ali kdo čaka na material, stroj, program ali odločitev?', 30),
  ('PROIZVODNJA', 'PRETOK', 'OPAZUJ', 'Ali je delo, ki je v teku, res potrebno za naslednje naloge montaže?', 40),
  ('PROIZVODNJA', 'PRETOK', 'VPRASAJ', 'Na kaj si ta teden najdlje čakal?', 10),
  ('PROIZVODNJA', 'PRETOK', 'VPRASAJ', 'Kdaj ne veš, kaj je naslednje delo?', 20),
  ('PROIZVODNJA', 'PRETOK', 'UKREP', 'Vidna prioritetna lista nalogov ob stroju', 10),
  ('PROIZVODNJA', 'PRETOK', 'UKREP', 'Označena mesta in največja zaloga med operacijami', 20),
  ('PROIZVODNJA', 'PRETOK', 'UKREP', 'Material in program pripravljen pred začetkom naloga', 30),
  ('PROIZVODNJA', 'STROJI', 'OPAZUJ', 'Ali kateri stroj stoji? Zakaj in koliko časa?', 10),
  ('PROIZVODNJA', 'STROJI', 'OPAZUJ', 'Ali se izvaja dnevno čiščenje in pregled strojev? Ali je zapis?', 20),
  ('PROIZVODNJA', 'STROJI', 'OPAZUJ', 'Ali so na strojih iztekanja olja, poškodbe ali improvizirani popravki?', 30),
  ('PROIZVODNJA', 'STROJI', 'OPAZUJ', 'Ali so okvare javljene in kdo jih rešuje?', 40),
  ('PROIZVODNJA', 'STROJI', 'VPRASAJ', 'Kateri stroj te najbolj ovira in zakaj?', 10),
  ('PROIZVODNJA', 'STROJI', 'VPRASAJ', 'Kaj bi na stroju popravil, če bi lahko?', 20),
  ('PROIZVODNJA', 'STROJI', 'UKREP', 'Kontrolni seznam dnevnega pregleda stroja', 10),
  ('PROIZVODNJA', 'STROJI', 'UKREP', 'Oznake za mazanje in kontrolne točke', 20),
  ('PROIZVODNJA', 'STROJI', 'UKREP', 'Seznam okvar z odgovornim in rokom', 30),
  ('PROIZVODNJA', 'LJUDJE', 'OPAZUJ', 'Ali je na oddelku tabla s plani in rezultati? Je ažurna?', 10),
  ('PROIZVODNJA', 'LJUDJE', 'OPAZUJ', 'Ali vodja oddelka ve, kje so danes težave?', 20),
  ('PROIZVODNJA', 'LJUDJE', 'OPAZUJ', 'Ali so zaposleni razporejeni glede na plan dela?', 30),
  ('PROIZVODNJA', 'LJUDJE', 'VPRASAJ', 'Kaj je danes tvoja najpomembnejša naloga?', 10),
  ('PROIZVODNJA', 'LJUDJE', 'VPRASAJ', 'Katero težavo si zadnjič javil vodji? Kaj se je zgodilo?', 20),
  ('PROIZVODNJA', 'LJUDJE', 'VPRASAJ', 'Kaj bi spremenil, če bi bil ti vodja oddelka?', 30),
  ('PROIZVODNJA', 'LJUDJE', 'UKREP', 'Tabla oddelka s cilji, rezultati in odprtimi težavami', 10),
  ('PROIZVODNJA', 'LJUDJE', 'UKREP', 'Kratek dnevni sestanek ob tabli (5-10 min)', 20),
  ('PROIZVODNJA', 'LJUDJE', 'UKREP', 'Odgovor na vsak predlog zaposlenega v enem tednu', 30),
  ('MONTAZA', 'VARNOST', 'OPAZUJ', 'Ali se pri delu z elektriko upošteva izklop in preverjanje brez napetosti?', 10),
  ('MONTAZA', 'VARNOST', 'OPAZUJ', 'Ali so ročna orodja (vijačniki, kleščice) v dobrem stanju in pravilno shranjena?', 20),
  ('MONTAZA', 'VARNOST', 'OPAZUJ', 'Ali se pečice obračajo in prenašajo s pripomočki?', 30),
  ('MONTAZA', 'VARNOST', 'OPAZUJ', 'Ali so delovne mize na primerni višini in je dovolj svetlobe?', 40),
  ('MONTAZA', 'VARNOST', 'VPRASAJ', 'Kdaj se pri delu ne počutiš varno?', 10),
  ('MONTAZA', 'VARNOST', 'VPRASAJ', 'Kaj te pri delu najbolj fizično utrudi?', 20),
  ('MONTAZA', 'VARNOST', 'UKREP', 'Dvižna / nastavljiva miza ali vrtljivo stojalo', 10),
  ('MONTAZA', 'VARNOST', 'UKREP', 'Pripomoček za obračanje pečice', 20),
  ('MONTAZA', 'VARNOST', 'UKREP', 'Označen prostor za testiranje pod napetostjo', 30),
  ('MONTAZA', 'RED_5S', 'OPAZUJ', 'Ali so deli in vijačni material na točki uporabe (v dosegu roke)?', 10),
  ('MONTAZA', 'RED_5S', 'OPAZUJ', 'Ali je na delovnem mestu material, ki ne pripada trenutnemu nalogu?', 20),
  ('MONTAZA', 'RED_5S', 'OPAZUJ', 'Ali ima orodje svoje mesto in je vrnjeno po uporabi?', 30),
  ('MONTAZA', 'RED_5S', 'OPAZUJ', 'Ali so embalaža in odpadki sproti odstranjeni?', 40),
  ('MONTAZA', 'RED_5S', 'VPRASAJ', 'Kaj na tvojem delovnem mestu najpogosteje iščeš?', 10),
  ('MONTAZA', 'RED_5S', 'VPRASAJ', 'Kaj bi odstranil, ker ga ne potrebuješ?', 20),
  ('MONTAZA', 'RED_5S', 'UKREP', 'Regal / voziček za material na točki uporabe', 10),
  ('MONTAZA', 'RED_5S', 'UKREP', 'Senčna tabla za orodje', 20),
  ('MONTAZA', 'RED_5S', 'UKREP', 'Zabojniki za embalažo in ločevanje odpadkov', 30),
  ('MONTAZA', 'STANDARD', 'OPAZUJ', 'Ali so montažna navodila in elektro sheme na voljo za trenutni izdelek?', 10),
  ('MONTAZA', 'STANDARD', 'OPAZUJ', 'Ali vsi delavci montirajo isti sklop v enakem zaporedju?', 20),
  ('MONTAZA', 'STANDARD', 'OPAZUJ', 'Ali so kritične točke (pritezni momenti, tesnila, ožičenje) označene v navodilih?', 30),
  ('MONTAZA', 'STANDARD', 'OPAZUJ', 'Ali se nov izdelek ali sprememba pravočasno predstavi montaži?', 40),
  ('MONTAZA', 'STANDARD', 'VPRASAJ', 'Kje se pri montaži najpogosteje ustaviš, ker nečesa ne veš?', 10),
  ('MONTAZA', 'STANDARD', 'VPRASAJ', 'Katero navodilo bi popravil?', 20),
  ('MONTAZA', 'STANDARD', 'UKREP', 'Slikovno navodilo za sklop', 10),
  ('MONTAZA', 'STANDARD', 'UKREP', 'Kontrolni seznam kritičnih točk', 20),
  ('MONTAZA', 'STANDARD', 'UKREP', 'Predstavitev spremembe izdelka pred začetkom serije', 30),
  ('MONTAZA', 'KAKOVOST', 'OPAZUJ', 'Katere napake se najpogosteje pokažejo pri testiranju?', 10),
  ('MONTAZA', 'KAKOVOST', 'OPAZUJ', 'Ali so napake zapisane in vrnjene na mesto nastanka?', 20),
  ('MONTAZA', 'KAKOVOST', 'OPAZUJ', 'Ali so pečice za dodelavo ločene in označene?', 30),
  ('MONTAZA', 'KAKOVOST', 'OPAZUJ', 'Ali so napake dobaviteljev (deli) javljene nabavi in kakovosti?', 40),
  ('MONTAZA', 'KAKOVOST', 'VPRASAJ', 'Kaj moraš na pečici najpogosteje popravljati?', 10),
  ('MONTAZA', 'KAKOVOST', 'VPRASAJ', 'Kateri del ti povzroča največ težav?', 20),
  ('MONTAZA', 'KAKOVOST', 'UKREP', 'Seznam najpogostejših napak na tabli (Pareto)', 10),
  ('MONTAZA', 'KAKOVOST', 'UKREP', 'Kontrola sklopa pred naslednjo operacijo', 20),
  ('MONTAZA', 'KAKOVOST', 'UKREP', 'Reklamacija dobavitelju z dokazi (slike)', 30),
  ('MONTAZA', 'MATERIAL', 'OPAZUJ', 'Ali je bil ob začetku naloga pripravljen ves material?', 10),
  ('MONTAZA', 'MATERIAL', 'OPAZUJ', 'Ali montaža čaka na dele iz proizvodnje ali skladišča?', 20),
  ('MONTAZA', 'MATERIAL', 'OPAZUJ', 'Ali so manjkajoči deli zapisani in javljeni?', 30),
  ('MONTAZA', 'MATERIAL', 'OPAZUJ', 'Kolikokrat delavec zapusti delovno mesto, da gre po material?', 40),
  ('MONTAZA', 'MATERIAL', 'VPRASAJ', 'Kaj ti najpogosteje manjka, ko začneš delo?', 10),
  ('MONTAZA', 'MATERIAL', 'VPRASAJ', 'Po kaj moraš največkrat hoditi?', 20),
  ('MONTAZA', 'MATERIAL', 'UKREP', 'Komplet materiala pred nalogom (kitting)', 10),
  ('MONTAZA', 'MATERIAL', 'UKREP', 'Dogovor s skladiščem o času dostave', 20),
  ('MONTAZA', 'MATERIAL', 'UKREP', 'Seznam manjkajočih delov s potrditvijo dobave', 30),
  ('MONTAZA', 'IZHOD', 'OPAZUJ', 'Koliko pečic je bilo danes končanih? Koliko je bilo planiranih?', 10),
  ('MONTAZA', 'IZHOD', 'OPAZUJ', 'Ali so razlogi za zaostanek zapisani?', 20),
  ('MONTAZA', 'IZHOD', 'OPAZUJ', 'Ali je ozko grlo linije znano in zasedeno ves čas?', 30),
  ('MONTAZA', 'IZHOD', 'OPAZUJ', 'Ali so pečice za odpremo pravočasno testirane in pripravljene?', 40),
  ('MONTAZA', 'IZHOD', 'VPRASAJ', 'Kaj te danes največkrat prekine?', 10),
  ('MONTAZA', 'IZHOD', 'VPRASAJ', 'Kaj bi pomagalo, da bi naredili plan?', 20),
  ('MONTAZA', 'IZHOD', 'UKREP', 'Tabla plan / dejansko po urah', 10),
  ('MONTAZA', 'IZHOD', 'UKREP', 'Izravnava dela med delovnimi mesti', 20),
  ('MONTAZA', 'IZHOD', 'UKREP', 'Prioritete odprem vidne na liniji', 30),
  ('MONTAZA', 'LJUDJE', 'OPAZUJ', 'Ali je na liniji tabla s plani in rezultati? Je ažurna?', 10),
  ('MONTAZA', 'LJUDJE', 'OPAZUJ', 'Ali delavci vedo, za katere kupce in roke delajo?', 20),
  ('MONTAZA', 'LJUDJE', 'OPAZUJ', 'Ali so predlogi zaposlenih zapisani in odgovorjeni?', 30),
  ('MONTAZA', 'LJUDJE', 'VPRASAJ', 'Kaj je danes tvoja najpomembnejša naloga?', 10),
  ('MONTAZA', 'LJUDJE', 'VPRASAJ', 'Katero težavo si zadnjič javil vodji? Kaj se je zgodilo?', 20),
  ('MONTAZA', 'LJUDJE', 'VPRASAJ', 'Kaj bi spremenil, če bi bil ti vodja oddelka?', 30),
  ('MONTAZA', 'LJUDJE', 'UKREP', 'Tabla oddelka s cilji, rezultati in odprtimi težavami', 10),
  ('MONTAZA', 'LJUDJE', 'UKREP', 'Kratek dnevni sestanek ob tabli (5-10 min)', 20),
  ('MONTAZA', 'LJUDJE', 'UKREP', 'Odgovor na vsak predlog zaposlenega v enem tednu', 30),
  ('SKLADISCE', 'VARNOST', 'OPAZUJ', 'Ali so regali nepoškodovani, označena nosilnost in ni preobremenjeni?', 10),
  ('SKLADISCE', 'VARNOST', 'OPAZUJ', 'Ali so poti viličarjev ločene od peš poti in proste?', 20),
  ('SKLADISCE', 'VARNOST', 'OPAZUJ', 'Ali viličaristi vozijo varno (hitrost, breme, vidljivost)?', 30),
  ('SKLADISCE', 'VARNOST', 'OPAZUJ', 'Ali se težki paketi dvigujejo s pripomočki?', 40),
  ('SKLADISCE', 'VARNOST', 'VPRASAJ', 'Kdaj se pri delu ne počutiš varno?', 10),
  ('SKLADISCE', 'VARNOST', 'VPRASAJ', 'Kaj te pri delu najbolj fizično utrudi?', 20),
  ('SKLADISCE', 'VARNOST', 'UKREP', 'Označitev poti viličarjev in peš poti', 10),
  ('SKLADISCE', 'VARNOST', 'UKREP', 'Pregled in zaščita regalov', 20),
  ('SKLADISCE', 'VARNOST', 'UKREP', 'Oznake nosilnosti na regalih', 30),
  ('SKLADISCE', 'RED_5S', 'OPAZUJ', 'Ali ima vsaka lokacija oznako in je material na pravi lokaciji?', 10),
  ('SKLADISCE', 'RED_5S', 'OPAZUJ', 'Ali so v skladišču stari, poškodovani ali nepotrebni materiali?', 20),
  ('SKLADISCE', 'RED_5S', 'OPAZUJ', 'Ali so prehodi in prostor za prevzem prosti?', 30),
  ('SKLADISCE', 'RED_5S', 'OPAZUJ', 'Ali so embalaža in odpadki sproti odstranjeni?', 40),
  ('SKLADISCE', 'RED_5S', 'VPRASAJ', 'Kaj na tvojem delovnem mestu najpogosteje iščeš?', 10),
  ('SKLADISCE', 'RED_5S', 'VPRASAJ', 'Kaj bi odstranil, ker ga ne potrebuješ?', 20),
  ('SKLADISCE', 'RED_5S', 'UKREP', 'Označevanje lokacij', 10),
  ('SKLADISCE', 'RED_5S', 'UKREP', 'Odpis / odstranitev starega materiala', 20),
  ('SKLADISCE', 'RED_5S', 'UKREP', 'Označeno mesto za prevzem in izdajo', 30),
  ('SKLADISCE', 'ZALOGE', 'OPAZUJ', 'Vzemi 3-5 naključnih postavk: ali se količina na lokaciji ujema s sistemom?', 10),
  ('SKLADISCE', 'ZALOGE', 'OPAZUJ', 'Ali so postavke brez lokacije ali na več lokacijah?', 20),
  ('SKLADISCE', 'ZALOGE', 'OPAZUJ', 'Ali se premiki in izdaje sproti knjižijo?', 30),
  ('SKLADISCE', 'ZALOGE', 'OPAZUJ', 'Ali so ostanki in vračila iz proizvodnje vknjiženi?', 40),
  ('SKLADISCE', 'ZALOGE', 'VPRASAJ', 'Kdaj se stanje v sistemu najpogosteje ne ujema?', 10),
  ('SKLADISCE', 'ZALOGE', 'VPRASAJ', 'Kaj bi pomagalo, da bi bilo stanje vedno točno?', 20),
  ('SKLADISCE', 'ZALOGE', 'UKREP', 'Ciklično štetje (vsak dan nekaj postavk)', 10),
  ('SKLADISCE', 'ZALOGE', 'UKREP', 'Knjiženje ob premiku (ne na koncu dneva)', 20),
  ('SKLADISCE', 'ZALOGE', 'UKREP', 'Ena lokacija na postavko', 30),
  ('SKLADISCE', 'PREVZEM', 'OPAZUJ', 'Koliko časa čaka prevzet material, preden je vknjižen in na lokaciji?', 10),
  ('SKLADISCE', 'PREVZEM', 'OPAZUJ', 'Ali se ob prevzemu preveri količina in poškodbe?', 20),
  ('SKLADISCE', 'PREVZEM', 'OPAZUJ', 'Ali so neskladne dobave ločene in označene?', 30),
  ('SKLADISCE', 'PREVZEM', 'OPAZUJ', 'Ali so dobavnice in dokumentacija urejene?', 40),
  ('SKLADISCE', 'PREVZEM', 'VPRASAJ', 'Kaj te pri prevzemu najbolj zadrži?', 10),
  ('SKLADISCE', 'PREVZEM', 'VPRASAJ', 'Kateri dobavitelj ti povzroča največ dela?', 20),
  ('SKLADISCE', 'PREVZEM', 'UKREP', 'Označeno mesto za neskladne dobave', 10),
  ('SKLADISCE', 'PREVZEM', 'UKREP', 'Rok za vknjiženje prevzema (npr. isti dan)', 20),
  ('SKLADISCE', 'PREVZEM', 'UKREP', 'Povratna informacija nabavi o dobaviteljih', 30),
  ('SKLADISCE', 'IZDAJA', 'OPAZUJ', 'Ali je material za naloge pripravljen pred začetkom dela?', 10),
  ('SKLADISCE', 'IZDAJA', 'OPAZUJ', 'Ali proizvodnja ali montaža prihaja po material sama?', 20),
  ('SKLADISCE', 'IZDAJA', 'OPAZUJ', 'Kolikokrat je izdan napačen ali nepopoln material?', 30),
  ('SKLADISCE', 'IZDAJA', 'OPAZUJ', 'Ali je jasno, kateri nalog je naslednji (prioritete)?', 40),
  ('SKLADISCE', 'IZDAJA', 'VPRASAJ', 'Kdaj ne veš, kaj moraš pripraviti?', 10),
  ('SKLADISCE', 'IZDAJA', 'VPRASAJ', 'Kaj bi pospešilo pripravo materiala?', 20),
  ('SKLADISCE', 'IZDAJA', 'UKREP', 'Seznam za pripravo po prioritetah nalogov', 10),
  ('SKLADISCE', 'IZDAJA', 'UKREP', 'Dogovorjeni časi dostave na linijo', 20),
  ('SKLADISCE', 'IZDAJA', 'UKREP', 'Komplet materiala po nalogu (kitting)', 30),
  ('SKLADISCE', 'LJUDJE', 'OPAZUJ', 'Ali ekipa skladišča ve, katere naloge in odpreme so danes prioritetne?', 10),
  ('SKLADISCE', 'LJUDJE', 'OPAZUJ', 'Ali so težave z zalogami javljene in rešene?', 20),
  ('SKLADISCE', 'LJUDJE', 'OPAZUJ', 'Ali je delo enakomerno razporejeno med zaposlene?', 30),
  ('SKLADISCE', 'LJUDJE', 'VPRASAJ', 'Kaj je danes tvoja najpomembnejša naloga?', 10),
  ('SKLADISCE', 'LJUDJE', 'VPRASAJ', 'Katero težavo si zadnjič javil vodji? Kaj se je zgodilo?', 20),
  ('SKLADISCE', 'LJUDJE', 'VPRASAJ', 'Kaj bi spremenil, če bi bil ti vodja oddelka?', 30),
  ('SKLADISCE', 'LJUDJE', 'UKREP', 'Tabla oddelka s cilji, rezultati in odprtimi težavami', 10),
  ('SKLADISCE', 'LJUDJE', 'UKREP', 'Kratek dnevni sestanek ob tabli (5-10 min)', 20),
  ('SKLADISCE', 'LJUDJE', 'UKREP', 'Odgovor na vsak predlog zaposlenega v enem tednu', 30),
  ('LOGISTIKA', 'VARNOST', 'OPAZUJ', 'Ali je nakladanje varno (zavarovano vozilo, rampa, osvetlitev)?', 10),
  ('LOGISTIKA', 'VARNOST', 'OPAZUJ', 'Ali so tovori pravilno pritrjeni in zaščiteni?', 20),
  ('LOGISTIKA', 'VARNOST', 'OPAZUJ', 'Ali so poti viličarjev in peš poti ločene?', 30),
  ('LOGISTIKA', 'VARNOST', 'OPAZUJ', 'Ali so pripomočki za pakiranje (folija, trakovi, rezila) varno shranjeni?', 40),
  ('LOGISTIKA', 'VARNOST', 'VPRASAJ', 'Kdaj se pri delu ne počutiš varno?', 10),
  ('LOGISTIKA', 'VARNOST', 'VPRASAJ', 'Kaj te pri delu najbolj fizično utrudi?', 20),
  ('LOGISTIKA', 'VARNOST', 'UKREP', 'Kontrolni seznam varnega nakladanja', 10),
  ('LOGISTIKA', 'VARNOST', 'UKREP', 'Označitev poti in con nakladanja', 20),
  ('LOGISTIKA', 'VARNOST', 'UKREP', 'Varna rezila in pripomočki za pakiranje', 30),
  ('LOGISTIKA', 'RED_5S', 'OPAZUJ', 'Ali so pripravljene odpreme na označenem mestu po kupcih / datumih?', 10),
  ('LOGISTIKA', 'RED_5S', 'OPAZUJ', 'Ali je embalažni material na voljo in urejen?', 20),
  ('LOGISTIKA', 'RED_5S', 'OPAZUJ', 'Ali so v coni odpreme stvari, ki tja ne sodijo?', 30),
  ('LOGISTIKA', 'RED_5S', 'OPAZUJ', 'Ali so prehodi in rampa prosti?', 40),
  ('LOGISTIKA', 'RED_5S', 'VPRASAJ', 'Kaj na tvojem delovnem mestu najpogosteje iščeš?', 10),
  ('LOGISTIKA', 'RED_5S', 'VPRASAJ', 'Kaj bi odstranil, ker ga ne potrebuješ?', 20),
  ('LOGISTIKA', 'RED_5S', 'UKREP', 'Označene cone za odpreme po dnevih', 10),
  ('LOGISTIKA', 'RED_5S', 'UKREP', 'Urejen prostor za embalažni material', 20),
  ('LOGISTIKA', 'RED_5S', 'UKREP', 'Dnevno čiščenje cone odpreme', 30),
  ('LOGISTIKA', 'PAKIRANJE', 'OPAZUJ', 'Ali obstaja standard pakiranja za izdelek (slika, navodilo)?', 10),
  ('LOGISTIKA', 'PAKIRANJE', 'OPAZUJ', 'Ali so pečice in dodatki pravilno zaščiteni pred poškodbami?', 20),
  ('LOGISTIKA', 'PAKIRANJE', 'OPAZUJ', 'Ali so oznake, tablice in dokumentacija priložene in pravilne?', 30),
  ('LOGISTIKA', 'PAKIRANJE', 'OPAZUJ', 'Ali se pakira na enak način pri vseh zaposlenih?', 40),
  ('LOGISTIKA', 'PAKIRANJE', 'VPRASAJ', 'Kaj pri pakiranju najpogosteje manjka?', 10),
  ('LOGISTIKA', 'PAKIRANJE', 'VPRASAJ', 'Katera embalaža ti dela težave?', 20),
  ('LOGISTIKA', 'PAKIRANJE', 'UKREP', 'Slikovni standard pakiranja', 10),
  ('LOGISTIKA', 'PAKIRANJE', 'UKREP', 'Kontrolni seznam dodatkov in dokumentacije', 20),
  ('LOGISTIKA', 'PAKIRANJE', 'UKREP', 'Zamenjava neustrezne embalaže', 30),
  ('LOGISTIKA', 'ODPREMA', 'OPAZUJ', 'Ali so današnje odpreme pripravljene pravočasno?', 10),
  ('LOGISTIKA', 'ODPREMA', 'OPAZUJ', 'Ali so dobavnice, izvozni dokumenti in oznake pripravljeni brez iskanja?', 20),
  ('LOGISTIKA', 'ODPREMA', 'OPAZUJ', 'Ali je bila v zadnjem času odprema napačna ali nepopolna? Zakaj?', 30),
  ('LOGISTIKA', 'ODPREMA', 'OPAZUJ', 'Ali je znan čas prihoda prevoznika?', 40),
  ('LOGISTIKA', 'ODPREMA', 'VPRASAJ', 'Kaj te pri pripravi odpreme najbolj zadrži?', 10),
  ('LOGISTIKA', 'ODPREMA', 'VPRASAJ', 'Kdaj izveš za spremembo odpreme?', 20),
  ('LOGISTIKA', 'ODPREMA', 'UKREP', 'Plan odprem za teden vidno na tabli', 10),
  ('LOGISTIKA', 'ODPREMA', 'UKREP', 'Kontrolni seznam pred nakladanjem', 20),
  ('LOGISTIKA', 'ODPREMA', 'UKREP', 'Dogovor o rokih za spremembe odprem', 30),
  ('LOGISTIKA', 'TRANSPORT', 'OPAZUJ', 'Kolikokrat se izdelek ali material prestavi, preden je odpremljen?', 10),
  ('LOGISTIKA', 'TRANSPORT', 'OPAZUJ', 'Ali so poti transporta kratke in proste?', 20),
  ('LOGISTIKA', 'TRANSPORT', 'OPAZUJ', 'Ali so transportna sredstva (vozički, palete) na voljo in v dobrem stanju?', 30),
  ('LOGISTIKA', 'TRANSPORT', 'OPAZUJ', 'Ali kdo čaka na viličar ali prevoz?', 40),
  ('LOGISTIKA', 'TRANSPORT', 'VPRASAJ', 'Kaj moraš prestavljati, kar bi lahko stalo na pravem mestu?', 10),
  ('LOGISTIKA', 'TRANSPORT', 'VPRASAJ', 'Kje najdlje čakaš na prevoz?', 20),
  ('LOGISTIKA', 'TRANSPORT', 'UKREP', 'Določene poti in časi notranjega transporta', 10),
  ('LOGISTIKA', 'TRANSPORT', 'UKREP', 'Dodatni vozički / palete', 20),
  ('LOGISTIKA', 'TRANSPORT', 'UKREP', 'Nova postavitev cone odpreme bliže montaži', 30),
  ('LOGISTIKA', 'LJUDJE', 'OPAZUJ', 'Ali ekipa ve, katere odpreme so danes in jutri?', 10),
  ('LOGISTIKA', 'LJUDJE', 'OPAZUJ', 'Ali so težave z odpremami javljene prodaji in proizvodnji?', 20),
  ('LOGISTIKA', 'LJUDJE', 'OPAZUJ', 'Ali so predlogi zaposlenih zapisani in odgovorjeni?', 30),
  ('LOGISTIKA', 'LJUDJE', 'VPRASAJ', 'Kaj je danes tvoja najpomembnejša naloga?', 10),
  ('LOGISTIKA', 'LJUDJE', 'VPRASAJ', 'Katero težavo si zadnjič javil vodji? Kaj se je zgodilo?', 20),
  ('LOGISTIKA', 'LJUDJE', 'VPRASAJ', 'Kaj bi spremenil, če bi bil ti vodja oddelka?', 30),
  ('LOGISTIKA', 'LJUDJE', 'UKREP', 'Tabla oddelka s cilji, rezultati in odprtimi težavami', 10),
  ('LOGISTIKA', 'LJUDJE', 'UKREP', 'Kratek dnevni sestanek ob tabli (5-10 min)', 20),
  ('LOGISTIKA', 'LJUDJE', 'UKREP', 'Odgovor na vsak predlog zaposlenega v enem tednu', 30),
  ('KAKOVOST', 'VHODNA', 'OPAZUJ', 'Ali je jasno, katere postavke se kontrolirajo in kako (plan kontrole)?', 10),
  ('KAKOVOST', 'VHODNA', 'OPAZUJ', 'Ali so neskladni deli ločeni, označeni in zapisani?', 20),
  ('KAKOVOST', 'VHODNA', 'OPAZUJ', 'Koliko časa material čaka na kontrolo?', 30),
  ('KAKOVOST', 'VHODNA', 'OPAZUJ', 'Ali so rezultati kontrole zapisani?', 40),
  ('KAKOVOST', 'VHODNA', 'VPRASAJ', 'Pri katerih dobaviteljih najdeš največ napak?', 10),
  ('KAKOVOST', 'VHODNA', 'VPRASAJ', 'Kaj potrebuješ, da bi kontrola tekla hitreje?', 20),
  ('KAKOVOST', 'VHODNA', 'UKREP', 'Plan vhodne kontrole po postavkah', 10),
  ('KAKOVOST', 'VHODNA', 'UKREP', 'Označeno mesto za neskladen material', 20),
  ('KAKOVOST', 'VHODNA', 'UKREP', 'Mesečno poročilo o dobaviteljih', 30),
  ('KAKOVOST', 'PROCES', 'OPAZUJ', 'Ali so kontrolne točke v proizvodnji in montaži določene in se izvajajo?', 10),
  ('KAKOVOST', 'PROCES', 'OPAZUJ', 'Ali so zapisi kontrol popolni in ažurni?', 20),
  ('KAKOVOST', 'PROCES', 'OPAZUJ', 'Kje v procesu se najdejo napake, ki so nastale veliko prej?', 30),
  ('KAKOVOST', 'PROCES', 'OPAZUJ', 'Ali je končna kontrola pečice standardizirana (kontrolni seznam)?', 40),
  ('KAKOVOST', 'PROCES', 'VPRASAJ', 'Katera napaka najpogosteje pride do končne kontrole?', 10),
  ('KAKOVOST', 'PROCES', 'VPRASAJ', 'Kje bi jo lahko ujeli prej?', 20),
  ('KAKOVOST', 'PROCES', 'UKREP', 'Kontrolna točka po kritični operaciji', 10),
  ('KAKOVOST', 'PROCES', 'UKREP', 'Kontrolni seznam končne kontrole', 20),
  ('KAKOVOST', 'PROCES', 'UKREP', 'Povratna informacija na mesto nastanka napake', 30),
  ('KAKOVOST', 'NESKLADNOSTI', 'OPAZUJ', 'Koliko neskladnosti in reklamacij je odprtih? Katere so najstarejše?', 10),
  ('KAKOVOST', 'NESKLADNOSTI', 'OPAZUJ', 'Ali ima vsaka reklamacija analizo vzroka (5 zakaj, 8D)?', 20),
  ('KAKOVOST', 'NESKLADNOSTI', 'OPAZUJ', 'Ali so ukrepi izvedeni in preverjeni?', 30),
  ('KAKOVOST', 'NESKLADNOSTI', 'OPAZUJ', 'Ali se ista napaka ponavlja?', 40),
  ('KAKOVOST', 'NESKLADNOSTI', 'VPRASAJ', 'Katera reklamacija te je zadnja presenetila?', 10),
  ('KAKOVOST', 'NESKLADNOSTI', 'VPRASAJ', 'Kaj preprečuje, da bi jih zaprli hitreje?', 20),
  ('KAKOVOST', 'NESKLADNOSTI', 'UKREP', 'Tedenski pregled odprtih reklamacij', 10),
  ('KAKOVOST', 'NESKLADNOSTI', 'UKREP', 'Analiza vzroka (5 zakaj) za vsako reklamacijo', 20),
  ('KAKOVOST', 'NESKLADNOSTI', 'UKREP', 'Preverjanje učinkovitosti ukrepa po 30 dneh', 30),
  ('KAKOVOST', 'MERILA', 'OPAZUJ', 'Ali imajo merila na delovnih mestih veljavno oznako umerjanja?', 10),
  ('KAKOVOST', 'MERILA', 'OPAZUJ', 'Ali so merila primerna za toleranco, ki jo merijo?', 20),
  ('KAKOVOST', 'MERILA', 'OPAZUJ', 'Ali so merila shranjena zaščiteno in ne poškodovana?', 30),
  ('KAKOVOST', 'MERILA', 'OPAZUJ', 'Ali je evidenca meril ažurna?', 40),
  ('KAKOVOST', 'MERILA', 'VPRASAJ', 'Kdaj nisi prepričan v rezultat meritve?', 10),
  ('KAKOVOST', 'MERILA', 'VPRASAJ', 'Katero merilo ti manjka?', 20),
  ('KAKOVOST', 'MERILA', 'UKREP', 'Evidenca meril z roki umerjanja', 10),
  ('KAKOVOST', 'MERILA', 'UKREP', 'Oznake umerjanja na merilih', 20),
  ('KAKOVOST', 'MERILA', 'UKREP', 'Nakup ustreznega merila', 30),
  ('KAKOVOST', 'DOKUMENTACIJA', 'OPAZUJ', 'Ali lahko za naključno pečico najdeš zapise kontrol in testiranja?', 10),
  ('KAKOVOST', 'DOKUMENTACIJA', 'OPAZUJ', 'Ali so serijske številke in tablice pravilne in zapisane?', 20),
  ('KAKOVOST', 'DOKUMENTACIJA', 'OPAZUJ', 'Ali so obrazci za zapise enotni in izpolnjeni?', 30),
  ('KAKOVOST', 'DOKUMENTACIJA', 'OPAZUJ', 'Ali so veljavne verzije dokumentov na delovnih mestih?', 40),
  ('KAKOVOST', 'DOKUMENTACIJA', 'VPRASAJ', 'Kateri zapis se najpogosteje pozabi izpolniti?', 10),
  ('KAKOVOST', 'DOKUMENTACIJA', 'VPRASAJ', 'Kateri obrazec je nepotreben ali podvojen?', 20),
  ('KAKOVOST', 'DOKUMENTACIJA', 'UKREP', 'Poenoten obrazec zapisa kontrole', 10),
  ('KAKOVOST', 'DOKUMENTACIJA', 'UKREP', 'Odstranitev zastarelih dokumentov', 20),
  ('KAKOVOST', 'DOKUMENTACIJA', 'UKREP', 'Elektronski zapis namesto papirja', 30),
  ('KAKOVOST', 'LJUDJE', 'OPAZUJ', 'Ali je stanje kakovosti (napake, reklamacije) vidno na oddelkih?', 10),
  ('KAKOVOST', 'LJUDJE', 'OPAZUJ', 'Ali vodje oddelkov poznajo najpogostejše napake svojega oddelka?', 20),
  ('KAKOVOST', 'LJUDJE', 'OPAZUJ', 'Ali zaposleni vedo, komu javiti napako?', 30),
  ('KAKOVOST', 'LJUDJE', 'VPRASAJ', 'Kaj je danes tvoja najpomembnejša naloga?', 10),
  ('KAKOVOST', 'LJUDJE', 'VPRASAJ', 'Katero težavo si zadnjič javil vodji? Kaj se je zgodilo?', 20),
  ('KAKOVOST', 'LJUDJE', 'VPRASAJ', 'Kaj bi spremenil, če bi bil ti vodja oddelka?', 30),
  ('KAKOVOST', 'LJUDJE', 'UKREP', 'Tabla oddelka s cilji, rezultati in odprtimi težavami', 10),
  ('KAKOVOST', 'LJUDJE', 'UKREP', 'Kratek dnevni sestanek ob tabli (5-10 min)', 20),
  ('KAKOVOST', 'LJUDJE', 'UKREP', 'Odgovor na vsak predlog zaposlenega v enem tednu', 30),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'OPAZUJ', 'Ali proizvodnja in montaža imata veljavne risbe in kosovnice za trenutne naloge?', 10),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'OPAZUJ', 'Koliko vprašanj ali napak zaradi dokumentacije je bilo ta teden?', 20),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'OPAZUJ', 'Ali so spremembe na risbah jasno označene (verzija)?', 30),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'OPAZUJ', 'Ali se dokumentacija ujema z dejanskim izdelkom?', 40),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'VPRASAJ', 'Kaj v dokumentaciji najpogosteje manjka?', 10),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'VPRASAJ', 'Kdaj delaš po stari risbi?', 20),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'UKREP', 'Kontrola dokumentacije pred sprostitvijo naloga', 10),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'UKREP', 'Označevanje verzij in sprememb', 20),
  ('TEHNOLOGIJA', 'DOKUMENTACIJA', 'UKREP', 'Povratna informacija iz proizvodnje v tehnologijo', 30),
  ('TEHNOLOGIJA', 'NORMATIVI', 'OPAZUJ', 'Ali se normativi za izbrane izdelke ujemajo z dejanskimi časi?', 10),
  ('TEHNOLOGIJA', 'NORMATIVI', 'OPAZUJ', 'Ali so po izboljšavah normativi posodobljeni?', 20),
  ('TEHNOLOGIJA', 'NORMATIVI', 'OPAZUJ', 'Ali so za nove izdelke normativi določeni pred začetkom proizvodnje?', 30),
  ('TEHNOLOGIJA', 'NORMATIVI', 'OPAZUJ', 'Kateri izdelki nimajo normativa?', 40),
  ('TEHNOLOGIJA', 'NORMATIVI', 'VPRASAJ', 'Pri katerem izdelku je normativ najmanj realen?', 10),
  ('TEHNOLOGIJA', 'NORMATIVI', 'VPRASAJ', 'Kdaj zadnjič si meril dejanski čas?', 20),
  ('TEHNOLOGIJA', 'NORMATIVI', 'UKREP', 'Meritev časa na gembi in popravek normativa', 10),
  ('TEHNOLOGIJA', 'NORMATIVI', 'UKREP', 'Seznam izdelkov brez normativa z rokom', 20),
  ('TEHNOLOGIJA', 'NORMATIVI', 'UKREP', 'Pregled normativov po vsaki izboljšavi', 30),
  ('TEHNOLOGIJA', 'PROGRAMI', 'OPAZUJ', 'Ali so programi za naloge pripravljeni pravočasno?', 10),
  ('TEHNOLOGIJA', 'PROGRAMI', 'OPAZUJ', 'Ali stroj čaka na program ali popravek programa?', 20),
  ('TEHNOLOGIJA', 'PROGRAMI', 'OPAZUJ', 'Ali so programi preverjeni in shranjeni v veljavni verziji?', 30),
  ('TEHNOLOGIJA', 'PROGRAMI', 'OPAZUJ', 'Ali so nastavitve strojev zapisane (parametri, orodja)?', 40),
  ('TEHNOLOGIJA', 'PROGRAMI', 'VPRASAJ', 'Kolikokrat moraš program popravljati na stroju?', 10),
  ('TEHNOLOGIJA', 'PROGRAMI', 'VPRASAJ', 'Kaj bi pospešilo pripravo dela?', 20),
  ('TEHNOLOGIJA', 'PROGRAMI', 'UKREP', 'Priprava programov vsaj en dan pred nalogom', 10),
  ('TEHNOLOGIJA', 'PROGRAMI', 'UKREP', 'Arhiv veljavnih programov', 20),
  ('TEHNOLOGIJA', 'PROGRAMI', 'UKREP', 'Zapis nastavitev za ponavljajoče se izdelke', 30),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'OPAZUJ', 'Ali so spremembe izdelka pravočasno predstavljene proizvodnji in montaži?', 10),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'OPAZUJ', 'Ali so ob uvajanju novega izdelka pripravljeni dokumentacija, programi, orodja in material?', 20),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'OPAZUJ', 'Ali se zaloga starih delov porabi ali zavrže?', 30),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'OPAZUJ', 'Ali so izkušnje prvih kosov zapisane in upoštevane?', 40),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'VPRASAJ', 'Katera zadnja sprememba je povzročila težave?', 10),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'VPRASAJ', 'Kaj bi moral izvedeti prej?', 20),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'UKREP', 'Kontrolni seznam uvajanja spremembe', 10),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'UKREP', 'Sestanek ob prvem kosu nove serije', 20),
  ('TEHNOLOGIJA', 'SPREMEMBE', 'UKREP', 'Zapis izkušenj in popravkov po prvi seriji', 30),
  ('TEHNOLOGIJA', 'PODPORA', 'OPAZUJ', 'Koliko odprtih vprašanj proizvodnje čaka na tehnologijo?', 10),
  ('TEHNOLOGIJA', 'PODPORA', 'OPAZUJ', 'Kako hitro je tehnolog na mestu, ko ga potrebujejo?', 20),
  ('TEHNOLOGIJA', 'PODPORA', 'OPAZUJ', 'Ali so težave in rešitve zapisane, da se ne ponavljajo?', 30),
  ('TEHNOLOGIJA', 'PODPORA', 'OPAZUJ', 'Ali tehnologi redno hodijo v proizvodnjo?', 40),
  ('TEHNOLOGIJA', 'PODPORA', 'VPRASAJ', 'Na kakšen odgovor tehnologije najdlje čakaš?', 10),
  ('TEHNOLOGIJA', 'PODPORA', 'VPRASAJ', 'Kaj bi tehnologija morala videti v proizvodnji?', 20),
  ('TEHNOLOGIJA', 'PODPORA', 'UKREP', 'Dnevni obhod tehnologa po proizvodnji', 10),
  ('TEHNOLOGIJA', 'PODPORA', 'UKREP', 'Seznam odprtih vprašanj z rokom odgovora', 20),
  ('TEHNOLOGIJA', 'PODPORA', 'UKREP', 'Baza znanih težav in rešitev', 30),
  ('TEHNOLOGIJA', 'LJUDJE', 'OPAZUJ', 'Ali je seznam odprtih nalog tehnologije viden in prioritiziran?', 10),
  ('TEHNOLOGIJA', 'LJUDJE', 'OPAZUJ', 'Ali tehnologija pozna glavne težave proizvodnje ta teden?', 20),
  ('TEHNOLOGIJA', 'LJUDJE', 'OPAZUJ', 'Ali so dogovori s proizvodnjo zapisani?', 30),
  ('TEHNOLOGIJA', 'LJUDJE', 'VPRASAJ', 'Kaj je danes tvoja najpomembnejša naloga?', 10),
  ('TEHNOLOGIJA', 'LJUDJE', 'VPRASAJ', 'Katero težavo si zadnjič javil vodji? Kaj se je zgodilo?', 20),
  ('TEHNOLOGIJA', 'LJUDJE', 'VPRASAJ', 'Kaj bi spremenil, če bi bil ti vodja oddelka?', 30),
  ('TEHNOLOGIJA', 'LJUDJE', 'UKREP', 'Tabla oddelka s cilji, rezultati in odprtimi težavami', 10),
  ('TEHNOLOGIJA', 'LJUDJE', 'UKREP', 'Kratek dnevni sestanek ob tabli (5-10 min)', 20),
  ('TEHNOLOGIJA', 'LJUDJE', 'UKREP', 'Odgovor na vsak predlog zaposlenega v enem tednu', 30),
  ('', '', 'SPLOSNO', 'Kaj je danes največja težava oddelka?', 10),
  ('', '', 'SPLOSNO', 'Ali oddelek ve, kakšen je cilj dneva in kako mu gre?', 20),
  ('', '', 'SPLOSNO', 'Kaj se je spremenilo od zadnjega audita (akcije, ljudje, procesi)?', 30),
  ('', '', 'SPLOSNO', 'Kaj bi tukaj videl obiskovalec, ki prvič pride v podjetje?', 40),
  ('', '', 'SPLOSNO', 'Kje oddelek potrebuje pomoč vodstva?', 50),
  ('', '', 'SPLOSNO', 'Kaj je ena stvar, ki jo lahko popravimo še ta teden?', 60)
) as v (oddelek, tema, skupina, besedilo, vrstni_red)
where not exists (
  select 1 from fp_aud_vprasanja x
  where x.oddelek = v.oddelek and x.tema = v.tema and x.skupina = v.skupina and x.besedilo = v.besedilo
);

-- vprašanja, odstranjena v aplikaciji
update fp_aud_vprasanja set visible = false where izbrisano and visible;

-- 1d. Nastavitve
create table if not exists fp_aud_nastavitve (
  id          bigint generated always as identity primary key,
  kljuc       text not null unique,
  vrednost    numeric(12, 2) not null,
  opis        text,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into fp_aud_nastavitve (kljuc, vrednost, opis) values
  ('CILJ_AUDITOV_TEDEN', 3, 'Cilj: število auditov na teden (vsi oddelki)'),
  ('DNI_BREZ_AUDITA', 14, 'Oddelek brez audita več kot toliko dni je rdeč'),
  ('ROK_A_DNI', 1, 'Prioriteta A: rok v dneh'),
  ('ROK_B_DNI', 7, 'Prioriteta B: rok v dneh'),
  ('ROK_C_DNI', 30, 'Prioriteta C: rok v dneh'),
  ('CILJ_PRAVOCASNO_PCT', 90, 'Cilj: delež akcij, zaprtih do roka (%)')
on conflict (kljuc) do nothing;

-- audit.oddelek -> šifrant oddelkov (namesto fiksnega seznama)
alter table fp_aud_audit drop constraint if exists fp_aud_audit_oddelek_ck;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fp_aud_audit_oddelek_fk') then
    alter table fp_aud_audit add constraint fp_aud_audit_oddelek_fk foreign key (oddelek) references fp_aud_oddelki(koda);
  end if;
end;
$$;

-- 2. Akcije: vrsta, prioriteta, ocena
alter table fp_aud_akcije add column if not exists vrsta text not null default 'NESKLADNOST';
alter table fp_aud_akcije add column if not exists prioriteta text;
alter table fp_aud_akcije add column if not exists reseno_na_mestu boolean not null default false;
alter table fp_aud_akcije add column if not exists resnost smallint;            -- velikost napake / škode 1-5
alter table fp_aud_akcije add column if not exists pomembnost smallint;         -- pomembnost za vodstvo 1-5
alter table fp_aud_akcije add column if not exists prihranek_eur numeric(12, 2); -- ocena prihranka (EUR/leto)
alter table fp_aud_akcije add column if not exists strosek_eur numeric(12, 2);   -- cena ukrepa (enkratno, EUR)
alter table fp_aud_akcije drop constraint if exists fp_aud_akcije_vrsta_ck;
alter table fp_aud_akcije add constraint fp_aud_akcije_vrsta_ck check (vrsta in ('NEVARNO', 'NESKLADNOST', 'OPAZANJE', 'PREDLOG', 'DOBRA_PRAKSA'));
alter table fp_aud_akcije drop constraint if exists fp_aud_akcije_prioriteta_ck;
alter table fp_aud_akcije add constraint fp_aud_akcije_prioriteta_ck check (prioriteta is null or prioriteta in ('A', 'B', 'C'));
alter table fp_aud_akcije drop constraint if exists fp_aud_akcije_ocena_ck;
alter table fp_aud_akcije add constraint fp_aud_akcije_ocena_ck check (
  (resnost is null or resnost between 1 and 5) and (pomembnost is null or pomembnost between 1 and 5));

-- 3. Slike akcij (pred / po)
alter table fp_aud_priloge add column if not exists akcija_id bigint references fp_aud_akcije(id);
alter table fp_aud_priloge add column if not exists faza text;
alter table fp_aud_priloge drop constraint if exists fp_aud_priloge_faza_ck;
alter table fp_aud_priloge add constraint fp_aud_priloge_faza_ck check (faza is null or faza in ('PRED', 'PO'));
create index if not exists fp_aud_priloge_akcija_idx on fp_aud_priloge (akcija_id);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['fp_aud_oddelki', 'fp_aud_teme', 'fp_aud_nastavitve'] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function fp_set_updated_at()',
      t || '_updated_at', t);
  end loop;
end;
$$;

-- RLS - samo prijavljeni (authenticated), brez DELETE (podatke skrijemo)
do $$
declare t text;
begin
  foreach t in array array['fp_aud_oddelki', 'fp_aud_teme', 'fp_aud_nastavitve'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated using (true) with check (true)', t || '_update', t);
  end loop;
end;
$$;
