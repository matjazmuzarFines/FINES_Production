"use client";

import { useEffect, useState } from "react";
import { useSeja } from "@/lib/auth";
import { NASTAVITVE_HREF, naloziUporabnike, nastaviDostop, vseStrani, type Uporabnik } from "@/lib/dostop";
import { useNeshranjeno } from "@/lib/neshranjeno";
import { supabaseConfigured } from "@/lib/supabase";
import { FilterIskanje, FilterVrstica } from "@/components/ui/Filtri";
import { ConfigMissing, ErrorText, Loading } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { SaveBar } from "@/components/rutina/SaveBar";
import { ujemaIskanje } from "@/lib/iskanje";

type Nastavitev = { vse: boolean; strani: string[] };

const STRANI = vseStrani();
// Stolpci po modulih (glava tabele: modul nad stranmi)
const MODULI = STRANI.reduce<{ label: string; st: number }[]>((acc, s) => {
  const zadnji = acc[acc.length - 1];
  if (zadnji?.label === s.group.label) zadnji.st++;
  else acc.push({ label: s.group.label, st: 1 });
  return acc;
}, []);

const fmtCas = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
const enako = (a: Nastavitev, b: Nastavitev) =>
  a.vse === b.vse && (a.vse || (a.strani.length === b.strani.length && a.strani.every((s) => b.strani.includes(s))));

export function DostopUporabnikov() {
  const notify = useToast();
  const seja = useSeja();
  const jaz = seja?.user.id;
  const [uporabniki, setUporabniki] = useState<Uporabnik[] | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [spremembe, setSpremembe] = useState<Record<string, Nastavitev>>({});
  const [shranjujem, setShranjujem] = useState(false);
  const [iskanje, setIskanje] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) return;
    let preklic = false;
    naloziUporabnike()
      .then((u) => {
        if (!preklic) setUporabniki(u);
      })
      .catch((e) => {
        if (!preklic) setNapaka((e as Error).message);
      });
    return () => {
      preklic = true;
    };
  }, []);

  const steviloSprememb = Object.keys(spremembe).length;
  useNeshranjeno(steviloSprememb > 0);

  const sort = useRazvrscanje<Uporabnik, "email" | "obisk">({
    email: (u) => u.email,
    obisk: (u) => u.zadnji_obisk,
  });

  if (!supabaseConfigured) return <ConfigMissing />;
  if (napaka)
    return (
      <ErrorText>
        Napaka pri nalaganju uporabnikov: {napaka}. Če tabela še ne obstaja, v Supabase SQL editorju zaženi{" "}
        <code className="rounded bg-white px-1">033_dostop_strani.sql</code>.
      </ErrorText>
    );
  if (!uporabniki) return <Loading />;

  const trenutna = (u: Uporabnik): Nastavitev => spremembe[u.user_id] ?? { vse: u.vse, strani: u.strani };

  function nastavi(u: Uporabnik, nova: Nastavitev) {
    setSpremembe((s) => {
      const ostale = { ...s };
      delete ostale[u.user_id];
      return enako(nova, { vse: u.vse, strani: u.strani }) ? ostale : { ...ostale, [u.user_id]: nova };
    });
  }

  function preklopiVse(u: Uporabnik) {
    const t = trenutna(u);
    // Brez "Vse" ostanejo označene vse strani - odznači tiste, ki jih uporabnik ne sme videti
    nastavi(u, t.vse ? { vse: false, strani: STRANI.map((s) => s.item.href) } : { vse: true, strani: t.strani });
  }

  function preklopiStran(u: Uporabnik, href: string) {
    const t = trenutna(u);
    nastavi(u, { vse: false, strani: t.strani.includes(href) ? t.strani.filter((h) => h !== href) : [...t.strani, href] });
  }

  async function shrani() {
    setShranjujem(true);
    try {
      const posodobljeni = new Map<string, Uporabnik>();
      for (const [user_id, n] of Object.entries(spremembe)) {
        posodobljeni.set(user_id, await nastaviDostop({ user_id, vse: n.vse, strani: n.vse ? [] : n.strani }));
      }
      setUporabniki((s) => (s ?? []).map((u) => posodobljeni.get(u.user_id) ?? u));
      setSpremembe({});
      notify("success", `Dostop shranjen (${posodobljeni.size}). Uporabnik ga vidi ob naslednjem odprtju aplikacije.`);
    } catch (e) {
      notify("error", `Ni shranjeno: ${(e as Error).message}`, 10000);
    } finally {
      setShranjujem(false);
    }
  }

  const vrstice = sort.razvrsti(uporabniki.filter((u) => ujemaIskanje(iskanje, [u.email])));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-[min(100%,18rem)] flex-1">
          <h2 className="text-xl font-bold text-ink-900">Dostop uporabnikov</h2>
          <p className="text-sm text-ink-500">
            Katere strani vidi posamezen uporabnik · &quot;Vse&quot; = vse strani, tudi nove · uporabnik se na seznamu pojavi ob prvi prijavi
          </p>
        </div>
      </div>

      <div className="fp-card p-3 sm:p-4">
        <FilterVrstica>
          <FilterIskanje value={iskanje} onChange={setIskanje} placeholder="e-mail uporabnika" hint="Poišči uporabnika po e-mailu" />
        </FilterVrstica>
      </div>

      <div className="fp-card p-0">
        <TabelaOkvir>
          <table className="w-full text-sm">
            <thead className="fp-thead">
              <tr>
                <th colSpan={3} className="px-2 pt-2" />
                {MODULI.map((m) => (
                  <th key={m.label} colSpan={m.st} className="border-l border-ink-600 px-2 pt-2 text-center text-fines-200">
                    {m.label}
                  </th>
                ))}
              </tr>
              <tr>
                <SortTh sort={sort} kljuc="email">Uporabnik</SortTh>
                <SortTh sort={sort} kljuc="obisk">Zadnji obisk</SortTh>
                <th className="px-2 py-2 text-center" title="Uporabnik vidi vse strani, tudi nove">
                  Vse
                </th>
                {STRANI.map((s, i) => (
                  <th
                    key={s.item.href}
                    title={`${s.sekcija.label} · ${s.item.hint}`}
                    className={`min-w-[5.5rem] px-1.5 py-2 text-center align-bottom normal-case leading-tight ${
                      i === 0 || STRANI[i - 1].group !== s.group ? "border-l border-ink-600" : ""
                    }`}
                  >
                    {s.item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vrstice.length === 0 && (
                <tr>
                  <td colSpan={3 + STRANI.length} className="p-6 text-center text-ink-500">
                    Ni uporabnikov za izbrane filtre.
                  </td>
                </tr>
              )}
              {vrstice.map((u) => {
                const t = trenutna(u);
                const spremenjen = !!spremembe[u.user_id];
                const sem = u.user_id === jaz;
                return (
                  <tr key={u.user_id} className={`border-b border-ink-100 ${spremenjen ? "bg-warn-50" : "hover:bg-ink-50"}`}>
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-ink-900">
                      {u.email}
                      {sem && <span className="ml-1 text-xs font-normal text-ink-500">(jaz)</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-ink-500">
                      {u.zadnji_obisk ? fmtCas.format(new Date(u.zadnji_obisk)) : "še ni prijave"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Kljukica
                        checked={t.vse}
                        disabled={sem && t.vse}
                        onChange={() => preklopiVse(u)}
                        hint={sem && t.vse ? "Sebi ne moreš odvzeti polnega dostopa" : t.vse ? "Omeji uporabnika na izbrane strani" : "Dovoli vse strani, tudi nove"}
                      />
                    </td>
                    {STRANI.map((s, i) => {
                      const ima = t.vse || t.strani.includes(s.item.href);
                      const zaklenjeno = t.vse || (sem && s.item.href === NASTAVITVE_HREF);
                      return (
                          <td key={s.item.href} className={`px-1.5 py-2 text-center ${i === 0 || STRANI[i - 1].group !== s.group ? "border-l border-ink-100" : ""}`}>
                            <Kljukica
                              checked={ima}
                              disabled={zaklenjeno}
                              onChange={() => preklopiStran(u, s.item.href)}
                              hint={
                                t.vse
                                  ? "Uporabnik ima vse strani (izklopi Vse)"
                                  : zaklenjeno
                                    ? "Sebi ne moreš odvzeti nastavitev"
                                    : ima
                                      ? `Odvzemi dostop do strani ${s.item.label}`
                                      : `Dovoli stran ${s.item.label}`
                              }
                            />
                          </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabelaOkvir>
      </div>

      <SaveBar
        steviloSprememb={steviloSprememb}
        shranjujem={shranjujem}
        onSave={shrani}
        onReset={() => setSpremembe({})}
        shraniLabel="Shrani dostop"
        shraniHint="Shrani dostop uporabnikov v bazo"
      />
    </div>
  );
}

function Kljukica({ checked, disabled, onChange, hint }: { checked: boolean; disabled?: boolean; onChange: () => void; hint: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      title={hint}
      aria-label={hint}
      className="h-5 w-5 cursor-pointer accent-fines-500 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
