-- FINES Production: Primerjava kosovnic. Za ročni zagon PO 025.
-- Te skripte agent NI izvedel. Uvoz identov je v 030.
-- spl_kosovnice_uvozi hrani zgodovino in prepreči aktivacijo delnega uvoza.
-- Kosovnice so posnetki; stare postavke ostanejo. Brez DELETE.
begin;

alter table public.spl_identi add column if not exists risp_sifra text;

create table if not exists public.spl_kosovnice_uvozi (
  id bigint generated always as identity primary key,
  datoteka text not null, st_postavk integer not null check (st_postavk > 0),
  aktiven boolean not null default false, visible boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists spl_kosovnice_en_aktiven on public.spl_kosovnice_uvozi(aktiven) where aktiven;
create table if not exists public.spl_kosovnice (
  id bigint generated always as identity primary key,
  uvoz_id bigint not null references public.spl_kosovnice_uvozi(id),
  vrstica integer not null, izdelek text not null, nivo integer not null check (nivo > 0),
  risp_sifra text not null, sifra text not null, naziv text not null,
  klasifikat text, vrsta text, kolicina numeric not null check (kolicina >= 0),
  visible boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(uvoz_id, vrstica)
);
-- Izdelek + vrstni red + nivo hranijo posamezno pojavitev in njenega starša.
-- Šifre RISP niso tuji ključi na interni spl_identi.id.
create index if not exists spl_kosovnice_izdelek on public.spl_kosovnice(uvoz_id, izdelek, vrstica);
create index if not exists spl_kosovnice_koren on public.spl_kosovnice(uvoz_id, sifra) where nivo=1 and visible;

do $$ declare t text; begin
  foreach t in array array['spl_kosovnice_uvozi','spl_kosovnice'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.fp_set_updated_at()', t || '_updated_at', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
grant usage, select on sequence public.spl_kosovnice_uvozi_id_seq, public.spl_kosovnice_id_seq to authenticated;

create or replace function public.spl_kosovnice_podaljsaj_zaklep()
returns void language sql security invoker set search_path = public as $$
  update fp_sync_stanje set zaklenjeno_at=now()
    where kljuc='kosovnice' and zaklenil=auth.jwt()->>'email';
$$;

create or replace function public.spl_kosovnice_aktiviraj(p_uvoz bigint)
returns void language plpgsql security invoker set search_path = public as $$
declare v_pricakovano integer; v_dejansko integer;
begin
  if auth.uid() is null then raise exception 'Ni prijave'; end if;
  perform pg_advisory_xact_lock(hashtext('spl_kosovnice_uvoz'));
  select st_postavk into v_pricakovano from spl_kosovnice_uvozi where id=p_uvoz and visible for update;
  select count(*) into v_dejansko from spl_kosovnice where uvoz_id=p_uvoz and visible;
  if v_pricakovano is null or v_dejansko<>v_pricakovano then raise exception 'Nepopoln uvoz kosovnic'; end if;
  if exists(select 1 from spl_kosovnice_uvozi where aktiven and id>p_uvoz) then raise exception 'Novejši uvoz je že aktiven'; end if;
  update spl_kosovnice_uvozi set aktiven=false where aktiven;
  update spl_kosovnice_uvozi set aktiven=true where id=p_uvoz;
end $$;

revoke all on function public.spl_kosovnice_aktiviraj(bigint), public.spl_kosovnice_podaljsaj_zaklep() from public, anon;
grant execute on function public.spl_kosovnice_aktiviraj(bigint), public.spl_kosovnice_podaljsaj_zaklep() to authenticated;

-- Razširjen obstoječi zaklep; pari ključ/tabela so preverjeni.
create or replace function public.fp_sync_zakleni(p_kljuc text, p_tabela text, p_cas timestamptz)
returns text language plpgsql security invoker set search_path = public as $$
declare v_izvoz timestamptz; v_uvoz timestamptz; v_zaklep timestamptz; v_kdo text;
begin
  if not exists (select 1 from (values
    ('nalogi','fp_zas_uvozi'), ('material','spl_material_uvozi'), ('narocila','fp_pri_uvozi'),
    ('odpreme','fp_pri_odp_uvozi'), ('prevzemi','fp_doi_prevzemi_uvozi'), ('izdaje','fp_doi_izdaje_uvozi'),
    ('identi','spl_identi_uvozi'), ('kosovnice','spl_kosovnice_uvozi')
  ) as t(k,v) where k=p_kljuc and v=p_tabela) then raise exception 'Neznan par ključ/tabela'; end if;
  perform pg_advisory_xact_lock(hashtext('fp_sync:' || p_kljuc));
  select izvoz_cas,zaklenjeno_at,zaklenil into v_izvoz,v_zaklep,v_kdo from fp_sync_stanje where kljuc=p_kljuc;
  if p_cas is not null then
    if v_izvoz is not null and v_izvoz>=p_cas then return 'uvozeno'; end if;
    if v_izvoz is null then
      execute format('select max(created_at) from %I where aktiven and visible',p_tabela) into v_uvoz;
      if v_uvoz is not null and v_uvoz>=p_cas then return 'uvozeno'; end if;
    end if;
  end if;
  if v_zaklep is not null and v_zaklep>now()-interval '5 minutes' then return 'zaklenjeno:' || coalesce(v_kdo,''); end if;
  insert into fp_sync_stanje(kljuc,zaklenjeno_at,zaklenil) values(p_kljuc,now(),auth.jwt()->>'email')
    on conflict(kljuc) do update set zaklenjeno_at=now(),zaklenil=auth.jwt()->>'email';
  return 'ok';
end $$;
revoke all on function public.fp_sync_zakleni(text,text,timestamptz) from public, anon;
grant execute on function public.fp_sync_zakleni(text,text,timestamptz) to authenticated;
commit;
