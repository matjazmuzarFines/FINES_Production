"use client";

import { Fragment, useState } from "react";
import { Save, Trash2, X } from "lucide-react";
import { formatShort, isoWeek, toIso, type IsoDate } from "@/lib/dates";
import { IZGUBE, izgubaPoKodi } from "@/lib/gembaVodic";
import {
  AKCIJA_STATUSI,
  akcijaIzvedena,
  akcijaZamuja,
  formatEur,
  formatEur2,
  formatH,
  prihranekAkcije,
  shraniAkcijo,
  skrijAkcijo,
  type Akcija,
  type AkcijaStatus,
  type AkcijaVnos,
  type Nastavitve,
} from "@/lib/produktivnost";
import { formatNum, formatVnos, parseNum } from "@/lib/stevila";
import { Button } from "@/components/ui/Button";
import { FilterIzbira, FilterPolje, FilterPreklopnik } from "@/components/ui/Filtri";
import { Modal } from "@/components/ui/Modal";
import { ErrorText, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";

export const AKCIJA_STATUS: Record<AkcijaStatus, { label: string; cls: string; hint: string }> = {
  ODPRTO: { label: "Odprto", cls: "bg-ink-500 text-white", hint: "Akcija še ni začeta" },
  V_DELU: { label: "V delu", cls: "bg-sync-500 text-white", hint: "Akcija se izvaja" },
  IZVEDENO: { label: "Izvedeno", cls: "bg-ok-500 text-white", hint: "Ukrep izveden - učinek še preveri" },
  PREVERJENO: { label: "Preverjeno", cls: "bg-ok-600 text-white", hint: "Učinek izmerjen, ukrep je standard" },
  OPUSCENO: { label: "Opuščeno", cls: "bg-ink-200 text-ink-600", hint: "Akcija ne bo izvedena" },
};

export function AkcijaZnacka({ a, danes }: { a: Akcija; danes: IsoDate }) {
  if (akcijaZamuja(a, danes)) {
    return (
      <span title={`Rok ${formatShort(a.rok!)} je pretekel`} className="whitespace-nowrap rounded-full bg-fines-500 px-2.5 py-0.5 text-xs font-bold text-white">
        Zamuja
      </span>
    );
  }
  const s = AKCIJA_STATUS[a.status];
  return (
    <span title={s.hint} className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>
      {s.label}
    </span>
  );
}

/** Pika in ime izgube. */
export function IzgubaOznaka({ koda }: { koda: string | null }) {
  const i = izgubaPoKodi(koda);
  if (!i) return <span className="text-ink-400">-</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={i.opis}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.barva }} />
      {i.naziv}
    </span>
  );
}

const STATUS_RED: Record<AkcijaStatus, number> = { ODPRTO: 1, V_DELU: 2, IZVEDENO: 3, PREVERJENO: 4, OPUSCENO: 5 };

export type SkupinaAkcij = { naslov: string; opis: string; akcije: Akcija[] };

const koda = (n: Nastavitve, id: number | null) => n.druzine.find((d) => d.druzina_id === id)?.koda ?? null;

/** Tabla izboljšav: razvrstljiva tabela akcij, po skupinah (razvrščanje znotraj skupine). Klik na vrstico odpre akcijo. */
export function AkcijeTabela({
  skupine,
  danes,
  nastavitve,
  onOdpri,
  prazno,
}: {
  skupine: SkupinaAkcij[];
  danes: IsoDate;
  nastavitve: Nastavitve;
  onOdpri: (a: Akcija) => void;
  prazno: string;
}) {
  const p = (a: Akcija) => prihranekAkcije(a, nastavitve);
  const sort = useRazvrscanje({
    teden: (a: Akcija) => a.teden,
    problem: (a: Akcija) => a.problem,
    ukrep: (a: Akcija) => a.ukrep,
    kategorija: (a: Akcija) => izgubaPoKodi(a.kategorija)?.naziv,
    druzina: (a: Akcija) => koda(nastavitve, a.druzina_id),
    odgovoren: (a: Akcija) => a.odgovoren,
    rok: (a: Akcija) => a.rok,
    status: (a: Akcija) => STATUS_RED[a.status],
    min: (a: Akcija) => a.prihranek_min_kos,
    eurKos: (a: Akcija) => (p(a).imaPrihranek ? p(a).eurKos : null),
    eurLeto: (a: Akcija) => p(a).eurLeto,
  });
  const vseh = skupine.reduce((s, g) => s + g.akcije.length, 0);
  const sSkupinami = skupine.length > 1;
  const st = 11;

  return (
    <TabelaOkvir>
      <table className="w-full text-sm">
        <thead className="fp-thead">
          <tr>
            <SortTh sort={sort} kljuc="teden" className="pl-3">Teden</SortTh>
            <SortTh sort={sort} kljuc="problem">Problem</SortTh>
            <SortTh sort={sort} kljuc="ukrep">Ukrep</SortTh>
            <SortTh sort={sort} kljuc="kategorija">Izguba</SortTh>
            <SortTh sort={sort} kljuc="druzina">Družina</SortTh>
            <SortTh sort={sort} kljuc="odgovoren">Odgovoren</SortTh>
            <SortTh sort={sort} kljuc="rok">Rok</SortTh>
            <SortTh sort={sort} kljuc="status">Status</SortTh>
            <SortTh sort={sort} kljuc="min" desno hint="Prihranek časa na kos (min)">min/kos</SortTh>
            <SortTh sort={sort} kljuc="eurKos" desno hint="Prihranek na kos: čas × urna postavka + material">€/kos</SortTh>
            <SortTh sort={sort} kljuc="eurLeto" desno className="pr-3" hint="€/kos × letna količina">€/leto</SortTh>
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
                {sort.razvrsti(g.akcije).map((a) => {
                  const pa = p(a);
                  const barva = akcijaIzvedena(a) ? "text-ok-600" : "text-ink-700";
                  return (
                    <tr
                      key={a.id}
                      title="Odpri akcijo za urejanje"
                      onClick={() => onOdpri(a)}
                      className="cursor-pointer border-b border-ink-100 align-top hover:bg-ink-50"
                    >
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-600">T{isoWeek(a.teden)}</td>
                      <td className="min-w-48 px-2 py-2 font-semibold text-ink-900">{a.problem}</td>
                      <td className="min-w-48 px-2 py-2 text-ink-700">{a.ukrep ?? <span className="text-ink-400">-</span>}</td>
                      <td className="px-2 py-2 text-ink-700">
                        <IzgubaOznaka koda={a.kategorija} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-ink-700">{koda(nastavitve, a.druzina_id) ?? "-"}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-700">{a.odgovoren ?? "-"}</td>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums text-ink-700">{a.rok ? formatShort(a.rok) : "-"}</td>
                      <td className="px-2 py-2">
                        <AkcijaZnacka a={a} danes={danes} />
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${barva}`}>
                        {a.prihranek_min_kos !== null ? formatNum(a.prihranek_min_kos) : "-"}
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${barva}`}>{pa.imaPrihranek ? formatEur2(pa.eurKos) : "-"}</td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${barva}`}
                        title={pa.imaPrihranek && pa.eurLeto === null ? "Ni letne količine (družina ali akcija)" : undefined}
                      >
                        {pa.eurLeto !== null && pa.imaPrihranek ? formatEur(pa.eurLeto) : pa.imaPrihranek ? "?" : "-"}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ),
          )}
        </tbody>
      </table>
    </TabelaOkvir>
  );
}

// =====================================================================
// OKNO AKCIJE
// =====================================================================

const POLJE =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

type Obrazec = {
  problem: string;
  ukrep: string;
  kategorija: string;
  odgovoren: string;
  rok: string;
  status: AkcijaStatus;
  strosek: string;
  rezultat: string;
  zakljuceno: string;
  prihranek: PrihranekVnos;
};

/** Vpis ali popravek akcije. Nova akcija se zapiše na gembo tedna (če še ne obstaja, se ustvari). */
export function AkcijaOkno({
  akcija,
  predlog,
  odgovorni,
  nastavitve,
  pridobiGembaId,
  onClose,
  onShranjeno,
}: {
  /** Obstoječa akcija; null = nova. */
  akcija: Akcija | null;
  predlog?: Partial<AkcijaVnos>;
  /** Imena za hiter izbor odgovornega. */
  odgovorni: string[];
  nastavitve: Nastavitve;
  pridobiGembaId: () => Promise<number>;
  onClose: () => void;
  onShranjeno: () => void;
}) {
  const notify = useToast();
  const z = { ...predlog, ...akcija };
  const [f, setF] = useState<Obrazec>({
    problem: z.problem ?? "",
    ukrep: z.ukrep ?? "",
    kategorija: z.kategorija ?? "",
    odgovoren: z.odgovoren ?? "",
    rok: z.rok ?? "",
    status: z.status ?? "ODPRTO",
    strosek: z.strosek_eur !== null && z.strosek_eur !== undefined ? formatVnos(z.strosek_eur) : "",
    rezultat: z.rezultat ?? "",
    zakljuceno: z.zakljuceno ?? "",
    prihranek: prihranekVnosIz(z),
  });
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);

  const nastavi = (p: Partial<Obrazec>) => setF((s) => ({ ...s, ...p }));
  const strosek = parseNum(f.strosek);
  const izvedena = f.status === "IZVEDENO" || f.status === "PREVERJENO";

  async function shrani() {
    if (!f.problem.trim()) return setNapaka("Vpiši problem (kaj si opazil).");
    const p = preberiPrihranek(f.prihranek);
    if (typeof p === "string") return setNapaka(p);
    if (f.strosek && strosek === null) return setNapaka("Strošek mora biti število (EUR).");
    setNapaka(null);
    setShranjujem(true);
    try {
      const gembaId = akcija?.gemba_id ?? (await pridobiGembaId());
      await shraniAkcijo(gembaId, akcija?.id ?? null, {
        problem: f.problem,
        ukrep: f.ukrep,
        kategorija: f.kategorija || null,
        odgovoren: f.odgovoren,
        rok: f.rok || null,
        status: f.status,
        ...p,
        strosek_eur: strosek,
        rezultat: f.rezultat,
        zakljuceno: izvedena ? f.zakljuceno || toIso(new Date()) : null,
      });
      notify("success", akcija ? "Akcija je posodobljena." : "Akcija je dodana.");
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka pri shranjevanju: ${(e as Error).message}`);
    } finally {
      setShranjujem(false);
    }
  }

  async function odstrani() {
    if (!akcija || !window.confirm("Odstranim akcijo s table izboljšav?")) return;
    setShranjujem(true);
    try {
      await skrijAkcijo(akcija.id);
      notify("success", "Akcija je odstranjena.");
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  return (
    <Modal open title={akcija ? `Akcija · T${isoWeek(akcija.teden)}` : "Nova akcija"} onClose={onClose} sirina="max-w-2xl">
      <div className="flex flex-col gap-4">
        <FilterPolje label="Problem (kaj si opazil) *">
          <textarea
            value={f.problem}
            onChange={(e) => nastavi({ problem: e.target.value })}
            rows={2}
            autoFocus={!akcija}
            placeholder="npr. Delavec 5× na uro hodi po izvijač v drug prostor"
            title="Opiši opaženo izgubo z dejstvi"
            className={POLJE}
          />
        </FilterPolje>
        <FilterPolje label="Ukrep (kaj bomo naredili)">
          <textarea
            value={f.ukrep}
            onChange={(e) => nastavi({ ukrep: e.target.value })}
            rows={2}
            placeholder="npr. Dodaten izvijač na vsako delovno mesto"
            title="Opiši konkreten ukrep"
            className={POLJE}
          />
        </FilterPolje>

        <div className="grid gap-3 sm:grid-cols-3">
          <FilterIzbira
            label="Izguba"
            hint="Izberi vrsto izgube"
            value={f.kategorija}
            options={[{ value: "", label: "- izberi -" }, ...IZGUBE.map((i) => ({ value: i.koda, label: i.naziv }))]}
            onChange={(v) => nastavi({ kategorija: v })}
          />
          <FilterPolje label="Odgovoren">
            <input
              value={f.odgovoren}
              onChange={(e) => nastavi({ odgovoren: e.target.value })}
              list="fp-prod-odgovorni"
              placeholder="Ime (ena oseba)"
              title="Vpiši eno odgovorno osebo"
              className={`${POLJE} h-10 py-0`}
            />
            <datalist id="fp-prod-odgovorni">
              {odgovorni.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </FilterPolje>
          <FilterPolje label="Rok">
            <input
              type="date"
              value={f.rok}
              onChange={(e) => nastavi({ rok: e.target.value })}
              title="Izberi rok za izvedbo ukrepa"
              className={`${POLJE} h-10 py-0`}
            />
          </FilterPolje>
        </div>

        <div className="overflow-x-auto">
          <FilterPreklopnik
            label="Status"
            value={f.status}
            options={AKCIJA_STATUSI.map((s) => ({ value: s, label: AKCIJA_STATUS[s].label, hint: AKCIJA_STATUS[s].hint }))}
            onChange={(s) =>
              nastavi({
                status: s,
                zakljuceno: s === "IZVEDENO" || s === "PREVERJENO" ? f.zakljuceno || toIso(new Date()) : "",
              })
            }
          />
        </div>

        <KalkulatorPrihranka nastavitve={nastavitve} vrednost={f.prihranek} onChange={(prihranek) => nastavi({ prihranek })} strosek={strosek} />

        <div className="grid gap-3 sm:grid-cols-2">
          <FilterPolje label="Enkratni strošek ukrepa (EUR)">
            <input
              value={f.strosek}
              onChange={(e) => nastavi({ strosek: e.target.value })}
              inputMode="decimal"
              placeholder="npr. 40"
              title="Strošek ukrepa (orodje, material)"
              className={`${POLJE} h-10 py-0 text-right tabular-nums`}
            />
          </FilterPolje>
          <FilterPolje label="Izvedeno dne">
            <input
              type="date"
              value={f.zakljuceno}
              disabled={!izvedena}
              onChange={(e) => nastavi({ zakljuceno: e.target.value })}
              title={izvedena ? "Datum izvedbe - od tega tedna šteje prihranek" : "Datum se vpiše, ko je ukrep izveden"}
              className={`${POLJE} h-10 py-0 disabled:bg-ink-100 disabled:text-ink-400`}
            />
          </FilterPolje>
        </div>

        <FilterPolje label="Rezultat / preverjanje (meritev pred in po)">
          <textarea
            value={f.rezultat}
            onChange={(e) => nastavi({ rezultat: e.target.value })}
            rows={2}
            placeholder="npr. Montaža vrat pred: 12 min, po: 10 min. Silikon: 2 kartuši manj na 10 pečic."
            title="Vpiši izmerjen učinek ukrepa"
            className={POLJE}
          />
        </FilterPolje>

        {napaka && <ErrorText>{napaka}</ErrorText>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200 pt-3">
          {akcija && (
            <Button hint="Odstrani akcijo s table izboljšav" variant="danger" icon={Trash2} disabled={shranjujem} onClick={odstrani} className="mr-auto">
              Odstrani
            </Button>
          )}
          <Button hint="Zapri okno brez shranjevanja" variant="neutral" icon={X} onClick={onClose}>
            Prekliči
          </Button>
          <Button hint="Shrani akcijo na tablo izboljšav" variant="success" icon={Save} disabled={shranjujem} onClick={shrani}>
            {shranjujem ? "Shranjujem ..." : "Shrani"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// KALKULATOR PRIHRANKA
// =====================================================================

/** Vnos prihranka kot besedilo (decimalna vejica). */
export type PrihranekVnos = { min: string; eur: string; druzina: number | null; kolicina: string };

type PrihranekPolja = Pick<AkcijaVnos, "prihranek_min_kos" | "prihranek_eur_kos" | "druzina_id" | "kolicina_leto">;

export function prihranekVnosIz(a: Partial<PrihranekPolja>): PrihranekVnos {
  const t = (v: number | null | undefined) => (v === null || v === undefined ? "" : formatVnos(v));
  return { min: t(a.prihranek_min_kos), eur: t(a.prihranek_eur_kos), druzina: a.druzina_id ?? null, kolicina: t(a.kolicina_leto) };
}

/** Vnos -> polja akcije, ali besedilo napake. */
export function preberiPrihranek(v: PrihranekVnos): PrihranekPolja | string {
  const min = parseNum(v.min);
  const eur = parseNum(v.eur);
  const kol = parseNum(v.kolicina);
  if (v.min && min === null) return "Prihranek časa mora biti število (min na kos).";
  if (v.eur && eur === null) return "Prihranek materiala mora biti število (EUR na kos).";
  if (v.kolicina && (kol === null || kol < 0)) return "Letna količina mora biti pozitivno število.";
  return { prihranek_min_kos: min, prihranek_eur_kos: eur, druzina_id: v.druzina, kolicina_leto: kol };
}

/**
 * Kalkulator prihranka: 2 vpisa - čas (min/kos) in material (EUR/kos).
 * Čas × urna postavka + material = EUR/kos; × letna količina (družine ali ročno) = EUR/leto in h/leto.
 */
export function KalkulatorPrihranka({
  nastavitve,
  vrednost,
  onChange,
  strosek,
}: {
  nastavitve: Nastavitve;
  vrednost: PrihranekVnos;
  onChange: (v: PrihranekVnos) => void;
  /** Enkratni strošek ukrepa (za povračilo). */
  strosek?: number | null;
}) {
  const v = vrednost;
  const polja = preberiPrihranek(v);
  const p = typeof polja === "string" ? null : prihranekAkcije(polja, nastavitve);
  const druzina = nastavitve.druzine.find((d) => d.druzina_id === v.druzina);
  const polje = `${POLJE} h-10 py-0 text-right tabular-nums`;
  const povracilo = p && strosek && p.eurLeto ? (strosek / p.eurLeto) * 12 : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
      <div>
        <h4 className="text-sm font-bold text-ink-900">Prihranek na kos</h4>
        <p className="text-xs text-ink-500">
          Čas × urna postavka ({formatNum(nastavitve.urnaPostavka)} €/h) + material = €/kos. Za €/leto in h/leto izberi družino (letna količina).
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FilterPolje label="Čas (min/kos)">
          <input
            value={v.min}
            onChange={(e) => onChange({ ...v, min: e.target.value })}
            inputMode="decimal"
            placeholder="npr. 3,5"
            title="Koliko minut dela prihranimo na en kos"
            className={polje}
          />
        </FilterPolje>
        <FilterPolje label="Material (€/kos)">
          <input
            value={v.eur}
            onChange={(e) => onChange({ ...v, eur: e.target.value })}
            inputMode="decimal"
            placeholder="npr. 0,80"
            title="Prihranek materiala na kos (lepilo, silikon, čistila, krpe)"
            className={polje}
          />
        </FilterPolje>
        <FilterIzbira
          label="Družina"
          hint="Družina pečic - letna količina za €/leto"
          value={v.druzina ?? 0}
          options={[
            { value: 0, label: "- brez družine -" },
            ...nastavitve.druzine.map((d) => ({
              value: d.druzina_id,
              label: d.kolicina_leto ? `${d.koda} (${formatNum(d.kolicina_leto)} kos/leto)` : d.koda,
            })),
          ]}
          onChange={(id) => onChange({ ...v, druzina: id || null })}
          className="[&>select]:w-full"
        />
        <FilterPolje label="Letna količina (kos)">
          <input
            value={v.kolicina}
            onChange={(e) => onChange({ ...v, kolicina: e.target.value })}
            inputMode="numeric"
            placeholder={druzina?.kolicina_leto ? `${formatNum(druzina.kolicina_leto)} (družina)` : "ni vpisano"}
            title="Prazno = letna količina družine; vpiši samo, če velja drugačna"
            className={polje}
          />
        </FilterPolje>
      </div>
      {p && p.imaPrihranek && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span>
            <strong className="text-lg tabular-nums text-ink-900">{formatEur2(p.eurKos)}</strong> <span className="text-ink-500">/ kos</span>
          </span>
          {p.eurLeto !== null ? (
            <span className="text-ink-700">
              <strong>{formatEur(p.eurLeto)}</strong> / leto · <strong>{formatH(p.hLeto ?? 0)}</strong> / leto
              {povracilo !== null && <span className="text-ink-500"> · povračilo v {formatNum(Math.round(povracilo * 10) / 10)} mes.</span>}
            </span>
          ) : null}
        </div>
      )}
      {p && p.imaPrihranek && p.kolicina === null && (
        <WarningText>Ni letne količine - izberi družino z vpisano količino ali vpiši količino. Brez nje akcija ne šteje v €/leto in h/leto.</WarningText>
      )}
    </div>
  );
}
