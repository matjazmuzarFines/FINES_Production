-- =====================================================================
-- FINES - Production | 017: Delovni plan - izbrani nalogi krovnega naloga
--
-- Postavitev krovnega naloga lahko zajame samo izbrane naloge (ostali so
-- prečrtani z X in ostanejo za kasnejšo postavitev).
--   nalogi    = številke vključenih nalogov; null = vsi nalogi krovnega
--   rocne_ure = true: ure so vpisane ročno; false: ure = vsota ur vključenih
--               nalogov iz zadnjega uvoza (preračunajo se ob vsakem uvozu).
-- Obstoječe postavitve ostanejo z ročnimi urami (enako kot doslej).
-- Zaženi PO 004_delovni_plan.sql. Idempotentno.
-- =====================================================================

alter table fp_plan_postavitve add column if not exists nalogi text[];
alter table fp_plan_postavitve add column if not exists rocne_ure boolean not null default true;
alter table fp_plan_postavitve alter column rocne_ure set default false;
