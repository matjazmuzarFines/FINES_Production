-- =====================================================================
-- FINES - Production | 033: dostop uporabnikov po straneh
--
-- fp_uporabniki - en zapis na uporabnika (auth.users):
--   vse = true    -> vidi vse strani (tudi nove),
--   vse = false   -> vidi samo strani v `strani` (poti iz menija, npr. '/proizvodnja/vijacni-material').
-- Zapis se ustvari ob prvem obisku (fp_moj_dostop); nov uporabnik nima dostopa,
-- dokler mu ga ne dodeli nekdo s stranjo Podatki → Nastavitve (/podatki/nastavitve).
-- Ob zagonu dobijo vsi obstoječi uporabniki polni dostop, vijacni@fines.si samo Vijačni material.
-- Zaženi PO 031. Dostop samo za prijavljene.
-- =====================================================================
begin;

create table if not exists public.fp_uporabniki (
  id             bigint generated always as identity primary key,
  user_id        uuid not null unique references auth.users(id),
  email          text not null,
  vse            boolean not null default false,
  strani         text[] not null default '{}',
  zadnji_obisk   timestamptz,
  visible        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists fp_uporabniki_updated_at on public.fp_uporabniki;
create trigger fp_uporabniki_updated_at
  before update on public.fp_uporabniki
  for each row execute function public.fp_set_updated_at();

insert into public.fp_uporabniki (user_id, email, vse, strani)
select u.id, u.email,
       lower(u.email) <> 'vijacni@fines.si',
       case when lower(u.email) = 'vijacni@fines.si' then array['/proizvodnja/vijacni-material'] else '{}' end
from auth.users u
where u.email is not null
on conflict (user_id) do nothing;

-- Ali ima prijavljeni dostop do strani
create or replace function public.fp_ima_stran(p_href text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.vse or p_href = any(u.strani) from fp_uporabniki u where u.user_id = auth.uid() and u.visible), false);
$$;

-- Dostop prijavljenega (ob obisku aplikacije); ustvari zapis, če ga še ni
create or replace function public.fp_moj_dostop()
returns public.fp_uporabniki
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_uporabniki;
begin
  if auth.uid() is null then
    raise exception 'Ni prijave.';
  end if;
  insert into fp_uporabniki (user_id, email, zadnji_obisk)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), now())
  on conflict (user_id) do update set zadnji_obisk = now(), email = excluded.email
  returning * into r;
  return r;
end;
$$;

-- Nastavi dostop uporabnika (samo kdor ima stran Nastavitve; sebi je ne more odvzeti)
create or replace function public.fp_nastavi_dostop(p_user uuid, p_vse boolean, p_strani text[])
returns public.fp_uporabniki
language plpgsql
security definer
set search_path = public
as $$
declare
  r fp_uporabniki;
begin
  if not fp_ima_stran('/podatki/nastavitve') then
    raise exception 'Ni dostopa do nastavitev.';
  end if;
  if p_user = auth.uid() and not (p_vse or '/podatki/nastavitve' = any(coalesce(p_strani, '{}'))) then
    raise exception 'Sebi ne moreš odvzeti dostopa do nastavitev.';
  end if;
  update fp_uporabniki set vse = p_vse, strani = coalesce(p_strani, '{}')
  where user_id = p_user
  returning * into r;
  if not found then
    raise exception 'Uporabnik ne obstaja.';
  end if;
  return r;
end;
$$;

revoke all on function public.fp_ima_stran(text), public.fp_moj_dostop(), public.fp_nastavi_dostop(uuid, boolean, text[]) from public, anon;
grant execute on function public.fp_ima_stran(text), public.fp_moj_dostop(), public.fp_nastavi_dostop(uuid, boolean, text[]) to authenticated;

-- RLS: vsak vidi svoj zapis, vse zapise samo kdor ima Nastavitve; pisanje samo prek funkcij
alter table public.fp_uporabniki enable row level security;
drop policy if exists fp_uporabniki_select on public.fp_uporabniki;
create policy fp_uporabniki_select on public.fp_uporabniki for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fp_ima_stran('/podatki/nastavitve')));
drop policy if exists fos_dostop on public.fp_uporabniki;
create policy fos_dostop on public.fp_uporabniki as restrictive for all to authenticated
  using ((select public.fos_ima_dostop('fp_uporabniki'))) with check ((select public.fos_ima_dostop('fp_uporabniki')));
revoke all on public.fp_uporabniki from anon;
revoke insert, update, delete on public.fp_uporabniki from authenticated;
grant select on public.fp_uporabniki to authenticated;

-- Vijačni material: spreminja lahko samo, kdor ima to stran
create or replace function public.fp_vijacni_spremeni(p_postavke jsonb)
returns setof public.fp_vijacni_material
language plpgsql
security definer
set search_path = public
as $$
declare
  p        jsonb;
  m        fp_vijacni_material;
  v_nacin  text;
  v_kol    integer;
  v_nova   integer;
  v_lok    text;
  v_email  text := auth.jwt() ->> 'email';
  v_ime    text;
  v_cas    timestamptz := now();
begin
  if auth.uid() is null or not fos_ima_dostop('fp_vijacni_material') or not fp_ima_stran('/proizvodnja/vijacni-material') then
    raise exception 'Ni dostopa.';
  end if;
  select nullif(trim(coalesce(z.ime, '') || ' ' || coalesce(z.priimek, '')), '') into v_ime
  from fos_zaposleni z where z.id_uporabnika = auth.uid() and z.visible limit 1;
  v_ime := coalesce(v_ime, v_email, 'neznan');

  for p in select * from jsonb_array_elements(p_postavke) loop
    v_nacin := p ->> 'nacin';
    select * into m from fp_vijacni_material where id = (p ->> 'id')::bigint and visible for update;
    if not found then
      raise exception 'Material % ne obstaja.', p ->> 'id';
    end if;

    if v_nacin = 'lokacija' then
      v_lok := nullif(upper(trim(p ->> 'lokacija')), '');
      if v_lok is distinct from m.lokacija then
        update fp_vijacni_material set lokacija = v_lok, spremenjeno = v_cas, spremenil = v_ime where id = m.id;
        insert into fp_vijacni_material_log (material_id, nacin, polje, stara, nova, uporabnik, email)
        values (m.id, 'lokacija', 'lokacija', m.lokacija, v_lok, v_ime, v_email);
      end if;
      continue;
    end if;

    v_kol := (p ->> 'kolicina')::integer;
    if v_kol is null or v_kol < 0 then
      raise exception 'Neveljavna količina za %.', m.naziv;
    end if;
    if v_nacin = 'prejem' then
      v_nova := m.zaloga + v_kol;
    elsif v_nacin = 'odpis' then
      if v_kol > m.zaloga then
        raise exception 'Odpis % je večji od zaloge % (%).', v_kol, m.zaloga, m.naziv;
      end if;
      v_nova := m.zaloga - v_kol;
    elsif v_nacin = 'popis' then
      if (p ->> 'pricakovana')::integer is distinct from m.zaloga then
        raise exception 'Zalogo za % je medtem spremenil nekdo drug (zdaj %). Osveži in ponovi.', m.naziv, m.zaloga;
      end if;
      v_nova := v_kol;
    else
      raise exception 'Neznan način %.', v_nacin;
    end if;

    if v_nova <> m.zaloga then
      update fp_vijacni_material set zaloga = v_nova, spremenjeno = v_cas, spremenil = v_ime where id = m.id;
      insert into fp_vijacni_material_log (material_id, nacin, polje, stara, nova, sprememba, uporabnik, email)
      values (m.id, v_nacin, 'zaloga', m.zaloga::text, v_nova::text, v_nova - m.zaloga, v_ime, v_email);
    end if;
  end loop;

  return query
    select * from fp_vijacni_material
    where id in (select (e ->> 'id')::bigint from jsonb_array_elements(p_postavke) e);
end;
$$;

commit;
