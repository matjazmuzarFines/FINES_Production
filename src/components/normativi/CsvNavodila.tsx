"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

const STOLPCI: [string, string, string][] = [
  ["ident", "DA", "Proizvodna šifra artikla, npr. 097-10685. Po njej se normativ poveže z nalogi."],
  ["naziv", "DA", "Naziv artikla."],
  ["normativ_skupni", "DA", "Skupni normativ v urah na kos, npr. 4,5"],
  ["druzina", "ne", "Koda družine, npr. OCB, RN-CU. Nova družina se ustvari sama."],
  ["velikost", "ne", "Velikost (število), npr. 60. Lahko je prazno."],
  ["normativ_proizvodnja", "ne", "Ure na kos za proizvodnjo (P)."],
  ["normativ_montaza", "ne", "Ure na kos za montažo (M)."],
  ["normativ_elektro", "ne", "Ure na kos za elektro (E)."],
  ["normativ_testiranje", "ne", "Ure na kos za testiranje (T)."],
  ["barvanje", "ne", "DA ali NE."],
  ["cleaning", "ne", "DA ali NE."],
];

export function CsvNavodila({ onPredloga }: { onPredloga: () => void }) {
  return (
    <div className="flex flex-col gap-4 text-sm text-ink-700">
      <section>
        <h3 className="mb-1 font-bold text-ink-900">Format datoteke</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Datoteka <strong>.csv</strong>, ločilo <strong>podpičje (;)</strong>. Tako shrani Excel: <em>Shrani kot → CSV UTF-8
            (ločeno z vejicami)</em>. Sprejeta je tudi vejica (,) kot ločilo.
          </li>
          <li>
            <strong>Prva vrstica je glava</strong> z imeni stolpcev (točno kot v tabeli spodaj, male črke). Vrstni red stolpcev ni
            pomemben.
          </li>
          <li>Decimalna števila z vejico ali piko: <code>4,5</code> ali <code>4.5</code>.</li>
          <li>Ena vrstica = en normativ. Ident se v datoteki ne sme ponoviti.</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 font-bold text-ink-900">Kaj naredi uvoz</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Če ident že obstaja, se normativ <strong>posodobi</strong>. Če ne, se <strong>doda</strong>.</li>
          <li>
            Posodobijo se <strong>samo stolpci, ki so v datoteki</strong>. Če npr. pošlješ samo <code>ident;naziv;normativ_skupni</code>,
            ostali podatki ostanejo nespremenjeni.
          </li>
          <li>Normativi, ki jih ni v datoteki, se ne spremenijo (nič se ne briše).</li>
          <li>Pred uvozom se prikaže pregled: število novih, posodobljenih in vrstic z napako.</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 font-bold text-ink-900">Stolpci</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-ink-200 text-ink-500">
                <th className="py-1 pr-2">Stolpec</th>
                <th className="py-1 pr-2">Obvezen</th>
                <th className="py-1">Opis</th>
              </tr>
            </thead>
            <tbody>
              {STOLPCI.map(([ime, obv, opis]) => (
                <tr key={ime} className="border-b border-ink-100">
                  <td className="py-1 pr-2 font-mono">{ime}</td>
                  <td className={`py-1 pr-2 font-semibold ${obv === "DA" ? "text-fines-500" : "text-ink-400"}`}>{obv}</td>
                  <td className="py-1">{opis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-bold text-ink-900">Primer</h3>
        <pre className="overflow-x-auto rounded-lg bg-ink-100 p-3 text-xs">
          {`ident;naziv;druzina;velikost;normativ_skupni;normativ_proizvodnja;normativ_montaza;normativ_elektro;normativ_testiranje;barvanje;cleaning
100-116;Podstavek nevtralni OP-611/1011;RN-CU;;4,5;4,5;0;0;0;NE;NE
110-10245;Peč etažna FD64H2/3-S;ODC;3;13,5;1,89;7,83;1,755;2,16;DA;NE`}
        </pre>
        <p className="mt-2 text-ink-500">
          Nasvet: z gumbom <strong>Izvoz</strong> dobiš trenutne normative v pravem formatu. Uredi jih v Excelu in jih uvozi nazaj.
        </p>
      </section>

      <Button hint="Prenesi prazno predlogo CSV z glavo" variant="neutral" icon={Download} onClick={onPredloga} className="self-start">
        Prenesi predlogo
      </Button>
    </div>
  );
}
