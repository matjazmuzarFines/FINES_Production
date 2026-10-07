"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Info,
  Pencil,
  Plus,
  Scale,
  X,
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
  uporabiSkupnoSpremembo,
  uskladiNormativ,
  uvoziNormative,
  vsotaNeUjema,
  type CsvRezultat,
  type Normativ,
  type NormativPolje,
  type SkupnaSprememba,
} from "@/lib/normativi";
import { useNeshranjeno } from "@/lib/neshranjeno";
import { formatNum, parseNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfigMissing, Loading } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { FilterCheckbox, FilterIskanje, FilterIzbira, FilterVrstica } from "@/components/ui/Filtri";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { SaveBar } from "@/components/rutina/SaveBar";
import { CsvNavodila } from "./CsvNavodila";
import { SkupnaSpremembaOkno } from "./SkupnaSpremembaOkno";

const NA_STRAN = 50;

type NormKljuc = "ident" | "naziv" | "druzina" | "velikost" | NormativPolje | "barvanje" | "cleaning";

const NORM_VREDNOSTI: Record<NormKljuc, (n: Normativ) => string | number | null> = {
  ident: (n) => n.ident,
  naziv: (n) => n.naziv,
  druzina: (n) => n.druzina,
  velikost: (n) => n.velikost,
  normativ_skupni: (n) => n.normativ_skupni,
  normativ_proizvodnja: (n) => n.normativ_proizvodnja,
  normativ_montaza: (n) => n.normativ_montaza,
  normativ_elektro: (n) => n.normativ_elektro,
  normativ_testiranje: (n) => n.normativ_testiranje,
  barvanje: (n) => (n.barvanje ? 1 : 0),
  cleaning: (n) => (n.cleaning ? 1 : 0),
};

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

/** Nov normativ, ki ga odpremo iz zasedenosti (nalog brez normativa). */
export type NovNormativ = { ident: string; naziv: string };

export function NormativiUrejevalnik({ nov }: { nov?: NovNormativ }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <Urejevalnik nov={nov} />;
}

function Urejevalnik({ nov }: { nov?: NovNormativ }) {
  const notify = useToast();
  const [vsi, setVsi] = useState<Normativ[] | null>(null);
  const [urejanja, setUrejanja] = useState<Record<number, Normativ>>({});
  const [noviId, setNoviId] = useState(0); // novi normativi imajo id <= 0
  const [izbrani, setIzbrani] = useState<Set<number>>(new Set());
  const [verzija, setVerzija] = useState(0);
  const [shranjujem, setShranjujem] = useState(false);

  // Filtri
  const [fIdent, setFIdent] = useState("");
  const [fNaziv, setFNaziv] = useState("");
  const [fDruzine, setFDruzine] = useState<string[]>([]);
  const [fVelikost, setFVelikost] = useState("");
  const [fBarvanje, setFBarvanje] = useState<"" | "DA" | "NE">("");
  const [fSamoNapake, setFSamoNapake] = useState(false);
  const [fBrezNormativa, setFBrezNormativa] = useState(false);
  const [fSkriti, setFSkriti] = useState(false);
  const [stran, setStran] = useState(0);

  // Primerjava: nov normativ, po katerega družini in velikosti se filtrira tabela
  const [primerjavaId, setPrimerjavaId] = useState<number | null>(null);
  const [izZasedenosti, setIzZasedenosti] = useState(false);

  // CSV
  const [navodilaOdprta, setNavodilaOdprta] = useState(false);
  const [csv, setCsv] = useState<(CsvRezultat & { datoteka: string }) | null>(null);
  const [uvazam, setUvazam] = useState(false);
  const [skupnaOdprta, setSkupnaOdprta] = useState(false);

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
      .then((data) => {
        setVsi(data);
        if (!nov?.ident) return;
        // Prišli smo iz zasedenosti: pripravi novo vrstico z identom in nazivom
        window.history.replaceState(null, "", "/proizvodnja/normativi");
        setIzZasedenosti(true);
        if (data.some((n) => n.ident === nov.ident)) {
          setFIdent(nov.ident);
          notify("info", `Normativ ${nov.ident} že obstaja.`);
          return;
        }
        setNoviId(-1);
        setPrimerjavaId(-1);
        setUrejanja({ [-1]: { ...PRAZEN, id: -1, ident: nov.ident, naziv: nov.naziv } });
      })
      .catch((e) => notify("error", `Napaka pri nalaganju normativov: ${e.message}`));
  }, [notify, nov]);

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

  const sort = useRazvrscanje(NORM_VREDNOSTI);
  const filtriraneBrezSorta = useMemo(() => {
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
  // Razvrščanje po stolpcu (novi normativi ostanejo na vrhu)
  const filtrirane = [
    ...filtriraneBrezSorta.filter((n) => n.id <= 0),
    ...sort.razvrsti(filtriraneBrezSorta.filter((n) => n.id > 0)),
  ];

  const primerjava = primerjavaId !== null ? urejanja[primerjavaId] : undefined;
  const primerljivi = primerjava ? filtrirane.filter((n) => n.id > 0) : [];
  const povprecje = (polje: NormativPolje) =>
    primerljivi.length ? primerljivi.reduce((vs, n) => vs + n[polje], 0) / primerljivi.length : 0;

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
    // Nov normativ: tabela sproti pokaže primerljive (ista družina / velikost)
    if (n.id <= 0 && ("druzina" in sprememba || "velikost" in sprememba)) {
      const nova = { ...n, ...sprememba };
      setPrimerjavaId(n.id);
      setFDruzine(nova.druzina ? [nova.druzina] : []);
      setFVelikost(nova.velikost === null ? "" : formatNum(nova.velikost));
      setStran(0);
    }
  }

  /** Sprememba normativa v tabeli: skupni = vsota oddelkov ostane veljavno. */
  function urediNormativ(n: Normativ, polje: NormativPolje, vrednost: number) {
    const r = uskladiNormativ(n, polje, vrednost);
    if (typeof r === "string") {
      notify("warning", r);
      setVerzija((v) => v + 1); // povrni prikaz celice
      return;
    }
    uredi(n, {
      normativ_skupni: r.normativ_skupni,
      normativ_proizvodnja: r.normativ_proizvodnja,
      normativ_montaza: r.normativ_montaza,
      normativ_elektro: r.normativ_elektro,
      normativ_testiranje: r.normativ_testiranje,
    });
  }

  /** Okno "Spremeni normative": vrne napake ali uporabi spremembe (neshranjene, za pregled). */
  function uporabiSkupno(sprememba: SkupnaSprememba): string[] {
    const izbor = vrstice.filter((n) => izbrani.has(n.id));
    const napake: string[] = [];
    const nove: Record<number, Normativ> = {};
    for (const n of izbor) {
      const r = uporabiSkupnoSpremembo(n, sprememba);
      if (typeof r === "string") napake.push(`${n.ident}: ${r}`);
      else nove[n.id] = r;
    }
    if (napake.length) return napake;
    setUrejanja((u) => ({ ...u, ...nove }));
    setVerzija((v) => v + 1);
    setSkupnaOdprta(false);
    notify("info", `Spremenjenih ${izbor.length} normativov (rumeno). Preglej jih in klikni Shrani normative.`, 7000);
    return [];
  }

  function koncajPrimerjavo() {
    setPrimerjavaId(null);
    setFDruzine([]);
    setFVelikost("");
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
      setPrimerjavaId(null);
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
    const r = preberiCsv(await file.text(), vsi ?? []);
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
      <FilterVrstica className="fp-card p-3">
        <FilterIskanje
          label="Ident"
          value={fIdent}
          onChange={filter(setFIdent)}
          placeholder="Vse"
          hint="Filtriraj po identu (šifri)"
          className="w-full sm:w-44"
        />
        <FilterIskanje
          label="Naziv"
          value={fNaziv}
          onChange={filter(setFNaziv)}
          placeholder="Vse"
          hint="Filtriraj po nazivu"
          className="w-full sm:w-64"
        />
        <div className="w-full sm:w-44">
          <MultiSelect
            label="Družina"
            options={["(brez)", ...druzine]}
            value={fDruzine}
            onChange={filter(setFDruzine)}
            hint="Filtriraj po eni ali več družinah"
          />
        </div>
        <FilterIskanje
          label="Velikost"
          value={fVelikost}
          onChange={filter(setFVelikost)}
          placeholder="Vse"
          hint="Filtriraj po velikosti"
          className="w-full sm:w-28"
        />
        <FilterIzbira
          label="Barvanje"
          value={fBarvanje}
          options={[
            { value: "", label: "Vse" },
            { value: "DA", label: "DA" },
            { value: "NE", label: "NE" },
          ]}
          onChange={(v) => filter(setFBarvanje)(v as "" | "DA" | "NE")}
          hint="Filtriraj po barvanju"
        />
        <FilterCheckbox
          label="Vsota ≠ skupni"
          checked={fSamoNapake}
          onChange={filter(setFSamoNapake)}
          hint="Prikaži normative, kjer vsota oddelkov ni enaka skupnemu"
        />
        <FilterCheckbox
          label="Skupni = 0"
          checked={fBrezNormativa}
          onChange={filter(setFBrezNormativa)}
          hint="Prikaži normative brez skupnega normativa"
        />
        <FilterCheckbox label="Prikaži skrite" checked={fSkriti} onChange={filter(setFSkriti)} hint="Prikaži tudi skrite normative" />
      </FilterVrstica>

      {primerjava && (
        <div className="fp-card flex flex-col gap-2 border-l-4 border-l-fines-500 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Scale className="h-5 w-5 text-fines-500" aria-hidden />
            <strong className="text-ink-900">Nov normativ {primerjava.ident || "(brez identa)"}</strong>
            <span className="text-ink-600">
              {primerjava.druzina || primerjava.velikost !== null
                ? `· primerjava: družina ${primerjava.druzina || "vse"}, velikost ${primerjava.velikost ?? "vse"} (${primerljivi.length})`
                : "· vpiši družino in velikost - spodaj se prikažejo primerljivi normativi"}
            </span>
            <span className="ml-auto flex gap-2">
              {izZasedenosti && (
                <Link
                  href="/proizvodnja/zasedenost"
                  title="Vrni se na zasedenost"
                  className="inline-flex h-10 items-center rounded-lg border border-ink-200 bg-white px-4 font-semibold text-ink-700 shadow-sm hover:bg-ink-100"
                >
                  Nazaj na zasedenost
                </Link>
              )}
              <Button hint="Počisti filtre primerjave" variant="neutral" icon={X} onClick={koncajPrimerjavo}>
                Končaj primerjavo
              </Button>
            </span>
          </div>
          {primerljivi.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-700">
              <span className="font-semibold">Povprečje primerljivih (h/kos):</span>
              {NORMATIV_STOLPCI.map((st) => (
                <span key={st.polje}>
                  {st.label}: <strong className="tabular-nums">{formatNum(Math.round(povprecje(st.polje) * 1000) / 1000)}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
          <Button
            hint="Spremeni vrednosti vseh izbranih normativov"
            variant="primary"
            icon={Pencil}
            onClick={() => setSkupnaOdprta(true)}
          >
            Spremeni normative
          </Button>
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
      <TabelaOkvir className="fp-card">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="fp-thead">
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
              <SortTh sort={sort} kljuc="ident">Ident</SortTh>
              <SortTh sort={sort} kljuc="naziv">Naziv</SortTh>
              <SortTh sort={sort} kljuc="druzina">Družina</SortTh>
              <SortTh sort={sort} kljuc="velikost" desno>Velikost</SortTh>
              {NORMATIV_STOLPCI.map((s) => (
                <SortTh key={s.polje} sort={sort} kljuc={s.polje} desno>
                  {s.label}
                  <span className="block text-[10px] font-normal normal-case text-ink-300">h/kos</span>
                </SortTh>
              ))}
              <SortTh sort={sort} kljuc="barvanje" className="text-center">Barv.</SortTh>
              <SortTh sort={sort} kljuc="cleaning" className="text-center">Clean.</SortTh>
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
                    n.id === primerjavaId
                      ? "bg-fines-50 outline outline-2 -outline-offset-2 outline-fines-500"
                      : spremenjen
                        ? "bg-warn-50"
                        : !n.visible ? "bg-ink-100 text-ink-400" : "hover:bg-ink-50"
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
                      sprotno={n.id <= 0}
                      autoFocus={n.id === primerjavaId && !n.druzina}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumCell
                      key={`v${n.id}-${verzija}`}
                      value={n.velikost}
                      onCommit={(v) => uredi(n, { velikost: v })}
                      hint="Velikost"
                      dovoliPrazno
                      sprotno={n.id <= 0}
                    />
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
                          key={`${s.polje}${n.id}-${verzija}-${n[s.polje]}`}
                          value={n[s.polje]}
                          onCommit={(v) => urediNormativ(n, s.polje, v ?? 0)}
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
      </TabelaOkvir>

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

      <Modal open={skupnaOdprta} title="Spremeni normative" onClose={() => setSkupnaOdprta(false)}>
        <SkupnaSpremembaOkno
          stevilo={izbrani.size}
          druzine={druzine}
          onUporabi={uporabiSkupno}
          onPreklici={() => setSkupnaOdprta(false)}
        />
      </Modal>

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
  sprotno,
  autoFocus,
}: {
  value: string;
  onCommit: (v: string) => void;
  hint: string;
  className?: string;
  list?: string;
  /** Shrani ob vsakem znaku (ne šele ob izhodu iz polja). */
  sprotno?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      defaultValue={value}
      title={hint}
      aria-label={hint}
      list={list}
      autoFocus={autoFocus}
      onChange={(e) => {
        if (sprotno && e.target.value.trim() !== value) onCommit(e.target.value.trim());
      }}
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
  sprotno,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  hint: string;
  dovoliPrazno?: boolean;
  poudarjeno?: boolean;
  /** Shrani ob vsakem veljavnem vnosu (ne šele ob izhodu iz polja). */
  sprotno?: boolean;
}) {
  return (
    <input
      defaultValue={formatNum(value)}
      inputMode="decimal"
      title={hint}
      aria-label={hint}
      onChange={(e) => {
        if (!sprotno) return;
        const raw = e.target.value.trim();
        const n = raw === "" ? (dovoliPrazno ? null : 0) : parseNum(raw);
        if ((raw === "" || (n !== null && n >= 0)) && n !== value) onCommit(n);
      }}
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

function Stevec({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-lg bg-ink-50 p-3">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-xs text-ink-500">{label}</div>
    </div>
  );
}
