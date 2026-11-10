"use client";

import { useMemo, useState } from "react";
import { addDays, formatDayMonth, formatShort, isoWeek, weekday, type IsoDate } from "@/lib/dates";
import { ujemaIskanje } from "@/lib/iskanje";
import type { Celica } from "@/lib/plan";
import { formatNum, formatUre } from "@/lib/stevila";
import { RANG_ZAMUDE, type PrezasedenOdsek, type UreZamude, type ZamudaStatus, type ZamudaVrstica } from "@/lib/zamudePlana";
import { FilterIskanje, FilterPolje, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { FilterKartica, type KarticaBarva } from "@/components/ui/FilterKartica";
import { InfoNamig } from "@/components/ui/InfoNamig";
import { Izvoz } from "@/components/ui/Izvoz";
import { Loading } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";

type Rezultat = { vrstice: ZamudaVrstica[]; odseki: PrezasedenOdsek[]; ureZamud: UreZamude[] };
type StolpecUr = "teden" | "celica" | "peci" | "ure" | "osebe" | "odpreme" | "krovni";

const KARTICE: { status: ZamudaStatus; naslov: string; hint: string; barva: KarticaBarva }[] = [
  {
    status: "presezek",
    naslov: "Zamuda zaradi presežka",
    hint: "Odpreme, ki jih plan nad 100 % ne pokrije",
    barva: { trak: "bg-nok-500", aktivna: "border-nok-500 bg-nok-50", ikona: "text-nok-500" },
  },
  {
    status: "zapadlo",
    naslov: "Zapadlo",
    hint: "Rok odpreme je že mimo, peči niso narejene",
    barva: { trak: "bg-ink-700", aktivna: "border-ink-700 bg-ink-100", ikona: "text-ink-700" },
  },
  {
    status: "po_roku",
    naslov: "Plan po roku",
    hint: "Plan je tudi brez presežka prepozen",
    barva: { trak: "bg-fines-500", aktivna: "border-fines-500 bg-fines-50", ikona: "text-fines-500" },
  },
  {
    status: "ni_na_planu",
    naslov: "Ni na planu",
    hint: "Kosi za odpremo niso v nobeni postavitvi",
    barva: { trak: "bg-warn-500", aktivna: "border-warn-500 bg-warn-50", ikona: "text-warn-500" },
  },
  {
    status: "ok",
    naslov: "Pravočasno",
    hint: "Odpreme, ki jih plan pokrije pravočasno",
    barva: { trak: "bg-ok-500", aktivna: "border-ok-500 bg-ok-50", ikona: "text-ok-500" },
  },
];

type Stolpec =
  | "rok"
  | "narocilo"
  | "kupec"
  | "ident"
  | "artikel"
  | "potrebno"
  | "pravocasno"
  | "presezek"
  | "poRoku"
  | "niNaPlanu"
  | "narejeno"
  | "krovni"
  | "celica";

/**
 * Dnevi zamude: koledarski dnevi od roka (vključno) do dneva zadnjega kosa (vključno) - kos mora biti narejen pred
 * rokom - in koliko od njih je vikend. Rok pet 27. 11., zadnji kos tor 1. 12. = 5 dni, od tega 2 vikend.
 */
function dniZamude(v: ZamudaVrstica): { dni: number; vikend: number } | null {
  if (!v.narejeno) return null;
  let dni = 0;
  let vikend = 0;
  for (let d = v.potrebnoDo; d <= v.narejeno; d = addDays(d, 1)) {
    dni++;
    if (weekday(d) > 5) vikend++;
  }
  return { dni, vikend };
}

/** Kdaj je odprema po planu narejena: datum in zamuda v dneh; presežek = nadure; ni na planu = ni datuma. */
function Narejeno({ v }: { v: ZamudaVrstica }) {
  if (v.niNaPlanu >= v.potrebno) return <span className="text-ink-300">–</span>;
  if (v.presezek > 0)
    return (
      <span className="font-semibold text-nok-600" title="Presežek nad 100 % se ujame z nadurami (do roka)">
        nadure
      </span>
    );
  if (!v.narejeno) return <span className="text-warn-700" title="Kosi niso narejeni v obdobju plana">po planu</span>;
  const { dni, vikend } = dniZamude(v) ?? { dni: 0, vikend: 0 };
  return (
    <span title={dni > 0 ? `Zadnji kos po planu ${formatShort(v.narejeno)}, ${dni} dni po roku` : `Zadnji kos po planu ${formatShort(v.narejeno)}`}>
      {formatShort(v.narejeno)}
      {dni > 0 && <span className="ml-1 font-bold text-fines-700">+{dni} d</span>}
      {vikend > 0 && (
        <span className="ml-1 font-bold text-nok-600" title={`Vikend: ${vikend} ${vikend === 1 ? "dan" : "dneva"} od tega`}>
          (+{vikend})
        </span>
      )}
    </span>
  );
}
type StolpecOdseka = "celica" | "od" | "do" | "dni" | "pct" | "ure" | "krovni";

/** Konec leta (ali konec naslednjega meseca, če je že december). */
export function privzetoObzorje(danes: IsoDate): IsoDate {
  const [l, m] = danes.split("-").map(Number);
  if (m < 12) return `${l}-12-31`;
  return `${l + 1}-01-31`;
}

/** Število: 0 kot sivo pomišljaj, sicer v barvi (samo vrednost je obarvana). */
function Kos({ v, cls }: { v: number; cls: string }) {
  return v > 0 ? <span className={`font-bold ${cls}`}>{formatNum(v)}</span> : <span className="text-ink-300">–</span>;
}

export function ZamudeDobav({
  izracunaj,
  nalaganje,
  celice,
  ureNaDan,
  oddelek,
  danes,
}: {
  /** Izračun zamud do datuma (iz plana oddelka in prioritet). */
  izracunaj: (doDatuma: IsoDate) => Rezultat;
  /** Podatki prioritet se še nalagajo. */
  nalaganje: boolean;
  celice: Celica[];
  ureNaDan: number;
  oddelek: string;
  danes: IsoDate;
}) {
  const [doDatuma, setDoDatuma] = useState<IsoDate>(() => privzetoObzorje(danes));
  const [statusi, setStatusi] = useState<Set<ZamudaStatus>>(new Set(["presezek", "zapadlo", "po_roku", "ni_na_planu"]));
  const [iskanje, setIskanje] = useState("");
  /** Na planu = vsaj del kosov je v postavitvah; ni na planu = noben kos (to se dela drugje). */
  const [naPlanu, setNaPlanu] = useState<"vse" | "da" | "ne">("vse");
  const jeNaPlanu = (v: ZamudaVrstica) => v.niNaPlanu < v.potrebno;

  const rezultat = useMemo(() => (nalaganje ? null : izracunaj(doDatuma)), [nalaganje, izracunaj, doDatuma]);
  const celicaIme = (id: number) => celice.find((c) => c.id === id)?.naziv ?? "";

  const sort = useRazvrscanje<ZamudaVrstica, Stolpec>({
    rok: (v) => v.potrebnoDo,
    narocilo: (v) => v.p.stevilka,
    kupec: (v) => v.p.partner,
    ident: (v) => v.p.ident,
    artikel: (v) => v.p.opis,
    potrebno: (v) => v.potrebno,
    pravocasno: (v) => v.pravocasno,
    presezek: (v) => v.presezek,
    poRoku: (v) => v.poRoku,
    niNaPlanu: (v) => v.niNaPlanu,
    narejeno: (v) => v.narejeno,
    krovni: (v) => v.krovni.join(", "),
    celica: (v) => v.celice.map(celicaIme).join(", "),
  });
  const sortUr = useRazvrscanje<UreZamude, StolpecUr>({
    teden: (u) => u.teden,
    celica: (u) => (u.celicaId === null ? null : celicaIme(u.celicaId)),
    peci: (u) => u.peci,
    ure: (u) => u.ure,
    osebe: (u) => (ureNaDan > 0 ? u.ure / ureNaDan : null),
    odpreme: (u) => u.odpreme.length,
    krovni: (u) => u.krovni.join(", "),
  });
  const sortOdsekov = useRazvrscanje<PrezasedenOdsek, StolpecOdseka>({
    celica: (o) => celicaIme(o.celicaId),
    od: (o) => o.od,
    do: (o) => o.do,
    dni: (o) => o.dni,
    pct: (o) => o.maxPct,
    ure: (o) => o.presezekUr,
    krovni: (o) => o.krovni.join(", "),
  });

  if (!rezultat) return <Loading />;

  const vse = rezultat.vrstice;
  const prikazane = sort.razvrsti(
    vse
      .filter((v) => statusi.has(v.status))
      .filter((v) => naPlanu === "vse" || jeNaPlanu(v) === (naPlanu === "da"))
      .filter((v) => ujemaIskanje(iskanje, [v.p.stevilka, v.p.partner, v.p.ident, v.p.opis, ...v.krovni, ...v.nalogi])),
  );
  // Privzeti vrstni red: po roku, znotraj roka najprej zamude zaradi presežka
  if (!sort.kljuc) prikazane.sort((a, b) => a.potrebnoDo.localeCompare(b.potrebnoDo) || RANG_ZAMUDE[a.status] - RANG_ZAMUDE[b.status]);
  const ureZamud = sortUr.razvrsti(rezultat.ureZamud);
  if (!sortUr.kljuc)
    ureZamud.sort((a, b) => a.teden.localeCompare(b.teden) || (a.celicaId === null ? "" : celicaIme(a.celicaId)).localeCompare(b.celicaId === null ? "" : celicaIme(b.celicaId)));
  const odseki = sortOdsekov.razvrsti(rezultat.odseki);
  if (!sortOdsekov.kljuc) odseki.sort((a, b) => a.od.localeCompare(b.od) || celicaIme(a.celicaId).localeCompare(celicaIme(b.celicaId)));

  const vsota = (k: "potrebno" | "pravocasno" | "presezek" | "poRoku" | "niNaPlanu", vr = prikazane) => vr.reduce((s, v) => s + v[k], 0);
  const povzetek = (s: ZamudaStatus) => {
    const vr = vse.filter((v) => v.status === s);
    const kos =
      s === "presezek"
        ? vsota("presezek", vr)
        : s === "po_roku" || s === "zapadlo"
          ? vsota("poRoku", vr)
          : s === "ni_na_planu"
            ? vsota("niNaPlanu", vr)
            : vsota("potrebno", vr);
    return `${vr.length} postavk · ${formatNum(kos)} kos`;
  };

  async function izvozi() {
    const XLSX = await import("xlsx");
    const datum = (d: IsoDate | null) => (d ? new Date(`${d}T00:00:00`) : "");
    const ws = XLSX.utils.json_to_sheet(
      prikazane.map((v) => ({
        "Potrebno do": datum(v.potrebnoDo),
        Odprema: datum(v.p.datum_odpreme),
        Naročilo: v.p.stevilka,
        Kupec: v.p.partner ?? "",
        Ident: v.p.ident,
        Artikel: v.p.opis ?? "",
        "Potrebno kos": v.potrebno,
        Pravočasno: v.pravocasno,
        "Zamuda - presežek": v.presezek,
        "Plan po roku": v.poRoku,
        "Ni na planu": v.niNaPlanu,
        Narejeno: v.presezek > 0 ? "nadure" : datum(v.narejeno),
        "Dni zamude": v.presezek > 0 ? "" : dniZamude(v)?.dni || "",
        "Od tega vikend": v.presezek > 0 ? "" : dniZamude(v)?.vikend || "",
        Krovni: v.krovni.join(", "),
        Nalogi: v.nalogi.join(", "),
        Celica: v.celice.map(celicaIme).join(", "),
      })),
      { cellDates: true, dateNF: "d. m. yyyy" },
    );
    ws["!cols"] = [12, 12, 12, 28, 14, 34, 10, 10, 12, 10, 10, 12, 10, 12, 16, 24, 18].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Zamude dobav");
    XLSX.writeFile(wb, `zamude_dobav_${oddelek.toLowerCase().replace(/\s+/g, "_")}_do_${doDatuma}.xlsx`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ============ FILTRI ============ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-[min(100%,18rem)] flex-1">
          <h3 className="flex items-center gap-1.5 text-lg font-bold text-ink-900">
            Zamude dobav zaradi presežka plana
            <InfoNamig naslov="Kako se računa">
              <p>
                Plan pove, kaj se dela. Na dan do 100 % se naredi vse planirano, na dan nad 100 % samo za kapaciteto celice (npr. 200 %
                = polovica planiranega).
              </p>
              <p className="mt-1.5">
                Peči istega identa se delajo po vrsti najzgodnejših odprem, peči brez naročila (zaloga) so zadnje.
              </p>
              <p className="mt-1.5">
                <strong>Plan po roku / Zapadlo:</strong> proizvodnja se ne ustavi - zamujene peči se naredijo takoj, ko je mogoče, in
                vzamejo peči naslednjim odpremam. Narejeno = dan zadnje peči po planu in dni zamude.
              </p>
              <p className="mt-1.5">
                <strong>Presežek:</strong> peči, ki jih zaradi dni nad 100 % ni do roka, se ujamejo z nadurami - naslednja odprema se gleda
                samostojno. Izdelane in prevzete peči so že na zalogi (kot na Prioritetah).
              </p>
            </InfoNamig>
          </h3>
          <p className="text-sm text-ink-500">
            {oddelek} · potrjena naročila od danes do {formatShort(doDatuma)} · plan ostane nespremenjen
          </p>
        </div>
        <Izvoz
          spomin="zamude-dobav"
          formati={[
            {
              koda: "xlsx",
              label: "Excel (.xlsx)",
              hint: "Prikazane odpreme z zamudami v Excel",
              disabled: prikazane.length === 0,
              zakaj: "Ni odprem za izbrane filtre",
              akcija: izvozi,
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KARTICE.map((k) => (
          <FilterKartica
            key={k.status}
            aktivna={statusi.has(k.status)}
            onClick={() =>
              setStatusi((s) => {
                const n = new Set(s);
                if (n.has(k.status)) n.delete(k.status);
                else n.add(k.status);
                return n;
              })
            }
            hint={k.hint}
            barva={k.barva}
            naslov={k.naslov}
            podnaslov={povzetek(k.status)}
          />
        ))}
      </div>

      <div className="fp-card flex flex-col gap-3 p-3 sm:p-4">
        <FilterVrstica>
          <FilterPolje label="Do datuma">
            <input
              type="date"
              value={doDatuma}
              min={danes}
              onChange={(e) => e.target.value && setDoDatuma(e.target.value)}
              title="Upoštevaj odpreme do tega datuma"
              className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
            />
          </FilterPolje>
          <FilterPreklopnik
            label="Plan"
            value={naPlanu}
            onChange={setNaPlanu}
            options={[
              { value: "vse", label: "Vse", hint: "Pokaži vse odpreme" },
              {
                value: "da",
                label: "Na planu",
                hint: "Samo odpreme z vsaj delom kosov na planu",
                stevilo: vse.filter((v) => statusi.has(v.status) && jeNaPlanu(v)).length,
              },
              {
                value: "ne",
                label: "Ni na planu",
                hint: "Samo odpreme brez kosov na planu",
                stevilo: vse.filter((v) => statusi.has(v.status) && !jeNaPlanu(v)).length,
              },
            ]}
          />
          <FilterIskanje value={iskanje} onChange={setIskanje} placeholder="naročilo, kupec, ident, krovni" hint="Poišči odpreme po naročilu, kupcu ali identu" />
        </FilterVrstica>

        {prikazane.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">Ni odprem za izbrane filtre.</p>
        ) : (
          <TabelaOkvir>
            <table className="w-full text-sm">
              <thead className="fp-thead">
                <tr>
                  <SortTh sort={sort} kljuc="rok">Potrebno do</SortTh>
                  <SortTh sort={sort} kljuc="narocilo">Naročilo</SortTh>
                  <SortTh sort={sort} kljuc="kupec">Kupec</SortTh>
                  <SortTh sort={sort} kljuc="ident">Ident</SortTh>
                  <SortTh sort={sort} kljuc="artikel">Artikel</SortTh>
                  <SortTh sort={sort} kljuc="potrebno" desno hint="Kosi iz proizvodnje (ne iz zaloge)">Potrebno</SortTh>
                  <SortTh sort={sort} kljuc="pravocasno" desno hint="Narejeno pravočasno po planu">Pravočasno</SortTh>
                  <SortTh sort={sort} kljuc="presezek" desno hint="Ne bo pravočasno zaradi dni nad 100 %">Presežek</SortTh>
                  <SortTh sort={sort} kljuc="poRoku" desno hint="Plan je tudi brez presežka prepozen">Po roku</SortTh>
                  <SortTh sort={sort} kljuc="niNaPlanu" desno hint="Kosi niso v nobeni postavitvi">Ni na planu</SortTh>
                  <SortTh sort={sort} kljuc="narejeno" hint="Dan zadnje peči po planu in dni zamude">Narejeno</SortTh>
                  <SortTh sort={sort} kljuc="krovni">Krovni</SortTh>
                  <SortTh sort={sort} kljuc="celica">Celica</SortTh>
                </tr>
              </thead>
              <tbody>
                {prikazane.map((v) => (
                  <tr key={v.p.kljuc} className="border-b border-ink-100 hover:bg-ink-50">
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums" title={v.p.datum_odpreme ? `Odprema ${formatShort(v.p.datum_odpreme)}` : undefined}>
                      {formatShort(v.potrebnoDo)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{v.p.stevilka}</td>
                    <td className="max-w-48 truncate px-2 py-1.5" title={v.p.partner ?? ""}>
                      {v.p.partner}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{v.p.ident}</td>
                    <td className="max-w-56 truncate px-2 py-1.5" title={v.p.opis ?? ""}>
                      {v.p.opis}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(v.potrebno)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(v.pravocasno)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Kos v={v.presezek} cls="text-nok-600" />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Kos v={v.poRoku} cls="text-fines-700" />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Kos v={v.niNaPlanu} cls="text-warn-700" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums">
                      <Narejeno v={v} />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs" title={`Nalogi: ${v.nalogi.join(", ")}`}>
                      {v.krovni.join(", ")}
                    </td>
                    <td className="px-2 py-1.5 text-xs">{v.celice.map(celicaIme).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50 font-bold">
                  <td className="px-2 py-2" colSpan={5}>
                    Skupaj · {prikazane.length} postavk
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatNum(vsota("potrebno"))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatNum(vsota("pravocasno"))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Kos v={vsota("presezek")} cls="text-nok-600" />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Kos v={vsota("poRoku")} cls="text-fines-700" />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Kos v={vsota("niNaPlanu")} cls="text-warn-700" />
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </TabelaOkvir>
        )}
      </div>

      {/* ============ URE ZA POKRITJE ZAMUD ============ */}
      <div className="fp-card flex flex-col gap-3 p-3 sm:p-4">
        <div>
          <h3 className="text-lg font-bold text-ink-900">Ure za pokritje zamud</h3>
          <p className="text-sm text-ink-500">
            Koliko ur je treba dodatno narediti, da odpreme ne zamudijo (po roku, zapadlo in presežek). Ure so v tednu pred odpremo -
            odprema v četrtek ali petek: isti teden; zapadle: tekoči teden.
          </p>
        </div>
        {ureZamud.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-500">Do {formatShort(doDatuma)} ni zamud, ki bi jih bilo treba pokriti.</p>
        ) : (
          <TabelaOkvir>
            <table className="w-full text-sm">
              <thead className="fp-thead">
                <tr>
                  <SortTh sort={sortUr} kljuc="teden">Teden</SortTh>
                  <SortTh sort={sortUr} kljuc="celica">Celica</SortTh>
                  <SortTh sort={sortUr} kljuc="peci" desno hint="Zamujene peči odprem tega tedna">Peči</SortTh>
                  <SortTh sort={sortUr} kljuc="ure" desno hint="Peči × ure na peč po normativu">Ure</SortTh>
                  <SortTh sort={sortUr} kljuc="osebe" desno hint="Ure / ure na dan na osebo">≈ oseb·dni</SortTh>
                  <SortTh sort={sortUr} kljuc="odpreme">Odpreme</SortTh>
                  <SortTh sort={sortUr} kljuc="krovni">Krovni</SortTh>
                </tr>
              </thead>
              <tbody>
                {ureZamud.map((u) => (
                  <tr key={`${u.teden}-${u.celicaId}`} className="border-b border-ink-100 hover:bg-ink-50">
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                      <span className="font-semibold">{isoWeek(u.teden)}. teden</span>
                      <span className="ml-1.5 text-xs text-ink-500">
                        {formatDayMonth(u.teden)} – {formatDayMonth(addDays(u.teden, 4))}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-semibold">{u.celicaId === null ? <span className="text-ink-400">–</span> : celicaIme(u.celicaId)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(u.peci)}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-nok-600">{formatUre(u.ure)} h</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {ureNaDan > 0 ? formatNum(Math.round((u.ure / ureNaDan) * 10) / 10) : "–"}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {u.odpreme.map((o, i) => (
                        <span key={i} className="mr-2 inline-block whitespace-nowrap" title={o.partner ?? ""}>
                          <span className="font-mono">{o.stevilka}</span> {formatDayMonth(o.potrebnoDo)} ({formatNum(o.kos)})
                        </span>
                      ))}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">{u.krovni.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50 font-bold">
                  <td className="px-2 py-2" colSpan={2}>
                    Skupaj
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatNum(ureZamud.reduce((s, u) => s + u.peci, 0))}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-nok-600">{formatUre(ureZamud.reduce((s, u) => s + u.ure, 0))} h</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {ureNaDan > 0 ? formatNum(Math.round((ureZamud.reduce((s, u) => s + u.ure, 0) / ureNaDan) * 10) / 10) : "–"}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </TabelaOkvir>
        )}
      </div>

      {/* ============ PREZASEDENE CELICE ============ */}
      <div className="fp-card flex flex-col gap-3 p-3 sm:p-4">
        <div>
          <h3 className="text-lg font-bold text-ink-900">Celice nad 100 %</h3>
          <p className="text-sm text-ink-500">Odseki zaporednih delovnih dni, ko je planiranih več ur, kot jih celica zmore (do {formatShort(doDatuma)}).</p>
        </div>
        {odseki.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-500">V obdobju ni dni nad 100 %.</p>
        ) : (
          <TabelaOkvir>
            <table className="w-full text-sm">
              <thead className="fp-thead">
                <tr>
                  <SortTh sort={sortOdsekov} kljuc="celica">Celica</SortTh>
                  <SortTh sort={sortOdsekov} kljuc="od">Od</SortTh>
                  <SortTh sort={sortOdsekov} kljuc="do">Do</SortTh>
                  <SortTh sort={sortOdsekov} kljuc="dni" desno>Dni</SortTh>
                  <SortTh sort={sortOdsekov} kljuc="pct" desno>Največ</SortTh>
                  <SortTh sort={sortOdsekov} kljuc="ure" desno hint="Planirane ure nad kapaciteto v odseku">Presežek</SortTh>
                  <SortTh sort={sortOdsekov} kljuc="krovni">Krovni</SortTh>
                </tr>
              </thead>
              <tbody>
                {odseki.map((o) => (
                  <tr key={`${o.celicaId}-${o.od}`} className="border-b border-ink-100 hover:bg-ink-50">
                    <td className="px-2 py-1.5 font-semibold">{celicaIme(o.celicaId)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{formatShort(o.od)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{formatShort(o.do)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{o.dni}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-nok-600">{Math.round(o.maxPct)} %</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" title={ureNaDan > 0 ? `≈ ${formatNum(Math.round((o.presezekUr / ureNaDan) * 10) / 10)} oseb·dni` : undefined}>
                      {formatUre(o.presezekUr)} h
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">{o.krovni.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaOkvir>
        )}
      </div>
    </div>
  );
}
