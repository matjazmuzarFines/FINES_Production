"use client";

import { useMemo, useState } from "react";
import type { Vozlisce, ZalogaKosa } from "@/lib/kosovnice";
import { izracunajPredelavo, type PredelavaVrstica } from "@/lib/predelava";
import { formatNum } from "@/lib/stevila";
import { Button } from "@/components/ui/Button";
import { FilterCheckbox, FilterPolje, FilterPreklopnik, FilterVrstica } from "@/components/ui/Filtri";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { WarningText } from "@/components/ui/Notice";
import { Izvoz } from "@/components/ui/Izvoz";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";

export function PredelavaKosovnic({ ident1, ident2, zaloga, poisci }: { ident1: Vozlisce; ident2: Vozlisce; zaloga: Map<string, ZalogaKosa>; poisci: (s: string) => void }) {
  const [smer, setSmer] = useState("21"), [kolicina, setKolicina] = useState("1"), [izkljuci, setIzkljuci] = useState<string[]>([]);
  const [polizdelkiCeli, setPolizdelkiCeli] = useState(true);
  const qty = Number(kolicina), veljavno = Number.isSafeInteger(qty) && qty > 0 && qty <= 10000;
  const [vir, cilj] = smer === "12" ? [ident1, ident2] : [ident2, ident1];
  const rezultat = useMemo(() => veljavno ? izracunajPredelavo(vir, cilj, qty, zaloga, izkljuci, polizdelkiCeli) : null, [vir, cilj, qty, veljavno, zaloga, izkljuci, polizdelkiCeli]);
  const moznosti = useMemo(() => {
    const vsi = (n: Vozlisce): Vozlisce[] => [n, ...n.otroci.flatMap(vsi)];
    const a = new Set(vsi(ident1).map(n => n.sifra));
    return new Map(vsi(ident2).filter(n => a.has(n.sifra)).map(n => [n.sifra, n.naziv]));
  }, [ident1, ident2]);
  const sort = useRazvrscanje<PredelavaVrstica, "sifra" | "naziv" | "potreba" | "zaloga" | "prevzem" | "sestavi" | "manjka" | "opomba">({ sifra: r => r.sifra, naziv: r => r.naziv, potreba: r => r.potreba, zaloga: r => r.zaloga?.razpolozljiva, prevzem: r => r.prevzem, sestavi: r => r.sestavi, manjka: r => r.manjka, opomba: r => r.opomba });
  function razvrsti(stars: number | null): PredelavaVrstica[] {
    return sort.razvrsti(rezultat?.vrstice.filter(r => r.stars === stars) ?? []).flatMap(r => [r, ...razvrsti(r.id)]);
  }
  const vrstice = razvrsti(null);
  async function izvozi(s: string) {
    if (!veljavno) return;
    const p = izracunajPredelavo(s === "12" ? ident1 : ident2, s === "12" ? ident2 : ident1, qty, zaloga, izkljuci, polizdelkiCeli);
    const razvrstiIzvoz = (stars: number | null): PredelavaVrstica[] => sort.razvrsti(p.vrstice.filter(r => r.stars === stars)).flatMap(r => [r, ...razvrstiIzvoz(r.id)]);
    p.vrstice = razvrstiIzvoz(null);
    const { predelavaExcel } = await import("@/lib/predelavaExcel");
    const XLSX = await import("xlsx");
    XLSX.writeFile(predelavaExcel(p), `Predelava_${p.vir}_v_${p.cilj}_${qty}kos.xlsx`);
  }
  return <section className="fp-card min-w-0 p-3 sm:p-4">
    <div className="mb-3 flex flex-wrap items-start gap-3"><div className="min-w-[min(100%,18rem)] flex-1"><h3 className="font-bold">Kaj potrebujem za predelavo?</h3><p className="text-sm text-ink-500">Imam {vir.sifra} → potrebujem {cilj.sifra}. Skupnih uporabnih delov ne naročaj ponovno.</p></div><Izvoz key={smer} formati={[{ koda: "12", label: "Predelava iz 1 v 2", hint: "Prenesi hierarhičen načrt predelave identa 1", akcija: () => izvozi("12"), disabled: !veljavno, zakaj: "Vnesi veljavno količino predelave" }, { koda: "21", label: "Predelava iz 2 v 1", hint: "Prenesi hierarhičen načrt predelave identa 2", akcija: () => izvozi("21"), disabled: !veljavno, zakaj: "Vnesi veljavno količino predelave" }].sort((a, b) => a.koda === smer ? -1 : b.koda === smer ? 1 : 0)} /></div>
    <FilterVrstica className="mb-3"><FilterPreklopnik label="Smer predelave" value={smer} onChange={setSmer} options={[{ value: "12", label: "1 → 2", hint: "Iz identa 1 naredi ident 2" }, { value: "21", label: "2 → 1", hint: "Iz identa 2 naredi ident 1" }]} /><FilterPolje label="Količina peči"><input type="number" min={1} max={10000} step={1} value={kolicina} aria-invalid={!veljavno} title="Število obstoječih peči za predelavo" aria-label="Količina peči za predelavo" onChange={e => setKolicina(e.target.value)} className="h-10 w-28 rounded-lg border border-ink-200 px-3 text-sm" /></FilterPolje><div className="w-64 max-w-full"><MultiSelect prazno="Brez izključitev" label="Ne uporabi ponovno" options={[...moznosti.keys()].sort()} value={izkljuci} onChange={setIzkljuci} oznaka={s => `${s} · ${moznosti.get(s)}`} hint="Izključi poškodovane ali neodstranljive skupne komponente" info={<><p>Komponent, ki so v obeh kosovnicah, v tabeli spodaj ni - načrt predpostavi, da jih iz obstoječe peči odstraniš in vgradiš v novo.</p><p className="mt-1">Komponenta, ki jo izbereš tukaj, se v tabeli pojavi kot potreba: prevzem iz skladišča ali manjka. Pojavi se tudi sestav, v katerem je, ker ga brez nje ni več mogoče prenesti v celoti.</p><p className="mt-1">Izberi dele, ki se pri razstavljanju uničijo ali jih ni mogoče odstraniti.</p></>} /></div><FilterCheckbox label="Polizdelke 096/097 naroči cele" checked={polizdelkiCeli} onChange={setPolizdelkiCeli} hint="Ohrani zvarjence in obdelane dele kot celote" info={<><p>Ne naroča ničesar - spremeni, kako so v tabeli spodaj prikazani obdelani deli (096) in zvarjenci (097).</p><p className="mt-1"><b>Vklopljeno:</b> polizdelek je ena vrstica. Če je v obeh pečeh enak, se ponovno uporabi; če ni, je vrstica z ukrepom »Naroči polizdelek kot celoto«. Pločevine, cevi in ostali deli v njem se ne izpišejo.</p><p className="mt-1"><b>Izklopljeno:</b> polizdelek je siva vrstica sestava, pod njo so njegovi deli. Deli, ki so tudi v starem polizdelku, izginejo iz tabele (vzameš jih iz starega), ostali so potreba.</p><p className="mt-1">Primer: zvarjenec se v novi peči razlikuje samo za eno cev. Vklopljeno: naročiš cel zvarjenec. Izklopljeno: v tabeli ostane samo drugačna cev.</p></>} /></FilterVrstica>
    <WarningText>Prva različica predpostavlja, da se skupni deli lahko ponovno uporabijo. Po potrebi jih izključi. Sestav je delovni korak ali alternativa otrokom, zato njegovih količin ne seštevaj s spodnjimi komponentami. Za naročanje uporabi Excelov list »Za skladišče«.</WarningText>
    {!veljavno ? <p className="py-3 text-sm text-nok-600">Vnesi celo število od 1 do 10000.</p> : <>
      <p className="my-2 text-xs text-ink-500">{rezultat?.uporabljeno.length} povezav ponovne uporabe · {vrstice.length} preostalih vrstic · zaloga se porablja samo enkrat za celotno količino.</p>
      <TabelaOkvir><table className="w-full text-xs [&_td]:px-2 [&_td]:py-1.5 [&_tbody_tr]:border-b [&_tbody_tr]:border-ink-100"><thead className="fp-thead"><tr>{([["sifra", "Šifra"], ["naziv", "Naziv / hierarhija"], ["potreba", "Potrebujem"], ["zaloga", "Razpoložljiva"], ["prevzem", "Prevzem"], ["sestavi", "Izdelaj / sestavi"], ["manjka", "Manjka materiala"], ["opomba", "Ukrep"]] as const).map(([k, label]) => <SortTh key={k} sort={sort} kljuc={k} desno={!["sifra", "naziv", "opomba"].includes(k)}>{label}</SortTh>)}</tr></thead><tbody>{vrstice.map(r => <tr key={r.id} className={r.sestav ? "bg-ink-100 font-semibold" : "hover:bg-ink-50"}><td><button type="button" title="Poišči komponento v obeh izvornih kosovnicah" onClick={() => poisci(r.sifra)} className="font-mono text-fines-600 underline decoration-dotted">{r.sifra}</button></td><td title={r.pot} className="min-w-72"><span style={{ paddingLeft: `${(r.nivo - 1) * 14}px` }}>{r.nivo > 1 ? "└ " : ""}{r.naziv}<small className="ml-1 text-ink-500">N{r.nivo}</small></span></td><td className="text-right tabular-nums">{formatNum(r.potreba)}</td><td className="text-right tabular-nums">{r.zaloga ? formatNum(r.zaloga.razpolozljiva) : "Ni podatka"}</td><td className="text-right text-ok-600 tabular-nums">{formatNum(r.prevzem)}</td><td className="text-right tabular-nums">{r.sestav ? formatNum(r.sestavi) : "—"}</td><td className="text-right text-nok-600 tabular-nums">{r.sestav ? "—" : formatNum(r.manjka)}</td><td className="min-w-56">{r.opomba}</td></tr>)}</tbody></table></TabelaOkvir>
      {!vrstice.length && <p className="py-6 text-center text-sm text-ink-500">Za to predelavo ni dodatnih materialnih potreb.</p>}
      {!!izkljuci.length && <Button variant="neutral" hint="Ponovno omogoči uporabo vseh skupnih komponent" className="mt-2" onClick={() => setIzkljuci([])}>Ponastavi izključitve</Button>}
    </>}
  </section>;
}
