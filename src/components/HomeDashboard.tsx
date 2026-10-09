"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NAV, listiNav, type NavItem } from "@/lib/nav";
import { formatLong, todayWorkday } from "@/lib/dates";
import {
  aktivnaDelovnaMesta,
  aktivneTocke,
  naloziDelovnaMesta,
  naloziKontrolneTocke,
  naloziPrRutino,
  naloziSklRutino,
  povzetekDneva,
  type DanPovzetek,
} from "@/lib/rutina";
import { supabaseConfigured } from "@/lib/supabase";
import { STATUS_STYLE } from "@/components/rutina/MonthCalendar";

type Kpi = Record<string, DanPovzetek | undefined>;

async function naloziKpi(datum: string): Promise<Kpi> {
  const [mesta, prRutina, tocke, sklRutina] = await Promise.all([
    naloziDelovnaMesta(),
    naloziPrRutino(datum, datum),
    naloziKontrolneTocke(),
    naloziSklRutino(datum, datum),
  ]);
  return {
    "/proizvodnja/rutina": povzetekDneva(
      datum,
      aktivnaDelovnaMesta(mesta, datum).map((m) => m.id),
      prRutina.map((r) => ({ ...r, kljuc: r.delovno_mesto_id })),
    ),
    "/skladisce/rutina": povzetekDneva(
      datum,
      aktivneTocke(tocke, datum).map((t) => t.id),
      sklRutina.map((r) => ({ ...r, kljuc: r.kontrolna_tocka_id })),
    ),
  };
}

export function HomeDashboard() {
  const [datum] = useState(todayWorkday);
  const [kpi, setKpi] = useState<Kpi>({});

  useEffect(() => {
    if (!supabaseConfigured) return;
    naloziKpi(datum)
      .then(setKpi)
      .catch(() => setKpi({}));
  }, [datum]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <section>
        <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">Dobrodošli</h2>
        <p className="mt-1 capitalize text-ink-600" suppressHydrationWarning>{formatLong(datum)}</p>
      </section>

      {NAV.map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink-800">
            <group.icon className="h-5 w-5 text-fines-500" aria-hidden />
            {group.label}
          </h3>
          {group.sekcije.map((sekcija) => (
            <div key={sekcija.label} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-fines-500">
                  {sekcija.label}
                </span>
                <span className="h-px flex-1 bg-fines-200" aria-hidden />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {listiNav(sekcija.items).map((item) => (
                  <Tile key={item.href} item={item} kpi={kpi[item.href]} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Tile({ item, kpi }: { item: NavItem; kpi?: DanPovzetek }) {
  const st = kpi ? STATUS_STYLE[kpi.status] : null;
  return (
    <Link
      href={item.href}
      title={item.hint}
      className={`fp-card group flex items-center gap-4 p-5 transition-all hover:-translate-y-0.5 hover:border-fines-500 hover:shadow-md ${
        item.kmalu ? "opacity-70" : ""
      }`}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-fines-50 text-fines-500">
        <item.icon className="h-7 w-7" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-ink-900">{item.label}</div>
        {item.kmalu ? (
          <div className="text-sm text-ink-500">V izdelavi</div>
        ) : kpi && st ? (
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
            <span className="font-semibold text-ink-700">
              {kpi.izpolnjenih}/{kpi.aktivnih}
            </span>
          </div>
        ) : (
          <div className="text-sm text-ink-500">Danes</div>
        )}
      </div>
      <ArrowRight className="h-5 w-5 text-ink-300 group-hover:text-fines-500" aria-hidden />
    </Link>
  );
}
