-- =====================================================================
-- FINES - Production | 035: termini ocenjevanja po osebah, brisanje ocene
--
-- Ocenjuje se oseba: termin = zaposleni + delovno mesto / družina + obdobje.
-- Stari termini brez osebe se skrijejo (visible = false).
-- Izbris ocene = visible = false; poznejšim izpitom iste celice se prejšnja stopnja preračuna.
-- Zaženi PO 034. Dostop samo za prijavljene.
-- =====================================================================
begin;

alter table public.fp_usp_termini add column if not exists zaposleni_id bigint references public.fos_zaposleni(id);
update public.fp_usp_termini set visible = false where zaposleni_id is null and visible;
alter table public.fp_usp_termini drop constraint if exists fp_usp_termini_oseba_chk;
alter table public.fp_usp_termini add constraint fp_usp_termini_oseba_chk check (zaposleni_id is not null or not visible);

drop index if exists public.fp_usp_termini_enkrat_idx;
create unique index if not exists fp_usp_termini_enkrat_idx on public.fp_usp_termini(zaposleni_id, stolpec_id, datum_od, datum_do) where visible;

drop function if exists public.fp_usp_termin_shrani(bigint, bigint[], date, date, text);

-- Nov termin za izbrane osebe in teme (p_id null) ali sprememba obdobja obstoječega termina
create or replace function public.fp_usp_termin_shrani(p_id bigint, p_zaposleni bigint[], p_stolpci bigint[], p_od date, p_do date, p_opomba text)
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
    raise exception 'Neveljavno obdobje termina.';
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

  if coalesce(array_length(p_zaposleni, 1), 0) = 0 or coalesce(array_length(p_stolpci, 1), 0) = 0 then
    raise exception 'Izberi vsaj eno osebo in eno temo.';
  end if;
  return query
    insert into fp_usp_termini (zaposleni_id, stolpec_id, datum_od, datum_do, opomba)
    select z.id, s.id, p_od, p_do, nullif(trim(p_opomba), '')
    from fp_usp_stolpci s
    join fos_zaposleni z on z.id = any(p_zaposleni) and z.visible and z.id_oddelek = case s.matrika when 'PROIZVODNJA' then 2 else 3 end
    where s.id = any(p_stolpci) and s.visible
    on conflict (zaposleni_id, stolpec_id, datum_od, datum_do) where visible do nothing
    returning *;
end;
$$;

-- Izpitna pola: termin mora veljati za isto osebo in temo
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
  if p_termin is not null and not exists (
    select 1 from fp_usp_termini t where t.id = p_termin and t.stolpec_id = p_stolpec and t.zaposleni_id = p_zaposleni and t.visible
  ) then
    raise exception 'Termin ne velja za to osebo in temo.';
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

-- Izbris ocene: zapis se skrije, poznejši izpiti iste celice dobijo pravilno prejšnjo stopnjo
create or replace function public.fp_usp_ocena_skrij(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d       fp_usp_ocene;
  x       record;
  v_prej  integer;
begin
  if not fp_usp_ima_dostop() then
    raise exception 'Ni dostopa.';
  end if;
  select * into d from fp_usp_ocene where id = p_id and visible for update;
  if not found then
    raise exception 'Ocena ne obstaja.';
  end if;
  update fp_usp_ocene set visible = false where id = d.id;

  v_prej := d.prejsnja_ocena;
  for x in
    select o.id, o.opravil, o.ocena from fp_usp_ocene o
    where o.zaposleni_id = d.zaposleni_id and o.stolpec_id = d.stolpec_id and o.visible and (o.cas, o.id) > (d.cas, d.id)
    order by o.cas, o.id
  loop
    update fp_usp_ocene
    set prejsnja_ocena = v_prej, ocena = case when x.opravil then x.ocena else v_prej end
    where id = x.id;
    v_prej := case when x.opravil then x.ocena else v_prej end;
  end loop;
end;
$$;

revoke all on function public.fp_usp_termin_shrani(bigint, bigint[], bigint[], date, date, text), public.fp_usp_ocena_skrij(bigint) from public, anon;
grant execute on function public.fp_usp_termin_shrani(bigint, bigint[], bigint[], date, date, text), public.fp_usp_ocena_skrij(bigint) to authenticated;

commit;
