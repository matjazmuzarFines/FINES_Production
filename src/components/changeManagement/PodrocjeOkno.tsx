"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { shraniPodrocje, type CmPodrocje } from "@/lib/changeManagement";
import { parseNum } from "@/lib/stevila";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ErrorText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";

const POLJE =
  "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

/** Urejanje cilja, gesla, točk (na čem se dela) in pričakovanj področja. */
export function PodrocjeOkno({
  podrocje: p,
  onClose,
  onShranjeno,
}: {
  podrocje: CmPodrocje;
  onClose: () => void;
  onShranjeno: () => void;
}) {
  const notify = useToast();
  const [cilj, setCilj] = useState(String(p.cilj).replace(".", ","));
  const [geslo, setGeslo] = useState(p.geslo ?? "");
  const [tocke, setTocke] = useState(p.tocke ?? "");
  const [pricakovanja, setPricakovanja] = useState(p.pricakovanja ?? "");
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);

  async function shrani() {
    const c = parseNum(cilj);
    if (c === null || c <= 0) return setNapaka("Cilj mora biti pozitivno število (npr. 40).");
    setShranjujem(true);
    try {
      await shraniPodrocje(p.id, {
        cilj: c,
        geslo: geslo.trim() || null,
        tocke: tocke.trim() || null,
        pricakovanja: pricakovanja.trim() || null,
      });
      notify("success", `Cilji področja ${p.naziv} shranjeni.`);
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka pri shranjevanju: ${(e as Error).message}. Je migracija 005 zagnana?`);
    } finally {
      setShranjujem(false);
    }
  }

  return (
    <Modal open title={`Cilji · ${p.naziv}`} onClose={onClose} sirina="max-w-2xl">
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1 font-semibold text-ink-700">
          Cilj v % (v 3 mesecih)
          <input
            value={cilj}
            onChange={(e) => setCilj(e.target.value)}
            inputMode="decimal"
            title="Ciljni napredek v odstotkih"
            className={`${POLJE} h-10 w-28 text-right font-semibold tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold text-ink-700">
          Geslo
          <input value={geslo} onChange={(e) => setGeslo(e.target.value)} title="Kratko geslo področja" className={`${POLJE} h-10`} />
        </label>
        <label className="flex flex-col gap-1 font-semibold text-ink-700">
          Na čem se dela (ena točka v vrstici)
          <textarea value={tocke} onChange={(e) => setTocke(e.target.value)} rows={4} title="Konkretne točke, ena v vrstici" className={POLJE} />
        </label>
        <label className="flex flex-col gap-1 font-semibold text-ink-700">
          Pričakovanja
          <textarea
            value={pricakovanja}
            onChange={(e) => setPricakovanja(e.target.value)}
            rows={4}
            placeholder="Kaj pričakujemo od vodje na tem področju, kako izgleda uspeh ..."
            title="Pričakovanja na tem področju"
            className={POLJE}
          />
        </label>
        {napaka && <ErrorText>{napaka}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button hint="Zapri okno brez shranjevanja" variant="neutral" onClick={onClose}>
            Prekliči
          </Button>
          <Button hint="Shrani cilje področja" variant="success" icon={Save} disabled={shranjujem} onClick={shrani}>
            {shranjujem ? "Shranjujem ..." : "Shrani"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
