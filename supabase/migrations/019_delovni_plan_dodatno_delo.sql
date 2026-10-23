-- =====================================================================
-- FINES - Production | 019: Delovni plan - delovno mesto "Dodatno delo"
--
-- Vsak oddelek delovnega plana (Proizvodnja, Montaža, Elektro montaža,
-- Testiranje) dobi delovno mesto "Dodatno delo" za delo izven redne
-- proizvodnje (pakiranje elektronik, povezovalni kompleti ...).
--   dodatno_delo = true: mesto ni v dnevni rutini in se ne šteje v
--                  "oddelek skupaj" na delovnem planu.
-- Na to mesto se lahko postavijo krovni nalogi ali proste naloge:
--   prosta = true: naloga ni iz uvoza; krovni_dn = naziv naloge, ure ročne.
-- Zaženi PO 017_delovni_plan_nalogi.sql. Idempotentno.
-- =====================================================================

alter table fp_delovna_mesta add column if not exists dodatno_delo boolean not null default false;
alter table fp_plan_postavitve add column if not exists prosta boolean not null default false;

insert into fp_delovna_mesta (naziv, oddelek_id, vrstni_red, rutina_aktivna, privzeto_zaposlenih, dodatno_delo)
select
  'Dodatno delo',
  o.id,
  coalesce((select max(d.vrstni_red) from fp_delovna_mesta d where d.oddelek_id = o.id), o.vrstni_red) + 5,
  false,
  1,
  true
from fp_oddelki o
where o.koda in ('P', 'M', 'E', 'T')
  and not exists (select 1 from fp_delovna_mesta d where d.oddelek_id = o.id and d.dodatno_delo);
