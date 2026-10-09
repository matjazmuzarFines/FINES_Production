-- =====================================================================
-- FINES - Production | 008: Change management - vodja operacij združeno
-- Namesto 8 podrobnih področij (007) ima vodja operacij 3 področja:
-- Proizvodnja, Skladišče, Tehnologija + razvoj. Podrobna področja so
-- zdaj cilji (točke) znotraj teh treh. Podrobna področja se skrijejo
-- (visible = false), ne brišejo.
-- Zaženi PO 007_change_management_operacije.sql. Idempotentno.
-- =====================================================================

-- Skrij podrobna področja iz 007 in njihove povezave z vodjo
update fp_cm_podrocja set visible = false
where koda in ('VO_PR_ORGANIZACIJA', 'VO_PR_PRODUKTIVNOST', 'VO_PR_OPREMA',
               'VO_SK_ORGANIZACIJA', 'VO_SK_IZDAJA', 'VO_SK_PREVZEMI',
               'VO_TR_SODELOVANJE', 'VO_TR_PROTOTIPI')
  and visible;

update ln_fp_cm_vodje_podrocja l set visible = false
from fp_cm_podrocja p
where l.podrocje_id = p.id and not p.visible and l.visible;

-- Tri združena področja (cilj: "Področje: točke")
insert into fp_cm_podrocja (koda, naziv, barva, geslo, tocke, vrstni_red) values
  ('VO_PROIZVODNJA', 'Proizvodnja', '#2f6fd6', null,
     E'Organizacija: jasne prioritete, jasen plan dela, komunikacija plana dela\n' ||
     E'Produktivnost: organizacija dela, prihranki, produktivnost\n' ||
     E'Oprema: novo orodje, oprema, digitalizacija', 201),
  ('VO_SKLADISCE', 'Skladišče', '#2e9d57', null,
     E'Organizacija: pravočasne dobave proizvodnji, komunikacija s skladiščem, plan dobave materiala\n' ||
     E'Izdaja: izdaja materiala v celoti, izdaja na pravilno mesto\n' ||
     E'Prevzemi materiala: pravočasni prevzem in izdaja materiala v proizvodnjo', 202),
  ('VO_TEH_RAZVOJ', 'Tehnologija + razvoj', '#7c4dcc', null,
     E'Sodelovanje: pravočasno odpravljanje napak, sodelovanje, pomoč proizvodnji\n' ||
     E'Prototipi: predajanje navodil proizvodnji, sodelovanje, vodenje, dokumentacija', 203)
on conflict (koda) do nothing;

insert into ln_fp_cm_vodje_podrocja (vodja_id, podrocje_id, vrstni_red)
select v.id, p.id, p.vrstni_red
from fp_cm_vodje v
cross join fp_cm_podrocja p
where v.koda = 'VO' and p.koda in ('VO_PROIZVODNJA', 'VO_SKLADISCE', 'VO_TEH_RAZVOJ')
on conflict (vodja_id, podrocje_id) do nothing;
