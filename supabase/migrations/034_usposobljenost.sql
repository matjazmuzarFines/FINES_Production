-- =====================================================================
-- FINES - Production | 034: matrika usposobljenosti in izobraževanja
--
-- fp_usp_stolpci - stolpci obeh matrik v eni strukturi:
--                  PROIZVODNJA = delovna mesta (fp_delovna_mesta, oddelek_id = 1, brez Dodatnega dela),
--                  MONTAZA     = družine brez končnic -e, -k, -o, -m (spl_druzine).
--                  Vrstice so zaposleni: fos_zaposleni.id_oddelek = 2 (Proizvodnja) oz. 3 (Montaža).
-- fp_usp_termini - tedenski termin ocenjevanja za en stolpec (npr. OCA, tedni 48-51).
-- fp_usp_ocene   - izpitna pola: vsaka ocena je nov zapis. Trenutna stopnja = zadnji zapis z oceno.
--
-- Stolpci se ob vsakem obisku uskladijo z delovnimi mesti in družinami (fp_usp_nalozi).
-- Pisanje samo prek funkcij, ki preverijo dostop do strani.
-- Zaženi PO 033. Dostop samo za prijavljene.
-- =====================================================================
begin;

create table if not exists public.fp_usp_stolpci (
  id                bigint generated always as identity primary key,
  matrika           text not null check (matrika in ('PROIZVODNJA', 'MONTAZA')),
  naziv             text not null,
  delovno_mesto_id  bigint references public.fp_delovna_mesta(id),
  druzina           text,
  vrstni_red        integer not null default 0,
  visible           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((delovno_mesto_id is null) <> (druzina is null))
);
create unique index if not exists fp_usp_stolpci_dm_idx on public.fp_usp_stolpci(delovno_mesto_id) where delovno_mesto_id is not null;
create unique index if not exists fp_usp_stolpci_druzina_idx on public.fp_usp_stolpci(druzina) where druzina is not null;

create table if not exists public.fp_usp_termini (
  id          bigint generated always as identity primary key,
  stolpec_id  bigint not null references public.fp_usp_stolpci(id),
  datum_od    date not null,
  datum_do    date not null,
  opomba      text,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (datum_do >= datum_od)
);
create unique index if not exists fp_usp_termini_enkrat_idx on public.fp_usp_termini(stolpec_id, datum_od, datum_do) where visible;

create table if not exists public.fp_usp_ocene (
  id              bigint generated always as identity primary key,
  zaposleni_id    bigint not null references public.fos_zaposleni(id),
  stolpec_id      bigint not null references public.fp_usp_stolpci(id),
  termin_id       bigint references public.fp_usp_termini(id),
  cas             timestamptz not null default now(),
  ocenjevalec     text not null,
  opravil         boolean not null,
  prejsnja_ocena  integer check (prejsnja_ocena between 1 and 5),
  ocena           integer check (ocena between 1 and 5),   -- pri neopravljenem izpitu ostane prejšnja
  razlogi         text,
  komentar        text,
  vnesel          text,                                    -- e-mail prijavljenega
  visible         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists fp_usp_ocene_celica_idx on public.fp_usp_ocene(zaposleni_id, stolpec_id, cas desc);
create index if not exists fp_usp_ocene_termin_idx on public.fp_usp_ocene(termin_id);

drop trigger if exists fp_usp_stolpci_updated_at on public.fp_usp_stolpci;
create trigger fp_usp_stolpci_updated_at before update on public.fp_usp_stolpci for each row execute function public.fp_set_updated_at();
drop trigger if exists fp_usp_termini_updated_at on public.fp_usp_termini;
create trigger fp_usp_termini_updated_at before update on public.fp_usp_termini for each row execute function public.fp_set_updated_at();
drop trigger if exists fp_usp_ocene_updated_at on public.fp_usp_ocene;
create trigger fp_usp_ocene_updated_at before update on public.fp_usp_ocene for each row execute function public.fp_set_updated_at();

-- Ali ima prijavljeni dostop do strani usposobljenosti
create or replace function public.fp_usp_ima_dostop()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and fos_ima_dostop('fp_usp_ocene')
     and (fp_ima_stran('/proizvodnja/usposobljenost') or fp_ima_stran('/proizvodnja/usposobljenost/izobrazevanja'));
$$;

-- Uskladi stolpce in vrne ime prijavljenega ter zaposlene (fos_zaposleni je po RLS viden samo delno)
create or replace function public.fp_usp_nalozi()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ime text;
begin
  if not fp_usp_ima_dostop() then
    raise exception 'Ni dostopa.';
  end if;

  insert into fp_usp_stolpci (matrika, naziv, delovno_mesto_id, vrstni_red)
  select 'PROIZVODNJA', d.naziv, d.id, d.vrstni_red
  from fp_delovna_mesta d
  where d.oddelek_id = 1 and not d.dodatno_delo and d.visible
    and (d.velja_od is null or d.velja_od <= current_date)
    and (d.velja_do is null or d.velja_do >= current_date)
  on conflict (delovno_mesto_id) where delovno_mesto_id is not null do update
    set naziv = excluded.naziv, vrstni_red = excluded.vrstni_red, visible = true
    where (fp_usp_stolpci.naziv, fp_usp_stolpci.vrstni_red, fp_usp_stolpci.visible) is distinct from (excluded.naziv, excluded.vrstni_red, true);

  insert into fp_usp_stolpci (matrika, naziv, druzina, vrstni_red)
  select 'MONTAZA', d.koren, d.koren, (row_number() over (order by d.koren))::integer
  from (select distinct regexp_replace(koda, '-[a-z]$', '') as koren from spl_druzine where visible) d
  on conflict (druzina) where druzina is not null do update
    set vrstni_red = excluded.vrstni_red, visible = true
    where (fp_usp_stolpci.vrstni_red, fp_usp_stolpci.visible) is distinct from (excluded.vrstni_red, true);

  update fp_usp_stolpci s set visible = false
  where s.visible and s.delovno_mesto_id is not null and not exists (
    select 1 from fp_delovna_mesta d
    where d.id = s.delovno_mesto_id and d.oddelek_id = 1 and not d.dodatno_delo and d.visible
      and (d.velja_od is null or d.velja_od <= current_date)
      and (d.velja_do is null or d.velja_do >= current_date));
  update fp_usp_stolpci s set visible = false
  where s.visible and s.druzina is not null and not exists (
    select 1 from spl_druzine d where d.visible and regexp_replace(d.koda, '-[a-z]$', '') = s.druzina);

  select nullif(trim(coalesce(z.ime, '') || ' ' || coalesce(z.priimek, '')), '') into v_ime
  from fos_zaposleni z where z.id_uporabnika = auth.uid() and z.visible limit 1;

  return jsonb_build_object(
    'ime', coalesce(v_ime, auth.jwt() ->> 'email', ''),
    'zaposleni', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'ime', z.ime, 'priimek', z.priimek, 'id_oddelek', z.id_oddelek, 'visible', z.visible) order by z.priimek, z.ime)
      from fos_zaposleni z
      where (z.visible and z.id_oddelek in (2, 3)) or exists (select 1 from fp_usp_ocene o where o.zaposleni_id = z.id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Nov termin za več stolpcev (p_id null) ali sprememba obstoječega termina
create or replace function public.fp_usp_termin_shrani(p_id bigint, p_stolpci bigint[], p_od date, p_do date, p_opomba text)
returns setof public.fp_usp_termini
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fp_usp_ima_dostop() then
    raise exception 'Ni dostopa.';
  end if;
  if p_od is null or p_do is null or p_do < p_od then
    raise exception 'Neveljavni tedni termina.';
  end if;

  if p_id is not null then
    return query
      update fp_usp_termini set datum_od = p_od, datum_do = p_do, opomba = nullif(trim(p_opomba), '')
      where id = p_id and visible
      returning *;
    if not found then
      raise exception 'Termin ne obstaja.';
    end if;
    return;
  end if;

  if coalesce(array_length(p_stolpci, 1), 0) = 0 then
    raise exception 'Izberi vsaj en stolpec.';
  end if;
  return query
    insert into fp_usp_termini (stolpec_id, datum_od, datum_do, opomba)
    select s.id, p_od, p_do, nullif(trim(p_opomba), '')
    from fp_usp_stolpci s
    where s.id = any(p_stolpci) and s.visible
    on conflict (stolpec_id, datum_od, datum_do) where visible do nothing
    returning *;
end;
$$;

-- Odstrani termin (ocene ostanejo)
create or replace function public.fp_usp_termin_skrij(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fp_usp_ima_dostop() then
    raise exception 'Ni dostopa.';
  end if;
  update fp_usp_termini set visible = false where id = p_id;
end;
$$;

-- Izpitna pola: nov zapis; prejšnja stopnja se prebere iz baze, pri neopravljenem izpitu ostane
create or replace function public.fp_usp_ocena_shrani(
  p_zaposleni bigint, p_stolpec bigint, p_termin bigint, p_cas timestamptz,
  p_ocenjevalec text, p_opravil boolean, p_ocena integer, p_razlogi text, p_komentar text)
returns public.fp_usp_ocene
language plpgsql
security definer
set search_path = public
as $$
declare
  s       fp_usp_stolpci;
  v_prej  integer;
  v_nova  integer;
  r       fp_usp_ocene;
begin
  if not fp_usp_ima_dostop() then
    raise exception 'Ni dostopa.';
  end if;
  select * into s from fp_usp_stolpci where id = p_stolpec;
  if not found then
    raise exception 'Stolpec ne obstaja.';
  end if;
  if not exists (
    select 1 from fos_zaposleni z
    where z.id = p_zaposleni and z.visible and z.id_oddelek = case s.matrika when 'PROIZVODNJA' then 2 else 3 end
  ) then
    raise exception 'Zaposleni ni v tej matriki.';
  end if;
  if p_termin is not null and not exists (select 1 from fp_usp_termini t where t.id = p_termin and t.stolpec_id = p_stolpec and t.visible) then
    raise exception 'Termin ne velja za ta stolpec.';
  end if;
  if nullif(trim(p_ocenjevalec), '') is null then
    raise exception 'Vpiši ocenjevalca.';
  end if;
  if p_opravil is null then
    raise exception 'Izberi rezultat izpita.';
  end if;

  select o.ocena into v_prej
  from fp_usp_ocene o
  where o.zaposleni_id = p_zaposleni and o.stolpec_id = p_stolpec and o.visible and o.ocena is not null and o.cas <= coalesce(p_cas, now())
  order by o.cas desc, o.id desc limit 1;

  if p_opravil then
    if p_ocena is null or p_ocena not between 1 and 5 then
      raise exception 'Izberi stopnjo od 1 do 5.';
    end if;
    v_nova := p_ocena;
  else
    if nullif(trim(p_razlogi), '') is null then
      raise exception 'Pri neopravljenem izpitu vpiši razloge.';
    end if;
    v_nova := v_prej;
  end if;

  insert into fp_usp_ocene (zaposleni_id, stolpec_id, termin_id, cas, ocenjevalec, opravil, prejsnja_ocena, ocena, razlogi, komentar, vnesel)
  values (p_zaposleni, p_stolpec, p_termin, coalesce(p_cas, now()), trim(p_ocenjevalec), p_opravil, v_prej, v_nova,
          nullif(trim(p_razlogi), ''), nullif(trim(p_komentar), ''), auth.jwt() ->> 'email')
  returning * into r;
  return r;
end;
$$;

revoke all on function public.fp_usp_ima_dostop(), public.fp_usp_nalozi(), public.fp_usp_termin_shrani(bigint, bigint[], date, date, text),
  public.fp_usp_termin_skrij(bigint), public.fp_usp_ocena_shrani(bigint, bigint, bigint, timestamptz, text, boolean, integer, text, text) from public, anon;
grant execute on function public.fp_usp_ima_dostop(), public.fp_usp_nalozi(), public.fp_usp_termin_shrani(bigint, bigint[], date, date, text),
  public.fp_usp_termin_skrij(bigint), public.fp_usp_ocena_shrani(bigint, bigint, bigint, timestamptz, text, boolean, integer, text, text) to authenticated;

-- RLS: branje samo z dostopom do strani (ocene zaposlenih); pisanje samo prek funkcij
alter table public.fp_usp_stolpci enable row level security;
alter table public.fp_usp_termini enable row level security;
alter table public.fp_usp_ocene enable row level security;

drop policy if exists fp_usp_stolpci_select on public.fp_usp_stolpci;
create policy fp_usp_stolpci_select on public.fp_usp_stolpci for select to authenticated using ((select public.fp_usp_ima_dostop()));
drop policy if exists fp_usp_termini_select on public.fp_usp_termini;
create policy fp_usp_termini_select on public.fp_usp_termini for select to authenticated using ((select public.fp_usp_ima_dostop()));
drop policy if exists fp_usp_ocene_select on public.fp_usp_ocene;
create policy fp_usp_ocene_select on public.fp_usp_ocene for select to authenticated using ((select public.fp_usp_ima_dostop()));

drop policy if exists fos_dostop on public.fp_usp_stolpci;
create policy fos_dostop on public.fp_usp_stolpci as restrictive for all to authenticated
  using ((select public.fos_ima_dostop('fp_usp_stolpci'))) with check ((select public.fos_ima_dostop('fp_usp_stolpci')));
drop policy if exists fos_dostop on public.fp_usp_termini;
create policy fos_dostop on public.fp_usp_termini as restrictive for all to authenticated
  using ((select public.fos_ima_dostop('fp_usp_termini'))) with check ((select public.fos_ima_dostop('fp_usp_termini')));
drop policy if exists fos_dostop on public.fp_usp_ocene;
create policy fos_dostop on public.fp_usp_ocene as restrictive for all to authenticated
  using ((select public.fos_ima_dostop('fp_usp_ocene'))) with check ((select public.fos_ima_dostop('fp_usp_ocene')));

revoke all on public.fp_usp_stolpci, public.fp_usp_termini, public.fp_usp_ocene from anon;
revoke insert, update, delete on public.fp_usp_stolpci, public.fp_usp_termini, public.fp_usp_ocene from authenticated;
grant select on public.fp_usp_stolpci, public.fp_usp_termini, public.fp_usp_ocene to authenticated;

commit;
