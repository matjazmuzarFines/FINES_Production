"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChartLine, Download, ListChecks, Plus, Settings, ShieldCheck } from "lucide-react";
import { nazivOddelka, nazivTeme, oddelekPoKodi } from "@/lib/auditSifranti";
import {
  VRSTA,
  VRSTE,
  izvoziAkcijeXlsx,
  izvoziAuditeXlsx,
  jeAkcija,
  naloziAkcijeAuditov,
  naloziAudite,
  odprta,
  zamuja,
  type AkcijeAudita,
  type Audit,
  type AuditAkcija,
} from "@/lib/auditi";
import { formatShort, toIso } from "@/lib/dates";
import { ujemaIskanje } from "@/lib/iskanje";
import { Button } from "@/components/ui/Button";
import { FilterIskanje, FilterPolje, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ErrorText, Loading, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje, type Razvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { Zavihki } from "@/components/ui/Zavihki";
import { AuditAkcijaOkno, AuditAkcijeTabela, predlogiOdgovornih } from "./AuditAkcije";
import { AuditKpi } from "./AuditKpi";
import { OddelekOznaka } from "./AuditOznake";
import { useSifranti } from "./Sifranti";

const OSNOVA = "/management/auditi";

type Pogled = "AUDITI" | "AKCIJE" | "KPI";
type StatusFilter = "VSI" | "OSNUTEK" | "ZAKLJUCEN";
type AkcijeFilter = "ODPRTE" | "ZAMUJA" | "VSE";

const BREZ = { vse: 0, odprte: 0, zamuja: 0, dobre: 0 };

export function AuditiPregled() {
  const router = useRouter();
  const notify = useToast();
  const { s } = useSifranti();
  const [auditi, setAuditi] = useState<Audit[] | null>(null);
  const [akcije, setAkcije] = useState<AuditAkcija[]>([]);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [pogled, setPogled] = useState<Pogled>("AUDITI");
  const [iskanje, setIskanje] = useState("");
  const [oddelki, setOddelki] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFilter>("VSI");
  const [filterAkcij, setFilterAkcij] = useState<AkcijeFilter>("ODPRTE");
  const [vrste, setVrste] = useState<string[]>([]);
  const [akcija, setAkcija] = useState<AuditAkcija | null>(null);

  const nalozi = () =>
    Promise.all([naloziAudite(), naloziAkcijeAuditov()]).then(([a, k]) => {
      setAuditi(a);
      setAkcije(k);
    });

  useEffect(() => {
    let preklic = false;
    Promise.all([naloziAudite(), naloziAkcijeAuditov()])
      .then(([a, k]) => {
        if (preklic) return;
        setAuditi(a);
        setAkcije(k);
      })
      .catch((e) => {
        if (preklic) return;
        setNapaka(e.message);
        notify("error", `Napaka pri nalaganju auditov: ${e.message}`, 10000);
      });
    return () => {
      preklic = true;
    };
  }, [notify]);

  const danes = toIso(new Date());

  /** Akcije po auditu: vse (brez opuščenih in dobrih praks), odprte, zamujene, dobre prakse. */
  const poAuditu = useMemo(() => {
    const m = new Map<number, AkcijeAudita>();
    for (const a of akcije) {
      const x = m.get(a.audit_id) ?? { ...BREZ };
      if (!jeAkcija(a)) x.dobre++;
      else if (a.status !== "OPUSCENO") x.vse++;
      if (odprta(a)) x.odprte++;
      if (zamuja(a, danes)) x.zamuja++;
      m.set(a.audit_id, x);
    }
    return m;
  }, [akcije, danes]);
  const akcijeAudita = (a: Audit) => poAuditu.get(a.id) ?? BREZ;

  const sort = useRazvrscanje({
    datum: (a: Audit) => a.datum,
    oddelek: (a: Audit) => nazivOddelka(s, a.oddelek),
    tema: (a: Audit) => nazivTeme(s, a.oddelek, a.tema) || null,
    lokacija: (a: Audit) => a.lokacija,
    izvajalec: (a: Audit) => a.izvajalec,
    akcije: (a: Audit) => akcijeAudita(a).vse,
    odprte: (a: Audit) => akcijeAudita(a).odprte,
    status: (a: Audit) => (a.status === "ZAKLJUCEN" ? 2 : 1),
  });

  if (napaka && !auditi) return <ErrorText className="mx-auto max-w-xl">{napaka}</ErrorText>;
  if (!auditi) return <Loading />;

  const imenaOddelkov = s.oddelki.filter((o) => o.aktiven || auditi.some((a) => a.oddelek === o.koda)).map((o) => o.naziv);
  const izbraniOddelki = new Set(s.oddelki.filter((o) => oddelki.includes(o.naziv)).map((o) => o.koda));
  const vOddelku = (koda: string) => !izbraniOddelki.size || izbraniOddelki.has(koda);
  const izbraneVrste = new Set(VRSTE.filter((v) => vrste.includes(VRSTA[v].label)));

  const prikazani = auditi.filter(
    (a) =>
      vOddelku(a.oddelek) &&
      (status === "VSI" || a.status === status) &&
      ujemaIskanje(iskanje, [nazivOddelka(s, a.oddelek), nazivTeme(s, a.oddelek, a.tema), a.lokacija, a.izvajalec, a.udelezenci, a.zapisnik]),
  );
  const razvrsceni = sort.razvrsti(prikazani);

  const prikazaneAkcije = akcije.filter(
    (a) =>
      vOddelku(a.oddelek) &&
      (!izbraneVrste.size || izbraneVrste.has(a.vrsta)) &&
      (filterAkcij === "VSE" || (filterAkcij === "ODPRTE" ? odprta(a) : zamuja(a, danes))) &&
      ujemaIskanje(iskanje, [nazivOddelka(s, a.oddelek), nazivTeme(s, a.oddelek, a.kategorija), VRSTA[a.vrsta].label, a.problem, a.ukrep, a.odgovoren, a.rezultat]),
  );
  const odprtih = akcije.filter(odprta).length;
  const zamujenih = akcije.filter((a) => zamuja(a, danes)).length;
  const odgovorni = akcija ? predlogiOdgovornih(akcije, akcija.oddelek, oddelekPoKodi(s, akcija.oddelek)?.vodja ?? "", "") : [];

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 pb-20 sm:pb-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Auditi</h2>
          <p className="text-sm text-ink-500">Gemba walki vodstva po oddelkih podjetja - ugotovitve, akcije, priloge in KPI.</p>
        </div>
        <Button hint="Uredi oddelke, teme, vprašanja in cilje" variant="neutral" icon={Settings} onClick={() => router.push(`${OSNOVA}/nastavitve`)}>
          Nastavitve
        </Button>
      </div>

      {!s.izBaze && (
        <WarningText>
          Nastavitve auditov (oddelki, teme, vprašanja) še niso v bazi - v Supabase zaženi migracijo <strong>016_auditi_nastavitve_ocena.sql</strong>. Do takrat veljajo privzete teme, nove ugotovitve pa se ne shranijo.
        </WarningText>
      )}

      <section className="flex flex-col">
        <Zavihki
          label="Pogled auditov"
          value={pogled}
          onChange={setPogled}
          zavihki={[
            { koda: "AUDITI", label: `Auditi (${auditi.length})`, hint: "Seznam izvedenih auditov", icon: ShieldCheck },
            { koda: "AKCIJE", label: `Akcije (${odprtih})`, hint: "Odprte akcije vseh auditov na enem mestu", icon: ListChecks },
            { koda: "KPI", label: "KPI", hint: "Kazalniki auditov in napredek", icon: ChartLine },
          ]}
        />
        <div className="fp-card flex flex-col gap-3 rounded-tl-none p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <FilterVrstica className="flex-1">
              {pogled !== "KPI" && (
                <FilterIskanje
                  value={iskanje}
                  onChange={setIskanje}
                  placeholder={pogled === "AUDITI" ? "Področje, izvajalec, zapisnik ..." : "Ugotovitev, ukrep, odgovoren ..."}
                  hint={pogled === "AUDITI" ? "Išči po področju, izvajalcu in zapisniku" : "Išči po ugotovitvi, ukrepu in odgovornem"}
                />
              )}
              <MultiSelect label="Oddelki" options={imenaOddelkov} value={oddelki} onChange={setOddelki} hint="Prikaži samo izbrane oddelke" />
              {pogled === "AUDITI" && (
                <FilterPreklopnik
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "VSI", label: "Vsi", hint: "Prikaži vse audite" },
                    { value: "OSNUTEK", label: "V delu", hint: "Samo nezaključeni auditi", stevilo: auditi.filter((a) => a.status === "OSNUTEK").length },
                    { value: "ZAKLJUCEN", label: "Zaključeni", hint: "Samo zaključeni auditi", stevilo: auditi.filter((a) => a.status === "ZAKLJUCEN").length },
                  ]}
                />
              )}
              {pogled === "AKCIJE" && (
                <>
                  <FilterPreklopnik
                    label="Akcije"
                    value={filterAkcij}
                    onChange={setFilterAkcij}
                    options={[
                      { value: "ODPRTE", label: "Odprte", hint: "Odprte akcije in akcije v delu", stevilo: odprtih },
                      { value: "ZAMUJA", label: "Zamuja", hint: "Samo akcije s preteklim rokom", stevilo: zamujenih },
                      { value: "VSE", label: "Vse", hint: "Tudi zaprte akcije in dobre prakse", stevilo: akcije.length },
                    ]}
                  />
                  <MultiSelect label="Vrsta" options={VRSTE.map((v) => VRSTA[v].label)} value={vrste} onChange={setVrste} hint="Prikaži samo izbrane vrste ugotovitev" />
                </>
              )}
            </FilterVrstica>
            {pogled !== "KPI" && (
              <div className="ml-auto flex flex-wrap items-end gap-3">
                <FilterPolje label="Izvoz">
                  <Button
                    hint={pogled === "AUDITI" ? "Izvozi prikazane audite v Excel" : "Izvozi prikazane akcije v Excel"}
                    variant="primary"
                    icon={Download}
                    disabled={pogled === "AUDITI" ? !razvrsceni.length : !prikazaneAkcije.length}
                    onClick={() =>
                      pogled === "AUDITI"
                        ? izvoziAuditeXlsx(s, razvrsceni, akcijeAudita, `auditi_${danes}.xlsx`)
                        : izvoziAkcijeXlsx(s, prikazaneAkcije, danes, `auditi_akcije_${danes}.xlsx`)
                    }
                  >
                    Excel
                  </Button>
                </FilterPolje>
                {pogled === "AUDITI" && (
                  <FilterPolje className="max-sm:hidden">
                    <Button hint="Odpri nov audit za izpolnjevanje" variant="success" icon={Plus} onClick={() => router.push(`${OSNOVA}/nov`)}>
                      Nov audit
                    </Button>
                  </FilterPolje>
                )}
              </div>
            )}
          </div>

          {pogled === "AUDITI" && <SeznamAuditov auditi={razvrsceni} vseh={auditi.length} sort={sort} akcijeAudita={akcijeAudita} onOdpri={(a) => router.push(`${OSNOVA}/${a.id}`)} />}

          {pogled === "AKCIJE" && (
            <>
              <p className="text-sm text-ink-500">
                {odprtih} odprtih{zamujenih ? ` · ${zamujenih} zamuja` : ""}. Klik na akcijo jo odpre.
              </p>
              <AuditAkcijeTabela
                skupine={s.oddelki
                  .map((o) => ({ naslov: o.naziv, opis: o.vodja ? `vodja ${o.vodja}` : o.opis, akcije: prikazaneAkcije.filter((a) => a.oddelek === o.koda) }))
                  .filter((g) => g.akcije.length)}
                danes={danes}
                onOdpri={setAkcija}
                prazno={akcije.length ? "Ni akcij za izbrane filtre." : "Ni akcij. Ugotovitve se dodajajo na auditu."}
              />
            </>
          )}

          {pogled === "KPI" && <AuditKpi auditi={auditi} akcije={akcije} izbraniOddelki={izbraniOddelki} onOdpri={setAkcija} />}
        </div>
      </section>

      {/* telefon: plavajoč gumb za nov audit */}
      <button
        type="button"
        title="Odpri nov audit za izpolnjevanje"
        aria-label="Nov audit"
        onClick={() => router.push(`${OSNOVA}/nov`)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-ok-500 px-5 text-base font-bold text-white shadow-lg hover:bg-ok-600 sm:hidden"
      >
        <Plus className="h-6 w-6" aria-hidden /> Nov audit
      </button>

      {akcija && (
        <AuditAkcijaOkno
          akcija={akcija}
          oddelek={akcija.oddelek}
          datumAudita={akcija.datum}
          odgovorni={odgovorni}
          pridobiAuditId={() => Promise.resolve(akcija.audit_id)}
          onClose={() => setAkcija(null)}
          onShranjeno={() => {
            setAkcija(null);
            nalozi().catch((e) => notify("error", e.message));
          }}
        />
      )}
    </div>
  );
}

type SortAuditov = Razvrscanje<Audit, "datum" | "oddelek" | "tema" | "lokacija" | "izvajalec" | "akcije" | "odprte" | "status">;

function StatusAudita({ a }: { a: Audit }) {
  const z = a.status === "ZAKLJUCEN";
  return (
    <span
      title={z ? "Audit je izveden in zapisnik zaključen" : "Zapisnik še ni zaključen"}
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${z ? "bg-ok-500 text-white" : "bg-warn-400 text-ink-900"}`}
    >
      {z ? "Zaključen" : "V delu"}
    </span>
  );
}

function StevecAkcij({ k }: { k: AkcijeAudita }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span title="Odprte akcije" className={k.odprte ? "font-semibold text-ink-900" : "text-ink-400"}>
        {k.odprte} odprtih
      </span>
      {k.zamuja > 0 && <span className="rounded-full bg-fines-500 px-2 py-0.5 font-bold text-white">{k.zamuja} zamuja</span>}
      {k.dobre > 0 && <span title="Dobre prakse" className="rounded-full bg-ok-50 px-2 py-0.5 font-bold text-ok-600">{k.dobre} dobre</span>}
    </span>
  );
}

function SeznamAuditov({
  auditi,
  vseh,
  sort,
  akcijeAudita,
  onOdpri,
}: {
  auditi: Audit[];
  vseh: number;
  sort: SortAuditov;
  akcijeAudita: (a: Audit) => AkcijeAudita;
  onOdpri: (a: Audit) => void;
}) {
  const { s } = useSifranti();
  const prazno = vseh ? "Ni auditov za izbrane filtre." : "Ni auditov. Klikni Nov audit.";
  return (
    <>
      {/* telefon: kartice */}
      <div className="flex flex-col gap-2 sm:hidden">
        {auditi.length === 0 && <p className="py-6 text-center text-sm text-ink-500">{prazno}</p>}
        {auditi.map((a) => {
          const o = oddelekPoKodi(s, a.oddelek);
          return (
            <button
              key={a.id}
              type="button"
              title="Odpri audit"
              onClick={() => onOdpri(a)}
              className="flex flex-col gap-1 rounded-lg border border-ink-200 border-l-4 bg-white p-3 text-left shadow-sm active:bg-ink-50"
              style={{ borderLeftColor: o?.barva }}
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 text-[15px] font-bold text-ink-900">{o?.naziv ?? a.oddelek}</span>
                <StatusAudita a={a} />
              </span>
              <span className="text-sm text-ink-600">
                {formatShort(a.datum)}
                {a.tema ? ` · ${nazivTeme(s, a.oddelek, a.tema)}` : ""}
                {a.lokacija ? ` · ${a.lokacija}` : ""}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                {a.izvajalec && <span className="font-semibold text-ink-700">{a.izvajalec}</span>}
                <StevecAkcij k={akcijeAudita(a)} />
              </span>
            </button>
          );
        })}
      </div>

      {/* tablica, monitor: tabela */}
      <div className="hidden sm:block">
        <TabelaOkvir>
          <table className="w-full text-sm">
            <thead className="fp-thead">
              <tr>
                <SortTh sort={sort} kljuc="datum" className="pl-3">Datum</SortTh>
                <SortTh sort={sort} kljuc="oddelek">Oddelek</SortTh>
                <SortTh sort={sort} kljuc="tema">Tema</SortTh>
                <SortTh sort={sort} kljuc="lokacija">Področje</SortTh>
                <SortTh sort={sort} kljuc="izvajalec">Izvajalec</SortTh>
                <SortTh sort={sort} kljuc="akcije" desno hint="Akcije audita (brez opuščenih in dobrih praks)">Akcije</SortTh>
                <SortTh sort={sort} kljuc="odprte" hint="Odprte, zamujene in dobre prakse">Stanje akcij</SortTh>
                <SortTh sort={sort} kljuc="status" className="pr-3">Status</SortTh>
              </tr>
            </thead>
            <tbody>
              {auditi.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-ink-500">
                    {prazno}
                  </td>
                </tr>
              )}
              {auditi.map((a) => (
                  <tr key={a.id} title="Odpri audit" onClick={() => onOdpri(a)} className="cursor-pointer border-b border-ink-100 hover:bg-ink-50">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-700">
                      <span className="inline-flex items-center gap-2">
                        {a.status === "ZAKLJUCEN" ? (
                          <span title="Audit je zaključen" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-500 text-white">
                            <ShieldCheck size={13} strokeWidth={3} aria-hidden />
                          </span>
                        ) : (
                          <span title="Audit še ni zaključen" className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-ink-300" />
                        )}
                        {formatShort(a.datum)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-ink-800">
                      <OddelekOznaka koda={a.oddelek} />
                    </td>
                    <td className="px-2 py-2 text-ink-700">{nazivTeme(s, a.oddelek, a.tema) || <span className="text-ink-400">Vse teme</span>}</td>
                    <td className="min-w-40 px-2 py-2 text-ink-700">{a.lokacija || "-"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-700">{a.izvajalec || "-"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-700">{akcijeAudita(a).vse}</td>
                    <td className="px-2 py-2">
                      <StevecAkcij k={akcijeAudita(a)} />
                    </td>
                    <td className="px-2 py-2 pr-3">
                      <StatusAudita a={a} />
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </TabelaOkvir>
      </div>
    </>
  );
}

