-- =====================================================================
-- FINES - Production | 022: Pakiranje - natisnjene odpreme
--
-- Ko se za odpremo prvič prenese PDF navodil za pakiranje, se zapiše
-- barva lista z lokacijo. Stolpec "Printano" v tabeli odprem pokaže
-- kvadratek te barve. Ob vsakem naslednjem tisku se barva in čas posodobita
-- (prvi tisk ostane zapisan v prvic_at).
-- Status odpreme se ne spreminja (vedno je tak kot v VD300).
-- Zaženi PO 001_schema.sql. Idempotentno. Dostop samo za prijavljene.
-- =====================================================================

create table if not exists fp_pak_printano (
  id           bigint generated always as identity primary key,
  stevilka     text not null unique,          -- številka odpreme VD300
  barva        text not null,                 -- koda barve lista (bela, rumena ...)
  prvic_at     timestamptz not null default now(),
  zadnjic_at   timestamptz not null default now(),
  uporabnik    text,                          -- e-mail, ki je zadnji natisnil
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- updated_at + RLS (samo prijavljeni, brez DELETE)
drop trigger if exists fp_pak_printano_updated_at on fp_pak_printano;
create trigger fp_pak_printano_updated_at
  before update on fp_pak_printano for each row execute function fp_set_updated_at();

alter table fp_pak_printano enable row level security;
drop policy if exists fp_pak_printano_select on fp_pak_printano;
drop policy if exists fp_pak_printano_insert on fp_pak_printano;
drop policy if exists fp_pak_printano_update on fp_pak_printano;
create policy fp_pak_printano_select on fp_pak_printano for select to authenticated using (true);
create policy fp_pak_printano_insert on fp_pak_printano for insert to authenticated with check (true);
create policy fp_pak_printano_update on fp_pak_printano for update to authenticated using (true) with check (true);
