-- =====================================================================
-- FINES - Production | 018: Material (splošna tabela spl_material)
--
-- Celoten izpis materiala iz ERP (material.xlsx) - en zapis na ident.
-- Je vir zaloge za vse projekte: zaloga, planirana količina DN,
-- rezervacija kot material na delovnih nalogih, naročeno, prosta zaloga.
-- Izvoz VD200 ostane samo vir postavk naročil (njegova "prosta zaloga"
-- je v ERP napačno izračunana).
--
-- Vsak uvoz posodobi zapise po identu (upsert) in si zapiše uvoz_id.
-- Veljavni so samo zapisi zadnjega aktivnega uvoza; ident, ki ga v novem
-- izvozu ni več, ostane v tabeli (ne brišemo), a se ne upošteva.
--
-- Stolpci izvoza (številka v oklepaju je oznaka iz ERP):
--   zaloga (3), zaloga_ostalo (4), potreba_dn (12), razpolozljiva (14 = 3-12),
--   narocena_kolicina (5) = naročeno pri dobaviteljih,
--   naroceno (6) = potrjena naročila kupcev,
--   predvideno / definirano / rezervirano = nepotrjena naročila kupcev,
--   planirano_proizvodnja (7) = razpisano kot MATERIAL na delovne naloge,
--   planirano_dn (8) = planirana količina iz delovnih nalogov (prihod),
--   prosta_zaloga (9 = 3+5-6-7+8), prosta_brez_narocil (15 = 3-6-7+8),
--   min_zaloga (1), max_zaloga (2), potrebe_min (10 = 9-1), razlika_max (11).
-- Zaženi PO 001_schema.sql. Idempotentno. Dostop samo za prijavljene.
-- =====================================================================

create table if not exists spl_material_uvozi (
  id           bigint generated always as identity primary key,
  datoteka     text not null,
  st_postavk   integer not null default 0,
  aktiven      boolean not null default false,  -- aplikacija ga aktivira, ko so vsi zapisi vpisani
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists spl_material (
  id                     bigint generated always as identity primary key,
  ident                  text not null unique,
  uvoz_id                bigint not null references spl_material_uvozi(id),  -- zadnji uvoz, ki je vseboval ident
  naziv                  text,
  em                     text,
  status_identa          text,
  dobavitelj             text,
  naziv_dobavitelja      text,
  pripadnost             text,
  zaloga                 numeric(14, 3) not null default 0,
  zaloga_ostalo          numeric(14, 3) not null default 0,
  potreba_dn             numeric(14, 3) not null default 0,
  razpolozljiva          numeric(14, 3) not null default 0,
  narocena_kolicina      numeric(14, 3) not null default 0,
  naroceno               numeric(14, 3) not null default 0,
  predvideno             numeric(14, 3) not null default 0,
  definirano             numeric(14, 3) not null default 0,
  rezervirano            numeric(14, 3) not null default 0,
  planirano_proizvodnja  numeric(14, 3) not null default 0,
  planirano_dn           numeric(14, 3) not null default 0,
  prosta_zaloga          numeric(14, 3) not null default 0,
  prosta_brez_narocil    numeric(14, 3) not null default 0,
  min_zaloga             numeric(14, 3) not null default 0,
  max_zaloga             numeric(14, 3) not null default 0,
  potrebe_min            numeric(14, 3) not null default 0,
  razlika_max            numeric(14, 3) not null default 0,
  visible                boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists spl_material_uvoz_idx on spl_material(uvoz_id);

-- Ko uvoz postane aktiven, prejšnji uvozi niso več aktivni
create or replace function spl_material_uvozi_deaktiviraj()
returns trigger
language plpgsql
as $$
begin
  if new.aktiven then
    update spl_material_uvozi set aktiven = false where id <> new.id and aktiven;
  end if;
  return null;
end;
$$;

drop trigger if exists spl_material_uvozi_deaktiviraj on spl_material_uvozi;
create trigger spl_material_uvozi_deaktiviraj
  after insert or update of aktiven on spl_material_uvozi
  for each row execute function spl_material_uvozi_deaktiviraj();

-- updated_at + RLS (samo prijavljeni, brez DELETE)
do $$
declare t text;
begin
  foreach t in array array['spl_material_uvozi', 'spl_material'] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function fp_set_updated_at()',
      t || '_updated_at', t);

    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format(
      'create policy %I on %I for select to authenticated using (true)', t || '_select', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated using (true) with check (true)',
      t || '_update', t);
  end loop;
end;
$$;
