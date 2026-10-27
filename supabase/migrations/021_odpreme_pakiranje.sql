-- =====================================================================
-- FINES - Production | 021: Odpreme VD300 - podatki za pakiranje
--
-- Orodja -> Pakiranje potrebuje iz izvoza VD300 še lokacijo dostave
-- (za list z lokacijo na paleti), skupino postavk (stolpec "Oddelek",
-- npr. "5-PLADENJSKI PEKARSKI KOMPLET"), enoto, državo, kupčevo naročilo
-- in opombe dokumenta.
--
-- Shranijo se tudi odpreme brez veznega naročila VD200 (če niso zaključene).
-- Zaženi PO 009_prioritete_odpreme_vd300.sql. Idempotentno.
-- Po zagonu je treba odpreme VD300 uvoziti znova (stari uvozi nimajo lokacije).
-- =====================================================================

alter table fp_pri_odpreme add column if not exists lokacija         text;  -- lokacija dostave (npr. KONZUM BIH - P322 TUZLA)
alter table fp_pri_odpreme add column if not exists drzava           text;
alter table fp_pri_odpreme add column if not exists kupcevo_narocilo text;
alter table fp_pri_odpreme add column if not exists oddelek          text;  -- skupina postavk na dokumentu (komplet)
alter table fp_pri_odpreme add column if not exists em               text;
alter table fp_pri_odpreme add column if not exists opis_dokumenta   text;
alter table fp_pri_odpreme add column if not exists interne_opombe   text;
alter table fp_pri_odpreme add column if not exists zaznamek         text;
alter table fp_pri_odpreme add column if not exists zaloga           numeric(12, 3);  -- zaloga matično ob izvozu (če ni materiala)
