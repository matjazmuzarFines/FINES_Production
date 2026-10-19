"use client";

import { useMemo, useState, type ReactNode } from "react";
import { aktivniOddelki, nazivTeme, type Oddelek } from "@/lib/auditSifranti";
import { POMEMBNOST, RESNOST, VRSTA, VRSTE, jeAkcija, odprta, pomenAkcije, type Audit, type AuditAkcija } from "@/lib/auditi";
import { addDays, formatShort, fromIso, isoWeek, mondayOf, toIso, type IsoDate } from "@/lib/dates";
import { formatEur } from "@/lib/produktivnost";
import { formatNum } from "@/lib/stevila";
import { FilterPreklopnik } from "@/components/ui/Filtri";
import { BARVE_SERIJ, GrafLinija } from "@/components/ui/GrafLinija";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { KpiKartica } from "@/components/produktivnost/ProduktivnostPregled";
import { AuditAkcijeTabela } from "./AuditAkcije";
import { OddelekOznaka } from "./AuditOznake";
import { useSifranti } from "./Sifranti";

type Obdobje = "13" | "26" | "52";

const datumIz = (ts: string) => toIso(new Date(ts));
const dniMed = (od: IsoDate, doo: IsoDate) => Math.round((fromIso(doo).getTime() - fromIso(od).getTime()) / 86400000);
const fmtPct = (n: number) => `${formatNum(Math.round(n))} %`;
const kSkrajsano = (n: number) => (Math.abs(n) >= 1000 ? `${formatNum(Math.round(n / 100) / 10)}k` : String(Math.round(n)));

/** Kdaj je bila akcija zaprta (izvedena, preverjena ali opuščena); null = odprta. */
function zaprta(a: AuditAkcija): IsoDate | null {
  if (a.status === "IZVEDENO" || a.status === "PREVERJENO") return a.zakljuceno ?? datumIz(a.updated_at);
  if (a.status === "OPUSCENO") return datumIz(a.updated_at);
  return null;
}
const odprtaNaDan = (a: AuditAkcija, d: IsoDate) => {
  if (!jeAkcija(a) || datumIz(a.created_at) > d) return false;
  const z = zaprta(a);
  return !z || z > d;
};
const zamujaNaDan = (a: AuditAkcija, d: IsoDate) => odprtaNaDan(a, d) && !!a.rok && a.rok < d;
/** Zaprta z ukrepom (brez opuščenih in brez rešenih na mestu - te bi KPI olepšale). */
const zaprtaZUkrepom = (a: AuditAkcija) => jeAkcija(a) && (a.status === "IZVEDENO" || a.status === "PREVERJENO") && !a.reseno_na_mestu;

/**
 * KPI auditov: doslednost (auditi na teden), zamujene akcije,
 * pravočasnost zapiranja in ocenjen prihranek; pod njimi pregledi za odločanje.
 */
export function AuditKpi({
  auditi,
  akcije,
  izbraniOddelki,
  onOdpri,
}: {
  auditi: Audit[];
  akcije: AuditAkcija[];
  /** Kode izbranih oddelkov (prazno = vsi). */
  izbraniOddelki: Set<string>;
  onOdpri: (a: AuditAkcija) => void;
}) {
  const { s } = useSifranti();
  const n = s.nastavitve;
  const [obdobje, setObdobje] = useState<Obdobje>("13");
  const [celica, setCelica] = useState<{ r: number; p: number } | null>(null);
  const danes = toIso(new Date());

  const vOddelku = (k: string) => !izbraniOddelki.size || izbraniOddelki.has(k);
  const oddelki = aktivniOddelki(s).filter((o) => vOddelku(o.koda));
  const A = useMemo(() => auditi.filter((a) => !izbraniOddelki.size || izbraniOddelki.has(a.oddelek)), [auditi, izbraniOddelki]);
  const K = useMemo(() => akcije.filter((a) => !izbraniOddelki.size || izbraniOddelki.has(a.oddelek)), [akcije, izbraniOddelki]);

  const N = Number(obdobje);
  const tedni = useMemo(() => Array.from({ length: N }, (_, i) => addDays(mondayOf(danes), -7 * (N - 1 - i))), [N, danes]);
  const zacetek = tedni[0];
  const konec = (t: IsoDate) => (addDays(t, 6) < danes ? addDays(t, 6) : danes);
  const xOznake = tedni.map((t) => `T${isoWeek(t)}`);
  const opisi = tedni.map((t) => `${formatShort(t)} - ${formatShort(addDays(t, 6))}`);

  // KPI 1: auditi na teden
  const naTeden = tedni.map((t) => A.filter((a) => a.datum >= t && a.datum <= addDays(t, 6)).length);
  const povpTeden = naTeden.reduce((x, y) => x + y, 0) / N;

  // KPI 3: odprte in zamujene akcije
  const odprte = tedni.map((t) => K.filter((a) => odprtaNaDan(a, konec(t))).length);
  const zamujene = tedni.map((t) => K.filter((a) => zamujaNaDan(a, konec(t))).length);
  const odprteZdaj = K.filter((a) => odprtaNaDan(a, danes));
  const zamujeneZdaj = odprteZdaj.filter((a) => a.rok && a.rok < danes).length;

  // KPI 4: pravočasno zaprte (kumulativno od začetka obdobja)
  const zaprteVObdobju = K.filter((a) => zaprtaZUkrepom(a) && (zaprta(a) ?? "") >= zacetek);
  const pravocasno = tedni.map((t) => {
    const sez = zaprteVObdobju.filter((a) => a.rok && zaprta(a)! <= konec(t));
    return sez.length ? Math.round((sez.filter((a) => zaprta(a)! <= a.rok!).length / sez.length) * 100) : null;
  });
  const zRokom = zaprteVObdobju.filter((a) => a.rok);
  const pravocasnoPct = zRokom.length ? (zRokom.filter((a) => zaprta(a)! <= a.rok!).length / zRokom.length) * 100 : null;
  const povpDni = zaprteVObdobju.length ? zaprteVObdobju.reduce((x, a) => x + Math.max(0, dniMed(datumIz(a.created_at), zaprta(a)!)), 0) / zaprteVObdobju.length : null;

  // KPI 5: ocenjen prihranek izvedenih akcij (kumulativno)
  const prihranek = tedni.map((t) => zaprteVObdobju.filter((a) => zaprta(a)! <= konec(t)).reduce((x, a) => x + (a.prihranek_eur ?? 0), 0));
  const prihranekSkupaj = prihranek[prihranek.length - 1] ?? 0;
  const vlozeno = zaprteVObdobju.reduce((x, a) => x + (a.strosek_eur ?? 0), 0);
  const potencial = odprteZdaj.reduce((x, a) => x + (a.prihranek_eur ?? 0), 0);

  // ugotovitve obdobja (po datumu audita)
  const ugotovitve = K.filter((a) => a.datum >= zacetek);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterPreklopnik
          label="Obdobje"
          value={obdobje}
          onChange={setObdobje}
          options={[
            { value: "13", label: "13 tednov", hint: "Zadnje četrtletje" },
            { value: "26", label: "26 tednov", hint: "Zadnje pol leta" },
            { value: "52", label: "52 tednov", hint: "Zadnje leto" },
          ]}
        />
        <p className="pb-2 text-xs text-ink-500">
          {formatShort(zacetek)} - {formatShort(danes)} · {A.filter((a) => a.datum >= zacetek).length} auditov · {ugotovitve.length} ugotovitev
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiKartica
          st={1}
          barva={BARVE_SERIJ.oranzna}
          naslov="Auditi na teden"
          geslo="Doslednost - vodstvo je redno na terenu"
          vrednost={formatNum(Math.round(povpTeden * 10) / 10)}
          podvrednost={`cilj ${formatNum(n.ciljAuditovTeden)} / teden`}
          napredek={n.ciljAuditovTeden ? povpTeden / n.ciljAuditovTeden : null}
          spodaj={<>Povprečno število auditov na teden v obdobju. Ta teden: {naTeden[naTeden.length - 1]}.</>}
        >
          <GrafLinija kompakten visina={120} naziv="Auditi na teden" serije={[{ naziv: "Auditi", barva: BARVE_SERIJ.oranzna, vrednosti: naTeden }]} xOznake={xOznake} opisi={opisi} cilj={n.ciljAuditovTeden} format={(v) => formatNum(v)} />
        </KpiKartica>
        <KpiKartica
          st={2}
          barva={BARVE_SERIJ.rdeca}
          naslov="Zamujene akcije"
          geslo="Odprte akcije s preteklim rokom"
          vrednost={String(zamujeneZdaj)}
          podvrednost={`od ${odprteZdaj.length} odprtih`}
          napredek={odprteZdaj.length ? 1 - zamujeneZdaj / odprteZdaj.length : 1}
          spodaj={<>Cilj 0. Pas pokaže delež odprtih akcij, ki so še v roku.</>}
        >
          <GrafLinija kompakten visina={120} naziv="Zamujene akcije" serije={[{ naziv: "Zamujene", barva: BARVE_SERIJ.rdeca, vrednosti: zamujene }]} xOznake={xOznake} opisi={opisi} cilj={0} format={(v) => formatNum(v)} />
        </KpiKartica>
        <KpiKartica
          st={3}
          barva={BARVE_SERIJ.zelena}
          naslov="Pravočasno zaprte"
          geslo="Akcije, zaprte do roka (brez rešenih na mestu)"
          vrednost={pravocasnoPct === null ? "-" : fmtPct(pravocasnoPct)}
          podvrednost={povpDni === null ? "ni zaprtih" : `povp. ${formatNum(Math.round(povpDni))} dni`}
          napredek={pravocasnoPct === null ? null : pravocasnoPct / n.ciljPravocasnoPct}
          spodaj={<>Cilj {formatNum(n.ciljPravocasnoPct)} %. Zaprtih z ukrepom: {zaprteVObdobju.length}, povprečno dni od ugotovitve do zaprtja.</>}
        >
          <GrafLinija kompakten visina={120} naziv="Pravočasno zaprte" serije={[{ naziv: "Pravočasno", barva: BARVE_SERIJ.zelena, vrednosti: pravocasno }]} xOznake={xOznake} opisi={opisi} cilj={n.ciljPravocasnoPct} format={fmtPct} />
        </KpiKartica>
        <KpiKartica
          st={4}
          barva={BARVE_SERIJ.vijolicna}
          naslov="Ocenjen prihranek"
          geslo="Izvedene akcije (€ na leto, ocena vodje)"
          vrednost={formatEur(prihranekSkupaj)}
          podvrednost={vlozeno ? `vloženo ${formatEur(vlozeno)}` : "brez vložka"}
          napredek={null}
          spodaj={
            <>
              {vlozeno && prihranekSkupaj ? <>Povračilo v {formatNum(Math.round((vlozeno / prihranekSkupaj) * 120) / 10)} mes. </> : null}
              Potencial odprtih akcij: {formatEur(potencial)} / leto.
            </>
          }
        >
          <GrafLinija kompakten visina={120} naziv="Ocenjen prihranek" serije={[{ naziv: "Prihranek", barva: BARVE_SERIJ.vijolicna, vrednosti: prihranek }]} xOznake={xOznake} opisi={opisi} format={formatEur} formatTocka={kSkrajsano} />
        </KpiKartica>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Kartica naslov="Odprte in zamujene akcije po tednih" opis="Ali se seznam akcij zmanjšuje? Stanje na konec vsakega tedna (brez dobrih praks).">
          <GrafLinija
            naziv="Odprte in zamujene akcije"
            visina={220}
            serije={[
              { naziv: "Odprte", barva: BARVE_SERIJ.modra, vrednosti: odprte },
              { naziv: "Zamujene", barva: BARVE_SERIJ.rdeca, vrednosti: zamujene },
            ]}
            xOznake={xOznake}
            opisi={opisi}
            format={(v) => formatNum(v)}
          />
        </Kartica>
        <Kartica naslov="Ugotovitve po oddelku in vrsti" opis="Kje najdemo največ in kakšne. Dobre prakse pokažejo, da audit ni iskanje krivcev.">
          <UgotovitveOddelkov oddelki={oddelki} ugotovitve={ugotovitve} />
        </Kartica>
        <Kartica naslov="Matrika pomena odprtih akcij" opis="Velikost napake × pomembnost. Zgoraj desno = najprej. Klik na polje pokaže akcije.">
          <MatrikaPomena akcije={odprteZdaj} izbrana={celica} onIzberi={setCelica} />
        </Kartica>
        <Kartica naslov="Najpogostejše teme ugotovitev" opis="Teme z največ ugotovitvami v obdobju (brez dobrih praks) - kje je sistemska težava.">
          <TemeUgotovitev ugotovitve={ugotovitve.filter(jeAkcija)} />
        </Kartica>
      </div>

      {celica && (
        <Kartica naslov={`Akcije: velikost napake ${celica.r} × pomembnost ${celica.p}`} opis="Odprte akcije izbranega polja matrike.">
          <AuditAkcijeTabela
            skupine={[{ naslov: "Izbrano polje", opis: "", akcije: odprteZdaj.filter((a) => (a.resnost ?? 0) === celica.r && (a.pomembnost ?? 0) === celica.p) }]}
            danes={danes}
            onOdpri={onOdpri}
            prazno="Ni akcij v tem polju."
          />
        </Kartica>
      )}

      <Kartica naslov="Najpomembnejše odprte akcije" opis="Po pomenu (velikost × pomembnost), nato po roku. Na teh mora biti fokus vodstva.">
        <AuditAkcijeTabela
          skupine={[
            {
              naslov: "Top 10",
              opis: "",
              akcije: [...odprteZdaj]
                .sort((a, b) => (pomenAkcije(b) ?? 0) - (pomenAkcije(a) ?? 0) || (a.rok ?? "9").localeCompare(b.rok ?? "9"))
                .slice(0, 10),
            },
          ]}
          danes={danes}
          onOdpri={onOdpri}
          prazno="Ni odprtih akcij."
        />
      </Kartica>

      <Kartica naslov="Akcije po odgovornih" opis="Kdo ima največ odprtih in zamujenih akcij ter kako pravočasno jih zapira.">
        <OdgovorniTabela akcije={K} zacetek={zacetek} danes={danes} />
      </Kartica>
    </div>
  );
}

function Kartica({ naslov, opis, children }: { naslov: string; opis: string; children: ReactNode }) {
  return (
    <section className="fp-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div>
        <h3 className="text-base font-bold text-ink-900">{naslov}</h3>
        <p className="text-xs text-ink-500">{opis}</p>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------
// Ugotovitve po oddelku in vrsti - vodoravni naloženi stolpci
// ---------------------------------------------------------------------

function UgotovitveOddelkov({ oddelki, ugotovitve }: { oddelki: Oddelek[]; ugotovitve: AuditAkcija[] }) {
  const vrstice = oddelki
    .map((o) => {
      const sez = ugotovitve.filter((a) => a.oddelek === o.koda);
      return { o, skupaj: sez.length, deli: VRSTE.map((v) => ({ v, n: sez.filter((a) => a.vrsta === v).length })) };
    })
    .sort((a, b) => b.skupaj - a.skupaj);
  const maks = Math.max(1, ...vrstice.map((v) => v.skupaj));
  if (!ugotovitve.length) return <p className="py-6 text-center text-sm text-ink-500">Ni ugotovitev v obdobju.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-700" aria-label="Legenda vrst">
        {VRSTE.map((v) => (
          <li key={v} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: VRSTA[v].barva }} />
            {VRSTA[v].kratko}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        {vrstice.map(({ o, skupaj, deli }) => (
          <div key={o.koda} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_2.5rem]">
            <span className="truncate text-ink-700" title={o.naziv}>
              {o.naziv}
            </span>
            <div className="flex h-6 gap-0.5" style={{ width: `${(skupaj / maks) * 100}%` }}>
              {deli
                .filter((d) => d.n)
                .map((d, i, arr) => (
                  <div
                    key={d.v}
                    title={`${o.naziv} · ${VRSTA[d.v].kratko}: ${d.n}`}
                    className={`flex items-center justify-center text-[11px] font-bold text-white ${i === 0 ? "rounded-l" : ""} ${i === arr.length - 1 ? "rounded-r" : ""}`}
                    style={{ flexGrow: d.n, flexBasis: 0, background: VRSTA[d.v].barva }}
                  >
                    {d.n / maks >= 0.08 ? d.n : ""}
                  </div>
                ))}
            </div>
            <span className="text-right font-semibold tabular-nums text-ink-800">{skupaj}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Matrika pomena (velikost napake × pomembnost)
// ---------------------------------------------------------------------

/** Zaporedna lestvica ene barve (oranžna Fines): svetlo = malo, temno = veliko. */
const STOPNJE = ["bg-fines-50 text-ink-800", "bg-fines-100 text-ink-900", "bg-fines-200 text-ink-900", "bg-fines-500 text-white", "bg-fines-700 text-white"];

function MatrikaPomena({
  akcije,
  izbrana,
  onIzberi,
}: {
  akcije: AuditAkcija[];
  izbrana: { r: number; p: number } | null;
  onIzberi: (c: { r: number; p: number } | null) => void;
}) {
  const ocenjene = akcije.filter((a) => a.resnost && a.pomembnost);
  const st = (r: number, p: number) => ocenjene.filter((a) => a.resnost === r && a.pomembnost === p).length;
  const maks = Math.max(1, ...[1, 2, 3, 4, 5].flatMap((r) => [1, 2, 3, 4, 5].map((p) => st(r, p))));
  const brez = akcije.length - ocenjene.length;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] gap-1 text-xs">
        {[5, 4, 3, 2, 1].map((r) => (
          <div key={r} className="contents">
            <span className="flex items-center justify-center font-bold text-ink-600" title={RESNOST[r - 1].opis}>
              {r}
            </span>
            {[1, 2, 3, 4, 5].map((p) => {
              const n = st(r, p);
              const cls = n ? STOPNJE[Math.min(4, Math.floor((n / maks) * 4.999))] : "bg-ink-50 text-ink-300";
              const jeIzbrana = izbrana?.r === r && izbrana.p === p;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={!n}
                  title={`Velikost ${r} (${RESNOST[r - 1].opis}) × pomembnost ${p} (${POMEMBNOST[p - 1].opis}): ${n} akcij`}
                  onClick={() => onIzberi(jeIzbrana ? null : { r, p })}
                  className={`flex h-11 items-center justify-center rounded-md text-sm font-bold tabular-nums ${cls} ${r * p >= 15 ? "ring-1 ring-inset ring-fines-600/40" : ""} ${
                    jeIzbrana ? "outline outline-2 outline-offset-1 outline-ink-900" : ""
                  } disabled:cursor-default`}
                >
                  {n || "·"}
                </button>
              );
            })}
          </div>
        ))}
        <span />
        {[1, 2, 3, 4, 5].map((p) => (
          <span key={p} className="text-center font-bold text-ink-600" title={POMEMBNOST[p - 1].opis}>
            {p}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-500">
        <span>↑ velikost napake · → pomembnost · obrobljeno = pomen ≥ 15</span>
        {brez > 0 && <span className="font-semibold text-warn-700">Neocenjenih odprtih akcij: {brez}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Najpogostejše teme
// ---------------------------------------------------------------------

function TemeUgotovitev({ ugotovitve }: { ugotovitve: AuditAkcija[] }) {
  const { s } = useSifranti();
  const stevec = new Map<string, { naziv: string; oddelek: string; n: number }>();
  for (const a of ugotovitve) {
    const k = `${a.oddelek}:${a.kategorija ?? ""}`;
    const x = stevec.get(k) ?? { naziv: a.kategorija ? nazivTeme(s, a.oddelek, a.kategorija) || a.kategorija : "Brez teme", oddelek: a.oddelek, n: 0 };
    x.n++;
    stevec.set(k, x);
  }
  const top = [...stevec.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  const maks = Math.max(1, ...top.map((t) => t.n));
  if (!top.length) return <p className="py-6 text-center text-sm text-ink-500">Ni ugotovitev v obdobju.</p>;
  return (
    <div className="flex flex-col gap-2">
      {top.map((t) => (
        <div key={`${t.oddelek}${t.naziv}`} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] items-center gap-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate text-ink-800" title={t.naziv}>
              {t.naziv}
            </span>
            <span className="block truncate text-[11px] text-ink-500">
              <OddelekOznaka koda={t.oddelek} />
            </span>
          </span>
          <div className="h-5 rounded bg-fines-500" style={{ width: `${(t.n / maks) * 100}%` }} title={`${t.naziv}: ${t.n} ugotovitev`} />
          <span className="text-right font-semibold tabular-nums text-ink-800">{t.n}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tabele
// ---------------------------------------------------------------------

type VrsticaOdgovornega = { ime: string; odprte: number; zamuja: number; zaprte: number; pravocasno: number | null; povpDni: number | null };

function OdgovorniTabela({ akcije, zacetek, danes }: { akcije: AuditAkcija[]; zacetek: IsoDate; danes: IsoDate }) {
  const imena = [...new Set(akcije.filter(jeAkcija).map((a) => a.odgovoren?.trim() || "(brez odgovornega)"))];
  const vrstice: VrsticaOdgovornega[] = imena.map((ime) => {
    const sez = akcije.filter((a) => jeAkcija(a) && (a.odgovoren?.trim() || "(brez odgovornega)") === ime);
    const zaprte = sez.filter((a) => zaprtaZUkrepom(a) && (zaprta(a) ?? "") >= zacetek);
    const zRokom = zaprte.filter((a) => a.rok);
    return {
      ime,
      odprte: sez.filter(odprta).length,
      zamuja: sez.filter((a) => odprta(a) && a.rok && a.rok < danes).length,
      zaprte: zaprte.length,
      pravocasno: zRokom.length ? (zRokom.filter((a) => zaprta(a)! <= a.rok!).length / zRokom.length) * 100 : null,
      povpDni: zaprte.length ? zaprte.reduce((x, a) => x + Math.max(0, dniMed(datumIz(a.created_at), zaprta(a)!)), 0) / zaprte.length : null,
    };
  });
  const sort = useRazvrscanje({
    ime: (v: VrsticaOdgovornega) => v.ime,
    odprte: (v: VrsticaOdgovornega) => v.odprte,
    zamuja: (v: VrsticaOdgovornega) => v.zamuja,
    zaprte: (v: VrsticaOdgovornega) => v.zaprte,
    pravocasno: (v: VrsticaOdgovornega) => v.pravocasno,
    povpDni: (v: VrsticaOdgovornega) => v.povpDni,
  });
  const privzeto = [...vrstice].sort((a, b) => b.zamuja - a.zamuja || b.odprte - a.odprte);
  return (
    <TabelaOkvir>
      <table className="w-full text-sm">
        <thead className="fp-thead">
          <tr>
            <SortTh sort={sort} kljuc="ime" className="pl-3">Odgovoren</SortTh>
            <SortTh sort={sort} kljuc="odprte" desno>Odprte</SortTh>
            <SortTh sort={sort} kljuc="zamuja" desno>Zamuja</SortTh>
            <SortTh sort={sort} kljuc="zaprte" desno hint="Zaprte z ukrepom v obdobju">Zaprte</SortTh>
            <SortTh sort={sort} kljuc="pravocasno" desno hint="Delež zaprtih do roka">Pravočasno</SortTh>
            <SortTh sort={sort} kljuc="povpDni" desno className="pr-3" hint="Povprečno dni od ugotovitve do zaprtja">Povp. dni</SortTh>
          </tr>
        </thead>
        <tbody>
          {vrstice.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-ink-500">
                Ni akcij.
              </td>
            </tr>
          )}
          {sort.razvrsti(privzeto).map((v) => (
            <tr key={v.ime} className="border-b border-ink-100 hover:bg-ink-50">
              <td className="px-3 py-2 font-semibold text-ink-800">{v.ime}</td>
              <td className="px-2 py-2 text-right tabular-nums">{v.odprte}</td>
              <td className={`px-2 py-2 text-right tabular-nums ${v.zamuja ? "font-bold text-fines-600" : ""}`}>{v.zamuja}</td>
              <td className="px-2 py-2 text-right tabular-nums">{v.zaprte}</td>
              <td className="px-2 py-2 text-right tabular-nums">{v.pravocasno === null ? "-" : fmtPct(v.pravocasno)}</td>
              <td className="px-2 py-2 pr-3 text-right tabular-nums">{v.povpDni === null ? "-" : formatNum(Math.round(v.povpDni))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabelaOkvir>
  );
}
