-- =====================================================================
-- FINES - Production | 007: Change management - vodja operacij
-- Področja dobijo sklop (npr. Proizvodnja, Skladišče, Tehnologija + razvoj),
-- po katerem se na strani združujejo. Vodja operacij dobi 8 področij.
-- Zaženi PO 005_change_management_cilji.sql. Idempotentno.
-- =====================================================================

alter table fp_cm_podrocja add column if not exists sklop text;  -- null = brez sklopa

insert into fp_cm_podrocja (koda, naziv, sklop, barva, tocke, vrstni_red) values
  -- Proizvodnja
  ('VO_PR_ORGANIZACIJA', 'Organizacija',       'Proizvodnja',          '#2f6fd6',
     E'Jasne prioritete\nJasen plan dela\nKomunikacija plana dela', 101),
  ('VO_PR_PRODUKTIVNOST','Produktivnost',      'Proizvodnja',          '#2f6fd6',
     E'Organizacija dela\nPrihranki\nProduktivnost', 102),
  ('VO_PR_OPREMA',       'Oprema',             'Proizvodnja',          '#2f6fd6',
     E'Novo orodje\nOprema\nDigitalizacija', 103),
  -- Skladišče
  ('VO_SK_ORGANIZACIJA', 'Organizacija',       'Skladišče',            '#2e9d57',
     E'Pravočasne dobave proizvodnji\nKomunikacija s skladiščem\nPlan dobave materiala', 111),
  ('VO_SK_IZDAJA',       'Izdaja',             'Skladišče',            '#2e9d57',
     E'Izdaja materiala v celoti\nIzdaja na pravilno mesto', 112),
  ('VO_SK_PREVZEMI',     'Prevzemi materiala', 'Skladišče',            '#2e9d57',
     E'Pravočasni prevzem in izdaja materiala v proizvodnjo', 113),
  -- Tehnologija + razvoj
  ('VO_TR_SODELOVANJE',  'Sodelovanje',        'Tehnologija + razvoj', '#7c4dcc',
     E'Pravočasno odpravljanje napak\nSodelovanje\nPomoč proizvodnji', 121),
  ('VO_TR_PROTOTIPI',    'Prototipi',          'Tehnologija + razvoj', '#7c4dcc',
     E'Predajanje navodil proizvodnji\nSodelovanje\nVodenje\nDokumentacija', 122)
on conflict (koda) do nothing;

insert into ln_fp_cm_vodje_podrocja (vodja_id, podrocje_id, vrstni_red)
select v.id, p.id, p.vrstni_red
from fp_cm_vodje v
cross join fp_cm_podrocja p
where v.koda = 'VO' and p.koda like 'VO\_%'
on conflict (vodja_id, podrocje_id) do nothing;
