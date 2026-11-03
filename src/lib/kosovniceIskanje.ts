import { ujemaIskanje } from "./iskanje";
import type { Vozlisce } from "./kosovnice";

/** Poišče vse pojavitve komponente in pot do vsake, tudi v zaprtih sestavih. */
export function poisciKomponente(koren: Vozlisce, iskanje: string) {
  const zadetki: Vozlisce[] = [];
  const predniki = new Set<number>();
  function obisk(n: Vozlisce, pot: number[]) {
    if (iskanje.trim() && ujemaIskanje(iskanje, [n.sifra, n.naziv, n.risp_sifra])) {
      zadetki.push(n);
      for (const id of pot) predniki.add(id);
    }
    for (const o of n.otroci) obisk(o, [...pot, n.vrstica]);
  }
  obisk(koren, []);
  return { zadetki, predniki };
}
