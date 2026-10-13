-- =====================================================================
-- FINES - Production | 011: Produktivnost - tedenski Gemba walk
-- fp_prod_ = Produktivnost (Rutina -> Produktivnost)
--
-- En Gemba (zapisnik) na teden (ponedeljek). Na gembi se zapisujejo
-- akcije (problem -> ukrep -> odgovoren -> rok -> ocena prihranka),
-- slike, skice (tabla) in povpraševanja (priloge).
-- Datoteke so v bucketu fp-rutina-slike pod mapo "prod/" (ločeno od
-- rutin "pr/" in "skl/").
-- Zaženi PO 010_zasedenost_7h.sql. Idempotentno.
-- =====================================================================

-- Gemba (zapisnik tedna)
create table if not exists fp_prod_gemba (
  id          bigint generated always as identity primary key,
  teden       date not null,                       -- ponedeljek tedna
  datum       date,                                -- dan izvedbe
  udelezenci  text,
  lokacija    text,                                -- celica / družina izdelkov
  tema        text,                                -- tema opazovanja (koda izgube)
  zapisnik    text,
  orodja      jsonb not null default '{}'::jsonb,  -- štoparica, števci (orodja gembe)
  kpi_ure     numeric(10, 2),                      -- človek-ure opazovane serije
  kpi_kosi    numeric(10, 2),                      -- dobri kosi opazovane serije
  status      text not null default 'OSNUTEK',
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fp_prod_gemba_teden_ck check (extract(isodow from teden) = 1),
  constraint fp_prod_gemba_status_ck check (status in ('OSNUTEK', 'ZAKLJUCEN'))
);
create unique index if not exists fp_prod_gemba_teden_uq on fp_prod_gemba (teden) where visible;

-- Akcije (tabla izboljšav)
create table if not exists fp_prod_akcije (
  id                 bigint generated always as identity primary key,
  gemba_id           bigint not null references fp_prod_gemba(id),
  problem            text not null,
  ukrep              text,
  kategorija         text,                         -- koda izgube
  odgovoren          text,
  rok                date,
  status             text not null default 'ODPRTO',
  prihranek_h_teden  numeric(8, 2),                -- ocena prihranka (h na teden)
  strosek_eur        numeric(10, 2),               -- enkratni strošek ukrepa
  rezultat           text,                         -- meritev pred/po, preverjanje
  zakljuceno         date,                         -- kdaj je bil ukrep izveden
  visible            boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint fp_prod_akcije_problem_ck check (length(trim(problem)) > 0),
  constraint fp_prod_akcije_status_ck check (status in ('ODPRTO', 'V_DELU', 'IZVEDENO', 'PREVERJENO', 'OPUSCENO'))
);
create index if not exists fp_prod_akcije_gemba_idx on fp_prod_akcije (gemba_id);

-- Priloge: slike, skice (tabla) in povpraševanja
create table if not exists fp_prod_priloge (
  id            bigint generated always as identity primary key,
  gemba_id      bigint not null references fp_prod_gemba(id),
  tip           text not null,
  storage_path  text not null,
  ime           text,                              -- izvirno ime datoteke
  opis          text,
  status        text,                              -- povpraševanje: POSLANO / PONUDBA / NAROCENO / ZAVRNJENO
  velikost      int,
  visible       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fp_prod_priloge_tip_ck check (tip in ('SLIKA', 'SKICA', 'POVPRASEVANJE'))
);
create index if not exists fp_prod_priloge_gemba_idx on fp_prod_priloge (gemba_id);

-- Nastavitve (urna postavka za oceno prihranka v EUR ...)
create table if not exists fp_prod_nastavitve (
  id          bigint generated always as identity primary key,
  kljuc       text not null unique,
  vrednost    numeric(12, 2) not null,
  opis        text,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into fp_prod_nastavitve (kljuc, vrednost, opis) values
  ('URNA_POSTAVKA', 25, 'Strošek ure dela (EUR/h) za oceno prihranka'),
  ('TEDNOV_LETNO', 46, 'Število delovnih tednov na leto'),
  ('CILJ_H_TEDEN', 20, 'Cilj prihranka (h na teden)')
on conflict (kljuc) do nothing;

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['fp_prod_gemba', 'fp_prod_akcije', 'fp_prod_priloge', 'fp_prod_nastavitve'] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function fp_set_updated_at()',
      t || '_updated_at', t);
  end loop;
end;
$$;

-- =====================================================================
-- RLS - samo prijavljeni (authenticated), brez DELETE (podatke skrijemo)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['fp_prod_gemba', 'fp_prod_akcije', 'fp_prod_priloge', 'fp_prod_nastavitve'] loop
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

-- =====================================================================
-- STORAGE: povpraševanja so lahko tudi PDF / Word / Excel / Outlook
-- (bucket fp-rutina-slike, mapa prod/). Največ 10 MB na datoteko.
-- =====================================================================
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-outlook',
      'message/rfc822',
      'text/plain'
    ]
where id = 'fp-rutina-slike';
