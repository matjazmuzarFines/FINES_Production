# Auditi v proizvodnji: teoretična podlaga za modul "Auditi"

Namen: določiti, katere komponente vključiti v modul **Management → Auditi** in zakaj.
Izhodišče je obstoječi Gemba walk (Produktivnost): tedenski obhod, zapisnik, akcije z odgovornim in rokom, priloge, PDF in e-mail, KPI grafi.
Audit je od Gemba walka **bolj strukturiran**: vnaprej določena vprašanja, točkovanje, razvrstitev ugotovitev in obvezno zaprta zanka ukrepov.

> Standardi (VDA, AIAG CQI-8, ISO 19011, ISO 9001, ISO 45001) niso javno dostopni. Povzetek temelji na sekundarnih virih (seznam na koncu). Točke z oznako **(preveri)** je treba preveriti v originalnem standardu, preden jih uporabimo za certifikacijo.

## 1. Gemba walk ali audit

| | Gemba walk | Audit |
|---|---|---|
| Namen | opazovanje, pogovor, iskanje izboljšav | preverjanje skladnosti s standardom |
| Vprašanja | odprta, vodnik | zaprta, vnaprej določena kontrolna lista |
| Rezultat | zapisnik in akcije | **ocena (%)**, ugotovitve po razredih, ukrepi |
| Primerljivost | težka | rezultat je primerljiv po času, področjih in auditorjih |
| Plan | tedenski termin | program: tip × področje × pogostost × auditor |

Zato audit potrebuje tri stvari, ki jih Gemba nima: **predloge vprašanj**, **točkovanje** in **plan auditov**.

## 2. Vrste auditov, ki pridejo v poštev za FINES

### 2.1 5S audit (prioriteta)
- Ocena za vsak S posebej: Sortiraj, Sistematiziraj, Svetli (čisti), Standardiziraj, Vzdržuj.
- Približno 4-5 vprašanj na S (20-25 skupaj), 15-30 minut na področje.
- Lestvica 1-5 z opisom vsake stopnje, kar se ujema z našim standardom (opis desno od lestvice).
- Prikaz z **radarskim diagramom**, ki pokaže trenutno in ciljno stanje ter kateri S zaostaja. Realen cilj v prvem letu je okrog 3,0-3,5.
- Za vsak S z oceno pod ciljem se odpre ukrep.

### 2.2 Večnivojski procesni audit (LPA, AIAG CQI-8)
- Preverja **vhode v proces**: ali se upošteva standardno delo, nastavitve, kontrole in OVO. Rezultat izdelka ni predmet tega audita.
- Raven 1 je vodja izmene ali delovodja (dnevno oz. vsako izmeno), raven 2 vodja oddelka ali inženir (tedensko), raven 3 vodja proizvodnje ali direktor (mesečno).
- **Kratek:** 3-10 vprašanj, pod 15 minut. Vprašanja so objektivna (DA/NE) in konkretna, z navedeno toleranco ali predpisom.
- Vprašanja izhajajo iz reklamacij, PFMEA in preteklih ugotovitev. Tista, ki so vedno OK, se zamenjajo.
- Naprednejša izvedba izbira vprašanja naključno iz banke vprašanj za delovno mesto, auditorji pa rotirajo.

### 2.3 Varnostni audit (BOZ, ISO 45001)
- Tipične teme so zaščite strojev, OVO, kemikalije, zasilni izhodi in gasilniki, izklop in zaklepanje (LOTO), varjenje (vroča dela), elektrika, viličarji in regali.
- Vsaka neskladnost ima odgovornega in rok.

### 2.4 Notranja presoja ISO 9001 (točka 9.2, ISO 19011)
- Zahteva **program presoj** (pogostost, metode, odgovornosti, poročanje) glede na pomembnost procesov in rezultate prejšnjih presoj.
- **Neodvisnost:** nihče ne presoja lastnega dela.
- Potek je program → plan presoje → kontrolna lista → dokazi → ugotovitve → poročilo → spremljanje.
- Hranijo se zapisi kot dokaz, kar je pomembno za zunanjo presojo.

### 2.5 Produktni audit (po vzoru VDA 6.5)
- Preverja končni izdelek z očmi kupca: zvari, robovi, površina, mere, tablica, embalaža. Vzorec se vzame iz skladišča pred odpremo.
- Napake so razvrščene po resnosti (A kritična, B večja, C manjša) in utežene. Kazalnik je QKZ, delež skladnosti (formula: preveri).

### 2.6 Procesni audit VDA 6.3 (samo, če ga zahteva kupec)
- Elementi P1-P7, jedro je P6 serijska proizvodnja. Točke so samo 10 / 8 / 6 / 4 / 0.
- Razredi: A ≥ 90 %, B 80-90 %, C < 80 % (preveri).
- **Pravila znižanja:** ena ničla pri ključnem vprašanju (*) zniža oceno ne glede na povprečje (preveri).
- Za FINES verjetno ni nujen, nam pa da idejo za **ključna vprašanja** in pravila znižanja, ki jih lahko uporabimo pri vseh tipih.

### 2.7 Audit standardnega dela vodij in TPM
- Preverja, ali vodje izvajajo dnevno rutino in ali operaterji izpolnjujejo kontrolne liste avtonomnega vzdrževanja (čiščenje, mazanje, pregled).
- Ta tip se lahko neposredno navezuje na obstoječo **Rutino vodij** v aplikaciji.

## 3. Življenjski cikel audita = komponente modula

1. **Program in plan auditov.** Določi, kaj se presoja (tip, predloga), kje (področje ali oddelek), kako pogosto in kdo.
   - Zakaj: brez plana ni KPI izpolnjevanja plana in pokritosti področij.
   - Pomemben je kazalnik **"dni od zadnjega audita"** za vsako področje. Samo štetje auditov ne pokaže, katero področje je ostalo nepregledano.
2. **Predloge (kontrolne liste)** s sekcijami in vprašanji, **verzionirane**.
   - Zakaj: rezultati so primerljivi le pri istih vprašanjih. Izveden audit hrani verzijo predloge, po kateri je bil narejen, zato sprememba predloge ne spremeni zgodovine.
3. **Tipi odgovorov:** DA / NE / N/A, lestvica 1-5 z opisom, število z mejama (samodejno OK/NOK) in besedilo.
   - Zakaj: s temi tipi pokrijemo 5S, LPA, BOZ in ISO brez posebne kode za vsak tip.
4. **Atributi vprašanja:** utež, **ključno vprašanje**, obvezna slika pri NOK, navodilo in referenčna slika "tako je prav".
   - Zakaj: utež in ključno vprašanje omogočata smiseln rezultat, referenčna slika pa poenoti presojo različnih auditorjev.
5. **Izvedba na telefonu ali tablici:** velike tipke, komentar in slike pri vprašanju, zapis začetka in konca ter shranjevanje osnutka.
   - Zakaj: dokazi nastanejo na mestu. Trajanje razkrije odkljukavanje brez dejanskega pregleda (pencil-whipping). V hali je Wi-Fi slab, zato potrebujemo vsaj lokalni osnutek.
6. **Točkovanje:** % = Σ(točke × utež) / maksimum, brez N/A. Delni rezultati po sekcijah, nato razred A/B/C in pravila znižanja.
   - Zakaj: to je bistvena razlika od Gemba walka, ker iz številke nastaneta trend in primerjava.
7. **Ugotovitve z razvrstitvijo:** večja neskladnost, manjša neskladnost, opažanje, priložnost za izboljšavo (OFI) in **dobra praksa**.
   - Zakaj: tako določimo prioriteto in sledimo ISO 19011. Dobra praksa poskrbi, da audit ni iskanje krivcev.
8. **Ukrepi:**
   - **takojšnji** (popravi na mestu, ustavi, loči) in **korektivni** (vzrok, npr. 5 Why, pri večjih neskladnostih 8D),
   - odgovorni, rok, status in dokaz izvedbe,
   - pozneje še preverjanje učinkovitosti (druga oseba, čez npr. 30 dni).
   - Zakaj: audit brez zaprte zanke je izguba časa. Obstoječe akcije iz Gemba walka lahko ponovno uporabimo.
9. **Poročilo PDF in e-mail** (enak vzorec kot pri Gembi): rezultat, sekcije, ugotovitve s slikami, ukrepi in poziv odgovornim.
10. **KPI-ji** (dovolj jih je 5-8):
    - izpolnjevanje plana (%),
    - povprečni rezultat in trend po področjih,
    - odprti in zapadli ukrepi,
    - čas do zaprtja ukrepa,
    - delež ponavljajočih se ugotovitev,
    - dni od zadnjega audita na področje.
11. **Analize:**
    - toplotni zemljevid (področje × sekcija ali vprašanje),
    - Pareto najpogosteje padlih vprašanj,
    - radar pri 5S.
    - Zakaj: pokažejo sistemske težave, ki jih posamezen audit ne razkrije.
12. **Neodvisnost:** opozorilo, ko je auditor odgovoren za področje, ki ga presoja (ISO 9001 9.2.2).
13. **Eskalacija:**
    - zamujen audit gre po X dneh nadrejenemu,
    - zapadel ukrep gre vodji,
    - ocena C ali večja neskladnost gre takoj vodji kakovosti oziroma direktorju.
14. **Kompetence auditorjev:** kdo je usposobljen za kateri tip audita. To je dokaz na zunanji presoji.

## 4. Dobre prakse in pasti

**Dobre prakse**
- Audit naj bo kratek: LPA ima največ 10 vprašanj in traja do 15 minut, 5S ima 20-25 vprašanj.
- Vprašanja naj bodo objektivna in preverljiva. Pri ključnih vprašanjih je obvezna slika.
- Auditorji rotirajo, presojajo tudi ljudje iz drugih oddelkov ("sveže oči").
- Podatke pregledamo sproti, na tedenskem sestanku, ne po mesecu dni.
- Vsak NOK dobi ukrep in vsak ukrep se preveri.

**Pasti**
- **Pencil-whipping** (odkljukaš brez pregleda): prepoznamo ga po prekratkem trajanju in auditorjih, ki imajo vedno 100 %.
- **Buddy-passing:** sodelavca drug drugemu podpisujeta audite.
- Predolge liste, zastarela vprašanja in seznam kot bergla. Proti zadnjemu pomaga prosto polje "drugo opaženo".
- Ni sledenja ukrepom.
- Štetje auditov namesto pokritosti področij.
- Iskanje krivcev namesto iskanja vzrokov.

## 5. Kaj ponuja programska oprema na trgu
- **SafetyCulture (iAuditor):**
  - urejevalnik predlog s pogojno logiko,
  - točkovanje in uteži,
  - delo brez povezave, slike, podpis,
  - korektivni ukrepi z obvestili,
  - nadzorne plošče in PDF.
- **Ease.io, Omnex:** LPA po ravneh, planer z naključno rotacijo, omejitev auditov na osebo, opomniki in eskalacija, naključna izbira vprašanj, delo brez povezave.
- **Mobile2b, Lumiform, Kapture:** predloge VDA 6.3 in 6.5, QKZ, predloge za 5S in TPM.

Vse imajo skupno jedro: **predloge, plan, izvedbo na telefonu, točkovanje, ukrepe, poročila in nadzorno ploščo**. To je tudi naš MVP.

## 6. Predlog komponent

### MVP (prva verzija)
| Komponenta | Zakaj |
|---|---|
| Predloge s sekcijami in vprašanji (verzija) | primerljivost rezultatov skozi čas |
| Tipi odgovorov DA/NE/N/A, 1-5 z opisom, število z mejo, besedilo | pokrijejo 5S, LPA, BOZ in ISO |
| Utež + ključno vprašanje, izračun % in razreda | strukturiran rezultat, razlika od Gembe |
| Plan auditov s koledarjem (kot koledar gemb) | izpolnjevanje plana in pokritost področij |
| Izvedba na telefonu: komentar in slike pri vprašanju, trajanje, osnutek | dokazi na mestu, zaščita pred odkljukavanjem |
| Ugotovitve z razvrstitvijo (večja NC / manjša NC / opažanje / OFI / dobra praksa) | prioriteta, ISO 19011 |
| Ukrepi (takojšnji / korektivni): odgovorni, rok, dokaz; ponovna uporaba akcij iz Gembe | zaprta zanka |
| PDF in e-mail poročilo | enak vzorec kot Gemba, takoj uporabno |
| KPI zavihek: izpolnjevanje plana, povprečni rezultat (`GrafLinija`), odprti in zapadli ukrepi | vodstveni pregled |
| Opozorilo za neodvisnost auditorja | ISO 9001 9.2.2 |
| Pripravljene predloge: 5S (radar), LPA, BOZ | vrednost takoj, brez dolgega nastavljanja |

### Kasneje
| Komponenta | Zakaj |
|---|---|
| LPA po ravneh z naključnimi vprašanji in rotacijo auditorjev | večja pokritost, odgovorov se ne da "naučiti na pamet" |
| Preverjanje učinkovitosti ukrepa (zamik, drug preverjevalec, ponovno odpri) | hitro zaprt ukrep še ni učinkovit ukrep |
| 5 Why / 8D na ugotovitvi | večje neskladnosti potrebujejo sistemsko rešitev |
| Toplotni zemljevid, Pareto padlih vprašanj, ponavljajoče se ugotovitve | sistemske težave |
| Produktni audit (razredi napak A/B/C, QKZ) | objektivna mera kakovosti izdelka |
| VDA 6.3 točkovanje (0/4/6/8/10) in pravila znižanja | samo, če zahteva kupec |
| Eskalacija in opomniki (e-mail, Teams) | zamujeni auditi in ukrepi ne obtičijo |
| Evidenca kompetenc auditorjev | dokaz na certifikacijski presoji |
| Delo brez povezave s sinhronizacijo (PWA) | slab Wi-Fi v hali in skladišču |
| Analiza sumljivih auditov (prekratko trajanje, vedno 100 %) | kakovost podatkov |
| Galerija dobrih praks | motivacija in prenos rešitev med področji |

## 7. Skica podatkovnega modela (predlog, prefiks `fp_aud_`)
- **fp_aud_tipi:** id, naziv (5S, LPA, BOZ, ISO 9001, Produktni, TPM, VDA 6.3), način točkovanja, pragovi razredov (json), visible.
- **fp_aud_predloge:** id, tip_id, naziv, verzija, status (osnutek / aktivna / arhiv), nadomesca_id, visible.
- **fp_aud_sekcije:** id, predloga_id, naziv (npr. "S1 Sortiraj"), vrstni_red, utez.
- **fp_aud_vprasanja:** id, sekcija_id, besedilo, navodilo, tip_odgovora, opisi_lestvice (json), min, max, enota, utez, kljucno, dovoli_na, slika_obvezna_pri_nok, referencna_slika, vrstni_red.
- **fp_aud_plan:** id, predloga_id, oddelek_id / delovno_mesto_id, raven, pogostost, auditor, aktivno.
- **fp_aud_auditi:** id, plan_id, predloga_id, verzija, oddelek_id, auditor, planiran_datum, zacetek, konec, status (planiran / v teku / zaključen / zamujen / preklican), rezultat_proc, razred, opombe.
- **fp_aud_odgovori:** id, audit_id, vprasanje_id, vrednost, na, ok, tocke, max_tock, komentar.
- **fp_aud_slike:** id, audit_id, odgovor_id, pot (slike se brišejo po pravilih za prostor).
- **fp_aud_ugotovitve:** id, audit_id, odgovor_id, razvrstitev, opis, tocka_standarda, ponovitev_od_id, status.
- **fp_aud_ukrepi** (ali skupna tabela z `fp_prod_akcije`): id, ugotovitev_id, vrsta (takojšnji / korektivni), opis, vzrok, odgovorni, rok, status, zaprto, dokaz, preverjanje_rok, preverjevalec, ucinkovit.
- Povezave po standardu: `ln_fp_...` (npr. vprašanje ↔ delovno mesto za naključno izbiro LPA).
- KPI-ji se izračunajo iz auditov, ugotovitev in ukrepov (view).

## 8. Odprta vprašanja za odločitev
1. S katerim tipom začnemo: 5S, LPA ali BOZ?
2. Kdo so auditorji (vodje, kakovost, direktor) in ali jih delimo po ravneh?
3. Področja: obstoječi oddelki in delovna mesta (`fp_oddelki`, `fp_delovna_mesta`) ali nov šifrant, ki vključuje tudi skladišče?
4. Ali so ukrepi iz auditov in gemb ena skupna tabela (en seznam odprtih akcij za vodjo)?
5. Ali potrebujemo zunanjo certifikacijo (ISO 9001, 45001)? To določi strogost zapisov in kompetenc.

## Viri
- Ease: CQI-8 principi, število LPA, dobre prakse, planiranje: ease.io/blog/core-principles-of-the-cqi-8-layered-process-audit-guideline/, ease.io/blog/how-many-layered-process-audits-should-you-be-doing/, ease.io/best-practices-in-creating-a-layered-process-audit-program, support.ease.io/hc/en-us/articles/32947947906836-Scheduling-on-EASE
- LPA vodnik: flowfuse.com/raw/blog/2026/08/layered-process-audit.md; Omnex: omnexsystems.com/products/layered-process-audits-software
- VDA 6.3: mobile2b.com/en/audits-inspections/vda-6-3-process-audit, certivo.com/frameworks/vda-6-3, elsmar.com (VDA 6.3 scoring guidelines)
- VDA 6.5: mobile2b.com/en/audits-inspections/vda-6-5-product-audit, kapture.io (VDA product audits)
- 5S: learnleansigma.com/?p=9671, weeversoftware.com/blog/best-practices-for-creating-a-5s-audit-checklist
- ISO 9001 9.2 in ISO 19011: blog.auditortrainingonline.com/blog/iso-9001-clause-9.2-internal-audit, blog.johner-institute.com/regulatory-affairs/iso-19011/, open-exam-prep.com (findings), community.advisera.com/topic/audit-findings-and-definitions/
- BOZ/EHS: oxmaint.com (monthly safety audit), sdsmanager.com (EHS audit checklist)
- TPM / LSW: lumiformapp.com/templates/tpm-audit-checklist_34056, public-library.safetyculture.io (asset care LSW)
- Pasti: goaudits.com/blog/pencil-whipping-box-checking/, fabrico.io/blog/pencil-whipping-maintenance-data-integrity
- KPI: hyperbots.com/glossary/internal-audit-metrics, eduyush.com/blogs/cima/internal-audit-kpi
- Programska oprema: getapp.com.au (iAuditor vs GoAudits), ease.io/audit-types/lpas/
