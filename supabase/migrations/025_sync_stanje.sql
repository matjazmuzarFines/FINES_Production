-- =====================================================================
-- FINES - Production | 025: Sync podatkov iz ERP - stanje in zaklep
--
-- En zapis na izvoz (nalogi, material, narocila, odpreme, prevzemi, izdaje):
--   izvoz_cas      čas spremembe datoteke (v mapi), ki je bila nazadnje uvožena -
--                  stanje "sinhronizirano" primerja čas datoteke s časom datoteke,
--                  zato ura serverja z izvozi ni pomembna
--   zaklenjeno_at  uvoz v teku (en uporabnik naenkrat; zaklep po 5 min poteče)
-- Funkcije:
--   fp_sync_zakleni(kljuc, tabela, cas)  'ok' | 'uvozeno' | 'zaklenjeno:<e-mail>'
--   fp_sync_koncaj(kljuc, cas)           uvoz uspel: zapiše izvoz_cas, sprosti zaklep
--   fp_sync_odkleni(kljuc)               uvoz ni uspel: sprosti zaklep
-- Zaženi PO 001_schema.sql. Idempotentno. Dostop samo za prijavljene.
-- =====================================================================

create table if not exists fp_sync_stanje (
  kljuc          text primary key,
  izvoz_cas      timestamptz,
  uvozeno_at     timestamptz,
  uvozil         text,
  zaklenjeno_at  timestamptz,
  zaklenil       text,
  visible        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists fp_sync_stanje_updated_at on fp_sync_stanje;
create trigger fp_sync_stanje_updated_at
  before update on fp_sync_stanje for each row execute function fp_set_updated_at();

alter table fp_sync_stanje enable row level security;
drop policy if exists fp_sync_stanje_select on fp_sync_stanje;
drop policy if exists fp_sync_stanje_insert on fp_sync_stanje;
drop policy if exists fp_sync_stanje_update on fp_sync_stanje;
create policy fp_sync_stanje_select on fp_sync_stanje for select to authenticated using (true);
create policy fp_sync_stanje_insert on fp_sync_stanje for insert to authenticated with check (true);
create policy fp_sync_stanje_update on fp_sync_stanje for update to authenticated using (true) with check (true);

-- Zaklep pred uvozom. p_cas = čas datoteke (null = vsiljen uvoz, samo zaklep).
create or replace function fp_sync_zakleni(p_kljuc text, p_tabela text, p_cas timestamptz)
returns text
language plpgsql
security invoker
as $$
declare
  v_izvoz   timestamptz;
  v_uvoz    timestamptz;
  v_zaklep  timestamptz;
  v_kdo     text;
begin
  if p_tabela not in ('fp_zas_uvozi', 'spl_material_uvozi', 'fp_pri_uvozi', 'fp_pri_odp_uvozi',
                      'fp_doi_prevzemi_uvozi', 'fp_doi_izdaje_uvozi') then
    raise exception 'Neznana tabela uvozov: %', p_tabela;
  end if;
  -- hkratni klici za isti izvoz čakajo drug na drugega
  perform pg_advisory_xact_lock(hashtext('fp_sync:' || p_kljuc));

  select izvoz_cas, zaklenjeno_at, zaklenil into v_izvoz, v_zaklep, v_kdo
    from fp_sync_stanje where kljuc = p_kljuc;
  if p_cas is not null then
    if v_izvoz is not null and v_izvoz >= p_cas then
      return 'uvozeno';
    end if;
    -- uvozi pred to migracijo (brez izvoz_cas): primerjaj s časom zadnjega uvoza
    if v_izvoz is null then
      execute format('select max(created_at) from %I where aktiven and visible', p_tabela) into v_uvoz;
      if v_uvoz is not null and v_uvoz >= p_cas then
        return 'uvozeno';
      end if;
    end if;
  end if;
  if v_zaklep is not null and v_zaklep > now() - interval '5 minutes' then
    return 'zaklenjeno:' || coalesce(v_kdo, '');
  end if;

  insert into fp_sync_stanje (kljuc, zaklenjeno_at, zaklenil)
  values (p_kljuc, now(), auth.jwt() ->> 'email')
  on conflict (kljuc) do update set zaklenjeno_at = now(), zaklenil = auth.jwt() ->> 'email';
  return 'ok';
end;
$$;

create or replace function fp_sync_koncaj(p_kljuc text, p_cas timestamptz)
returns void
language sql
security invoker
as $$
  update fp_sync_stanje
     set izvoz_cas = p_cas, uvozeno_at = now(), uvozil = auth.jwt() ->> 'email',
         zaklenjeno_at = null, zaklenil = null
   where kljuc = p_kljuc;
$$;

create or replace function fp_sync_odkleni(p_kljuc text)
returns void
language sql
security invoker
as $$
  update fp_sync_stanje set zaklenjeno_at = null, zaklenil = null where kljuc = p_kljuc;
$$;

revoke all on function fp_sync_zakleni(text, text, timestamptz) from public, anon;
revoke all on function fp_sync_koncaj(text, timestamptz) from public, anon;
revoke all on function fp_sync_odkleni(text) from public, anon;
grant execute on function fp_sync_zakleni(text, text, timestamptz) to authenticated;
grant execute on function fp_sync_koncaj(text, timestamptz) to authenticated;
grant execute on function fp_sync_odkleni(text) to authenticated;
