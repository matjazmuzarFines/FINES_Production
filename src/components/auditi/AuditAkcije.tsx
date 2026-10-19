"use client";

import { Fragment, useEffect, useState } from "react";
import { Camera, CheckCircle2, Save, Trash2, X } from "lucide-react";
import { nazivTeme, oddelekPoKodi } from "@/lib/auditSifranti";
import {
  POMEMBNOST,
  PRIORITETE,
  RESNOST,
  VRSTA,
  VRSTE,
  manjkaDokaz,
  opisPrioritete,
  pomenAkcije,
  povraciloMes,
  rokPrioritete,
  shraniAkcijoAudita,
  skrijAkcijoAudita,
  PRILOGE_AUDITA,
  type AuditAkcija,
  type AuditAkcijaVnos,
  type Prioriteta,
  type Vrsta,
} from "@/lib/auditi";
import { formatShort, toIso, type IsoDate } from "@/lib/dates";
import { AKCIJA_STATUSI, akcijaIzvedena, formatEur, type AkcijaStatus } from "@/lib/produktivnost";
import { formatNum, formatVnos, parseNum } from "@/lib/stevila";
import { Button } from "@/components/ui/Button";
import { Lestvica } from "@/components/ui/Choice";
import { FilterIzbira, FilterPolje } from "@/components/ui/Filtri";
import { Modal } from "@/components/ui/Modal";
import { ErrorText, Loading } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { AKCIJA_STATUS, AkcijaKljukica, STATUS_RED } from "@/components/produktivnost/Akcije";
import { Izbirnik, OddelekOznaka, PomenZnacka, PrioritetaZnacka, StatusAkcije, VrstaOznaka } from "./AuditOznake";
import { useSifranti } from "./Sifranti";
import { SlikeFaze, naloziSlikeAkcije, shraniCakajoceSlike, type SlikaAkcije } from "./SlikeAkcije";

export type SkupinaAkcijAudita = { naslov: string; opis: string; akcije: AuditAkcija[] };

const VRSTA_RED: Record<Vrsta, number> = { NEVARNO: 1, NESKLADNOST: 2, OPAZANJE: 3, PREDLOG: 4, DOBRA_PRAKSA: 5 };

/**
 * Akcije auditov po skupinah (razvrščanje znotraj skupine). Od sm naprej tabela, na telefonu kartice
 * (isti podatki in vrstni red). Klik na vrstico / kartico odpre akcijo.
 */
export function AuditAkcijeTabela({
  skupine,
  danes,
  onOdpri,
  prazno,
  brezOddelka,
}: {
  skupine: SkupinaAkcijAudita[];
  danes: IsoDate;
  onOdpri: (a: AuditAkcija) => void;
  prazno: string;
  /** Skrij oddelek (vse akcije so iz istega oddelka). */
  brezOddelka?: boolean;
}) {
  const { s } = useSifranti();
  const sort = useRazvrscanje({
    datum: (a: AuditAkcija) => a.datum,
    oddelek: (a: AuditAkcija) => oddelekPoKodi(s, a.oddelek)?.naziv,
    vrsta: (a: AuditAkcija) => VRSTA_RED[a.vrsta],
    problem: (a: AuditAkcija) => a.problem,
    ukrep: (a: AuditAkcija) => a.ukrep,
    odgovoren: (a: AuditAkcija) => a.odgovoren,
    prioriteta: (a: AuditAkcija) => a.prioriteta,
    rok: (a: AuditAkcija) => a.rok,
    pomen: (a: AuditAkcija) => (pomenAkcije(a) === null ? null : -pomenAkcije(a)!),
    status: (a: AuditAkcija) => (a.vrsta === "DOBRA_PRAKSA" ? 9 : STATUS_RED[a.status]),
  });
  const vseh = skupine.reduce((x, g) => x + g.akcije.length, 0);
  const sSkupinami = skupine.filter((g) => g.akcije.length).length > 1 || skupine.length > 1;
  const st = brezOddelka ? 9 : 10;

  return (
    <>
      {/* telefon: kartice */}
      <div className="flex flex-col gap-2 sm:hidden">
        {vseh === 0 && <p className="py-6 text-center text-sm text-ink-500">{prazno}</p>}
        {skupine.map((g) =>
          g.akcije.length === 0 ? null : (
            <Fragment key={g.naslov}>
              {sSkupinami && (
                <h4 className="mt-1 rounded-lg border-l-4 border-ink-600 bg-ink-200 px-3 py-2 text-sm">
                  <strong>{g.naslov}</strong> <span className="text-ink-600">· {g.akcije.length}</span>
                </h4>
              )}
              {sort.razvrsti(g.akcije).map((a) => (
                <KarticaAkcije key={a.id} a={a} danes={danes} onOdpri={onOdpri} brezOddelka={brezOddelka} />
              ))}
            </Fragment>
          ),
        )}
      </div>

      {/* tablica, monitor: tabela */}
      <div className="hidden sm:block">
        <TabelaOkvir>
          <table className="w-full text-sm">
            <thead className="fp-thead">
              <tr>
                <SortTh sort={sort} kljuc="datum" className="pl-3" hint="Razvrsti po datumu audita">Audit</SortTh>
                {!brezOddelka && <SortTh sort={sort} kljuc="oddelek">Oddelek</SortTh>}
                <SortTh sort={sort} kljuc="vrsta">Vrsta</SortTh>
                <SortTh sort={sort} kljuc="problem">Ugotovitev</SortTh>
                <SortTh sort={sort} kljuc="ukrep">Ukrep</SortTh>
                <SortTh sort={sort} kljuc="odgovoren">Odgovoren</SortTh>
                <SortTh sort={sort} kljuc="prioriteta" hint="Prioriteta A / B / C">Prio</SortTh>
                <SortTh sort={sort} kljuc="rok">Rok</SortTh>
                <SortTh sort={sort} kljuc="pomen" desno hint="Pomen = velikost napake × pomembnost (1-25)">Pomen</SortTh>
                <SortTh sort={sort} kljuc="status" className="pr-3">Status</SortTh>
              </tr>
            </thead>
            <tbody>
              {vseh === 0 && (
                <tr>
                  <td colSpan={st} className="px-3 py-6 text-center text-ink-500">
                    {prazno}
                  </td>
                </tr>
              )}
              {skupine.map((g) =>
                g.akcije.length === 0 ? null : (
                  <Fragment key={g.naslov}>
                    {sSkupinami && (
                      <tr>
                        <td colSpan={st} className="border-l-4 border-ink-600 bg-ink-200 px-3 py-2 text-base">
                          <strong>{g.naslov}</strong> <span className="text-sm text-ink-600">· {g.akcije.length} · {g.opis}</span>
                        </td>
                      </tr>
                    )}
                    {sort.razvrsti(g.akcije).map((a) => (
                      <tr key={a.id} title="Odpri akcijo za urejanje" onClick={() => onOdpri(a)} className="cursor-pointer border-b border-ink-100 align-top hover:bg-ink-50">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-600">
                          <span className="inline-flex items-center gap-2">
                            <AkcijaKljukica a={a.vrsta === "DOBRA_PRAKSA" ? { status: "IZVEDENO", rok: null } : a} />
                            {formatShort(a.datum)}
                          </span>
                        </td>
                        {!brezOddelka && (
                          <td className="px-2 py-2 text-ink-700">
                            <OddelekOznaka koda={a.oddelek} />
                          </td>
                        )}
                        <td className="px-2 py-2 text-ink-700">
                          <VrstaOznaka vrsta={a.vrsta} />
                        </td>
                        <td className="min-w-48 px-2 py-2 font-semibold text-ink-900">
                          {a.problem}
                          {a.kategorija && <span className="block text-xs font-normal text-ink-500">{nazivTeme(s, a.oddelek, a.kategorija)}</span>}
                        </td>
                        <td className="min-w-48 px-2 py-2 text-ink-700">{a.ukrep ?? <span className="text-ink-400">-</span>}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-ink-700">{a.odgovoren ?? "-"}</td>
                        <td className="px-2 py-2">
                          <PrioritetaZnacka p={a.prioriteta} />
                        </td>
                        <td className={`whitespace-nowrap px-2 py-2 tabular-nums ${akcijaIzvedena(a) ? "text-ok-600" : "text-ink-700"}`}>{a.rok ? formatShort(a.rok) : "-"}</td>
                        <td className="px-2 py-2 text-right">
                          <PomenZnacka a={a} />
                        </td>
                        <td className="px-2 py-2 pr-3">
                          <StatusAkcije a={a} danes={danes} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ),
              )}
            </tbody>
          </table>
        </TabelaOkvir>
      </div>
    </>
  );
}

function KarticaAkcije({ a, danes, onOdpri, brezOddelka }: { a: AuditAkcija; danes: IsoDate; onOdpri: (a: AuditAkcija) => void; brezOddelka?: boolean }) {
  return (
    <button
      type="button"
      title="Odpri akcijo za urejanje"
      onClick={() => onOdpri(a)}
      className="flex w-full flex-col gap-1.5 rounded-lg border border-ink-200 border-l-4 bg-white p-3 text-left shadow-sm active:bg-ink-50"
      style={{ borderLeftColor: VRSTA[a.vrsta].barva }}
    >
      <span className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
        <VrstaOznaka vrsta={a.vrsta} />
        <PrioritetaZnacka p={a.prioriteta} />
        <PomenZnacka a={a} />
        <span className="ml-auto">
          <StatusAkcije a={a} danes={danes} />
        </span>
      </span>
      <span className="text-[15px] font-semibold leading-snug text-ink-900">{a.problem}</span>
      {a.ukrep && <span className="text-sm leading-snug text-ink-700">→ {a.ukrep}</span>}
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
        {!brezOddelka && <OddelekOznaka koda={a.oddelek} />}
        {a.odgovoren && <span className="font-semibold text-ink-700">{a.odgovoren}</span>}
        {a.rok && <span>rok {formatShort(a.rok)}</span>}
        <span>audit {formatShort(a.datum)}</span>
      </span>
    </button>
  );
}

// =====================================================================
// OKNO UGOTOVITVE / AKCIJE
// =====================================================================

const POLJE =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 sm:text-sm";

type Obrazec = {
  vrsta: Vrsta;
  problem: string;
  ukrep: string;
  kategorija: string;
  odgovoren: string;
  prioriteta: Prioriteta | null;
  rok: string;
  status: AkcijaStatus;
  reseno_na_mestu: boolean;
  resnost: number | null;
  pomembnost: number | null;
  prihranek: string;
  strosek: string;
  rezultat: string;
  zakljuceno: string;
};

const stevilo = (v: number | null | undefined) => (v === null || v === undefined ? "" : formatVnos(v));

function Odsek({ naslov, children }: { naslov: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ink-200 bg-ink-50 p-3">
      <h4 className="text-xs font-bold uppercase tracking-wide text-fines-600">{naslov}</h4>
      {children}
    </section>
  );
}

/**
 * Vpis ali popravek ugotovitve. Na telefonu celozaslonsko, gumbi spodaj vedno vidni.
 * Vrstni red polj sledi obhodu: vrsta -> kaj vidim -> slika -> kdo in do kdaj -> ocena.
 */
export function AuditAkcijaOkno({
  akcija,
  oddelek,
  datumAudita,
  predlog,
  odgovorni,
  pridobiAuditId,
  onClose,
  onShranjeno,
}: {
  /** Obstoječa akcija; null = nova. */
  akcija: AuditAkcija | null;
  /** Oddelek audita (teme za izbor, vodja kot predlog odgovornega). */
  oddelek: string;
  /** Dan audita (mapa slik nove akcije). */
  datumAudita: IsoDate | null;
  predlog?: Partial<AuditAkcijaVnos>;
  /** Imena za hiter izbor odgovornega (najprej vodja oddelka). */
  odgovorni: string[];
  pridobiAuditId: () => Promise<number>;
  onClose: () => void;
  onShranjeno: () => void;
}) {
  const notify = useToast();
  const { s } = useSifranti();
  const n = s.nastavitve;
  const danes = toIso(new Date());
  const z = { ...predlog, ...akcija };
  const zacetnaVrsta: Vrsta = z.vrsta ?? "NESKLADNOST";
  const [f, setF] = useState<Obrazec>({
    vrsta: zacetnaVrsta,
    problem: z.problem ?? "",
    ukrep: z.ukrep ?? "",
    kategorija: z.kategorija ?? "",
    odgovoren: z.odgovoren ?? "",
    prioriteta: z.prioriteta ?? (akcija ? null : VRSTA[zacetnaVrsta].prioriteta),
    rok: z.rok ?? (akcija ? "" : rokPrioritete(VRSTA[zacetnaVrsta].prioriteta ?? "B", danes, n)),
    status: z.status ?? "ODPRTO",
    reseno_na_mestu: z.reseno_na_mestu ?? false,
    resnost: z.resnost ?? null,
    pomembnost: z.pomembnost ?? null,
    prihranek: stevilo(z.prihranek_eur),
    strosek: stevilo(z.strosek_eur),
    rezultat: z.rezultat ?? "",
    zakljuceno: z.zakljuceno ?? "",
  });
  const [slike, setSlike] = useState<SlikaAkcije[] | null>(akcija ? null : []);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);

  useEffect(() => {
    if (!akcija) return;
    let preklic = false;
    naloziSlikeAkcije(akcija.id)
      .then((x) => !preklic && setSlike(x))
      .catch(() => !preklic && setSlike([]));
    return () => {
      preklic = true;
    };
  }, [akcija]);

  const nastavi = (p: Partial<Obrazec>) => setF((x) => ({ ...x, ...p }));
  const kodaOddelka = akcija?.oddelek ?? oddelek;
  const odd = oddelekPoKodi(s, kodaOddelka);
  const teme = (odd?.teme ?? []).filter((t) => t.aktivna || t.koda === f.kategorija);
  const dobra = f.vrsta === "DOBRA_PRAKSA";
  const zaprta = f.status === "IZVEDENO" || f.status === "PREVERJENO";
  const prihranek = parseNum(f.prihranek);
  const strosek = parseNum(f.strosek);
  const povracilo = povraciloMes({ prihranek_eur: prihranek, strosek_eur: strosek });
  const pomen = pomenAkcije(f);
  const slikPo = (slike ?? []).filter((x) => x.faza === "PO").length;

  function izberiVrsto(v: Vrsta) {
    const p = VRSTA[v].prioriteta;
    // pri novi ugotovitvi vrsta predlaga prioriteto in rok
    nastavi(akcija || !p ? { vrsta: v } : { vrsta: v, prioriteta: p, rok: rokPrioritete(p, danes, n) });
  }

  function resenoNaMestu(v: boolean) {
    nastavi(
      v
        ? { reseno_na_mestu: true, status: "IZVEDENO", zakljuceno: f.zakljuceno || danes, prioriteta: null, rok: "" }
        : { reseno_na_mestu: false, status: "ODPRTO", zakljuceno: "" },
    );
  }

  async function shrani() {
    if (!f.problem.trim()) return setNapaka(dobra ? "Opiši dobro prakso (kaj je dobro narejeno)." : "Vpiši ugotovitev (kaj si opazil).");
    if (f.prihranek && prihranek === null) return setNapaka("Ocena prihranka mora biti število (EUR na leto).");
    if (f.strosek && strosek === null) return setNapaka("Cena ukrepa mora biti število (EUR).");
    const dokaz = manjkaDokaz(f, slikPo);
    if (dokaz) return setNapaka(dokaz);
    setNapaka(null);
    setShranjujem(true);
    try {
      const auditId = akcija?.audit_id ?? (await pridobiAuditId());
      const status: AkcijaStatus = dobra ? "PREVERJENO" : f.status;
      const zakljucena = status === "IZVEDENO" || status === "PREVERJENO";
      const id = await shraniAkcijoAudita(auditId, akcija?.id ?? null, {
        vrsta: f.vrsta,
        problem: f.problem,
        ukrep: f.ukrep,
        kategorija: f.kategorija || null,
        odgovoren: dobra ? null : f.odgovoren,
        prioriteta: dobra || f.reseno_na_mestu ? null : f.prioriteta,
        rok: dobra || f.reseno_na_mestu ? null : f.rok || null,
        status,
        reseno_na_mestu: !dobra && f.reseno_na_mestu,
        resnost: dobra ? null : f.resnost,
        pomembnost: dobra ? null : f.pomembnost,
        prihranek_eur: dobra ? null : prihranek,
        strosek_eur: dobra ? null : strosek,
        rezultat: f.rezultat,
        zakljuceno: zakljucena ? f.zakljuceno || (akcija ? danes : (datumAudita ?? danes)) : null,
      });
      try {
        await shraniCakajoceSlike(slike ?? [], { id, audit_id: auditId, datum: akcija?.datum ?? datumAudita ?? danes });
      } catch (e) {
        notify("error", `Akcija je shranjena, slike pa ne: ${(e as Error).message}`, 10000);
      }
      notify("success", dobra ? "Dobra praksa je zapisana." : akcija ? "Akcija je posodobljena." : "Ugotovitev je dodana.");
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka pri shranjevanju: ${(e as Error).message}`);
    } finally {
      setShranjujem(false);
    }
  }

  async function odstrani() {
    if (!akcija || !window.confirm("Odstranim ugotovitev / akcijo?")) return;
    setShranjujem(true);
    try {
      await skrijAkcijoAudita(akcija.id);
      notify("success", "Akcija je odstranjena.");
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  const noga = (
    <div className="flex flex-col gap-2">
      {napaka && <ErrorText>{napaka}</ErrorText>}
      <div className="flex gap-2">
        {akcija && (
          <Button hint="Odstrani ugotovitev / akcijo" variant="danger" icon={Trash2} disabled={shranjujem} onClick={odstrani}>
            <span className="hidden sm:inline">Odstrani</span>
          </Button>
        )}
        <Button hint="Zapri okno brez shranjevanja" variant="neutral" icon={X} onClick={onClose} className="ml-auto">
          Prekliči
        </Button>
        <Button hint="Shrani ugotovitev / akcijo" variant="success" icon={Save} size="lg" disabled={shranjujem || slike === null} onClick={shrani} className="flex-1 sm:flex-none">
          {shranjujem ? "Shranjujem ..." : "Shrani"}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal open title={akcija ? `Akcija · audit ${formatShort(akcija.datum)}` : "Nova ugotovitev"} onClose={onClose} sirina="max-w-2xl" noga={noga}>
      <div className="flex flex-col gap-4">
        <FilterPolje label="Vrsta">
          <Izbirnik
            label="Vrsta ugotovitve"
            value={f.vrsta}
            onChange={izberiVrsto}
            moznosti={VRSTE.map((v) => ({ value: v, label: VRSTA[v].label, hint: VRSTA[v].hint, barva: VRSTA[v].barva }))}
          />
        </FilterPolje>

        <FilterPolje label={dobra ? "Kaj je dobro narejeno *" : "Ugotovitev (kaj vidim) *"}>
          <textarea
            value={f.problem}
            onChange={(e) => nastavi({ problem: e.target.value })}
            rows={3}
            autoFocus={!akcija}
            placeholder={dobra ? "npr. Senčna tabla za orodje na liniji 2 - vse orodje na mestu" : "npr. Prometna pot ob regalu B je zastavljena s paletami"}
            title="Opiši z dejstvi: kaj, kje, kolikokrat"
            className={POLJE}
          />
        </FilterPolje>

        {slike === null ? (
          <Loading />
        ) : (
          <SlikeFaze
            faza="PRED"
            naslov={dobra ? "Slike" : "Slike PRED (stanje ob auditu)"}
            slike={slike}
            onChange={setSlike}
            onOdstraniShranjeno={async (x) => {
              if (x.priloga) await PRILOGE_AUDITA.odstrani(x.priloga);
            }}
          />
        )}

        {teme.length > 0 && (
          <FilterIzbira
            label="Tema"
            hint="Izberi temo oddelka, kamor sodi ugotovitev"
            value={f.kategorija}
            options={[{ value: "", label: "- brez teme -" }, ...teme.map((t) => ({ value: t.koda, label: t.naziv }))]}
            onChange={(v) => nastavi({ kategorija: v })}
            className="[&>select]:w-full"
          />
        )}

        {!dobra && (
          <>
            <button
              type="button"
              title="Označi, da je bilo popravljeno takoj med auditom"
              aria-pressed={f.reseno_na_mestu}
              onClick={() => resenoNaMestu(!f.reseno_na_mestu)}
              className={`flex min-h-12 items-center gap-3 rounded-lg border-2 px-3 text-left text-sm font-semibold transition-colors ${
                f.reseno_na_mestu ? "border-ok-500 bg-ok-50 text-ok-600" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
              }`}
            >
              <CheckCircle2 className={`h-6 w-6 shrink-0 ${f.reseno_na_mestu ? "text-ok-500" : "text-ink-300"}`} aria-hidden />
              <span className="flex-1">
                Rešeno na mestu
                <span className="block text-xs font-normal text-ink-500">Popravljeno takoj - akcija se zapiše in zapre</span>
              </span>
            </button>

            <FilterPolje label={f.reseno_na_mestu ? "Kaj je bilo narejeno" : "Ukrep (kaj bomo naredili)"}>
              <textarea
                value={f.ukrep}
                onChange={(e) => nastavi({ ukrep: e.target.value })}
                rows={2}
                placeholder={f.reseno_na_mestu ? "npr. Palete odstranjene, pot prosta" : "npr. Označeno mesto za palete in dnevni pregled poti"}
                title="Opiši konkreten ukrep"
                className={POLJE}
              />
            </FilterPolje>

            <FilterPolje label="Odgovoren">
              <input
                value={f.odgovoren}
                onChange={(e) => nastavi({ odgovoren: e.target.value })}
                list="fp-aud-odgovorni"
                placeholder="Ime (ena oseba)"
                title="Vpiši eno odgovorno osebo"
                className={`${POLJE} h-11 py-0`}
              />
              <datalist id="fp-aud-odgovorni">
                {odgovorni.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
              {odgovorni.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {odgovorni.slice(0, 5).map((o, i) => (
                    <button
                      key={o}
                      type="button"
                      title={`Odgovoren: ${o}`}
                      onClick={() => nastavi({ odgovoren: o })}
                      className={`h-9 rounded-full border px-3 text-sm font-semibold ${
                        f.odgovoren === o ? "border-fines-500 bg-fines-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
                      }`}
                    >
                      {o}
                      {i === 0 && odd?.vodja === o && <span className="ml-1 text-[11px] font-normal opacity-80">(vodja)</span>}
                    </button>
                  ))}
                </div>
              )}
            </FilterPolje>

            {!f.reseno_na_mestu && (
              <div className="flex flex-col gap-3">
                <FilterPolje label="Prioriteta (nastavi rok)">
                  <Izbirnik
                    label="Prioriteta"
                    value={f.prioriteta}
                    stolpci="grid-cols-3"
                    onChange={(p) => nastavi({ prioriteta: p, rok: rokPrioritete(p, danes, n) })}
                    moznosti={PRIORITETE.map((p) => ({
                      value: p,
                      label: p,
                      opis: opisPrioritete(p, n).split(" - ")[1],
                      hint: `Prioriteta ${opisPrioritete(p, n)}`,
                    }))}
                  />
                </FilterPolje>
                <FilterPolje label="Rok" className="sm:w-48">
                  <input type="date" value={f.rok} onChange={(e) => nastavi({ rok: e.target.value })} title="Rok za izvedbo ukrepa" className={`${POLJE} h-11 py-0`} />
                </FilterPolje>
              </div>
            )}

            <Odsek naslov="Ocena">
              <FilterPolje label="Velikost napake / škode">
                <Lestvica value={f.resnost} stopnje={RESNOST} subject="Velikost napake" onChange={(v) => nastavi({ resnost: v === f.resnost ? null : v })} />
              </FilterPolje>
              <FilterPolje label="Pomembnost zame (vodstvo)">
                <Lestvica value={f.pomembnost} stopnje={POMEMBNOST} subject="Pomembnost" onChange={(v) => nastavi({ pomembnost: v === f.pomembnost ? null : v })} />
              </FilterPolje>
              <div className="grid grid-cols-2 gap-3">
                <FilterPolje label="Ocena prihranka (€/leto)">
                  <input
                    value={f.prihranek}
                    onChange={(e) => nastavi({ prihranek: e.target.value })}
                    inputMode="decimal"
                    placeholder="npr. 2000"
                    title="Koliko na leto prihranimo ali preprečimo škode"
                    className={`${POLJE} h-11 py-0 text-right tabular-nums`}
                  />
                </FilterPolje>
                <FilterPolje label="Cena ukrepa (€)">
                  <input
                    value={f.strosek}
                    onChange={(e) => nastavi({ strosek: e.target.value })}
                    inputMode="decimal"
                    placeholder="npr. 300"
                    title="Enkratni strošek ukrepa (material, delo, nakup)"
                    className={`${POLJE} h-11 py-0 text-right tabular-nums`}
                  />
                </FilterPolje>
              </div>
              {(pomen !== null || povracilo !== null) && (
                <p className="text-sm text-ink-700">
                  {pomen !== null && (
                    <>
                      Pomen <strong className="tabular-nums">{pomen} / 25</strong>
                    </>
                  )}
                  {pomen !== null && povracilo !== null && " · "}
                  {povracilo !== null && (
                    <>
                      povračilo v <strong className="tabular-nums">{formatNum(Math.round(povracilo * 10) / 10)} mes.</strong>
                    </>
                  )}
                  {prihranek ? <> · {formatEur(prihranek)} / leto</> : null}
                </p>
              )}
            </Odsek>

            {(akcija || f.reseno_na_mestu) && (
              <Odsek naslov="Izvedba">
                {akcija && (
                  <FilterPolje label="Status">
                    <Izbirnik
                      label="Status akcije"
                      value={f.status}
                      stolpci="grid-cols-2 sm:grid-cols-5"
                      onChange={(st) =>
                        nastavi({ status: st, zakljuceno: st === "IZVEDENO" || st === "PREVERJENO" ? f.zakljuceno || danes : "" })
                      }
                      moznosti={AKCIJA_STATUSI.map((st) => ({ value: st, label: AKCIJA_STATUS[st].label, hint: AKCIJA_STATUS[st].hint }))}
                    />
                  </FilterPolje>
                )}
                <FilterPolje label="Rezultat / preverjanje">
                  <textarea
                    value={f.rezultat}
                    onChange={(e) => nastavi({ rezultat: e.target.value })}
                    rows={2}
                    placeholder="npr. Pot je prosta, preverjeno na naslednjem auditu"
                    title="Kako je bil ukrep izveden in preverjen"
                    className={POLJE}
                  />
                </FilterPolje>
                {zaprta && (
                  <FilterPolje label="Izvedeno dne" className="sm:w-48">
                    <input type="date" value={f.zakljuceno} onChange={(e) => nastavi({ zakljuceno: e.target.value })} title="Datum izvedbe ukrepa" className={`${POLJE} h-11 py-0`} />
                  </FilterPolje>
                )}
                {slike !== null && (
                  <SlikeFaze
                    faza="PO"
                    naslov="Slike PO (dokaz izvedbe)"
                    slike={slike}
                    onChange={setSlike}
                    onOdstraniShranjeno={async (x) => {
                      if (x.priloga) await PRILOGE_AUDITA.odstrani(x.priloga);
                    }}
                  />
                )}
                {zaprta && slikPo === 0 && !f.rezultat.trim() && !(f.reseno_na_mestu && f.ukrep.trim()) && (
                  <p className="flex items-center gap-2 text-xs font-semibold text-warn-700">
                    <Camera className="h-4 w-4" aria-hidden /> Za zaprtje dodaj sliko PO ali opiši rezultat.
                  </p>
                )}
              </Odsek>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Imena za hiter izbor odgovornega: vodja oddelka, izvajalec, nato najpogostejši odgovorni oddelka. */
export function predlogiOdgovornih(akcije: AuditAkcija[], oddelek: string, vodja: string, izvajalec: string) {
  const stevec = new Map<string, number>();
  for (const a of akcije) {
    if (!a.odgovoren) continue;
    stevec.set(a.odgovoren, (stevec.get(a.odgovoren) ?? 0) + (a.oddelek === oddelek ? 3 : 1));
  }
  const pogosti = [...stevec].sort((x, y) => y[1] - x[1]).map(([ime]) => ime);
  return [...new Set([vodja, izvajalec, ...pogosti].map((x) => x.trim()).filter(Boolean))];
}

