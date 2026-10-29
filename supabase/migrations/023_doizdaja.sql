-- =====================================================================
-- FINES - Production | 023: Skladišče - Doizdaja materiala
--
-- Pregled materiala, ki je bil na aktivne delovne naloge izdan samo delno
-- (ni ga bilo na zalogi) in je zdaj prispel s prevzemom od dobavitelja.
--
-- Dva uvoza iz ERP (aktiven je zadnji uvoz vsake vrste):
--   fp_doi_izdaje   - "Kreiranje izdaj v proizvodnjo": material po nalogih
--                     (planirano, porabljeno = izdano, za izdajo, trenutna zaloga).
--                     Shranijo se samo aktivni nalogi (status ni Z - zaključen).
--   fp_doi_prevzemi - "Prevzem od dobavitelja": postavke prevzemov (ident, količina, čas).
-- Krovni nalog se prebere iz uvoza delovnih nalogov (fp_zas_nalogi).
-- Zaženi PO 001_schema.sql. Idempotentno. Dostop samo za prijavljene.
-- =====================================================================

create table if not exists fp_doi_izdaje_uvozi (
  id           bigint generated always as identity primary key,
  datoteka     text not null,
  st_postavk   integer not null default 0,
  st_nalogov   integer not null default 0,
  aktiven      boolean not null default false,  -- aplikacija ga aktivira, ko so vse vrstice vpisane
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists fp_doi_izdaje (
  id                  bigint generated always as identity primary key,
  uvoz_id             bigint not null references fp_doi_izdaje_uvozi(id),
  st_naloga           text not null,
  opis                text,
  koda_artikla        text,
  naziv_artikla       text,
  status              text,            -- O = aktiven - v delu, D = definiran - potrjen
  status_naloga       text,
  rok_izdelave        date,
  razpisana_kolicina  numeric(14, 3) not null default 0,
  ident               text not null,   -- proizvodna šifra materiala
  naziv               text,
  naroceno            boolean not null default false,
  skupina             text,
  skl                 text,            -- skladišče materiala
  em                  text,
  zaloga              numeric(14, 3) not null default 0,  -- trenutna zaloga ob izvozu
  porabljeno          numeric(14, 3) not null default 0,  -- izdano na nalog
  planirano           numeric(14, 3) not null default 0,
  za_izdajo           numeric(14, 3) not null default 0,
  visible             boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists fp_doi_izdaje_uvoz_idx on fp_doi_izdaje(uvoz_id);

create table if not exists fp_doi_prevzemi_uvozi (
  id           bigint generated always as identity primary key,
  datoteka     text not null,
  st_postavk   integer not null default 0,
  aktiven      boolean not null default false,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists fp_doi_prevzemi (
  id             bigint generated always as identity primary key,
  uvoz_id        bigint not null references fp_doi_prevzemi_uvozi(id),
  skladisce      text,
  stevilka       text,               -- številka prevzema
  datum          date,
  cas            timestamp,          -- datum / ura kreiranja (lokalni čas)
  narocilo       text,
  dobavitelj     text,
  dobavnica      text,
  delovni_nalog  text,               -- prevzem za določen delovni nalog (postavka ali glava)
  ident          text not null,      -- proizvodna šifra
  naziv          text,
  kolicina       numeric(14, 3) not null default 0,
  em             text,
  uporabnik      text,
  visible        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists fp_doi_prevzemi_uvoz_idx on fp_doi_prevzemi(uvoz_id);

-- Ko uvoz postane aktiven, prejšnji uvozi iste vrste niso več aktivni
create or replace function fp_doi_uvozi_deaktiviraj()
returns trigger
language plpgsql
as $$
begin
  if new.aktiven then
    execute format('update %I set aktiven = false where id <> $1 and aktiven', TG_TABLE_NAME) using new.id;
  end if;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['fp_doi_izdaje_uvozi', 'fp_doi_prevzemi_uvozi'] loop
    execute format('drop trigger if exists %I on %I', t || '_deaktiviraj', t);
    execute format(
      'create trigger %I after insert or update of aktiven on %I for each row execute function fp_doi_uvozi_deaktiviraj()',
      t || '_deaktiviraj', t);
  end loop;
end;
$$;

-- updated_at + RLS (samo prijavljeni, brez DELETE)
do $$
declare t text;
begin
  foreach t in array array['fp_doi_izdaje_uvozi', 'fp_doi_izdaje', 'fp_doi_prevzemi_uvozi', 'fp_doi_prevzemi'] loop
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
