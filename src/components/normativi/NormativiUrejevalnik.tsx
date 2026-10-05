"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Info,
  Plus,
  Search,
} from "lucide-react";
import {
  CSV_PREDLOGA,
  ODDELKI_NORMATIVA,
  nastaviVidnost,
  naloziNormative,
  normativiVCsv,
  prenesiDatoteko,
  preberiCsv,
  shraniNormative,
  uvoziNormative,
  vsotaNeUjema,
  type CsvRezultat,
  type Normativ,
  type NormativPolje,
} from "@/lib/normativi";
import { useNeshranjeno } from "@/lib/neshranjeno";
import { formatNum, parseNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfigMissing, Loading } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { SaveBar } from "@/components/rutina/SaveBar";
import { CsvNavodila } from "./CsvNavodila";

const NA_STRAN = 50;

const NORMATIV_STOLPCI: { polje: NormativPolje; label: string }[] = [
  { polje: "normativ_skupni", label: "Skupni" },
  ...ODDELKI_NORMATIVA.map((o) => ({ polje: o.polje, label: o.label })),
];

const PRAZEN: Omit<Normativ, "id"> = {
  ident: "",
  naziv: "",
  druzina: "",
  velikost: null,
  normativ_skupni: 0,
  normativ_proizvodnja: 0,
  normativ_montaza: 0,
  normativ_elektro: 0,
  normativ_testiranje: 0,
  barvanje: false,
  cleaning: false,
  opomba: null,
  visible: true,
};

export function NormativiUrejevalnik({ zacetniIdent }: { zacetniIdent?: string }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <Urejevalnik zacetniIdent={zacetniIdent} />;
}

function Urejevalnik({ zacetniIdent }: { zacetniIdent?: string }) {
  const notify = useToast();
  const [vsi, setVsi] = useState<Normativ[] | null>(null);
  const [urejanja, setUrejanja] = useState<Record<number, Normativ>>({});
  const [noviId, setNoviId] = useState(0); // novi normativi imajo id <= 0
  const [izbrani, setIzbrani] = useState<Set<number>>(new Set());
  const [verzija, setVerzija] = useState(0);
  const [shranjujem, setShranjujem] = useState(false);

  // Filtri
  const [fIdent, setFIdent] = useState(zacetniIdent ?? "");
  const [fNaziv, setFNaziv] = useState("");
  const [fDruzine, setFDruzine] = useState<string[]>([]);
  const [fVelikost, setFVelikost] = useState("");
  const [fBarvanje, setFBarvanje] = useState<"" | "DA" | "NE">("");
  const [fSamoNapake, setFSamoNapake] = useState(false);
  const [fBrezNormativa, setFBrezNormativa] = useState(false);
  const [fSkriti, setFSkriti] = useState(false);
  const [stran, setStran] = useState(0);

  // CSV
  const [navodilaOdprta, setNavodilaOdprta] = useState(false);
  const [csv, setCsv] = useState<(CsvRezultat & { datoteka: string }) | null>(null);
  const [uvazam, setUvazam] = useState(false);

  const steviloSprememb = Object.keys(urejanja).length;
  useNeshranjeno(steviloSprememb > 0);

  async function nalozi() {
    try {
      setVsi(await naloziNormative());
    } catch (e) {
      notify("error", `Napaka pri nalaganju normativov: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    naloziNormative()
      .then(setVsi)
      .catch((e) => notify("error", `Napaka pri nalaganju normativov: ${e.message}`));
  }, [notify]);

  // Trenutno stanje = shranjeno + neshranjena urejanja + novi
  const vrstice = useMemo(() => {
    if (!vsi) return [];
    const novi = Object.values(urejanja).filter((n) => n.id <= 0);
    return [...novi.sort((a, b) => b.id - a.id), ...vsi.map((n) => urejanja[n.id] ?? n)];
  }, [vsi, urejanja]);

  const druzine = useMemo(
    () => [...new Set(vrstice.map((n) => n.druzina).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sl")),
    [vrstice],
  );

  const filtrirane = useMemo(() => {
    const id = fIdent.trim().toLowerCase();
    const naz = fNaziv.trim().toLowerCase();
    const vel = parseNum(fVelikost);
    return vrstice.filter(
      (n) =>
        n.id <= 0 || // novi so vedno prikazani
        ((fSkriti || n.visible) &&
          (!id || n.ident.toLowerCase().includes(id)) &&
          (!naz || n.naziv.toLowerCase().includes(naz)) &&
          (fDruzine.length === 0 || fDruzine.includes(n.druzina) || (fDruzine.includes("(brez)") && !n.druzina)) &&
          (vel === null || n.velikost === vel) &&
          (!fBarvanje || n.barvanje === (fBarvanje === "DA")) &&
          (!fSamoNapake || vsotaNeUjema(n)) &&
          (!fBrezNormativa || n.normativ_skupni === 0)),
    );
  }, [vrstice, fIdent, fNaziv, fDruzine, fVelikost, fBarvanje, fSamoNapake, fBrezNormativa, fSkriti]);

  const steviloStrani = Math.max(1, Math.ceil(filtrirane.length / NA_STRAN));
  const trenutnaStran = Math.min(stran, steviloStrani - 1);
  const prikazane = filtrirane.slice(trenutnaStran * NA_STRAN, (trenutnaStran + 1) * NA_STRAN);
  const vseFiltriraneIzbrane = filtrirane.length > 0 && filtrirane.every((n) => izbrani.has(n.id));

  function filter<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setStran(0);
    };
  }

  function uredi(n: Normativ, sprememba: Partial<Normativ>) {
    setUrejanja((u) => ({ ...u, [n.id]: { ...n, ...sprememba } }));
  }

  function dodaj() {
    const id = noviId - 1;
    setNoviId(id);
    setUrejanja((u) => ({ ...u, [id]: { ...PRAZEN, id } }));
    setStran(0);
  }

  function preklopiIzbor(id: number) {
    setIzbrani((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function izberiVse() {
    setIzbrani(vseFiltriraneIzbrane ? new Set() : new Set(filtrirane.map((n) => n.id)));
  }

  async function shrani() {
    const spremenjeni = Object.values(urejanja);
    const neveljavni = spremenjeni.filter((n) => !n.ident.trim() || !n.naziv.trim());
    if (neveljavni.length) {
      notify("warning", "Vsak normativ mora imeti ident in naziv.");
      return;
    }
    setShranjujem(true);
    try {
      await shraniNormative(spremenjeni);
      setUrejanja({});
      setVerzija((v) => v + 1);
      notify("success", `Shranjenih normativov: ${spremenjeni.length}.`);
      await nalozi();
    } catch (e) {
      notify("error", `Napaka pri shranjevanju: ${(e as Error).message}`, 10000);
    } finally {
      setShranjujem(false);
    }
  }

  async function vidnostIzbranih(visible: boolean) {
    const ids = [...izbrani].filter((id) => id > 0);
    if (ids.length === 0) return;
    if (!visible && !window.confirm(`Skrijem ${ids.length} izbranih normativov? Podatki ostanejo v bazi.`)) return;
    try {
      await nastaviVidnost(ids, visible);
      setIzbrani(new Set());
      notify("success", `${visible ? "Prikazanih" : "Skritih"} normativov: ${ids.length}.`);
      await nalozi();
    } catch (e) {
      notify("error", (e as Error).message);
    }
  }

  function izvozi() {
    const izbor = izbrani.size ? filtrirane.filter((n) => izbrani.has(n.id)) : filtrirane;
    prenesiDatoteko(normativiVCsv(izbor), `normativi_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function izberiCsv(file: File) {
    const r = preberiCsv(await file.text());
    setCsv({ ...r, datoteka: file.name });
  }

  async function potrdiUvoz() {
    if (!csv) return;
    setUvazam(true);
    try {
      await uvoziNormative(csv);
      notify("success", `Uvoženih normativov: ${csv.vrstice.length}.`);
      setCsv(null);
      await nalozi();
    } catch (e) {
      notify("error", `Napaka pri uvozu: ${(e as Error).message}`, 10000);
    } finally {
      setUvazam(false);
    }
  }

  if (!vsi) return <Loading />;

  const obstojeciIdenti = new Set(vsi.map((n) => n.ident));
  const csvNovih = csv ? csv.vrstice.filter((v) => !obstojeciIdenti.has(v.ident)).length : 0;
  const steviloNapak = vrstice.filter((n) => n.visible && vsotaNeUjema(n)).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ============ ORODNA VRSTICA ============ */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xl font-bold text-ink-900">
          Normativi <span className="text-base font-normal text-ink-500">({vsi.filter((n) => n.visible).length})</span>
        </h2>
        <Button hint="Dodaj nov normativ v tabelo" variant="success" icon={Plus} onClick={dodaj}>
          Dodaj
        </Button>
        <label
          title="Uvozi normative iz CSV datoteke"
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-fines-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-fines-600"
        >
          <FileUp className="h-4 w-4" aria-hidden />
          Uvoz CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) izberiCsv(f);
              e.target.value = "";
            }}
          />
        </label>
        <IconButton hint="Navodila za CSV uvoz normativov" icon={Info} onClick={() => setNavodilaOdprta(true)} />
        <Button
          hint={izbrani.size ? "Izvozi izbrane normative v CSV" : "Izvozi filtrirane normative v CSV"}
          variant="neutral"
          icon={Download}
          onClick={izvozi}
        >
          Izvoz
        </Button>
      </div>

      {/* ============ FILTRI ============ */}
      <div className="fp-card grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <FilterInput label="Ident" value={fIdent} onChange={filter(setFIdent)} hint="Filtriraj po identu (šifri)" />
        <FilterInput label="Naziv" value={fNaziv} onChange={filter(setFNaziv)} hint="Filtriraj po nazivu" />
        <MultiSelect
          label="Družina"
          options={["(brez)", ...druzine]}
          value={fDruzine}
          onChange={filter(setFDruzine)}
          hint="Filtriraj po eni ali več družinah"
        />
        <FilterInput label="Velikost" value={fVelikost} onChange={filter(setFVelikost)} hint="Filtriraj po velikosti" />
        <label className="flex flex-col">
          <span className="mb-1 text-xs font-semibold text-ink-600">Barvanje</span>
          <select
            value={fBarvanje}
            title="Filtriraj po barvanju"
            onChange={(e) => filter(setFBarvanje)(e.target.value as "" | "DA" | "NE")}
            className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm focus:border-fines-500 focus:outline-none"
          >
            <option value="">Vse</option>
            <option value="DA">DA</option>
            <option value="NE">NE</option>
          </select>
        </label>
        <div className="col-span-2 flex flex-col justify-end gap-1 text-sm sm:col-span-3 lg:col-span-1">
          <Check label="Vsota ≠ skupni" value={fSamoNapake} onChange={filter(setFSamoNapake)} hint="Prikaži normative, kjer vsota oddelkov ni enaka skupnemu" />
          <Check label="Skupni = 0" value={fBrezNormativa} onChange={filter(setFBrezNormativa)} hint="Prikaži normative brez skupnega normativa" />
          <Check label="Prikaži skrite" value={fSkriti} onChange={filter(setFSkriti)} hint="Prikaži tudi skrite normative" />
        </div>
      </div>

      {steviloNapak > 0 && !fSamoNapake && (
        <button
          type="button"
          title="Prikaži normative, kjer se vsota ne ujema"
          onClick={() => filter(setFSamoNapake)(true)}
          className="flex items-center gap-2 self-start rounded-lg bg-warn-50 px-3 py-2 text-sm font-medium text-warn-700 hover:underline"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Pri {steviloNapak} normativih vsota oddelkov ni enaka skupnemu normativu.
        </button>
      )}

      {/* ============ IZBOR ============ */}
      {izbrani.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-fines-50 px-3 py-2 text-sm">
          <strong className="text-fines-700">Izbranih: {izbrani.size}</strong>
          <Button hint="Skrij izbrane normative" variant="danger" icon={EyeOff} onClick={() => vidnostIzbranih(false)}>
            Skrij
          </Button>
          {fSkriti && (
            <Button hint="Ponovno prikaži izbrane normative" variant="neutral" icon={Eye} onClick={() => vidnostIzbranih(true)}>
              Prikaži
            </Button>
          )}
          <Button hint="Počisti izbor" variant="neutral" onClick={() => setIzbrani(new Set())}>
            Počisti izbor
          </Button>
        </div>
      )}

      {/* ============ TABELA ============ */}
      <div className="fp-card overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 bg-ink-800 text-left text-xs font-semibold uppercase tracking-wide text-ink-100">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={vseFiltriraneIzbrane}
                  onChange={izberiVse}
                  title="Izberi vse filtrirane normative"
                  aria-label="Izberi vse"
                  className="h-4 w-4 accent-fines-500"
                />
              </th>
              <th className="px-2 py-2">Ident</th>
              <th className="px-2 py-2">Naziv</th>
              <th className="px-2 py-2">Družina</th>
              <th className="px-2 py-2 text-right">Velikost</th>
              {NORMATIV_STOLPCI.map((s) => (
                <th key={s.polje} className="px-2 py-2 text-right">
                  {s.label}
                  <span className="block text-[10px] font-normal normal-case text-ink-300">h/kos</span>
                </th>
              ))}
              <th className="px-2 py-2 text-center">Barv.</th>
              <th className="px-2 py-2 text-center">Clean.</th>
            </tr>
          </thead>
          <tbody>
            {prikazane.map((n) => {
              const spremenjen = !!urejanja[n.id];
              const napaka = vsotaNeUjema(n);
              return (
                <tr
                  key={n.id}
                  className={`border-b border-ink-100 ${
                    spremenjen ? "bg-warn-50" : !n.visible ? "bg-ink-100 text-ink-400" : "hover:bg-ink-50"
                  }`}
                >
                  <td className="px-3 py-1">
                    <input
                      type="checkbox"
                      checked={izbrani.has(n.id)}
                      onChange={() => preklopiIzbor(n.id)}
                      title={`Izberi normativ ${n.ident}`}
                      aria-label={`Izberi ${n.ident}`}
                      className="h-4 w-4 accent-fines-500"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <TextCell key={`i${n.id}-${verzija}`} value={n.ident} onCommit={(v) => uredi(n, { ident: v })} hint="Ident (proizvodna šifra)" className="w-36 font-mono" />
                  </td>
                  <td className="px-1 py-1">
                    <TextCell key={`n${n.id}-${verzija}`} value={n.naziv} onCommit={(v) => uredi(n, { naziv: v })} hint="Naziv artikla" className="w-full min-w-64" />
                  </td>
                  <td className="px-1 py-1">
                    <TextCell
                      key={`d${n.id}-${verzija}`}
                      value={n.druzina}
                      onCommit={(v) => uredi(n, { druzina: v })}
                      hint="Družina (izberi ali vpiši novo)"
                      className="w-28"
                      list="fp-druzine"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumCell key={`v${n.id}-${verzija}`} value={n.velikost} onCommit={(v) => uredi(n, { velikost: v })} hint="Velikost" dovoliPrazno />
                  </td>
                  {NORMATIV_STOLPCI.map((s) => (
                    <td key={s.polje} className="px-1 py-1">
                      <div className="flex items-center justify-end gap-1">
                        {s.polje === "normativ_skupni" && napaka && (
                          <span
                            title={`Vsota oddelkov (${formatNum(
                              n.normativ_proizvodnja + n.normativ_montaza + n.normativ_elektro + n.normativ_testiranje,
                            )}) ni enaka skupnemu normativu`}
                          >
                            <AlertTriangle className="h-4 w-4 text-warn-500" aria-hidden />
                          </span>
                        )}
                        <NumCell
                          key={`${s.polje}${n.id}-${verzija}`}
                          value={n[s.polje]}
                          onCommit={(v) => uredi(n, { [s.polje]: v ?? 0 })}
                          hint={`Normativ ${s.label.toLowerCase()} (h/kos)`}
                          poudarjeno={s.polje === "normativ_skupni"}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={n.barvanje}
                      onChange={(e) => uredi(n, { barvanje: e.target.checked })}
                      title="Izdelek se barva"
                      className="h-4 w-4 accent-fines-500"
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={n.cleaning}
                      onChange={(e) => uredi(n, { cleaning: e.target.checked })}
                      title="Izdelek ima cleaning"
                      className="h-4 w-4 accent-fines-500"
                    />
                  </td>
                </tr>
              );
            })}
            {prikazane.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-ink-500">
                  Ni normativov, ki ustrezajo filtrom.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <datalist id="fp-druzine">
          {druzine.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>

      {/* ============ STRANI ============ */}
      <div className="flex items-center justify-between text-sm text-ink-600">
        <span>
          Prikazano {filtrirane.length ? trenutnaStran * NA_STRAN + 1 : 0}–
          {Math.min((trenutnaStran + 1) * NA_STRAN, filtrirane.length)} od {filtrirane.length}
        </span>
        <div className="flex items-center gap-1">
          <IconButton hint="Prejšnja stran" icon={ChevronLeft} disabled={trenutnaStran === 0} onClick={() => setStran(trenutnaStran - 1)} />
          <span className="px-2">
            {trenutnaStran + 1} / {steviloStrani}
          </span>
          <IconButton
            hint="Naslednja stran"
            icon={ChevronRight}
            disabled={trenutnaStran >= steviloStrani - 1}
            onClick={() => setStran(trenutnaStran + 1)}
          />
        </div>
      </div>

      <SaveBar
        steviloSprememb={steviloSprememb}
        shranjujem={shranjujem}
        onSave={shrani}
        onReset={() => {
          setUrejanja({});
          setVerzija((v) => v + 1);
        }}
        shraniLabel="Shrani normative"
        shraniHint="Shrani spremenjene in nove normative"
      />

      {/* ============ CSV ============ */}
      <Modal open={navodilaOdprta} title="Navodila za CSV uvoz" onClose={() => setNavodilaOdprta(false)}>
        <CsvNavodila onPredloga={() => prenesiDatoteko(CSV_PREDLOGA, "normativi_predloga.csv")} />
      </Modal>

      <Modal open={!!csv} title={`Uvoz: ${csv?.datoteka ?? ""}`} onClose={() => !uvazam && setCsv(null)}>
        {csv && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stevec label="Novih" value={csvNovih} cls="text-ok-600" />
              <Stevec label="Posodobljenih" value={csv.vrstice.length - csvNovih} cls="text-sync-600" />
              <Stevec label="Napak" value={csv.napake.length} cls={csv.napake.length ? "text-nok-600" : "text-ink-500"} />
            </div>
            {csv.stolpci.length > 0 && (
              <p className="text-ink-600">
                Posodobljeni bodo stolpci: <strong>{csv.stolpci.join(", ")}</strong>
              </p>
            )}
            {csv.napake.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg bg-nok-50 p-3 text-nok-600">
                <p className="mb-1 font-semibold">Vrstice z napako ne bodo uvožene:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {csv.napake.slice(0, 100).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button hint="Prekliči uvoz" variant="neutral" disabled={uvazam} onClick={() => setCsv(null)}>
                Prekliči
              </Button>
              <Button
                hint="Uvozi veljavne vrstice v bazo"
                variant="success"
                disabled={uvazam || csv.vrstice.length === 0}
                onClick={potrdiUvoz}
              >
                {uvazam ? "Uvažam ..." : `Uvozi ${csv.vrstice.length}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// =====================================================================
// CELICE IN FILTRI
// =====================================================================

const CELL =
  "h-8 rounded-md border border-transparent bg-transparent px-2 hover:border-ink-200 focus:border-fines-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-fines-100";

function TextCell({
  value,
  onCommit,
  hint,
  className = "",
  list,
}: {
  value: string;
  onCommit: (v: string) => void;
  hint: string;
  className?: string;
  list?: string;
}) {
  return (
    <input
      defaultValue={value}
      title={hint}
      aria-label={hint}
      list={list}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== value) onCommit(v);
      }}
      className={`${CELL} ${className}`}
    />
  );
}

function NumCell({
  value,
  onCommit,
  hint,
  dovoliPrazno,
  poudarjeno,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  hint: string;
  dovoliPrazno?: boolean;
  poudarjeno?: boolean;
}) {
  return (
    <input
      defaultValue={formatNum(value)}
      inputMode="decimal"
      title={hint}
      aria-label={hint}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const n = parseNum(raw);
        if (raw !== "" && (n === null || n < 0)) {
          e.target.value = formatNum(value);
          return;
        }
        const nova = n ?? (dovoliPrazno ? null : 0);
        if (nova !== value) onCommit(nova);
        e.target.value = formatNum(nova);
      }}
      className={`${CELL} w-20 text-right tabular-nums ${poudarjeno ? "font-bold" : ""}`}
    />
  );
}

function FilterInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-xs font-semibold text-ink-600">{label}</span>
      <span className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-ink-400" aria-hidden />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          title={hint}
          placeholder="Vse"
          className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-8 pr-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
        />
      </span>
    </label>
  );
}

function Check({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint: string;
}) {
  return (
    <label title={hint} className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-fines-500" />
      {label}
    </label>
  );
}

function Stevec({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-lg bg-ink-50 p-3">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-xs text-ink-500">{label}</div>
    </div>
  );
}
