-- =====================================================================
-- FINES - Production | 026: Doizdaja - obvestilo v Teams
--
-- Ko vodja pošlje obvestilo v Teams (chat Skladišče obveščanje), se pri
-- čakajočih izdajah poslanega materiala zapiše čas in pošiljatelj - na kartici
-- materiala se pokaže "obveščeno", da se isti material ne pošilja večkrat.
-- Zaženi PO 024_doizdaja_cakanje.sql. Idempotentno.
-- =====================================================================

alter table fp_doi_cakanje add column if not exists obvesceno_at timestamptz;
alter table fp_doi_cakanje add column if not exists obvestil text;
