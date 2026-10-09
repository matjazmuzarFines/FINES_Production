-- =====================================================================
-- FINES - Production | 004: Change management (tedenski napredek vodij)
-- fp_cm_ = Change management
-- Vsak vodja ima svoja področja (povezovalna tabela). Vsak teden se za
-- področje vpiše sprememba v % (npr. +0,5, +1, -0,5) s komentarjem.
-- Graf = seštevek sprememb od začetka (začetek = 0 %).
-- Zaženi PO 003_normativi_vsota.sql. Idempotentno.
-- =====================================================================

-- Vodje, ki jih spremljamo
create table if not exists fp_cm_vodje (
  id          bigint generated always as identity primary key,
  koda        text not null unique,              -- VP, VM, VO
  naziv       text not null,                     -- Vodja proizvodnje ...
  zacetek     date not null default '2026-10-05', -- ponedeljek, točka 0 %
  vrstni_red  int not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Področja (teme grafov)
create table if not exists fp_cm_podrocja (
  id          bigint generated always as identity primary key,
  koda        text not null unique,
  naziv       text not null,
  vrstni_red  int not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Katera področja ima posamezen vodja
create table if not exists ln_fp_cm_vodje_podrocja (
  id           bigint generated always as identity primary key,
  vodja_id     bigint not null references fp_cm_vodje(id),
  podrocje_id  bigint not null references fp_cm_podrocja(id),
  vrstni_red   int not null default 0,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ln_fp_cm_vodje_podrocja_uq unique (vodja_id, podrocje_id)
);

-- Tedenske ocene: sprememba v odstotnih točkah za teden (ponedeljek)
create table if not exists fp_cm_ocene (
  id           bigint generated always as identity primary key,
  vodja_id     bigint not null references fp_cm_vodje(id),
  podrocje_id  bigint not null references fp_cm_podrocja(id),
  teden        date not null,                    -- ponedeljek tedna
  sprememba    numeric(6, 2) not null,           -- +0,5 / +1 / -0,5 ...
  komentar     text not null,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint fp_cm_ocene_komentar_ck check (length(trim(komentar)) > 0),
  constraint fp_cm_ocene_teden_ck check (extract(isodow from teden) = 1)
);
-- En veljaven vpis na vodjo, področje in teden (skriti vpisi ostanejo kot zgodovina)
create unique index if not exists fp_cm_ocene_teden_uq
  on fp_cm_ocene (vodja_id, podrocje_id, teden) where visible;
create index if not exists fp_cm_ocene_vodja_idx on fp_cm_ocene (vodja_id);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['fp_cm_vodje', 'fp_cm_podrocja', 'ln_fp_cm_vodje_podrocja', 'fp_cm_ocene'] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function fp_set_updated_at()',
      t || '_updated_at', t);
  end loop;
end;
$$;

-- =====================================================================
-- ZAČETNI PODATKI
-- =====================================================================
insert into fp_cm_vodje (koda, naziv, vrstni_red) values
  ('VP', 'Vodja proizvodnje', 1),
  ('VM', 'Vodja montaže', 2),
  ('VO', 'Vodja operacij', 3)
on conflict (koda) do nothing;

insert into fp_cm_podrocja (koda, naziv, vrstni_red) values
  ('PLAN',        'Plan dela', 1),
  ('LJUDJE',      'Ljudje', 2),
  ('RUTINA',      'Rutina in sestanki', 3),
  ('POMOC',       'Pomoč', 4),
  ('ORGANIZACIJA','Organizacija', 5),
  ('NAPREDEK',    'Napredek', 6),
  ('ODNOS',       'Odnos do dela', 7)
on conflict (koda) do nothing;

-- Vodja proizvodnje in vodja montaže imata vseh 7 področij; vodja operacij zaenkrat nič
insert into ln_fp_cm_vodje_podrocja (vodja_id, podrocje_id, vrstni_red)
select v.id, p.id, p.vrstni_red
from fp_cm_vodje v
cross join fp_cm_podrocja p
where v.koda in ('VP', 'VM')
on conflict (vodja_id, podrocje_id) do nothing;

-- =====================================================================
-- RLS - enako kot ostale tabele (testna faza, brez DELETE)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['fp_cm_vodje', 'fp_cm_podrocja', 'ln_fp_cm_vodje_podrocja', 'fp_cm_ocene'] loop
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
