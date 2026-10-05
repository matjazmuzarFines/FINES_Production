# Fines - Production

Spletna aplikacija FINES d.o.o. za proizvodnjo in skladišče (naslednica Power Appa "Fines - Proizvodnja").

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **Baza in slike:** Supabase (PostgreSQL + Storage)
- **Gostovanje:** Vercel
- **Koda:** GitHub

## Struktura

```
src/
  app/                         strani (route)
    page.tsx                   domača stran
    proizvodnja/rutina         rutina delovnih mest
    proizvodnja/zasedenost     (v izdelavi)
    proizvodnja/prioritete     (v izdelavi)
    skladisce/rutina           rutina skladišča
  components/
    AppShell.tsx               glava, leva navigacija, noga, "i" popup
    ui/                        enotne komponente (Button, Modal, Toast, ...)
    rutina/                    komponente rutine (koledar, foto, shranjevanje)
  lib/
    changelog.ts               verzije in spremembe ("i" popup)
    nav.ts                     zavihki leve navigacije
    rutina.ts                  branje/shranjevanje podatkov
supabase/
  migrations/001_schema.sql    tabele, triggerji, RLS, storage
  seed.sql                     testni podatki iz CSV
data/                          izvoz Power Appa + CSV (referenca)
```

## Tabele (predpona `fp_`)

| Tabela | Prej (SharePoint) | Opis |
|---|---|---|
| `fp_oddelki` | choice `Oddelek` | oddelki proizvodnje |
| `fp_delovna_mesta` | `AppPR_DelovnaMesta` | delovna mesta |
| `fp_pr_rutina` | `AppPR_Rutina` | dnevna rutina (1 delovno mesto / dan) |
| `fp_pr_rutina_odstopanja` | `AppPR_RutinaOdstopanja` | odstopanja (vzdržuje jih trigger) |
| `fp_pr_rutina_slike` | `Rutina - slike` | fotografije rutine proizvodnje |
| `fp_skl_sekcije` | choice `Sekcija` | sekcije skladišča |
| `fp_skl_kontrolne_tocke` | `AppSKL_KontrolneTocke` | kontrolne točke |
| `fp_skl_rutina` | `AppSKL_Rutina` | dnevna rutina (1 kontrolna točka / dan) |
| `fp_skl_rutina_slike` | `RutinaSKL - slike` | fotografije rutine skladišča |

Pravila: podatkov ne brišemo (`visible = false`), DELETE politike v bazi ni. Slike v Storage se ob zamenjavi brišejo.
`izpolnjeno`, `ima_odstopanje`, `cas_zakljucka` in odstopanja izračuna baza (triggerji), zato je logika na enem mestu.

## Navodila za postavitev

### 1. Supabase projekt
1. Na https://supabase.com ustvari nov projekt (regija: **Central EU (Frankfurt)**).
2. Odpri **SQL Editor** → New query → prilepi celotno vsebino `supabase/migrations/001_schema.sql` → **Run**.
3. Nova query → prilepi `supabase/seed.sql` → **Run** (testni podatki).
4. Preveri v **Table Editor**, da so tabele `fp_...` napolnjene, in v **Storage**, da obstaja bucket `fp-rutina-slike`.
5. **Project Settings → API keys**: kopiraj *Project URL* in *Publishable key* (ali *anon* key).

### 2. Lokalni zagon
1. Kopiraj `.env.example` v `.env.local` in vpiši URL in ključ iz koraka 1.5.
2. `npm install`
3. `npm run dev` → odpri http://localhost:3000

### 3. GitHub
```
git add .
git commit -m "Fines - Production 1.01"
git push origin main
```

### 4. Vercel
1. https://vercel.com → **Add New → Project** → izberi GitHub repo `FINES_Production`.
2. Framework: Next.js (zazna samodejno), Root directory: `/`.
3. **Environment Variables**: dodaj `NEXT_PUBLIC_SUPABASE_URL` in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. **Deploy**. Vsak nadaljnji `git push` na `main` samodejno posodobi aplikacijo.

## Verzije
Vsaka sprememba se vpiše v `src/lib/changelog.ts` (prikaže se v "i" popupu desno zgoraj).
Male spremembe: 1.01 → 1.02. Večje spremembe / nova funkcija / podstran: → 2.01.
