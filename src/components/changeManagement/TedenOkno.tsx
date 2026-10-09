"use client";

import { useState } from "react";
import { Save, X } from "lucide-react";
import {
  formatPct,
  shraniTeden,
  tedenObdobje,
  tedenOd,
  tedenSt,
  type CmOcena,
  type CmPodrocje,
  type CmVodja,
} from "@/lib/changeManagement";
import { parseNum } from "@/lib/stevila";
import { Button } from "@/components/ui/Button";
import { FilterIzbira } from "@/components/ui/Filtri";
import { Modal } from "@/components/ui/Modal";
import { ErrorText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";

const HITRE = [-1, -0.5, 0, 0.5, 1];

type Vrstica = { sprememba: string; komentar: string };

/** Okno za vpis (ali popravek) tedenske ocene vseh področij enega vodje. */
export function TedenOkno({
  vodja,
  podrocja,
  ocene,
  teden: zacetniTeden,
  zadnjiTeden,
  onClose,
  onShranjeno,
}: {
  vodja: CmVodja;
  podrocja: CmPodrocje[];
  /** Vse ocene tega vodje. */
  ocene: CmOcena[];
  teden: number;
  /** Zadnji teden, ki ga lahko izbereš (trenutni). */
  zadnjiTeden: number;
  onClose: () => void;
  onShranjeno: () => void;
}) {
  const [teden, setTeden] = useState(zacetniTeden);
  const tedni = Array.from({ length: Math.max(zadnjiTeden, zacetniTeden) }, (_, i) => i + 1);

  return (
    <Modal open title={`Tedenska ocena · ${vodja.naziv}`} onClose={onClose} sirina="max-w-3xl">
      <div className="flex flex-col gap-4">
        <FilterIzbira
          label="Teden"
          hint="Izberi teden, za katerega vpisuješ oceno"
          value={teden}
          options={tedni.map((n) => ({ value: n, label: `${n}. teden (${tedenObdobje(vodja.zacetek, n)})` }))}
          onChange={setTeden}
        />
        {/* key: ob menjavi tedna se vrstice napolnijo z vpisi izbranega tedna */}
        <TedenObrazec
          key={teden}
          vodja={vodja}
          podrocja={podrocja}
          ocene={ocene.filter((o) => tedenSt(vodja.zacetek, o.teden) === teden)}
          teden={teden}
          onClose={onClose}
          onShranjeno={onShranjeno}
        />
      </div>
    </Modal>
  );
}

function TedenObrazec({
  vodja,
  podrocja,
  ocene,
  teden,
  onClose,
  onShranjeno,
}: {
  vodja: CmVodja;
  podrocja: CmPodrocje[];
  ocene: CmOcena[];
  teden: number;
  onClose: () => void;
  onShranjeno: () => void;
}) {
  const notify = useToast();
  const obstojeca = (id: number) => ocene.find((o) => o.podrocje_id === id);
  const [vrstice, setVrstice] = useState<Record<number, Vrstica>>(() =>
    Object.fromEntries(
      podrocja.map((p) => {
        const o = obstojeca(p.id);
        return [p.id, { sprememba: o ? String(o.sprememba).replace(".", ",") : "", komentar: o?.komentar ?? "" }];
      }),
    ),
  );
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);

  const nastavi = (id: number, v: Partial<Vrstica>) => setVrstice((prej) => ({ ...prej, [id]: { ...prej[id], ...v } }));

  async function shrani() {
    const brezKomentarja: string[] = [];
    const neveljavno: string[] = [];
    const vnosi = podrocja.map((p) => {
      const r = vrstice[p.id];
      const prazno = r.sprememba.trim() === "";
      const sprememba = prazno ? null : parseNum(r.sprememba);
      if (!prazno && sprememba === null) neveljavno.push(p.naziv);
      if (sprememba !== null && !r.komentar.trim()) brezKomentarja.push(p.naziv);
      return { podrocje_id: p.id, sprememba, komentar: r.komentar, obstojeci: obstojeca(p.id) };
    });
    if (neveljavno.length) return setNapaka(`Neveljavna številka: ${neveljavno.join(", ")}.`);
    if (brezKomentarja.length) return setNapaka(`Vsak rezultat potrebuje komentar: ${brezKomentarja.join(", ")}.`);

    setNapaka(null);
    setShranjujem(true);
    try {
      await shraniTeden(vodja.id, tedenOd(vodja.zacetek, teden), vnosi);
      notify("success", `Ocena za ${teden}. teden shranjena.`);
      onShranjeno();
    } catch (e) {
      setNapaka(`Napaka pri shranjevanju: ${(e as Error).message}`);
    } finally {
      setShranjujem(false);
    }
  }

  return (
    <>
      <p className="text-sm text-ink-500">
        Vpiši spremembo v odstotnih točkah (npr. +0,5 ali -1) samo za področja, kjer je bila sprememba. Prazno
        polje = brez vpisa (obstoječi vpis se odstrani).
      </p>

      <div className="flex flex-col divide-y divide-ink-100">
        {podrocja.map((p) => {
          const r = vrstice[p.id];
          const n = parseNum(r.sprememba);
          return (
            <div key={p.id} className="grid gap-2 py-3 sm:grid-cols-[150px_1fr] sm:items-start">
              <div className="pt-2">
                {p.sklop && <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{p.sklop}</div>}
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: p.barva }}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.barva }} />
                  {p.naziv}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={r.sprememba}
                    onChange={(e) => nastavi(p.id, { sprememba: e.target.value })}
                    inputMode="decimal"
                    placeholder="—"
                    title={`Sprememba v % za ${p.naziv}`}
                    aria-label={`Sprememba v % za ${p.naziv}`}
                    className="h-10 w-20 rounded-lg border border-ink-200 px-3 text-right text-sm font-semibold tabular-nums focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                  />
                  <span className="mr-1 text-sm text-ink-500">%</span>
                  {HITRE.map((h) => (
                    <button
                      key={h}
                      type="button"
                      title={`Nastavi spremembo na ${formatPct(h)}`}
                      onClick={() => nastavi(p.id, { sprememba: String(h).replace(".", ",") })}
                      className={`h-10 min-w-12 rounded-lg border px-2 text-sm font-semibold tabular-nums transition-colors ${
                        n === h ? "border-fines-500 bg-fines-50 text-fines-700" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
                      }`}
                    >
                      {formatPct(h).replace(" %", "")}
                    </button>
                  ))}
                  {r.sprememba !== "" && (
                    <button
                      type="button"
                      title="Počisti vpis za to področje"
                      onClick={() => nastavi(p.id, { sprememba: "" })}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
                <textarea
                  value={r.komentar}
                  onChange={(e) => nastavi(p.id, { komentar: e.target.value })}
                  rows={2}
                  placeholder="Komentar: kaj se je spremenilo, kaj si opazil ..."
                  title={`Komentar ocene za ${p.naziv}`}
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                />
              </div>
            </div>
          );
        })}
      </div>

      {napaka && <ErrorText>{napaka}</ErrorText>}

      <div className="flex justify-end gap-2">
        <Button hint="Zapri okno brez shranjevanja" variant="neutral" onClick={onClose}>
          Prekliči
        </Button>
        <Button hint="Shrani oceno izbranega tedna" variant="success" icon={Save} disabled={shranjujem} onClick={shrani}>
          {shranjujem ? "Shranjujem ..." : "Shrani"}
        </Button>
      </div>
    </>
  );
}
