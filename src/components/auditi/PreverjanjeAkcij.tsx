"use client";

import { useState } from "react";
import { Check, CheckCheck, Clock, Pencil, X } from "lucide-react";
import { PRILOGE_AUDITA, VRSTA, dodajKRezultatu, shraniAkcijoAudita, zamuja, type AuditAkcija } from "@/lib/auditi";
import { addDays, formatShort, toIso, type IsoDate } from "@/lib/dates";
import type { AkcijaStatus } from "@/lib/produktivnost";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { PomenZnacka, PrioritetaZnacka, StatusAkcije, VrstaOznaka } from "./AuditOznake";
import { SlikeFaze, shraniCakajoceSlike, type SlikaAkcije } from "./SlikeAkcije";

type Odlocitev = "ODPRTO" | "IZVEDENO" | "PREVERJENO";

const ODLOCITVE: Record<Odlocitev, { label: string; hint: string; status: AkcijaStatus }> = {
  ODPRTO: { label: "Še odprto", hint: "Akcija še ni izvedena - zapiši stanje in po potrebi nov rok", status: "V_DELU" },
  IZVEDENO: { label: "Izvedeno", hint: "Ukrep je izveden - dodaj sliko PO ali komentar", status: "IZVEDENO" },
  PREVERJENO: { label: "Preverjeno", hint: "Ukrep deluje in je postal način dela", status: "PREVERJENO" },
};

/**
 * Preverjanje odprtih akcij oddelka na obhodu (korak 2 vodiča): za vsako akcijo en klik
 * Še odprto / Izvedeno / Preverjeno, kratek komentar in slika PO. Komentar se doda k rezultatu z datumom.
 */
export function PreverjanjeAkcij({
  akcije,
  danes,
  onOdpri,
  onSpremenjeno,
}: {
  akcije: AuditAkcija[];
  danes: IsoDate;
  onOdpri: (a: AuditAkcija) => void;
  onSpremenjeno: () => void;
}) {
  if (!akcije.length) return <p className="py-3 text-center text-sm text-ink-500">Ni odprtih akcij iz prejšnjih auditov tega oddelka.</p>;
  const razvrscene = [...akcije].sort(
    (a, b) => Number(zamuja(b, danes)) - Number(zamuja(a, danes)) || (a.prioriteta ?? "Z").localeCompare(b.prioriteta ?? "Z") || (a.rok ?? "9").localeCompare(b.rok ?? "9"),
  );
  return (
    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
      {razvrscene.map((a) => (
        <Kartica key={a.id} a={a} danes={danes} onOdpri={onOdpri} onSpremenjeno={onSpremenjeno} />
      ))}
    </div>
  );
}

function Kartica({ a, danes, onOdpri, onSpremenjeno }: { a: AuditAkcija; danes: IsoDate; onOdpri: (a: AuditAkcija) => void; onSpremenjeno: () => void }) {
  const notify = useToast();
  const [odl, setOdl] = useState<Odlocitev | null>(null);
  const [komentar, setKomentar] = useState("");
  const [rok, setRok] = useState(a.rok ?? "");
  const [slike, setSlike] = useState<SlikaAkcije[]>([]);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);
  const zamujena = zamuja(a, danes);

  function izberi(o: Odlocitev) {
    setOdl(o === odl ? null : o);
    setNapaka(null);
  }

  async function potrdi() {
    if (!odl) return;
    const zapri = odl !== "ODPRTO";
    if (zapri && !komentar.trim() && !slike.length) return setNapaka("Za zaprtje dodaj sliko PO ali kratek komentar, kaj je bilo narejeno.");
    setShranjujem(true);
    try {
      await shraniAkcijoAudita(a.audit_id, a.id, {
        status: ODLOCITVE[odl].status,
        rezultat: dodajKRezultatu(a.rezultat, komentar, toIso(new Date())),
        zakljuceno: zapri ? a.zakljuceno ?? danes : null,
        ...(odl === "ODPRTO" ? { rok: rok || null } : {}),
      });
      await shraniCakajoceSlike(slike, a);
      notify("success", zapri ? `Akcija je ${odl === "PREVERJENO" ? "preverjena" : "izvedena"}.` : "Stanje akcije je zapisano.");
      onSpremenjeno();
    } catch (e) {
      setNapaka(`Ni shranjeno: ${(e as Error).message}`);
      setShranjujem(false);
    }
  }

  return (
    <article className={`flex flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm ${zamujena ? "border-fines-500" : "border-ink-200"}`} style={{ borderLeft: `4px solid ${VRSTA[a.vrsta].barva}` }}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
        <VrstaOznaka vrsta={a.vrsta} />
        <PrioritetaZnacka p={a.prioriteta} />
        <PomenZnacka a={a} />
        <span className="ml-auto">
          <StatusAkcije a={a} danes={danes} />
        </span>
      </div>
      <button type="button" title="Odpri celotno akcijo" onClick={() => onOdpri(a)} className="flex flex-col gap-1 text-left">
        <span className="text-[15px] font-semibold leading-snug text-ink-900">{a.problem}</span>
        {a.ukrep && <span className="text-sm leading-snug text-ink-700">→ {a.ukrep}</span>}
        <span className="flex flex-wrap gap-x-3 text-xs text-ink-500">
          {a.odgovoren && <span className="font-semibold text-ink-700">{a.odgovoren}</span>}
          {a.rok && <span className={zamujena ? "font-bold text-fines-600" : ""}>rok {formatShort(a.rok)}</span>}
          <span>audit {formatShort(a.datum)}</span>
          <Pencil className="ml-auto h-3.5 w-3.5 text-ink-400" aria-hidden />
        </span>
        {a.rezultat && <span className="whitespace-pre-line rounded-md bg-ink-50 px-2 py-1 text-xs text-ink-600">{a.rezultat}</span>}
      </button>

      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Stanje akcije na obhodu">
        {(Object.keys(ODLOCITVE) as Odlocitev[]).map((o) => {
          const izbran = odl === o;
          const Ikona = o === "ODPRTO" ? Clock : o === "IZVEDENO" ? Check : CheckCheck;
          return (
            <button
              key={o}
              type="button"
              title={ODLOCITVE[o].hint}
              aria-pressed={izbran}
              onClick={() => izberi(o)}
              className={`flex h-11 items-center justify-center gap-1 rounded-lg border text-sm font-bold transition-colors ${
                izbran
                  ? o === "ODPRTO"
                    ? "border-fines-500 bg-fines-500 text-white"
                    : "border-ok-500 bg-ok-500 text-white"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
              }`}
            >
              <Ikona className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{ODLOCITVE[o].label}</span>
            </button>
          );
        })}
      </div>

      {odl && (
        <div className="flex flex-col gap-2 rounded-lg bg-ink-50 p-2.5">
          <textarea
            value={komentar}
            onChange={(e) => setKomentar(e.target.value)}
            rows={2}
            autoFocus
            placeholder={odl === "ODPRTO" ? "Stanje: kaj stoji, kdo pomaga ..." : "Kaj je bilo narejeno, ali deluje ..."}
            title="Kratek komentar - doda se k rezultatu akcije z datumom"
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100 sm:text-sm"
          />
          {odl === "ODPRTO" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-ink-600">Nov rok:</span>
              {[3, 7, 14].map((d) => (
                <button
                  key={d}
                  type="button"
                  title={`Nov rok čez ${d} dni`}
                  onClick={() => setRok(addDays(danes, d))}
                  className={`h-9 rounded-full border px-3 text-sm font-semibold ${
                    rok === addDays(danes, d) ? "border-fines-500 bg-fines-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
                  }`}
                >
                  +{d} dni
                </button>
              ))}
              <input
                type="date"
                value={rok}
                onChange={(e) => setRok(e.target.value)}
                title="Nov rok akcije"
                className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-base sm:text-sm"
              />
            </div>
          ) : (
            <SlikeFaze faza="PO" naslov="Slika PO" slike={slike} onChange={setSlike} onOdstraniShranjeno={async (x) => x.priloga && PRILOGE_AUDITA.odstrani(x.priloga)} />
          )}
          {napaka && <ErrorText>{napaka}</ErrorText>}
          <div className="flex gap-2">
            <Button hint="Prekliči preverjanje akcije" variant="neutral" icon={X} onClick={() => setOdl(null)}>
              Prekliči
            </Button>
            <Button hint="Shrani stanje akcije" variant="success" icon={Check} disabled={shranjujem} onClick={potrdi} className="flex-1">
              {shranjujem ? "Shranjujem ..." : `Potrdi: ${ODLOCITVE[odl].label}`}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
