-- =====================================================================
-- FINES - Production | 024: Doizdaja - čakajoče izdaje
--
-- Ko prevzem od dobavitelja pokrije material, ki je na delno izdanem nalogu
-- manjkal, aplikacija zapiše čakajočo izdajo (material + nalog + datum prevzema).
-- Kartica na tabli ostane, dokler izvoz izdaj ne pokaže, da je material izdan;
-- takrat se zapis zaključi (zakljuceno_at), ne briše. Dnevi čakanja se štejejo
-- od datuma prevzema (delovni dnevi): 1.-2. dan zelena, 3. rumena, od 4. rdeča.
-- Zaženi PO 023_doizdaja.sql. Idempotentno. Dostop samo za prijavljene.
-- =====================================================================

create table if not exists fp_doi_cakanje (
  id                bigint generated always as identity primary key,
  ident             text not null,            -- proizvodna šifra materiala
  st_naloga         text not null,
  prevzem_datum     date not null,            -- prevzem, s katerim je material postal na voljo
  prevzem_stevilka  text,
  zakljuceno_at     timestamptz,              -- material izdan (null = še čaka)
  visible           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (ident, st_naloga)
);
create index if not exists fp_doi_cakanje_odprte_idx on fp_doi_cakanje(zakljuceno_at);

-- updated_at + RLS (samo prijavljeni, brez DELETE)
drop trigger if exists fp_doi_cakanje_updated_at on fp_doi_cakanje;
create trigger fp_doi_cakanje_updated_at
  before update on fp_doi_cakanje for each row execute function fp_set_updated_at();

alter table fp_doi_cakanje enable row level security;
drop policy if exists fp_doi_cakanje_select on fp_doi_cakanje;
drop policy if exists fp_doi_cakanje_insert on fp_doi_cakanje;
drop policy if exists fp_doi_cakanje_update on fp_doi_cakanje;
create policy fp_doi_cakanje_select on fp_doi_cakanje for select to authenticated using (true);
create policy fp_doi_cakanje_insert on fp_doi_cakanje for insert to authenticated with check (true);
create policy fp_doi_cakanje_update on fp_doi_cakanje for update to authenticated using (true) with check (true);
