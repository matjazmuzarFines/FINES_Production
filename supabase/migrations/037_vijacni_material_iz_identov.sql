-- =====================================================================
-- FINES - Production | 037: seznam vijačnega materiala iz identov
--
-- Seznam ni več fiksen (enkratni uvoz iz CSV, 032), ampak so to vsi identi
-- iz spl_identi s klasifikatom 028, 060 ali 064. Nov ident na seznamu identov
-- se pojavi sam (z zalogo 0), naziv in EM se vedno vzameta iz identov.
--
-- fp_vijacni_material ostane: en zapis na šifro z zalogo, lokacijo in dnevnikom.
-- fp_vijacni_seznam() ob vsakem branju:
--   1) doda zapis za vsako šifro 028 / 060 / 064, ki ga še nima (zaloga 0),
--   2) osveži naziv in EM iz identov,
--   3) vrne materiale, katerih ident je 028 / 060 / 064 in je aktiven
--      (neaktiven ident ali zapis brez šifre ostane viden samo, dokler ima zalogo).
-- Na skupno tabelo spl_identi (tudi FINES_WorkInstructions) ne dodaja prožilcev.
-- Zaženi PO 031 in 032.
-- =====================================================================
begin;

-- ena šifra = en zapis (zapisi brez šifre so dovoljeni)
create unique index if not exists fp_vijacni_material_sifra_uq on public.fp_vijacni_material(sifra) where sifra is not null;

create or replace function public.fp_vijacni_seznam()
returns setof public.fp_vijacni_material
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not fos_ima_dostop('fp_vijacni_material') then
    raise exception 'Ni dostopa.';
  end if;

  -- 1) novi identi
  insert into fp_vijacni_material (sifra, naziv, em, zaloga)
  select i.sifra, i.naziv, coalesce(nullif(upper(trim(i.em)), ''), 'KOS'), 0
  from spl_identi i
  where i.visible
    and i.klasifikat in ('028', '060', '064')
    and not coalesce(i.neaktiven, false)
    and not exists (select 1 from fp_vijacni_material v where v.sifra = i.sifra)
  on conflict do nothing;

  -- 2) naziv in EM iz identov (samo, kjer se razlikujeta - brez nepotrebnih update)
  update fp_vijacni_material v
  set naziv = i.naziv, em = coalesce(nullif(upper(trim(i.em)), ''), 'KOS')
  from spl_identi i
  where i.sifra = v.sifra
    and i.visible
    and (v.naziv is distinct from i.naziv or v.em is distinct from coalesce(nullif(upper(trim(i.em)), ''), 'KOS'));

  -- 3) prikazani materiali
  return query
    select v.*
    from fp_vijacni_material v
    left join spl_identi i on i.sifra = v.sifra and i.visible
    where v.visible
      and (
        (i.klasifikat in ('028', '060', '064') and not coalesce(i.neaktiven, false))
        or v.zaloga > 0
      )
    order by v.naziv, v.id;
end;
$$;
revoke all on function public.fp_vijacni_seznam() from public, anon;
grant execute on function public.fp_vijacni_seznam() to authenticated;

commit;
