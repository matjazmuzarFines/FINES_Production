-- =====================================================================
-- FINES - Production | Testni podatki (iz CSV izvozov Power Appa)
-- Zaženi PO 001_schema.sql. Skripta je idempotentna (ponovni zagon ne podvaja).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Oddelki
-- ---------------------------------------------------------------------
insert into fp_oddelki (naziv, vrstni_red) values
  ('Proizvodnja',     10),
  ('Montaža',         20),
  ('Elektro montaža', 30),
  ('Testiranje',      40)
on conflict (naziv) do nothing;

-- ---------------------------------------------------------------------
-- Delovna mesta (AppPR_DelovnaMesta.csv)
-- ---------------------------------------------------------------------
insert into fp_delovna_mesta (naziv, oddelek_id, vrstni_red, rutina_aktivna, velja_od)
select v.naziv, o.id, v.vrstni_red, true, date '2026-07-13'
from (values
  ('Razrez',              'Proizvodnja',     10),
  ('Krivljenje - 1',      'Proizvodnja',     20),
  ('Krivljenje - 2',      'Proizvodnja',     25),
  ('Varjenje - malo',     'Proizvodnja',     30),
  ('Varjenje - veliko',   'Proizvodnja',     35),
  ('Varjenje - točkovno', 'Proizvodnja',     38),
  ('Brušenje',            'Proizvodnja',     40),
  ('Montaža - 1',         'Montaža',        100),
  ('Montaža - 2',         'Montaža',        105),
  ('Elektro montaža',     'Elektro montaža', 150),
  ('Testiranje',          'Testiranje',     200)
) as v(naziv, oddelek, vrstni_red)
join fp_oddelki o on o.naziv = v.oddelek
where not exists (select 1 from fp_delovna_mesta d where d.naziv = v.naziv);

-- ---------------------------------------------------------------------
-- Sekcije skladišča
-- ---------------------------------------------------------------------
insert into fp_skl_sekcije (koda, naziv, vrstni_red) values
  ('PREVZEM',     'Prevzem',     10),
  ('PROIZVODNJA', 'Proizvodnja', 20),
  ('PLAN',        'Plan',        30),
  ('SERVIS',      'Servis',      40)
on conflict (koda) do nothing;

-- ---------------------------------------------------------------------
-- Kontrolne točke (AppSKL_KontrolneTocke.csv)
-- ---------------------------------------------------------------------
insert into fp_skl_kontrolne_tocke
  (koda, naziv, vprasanje, navodilo, sekcija_id, vrstni_red, cas_kontrole, tip_vnosa,
   ciljni_procent, opis_obvezen_pri_nok, slika_obvezna_pri_nok, casovne_izgube_omogocene, aktivna)
select v.koda, v.naziv, v.vprasanje, v.navodilo, s.id, v.vrstni_red, v.cas::time, v.tip,
       v.cilj, v.opis_obv, v.slika_obv, v.izgube, true
from (values
  ('PREVZEM_0730', 'Prevzem materiala', 'Ali je bil ves material prevzet?',
   'Preveri, ali je ves do takrat dostavljeni material prevzet, evidentiran in razpoložljiv za nadaljnjo izdajo.',
   'PREVZEM', 1, '07:30', 'DA_NE', null::smallint, true, true, true),
  ('DOSTAVA_NEDOKONCANI', 'Dopolnjevanje nalogov', 'Ali je vse dostavljeno v proizvodnjo?',
   'Z vodjo preveri delno nabrane naloge. Ugotovi, ali je bilo kaj manjkajočega materiala na novo prevzeto in ali je bilo takoj dostavljeno na ustrezno mesto v proizvodnji.',
   'PROIZVODNJA', 2, '08:30', 'DA_NE', null::smallint, true, false, true),
  ('PLAN_1', 'Dnevni plan 1', 'Kolikšen delež dnevnega plana je trenutno dosežen?',
   'Oceni dosežen delež priprave materiala za proizvodnjo in priprave odprem glede na stanje, ki bi moralo biti doseženo ob času kontrole.',
   'PLAN', 3, '09:45', 'PROCENT', 40::smallint, true, false, true),
  ('PLAN_2', 'Dnevni plan 2', 'Kolikšen delež dnevnega plana je dosežen?',
   'Preveri realizacijo priprave materiala za proizvodnjo in priprave odprem za časovno okno od 8:30 do 13:30.',
   'PLAN', 4, '13:30', 'PROCENT', 90::smallint, true, false, true),
  ('MATERIAL_SERVIS', 'Material za serviserje', 'Ali je ves zahtevani material za serviserje pripravljen?',
   'Preveri vse aktivne zahteve serviserjev in potrdi, da je razpoložljiv material v celoti nabran in pripravljen za prevzem.',
   'SERVIS', 5, '14:00', 'DA_NE', null::smallint, true, false, true)
) as v(koda, naziv, vprasanje, navodilo, sekcija, vrstni_red, cas, tip, cilj, opis_obv, slika_obv, izgube)
join fp_skl_sekcije s on s.koda = v.sekcija
on conflict (koda) do nothing;

-- ---------------------------------------------------------------------
-- Rutina skladišča (AppSKL_Rutina.csv) - testni vnosi
-- izpolnjeno / ima_odstopanje / cas_zakljucka izračuna trigger
-- ---------------------------------------------------------------------
insert into fp_skl_rutina
  (datum, kontrolna_tocka_id, ciljni_procent, odgovor, dosezen_procent, komentar, casovne_izgube_min)
select v.datum::date, k.id, v.cilj, v.odgovor, v.procent, v.komentar, v.izgube
from (values
  ('2026-08-03', 'PREVZEM_0730',        null::smallint, 'DA', null::smallint, 'Ni pospravljeno', 0),
  ('2026-08-03', 'DOSTAVA_NEDOKONCANI', null, null, null, null, 0),
  ('2026-08-03', 'PLAN_1',              40,  null, 41,   null, 0),
  ('2026-08-03', 'PLAN_2',              100, null, 100,  null, 0),
  ('2026-08-03', 'MATERIAL_SERVIS',     null, 'DA', null, null, 0),
  ('2026-08-04', 'PREVZEM_0730',        null, 'DA', null, null, 0),
  ('2026-08-04', 'DOSTAVA_NEDOKONCANI', null, null, null, null, 0),
  ('2026-08-04', 'PLAN_1',              40,  null, 41,   null, 0),
  ('2026-08-04', 'PLAN_2',              100, null, 100,  null, 0),
  ('2026-08-04', 'MATERIAL_SERVIS',     null, 'DA', null, null, 0),
  ('2026-08-05', 'PREVZEM_0730',        null, 'DA', null, 'Ni pospravljeno - dostavljeno', 0),
  ('2026-08-05', 'DOSTAVA_NEDOKONCANI', null, 'DA', null, null, 0),
  ('2026-08-05', 'PLAN_1',              40,  null, 41,   null, 0),
  ('2026-08-05', 'PLAN_2',              100, null, 85,   'Vitirne delo.', 90),
  ('2026-08-05', 'MATERIAL_SERVIS',     null, 'DA', null, null, 0),
  ('2026-09-18', 'PREVZEM_0730',        null, 'DA', null, 'vse ok 1', 1),
  ('2026-09-18', 'DOSTAVA_NEDOKONCANI', null, 'DA', null, 'vse ok 2', 2),
  ('2026-09-18', 'PLAN_1',              40,  null, 26,   'zamude s servisom', 90),
  ('2026-09-18', 'PLAN_2',              100, null, 100,  null, 4),
  ('2026-09-18', 'MATERIAL_SERVIS',     null, 'DA', null, 'vse ok', 5)
) as v(datum, koda, cilj, odgovor, procent, komentar, izgube)
join fp_skl_kontrolne_tocke k on k.koda = v.koda
on conflict (datum, kontrolna_tocka_id) do nothing;
