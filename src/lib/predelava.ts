import type { Vozlisce, ZalogaKosa } from "./kosovnice";

const EPS = 1e-8;
export type PredelavaVrstica = {
  id: number; stars: number | null; nivo: number; pot: string; sifra: string; naziv: string;
  cilj: number; ponovno: number; potreba: number; prevzem: number; manjka: number;
  sestav: boolean; sestavi: number; zaloga: ZalogaKosa | null; opomba: string;
};
export type Predelava = {
  vir: string; cilj: string; kolicina: number; polizdelkiCeli: boolean; vrstice: PredelavaVrstica[];
  uporabljeno: { sifra: string; naziv: string; kolicina: number; virPot: string; ciljPot: string }[];
};
type Del = { n: Vozlisce; stars: Del | null; otroci: Del[]; pot: string; podpis: string; teza: number; qty: number; ostanek: number; ponovno: number };

/** Skupne celotne sestave najprej ohranimo, sele nato iscemo skupne dele
 * razlicnih sestavov. Poraba sestava hkrati odstrani njegove otroke iz zaloge
 * za ponovno uporabo. Ujemanje ni vezano na imena ali pot sestava. */
export function izracunajPredelavo(vir: Vozlisce, cilj: Vozlisce, kolicina: number, zaloga: Map<string, ZalogaKosa>, izkljuci: string[] = [], polizdelkiCeli = true): Predelava {
  if (!Number.isSafeInteger(kolicina) || kolicina < 1 || kolicina > 10000) throw new Error("Količina predelave mora biti celo število od 1 do 10000.");
  const brezPonovne = new Set(izkljuci);
  // V tem ERP sta 096 obdelan del/pločevina in 097 zvarjenec. Različnega
  // zvarjenca ne moremo razstaviti nazaj v uporabno surovino. Nastavitev je izklopljiva.
  const meja = (n: Vozlisce) => polizdelkiCeli && ["096", "097"].includes(n.klasifikat ?? n.sifra.split("-")[0]);
  function pripravi(koren: Vozlisce) {
    const vsi: Del[] = [];
    function ustvari(n: Vozlisce, stars: Del | null, qty: number): Del {
      const d: Del = { n, stars, otroci: [], pot: stars ? `${stars.pot} / ${n.sifra}` : n.sifra, podpis: "", teza: 1, qty, ostanek: qty, ponovno: 0 };
      d.otroci = n.otroci.map(o => ustvari(o, d, qty * o.kolicina));
      const podpisOtrok = new Map<string, number>();
      for (const o of d.otroci) podpisOtrok.set(o.podpis, (podpisOtrok.get(o.podpis) ?? 0) + o.n.kolicina);
      // Izkljucitev otroka iz ponovne uporabe prepreči tudi ponovno uporabo celotnega starsa.
      const blokiran = brezPonovne.has(n.sifra) || d.otroci.some(o => !o.podpis);
      d.podpis = blokiran ? "" : JSON.stringify([n.sifra, [...podpisOtrok].sort(([a], [b]) => a.localeCompare(b)).map(([s, q]) => [s, Number(q.toPrecision(12))])]);
      d.teza += d.otroci.reduce((s, o) => s + o.teza, 0);
      vsi.push(d);
      return d;
    }
    const korenDel = ustvari(koren, null, kolicina);
    return { vsi: vsi.filter(d => {
      if (d === korenDel) return false;
      for (let p = d.stars; p && p !== korenDel; p = p.stars) if (meja(p.n)) return false;
      return true;
    }), koren: korenDel };
  }
  const a = pripravi(vir), b = pripravi(cilj);
  const podpisVir = new Map<string, Del[]>();
  for (const d of a.vsi) if (d.podpis) podpisVir.set(d.podpis, [...(podpisVir.get(d.podpis) ?? []), d]);
  const uporabljeno: Predelava["uporabljeno"] = [];
  function porabi(d: Del, qty: number) {
    d.ostanek = Math.max(0, d.ostanek - qty);
    for (const o of d.otroci) porabi(o, qty * o.n.kolicina);
  }
  // Vsak stars ima vecjo tezo od vseh svojih otrok, zato se po porabi
  // otroka noben njegov prednik ne more ponovno uporabiti kot celota.
  for (const d of [...b.vsi].sort((x, y) => y.teza - x.teza || x.n.vrstica - y.n.vrstica)) {
    if (!d.podpis || d.ostanek < EPS) continue;
    for (const s of podpisVir.get(d.podpis) ?? []) {
      const qty = Math.min(d.ostanek, s.ostanek);
      if (qty < EPS) continue;
      porabi(s, qty); porabi(d, qty); d.ponovno += qty;
      uporabljeno.push({ sifra: d.n.sifra, naziv: d.n.naziv, kolicina: qty, virPot: s.pot, ciljPot: d.pot });
      if (d.ostanek < EPS) break;
    }
  }
  const naVoljo = new Map([...zaloga].map(([s, z]) => [s, Math.max(0, Math.min(z.zaloga, z.razpolozljiva))]));
  const vrstice: PredelavaVrstica[] = [];
  function vsebujePonovno(d: Del): boolean { return d.ponovno > EPS || d.otroci.some(vsebujePonovno); }
  function obisk(d: Del, stars: number | null, nivo: number, faktor: number) {
    const qty = d.ostanek * faktor;
    if (qty < EPS) return;
    const z = zaloga.get(d.n.sifra) ?? null;
    let prosto = naVoljo.get(d.n.sifra) ?? 0;
    if (/^(kos|kom|pcs)$/i.test(z?.em ?? "")) prosto = Math.floor(prosto);
    // Ce bomo uporabili skupne otroke, ne narocimo hkrati novega celotnega
    // sestava. S tem obdrzimo veljavnost ze razporejene ponovne uporabe.
    const skupniOtroci = d.otroci.some(vsebujePonovno);
    const prevzem = skupniOtroci ? 0 : Math.min(qty, prosto);
    naVoljo.set(d.n.sifra, prosto - prevzem);
    const preostalo = Math.max(0, qty - prevzem);
    const sestav = d.otroci.length > 0 && !meja(d.n);
    vrstice.push({ id: d.n.vrstica, stars, nivo, pot: d.pot, sifra: d.n.sifra, naziv: d.n.naziv, cilj: d.qty, ponovno: d.ponovno, potreba: qty, prevzem, manjka: sestav ? 0 : preostalo, sestav, sestavi: sestav ? preostalo : 0, zaloga: z,
      opomba: sestav ? skupniOtroci ? "Predelaj / sestavi s skupnimi deli; naroči le spodnje potrebe" : preostalo > EPS ? "Iz zaloge pokrij sestav, ostanek izdelaj iz spodnjih potreb" : "Prevzemi celoten sestav; otroci niso dodatno naročilo" : meja(d.n) ? "Naroči polizdelek kot celoto (096/097); ne prištevaj surovin" : preostalo > EPS ? "Delno ali v celoti manjka v skladišču" : "Prevzemi iz skladišča" });
    if (sestav && preostalo > EPS) for (const o of d.otroci) obisk(o, d.n.vrstica, nivo + 1, faktor * preostalo / qty);
  }
  for (const d of b.koren.otroci) obisk(d, null, 1, 1);
  return { vir: vir.sifra, cilj: cilj.sifra, kolicina, polizdelkiCeli, vrstice, uporabljeno };
}
