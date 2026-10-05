"use client";

import { useEffect, useState } from "react";
import { monthEnd, monthStart, toIso, type IsoDate } from "@/lib/dates";
import {
  naloziDelovnaMesta,
  naloziKontrolneTocke,
  naloziPrRutino,
  naloziSklRutino,
  prMesecPovzetek,
  sklMesecPovzetek,
  type DanPovzetek,
} from "@/lib/rutina";
import { supabaseConfigured } from "@/lib/supabase";
import { ConfigMissing, Loading } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { MonthCalendar } from "./MonthCalendar";

export type RutinaModul = "proizvodnja" | "skladisce";

async function naloziPovzetke(modul: RutinaModul, mesec: IsoDate): Promise<DanPovzetek[]> {
  const od = monthStart(mesec);
  const doo = monthEnd(mesec);
  if (modul === "proizvodnja") {
    const [mesta, rutina] = await Promise.all([naloziDelovnaMesta(), naloziPrRutino(od, doo)]);
    return prMesecPovzetek(mesec, mesta, rutina);
  }
  const [tocke, rutina] = await Promise.all([naloziKontrolneTocke(), naloziSklRutino(od, doo)]);
  return sklMesecPovzetek(mesec, tocke, rutina);
}

/** Pregled rutine: samo mesečni koledar. Klik na dan odpre rutino tega dne. */
export function RutinaKoledar({ modul, zacetniMesec }: { modul: RutinaModul; zacetniMesec?: string }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <RutinaKoledarInner modul={modul} zacetniMesec={zacetniMesec} />;
}

function RutinaKoledarInner({ modul, zacetniMesec }: { modul: RutinaModul; zacetniMesec?: string }) {
  const notify = useToast();
  const [mesec, setMesec] = useState<IsoDate | null>(
    zacetniMesec && /^\d{4}-\d{2}$/.test(zacetniMesec) ? `${zacetniMesec}-01` : null,
  );
  const [podatki, setPodatki] = useState<{ mesec: IsoDate; povzetki: DanPovzetek[] } | null>(null);

  // Brez ?mesec= izberemo trenutni mesec šele v brskalniku (lokalni čas, ne strežnikov).
  const prikazan = mesec ?? podatki?.mesec ?? null;

  useEffect(() => {
    const m = mesec ?? monthStart(toIso(new Date()));
    let preklic = false;
    naloziPovzetke(modul, m)
      .then((povzetki) => !preklic && setPodatki({ mesec: m, povzetki }))
      .catch((e) => notify("error", `Napaka pri nalaganju koledarja: ${e.message}`));
    return () => {
      preklic = true;
    };
  }, [modul, mesec, notify]);

  function zamenjajMesec(m: IsoDate) {
    setMesec(m);
    // Zapomni mesec v URL-ju, da gumb Nazaj z dneva vrne na isti mesec.
    window.history.replaceState(null, "", `?mesec=${m.slice(0, 7)}`);
  }

  if (!podatki || !prikazan) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl">
      <MonthCalendar
        mesec={prikazan}
        povzetki={podatki.mesec === prikazan ? podatki.povzetki : []}
        nalagam={podatki.mesec !== prikazan}
        hrefZaDan={(d) => `/${modul}/rutina/${d}`}
        onMonthChange={zamenjajMesec}
      />
    </div>
  );
}
