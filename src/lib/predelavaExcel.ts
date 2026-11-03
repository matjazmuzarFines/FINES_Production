import * as XLSX from "xlsx";
import type { Predelava } from "./predelava";

/** Samostojen, sledljiv izpis: hierarhija in dejanski prevzem sta locena,
 * zato se sestavi in njihovi otroci nikoli ne sesestevajo kot isto narocilo. */
export function predelavaExcel(p: Predelava) {
  const wb = XLSX.utils.book_new();
  function list(ime: string, naslov: string, glava: string[], rows: (string | number | null)[][], sirine: number[]) {
    const ws = XLSX.utils.aoa_to_sheet([
      [naslov], [`Iz ${p.vir} v ${p.cilj} · ${p.kolicina} kos`],
      ["Skupni deli so ponovno uporabljeni. Zaloga je informativna; izpis je ne rezervira."], [], glava, ...rows,
    ]);
    ws["!cols"] = sirine.map(wch => ({ wch }));
    ws["!merges"] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: glava.length - 1 } }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + rows.length, c: glava.length - 1 } }) };
    for (let r = 5; r < rows.length + 5; r++) for (let c = 0; c < glava.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell?.t === "n") cell.z = Number.isInteger(cell.v) ? "0" : "0.###";
    }
    XLSX.utils.book_append_sheet(wb, ws, ime);
    return ws;
  }
  const h = list("Hierarhija", "PREDELAVA – PREOSTALE POTREBE PO SESTAVIH", ["Nivo", "Šifra", "Naziv / hierarhija", "Vrsta", "Ciljna količina", "Ponovna uporaba", "Preostala potreba", "EM", "Matična zaloga", "Razpoložljiva zaloga", "Prevzem", "Izdelaj / sestavi", "Manjka materiala", "Navodilo", "Celotna pot"],
    p.vrstice.map(r => [r.nivo, r.sifra, `${"    ".repeat(r.nivo - 1)}${r.naziv}`, r.sestav ? "Sestav" : "Komponenta", r.cilj, r.ponovno, r.potreba, r.zaloga?.em ?? null, r.zaloga?.zaloga ?? null, r.zaloga?.razpolozljiva ?? null, r.prevzem, r.sestavi, r.manjka, r.opomba, r.pot]), [7, 20, 65, 15, 17, 18, 19, 8, 18, 22, 15, 19, 19, 75, 110]);
  h["!rows"] = Array.from({ length: p.vrstice.length + 5 }, (_, i) => i < 5 ? {} : { level: Math.min(7, p.vrstice[i - 5].nivo - 1) });
  h["!outline"] = { above: true, left: false };
  const po = new Map<string, { naziv: string; potreba: number; prevzem: number; manjka: number; em: string | null; poti: string[] }>();
  for (const r of p.vrstice) {
    if (r.sestav && !r.prevzem) continue;
    const s = po.get(r.sifra) ?? { naziv: r.naziv, potreba: 0, prevzem: 0, manjka: 0, em: r.zaloga?.em ?? null, poti: [] };
    s.potreba += r.sestav ? r.prevzem : r.potreba; s.prevzem += r.prevzem; s.manjka += r.manjka;
    s.poti.push(r.pot); po.set(r.sifra, s);
  }
  list("Za skladisce", "DEJANSKI PREVZEM IN MANJKAJOČI MATERIAL", ["Šifra", "Naziv", "Potrebno", "Prevzem iz zaloge", "Manjka", "EM", "Poti v ciljni kosovnici"], [...po].map(([s, r]) => [s, r.naziv, r.potreba, r.prevzem, r.manjka, r.em, r.poti.join("; ")]), [21, 70, 18, 22, 18, 9, 130]);
  list("Ponovna uporaba", "KOMPONENTE IZ OBSTOJEČEGA IZDELKA – NE NAROČAJ PONOVNO", ["Šifra", "Naziv", "Količina", "Izvorna pot", "Ciljna pot"], p.uporabljeno.map(r => [r.sifra, r.naziv, r.kolicina, r.virPot, r.ciljPot]), [21, 70, 18, 120, 120]);
  list("Navodila", "NAVODILA ZA BRANJE IZPISA", ["Področje", "Pojasnilo"], [
    ["Smer", `${p.vir} → ${p.cilj}, ${p.kolicina} kosov predelave (enaka količina izvornih in ciljnih izdelkov).`],
    ["Hierarhija", "Ohranjeni so različni sestavi in njihove preostale potrebe. Enaki ponovno uporabni deli so odstranjeni; sled uporabe je na ločenem listu."],
    ["Sestavi", "Izdelaj / sestavi je delovni korak, ne dodatno naročilo poleg otrok. Pri uporabi skupnih otrok ne naročamo hkrati novega celotnega sestava."],
    ["Za skladišče", "Ta list je seštevek dejanskih prevzemov in manjkajočih komponent. Prevzeti sestavi pokrijejo svoje otroke brez podvojitve naročila."],
    ["Zaloga", "Prevzem omejimo na največ min(matična, razpoložljiva), najmanj 0. Isto zalogo v celotnem predlogu uporabimo samo enkrat."],
    ["Ponovna uporaba", "Predpostavljamo uporabne in odstranljive skupne dele. Dele, ki jih ne želiš ponovno uporabiti, izključi v aplikaciji pred izvozom."],
    ["Polizdelki 096/097", p.polizdelkiCeli ? "Naročajo se kot celota. Iz različnih zvarjencev/obdelanih delov ne predpostavljamo ponovne uporabe surovine." : "Vključen je razvoj polizdelkov do nižjih nivojev. Možnost dejanske ponovne uporabe teh delov moraš preveriti."],
    ["Preverjanje", "Količine sledijo izvozu ERP, tudi če se ista šifra pojavi na več poteh. Surovine in zvarjene dele je treba presoditi glede možnosti ponovne uporabe."],
  ], [25, 170]);
  return wb;
}
