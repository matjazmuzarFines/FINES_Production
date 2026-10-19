-- =====================================================================
-- FINES - Production | 015: Management - Auditi (splošni gemba walki vodstva)
-- fp_aud_ = Auditi (Management -> Rutinsko delo -> Auditi)
--
-- Audit = obhod vodje po oddelku podjetja (Proizvodnja, Montaža, Skladišče,
-- Logistika, Kakovost, Tehnologija). Vodja izpolni datum, oddelek, temo,
-- izvajalca in udeležence, nato zapisnik, akcije (ugotovitev -> ukrep ->
-- odgovoren -> rok), slike, skice (tabla) in povpraševanja.
-- Datoteke so v bucketu fp-rutina-slike pod mapo "aud/".
-- Zaženi PO 014_produktivnost_vprasanja.sql. Idempotentno.
-- =====================================================================

-- Audit (zapisnik obhoda)
create table if not exists fp_aud_audit (
  id          bigint generated always as identity primary key,
  datum       date not null,
  oddelek     text not null,                       -- PROIZVODNJA / MONTAZA / SKLADISCE / LOGISTIKA / KAKOVOST / TEHNOLOGIJA
  tema        text,                                -- koda teme oddelka (null = vse teme)
  izvajalec   text,                                -- vodja, ki izvaja audit
  udelezenci  text,
  lokacija    text,                                -- področje / delovno mesto
  zapisnik    text,
  orodja      jsonb not null default '{}'::jsonb,  -- časovnik, števci
  status      text not null default 'OSNUTEK',
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fp_aud_audit_oddelek_ck check (oddelek in ('PROIZVODNJA', 'MONTAZA', 'SKLADISCE', 'LOGISTIKA', 'KAKOVOST', 'TEHNOLOGIJA')),
  constraint fp_aud_audit_status_ck check (status in ('OSNUTEK', 'ZAKLJUCEN'))
);
create index if not exists fp_aud_audit_datum_idx on fp_aud_audit (datum);

-- Akcije (ugotovitve in ukrepi)
create table if not exists fp_aud_akcije (
  id          bigint generated always as identity primary key,
  audit_id    bigint not null references fp_aud_audit(id),
  problem     text not null,                       -- ugotovitev
  ukrep       text,
  kategorija  text,                                -- koda teme oddelka
  odgovoren   text,
  rok         date,
  status      text not null default 'ODPRTO',
  rezultat    text,                                -- preverjanje učinka
  zakljuceno  date,                                -- kdaj je bil ukrep izveden
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fp_aud_akcije_problem_ck check (length(trim(problem)) > 0),
  constraint fp_aud_akcije_status_ck check (status in ('ODPRTO', 'V_DELU', 'IZVEDENO', 'PREVERJENO', 'OPUSCENO'))
);
create index if not exists fp_aud_akcije_audit_idx on fp_aud_akcije (audit_id);

-- Priloge: slike, skice (tabla) in povpraševanja
create table if not exists fp_aud_priloge (
  id            bigint generated always as identity primary key,
  audit_id      bigint not null references fp_aud_audit(id),
  tip           text not null,
  storage_path  text not null,
  ime           text,
  opis          text,
  status        text,                              -- povpraševanje: POSLANO / PONUDBA / NAROCENO / ZAVRNJENO
  velikost      int,
  visible       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fp_aud_priloge_tip_ck check (tip in ('SLIKA', 'SKICA', 'POVPRASEVANJE'))
);
create index if not exists fp_aud_priloge_audit_idx on fp_aud_priloge (audit_id);

-- Lastna vprašanja vodiča (vgrajena so v auditVodic.ts):
--   dodana vprašanja (izbrisano = false), odstranjena vgrajena (izbrisano = true).
-- oddelek: koda oddelka ('' = splošna vprašanja), tema: koda teme ('' = splošno za oddelek)
create table if not exists fp_aud_vprasanja (
  id          bigint generated always as identity primary key,
  oddelek     text not null default '',
  tema        text not null default '',
  skupina     text not null,
  besedilo    text not null,
  izbrisano   boolean not null default false,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fp_aud_vprasanja_skupina_ck check (skupina in ('OPAZUJ', 'VPRASAJ', 'SPLOSNO')),
  constraint fp_aud_vprasanja_besedilo_ck check (length(trim(besedilo)) > 0)
);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['fp_aud_audit', 'fp_aud_akcije', 'fp_aud_priloge', 'fp_aud_vprasanja'] loop
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
  foreach t in array array['fp_aud_audit', 'fp_aud_akcije', 'fp_aud_priloge', 'fp_aud_vprasanja'] loop
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
