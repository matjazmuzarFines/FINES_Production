-- =====================================================================
-- FINES - Production | 013: Produktivnost - KPI 5 faktor investicije
--
-- Faktor = letni prihranek izvedenih akcij (EUR/leto) / investirano
-- (enkratni stroški teh akcij). Cilj 1,5 = na 100 EUR investicije
-- 150 EUR letnega prihranka.
-- Zaženi PO 012_produktivnost_kpi.sql. Idempotentno.
-- =====================================================================

alter table fp_prod_cilji add column if not exists cilj_faktor_inv numeric(6, 2) not null default 1.5;
