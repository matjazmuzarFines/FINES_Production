-- =====================================================================
-- FINES - Production | 010: Zasedenost - 7 h na dan na osebo
--
-- Razpoložljivost oddelkov se računa s 7 h/dan na osebo (prej 6,5 h).
-- Oddelki, ki imajo ročno nastavljeno drugo vrednost, ostanejo nespremenjeni.
-- Zaženi PO 002_normativi_zasedenost.sql. Idempotentno.
-- =====================================================================

alter table fp_oddelki alter column ure_na_dan set default 7;

update fp_oddelki set ure_na_dan = 7 where ure_na_dan = 6.5;
update fp_zas_kapacitete set ure_na_dan = 7 where ure_na_dan = 6.5;
