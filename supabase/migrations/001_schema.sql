-- =====================================================================
-- FINES - Production | Shema baze (Supabase / PostgreSQL)
-- Predpona tabel: fp_  (povezovalne tabele: ln_fp_...)
-- Pravilo: podatkov ne brišemo -> visible = true/false
-- Izjema: slike (storage) se brišejo zaradi prostora
-- =====================================================================

-- ---------------------------------------------------------------------
-- Skupna funkcija: posodobi updated_at
-- ---------------------------------------------------------------------
create or replace function fp_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- PROIZVODNJA
-- =====================================================================

-- Oddelki (prej choice stolpec "Oddelek" v AppPR_DelovnaMesta)
create table if not exists fp_oddelki (
  id          bigint generated always as identity primary key,
  naziv       text not null unique,
  vrstni_red  integer not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Delovna mesta (AppPR_DelovnaMesta)
create table if not exists fp_delovna_mesta (
  id              bigint generated always as identity primary key,
  naziv           text not null,
  oddelek_id      bigint not null references fp_oddelki(id),
  vrstni_red      integer not null default 0,
  rutina_aktivna  boolean not null default true,
  velja_od        date,
  velja_do        date,
  visible         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists fp_delovna_mesta_oddelek_idx on fp_delovna_mesta(oddelek_id);

-- Dnevna rutina proizvodnje (AppPR_Rutina)
-- 1 zapis = 1 delovno mesto na 1 dan
create table if not exists fp_pr_rutina (
  id                     bigint generated always as identity primary key,
  datum                  date not null,
  delovno_mesto_id       bigint not null references fp_delovna_mesta(id),
  plan_pripravljen       text check (plan_pripravljen in ('DA', 'NE')),
  delovno_mesto_urejeno  text check (delovno_mesto_urejeno in ('DA', 'NE')),
  kakovost_izdelka       smallint check (kakovost_izdelka between 1 and 5),
  ocena_procesa          smallint check (ocena_procesa between 1 and 5),
  komentar               text,
  izpolnjeno             boolean not null default false,  -- izračuna trigger
  ima_odstopanje         boolean not null default false,  -- izračuna trigger
  cas_zakljucka          timestamptz,                     -- izračuna trigger
  visible                boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint fp_pr_rutina_dan_mesto_uq unique (datum, delovno_mesto_id)
);
create index if not exists fp_pr_rutina_datum_idx on fp_pr_rutina(datum);

-- Odstopanja rutine proizvodnje (AppPR_RutinaOdstopanja)
-- Vzdržuje jih trigger na fp_pr_rutina.
create table if not exists fp_pr_rutina_odstopanja (
  id          bigint generated always as identity primary key,
  rutina_id   bigint not null references fp_pr_rutina(id),
  podrocje    text not null check (podrocje in ('PLAN', 'UREJENOST', 'KAKOVOST', 'PROCES')),
  komentar    text,
  odprto      boolean not null default true,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint fp_pr_rutina_odstopanja_uq unique (rutina_id, podrocje)
);

-- Slike rutine proizvodnje (prej SharePoint knjižnica "Rutina - slike")
-- 1 slika na področje na zapis rutine. Datoteka je v Storage bucketu fp-rutina-slike.
create table if not exists fp_pr_rutina_slike (
  id            bigint generated always as identity primary key,
  rutina_id     bigint not null references fp_pr_rutina(id),
  podrocje      text not null check (podrocje in ('PLAN', 'UREJENOST', 'KAKOVOST', 'PROCES')),
  storage_path  text not null,
  visible       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fp_pr_rutina_slike_uq unique (rutina_id, podrocje)
);

-- =====================================================================
-- SKLADIŠČE
-- =====================================================================

-- Sekcije (prej choice stolpec "Sekcija" v AppSKL_KontrolneTocke)
create table if not exists fp_skl_sekcije (
  id          bigint generated always as identity primary key,
  koda        text not null unique,
  naziv       text not null,
  vrstni_red  integer not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Kontrolne točke (AppSKL_KontrolneTocke)
create table if not exists fp_skl_kontrolne_tocke (
  id                         bigint generated always as identity primary key,
  koda                       text not null unique,
  naziv                      text not null,
  vprasanje                  text not null,
  navodilo                   text,
  sekcija_id                 bigint references fp_skl_sekcije(id),
  vrstni_red                 integer not null default 0,
  cas_kontrole               time,
  tip_vnosa                  text not null check (tip_vnosa in ('DA_NE', 'PROCENT')),
  ciljni_procent             smallint check (ciljni_procent between 0 and 100),
  opis_obvezen_pri_nok       boolean not null default true,
  slika_obvezna_pri_nok      boolean not null default false,
  casovne_izgube_omogocene   boolean not null default true,
  aktivna                    boolean not null default true,
  velja_od                   date,
  velja_do                   date,
  visible                    boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- Dnevna rutina skladišča (AppSKL_Rutina)
-- 1 zapis = 1 kontrolna točka na 1 dan
create table if not exists fp_skl_rutina (
  id                    bigint generated always as identity primary key,
  datum                 date not null,
  kontrolna_tocka_id    bigint not null references fp_skl_kontrolne_tocke(id),
  tip_vnosa             text check (tip_vnosa in ('DA_NE', 'PROCENT')),  -- posnetek ob vnosu (trigger)
  ciljni_procent        smallint,                                        -- posnetek ob vnosu (trigger)
  odgovor               text check (odgovor in ('DA', 'NE')),
  dosezen_procent       smallint check (dosezen_procent between 0 and 100),
  komentar              text,
  casovne_izgube_min    integer not null default 0 check (casovne_izgube_min >= 0),
  izpolnjeno            boolean not null default false,  -- izračuna trigger
  ima_odstopanje        boolean not null default false,  -- izračuna trigger
  cas_zakljucka         timestamptz,                     -- izračuna trigger
  visible               boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint fp_skl_rutina_dan_tocka_uq unique (datum, kontrolna_tocka_id)
);
create index if not exists fp_skl_rutina_datum_idx on fp_skl_rutina(datum);

-- Slike rutine skladišča (prej SharePoint knjižnica "RutinaSKL - slike")
create table if not exists fp_skl_rutina_slike (
  id            bigint generated always as identity primary key,
  rutina_id     bigint not null references fp_skl_rutina(id),
  storage_path  text not null,
  visible       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fp_skl_rutina_slike_uq unique (rutina_id)
);

-- =====================================================================
-- TRIGGERJI updated_at
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'fp_oddelki', 'fp_delovna_mesta', 'fp_pr_rutina', 'fp_pr_rutina_odstopanja',
    'fp_pr_rutina_slike', 'fp_skl_sekcije', 'fp_skl_kontrolne_tocke',
    'fp_skl_rutina', 'fp_skl_rutina_slike'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function fp_set_updated_at()',
      t || '_updated_at', t
    );
  end loop;
end;
$$;

-- =====================================================================
-- POSLOVNA LOGIKA: RUTINA PROIZVODNJE
-- (enako kot v Power Appu: NE ali ocena 1-2 = odstopanje)
-- =====================================================================
create or replace function fp_pr_rutina_izracun()
returns trigger
language plpgsql
as $$
begin
  new.izpolnjeno :=
        new.plan_pripravljen is not null
    and new.delovno_mesto_urejeno is not null
    and new.kakovost_izdelka is not null
    and new.ocena_procesa is not null;

  new.ima_odstopanje :=
        coalesce(new.plan_pripravljen = 'NE', false)
     or coalesce(new.delovno_mesto_urejeno = 'NE', false)
     or coalesce(new.kakovost_izdelka <= 2, false)
     or coalesce(new.ocena_procesa <= 2, false);

  if new.izpolnjeno then
    if tg_op = 'INSERT' or not old.izpolnjeno or new.cas_zakljucka is null then
      new.cas_zakljucka := now();
    end if;
  else
    new.cas_zakljucka := null;
  end if;

  return new;
end;
$$;

drop trigger if exists fp_pr_rutina_izracun on fp_pr_rutina;
create trigger fp_pr_rutina_izracun
  before insert or update on fp_pr_rutina
  for each row execute function fp_pr_rutina_izracun();

create or replace function fp_pr_rutina_odstopanja_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select * from (values
      ('PLAN',      coalesce(new.plan_pripravljen = 'NE', false)),
      ('UREJENOST', coalesce(new.delovno_mesto_urejeno = 'NE', false)),
      ('KAKOVOST',  coalesce(new.kakovost_izdelka <= 2, false)),
      ('PROCES',    coalesce(new.ocena_procesa <= 2, false))
    ) as v(podrocje, aktivno)
  loop
    if r.aktivno then
      insert into fp_pr_rutina_odstopanja (rutina_id, podrocje, komentar, odprto)
      values (new.id, r.podrocje, new.komentar, true)
      on conflict (rutina_id, podrocje)
      do update set komentar = excluded.komentar, odprto = true;
    else
      update fp_pr_rutina_odstopanja
         set komentar = new.komentar, odprto = false
       where rutina_id = new.id and podrocje = r.podrocje and odprto;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists fp_pr_rutina_odstopanja_sync on fp_pr_rutina;
create trigger fp_pr_rutina_odstopanja_sync
  after insert or update on fp_pr_rutina
  for each row execute function fp_pr_rutina_odstopanja_sync();

-- =====================================================================
-- POSLOVNA LOGIKA: RUTINA SKLADIŠČA
-- DA_NE:   izpolnjeno = odgovor podan, odstopanje = NE
-- PROCENT: izpolnjeno = procent > 0,   odstopanje = procent < cilj
-- =====================================================================
create or replace function fp_skl_rutina_izracun()
returns trigger
language plpgsql
as $$
declare
  kt fp_skl_kontrolne_tocke%rowtype;
begin
  if new.tip_vnosa is null then
    select * into kt from fp_skl_kontrolne_tocke where id = new.kontrolna_tocka_id;
    new.tip_vnosa := kt.tip_vnosa;
    if new.ciljni_procent is null then
      new.ciljni_procent := kt.ciljni_procent;
    end if;
  end if;

  if new.tip_vnosa = 'DA_NE' then
    new.dosezen_procent := null;
    new.izpolnjeno      := new.odgovor is not null;
    new.ima_odstopanje  := coalesce(new.odgovor = 'NE', false);
  else
    new.odgovor := null;
    if new.dosezen_procent = 0 then
      new.dosezen_procent := null;
    end if;
    new.izpolnjeno     := new.dosezen_procent is not null;
    new.ima_odstopanje := new.dosezen_procent is not null
                      and new.ciljni_procent is not null
                      and new.dosezen_procent < new.ciljni_procent;
  end if;

  if new.izpolnjeno then
    if tg_op = 'INSERT' or not old.izpolnjeno or new.cas_zakljucka is null then
      new.cas_zakljucka := now();
    end if;
  else
    new.cas_zakljucka := null;
  end if;

  return new;
end;
$$;

drop trigger if exists fp_skl_rutina_izracun on fp_skl_rutina;
create trigger fp_skl_rutina_izracun
  before insert or update on fp_skl_rutina
  for each row execute function fp_skl_rutina_izracun();

-- =====================================================================
-- RLS (Row Level Security)
-- TESTNA FAZA: dostop z anon/publishable ključem (branje, vnos, urejanje).
-- DELETE politike namerno NI -> podatkov se ne da brisati.
-- Ko dodamo prijavo, zamenjamo "anon" z "authenticated".
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'fp_oddelki', 'fp_delovna_mesta', 'fp_pr_rutina', 'fp_pr_rutina_odstopanja',
    'fp_pr_rutina_slike', 'fp_skl_sekcije', 'fp_skl_kontrolne_tocke',
    'fp_skl_rutina', 'fp_skl_rutina_slike'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_select', t);
    execute format(
      'create policy %I on %I for insert to anon, authenticated with check (true)',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update to anon, authenticated using (true) with check (true)',
      t || '_update', t);
  end loop;
end;
$$;

-- =====================================================================
-- STORAGE: bucket za slike rutin (zaseben, dostop prek podpisanih URL-jev)
-- Slike se smejo brisati (zamenjava / odstranitev slike).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fp-rutina-slike', 'fp-rutina-slike', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "fp_slike_select" on storage.objects;
drop policy if exists "fp_slike_insert" on storage.objects;
drop policy if exists "fp_slike_update" on storage.objects;
drop policy if exists "fp_slike_delete" on storage.objects;

create policy "fp_slike_select" on storage.objects
  for select to anon, authenticated using (bucket_id = 'fp-rutina-slike');
create policy "fp_slike_insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'fp-rutina-slike');
create policy "fp_slike_update" on storage.objects
  for update to anon, authenticated using (bucket_id = 'fp-rutina-slike');
create policy "fp_slike_delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'fp-rutina-slike');
