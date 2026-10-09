-- =====================================================================
-- FINES - Production | 009: Prioritete - odpreme iz VD300
--
-- VD200 ne pokaže, kdaj je bila oprema vzeta z zaloge za odpremo.
-- V VD300 (odpreme) se ob tem ustvari dobavnica (stolpec
-- "Dokument (SKL/VT/ŠTEVILKA)") in oprema ni več na nobeni zalogi.
-- Postavka naročila VD200, za katero v VD300 obstaja dobavnica,
-- je "V odpremi" in ne porabi zaloge matičnega skladišča.
--
-- Povezava: VD300 "Vezni dokument Številka (IZ)" = številka naročila VD200, + IDENT.
-- Zaženi PO 005_prioritete.sql. Idempotentno. Dostop samo za prijavljene.
-- =====================================================================

create table if not exists fp_pri_odp_uvozi (
  id           bigint generated always as identity primary key,
  datoteka     text not null,
  st_postavk   integer not null default 0,
  aktiven      boolean not null default false,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists fp_pri_odpreme (
  id                bigint generated always as identity primary key,
  uvoz_id           bigint not null references fp_pri_odp_uvozi(id),
  stevilka          text not null,          -- številka dokumenta VD300
  zap               integer,
  narocilo          text,                   -- vezni dokument VD200 (številka naročila)
  narocilo_status   text,                   -- status naročila VD200 (npr. VD200-potrjeno)
  status            text,                   -- status odpreme (Odprt, Priprava blaga, Pripravljena odprema ...)
  partner           text,
  datum_odpreme     date,
  ident             text not null,
  opis              text,
  kolicina          numeric(12, 3) not null default 0,
  dokument          text,                   -- dobavnica (SKL/VT/ŠTEVILKA); prazno = še ni vzeto z zaloge
  visible           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists fp_pri_odpreme_uvoz_idx on fp_pri_odpreme(uvoz_id);
create index if not exists fp_pri_odpreme_narocilo_idx on fp_pri_odpreme(narocilo, ident);

-- Ko uvoz postane aktiven, prejšnji uvozi odprem niso več aktivni
create or replace function fp_pri_odp_uvozi_deaktiviraj()
returns trigger
language plpgsql
as $$
begin
  if new.aktiven then
    update fp_pri_odp_uvozi set aktiven = false where id <> new.id and aktiven;
  end if;
  return null;
end;
$$;

drop trigger if exists fp_pri_odp_uvozi_deaktiviraj on fp_pri_odp_uvozi;
create trigger fp_pri_odp_uvozi_deaktiviraj
  after insert or update of aktiven on fp_pri_odp_uvozi
  for each row execute function fp_pri_odp_uvozi_deaktiviraj();

-- updated_at + RLS (samo prijavljeni, brez DELETE)
do $$
declare t text;
begin
  foreach t in array array['fp_pri_odp_uvozi', 'fp_pri_odpreme'] loop
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
