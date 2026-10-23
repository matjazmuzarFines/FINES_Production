"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus, Search, X } from "lucide-react";
import { formatShort, toIso } from "@/lib/dates";
import { jeOdprta, RANG_KONTROLE, type KontrolaStatus, type KontrolaVrstica } from "@/lib/kontrolaPlana";
import { ddmm } from "@/lib/plan";
import type { PriUvoz } from "@/lib/prioritete";
import { formatNum } from "@/lib/stevila";
import { Loading } from "@/components/ui/Notice";
import { SortTh, useRazvrscanje } from "@/components/ui/Tabela";

type Filter = "odprti" | "vsi";
type Stolpec = "status" | "odprema" | "artikel" | "kos" | "krovni";

const OPIS_STATUSA: Record<KontrolaStatus, string> = {
  ok: "Vsi potrebni kosi so na delovnem planu",
  delno: "Na planu je samo del potrebnih kosov",
  ne: "Ni na delovnem planu",
  ni_naloga: "Za kose ni zaloge in ni delovnega naloga (manjka) - ni jih mogoče planirati",
  dn: "Kose pokrije planirana količina DN v ERP, naloga pa ni v uvozu nalogov (zaključen ali drug status) - preveri nalog",
  ni_dela: "Nalogi v tem oddelku nimajo dela (normativ 0)",
};

/**
 * Kontrola plana: postavke naročil po prioritetah (kot na Prioritetah, minimalistično) in ali je
 * nalog, ki jih pokrije, na delovnem planu oddelka. Kljukica se postavi sama.
 */
export function KontrolaPlana({
  vrstice,
  uvoz,
  zamikDni,
  oddelek,
  oznacen,
  onKrovni,
}: {
  /** null = podatki prioritet se še nalagajo. */
  vrstice: KontrolaVrstica[] | null;
  uvoz: PriUvoz | null;
  zamikDni: number;
  oddelek: string;
  /** Krovni, ki je poudarjen na planu. */
  oznacen: string | null;
  onKrovni: (kljuc: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("odprti");
  const [iskanje, setIskanje] = useState("");
  const sort = useRazvrscanje<KontrolaVrstica, Stolpec>({
    status: (v) => RANG_KONTROLE[v.status],
    odprema: (v) => v.p.datum_odpreme,
    artikel: (v) => v.p.ident,
    kos: (v) => v.p.kolicina,
    krovni: (v) => v.krovni[0] ?? null,
  });

  const vse = vrstice ?? [];
  const odprtih = vse.filter(jeOdprta).length;
  const q = iskanje.trim().toLowerCase();
  const prikazane = vse
    .filter((v) => (filter === "vsi" ? true : jeOdprta(v)))
    .filter(
      (v) =>
        !q ||
        [v.p.ident, v.p.opis, v.p.stevilka, v.p.partner, ...v.krovni].some((x) => String(x ?? "").toLowerCase().includes(q)),
    );

  const FILTRI: { v: Filter; label: string; hint: string; st: number }[] = [
    { v: "odprti", label: "Odprti", hint: "Postavke, ki niso (v celoti) na planu ali so planirane prepozno", st: odprtih },
    { v: "vsi", label: "Vsi", hint: "Vse postavke naročil, ki morajo skozi proizvodnjo", st: vse.length },
  ];

  return (
    <div className="fp-card flex min-h-0 flex-col gap-3 p-3 sm:p-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-7rem)]">
      <div>
        <h3 className="text-lg font-bold text-ink-900">Kontrola plana</h3>
        <p className="text-xs text-ink-500">
          Naročila po prioritetah · kljukica = nalog je na planu ({oddelek.toLowerCase()}) z dovolj kosi
          {zamikDni > 0 ? ` · rok = odprema − ${zamikDni} dni` : ""}
        </p>
      </div>

      {vrstice === null ? (
        <Loading />
      ) : !uvoz ? (
        <p className="p-4 text-center text-sm text-ink-500">
          Ni uvoza naročil (VD200). Uvozi ga na{" "}
          <Link href="/proizvodnja/prioritete" title="Odpri Prioritete" className="font-semibold text-fines-500 hover:underline">
            Prioritetah
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter kontrole plana">
            {FILTRI.map((f) => (
              <button
                key={f.v}
                type="button"
                aria-pressed={filter === f.v}
                title={f.hint}
                onClick={() => setFilter(f.v)}
                className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
                  filter === f.v
                    ? "border-fines-500 bg-fines-500 text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:border-fines-500 hover:text-fines-500"
                }`}
              >
                {f.label} {f.st}
              </button>
            ))}
            <span className="ml-auto text-xs text-ink-500" title="Datum uvoza naročil VD200">
              VD200 {formatShort(toIso(new Date(uvoz.created_at)))}
            </span>
          </div>

          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-ink-400" aria-hidden />
            <input
              value={iskanje}
              onChange={(e) => setIskanje(e.target.value)}
              placeholder="Išči ident, naziv, krovni, naročilo ..."
              title="Išči med postavkami naročil"
              className="h-10 w-full rounded-lg border border-ink-200 pl-8 pr-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
            />
          </label>

          <div className="-mx-1 min-h-0 overflow-y-auto px-1 max-xl:max-h-[70vh] xl:flex-1" style={{ ["--fp-thead-top" as string]: "0px" }}>
            {prikazane.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-500">
                {filter === "odprti" ? "Vse je na planu." : "Ni postavk."}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="fp-thead">
                  <tr>
                    <SortTh sort={sort} kljuc="status" className="w-8 !px-1.5" hint="Razvrsti po stanju na planu">
                      {" "}
                    </SortTh>
                    <SortTh sort={sort} kljuc="odprema">Odprema</SortTh>
                    <SortTh sort={sort} kljuc="artikel">Artikel</SortTh>
                    <SortTh sort={sort} kljuc="kos" desno>Kos</SortTh>
                    <SortTh sort={sort} kljuc="krovni">Krovni</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {sort.razvrsti(prikazane).map((v) => (
                    <Vrstica key={v.p.kljuc} v={v} oznacen={oznacen} onKrovni={onKrovni} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Vrstica({ v, oznacen, onKrovni }: { v: KontrolaVrstica; oznacen: string | null; onKrovni: (k: string) => void }) {
  const { p, status } = v;
  const koncano = status === "ok" && !v.pozno;
  const sivo = status === "ok" || status === "dn" || status === "ni_dela";
  return (
    <tr
      className={`border-b border-ink-100 align-top ${sivo ? "text-ink-400" : "text-ink-800"}`}
      title={[p.stevilka, p.partner, p.potrebnoDo ? `potrebno do ${formatShort(p.potrebnoDo)}` : null].filter(Boolean).join(" · ")}
    >
      <td className="px-1.5 py-1.5">
        <Kljukica status={status} />
      </td>
      <td className={`whitespace-nowrap px-2 py-1.5 tabular-nums ${koncano ? "line-through" : ""}`}>
        <div className={sivo ? "" : "font-semibold"}>{p.datum_odpreme ? formatShort(p.datum_odpreme) : "–"}</div>
        {v.konec && (
          <div
            className={`text-[10px] no-underline ${v.pozno ? "font-bold text-nok-600" : "text-ink-400"}`}
            title={v.pozno ? "Plan se konča po roku odpreme" : "Konec plana nalogov postavke"}
          >
            plan do {ddmm(v.konec)}
          </div>
        )}
      </td>
      <td className={`max-w-0 px-2 py-1.5 ${koncano ? "line-through" : ""}`}>
        <div className="truncate font-mono text-[11px]">{p.ident}</div>
        <div className="truncate" title={p.opis ?? ""}>
          {p.opis ?? ""}
        </div>
      </td>
      <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${koncano ? "line-through" : ""}`}>
        {status === "delno" ? (
          <span className="font-semibold text-warn-700" title="Planirani kosi / potrebni kosi iz proizvodnje">
            {formatNum(v.planirano)}/{formatNum(v.potrebno)}
          </span>
        ) : (
          formatNum(p.kolicina)
        )}
        {v.manjka > 0 && (
          <div className="text-[10px] font-semibold text-nok-600" title={OPIS_STATUSA.ni_naloga}>
            manjka {formatNum(v.manjka)}
          </div>
        )}
        {v.dnBrezNaloga > 0 && (
          <div className="text-[10px] font-semibold text-warn-700 no-underline" title={OPIS_STATUSA.dn}>
            DN brez naloga {formatNum(v.dnBrezNaloga)}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-col items-start gap-0.5">
          {v.krovni.map((k) => (
            <button
              key={k}
              type="button"
              title="Pokaži krovni na planu; če še ni na planu, ga izberi za postavitev s klikom na dan"
              onClick={() => onKrovni(k)}
              className={`rounded px-1 font-mono text-[11px] transition-colors ${
                oznacen === k ? "bg-ink-800 text-white" : "hover:bg-fines-50 hover:text-fines-600"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

function Kljukica({ status }: { status: KontrolaStatus }) {
  const osnova = "flex h-5 w-5 items-center justify-center rounded border-2";
  const vsebina =
    status === "ok" ? (
      <span className={`${osnova} border-ok-500 bg-ok-500 text-white`}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    ) : status === "delno" ? (
      <span className={`${osnova} border-warn-400 bg-warn-50 text-warn-700`}>
        <Minus className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    ) : status === "ni_naloga" ? (
      <span className={`${osnova} border-nok-500 bg-nok-50 text-nok-600`}>
        <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    ) : status === "dn" ? (
      <span className={`${osnova} border-warn-400 bg-warn-50 text-[9px] font-bold text-warn-700`}>DN</span>
    ) : status === "ni_dela" ? (
      <span className={`${osnova} border-ink-200 text-ink-300`}>–</span>
    ) : (
      <span className={`${osnova} border-ink-300 bg-white`} />
    );
  return (
    <span role="img" aria-label={OPIS_STATUSA[status]} title={OPIS_STATUSA[status]}>
      {vsebina}
    </span>
  );
}
