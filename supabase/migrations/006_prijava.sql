-- =====================================================================
-- FINES - Production | 006: prijava - dostop samo za prijavljene
--
-- Do zdaj so imele vse politike vlogo "anon" (testna faza): kdorkoli z
-- javnim (publishable) ključem iz aplikacije je lahko bral in pisal.
-- Ta migracija vse politike tabel fp_ / spl_ / ln_fp_ in slik rutine
-- preklopi na "authenticated" -> brez prijave ni dostopa do podatkov.
--
-- VRSTNI RED:
--   1. Supabase -> Authentication -> Users -> Add user (Auto Confirm) - uporabnik aplikacije
--   2. Objavi aplikacijo s prijavo (Vercel) in se prijavi
--   3. Šele nato zaženi to migracijo
-- Idempotentno. Nove tabele: politike pišemo samo za "authenticated".
-- =====================================================================

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where 'anon' = any (roles)
      and (
        (schemaname = 'public' and (tablename like 'fp\_%' or tablename like 'spl\_%' or tablename like 'ln\_fp\_%'))
        or (schemaname = 'storage' and tablename = 'objects' and policyname like 'fp\_slike\_%')
      )
  loop
    execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

-- Kontrola: ta poizvedba mora vrniti 0 vrstic
-- select schemaname, tablename, policyname, roles from pg_policies
-- where 'anon' = any (roles) and (tablename like 'fp\_%' or tablename like 'spl\_%' or tablename like 'ln\_fp\_%' or policyname like 'fp\_slike\_%');
