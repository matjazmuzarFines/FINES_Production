"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Check, Equal, History, MapPin, Minus, Plus, Save, X, type LucideIcon } from "lucide-react";
import { ujemaIskanje } from "@/lib/iskanje";
import { formatNum } from "@/lib/stevila";
import { supabaseConfigured } from "@/lib/supabase";
import {
  OPIS_NACINA,
  naloziLog,
  naloziMaterial,
  novaZaloga,
  parseKolicina,
  spremeni,
  type Nacin,
  type NacinZaloge,
  type VijacniLog,
  type VijacniMaterial,
} from "@/lib/vijacniMaterial";
import { Button } from "@/components/ui/Button";
import { FilterIskanje, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { Modal } from "@/components/ui/Modal";
import { ConfigMissing, ErrorText, Loading, WarningText } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje, type Razvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { Zavihki } from "@/components/ui/Zavihki";

type Pogled = "zaloga" | "zgodovina";
type StolpecMat = "sifra" | "naziv" | "lokacija" | "zaloga" | "spremenjeno" | "spremenil";
const BREZ = "__brez__";
const VSE = "__vse__";

const fmtCas = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatCas = (iso: string | null) => (iso ? fmtCas.format(new Date(iso)) : "");

/** Barva načina (prejem zelen, odpis rdeč, popis oranžen, lokacija siva). */
const NACIN_SLOG: Record<Nacin, { polno: string; svetlo: string; icon: LucideIcon; znak: string }> = {
  prejem: { polno: "bg-ok-500 text-white border-ok-500", svetlo: "bg-ok-50 text-ok-600", icon: Plus, znak: "+" },
  odpis: { polno: "bg-nok-500 text-white border-nok-500", svetlo: "bg-nok-50 text-nok-600", icon: Minus, znak: "−" },
  popis: { polno: "bg-fines-500 text-white border-fines-500", svetlo: "bg-fines-50 text-fines-700", icon: Equal, znak: "=" },
  lokacija: { polno: "bg-ink-600 text-white border-ink-600", svetlo: "bg-ink-100 text-ink-700", icon: MapPin, znak: "" },
};

export function VijacniMaterialStran() {
  const notify = useToast();
  const [material, setMaterial] = useState<VijacniMaterial[] | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [pogled, setPogled] = useState<Pogled>("zaloga");

  const [sifra, setSifra] = useState("");
  const [naziv, setNaziv] = useState("");
  const [lokacija, setLokacija] = useState<string>(VSE);
  const [iskanjeLog, setIskanjeLog] = useState("");

  const [izbrani, setIzbrani] = useState<number[]>([]);
  const [vecDovoljeno, setVecDovoljeno] = useState(false);
  const [drugi, setDrugi] = useState<number | null>(null);
  const [okno, setOkno] = useState<"zaloga" | "lokacija" | null>(null);

  const [log, setLog] = useState<VijacniLog[] | null>(null);

  const nalozi = useCallback(async () => {
    try {
      setMaterial(await naloziMaterial());
      setNapaka(null);
    } catch (e) {
      setNapaka((e as Error).message);
    }
  }, []);

  const naloziZgodovino = useCallback(async () => {
    try {
      setLog(await naloziLog());
    } catch (e) {
      notify("error", `Napaka pri nalaganju zgodovine: ${(e as Error).message}`, 10000);
    }
  }, [notify]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let preklic = false;
    naloziMaterial()
      .then((m) => {
        if (!preklic) setMaterial(m);
      })
      .catch((e) => {
        if (!preklic) setNapaka((e as Error).message);
      });
    return () => {
      preklic = true;
    };
  }, []);

  // Telefon ostane odprt na strani: ob vrnitvi v aplikacijo znova naloži zalogo
  useEffect(() => {
    const ob = () => {
      if (document.visibilityState === "visible") {
        nalozi();
        if (pogled === "zgodovina") naloziZgodovino();
      }
    };
    document.addEventListener("visibilitychange", ob);
    return () => document.removeEventListener("visibilitychange", ob);
  }, [nalozi, naloziZgodovino, pogled]);

  const poId = useMemo(() => new Map((material ?? []).map((m) => [m.id, m])), [material]);
  const izbraniMat = useMemo(() => izbrani.map((id) => poId.get(id)).filter((m): m is VijacniMaterial => !!m), [izbrani, poId]);

  // Lokacije po pogostosti (za filter in hitro izbiro v oknu)
  const lokacije = useMemo(() => {
    const st = new Map<string, number>();
    for (const m of material ?? []) if (m.lokacija) st.set(m.lokacija, (st.get(m.lokacija) ?? 0) + 1);
    return [...st.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sl", { numeric: true }));
  }, [material]);
  const brezLokacije = (material ?? []).filter((m) => !m.lokacija).length;

  const ustreza = useCallback(
    (m: VijacniMaterial) =>
      ujemaIskanje(sifra, [m.sifra]) &&
      ujemaIskanje(naziv, [m.naziv]) &&
      (lokacija === VSE || (lokacija === BREZ ? !m.lokacija : m.lokacija === lokacija)),
    [sifra, naziv, lokacija],
  );

  const sort = useRazvrscanje<VijacniMaterial, StolpecMat>({
    sifra: (m) => m.sifra,
    naziv: (m) => m.naziv,
    lokacija: (m) => m.lokacija,
    zaloga: (m) => m.zaloga,
    spremenjeno: (m) => m.spremenjeno,
    spremenil: (m) => m.spremenil,
  });

  // Izbrani, ki jih filter skrije, ostanejo vidni na vrhu seznama
  const izbranSet = new Set(izbrani);
  const prikazani = [
    ...(material ?? []).filter((m) => izbranSet.has(m.id) && !ustreza(m)),
    ...sort.razvrsti((material ?? []).filter(ustreza)),
  ];

  function preklopi(id: number) {
    if (izbrani.includes(id)) {
      const ostali = izbrani.filter((x) => x !== id);
      setIzbrani(ostali);
      if (ostali.length === 0) setVecDovoljeno(false);
      return;
    }
    setIzbrani([...izbrani, id]);
    if (izbrani.length === 1 && !vecDovoljeno) setDrugi(id);
  }

  function odznaciDrugega() {
    if (drugi !== null) setIzbrani((s) => s.filter((x) => x !== drugi));
    setDrugi(null);
  }

  function pocisti() {
    setIzbrani([]);
    setVecDovoljeno(false);
  }

  function poShranjevanju(posodobljeni: VijacniMaterial[], sporocilo: string) {
    const nove = new Map(posodobljeni.map((m) => [m.id, m]));
    setMaterial((s) => (s ?? []).map((m) => nove.get(m.id) ?? m));
    setOkno(null);
    pocisti();
    notify("success", sporocilo);
    if (log) naloziZgodovino();
  }

  if (!supabaseConfigured) return <ConfigMissing />;
  if (napaka && !material)
    return (
      <ErrorText>
        Napaka pri nalaganju: {napaka}. Če tabela še ne obstaja, v Supabase SQL editorju zaženi{" "}
        <code className="rounded bg-white px-1">031_vijacni_material.sql</code> in nato{" "}
        <code className="rounded bg-white px-1">032_vijacni_material_uvoz.sql</code>.
      </ErrorText>
    );
  if (!material) return <Loading />;

  const filtrirano = sifra || naziv || lokacija !== VSE;

  return (
    <div className="flex flex-col gap-4">
      {/* ============ GLAVA ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Vijačni material</h2>
          <p className="text-sm text-ink-500">
            Zaloga in lokacije vijačnega in pomožnega materiala · tapni material in spremeni zalogo ali lokacijo
          </p>
        </div>
      </div>

      {material.length === 0 && (
        <WarningText>
          Tabela je prazna. V Supabase SQL editorju zaženi <code className="rounded bg-white px-1">032_vijacni_material_uvoz.sql</code>{" "}
          (enkraten uvoz iz Microsoft Lists).
        </WarningText>
      )}

      {/* ============ ZAVIHKI + FILTRI ============ */}
      <div>
        <Zavihki<Pogled>
          label="Pogled"
          value={pogled}
          onChange={(p) => {
            setPogled(p);
            if (p === "zgodovina") naloziZgodovino();
          }}
          zavihki={[
            { koda: "zaloga", label: "Zaloga", hint: "Seznam materiala z zalogo in lokacijo", icon: Boxes },
            { koda: "zgodovina", label: "Zgodovina", hint: "Kdo je kdaj spremenil zalogo ali lokacijo", icon: History },
          ]}
        />
        <div className="fp-card rounded-tl-none p-3 sm:p-4">
          {pogled === "zaloga" ? (
            <FilterVrstica>
              <FilterIskanje
                label="Šifra"
                value={sifra}
                onChange={setSifra}
                placeholder="npr. 060-10020"
                hint="Poišči material po šifri"
                telefon
                className="w-[calc(40%-0.375rem)] sm:w-44"
              />
              <FilterIskanje
                label="Naziv"
                value={naziv}
                onChange={setNaziv}
                placeholder="npr. vijak M5 A2"
                hint="Poišči material po besedah v nazivu"
                telefon
                className="w-[calc(60%-0.375rem)] sm:w-72"
              />
              <FilterPreklopnik
                label="Lokacija"
                value={lokacija}
                onChange={setLokacija}
                options={[
                  { value: VSE, label: "Vse", hint: "Pokaži material na vseh lokacijah" },
                  ...lokacije.map(([l, n]) => ({ value: l, label: l, hint: `Pokaži samo material na lokaciji ${l}`, stevilo: n })),
                  { value: BREZ, label: "Brez", hint: "Pokaži material brez vpisane lokacije", stevilo: brezLokacije },
                ]}
              />
              {filtrirano && (
                <Button
                  hint="Počisti iskanje in filter lokacije"
                  variant="neutral"
                  icon={X}
                  onClick={() => {
                    setSifra("");
                    setNaziv("");
                    setLokacija(VSE);
                  }}
                >
                  Ponastavi
                </Button>
              )}
            </FilterVrstica>
          ) : (
            <FilterVrstica>
              <FilterIskanje
                value={iskanjeLog}
                onChange={setIskanjeLog}
                placeholder="šifra, naziv ali oseba"
                hint="Poišči spremembe po materialu ali osebi"
                telefon
              />
            </FilterVrstica>
          )}
        </div>
      </div>

      {pogled === "zaloga" ? (
        <>
          <SeznamMateriala prikazani={prikazani} izbrani={izbrani} preklopi={preklopi} sort={sort} />

          {/* ============ SPODNJA VRSTICA: dejanja nad izbranimi ============ */}
          <div className="sticky bottom-0 z-30 -mx-3 border-t border-ink-200 bg-white/95 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex items-center gap-2">
              {izbrani.length > 0 ? (
                <button
                  type="button"
                  title="Odznači ves izbrani material"
                  onClick={pocisti}
                  className="flex h-12 shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100"
                >
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-fines-500 px-1.5 text-xs font-bold text-white">
                    {izbrani.length}
                  </span>
                  <X className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Počisti</span>
                </button>
              ) : (
                <span className="min-w-0 flex-1 text-sm text-ink-500 sm:flex-none">Tapni material, ki ga želiš urediti.</span>
              )}
              <span className="hidden flex-1 sm:block" />
              <Button
                hint="Prejem, odpis ali popis zaloge izbranega"
                variant="primary"
                icon={Boxes}
                size="lg"
                disabled={izbrani.length === 0}
                onClick={() => setOkno("zaloga")}
                className={izbrani.length ? "flex-1 px-3 sm:flex-none" : "max-sm:hidden"}
              >
                Zaloga
              </Button>
              <Button
                hint="Spremeni lokacijo izbranega materiala"
                variant="primary"
                icon={MapPin}
                size="lg"
                disabled={izbrani.length === 0}
                onClick={() => setOkno("lokacija")}
                className={izbrani.length ? "flex-1 px-3 sm:flex-none" : "max-sm:hidden"}
              >
                Lokacija
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Zgodovina log={log} iskanje={iskanjeLog} />
      )}

      {/* ============ OPOZORILO: več kot 1 element ============ */}
      <Modal
        open={drugi !== null}
        title="Več izbranih"
        onClose={odznaciDrugega}
        sirina="max-w-md"
        noga={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button hint="Odznači pravkar izbrani material" variant="neutral" size="lg" onClick={odznaciDrugega}>
              Ne, odznači drugega
            </Button>
            <Button
              hint="Dovoli izbiro več materialov hkrati"
              variant="success"
              icon={Check}
              size="lg"
              onClick={() => {
                setVecDovoljeno(true);
                setDrugi(null);
              }}
            >
              Da
            </Button>
          </div>
        }
      >
        <WarningText className="text-base">Izbrali ste več kot 1 element. Ali želite nadaljevati?</WarningText>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-700">
          {izbraniMat.map((m) => (
            <li key={m.id} className={m.id === drugi ? "font-semibold text-ink-900" : ""}>
              <span className="font-mono text-xs text-ink-500">{m.sifra ?? "—"}</span> {m.naziv}
            </li>
          ))}
        </ul>
      </Modal>

      {okno === "zaloga" && (
        <OknoZaloga
          izbrani={izbraniMat}
          onClose={() => setOkno(null)}
          onShranjeno={poShranjevanju}
          onNapaka={(t) => {
            notify("error", t, 10000);
            nalozi();
          }}
        />
      )}
      {okno === "lokacija" && (
        <OknoLokacija
          izbrani={izbraniMat}
          lokacije={lokacije.map(([l]) => l)}
          onClose={() => setOkno(null)}
          onShranjeno={poShranjevanju}
          onNapaka={(t) => notify("error", t, 10000)}
        />
      )}
    </div>
  );
}

// =====================================================================
// SEZNAM (telefon: kartice, računalnik: tabela)
// =====================================================================

function SeznamMateriala({
  prikazani,
  izbrani,
  preklopi,
  sort,
}: {
  prikazani: VijacniMaterial[];
  izbrani: number[];
  preklopi: (id: number) => void;
  sort: Razvrscanje<VijacniMaterial, StolpecMat>;
}) {
  const izbranSet = new Set(izbrani);
  if (prikazani.length === 0)
    return <div className="fp-card p-6 text-center text-sm text-ink-500">Ni materiala za izbrane filtre.</div>;

  return (
    <>
      {/* telefon */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {prikazani.map((m) => {
          const izbran = izbranSet.has(m.id);
          return (
            <li key={m.id}>
              <button
                type="button"
                title={izbran ? "Odznači material" : "Označi material za urejanje"}
                aria-pressed={izbran}
                onClick={() => preklopi(m.id)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left shadow-sm transition-colors active:bg-ink-100 ${
                  izbran ? "border-fines-500 bg-fines-50" : "border-transparent bg-white ring-1 ring-ink-200"
                }`}
              >
                <Kljukica izbran={izbran} />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs text-ink-500">{m.sifra ?? "brez šifre"}</span>
                  <span className="block font-semibold leading-snug text-ink-900">{m.naziv}</span>
                  <span className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${m.lokacija ? "text-ink-700" : "text-ink-400"}`}>
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {m.lokacija ?? "brez lokacije"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-2xl font-bold tabular-nums ${m.zaloga === 0 ? "text-nok-600" : "text-ink-900"}`}>
                    {formatNum(m.zaloga)}
                  </span>
                  <span className="text-xs text-ink-500">{m.em}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* računalnik */}
      <div className="fp-card hidden p-0 sm:block">
        <TabelaOkvir>
          <table className="w-full text-sm">
            <thead className="fp-thead">
              <tr>
                <th className="w-10 px-2 py-2" aria-label="Izbira" />
                <SortTh sort={sort} kljuc="sifra">Šifra</SortTh>
                <SortTh sort={sort} kljuc="naziv">Naziv</SortTh>
                <SortTh sort={sort} kljuc="lokacija">Lokacija</SortTh>
                <SortTh sort={sort} kljuc="zaloga" desno>Zaloga</SortTh>
                <th className="px-2 py-2 text-left">EM</th>
                <SortTh sort={sort} kljuc="spremenjeno">Spremenjeno</SortTh>
                <SortTh sort={sort} kljuc="spremenil">Spremenil</SortTh>
              </tr>
            </thead>
            <tbody>
              {prikazani.map((m) => {
                const izbran = izbranSet.has(m.id);
                return (
                  <tr
                    key={m.id}
                    onClick={() => preklopi(m.id)}
                    title={izbran ? "Odznači material" : "Označi material za urejanje"}
                    className={`cursor-pointer border-b border-ink-100 ${izbran ? "bg-fines-50 hover:bg-fines-100" : "hover:bg-ink-50"}`}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={izbran}
                        onChange={() => preklopi(m.id)}
                        onClick={(e) => e.stopPropagation()}
                        title="Označi material za urejanje"
                        aria-label={`Označi ${m.naziv}`}
                        className="h-4 w-4 accent-fines-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{m.sifra ?? <span className="text-ink-400">—</span>}</td>
                    <td className="px-2 py-2 font-medium text-ink-900">{m.naziv}</td>
                    <td className="px-2 py-2">{m.lokacija ?? <span className="text-ink-400">—</span>}</td>
                    <td className={`px-2 py-2 text-right font-semibold tabular-nums ${m.zaloga === 0 ? "text-nok-600" : ""}`}>{formatNum(m.zaloga)}</td>
                    <td className="px-2 py-2 text-xs text-ink-500">{m.em}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-ink-500">{formatCas(m.spremenjeno)}</td>
                    <td className="px-2 py-2 text-xs text-ink-500">{m.spremenil}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabelaOkvir>
      </div>
    </>
  );
}

function Kljukica({ izbran }: { izbran: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
        izbran ? "border-fines-500 bg-fines-500 text-white" : "border-ink-300 bg-white"
      }`}
      aria-hidden
    >
      {izbran && <Check className="h-4 w-4" strokeWidth={3} />}
    </span>
  );
}

// =====================================================================
// OKNO: sprememba zaloge (prejem / odpis / popis)
// =====================================================================

const NACINI: { nacin: NacinZaloge; label: string; opis: string; hint: string }[] = [
  { nacin: "prejem", label: "Prejem", opis: "prištej", hint: "Dobil sem material - prištej k zalogi" },
  { nacin: "odpis", label: "Odpis", opis: "odštej", hint: "Odnesel sem material - odštej od zaloge" },
  { nacin: "popis", label: "Popis", opis: "preštel sem", hint: "Preštel sem - nastavi točno zalogo" },
];

function OknoZaloga({
  izbrani,
  onClose,
  onShranjeno,
  onNapaka,
}: {
  izbrani: VijacniMaterial[];
  onClose: () => void;
  onShranjeno: (m: VijacniMaterial[], sporocilo: string) => void;
  onNapaka: (t: string) => void;
}) {
  const [nacin, setNacin] = useState<NacinZaloge | null>(null);
  const [vnosi, setVnosi] = useState<Record<number, string>>({});
  const [shranjujem, setShranjujem] = useState(false);
  const prvoPolje = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (nacin) prvoPolje.current?.focus();
  }, [nacin]);

  const vrstice = izbrani.map((m) => {
    const kolicina = parseKolicina(vnosi[m.id] ?? "");
    const nova = nacin ? novaZaloga(nacin, m.zaloga, kolicina) : null;
    let napaka: string | null = null;
    let opozorilo: string | null = null;
    if (nacin && (vnosi[m.id] ?? "") !== "") {
      if (kolicina === null) napaka = "Vpiši celo število.";
      else if (nacin !== "popis" && kolicina === 0) napaka = "Količina mora biti večja od 0.";
      else if (nova !== null && nova < 0) napaka = `Odpis je večji od zaloge (${formatNum(m.zaloga)}).`;
      else if (nacin === "prejem" && m.zaloga > 0 && kolicina > m.zaloga)
        opozorilo = "Prejem je večji od trenutne zaloge. Vpiši samo prejeto količino, ne skupne.";
      else if (nacin === "popis" && nova !== null && m.zaloga > 0 && (nova > m.zaloga * 2 || nova < m.zaloga / 2))
        opozorilo = "Popis nastavi celotno zalogo. Če si material samo prejel ali odnesel, izberi Prejem ali Odpis.";
    }
    return { m, kolicina, nova, napaka, opozorilo };
  });
  const veljavno = !!nacin && vrstice.every((v) => v.nova !== null && !v.napaka) && vrstice.some((v) => v.nova !== v.m.zaloga);

  const ena = vrstice.length === 1 ? vrstice[0] : null;
  const potrdiTekst = !nacin
    ? "Potrdi"
    : ena && ena.nova !== null && !ena.napaka
      ? `${OPIS_NACINA[nacin]}: ${formatNum(ena.m.zaloga)} → ${formatNum(ena.nova)}`
      : `Potrdi ${OPIS_NACINA[nacin].toLowerCase()}`;

  async function shrani() {
    if (!nacin || !veljavno) return;
    setShranjujem(true);
    try {
      const rezultat = await spremeni(
        vrstice.map((v) => ({ id: v.m.id, nacin, kolicina: v.kolicina!, pricakovana: v.m.zaloga })),
      );
      const sporocilo =
        ena && ena.nova !== null
          ? `${OPIS_NACINA[nacin]} shranjen: ${ena.m.naziv} ${formatNum(ena.m.zaloga)} → ${formatNum(ena.nova)} ${ena.m.em}`
          : `${OPIS_NACINA[nacin]} shranjen za ${vrstice.length} materialov.`;
      onShranjeno(rezultat, sporocilo);
    } catch (e) {
      onNapaka(`Ni shranjeno: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  return (
    <Modal
      open
      title={izbrani.length === 1 ? "Sprememba zaloge" : `Sprememba zaloge (${izbrani.length})`}
      onClose={onClose}
      noga={
        <div className="flex gap-2 sm:justify-end">
          <Button hint="Zapri okno brez shranjevanja" variant="neutral" size="lg" onClick={onClose} className="max-sm:px-4">
            Prekliči
          </Button>
          <Button
            hint="Shrani spremembo zaloge v bazo"
            variant="success"
            icon={Save}
            size="lg"
            disabled={!veljavno || shranjujem}
            onClick={shrani}
            className="min-w-0 flex-1 sm:flex-none [&>span]:truncate"
          >
            <span>{shranjujem ? "Shranjujem ..." : potrdiTekst}</span>
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          shrani();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-600">Kaj delaš?</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Način spremembe zaloge">
            {NACINI.map((n) => {
              const s = NACIN_SLOG[n.nacin];
              const izbran = nacin === n.nacin;
              return (
                <button
                  key={n.nacin}
                  type="button"
                  role="radio"
                  aria-checked={izbran}
                  title={n.hint}
                  onClick={() => setNacin(n.nacin)}
                  className={`flex min-w-0 flex-col items-center justify-center rounded-xl border-2 px-1 py-2 transition-colors ${
                    izbran ? s.polno : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
                  }`}
                >
                  <s.icon className="h-6 w-6" strokeWidth={3} aria-hidden />
                  <span className="text-base font-bold">{n.label}</span>
                  <span className={`truncate text-xs ${izbran ? "text-white/85" : "text-ink-500"}`}>{n.opis}</span>
                </button>
              );
            })}
          </div>
          {!nacin && <p className="mt-2 text-sm text-ink-500">Najprej izberi, ali material prejemaš, odpisuješ ali si ga preštel.</p>}
        </div>

        {nacin &&
          vrstice.map(({ m, nova, napaka, opozorilo }, i) => {
            const s = NACIN_SLOG[nacin];
            return (
              <div key={m.id} className="rounded-xl border border-ink-200 p-3">
                <p className="font-mono text-xs text-ink-500">{m.sifra ?? "brez šifre"}</p>
                <p className="font-semibold leading-snug text-ink-900">{m.naziv}</p>
                <p className="mt-0.5 text-sm text-ink-600">
                  Trenutna zaloga: <strong className="tabular-nums text-ink-900">{formatNum(m.zaloga)}</strong> {m.em}
                </p>
                <label className="mt-2 flex items-stretch overflow-hidden rounded-lg border-2 border-ink-200 focus-within:border-fines-500">
                  <span className={`flex w-12 shrink-0 items-center justify-center text-2xl font-bold ${s.svetlo}`} aria-hidden>
                    {s.znak}
                  </span>
                  <input
                    ref={i === 0 ? prvoPolje : undefined}
                    value={vnosi[m.id] ?? ""}
                    onChange={(e) => setVnosi((v) => ({ ...v, [m.id]: e.target.value }))}
                    inputMode="numeric"
                    pattern="[0-9 .]*"
                    enterKeyHint={i === vrstice.length - 1 ? "done" : "next"}
                    autoComplete="off"
                    placeholder={nacin === "popis" ? "preštetih kosov" : nacin === "prejem" ? "prejetih kosov" : "odnesenih kosov"}
                    title={nacin === "popis" ? "Vpiši preštet skupno zalogo" : "Vpiši samo količino, ki se spremeni"}
                    aria-label={`Količina za ${m.naziv}`}
                    className="h-14 min-w-0 flex-1 px-3 text-center text-2xl font-bold tabular-nums placeholder:text-base placeholder:font-normal focus:outline-none"
                  />
                  <span className="flex shrink-0 items-center pr-3 text-sm text-ink-500">{m.em}</span>
                </label>
                {napaka ? (
                  <ErrorText className="mt-2">{napaka}</ErrorText>
                ) : nova !== null ? (
                  <div className={`mt-2 flex flex-wrap items-baseline justify-center gap-x-2 rounded-lg px-3 py-2 tabular-nums ${s.svetlo}`}>
                    <span className="text-base">{formatNum(m.zaloga)}</span>
                    {nacin !== "popis" && (
                      <span className="text-base">
                        {s.znak} {formatNum(Math.abs(nova - m.zaloga))}
                      </span>
                    )}
                    <span className="text-base">{nacin === "popis" ? "→" : "="}</span>
                    <span className="text-2xl font-bold">{formatNum(nova)}</span>
                    <span className="text-sm">{m.em}</span>
                    {nacin === "popis" && nova !== m.zaloga && (
                      <span className="w-full text-center text-xs">
                        razlika {nova > m.zaloga ? "+" : "−"}
                        {formatNum(Math.abs(nova - m.zaloga))}
                      </span>
                    )}
                  </div>
                ) : null}
                {opozorilo && <WarningText className="mt-2">{opozorilo}</WarningText>}
              </div>
            );
          })}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

// =====================================================================
// OKNO: sprememba lokacije
// =====================================================================

function OknoLokacija({
  izbrani,
  lokacije,
  onClose,
  onShranjeno,
  onNapaka,
}: {
  izbrani: VijacniMaterial[];
  lokacije: string[];
  onClose: () => void;
  onShranjeno: (m: VijacniMaterial[], sporocilo: string) => void;
  onNapaka: (t: string) => void;
}) {
  const [vnos, setVnos] = useState("");
  const [shranjujem, setShranjujem] = useState(false);
  const nova = vnos.trim().toUpperCase();
  const veljavno = nova !== "" && izbrani.some((m) => m.lokacija !== nova);

  async function shrani() {
    if (!veljavno) return;
    setShranjujem(true);
    try {
      const rezultat = await spremeni(izbrani.map((m) => ({ id: m.id, nacin: "lokacija" as const, lokacija: nova })));
      onShranjeno(
        rezultat,
        izbrani.length === 1 ? `Lokacija shranjena: ${izbrani[0].naziv} → ${nova}` : `Lokacija ${nova} shranjena za ${izbrani.length} materialov.`,
      );
    } catch (e) {
      onNapaka(`Ni shranjeno: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  return (
    <Modal
      open
      title={izbrani.length === 1 ? "Sprememba lokacije" : `Sprememba lokacije (${izbrani.length})`}
      onClose={onClose}
      noga={
        <div className="flex gap-2 sm:justify-end">
          <Button hint="Zapri okno brez shranjevanja" variant="neutral" size="lg" onClick={onClose} className="max-sm:px-4">
            Prekliči
          </Button>
          <Button
            hint="Shrani novo lokacijo v bazo"
            variant="success"
            icon={Save}
            size="lg"
            disabled={!veljavno || shranjujem}
            onClick={shrani}
            className="min-w-0 flex-1 sm:flex-none [&>span]:truncate"
          >
            <span>{shranjujem ? "Shranjujem ..." : nova ? `Shrani lokacijo ${nova}` : "Shrani lokacijo"}</span>
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          shrani();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-600">Nova lokacija</p>
          <input
            value={vnos}
            onChange={(e) => setVnos(e.target.value)}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={30}
            placeholder="npr. VM1"
            title="Vpiši novo lokacijo materiala"
            aria-label="Nova lokacija"
            className="h-14 w-full rounded-lg border-2 border-ink-200 px-3 text-center text-2xl font-bold uppercase placeholder:text-base placeholder:font-normal placeholder:normal-case focus:border-fines-500 focus:outline-none"
          />
          {lokacije.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {lokacije.map((l) => (
                <button
                  key={l}
                  type="button"
                  title={`Izberi lokacijo ${l}`}
                  onClick={() => setVnos(l)}
                  className={`h-11 min-w-16 rounded-lg border px-4 text-base font-semibold transition-colors ${
                    nova === l ? "border-fines-500 bg-fines-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {izbrani.map((m) => (
            <li key={m.id} className="rounded-xl border border-ink-200 p-3">
              <p className="font-mono text-xs text-ink-500">{m.sifra ?? "brez šifre"}</p>
              <p className="font-semibold leading-snug text-ink-900">{m.naziv}</p>
              <p className="mt-1 flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-ink-400" aria-hidden />
                <span className={m.lokacija ? "text-ink-700" : "text-ink-400"}>{m.lokacija ?? "brez"}</span>
                <span className="text-ink-400">→</span>
                <strong className={nova ? "text-fines-700" : "text-ink-400"}>{nova || "?"}</strong>
              </p>
            </li>
          ))}
        </ul>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

// =====================================================================
// ZGODOVINA SPREMEMB
// =====================================================================

function Znacka({ nacin }: { nacin: Nacin }) {
  const s = NACIN_SLOG[nacin];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${s.polno}`}>{OPIS_NACINA[nacin]}</span>;
}

function Sprememba({ l }: { l: VijacniLog }) {
  if (l.polje === "lokacija")
    return (
      <span>
        {l.stara ?? "brez"} → <strong>{l.nova ?? "brez"}</strong>
      </span>
    );
  const d = l.sprememba ?? 0;
  return (
    <span className="tabular-nums">
      {formatNum(Number(l.stara))} → <strong>{formatNum(Number(l.nova))}</strong>{" "}
      <span className={d > 0 ? "text-ok-600" : "text-nok-600"}>
        ({d > 0 ? "+" : "−"}
        {formatNum(Math.abs(d))})
      </span>
    </span>
  );
}

function Zgodovina({ log, iskanje }: { log: VijacniLog[] | null; iskanje: string }) {
  const sort = useRazvrscanje<VijacniLog, "cas" | "sifra" | "naziv" | "nacin" | "sprememba" | "uporabnik">({
    cas: (l) => l.created_at,
    sifra: (l) => l.material?.sifra,
    naziv: (l) => l.material?.naziv,
    nacin: (l) => OPIS_NACINA[l.nacin],
    sprememba: (l) => l.sprememba,
    uporabnik: (l) => l.uporabnik,
  });
  if (!log) return <Loading />;
  const vrstice = sort.razvrsti(log.filter((l) => ujemaIskanje(iskanje, [l.material?.sifra, l.material?.naziv, l.uporabnik])));
  if (vrstice.length === 0)
    return <div className="fp-card p-6 text-center text-sm text-ink-500">Ni sprememb za izbrane filtre.</div>;

  return (
    <>
      <p className="-mt-2 text-xs text-ink-500">Zadnjih {formatNum(log.length)} sprememb.</p>
      <ul className="flex flex-col gap-2 sm:hidden">
        {vrstice.map((l) => (
          <li key={l.id} className="fp-card flex flex-col gap-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-mono text-xs text-ink-500">{l.material?.sifra ?? "brez šifre"}</span>
                <span className="block font-semibold leading-snug text-ink-900">{l.material?.naziv}</span>
              </span>
              <Znacka nacin={l.nacin} />
            </div>
            <div className="text-base">
              <Sprememba l={l} />
            </div>
            <div className="text-xs text-ink-500">
              {formatCas(l.created_at)} · {l.uporabnik}
            </div>
          </li>
        ))}
      </ul>

      <div className="fp-card hidden p-0 sm:block">
        <TabelaOkvir>
          <table className="w-full text-sm">
            <thead className="fp-thead">
              <tr>
                <SortTh sort={sort} kljuc="cas">Čas</SortTh>
                <SortTh sort={sort} kljuc="sifra">Šifra</SortTh>
                <SortTh sort={sort} kljuc="naziv">Naziv</SortTh>
                <SortTh sort={sort} kljuc="nacin">Način</SortTh>
                <SortTh sort={sort} kljuc="sprememba">Iz → v</SortTh>
                <SortTh sort={sort} kljuc="uporabnik">Spremenil</SortTh>
              </tr>
            </thead>
            <tbody>
              {vrstice.map((l) => (
                <tr key={l.id} className="border-b border-ink-100 hover:bg-ink-50">
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-ink-600">{formatCas(l.created_at)}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{l.material?.sifra ?? "—"}</td>
                  <td className="px-2 py-2 font-medium text-ink-900">{l.material?.naziv}</td>
                  <td className="px-2 py-2">
                    <Znacka nacin={l.nacin} />
                  </td>
                  <td className="px-2 py-2">
                    <Sprememba l={l} />
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-600">{l.uporabnik}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaOkvir>
      </div>
    </>
  );
}
