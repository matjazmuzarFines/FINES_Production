"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Search, Settings, Users } from "lucide-react";
import { addDays, formatDayMonth, formatShort, isoWeek, mondayOf, toIso, type IsoDate } from "@/lib/dates";
import { ODDELKI_NORMATIVA, naloziNormative, type Normativ, type OddelekKoda } from "@/lib/normativi";
import { useNeshranjeno } from "@/lib/neshranjeno";
import { formatNum, formatUre, parseNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import {
  KODE,
  izracunajNaloge,
  izvoziNalogeXlsx,
  naloziKapacitete,
  naloziZadnjiUvoz,
  naloziZasOddelke,
  preberiNalogeXlsx,
  razpolozljivo,
  shraniKapacitete,
  shraniPrivzeteOddelka,
  shraniUvoz,
  tedniOd,
  type Kapaciteta,
  type Nalog,
  type NalogIzracun,
  type Teden,
  type Uvoz,
  type UvozPregled,
  type ZasOddelek,
} from "@/lib/zasedenost";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfigMissing, Loading } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { SaveBar } from "@/components/rutina/SaveBar";
import { NalogiDropzone } from "./NalogiDropzone";

const STEVILO_TEDNOV = 8;

type Izbor =
  | { tip: "teden"; teden: IsoDate }
  | { tip: "zapadlo" }
  | { tip: "brez_roka" }
  | { tip: "vsi"; samoBrez?: boolean };

/** Barva obremenitve: do 85 % zelena, do 100 % rumena, nad 100 % rdeča. */
function obremenitev(potrebno: number, naVoljo: number) {
  const pct = naVoljo > 0 ? (potrebno / naVoljo) * 100 : potrebno > 0 ? Infinity : 0;
  const cls = pct > 100 ? "bg-nok-500" : pct > 85 ? "bg-warn-400" : "bg-ok-500";
  const txt = pct > 100 ? "text-nok-600" : pct > 85 ? "text-warn-700" : "text-ok-600";
  return { pct, cls, txt };
}

export function Zasedenost() {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <ZasedenostInner />;
}

function ZasedenostInner() {
  const notify = useToast();
  const danes = toIso(new Date());

  const [oddelki, setOddelki] = useState<ZasOddelek[] | null>(null);
  const [uvoz, setUvoz] = useState<Uvoz | null>(null);
  const [nalogi, setNalogi] = useState<Nalog[]>([]);
  const [normativi, setNormativi] = useState<Normativ[]>([]);
  const [kapacitete, setKapacitete] = useState<Kapaciteta[]>([]);
  const [tedni, setTedni] = useState<Teden[]>([]);

  const [zacetek, setZacetek] = useState<IsoDate>(() => mondayOf(toIso(new Date())));
  const [izbor, setIzbor] = useState<Izbor>(() => ({ tip: "teden", teden: mondayOf(toIso(new Date())) }));

  // Neshranjene spremembe kapacitet
  const [kapEdits, setKapEdits] = useState<Record<string, number>>({});
  const [dniEdits, setDniEdits] = useState<Record<IsoDate, number>>({});
  const [verzija, setVerzija] = useState(0);
  const [shranjujem, setShranjujem] = useState(false);

  // Uvoz
  const [pregled, setPregled] = useState<(UvozPregled & { datoteka: string }) | null>(null);
  const [uvazam, setUvazam] = useState(false);
  const [nastavitveOdprte, setNastavitveOdprte] = useState(false);
  // Filter oddelkov v tabeli nalogov (ostane ob menjavi tedna)
  const [filterOddelkov, setFilterOddelkov] = useState<OddelekKoda[]>([]);

  const steviloSprememb = Object.keys(kapEdits).length + Object.keys(dniEdits).length;
  useNeshranjeno(steviloSprememb > 0);

  async function naloziVse() {
    const od = addDays(mondayOf(toIso(new Date())), -7 * 52);
    const doo = addDays(mondayOf(toIso(new Date())), 7 * 104);
    const [o, u, n, k] = await Promise.all([
      naloziZasOddelke(),
      naloziZadnjiUvoz(),
      naloziNormative(true),
      naloziKapacitete(od, doo),
    ]);
    setOddelki(o);
    setUvoz(u.uvoz);
    setNalogi(u.nalogi);
    setNormativi(n);
    setKapacitete(k.kapacitete);
    setTedni(k.tedni);
  }

  useEffect(() => {
    let preklic = false;
    const od = addDays(mondayOf(toIso(new Date())), -7 * 52);
    const doo = addDays(mondayOf(toIso(new Date())), 7 * 104);
    Promise.all([naloziZasOddelke(), naloziZadnjiUvoz(), naloziNormative(true), naloziKapacitete(od, doo)])
      .then(([o, u, n, k]) => {
        if (preklic) return;
        setOddelki(o);
        setUvoz(u.uvoz);
        setNalogi(u.nalogi);
        setNormativi(n);
        setKapacitete(k.kapacitete);
        setTedni(k.tedni);
      })
      .catch((e) => notify("error", `Napaka pri nalaganju zasedenosti: ${e.message}`));
    return () => {
      preklic = true;
    };
  }, [notify]);

  const izracun = useMemo(() => izracunajNaloge(nalogi, normativi), [nalogi, normativi]);
  const prikazaniTedni = useMemo(() => tedniOd(zacetek, STEVILO_TEDNOV), [zacetek]);
  const brezNormativa = izracun.filter((n) => !n.normativ);
  const brezRoka = izracun.filter((n) => !n.teden);

  // Potrebne ure po oddelku in tednu (+ zapadlo = pred prvim prikazanim tednom)
  const potrebno = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of izracun) {
      if (!n.teden) continue;
      const kljuc = n.teden < zacetek ? "zapadlo" : n.teden;
      for (const k of KODE) m.set(`${k}|${kljuc}`, (m.get(`${k}|${kljuc}`) ?? 0) + n.ure[k]);
    }
    return m;
  }, [izracun, zacetek]);

  const steviloNalogov = (kljuc: string) =>
    izracun.filter((n) => n.teden && (kljuc === "zapadlo" ? n.teden < zacetek : n.teden === kljuc)).length;

  function kapaciteta(o: ZasOddelek, teden: IsoDate) {
    const osnova = razpolozljivo(o, teden, kapacitete, tedni);
    const zaposlenih = kapEdits[`${o.id}|${teden}`] ?? osnova.zaposlenih;
    const dni = dniEdits[teden] ?? osnova.dni;
    return { ...osnova, zaposlenih, dni, ure: zaposlenih * osnova.ureNaDan * dni };
  }

  async function shrani() {
    if (!oddelki) return;
    setShranjujem(true);
    try {
      await shraniKapacitete(
        Object.entries(kapEdits).map(([kljuc, st_zaposlenih]) => {
          const [id, teden_od] = kljuc.split("|");
          const obst = kapacitete.find((k) => k.oddelek_id === Number(id) && k.teden_od === teden_od);
          return { oddelek_id: Number(id), teden_od, st_zaposlenih, ure_na_dan: obst?.ure_na_dan ?? null };
        }),
        Object.entries(dniEdits).map(([teden_od, delovnih_dni]) => ({ teden_od, delovnih_dni })),
      );
      setKapEdits({});
      setDniEdits({});
      setVerzija((v) => v + 1);
      notify("success", "Razpoložljivost je shranjena.");
      await naloziVse();
    } catch (e) {
      notify("error", `Napaka pri shranjevanju: ${(e as Error).message}`, 10000);
    } finally {
      setShranjujem(false);
    }
  }

  async function izberiDatoteko(f: File) {
    try {
      setPregled({ ...(await preberiNalogeXlsx(f)), datoteka: f.name });
    } catch (e) {
      notify("error", (e as Error).message, 10000);
    }
  }

  async function potrdiUvoz() {
    if (!pregled) return;
    setUvazam(true);
    try {
      await shraniUvoz(pregled.datoteka, pregled.nalogi);
      notify("success", `Uvoženih nalogov: ${pregled.nalogi.length}.`);
      setPregled(null);
      await naloziVse();
    } catch (e) {
      notify("error", `Napaka pri uvozu: ${(e as Error).message}`, 10000);
    } finally {
      setUvazam(false);
    }
  }

  if (!oddelki) return <Loading />;

  const jeTaTeden = zacetek === mondayOf(danes);

  return (
    <div className="flex flex-col gap-4">
      {/* ============ GLAVA + UVOZ ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-xl font-bold text-ink-900">Zasedenost po delovnih tednih</h2>
          <p className="text-sm text-ink-500">Tedni od ponedeljka do nedelje · nalogi razvrščeni po roku izdelave</p>
        </div>
        <div className="w-full sm:w-80">
          <NalogiDropzone uvoz={uvoz} zaseden={uvazam} onFile={izberiDatoteko} />
        </div>
      </div>

      {!uvoz ? (
        <div className="fp-card p-8 text-center text-ink-600">
          Ni uvoženih nalogov. Povleci izvoz delovnih nalogov (.xlsx) v okno zgoraj desno.
        </div>
      ) : (
        <>
          {brezNormativa.length > 0 && (
            <button
              type="button"
              title="Prikaži naloge brez normativa"
              onClick={() => setIzbor({ tip: "vsi", samoBrez: true })}
              className="flex items-center gap-2 self-start rounded-lg bg-warn-50 px-3 py-2 text-left text-sm font-medium text-warn-700 hover:underline"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {brezNormativa.length} nalogov nima normativa - njihove ure niso upoštevane.
            </button>
          )}

          {/* ============ TEDENSKI PREGLED ============ */}
          <div className="fp-card p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <IconButton hint="Premakni pregled en teden nazaj" icon={ChevronLeft} onClick={() => setZacetek(addDays(zacetek, -7))} />
              <IconButton hint="Premakni pregled en teden naprej" icon={ChevronRight} onClick={() => setZacetek(addDays(zacetek, 7))} />
              <Button
                hint="Začni pregled s tekočim tednom"
                variant="neutral"
                disabled={jeTaTeden}
                onClick={() => setZacetek(mondayOf(danes))}
              >
                Ta teden
              </Button>
              <span className="ml-auto flex items-center gap-1 text-xs text-ink-500">
                <Users className="h-4 w-4" aria-hidden />
                Število zaposlenih vpiši za vsak teden posebej
              </span>
              <IconButton
                hint="Privzeto število zaposlenih in ure na dan"
                icon={Settings}
                onClick={() => setNastavitveOdprte(true)}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="w-32" />
                    <th className="align-bottom">
                      <TedenGlava
                        naslov={jeTaTeden ? "Zapadlo" : "Prej"}
                        podnaslov={`pred ${formatDayMonth(zacetek)}`}
                        stNalogov={steviloNalogov("zapadlo")}
                        izbran={izbor.tip === "zapadlo"}
                        onClick={() => setIzbor({ tip: "zapadlo" })}
                        rdeca={jeTaTeden}
                      />
                    </th>
                    {prikazaniTedni.map((t) => (
                      <th key={t} className="align-bottom">
                        <TedenGlava
                          naslov={`${isoWeek(t)}. teden`}
                          podnaslov={`${formatDayMonth(t)} – ${formatDayMonth(addDays(t, 6))}`}
                          stNalogov={steviloNalogov(t)}
                          izbran={izbor.tip === "teden" && izbor.teden === t}
                          trenutni={t === mondayOf(danes)}
                          onClick={() => setIzbor({ tip: "teden", teden: t })}
                        />
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <td className="pr-2 text-right text-xs font-semibold text-ink-500">Delovni dnevi</td>
                    <td />
                    {prikazaniTedni.map((t) => {
                      const dni = dniEdits[t] ?? tedni.find((x) => x.teden_od === t)?.delovnih_dni ?? 5;
                      return (
                        <td key={t} className="text-center">
                          <SteviloInput
                            key={`dni-${t}-${verzija}`}
                            value={dni}
                            max={7}
                            hint={`Število delovnih dni v ${isoWeek(t)}. tednu (prazniki)`}
                            spremenjeno={dniEdits[t] !== undefined}
                            onCommit={(v) => setDniEdits((d) => ({ ...d, [t]: v }))}
                          />
                        </td>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {oddelki.map((o) => {
                    const zap = potrebno.get(`${o.koda}|zapadlo`) ?? 0;
                    return (
                      <tr key={o.id}>
                        <th className="pr-2 text-right align-middle">
                          <div className="text-sm font-bold text-ink-800">{o.naziv}</div>
                          <div className="text-[11px] font-normal text-ink-500">{formatNum(o.ure_na_dan)} h/dan na osebo</div>
                        </th>
                        <td className="rounded-lg bg-ink-50 p-2 text-center align-middle">
                          <div className={`text-base font-bold tabular-nums ${zap > 0 && jeTaTeden ? "text-nok-600" : "text-ink-700"}`}>
                            {formatUre(zap)} h
                          </div>
                          <div className="text-[11px] text-ink-500">potrebno</div>
                        </td>
                        {prikazaniTedni.map((t) => {
                          const kap = kapaciteta(o, t);
                          const pot = potrebno.get(`${o.koda}|${t}`) ?? 0;
                          const ob = obremenitev(pot, kap.ure);
                          const kljuc = `${o.id}|${t}`;
                          return (
                            <td key={t} className="rounded-lg border border-ink-200 bg-white p-2 align-top">
                              <div className="flex items-center justify-between gap-1">
                                <SteviloInput
                                  key={`${kljuc}-${verzija}`}
                                  value={kap.zaposlenih}
                                  hint={`Število zaposlenih: ${o.naziv}, ${isoWeek(t)}. teden`}
                                  spremenjeno={kapEdits[kljuc] !== undefined}
                                  onCommit={(v) => setKapEdits((k) => ({ ...k, [kljuc]: v }))}
                                />
                                <span className="text-[11px] text-ink-500">oseb</span>
                              </div>
                              <div
                                className="mt-1.5 text-xs tabular-nums text-ink-700"
                                title={`Potrebno ${formatUre(pot)} h od razpoložljivih ${formatUre(kap.ure)} h`}
                              >
                                <strong>{formatUre(pot)}</strong> / {formatUre(kap.ure)} h
                              </div>
                              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                                <div className={`h-full ${ob.cls}`} style={{ width: `${Math.min(100, ob.pct)}%` }} />
                              </div>
                              <div className={`mt-0.5 text-right text-xs font-bold tabular-nums ${ob.txt}`}>
                                {Number.isFinite(ob.pct) ? `${Math.round(ob.pct)} %` : "∞"}
                                <span className="ml-1 font-normal text-ink-500">
                                  ({kap.ure - pot >= 0 ? "+" : ""}
                                  {formatUre(kap.ure - pot)} h)
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <SkupajVrstica
                    oddelki={oddelki}
                    tedni={prikazaniTedni}
                    potrebno={potrebno}
                    kapaciteta={kapaciteta}
                  />
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
              <Legenda cls="bg-ok-500" label="do 85 %" />
              <Legenda cls="bg-warn-400" label="85–100 %" />
              <Legenda cls="bg-nok-500" label="nad 100 % (preobremenjeno)" />
              <span>Razpoložljivo = zaposleni × ure na dan × delovni dnevi</span>
            </div>
          </div>

          {/* ============ NALOGI ============ */}
          <NalogiTabela
            key={JSON.stringify(izbor)}
            izracun={izracun}
            izbor={izbor}
            zacetek={zacetek}
            brezRoka={brezRoka.length}
            onIzbor={setIzbor}
            filterOddelkov={filterOddelkov}
            onFilterOddelkov={setFilterOddelkov}
          />
        </>
      )}

      <SaveBar
        steviloSprememb={steviloSprememb}
        shranjujem={shranjujem}
        onSave={shrani}
        onReset={() => {
          setKapEdits({});
          setDniEdits({});
          setVerzija((v) => v + 1);
        }}
        shraniLabel="Shrani razpoložljivost"
        shraniHint="Shrani število zaposlenih in delovne dni"
      />

      {/* ============ PREGLED UVOZA ============ */}
      <Modal open={!!pregled} title={`Uvoz: ${pregled?.datoteka ?? ""}`} onClose={() => !uvazam && setPregled(null)}>
        {pregled && (
          <UvozPregledVsebina
            pregled={pregled}
            normativi={normativi}
            uvazam={uvazam}
            onPreklici={() => setPregled(null)}
            onPotrdi={potrdiUvoz}
          />
        )}
      </Modal>

      <Modal open={nastavitveOdprte} title="Privzeta razpoložljivost oddelkov" onClose={() => setNastavitveOdprte(false)}>
        <OddelkiNastavitve
          oddelki={oddelki}
          onShranjeno={async () => {
            setNastavitveOdprte(false);
            notify("success", "Privzete vrednosti so shranjene.");
            await naloziVse();
          }}
          onNapaka={(m) => notify("error", m)}
        />
      </Modal>
    </div>
  );
}

// =====================================================================
// POMOŽNE KOMPONENTE
// =====================================================================

function TedenGlava({
  naslov,
  podnaslov,
  stNalogov,
  izbran,
  trenutni,
  rdeca,
  onClick,
}: {
  naslov: string;
  podnaslov: string;
  stNalogov: number;
  izbran: boolean;
  trenutni?: boolean;
  rdeca?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={`Prikaži naloge: ${naslov} (${podnaslov})`}
      onClick={onClick}
      className={`w-full rounded-lg border-2 px-2 py-1.5 text-center transition-colors ${
        izbran
          ? "border-fines-500 bg-fines-500 text-white"
          : trenutni
            ? "border-sync-500 bg-white text-sync-600 hover:bg-ink-50"
            : "border-ink-200 bg-white text-ink-800 hover:border-fines-500"
      }`}
    >
      <div className={`text-sm font-bold ${rdeca && !izbran ? "text-nok-600" : ""}`}>{naslov}</div>
      <div className="text-[11px] font-normal opacity-80">{podnaslov}</div>
      <div className="text-[11px] font-semibold opacity-90">{stNalogov} nalogov</div>
    </button>
  );
}

function SteviloInput({
  value,
  onCommit,
  hint,
  spremenjeno,
  max,
}: {
  value: number;
  onCommit: (v: number) => void;
  hint: string;
  spremenjeno: boolean;
  max?: number;
}) {
  return (
    <input
      defaultValue={formatNum(value)}
      inputMode="decimal"
      title={hint}
      aria-label={hint}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const n = parseNum(e.target.value);
        if (n === null || n < 0 || (max !== undefined && n > max)) {
          e.target.value = formatNum(value);
          return;
        }
        if (n !== value) onCommit(n);
      }}
      className={`h-8 w-14 rounded-md border px-1 text-center text-sm font-semibold tabular-nums focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 ${
        spremenjeno ? "border-warn-400 bg-warn-50" : "border-ink-200 bg-white"
      }`}
    />
  );
}

function SkupajVrstica({
  oddelki,
  tedni,
  potrebno,
  kapaciteta,
}: {
  oddelki: ZasOddelek[];
  tedni: IsoDate[];
  potrebno: Map<string, number>;
  kapaciteta: (o: ZasOddelek, t: IsoDate) => { ure: number };
}) {
  const zap = oddelki.reduce((s, o) => s + (potrebno.get(`${o.koda}|zapadlo`) ?? 0), 0);
  return (
    <tr>
      <th className="pr-2 text-right text-sm font-bold text-ink-900">Skupaj</th>
      <td className="rounded-lg bg-ink-800 p-2 text-center text-sm font-bold tabular-nums text-white">{formatUre(zap)} h</td>
      {tedni.map((t) => {
        const pot = oddelki.reduce((s, o) => s + (potrebno.get(`${o.koda}|${t}`) ?? 0), 0);
        const kap = oddelki.reduce((s, o) => s + kapaciteta(o, t).ure, 0);
        const ob = obremenitev(pot, kap);
        return (
          <td key={t} className="rounded-lg bg-ink-800 p-2 text-center text-xs tabular-nums text-white">
            <strong>{formatUre(pot)}</strong> / {formatUre(kap)} h
            <div className={`font-bold ${ob.pct > 100 ? "text-nok-500" : ob.pct > 85 ? "text-warn-400" : "text-ok-500"}`}>
              {Number.isFinite(ob.pct) ? `${Math.round(ob.pct)} %` : "∞"}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function Legenda({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

// =====================================================================
// TABELA NALOGOV IZBRANEGA TEDNA
// =====================================================================

function NalogiTabela({
  izracun,
  izbor,
  zacetek,
  brezRoka,
  onIzbor,
  filterOddelkov,
  onFilterOddelkov,
}: {
  izracun: NalogIzracun[];
  izbor: Izbor;
  zacetek: IsoDate;
  brezRoka: number;
  onIzbor: (i: Izbor) => void;
  filterOddelkov: OddelekKoda[];
  onFilterOddelkov: (k: OddelekKoda[]) => void;
}) {
  const [iskanje, setIskanje] = useState("");
  const [samoBrez, setSamoBrez] = useState(izbor.tip === "vsi" && !!izbor.samoBrez);

  const naslov =
    izbor.tip === "teden"
      ? `${isoWeek(izbor.teden)}. teden (${formatShort(izbor.teden)} – ${formatShort(addDays(izbor.teden, 6))})`
      : izbor.tip === "zapadlo"
        ? `Rok pred ${formatShort(zacetek)}`
        : izbor.tip === "brez_roka"
          ? "Nalogi brez roka izdelave"
          : "Vsi nalogi";

  const q = iskanje.trim().toLowerCase();
  const vrstice = izracun
    .filter((n) =>
      izbor.tip === "teden"
        ? n.teden === izbor.teden
        : izbor.tip === "zapadlo"
          ? n.teden !== null && n.teden < zacetek
          : izbor.tip === "brez_roka"
            ? n.teden === null
            : true,
    )
    .filter((n) => !samoBrez || !n.normativ)
    // Oddelki: nalog ima normativ > 0 v vsaj enem izbranem oddelku. Nalogi brez normativa so vedno prikazani.
    .filter(
      (n) =>
        filterOddelkov.length === 0 ||
        !n.normativ ||
        ODDELKI_NORMATIVA.some((o) => filterOddelkov.includes(o.koda) && n.normativ![o.polje] > 0),
    )
    .filter(
      (n) =>
        !q ||
        [n.st_naloga, n.koda_artikla, n.naziv_artikla, n.skupina_dn, n.krovni_dn, n.narocnik].some((v) =>
          String(v ?? "").toLowerCase().includes(q),
        ),
    )
    .sort((a, b) => (a.rok_izdelave ?? "9999").localeCompare(b.rok_izdelave ?? "9999") || a.st_naloga.localeCompare(b.st_naloga));

  const vsota = (k: OddelekKoda | "skupaj") =>
    vrstice.reduce((s, n) => s + (k === "skupaj" ? n.ureSkupaj : n.ure[k]), 0);

  return (
    <div className="fp-card flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg font-bold text-ink-900">
          {naslov} <span className="text-sm font-normal text-ink-500">· {vrstice.length} nalogov</span>
        </h3>
        <div className="flex gap-1">
          <Button
            hint="Prikaži vse uvožene naloge"
            variant={izbor.tip === "vsi" ? "primary" : "neutral"}
            onClick={() => onIzbor({ tip: "vsi" })}
          >
            Vsi
          </Button>
          {brezRoka > 0 && (
            <Button
              hint="Prikaži naloge brez roka izdelave"
              variant={izbor.tip === "brez_roka" ? "primary" : "neutral"}
              onClick={() => onIzbor({ tip: "brez_roka" })}
            >
              Brez roka ({brezRoka})
            </Button>
          )}
        </div>
        <Button
          hint="Izvozi prikazane naloge v Excel"
          variant="neutral"
          icon={Download}
          disabled={vrstice.length === 0}
          onClick={() =>
            izvoziNalogeXlsx(
              vrstice,
              `zasedenost_${izbor.tip === "teden" ? `teden_${isoWeek(izbor.teden)}_${izbor.teden}` : izbor.tip}.xlsx`,
            )
          }
        >
          Izvoz
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-ink-400" aria-hidden />
          <input
            value={iskanje}
            onChange={(e) => setIskanje(e.target.value)}
            placeholder="Išči nalog, kodo, naziv, skupino ..."
            title="Išči med prikazanimi nalogi"
            className="h-10 w-full rounded-lg border border-ink-200 pl-8 pr-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter po oddelkih">
          {ODDELKI_NORMATIVA.map((o) => {
            const aktiven = filterOddelkov.includes(o.koda);
            return (
              <button
                key={o.koda}
                type="button"
                aria-pressed={aktiven}
                title={`${aktiven ? "Odstrani filter" : "Prikaži naloge z normativom"}: ${o.label}`}
                onClick={() =>
                  onFilterOddelkov(aktiven ? filterOddelkov.filter((k) => k !== o.koda) : [...filterOddelkov, o.koda])
                }
                className={`h-9 rounded-full border px-3 text-sm font-semibold transition-colors ${
                  aktiven
                    ? "border-fines-500 bg-fines-500 text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:border-fines-500 hover:text-fines-500"
                }`}
              >
                {o.label}
              </button>
            );
          })}
          {filterOddelkov.length > 0 && (
            <button
              type="button"
              title="Počisti filter oddelkov"
              onClick={() => onFilterOddelkov([])}
              className="px-2 text-xs font-semibold text-ink-500 hover:underline"
            >
              Počisti
            </button>
          )}
        </div>
        <label title="Prikaži samo naloge brez normativa" className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={samoBrez} onChange={(e) => setSamoBrez(e.target.checked)} className="h-4 w-4 accent-fines-500" />
          Samo brez normativa
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-ink-800 text-left text-xs font-semibold uppercase tracking-wide text-ink-100">
            <tr>
              <th className="px-2 py-2">Nalog</th>
              <th className="px-2 py-2">Krovni</th>
              <th className="px-2 py-2">Skupina DN</th>
              <th className="px-2 py-2">Koda</th>
              <th className="px-2 py-2">Naziv artikla</th>
              <th className="px-2 py-2">Rok</th>
              <th className="px-2 py-2 text-right">Preost.</th>
              {KODE.map((k) => (
                <th key={k} className="px-2 py-2 text-right">
                  {k} h
                </th>
              ))}
              <th className="px-2 py-2 text-right">Skupaj h</th>
            </tr>
          </thead>
          <tbody>
            {vrstice.map((n) => (
              <tr key={n.st_naloga} className={`border-b border-ink-100 ${n.normativ ? "hover:bg-ink-50" : "bg-warn-50"}`}>
                <td className="px-2 py-1.5 font-mono">{n.st_naloga}</td>
                <td className="px-2 py-1.5">{n.krovni_dn}</td>
                <td className="px-2 py-1.5">{n.skupina_dn}</td>
                <td className="px-2 py-1.5 font-mono">
                  {n.normativ ? (
                    n.koda_artikla
                  ) : (
                    <Link
                      href={`/proizvodnja/normativi?nov=${encodeURIComponent(n.koda_artikla)}&naziv=${encodeURIComponent(n.naziv_artikla ?? "")}`}
                      title="Ni normativa - dodaj nov normativ za ta artikel"
                      className="inline-flex items-center gap-1 font-semibold text-warn-700 hover:underline"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {n.koda_artikla}
                    </Link>
                  )}
                </td>
                <td className="max-w-80 truncate px-2 py-1.5" title={n.naziv_artikla ?? ""}>
                  {n.naziv_artikla}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">{n.rok_izdelave ? formatShort(n.rok_izdelave) : "–"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(n.preostala)}</td>
                {KODE.map((k) => (
                  <td key={k} className="px-2 py-1.5 text-right tabular-nums text-ink-600">
                    {n.ure[k] ? formatUre(n.ure[k]) : ""}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {n.normativ ? formatUre(n.ureSkupaj) : <span className="text-xs font-normal text-warn-700">ni normativa</span>}
                </td>
              </tr>
            ))}
            {vrstice.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-ink-500">
                  Ni nalogov.
                </td>
              </tr>
            )}
          </tbody>
          {vrstice.length > 0 && (
            <tfoot className="font-bold">
              <tr className="border-t-2 border-ink-300">
                <td colSpan={7} className="px-2 py-2 text-right">
                  Skupaj
                </td>
                {KODE.map((k) => (
                  <td key={k} className="px-2 py-2 text-right tabular-nums">
                    {formatUre(vsota(k))}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums">{formatUre(vsota("skupaj"))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// =====================================================================
// MODALI
// =====================================================================

function UvozPregledVsebina({
  pregled,
  normativi,
  uvazam,
  onPreklici,
  onPotrdi,
}: {
  pregled: UvozPregled;
  normativi: Normativ[];
  uvazam: boolean;
  onPreklici: () => void;
  onPotrdi: () => void;
}) {
  const identi = new Set(normativi.map((n) => n.ident));
  const brez = pregled.nalogi.filter((n) => !identi.has(n.koda_artikla)).length;
  const roki = pregled.nalogi.map((n) => n.rok_izdelave).filter((r): r is string => !!r).sort();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-ink-50 p-3">
          <div className="text-2xl font-bold text-ok-600">{pregled.nalogi.length}</div>
          <div className="text-xs text-ink-500">nalogov</div>
        </div>
        <div className="rounded-lg bg-ink-50 p-3">
          <div className={`text-2xl font-bold ${brez ? "text-warn-700" : "text-ink-500"}`}>{brez}</div>
          <div className="text-xs text-ink-500">brez normativa</div>
        </div>
        <div className="rounded-lg bg-ink-50 p-3">
          <div className="text-sm font-bold text-ink-800">
            {roki.length ? `${formatShort(roki[0])} – ${formatShort(roki[roki.length - 1])}` : "–"}
          </div>
          <div className="text-xs text-ink-500">roki izdelave</div>
        </div>
      </div>
      <p className="text-ink-600">
        Uvoz <strong>nadomesti</strong> trenutno prikazane naloge. Prejšnji uvozi ostanejo shranjeni v bazi.
      </p>
      {pregled.opozorila.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg bg-warn-50 p-3 text-warn-700">
          <ul className="list-disc space-y-0.5 pl-5">
            {pregled.opozorila.slice(0, 50).map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button hint="Prekliči uvoz nalogov" variant="neutral" disabled={uvazam} onClick={onPreklici}>
          Prekliči
        </Button>
        <Button hint="Uvozi naloge in osveži zasedenost" variant="success" disabled={uvazam} onClick={onPotrdi}>
          {uvazam ? "Uvažam ..." : "Uvozi"}
        </Button>
      </div>
    </div>
  );
}

function OddelkiNastavitve({
  oddelki,
  onShranjeno,
  onNapaka,
}: {
  oddelki: ZasOddelek[];
  onShranjeno: () => void;
  onNapaka: (m: string) => void;
}) {
  const [vrednosti, setVrednosti] = useState(
    Object.fromEntries(oddelki.map((o) => [o.id, { zap: formatNum(o.privzeto_zaposlenih), ure: formatNum(o.ure_na_dan) }])),
  );
  const [shranjujem, setShranjujem] = useState(false);

  async function shrani() {
    setShranjujem(true);
    try {
      for (const o of oddelki) {
        const zap = parseNum(vrednosti[o.id].zap);
        const ure = parseNum(vrednosti[o.id].ure);
        if (zap === null || ure === null || zap < 0 || ure < 0 || ure > 24) {
          throw new Error(`Neveljavna vrednost pri oddelku ${o.naziv}.`);
        }
        if (zap !== o.privzeto_zaposlenih || ure !== o.ure_na_dan) await shraniPrivzeteOddelka(o.id, zap, ure);
      }
      onShranjeno();
    } catch (e) {
      onNapaka((e as Error).message);
    } finally {
      setShranjujem(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink-600">
        Privzete vrednosti veljajo za vse tedne, kjer število zaposlenih ni vpisano posebej.
      </p>
      <table className="w-full">
        <thead className="text-left text-xs text-ink-500">
          <tr>
            <th className="py-1">Oddelek</th>
            <th className="py-1">Zaposlenih</th>
            <th className="py-1">Ure na dan / osebo</th>
          </tr>
        </thead>
        <tbody>
          {oddelki.map((o) => (
            <tr key={o.id} className="border-t border-ink-100">
              <td className="py-2 font-semibold">{o.naziv}</td>
              {(["zap", "ure"] as const).map((polje) => (
                <td key={polje} className="py-2 pr-2">
                  <input
                    value={vrednosti[o.id][polje]}
                    inputMode="decimal"
                    title={polje === "zap" ? `Privzeto število zaposlenih: ${o.naziv}` : `Delovne ure na dan: ${o.naziv}`}
                    onChange={(e) => setVrednosti((v) => ({ ...v, [o.id]: { ...v[o.id], [polje]: e.target.value } }))}
                    className="h-9 w-24 rounded-md border border-ink-200 px-2 text-right focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Button hint="Shrani privzete vrednosti oddelkov" variant="success" disabled={shranjujem} onClick={shrani} className="self-end">
        {shranjujem ? "Shranjujem ..." : "Shrani"}
      </Button>
    </div>
  );
}
