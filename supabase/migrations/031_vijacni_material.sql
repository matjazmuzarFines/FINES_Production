-- =====================================================================
-- FINES - Production | 031: Zaloga vijačnega materiala
--
-- Nadomesti Power App + Microsoft List "Zaloga vijačnega materiala".
-- fp_vijacni_material      - en zapis na material (šifra, naziv, zaloga, lokacija).
--                            Začetni podatki se uvozijo enkrat iz CSV (Lists),
--                            potem se v aplikaciji urejata samo zaloga in lokacija.
-- fp_vijacni_material_log  - dnevnik: kdo, kdaj, katero polje, iz česa v kaj.
--
-- Zaloga in lokacija se spreminjata samo s funkcijo fp_vijacni_spremeni:
-- prejem / odpis se prištejeta k trenutni zalogi v bazi (dva hkratna vnosa
-- se ne povozita), popis zahteva, da se zaloga medtem ni spremenila.
-- Zaženi PO 030. Dostop samo za prijavljene.
-- =====================================================================
begin;

create table if not exists public.fp_vijacni_material (
  id           bigint generated always as identity primary key,
  sifra        text,
  naziv        text not null,
  em           text not null default 'KOS',
  zaloga       integer not null default 0 check (zaloga >= 0),
  lokacija     text,
  spremenjeno  timestamptz,
  spremenil    text,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists fp_vijacni_material_sifra_idx on public.fp_vijacni_material(sifra);

create table if not exists public.fp_vijacni_material_log (
  id           bigint generated always as identity primary key,
  material_id  bigint not null references public.fp_vijacni_material(id),
  nacin        text not null check (nacin in ('prejem', 'odpis', 'popis', 'lokacija')),
  polje        text not null check (polje in ('zaloga', 'lokacija')),
  stara        text,
  nova         text,
  sprememba    integer,          -- +prejem / -odpis / razlika popisa
  uporabnik    text not null,    -- ime in priimek (ali e-mail)
  email        text,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists fp_vijacni_material_log_mat_idx on public.fp_vijacni_material_log(material_id, created_at desc);
create index if not exists fp_vijacni_material_log_cas_idx on public.fp_vijacni_material_log(created_at desc);

drop trigger if exists fp_vijacni_material_updated_at on public.fp_vijacni_material;
create trigger fp_vijacni_material_updated_at
  before update on public.fp_vijacni_material
  for each row execute function public.fp_set_updated_at();
drop trigger if exists fp_vijacni_material_log_updated_at on public.fp_vijacni_material_log;
create trigger fp_vijacni_material_log_updated_at
  before update on public.fp_vijacni_material_log
  for each row execute function public.fp_set_updated_at();

-- RLS: branje za prijavljene; pisanje samo prek funkcije (brez neposrednega insert / update / delete)
alter table public.fp_vijacni_material enable row level security;
alter table public.fp_vijacni_material_log enable row level security;
drop policy if exists fp_vijacni_material_select on public.fp_vijacni_material;
create policy fp_vijacni_material_select on public.fp_vijacni_material for select to authenticated using (true);
drop policy if exists fp_vijacni_material_log_select on public.fp_vijacni_material_log;
create policy fp_vijacni_material_log_select on public.fp_vijacni_material_log for select to authenticated using (true);
drop policy if exists fos_dostop on public.fp_vijacni_material;
create policy fos_dostop on public.fp_vijacni_material as restrictive for all to authenticated
  using ((select public.fos_ima_dostop('fp_vijacni_material'))) with check ((select public.fos_ima_dostop('fp_vijacni_material')));
drop policy if exists fos_dostop on public.fp_vijacni_material_log;
create policy fos_dostop on public.fp_vijacni_material_log as restrictive for all to authenticated
  using ((select public.fos_ima_dostop('fp_vijacni_material_log'))) with check ((select public.fos_ima_dostop('fp_vijacni_material_log')));
revoke all on public.fp_vijacni_material, public.fp_vijacni_material_log from anon;
revoke insert, update, delete on public.fp_vijacni_material, public.fp_vijacni_material_log from authenticated;
grant select on public.fp_vijacni_material, public.fp_vijacni_material_log to authenticated;

-- Sprememba zaloge / lokacije za enega ali več materialov (vse ali nič).
-- p_postavke: [{ "id": 12, "nacin": "prejem" | "odpis" | "popis" | "lokacija",
--                "kolicina": 425,            -- prejem / odpis: koliko, popis: nova zaloga
--                "pricakovana": 2650,        -- popis: zaloga, ki jo je uporabnik videl
--                "lokacija": "VM1" }]
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
  if auth.uid() is null or not fos_ima_dostop('fp_vijacni_material') then
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
revoke all on function public.fp_vijacni_spremeni(jsonb) from public, anon;
grant execute on function public.fp_vijacni_spremeni(jsonb) to authenticated;

commit;
