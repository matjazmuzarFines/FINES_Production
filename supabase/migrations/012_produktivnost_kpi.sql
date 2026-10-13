-- =====================================================================
-- FINES - Production | 012: Produktivnost - KPI-ji in posnetki normativov
--
-- 1. Akcije: prihranek časa (min/kos) in materiala (EUR/kos), družina in
--    (neobvezno) letna količina. Stari stolpec prihranek_h_teden ostane
--    (podatkov ne brišemo), aplikacija ga ne uporablja več.
-- 2. fp_prod_druzine: letna količina in cilj zmanjšanja normativa po družini.
-- 3. fp_prod_cilji: letni cilji KPI (doslednost gemb, EUR/leto, h/leto,
--    zmanjšanje normativov) in začetni teden gemb v letu.
-- 4. Posnetki normativov (KPI 4): stanje normativov po identih na izbran
--    dan. Izhodiščni posnetek = stanje ob zagonu te migracije (13. 10. 2026).
-- Zaženi PO 011_produktivnost.sql. Idempotentno.
-- =====================================================================

-- 1. Akcije
alter table fp_prod_akcije add column if not exists prihranek_min_kos numeric(10, 3);   -- prihranek časa na kos (min)
alter table fp_prod_akcije add column if not exists prihranek_eur_kos numeric(10, 2);   -- prihranek materiala na kos (EUR)
alter table fp_prod_akcije add column if not exists druzina_id bigint references spl_druzine(id);
alter table fp_prod_akcije add column if not exists kolicina_leto numeric(12, 0);       -- null = letna količina družine

-- 2. Družine: letna količina (ocena) in cilj zmanjšanja normativa
create table if not exists fp_prod_druzine (
  id                 bigint generated always as identity primary key,
  druzina_id         bigint not null unique references spl_druzine(id),
  kolicina_leto      numeric(12, 0),
  cilj_normativ_pct  numeric(5, 2),                -- null = skupni cilj leta
  visible            boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 3. Letni cilji
create table if not exists fp_prod_cilji (
  id                    bigint generated always as identity primary key,
  leto                  int not null unique,
  zacetni_teden         date,                       -- gembe se štejejo od tega tedna (null = od začetka leta)
  cilj_doslednost_pct   numeric(5, 2) not null default 80,
  cilj_eur_leto         numeric(12, 2) not null default 0,
  cilj_h_leto           numeric(10, 2) not null default 0,
  cilj_normativ_pct     numeric(5, 2) not null default 0,
  visible               boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint fp_prod_cilji_teden_ck check (zacetni_teden is null or extract(isodow from zacetni_teden) = 1)
);

insert into fp_prod_cilji (leto, zacetni_teden, cilj_doslednost_pct, cilj_eur_leto, cilj_h_leto, cilj_normativ_pct) values
  (2026, '2026-10-12', 80, 10000, 40, 10),     -- 2026: od 42. tedna; 40 h ≈ 200 h/leto za 11 tednov
  (2027, null,         80, 50000, 200, 10)
on conflict (leto) do nothing;

-- 4. Posnetki normativov
create table if not exists fp_prod_norm_posnetki (
  id          bigint generated always as identity primary key,
  datum       date not null default current_date,
  opis        text,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists fp_prod_norm_posnetki_postavke (
  id                    bigint generated always as identity primary key,
  posnetek_id           bigint not null references fp_prod_norm_posnetki(id),
  normativ_id           bigint not null,
  ident                 text not null,
  druzina_id            bigint references spl_druzine(id),
  normativ_skupni       numeric(10, 3) not null,
  normativ_proizvodnja  numeric(10, 3) not null default 0,
  normativ_montaza      numeric(10, 3) not null default 0,
  normativ_elektro      numeric(10, 3) not null default 0,
  normativ_testiranje   numeric(10, 3) not null default 0,
  visible               boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint fp_prod_norm_postavke_uq unique (posnetek_id, normativ_id)
);
create index if not exists fp_prod_norm_postavke_posnetek_idx on fp_prod_norm_posnetki_postavke (posnetek_id);

-- Izhodiščni posnetek (enkrat): vsi vidni normativi z normativom > 0
do $$
declare pid bigint;
begin
  if not exists (select 1 from fp_prod_norm_posnetki where opis = 'Izhodišče') then
    insert into fp_prod_norm_posnetki (datum, opis) values ('2026-10-13', 'Izhodišče') returning id into pid;
    insert into fp_prod_norm_posnetki_postavke
      (posnetek_id, normativ_id, ident, druzina_id, normativ_skupni,
       normativ_proizvodnja, normativ_montaza, normativ_elektro, normativ_testiranje)
    select pid, n.id, n.ident, n.druzina_id, n.normativ_skupni,
           n.normativ_proizvodnja, n.normativ_montaza, n.normativ_elektro, n.normativ_testiranje
    from spl_normativi n
    where n.visible and n.normativ_skupni > 0;
  end if;
end;
$$;

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['fp_prod_druzine', 'fp_prod_cilji', 'fp_prod_norm_posnetki', 'fp_prod_norm_posnetki_postavke'] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function fp_set_updated_at()',
      t || '_updated_at', t);
  end loop;
end;
$$;

-- RLS - samo prijavljeni, brez DELETE
do $$
declare t text;
begin
  foreach t in array array['fp_prod_druzine', 'fp_prod_cilji', 'fp_prod_norm_posnetki', 'fp_prod_norm_posnetki_postavke'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated using (true) with check (true)', t || '_update', t);
  end loop;
end;
$$;
