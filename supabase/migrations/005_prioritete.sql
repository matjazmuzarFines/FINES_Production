-- =====================================================================
-- FINES - Production | 005: Prioritete (izvoz naročil VD200)
--
-- Uvoz izvozvd200.xlsx (postavke potrjenih naročil + zaloga / DN po artiklu).
-- Vsak uvoz je svoj paket, prikazuje se zadnji aktivni (enako kot fp_zas_uvozi).
-- Delovni nalogi se NE uvažajo ponovno - prioritete berejo zadnji uvoz iz Zasedenosti.
-- Opombe in oznaka "pregledano" so vezane na postavko (številka/zap/ident)
-- in ostanejo tudi po novem uvozu.
-- Zaženi PO 004_delovni_plan.sql. Idempotentno.
-- =====================================================================

create table if not exists fp_pri_uvozi (
  id           bigint generated always as identity primary key,
  datoteka     text not null,
  st_postavk   integer not null default 0,
  aktiven      boolean not null default false,  -- aplikacija ga aktivira, ko so vse postavke vpisane
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists fp_pri_postavke (
  id                   bigint generated always as identity primary key,
  uvoz_id              bigint not null references fp_pri_uvozi(id),
  kljuc                text not null,              -- "številka/zap/ident" (za opombe)
  stevilka             text not null,              -- številka naročila (VD200)
  zap                  integer,
  status               text,                       -- VD200-potrjeno, VD200-V odpremi, ...
  partner              text,
  lokacija             text,
  drzava               text,
  kupcevo_narocilo     text,
  datum_odpreme        date,
  ident                text not null,
  opis                 text,
  komplet              text,
  kolicina             numeric(12, 2) not null default 0,
  em                   text,
  zaloga               numeric(12, 2) not null default 0,   -- ZALOGA (matično skladišče)
  zaloga_ostalo        numeric(12, 2) not null default 0,   -- ZALOGA (ostalo)
  planirano_dn         numeric(12, 2) not null default 0,   -- PLANIRANA KOLIČINA (DN)
  prosta_zaloga        numeric(12, 2) not null default 0,   -- PROSTA ZALOGA
  prosta_brez_narocil  numeric(12, 2) not null default 0,   -- PROSTA ZALOGA (brez naročil)
  sestavil             text,
  zaznamek             text,
  visible              boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint fp_pri_postavke_uq unique (uvoz_id, kljuc)
);
create index if not exists fp_pri_postavke_uvoz_idx on fp_pri_postavke(uvoz_id);
create index if not exists fp_pri_postavke_ident_idx on fp_pri_postavke(ident);

-- Ko uvoz postane aktiven, prejšnji uvozi niso več aktivni
create or replace function fp_pri_uvozi_deaktiviraj()
returns trigger
language plpgsql
as $$
begin
  if new.aktiven then
    update fp_pri_uvozi set aktiven = false where id <> new.id and aktiven;
  end if;
  return null;
end;
$$;

drop trigger if exists fp_pri_uvozi_deaktiviraj on fp_pri_uvozi;
create trigger fp_pri_uvozi_deaktiviraj
  after insert or update of aktiven on fp_pri_uvozi
  for each row execute function fp_pri_uvozi_deaktiviraj();

-- Ročne oznake planerja na postavki naročila
create table if not exists fp_pri_opombe (
  id           bigint generated always as identity primary key,
  kljuc        text not null unique,               -- enako kot fp_pri_postavke.kljuc
  opomba       text,
  pregledano   boolean not null default false,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =====================================================================
-- updated_at + RLS (enako kot v 001: brez DELETE politike)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['fp_pri_uvozi', 'fp_pri_postavke', 'fp_pri_opombe'] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function fp_set_updated_at()',
      t || '_updated_at', t);

    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)', t || '_select', t);
    execute format(
      'create policy %I on %I for insert to anon, authenticated with check (true)', t || '_insert', t);
    execute format(
      'create policy %I on %I for update to anon, authenticated using (true) with check (true)',
      t || '_update', t);
  end loop;
end;
$$;
