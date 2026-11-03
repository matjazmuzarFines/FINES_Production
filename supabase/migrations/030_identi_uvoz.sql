-- FINES Production | 030: uvoz identov na novo, po vzoru materiala. Ročno PO 027.
-- Odstrani atomski RPC (stari 027/028/029) in stolpec spl_identi.uvoz_id.
-- spl_identi_uvozi je na novo samo evidenca uvozov (čas, datoteka, število).
-- Podatkov v spl_identi ne briše in nobene šifre ne skrije.
-- spl_identi je skupna tabela s FINES_WorkInstructions: pisanje je odprto vsem
-- prijavljenim z dostopom (restriktivna fos_dostop ostane), enako kot spl_material.
begin;

drop function if exists public.spl_identi_uvozi_excel(text, jsonb);
drop index if exists public.spl_identi_uvoz;
alter table public.spl_identi drop column if exists uvoz_id;
drop table if exists public.spl_identi_uvozi;

create table public.spl_identi_uvozi (
  id           bigint generated always as identity primary key,
  datoteka     text not null,
  st_postavk   integer not null default 0,
  aktiven      boolean not null default false,  -- aplikacija ga aktivira, ko so vsi zapisi vpisani
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.spl_identi_uvozi_deaktiviraj()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.aktiven then
    update spl_identi_uvozi set aktiven = false where id <> new.id and aktiven;
  end if;
  return null;
end;
$$;

create trigger spl_identi_uvozi_deaktiviraj
  after insert or update of aktiven on public.spl_identi_uvozi
  for each row execute function public.spl_identi_uvozi_deaktiviraj();
create trigger spl_identi_uvozi_updated_at
  before update on public.spl_identi_uvozi
  for each row execute function public.fp_set_updated_at();

-- RLS: samo prijavljeni, brez DELETE
alter table public.spl_identi_uvozi enable row level security;
create policy spl_identi_uvozi_select on public.spl_identi_uvozi for select to authenticated using (true);
create policy spl_identi_uvozi_insert on public.spl_identi_uvozi for insert to authenticated with check (true);
create policy spl_identi_uvozi_update on public.spl_identi_uvozi for update to authenticated using (true) with check (true);
-- fos_dostop lahko doda že FOS ob create table; zato jo na novo ustvarimo z enako vsebino.
drop policy if exists fos_dostop on public.spl_identi_uvozi;
create policy fos_dostop on public.spl_identi_uvozi as restrictive for all to authenticated
  using ((select public.fos_ima_dostop('spl_identi_uvozi'))) with check ((select public.fos_ima_dostop('spl_identi_uvozi')));
grant select, insert, update on public.spl_identi_uvozi to authenticated;
revoke all on public.spl_identi_uvozi from anon;

-- Pisanje identov ni več omejeno na wi_admini.
alter policy spl_identi_insert on public.spl_identi with check (true);
alter policy spl_identi_update on public.spl_identi using (true) with check (true);
grant select, insert, update on public.spl_identi to authenticated;

commit;
