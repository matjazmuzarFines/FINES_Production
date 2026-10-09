-- =====================================================================
-- FINES - Production | 005: Change management - cilji in barve področij
-- Vsako področje dobi: barvo (iz infografike "Upravljanje sprememb"),
-- geslo, točke (konkretno, na čem se dela), pričakovanja in cilj v %.
-- Zaženi PO 004_change_management.sql. Idempotentno (obstoječe ocene ostanejo).
-- =====================================================================

alter table fp_cm_podrocja add column if not exists barva        text not null default '#ca5010';
alter table fp_cm_podrocja add column if not exists geslo        text;
alter table fp_cm_podrocja add column if not exists tocke        text;          -- ena točka v vrstici
alter table fp_cm_podrocja add column if not exists pricakovanja text;
alter table fp_cm_podrocja add column if not exists cilj         numeric(6, 2) not null default 40;  -- % v 3 mesecih

update fp_cm_podrocja set
  barva = '#d93b3b',
  geslo = 'Najprej plan, potem delo',
  tocke = E'Naredi plan za teden\nRazporedi ljudi po delu\nPreveri material in roke'
where koda = 'PLAN' and geslo is null;

update fp_cm_podrocja set
  barva = '#2f6fd6',
  geslo = 'Povej, uči, popravi',
  tocke = E'Jasno povej, kaj kdo dela\nČe nekdo ne zna, ga nauči\nDobro delo pohvali, napako povej takoj'
where koda = 'LJUDJE' and geslo is null;

update fp_cm_podrocja set
  barva = '#2e9d57',
  geslo = 'Kratek sestanek, jasen dogovor',
  tocke = E'Jutranji sestanek vsak dan\nPovej: plan, problem, pomoč\nDogovor = kdo + do kdaj'
where koda = 'RUTINA' and geslo is null;

update fp_cm_podrocja set
  barva = '#e0a100',
  geslo = 'Ne čakaj predolgo',
  tocke = E'Ne veš? Vprašaj\nProblem? Povej takoj\nPredlog? Predstavi ga'
where koda = 'POMOC' and geslo is null;

update fp_cm_podrocja set
  barva = '#e5701e',
  geslo = 'Organiziraj, ne delaj namesto vseh',
  tocke = E'Ne delaj namesto ekipe\nOdstrani ovire pri delu\nPripravi delo za naprej'
where koda = 'ORGANIZACIJA' and geslo is null;

update fp_cm_podrocja set
  barva = '#7c4dcc',
  geslo = 'Vsak teden nekaj boljše',
  tocke = E'Išči izgube časa\nPopravi vzrok, ne samo posledice\nVsak teden ena izboljšava'
where koda = 'NAPREDEK' and geslo is null;

update fp_cm_podrocja set
  barva = '#138a8a',
  geslo = 'Mirno, pošteno, brez jamranja',
  tocke = E'Ne govori: ne da se\nKar obljubiš, naredi\nPravila veljajo tudi za vodjo'
where koda = 'ODNOS' and geslo is null;
