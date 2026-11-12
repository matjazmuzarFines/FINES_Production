-- =====================================================================
-- FINES - Production | 036: Poročano delo (štempljanje po nalogih) za Produktivnost
--
-- Izvoz iz ERP "Porocano_delo.xlsx": vsak začetek / konec dela delavca na nalogu in operaciji.
-- Delavec se lahko hkrati štemplja na več nalogov - ERP čas razdeli med njih ("Poročane ure"),
-- zato se uporablja ta stolpec (razlika konec - začetek bi čas štela večkrat).
--
-- fp_por_delo: vrstice so seštete po dnevu + nalogu + delavcu + operaciji (izvoz ima za isti
--   nalog več vrstic, npr. laser po pozicijah). Uvoz posodobi samo zadnjih 60 dni (starejši se
--   ne spreminjajo); vrstica, ki je v tem obdobju ni več v izvozu, dobi visible = false.
-- fp_por_uvozi: evidenca uvozov (čas, datoteka, število) - za sync in "Vir podatkov".
-- fp_nalogi_krovnih(krovni): nalogi krovnih nalogov iz VSEH uvozov nalogov (zaključeni nalogi
--   izpadejo iz zadnjega uvoza, poročane ure nanje pa je treba šteti krovnemu).
-- Zaženi PO 035. Idempotentno. Dostop samo za prijavljene.
-- =====================================================================

create table if not exists fp_por_uvozi (
  id           bigint generated always as identity primary key,
  datoteka     text not null,
  st_postavk   integer not null default 0,
  aktiven      boolean not null default false,  -- aplikacija ga aktivira, ko so vse vrstice vpisane
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists fp_por_delo (
  id               bigint generated always as identity primary key,
  datum            date not null,               -- dan začetka dela
  st_naloga        text not null default '',    -- '' = vnos brez naloga (npr. paleta)
  delavec          text not null,               -- šifra delavca v ERP
  ime_delavca      text,
  operacija        text not null default '',    -- šifra operacije v ERP
  naziv_operacije  text,
  delovno_mesto    text,                        -- delovno mesto v ERP (ni celica delovnega plana)
  opis             text,                        -- opis naloga
  ident            text,
  status           text,                        -- status naloga ob izvozu (Z = zaključen, O = odprt)
  ure              numeric(10, 4) not null default 0,  -- vsota "Poročane ure"
  zacetek          timestamp,                   -- prvi začetek dela (lokalni čas)
  konec            timestamp,                   -- zadnji konec dela
  st_vnosov        integer not null default 1,
  uvoz_id          bigint references fp_por_uvozi(id),
  visible          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint fp_por_delo_uq unique (datum, st_naloga, delavec, operacija)
);
create index if not exists fp_por_delo_datum_idx on fp_por_delo(datum);
create index if not exists fp_por_delo_nalog_idx on fp_por_delo(st_naloga);

-- Ko uvoz postane aktiven, prejšnji niso več aktivni (ista funkcija kot pri Doizdaji)
drop trigger if exists fp_por_uvozi_deaktiviraj on fp_por_uvozi;
create trigger fp_por_uvozi_deaktiviraj
  after insert or update of aktiven on fp_por_uvozi
  for each row execute function fp_doi_uvozi_deaktiviraj();

-- updated_at + RLS (samo prijavljeni, brez DELETE)
do $$
declare t text;
begin
  foreach t in array array['fp_por_uvozi', 'fp_por_delo'] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function fp_set_updated_at()',
      t || '_updated_at', t);

    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('drop policy if exists fos_dostop on %I', t);
    execute format(
      'create policy fos_dostop on %I as restrictive for all to authenticated using ((select public.fos_ima_dostop(%L))) with check ((select public.fos_ima_dostop(%L)))',
      t, t, t);
    execute format('grant select, insert, update on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

-- Nalogi krovnih nalogov iz vseh uvozov (zadnji znani podatki naloga)
create or replace function fp_nalogi_krovnih(p_krovni text[])
returns table (st_naloga text, krovni_dn text, koda_artikla text, naziv_artikla text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (n.st_naloga) n.st_naloga, n.krovni_dn, n.koda_artikla, n.naziv_artikla
  from fp_zas_nalogi n
  where n.visible and (n.krovni_dn = any (p_krovni) or n.st_naloga = any (p_krovni))
  order by n.st_naloga, n.uvoz_id desc;
$$;
revoke all on function fp_nalogi_krovnih(text[]) from public, anon;
grant execute on function fp_nalogi_krovnih(text[]) to authenticated;

-- Sync: dovoljen par ključ / tabela za poročano delo
create or replace function public.fp_sync_zakleni(p_kljuc text, p_tabela text, p_cas timestamp with time zone)
 returns text
 language plpgsql
 set search_path to 'public'
as $function$
declare v_izvoz timestamptz; v_uvoz timestamptz; v_zaklep timestamptz; v_kdo text;
begin
  if not exists (select 1 from (values
    ('nalogi','fp_zas_uvozi'), ('material','spl_material_uvozi'), ('narocila','fp_pri_uvozi'),
    ('odpreme','fp_pri_odp_uvozi'), ('prevzemi','fp_doi_prevzemi_uvozi'), ('izdaje','fp_doi_izdaje_uvozi'),
    ('identi','spl_identi_uvozi'), ('kosovnice','spl_kosovnice_uvozi'), ('porocano','fp_por_uvozi')
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
end $function$;
