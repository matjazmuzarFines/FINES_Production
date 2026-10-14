-- =====================================================================
-- FINES - Production | 014: Produktivnost - lastna vprašanja gembe
--
-- Vprašanja v vodiču gembe so vgrajena (gembaVodic.ts). Tukaj so:
--   - dodana vprašanja (izbrisano = false),
--   - odstranjena vgrajena vprašanja (izbrisano = true; besedilo = vgrajeno).
-- tema: koda izgube ('' = splošna vprašanja)
-- skupina: OPAZUJ / VPRASAJ / SPLOSNO
-- Dodano vprašanje odstranimo z visible = false.
-- Zaženi PO 013_produktivnost_faktor_investicije.sql. Idempotentno.
-- =====================================================================

create table if not exists fp_prod_vprasanja (
  id          bigint generated always as identity primary key,
  tema        text not null default '',
  skupina     text not null,
  besedilo    text not null,
  izbrisano   boolean not null default false,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fp_prod_vprasanja_skupina_ck check (skupina in ('OPAZUJ', 'VPRASAJ', 'SPLOSNO')),
  constraint fp_prod_vprasanja_besedilo_ck check (length(trim(besedilo)) > 0)
);

drop trigger if exists fp_prod_vprasanja_updated_at on fp_prod_vprasanja;
create trigger fp_prod_vprasanja_updated_at before update on fp_prod_vprasanja
  for each row execute function fp_set_updated_at();

-- RLS - samo prijavljeni (authenticated), brez DELETE (podatke skrijemo)
alter table fp_prod_vprasanja enable row level security;
drop policy if exists fp_prod_vprasanja_select on fp_prod_vprasanja;
drop policy if exists fp_prod_vprasanja_insert on fp_prod_vprasanja;
drop policy if exists fp_prod_vprasanja_update on fp_prod_vprasanja;
create policy fp_prod_vprasanja_select on fp_prod_vprasanja for select to authenticated using (true);
create policy fp_prod_vprasanja_insert on fp_prod_vprasanja for insert to authenticated with check (true);
create policy fp_prod_vprasanja_update on fp_prod_vprasanja for update to authenticated using (true) with check (true);
