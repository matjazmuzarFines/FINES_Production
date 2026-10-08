"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ODDELKI_NORMATIVA, type SkupnaSprememba } from "@/lib/normativi";
import { parseNum } from "@/lib/stevila";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/Notice";

type Polje = keyof SkupnaSprememba;

const STEVILSKA: { polje: Polje; label: string }[] = [
  { polje: "normativ_skupni", label: "Skupni" },
  ...ODDELKI_NORMATIVA.map((o) => ({ polje: o.polje as Polje, label: o.label })),
];

const VNOS =
  "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm placeholder:text-ink-300 focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

/**
 * Spremeni več normativov hkrati. Prazno polje = vrednost se ne spremeni.
 * `onUporabi` vrne seznam napak (prazen = uspeh).
 */
export function SkupnaSpremembaOkno({
  stevilo,
  druzine,
  onUporabi,
  onPreklici,
}: {
  stevilo: number;
  druzine: string[];
  onUporabi: (s: SkupnaSprememba) => string[];
  onPreklici: () => void;
}) {
  const [vnos, setVnos] = useState<Record<string, string>>({});
  const [napake, setNapake] = useState<string[]>([]);

  const nastavi = (polje: Polje, v: string) => setVnos((x) => ({ ...x, [polje]: v }));

  function uporabi() {
    const napakeVnosa: string[] = [];
    const st = (polje: Polje, label: string) => {
      const raw = (vnos[polje] ?? "").trim();
      if (raw === "") return null;
      const n = parseNum(raw);
      if (n === null || n < 0) {
        napakeVnosa.push(`${label}: "${raw}" ni veljavno število.`);
        return null;
      }
      return n;
    };
    const dn = (polje: Polje) => (vnos[polje] === "DA" ? true : vnos[polje] === "NE" ? false : null);
    const s: SkupnaSprememba = {
      druzina: (vnos.druzina ?? "").trim() || null,
      velikost: st("velikost", "Velikost"),
      normativ_skupni: st("normativ_skupni", "Skupni"),
      normativ_proizvodnja: st("normativ_proizvodnja", "Proizvodnja"),
      normativ_montaza: st("normativ_montaza", "Montaža"),
      normativ_elektro: st("normativ_elektro", "Elektro"),
      normativ_testiranje: st("normativ_testiranje", "Testiranje"),
      barvanje: dn("barvanje"),
      cleaning: dn("cleaning"),
    };
    if (napakeVnosa.length) return setNapake(napakeVnosa);
    if (Object.values(s).every((v) => v === null)) return setNapake(["Izpolni vsaj eno polje."]);
    setNapake(onUporabi(s));
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-ink-600">
        Spremembe veljajo za <strong>{stevilo}</strong> izbranih normativov. <strong>Prazno polje</strong> pomeni, da se vrednost
        ne spremeni.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-600">Družina</span>
          <input
            value={vnos.druzina ?? ""}
            onChange={(e) => nastavi("druzina", e.target.value)}
            list="fp-druzine-skupna"
            placeholder="ne spremeni"
            title="Nova družina za vse izbrane"
            className={VNOS}
          />
          <datalist id="fp-druzine-skupna">
            {druzine.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-600">Velikost</span>
          <input
            value={vnos.velikost ?? ""}
            onChange={(e) => nastavi("velikost", e.target.value)}
            inputMode="decimal"
            placeholder="ne spremeni"
            title="Nova velikost za vse izbrane"
            className={VNOS}
          />
        </label>
      </div>

      <fieldset className="rounded-lg border border-ink-200 p-3">
        <legend className="px-1 text-xs font-semibold text-ink-600">Normativi (h/kos)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STEVILSKA.map(({ polje, label }) => (
            <label key={polje} className="flex flex-col gap-1">
              <span className={`text-xs font-semibold ${polje === "normativ_skupni" ? "text-fines-500" : "text-ink-600"}`}>
                {label}
              </span>
              <input
                value={vnos[polje] ?? ""}
                onChange={(e) => nastavi(polje, e.target.value)}
                inputMode="decimal"
                placeholder="–"
                title={`Nov normativ ${label.toLowerCase()} za vse izbrane`}
                className={`${VNOS} text-right ${polje === "normativ_skupni" ? "font-bold" : ""}`}
              />
            </label>
          ))}
        </div>
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-ink-500">
          <li>Skupni je vedno enak vsoti oddelkov.</li>
          <li>Vpišeš samo oddelke → skupni se preračuna.</li>
          <li>Vpišeš samo skupni → oddelki se sorazmerno razdelijo (ohranijo razmerja).</li>
          <li>Vpišeš skupni in nekaj oddelkov → preostanek se razdeli na ostale oddelke.</li>
        </ul>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {(["barvanje", "cleaning"] as const).map((polje) => (
          <label key={polje} className="flex flex-col gap-1">
            <span className="text-xs font-semibold capitalize text-ink-600">{polje}</span>
            <select
              value={vnos[polje] ?? ""}
              onChange={(e) => nastavi(polje, e.target.value)}
              title={`Nastavi ${polje} za vse izbrane`}
              className={VNOS}
            >
              <option value="">ne spremeni</option>
              <option value="DA">DA</option>
              <option value="NE">NE</option>
            </select>
          </label>
        ))}
      </div>

      {napake.length > 0 && (
        <ErrorText className="max-h-40 overflow-y-auto">
          <p className="mb-1 font-semibold">Spremembe niso bile uporabljene:</p>
          <ul className="list-disc space-y-0.5 pl-5 font-normal">
            {napake.slice(0, 50).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </ErrorText>
      )}

      <div className="flex justify-end gap-2">
        <Button hint="Zapri brez sprememb" variant="neutral" onClick={onPreklici}>
          Prekliči
        </Button>
        <Button hint="Uporabi spremembe na izbranih normativih" variant="success" icon={Check} onClick={uporabi}>
          Uporabi na {stevilo}
        </Button>
      </div>
    </div>
  );
}
