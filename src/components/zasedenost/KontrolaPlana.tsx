"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus, Search, X } from "lucide-react";
import { formatShort, toIso } from "@/lib/dates";
import { jeOdprta, RANG_KONTROLE, type KontrolaStatus, type KontrolaVrstica } from "@/lib/kontrolaPlana";
import type { Material } from "@/lib/material";
import { ddmm } from "@/lib/plan";
import { opisDelov, type PostavkaIzracun, type PriUvoz } from "@/lib/prioritete";
import { formatNum } from "@/lib/stevila";
import type { NalogIzracun } from "@/lib/zasedenost";
import { Modal } from "@/components/ui/Modal";
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
  postavke,
  material,
  nalogi,
  zamikDni,
  oddelek,
  oznacen,
  onKrovni,
}: {
  /** null = podatki prioritet se še nalagajo. */
  vrstice: KontrolaVrstica[] | null;
  uvoz: PriUvoz | null;
  /** Vse postavke prioritet (za stanje artikla). */
  postavke: PostavkaIzracun[];
  /** Izpis materiala po identu. */
  material: Map<string, Material>;
  /** Nalogi zadnjega uvoza. */
  nalogi: NalogIzracun[];
  zamikDni: number;
  oddelek: string;
  /** Krovni, ki je poudarjen na planu. */
  oznacen: string | null;
  onKrovni: (kljuc: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("odprti");
  const [iskanje, setIskanje] = useState("");
  const [stanje, setStanje] = useState<PostavkaIzracun | null>(null); // postavka, za katero je odprto stanje artikla
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
                    <Vrstica key={v.p.kljuc} v={v} oznacen={oznacen} onKrovni={onKrovni} onStanje={() => setStanje(v.p)} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {stanje && (
        <StanjeArtikla
          postavka={stanje}
          postavke={postavke.filter((p) => p.ident === stanje.ident)}
          material={material.get(stanje.ident)}
          nalogi={nalogi.filter((n) => n.koda_artikla === stanje.ident)}
          onZapri={() => setStanje(null)}
        />
      )}
    </div>
  );
}

function Vrstica({
  v,
  oznacen,
  onKrovni,
  onStanje,
}: {
  v: KontrolaVrstica;
  oznacen: string | null;
  onKrovni: (k: string) => void;
  onStanje: () => void;
}) {
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
          <button
            type="button"
            onClick={onStanje}
            title={`${OPIS_STATUSA.ni_naloga}. Klik: stanje materiala in naročila artikla`}
            className="block w-full text-right text-[10px] font-semibold text-nok-600 underline decoration-dotted underline-offset-2 hover:text-nok-500"
          >
            manjka {formatNum(v.manjka)}
          </button>
        )}
        {v.dnBrezNaloga > 0 && (
          <button
            type="button"
            onClick={onStanje}
            title={`${OPIS_STATUSA.dn}. Klik: stanje materiala in naročila artikla`}
            className="block w-full text-right text-[10px] font-semibold text-warn-700 underline decoration-dotted underline-offset-2 hover:text-warn-500"
          >
            DN brez naloga {formatNum(v.dnBrezNaloga)}
          </button>
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

// =====================================================================
// STANJE ARTIKLA (popup ob "manjka" / "DN brez naloga")
// =====================================================================

type NarociloStolpec = "odprema" | "narocilo" | "kupec" | "status" | "kos" | "pokritje";
type NalogStolpec = "nalog" | "krovni" | "razpisano" | "izdelano" | "odprto" | "rok";

const statusPostavke = (p: PostavkaIzracun) => (p.nepotrjeno ? "nepotrjeno" : p.vOdpremi ? "v odpremi" : "potrjeno");

function StanjeArtikla({
  postavka,
  postavke,
  material,
  nalogi,
  onZapri,
}: {
  /** Postavka, iz katere je okno odprto (poudarjena v tabeli). */
  postavka: PostavkaIzracun;
  /** Vse postavke naročil artikla. */
  postavke: PostavkaIzracun[];
  material?: Material;
  /** Nalogi artikla iz zadnjega uvoza. */
  nalogi: NalogIzracun[];
  onZapri: () => void;
}) {
  const sortNar = useRazvrscanje<PostavkaIzracun, NarociloStolpec>({
    odprema: (p) => p.datum_odpreme,
    narocilo: (p) => p.stevilka,
    kupec: (p) => p.partner,
    status: (p) => statusPostavke(p),
    kos: (p) => p.kolicina,
    pokritje: (p) => opisDelov(p.deli),
  });
  const sortNal = useRazvrscanje<NalogIzracun, NalogStolpec>({
    nalog: (n) => n.st_naloga,
    krovni: (n) => n.krovni_dn,
    razpisano: (n) => n.razpisana_kolicina,
    izdelano: (n) => n.izdelana_kolicina,
    odprto: (n) => n.preostala,
    rok: (n) => n.rok_izdelave,
  });

  // Brez izpisa materiala: podatki iz izvoza VD200 (prosta zaloga v VD200 je v ERP napačna)
  const potrjeno = postavke.filter((p) => !p.nepotrjeno).reduce((s, p) => s + p.kolicina, 0);
  const st = material
    ? {
        zaloga: material.zaloga,
        ostalo: material.zaloga_ostalo,
        naroceno: material.naroceno,
        dn: material.planirano_dn,
        prosta: material.prosta_zaloga,
        zaDn: material.planirano_proizvodnja,
      }
    : {
        zaloga: postavka.zaloga,
        ostalo: postavka.zaloga_ostalo,
        naroceno: potrjeno,
        dn: postavka.planirano_dn,
        prosta: postavka.prosta_zaloga,
        zaDn: 0,
      };
  const urejene = [...postavke].sort(
    (a, b) => (a.datum_odpreme ?? "9999").localeCompare(b.datum_odpreme ?? "9999") || a.stevilka.localeCompare(b.stevilka),
  );
  const odprtiNalogi = nalogi.filter((n) => n.preostala > 0);

  return (
    <Modal open title={`${postavka.ident} · ${postavka.opis ?? ""}`} onClose={onZapri} sirina="max-w-4xl">
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Stanje materiala</span>
            <span className="text-[11px] text-ink-400">{material ? "izpis materiala (ERP)" : "ni v izpisu materiala - podatki iz VD200"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Ploscica label="Zaloga matično" vrednost={st.zaloga} hint="ZALOGA (MATIČNO) (3)" />
            <Ploscica label="Ostala zaloga" vrednost={st.ostalo} hint="ZALOGA (OSTALO) (4) - ne šteje v pokritje naročil" />
            <Ploscica
              label="Naročeno skupaj"
              vrednost={st.naroceno}
              hint={material ? `NAROČENO (6) v ERP · potrjene postavke VD200: ${formatNum(potrjeno)}` : "Potrjene postavke VD200"}
              opozorilo={!!material && Math.abs(material.naroceno - potrjeno) > 1e-6}
            />
            <Ploscica label="Planirano DN" vrednost={st.dn} hint="PLANIRANA KOLIČINA (DEL.NALOGI) (8) - prihod iz delovnih nalogov" />
            <Ploscica
              label="Prosta zaloga"
              vrednost={st.prosta}
              hint={material ? "PROSTA ZALOGA (9 = 3+5-6-7+8)" : "Izračun aplikacije: zaloga + DN - naročila"}
              cls={st.prosta < 0 ? "text-nok-600" : st.prosta > 0 ? "text-ok-600" : "text-ink-800"}
            />
          </div>
          {material && Math.abs(material.naroceno - potrjeno) > 1e-6 && (
            <p className="mt-1.5 text-xs text-warn-700">
              Naročeno v ERP ({formatNum(material.naroceno)}) se razlikuje od potrjenih postavk VD200 ({formatNum(potrjeno)}) - izvoza
              morda nista z istega dne.
            </p>
          )}
          {st.zaDn > 0 && (
            <p className="mt-1.5 text-xs text-ink-600">
              {formatNum(st.zaDn)} kos je razpisanih kot material na druge delovne naloge (se odšteje od zaloge).
            </p>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Naročila ({urejene.length})</div>
          <div className="max-h-[35vh] overflow-auto rounded-lg" style={{ ["--fp-thead-top" as string]: "0px" }}>
            <table className="w-full text-xs">
              <thead className="fp-thead">
                <tr>
                  <SortTh sort={sortNar} kljuc="odprema">Odprema</SortTh>
                  <SortTh sort={sortNar} kljuc="narocilo">Naročilo</SortTh>
                  <SortTh sort={sortNar} kljuc="kupec">Kupec</SortTh>
                  <SortTh sort={sortNar} kljuc="status">Status</SortTh>
                  <SortTh sort={sortNar} kljuc="kos" desno>Kos</SortTh>
                  <SortTh sort={sortNar} kljuc="pokritje">Pokritje</SortTh>
                </tr>
              </thead>
              <tbody>
                {sortNar.razvrsti(urejene).map((p) => (
                  <tr
                    key={p.kljuc}
                    className={`border-b border-ink-100 align-top ${p.kljuc === postavka.kljuc ? "bg-fines-50" : p.nepotrjeno ? "text-ink-400" : ""}`}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{p.datum_odpreme ? formatShort(p.datum_odpreme) : "–"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                      {p.stevilka}
                      {p.kupcevo_narocilo && <div className="font-sans text-[10px] text-ink-500">{p.kupcevo_narocilo}</div>}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-semibold">{p.partner ?? "–"}</div>
                      {(p.lokacija || p.drzava) && (
                        <div className="text-[10px] text-ink-500">{[p.lokacija, p.drzava].filter(Boolean).join(" · ")}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">{statusPostavke(p)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatNum(p.kolicina)}</td>
                    <td className="px-2 py-1.5">
                      <Pokritje p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Delovni nalogi v uvozu ({odprtiNalogi.length} odprtih)
          </div>
          {nalogi.length === 0 ? (
            <p className="text-xs text-ink-500">Artikel nima delovnih nalogov v zadnjem uvozu nalogov.</p>
          ) : (
            <div className="max-h-[25vh] overflow-auto rounded-lg" style={{ ["--fp-thead-top" as string]: "0px" }}>
              <table className="w-full text-xs">
                <thead className="fp-thead">
                  <tr>
                    <SortTh sort={sortNal} kljuc="nalog">Nalog</SortTh>
                    <SortTh sort={sortNal} kljuc="krovni">Krovni</SortTh>
                    <SortTh sort={sortNal} kljuc="razpisano" desno>Razpisano</SortTh>
                    <SortTh sort={sortNal} kljuc="izdelano" desno>Izdelano</SortTh>
                    <SortTh sort={sortNal} kljuc="odprto" desno>Odprto</SortTh>
                    <SortTh sort={sortNal} kljuc="rok">Rok</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {sortNal.razvrsti(nalogi).map((n) => (
                    <tr key={n.st_naloga} className={`border-b border-ink-100 ${n.preostala > 0 ? "" : "text-ink-400"}`}>
                      <td className="px-2 py-1.5 font-mono">{n.st_naloga}</td>
                      <td className="px-2 py-1.5 font-mono">{n.krovni_dn ?? "–"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(n.razpisana_kolicina)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(n.izdelana_kolicina)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatNum(n.preostala)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{n.rok_izdelave ? formatShort(n.rok_izdelave) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {material && material.planirano_dn > odprtiNalogi.reduce((s, n) => s + n.preostala, 0) && (
            <p className="mt-1.5 text-xs text-warn-700">
              ERP ima planiranih {formatNum(material.planirano_dn)} kos na delovnih nalogih, v uvozu nalogov pa je odprtih samo{" "}
              {formatNum(odprtiNalogi.reduce((s, n) => s + n.preostala, 0))} - preveri naloge, ki jih v uvozu ni (zaključeni, drug status).
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Ploscica({
  label,
  vrednost,
  hint,
  cls = "text-ink-800",
  opozorilo = false,
}: {
  label: string;
  vrednost: number;
  hint: string;
  cls?: string;
  opozorilo?: boolean;
}) {
  return (
    <div className={`rounded-lg px-2 py-2 text-center ${opozorilo ? "bg-warn-50 ring-1 ring-warn-400" : "bg-ink-50"}`} title={hint}>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{formatNum(vrednost)}</div>
      <div className="text-[10px] text-ink-500">{label}</div>
    </div>
  );
}

/** Od kod pride postavka: zaloga, nalog, DN, odprema, manjka (barvno). */
function Pokritje({ p }: { p: PostavkaIzracun }) {
  if (!p.deli.length) return <span className="text-ink-400">ne šteje v potrebe</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {p.deli.map((d, i) => {
        const [besedilo, cls] =
          d.vir === "zaloga"
            ? [`${formatNum(d.kolicina)} zaloga`, "bg-ok-50 text-ok-600"]
            : d.vir === "odprema"
              ? [`${formatNum(d.kolicina)} v odpremi`, "bg-sync-50 text-sync-600"]
              : d.vir === "nalog"
                ? [`${formatNum(d.kolicina)} nalog ${d.nalog}`, "bg-ink-100 text-ink-700"]
                : d.vir === "dn"
                  ? [`${formatNum(d.kolicina)} DN brez naloga`, "bg-warn-50 text-warn-700"]
                  : [`${formatNum(d.kolicina)} manjka`, "bg-nok-50 text-nok-600"];
        return (
          <span key={i} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
            {besedilo}
          </span>
        );
      })}
    </div>
  );
}
