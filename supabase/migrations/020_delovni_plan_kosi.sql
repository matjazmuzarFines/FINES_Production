-- =====================================================================
-- FINES - Production | 020: Delovni plan - planirani kosi naloga
--
-- Postavitev lahko zajame samo del kosov naloga (npr. 40 od 100);
-- preostali kosi ostanejo nerazporejeni za kasnejšo postavitev.
--   kosi = { "<št. naloga>": { "kos": 40, "od": 100 } }
--          kos = planirani kosi, od = preostala količina ob vpisu
--          (razlika do preostale količine iz novega uvoza = izdelani kosi,
--          ki se odštejejo od najzgodnejše postavitve naloga).
--   null / nalog brez vpisa = vsi preostali kosi naloga.
-- Zaženi PO 019_delovni_plan_dodatno_delo.sql. Idempotentno.
-- =====================================================================

alter table fp_plan_postavitve add column if not exists kosi jsonb;
