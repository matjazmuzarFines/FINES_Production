"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { formatLong, toIso, type IsoDate } from "@/lib/dates";
import { lahkoZapustim } from "@/lib/neshranjeno";
import { Button } from "@/components/ui/Button";

/** Glava dnevne rutine: izbrani dan + gumb nazaj na koledar. */
export function DanGlava({
  datum,
  koledarHref,
  povzetek,
  prikaziDanes,
}: {
  datum: IsoDate;
  koledarHref: string;
  povzetek?: string;
  /** Oznako "Danes" prikažemo šele v brskalniku (lokalni čas). */
  prikaziDanes?: boolean;
}) {
  const router = useRouter();
  const jeDanes = prikaziDanes && datum === toIso(new Date());

  return (
    <div className="fp-card flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold capitalize text-ink-900 sm:text-2xl" suppressHydrationWarning>
            {formatLong(datum)}
          </h2>
          {jeDanes && (
            <span className="rounded-full bg-sync-500 px-2.5 py-0.5 text-xs font-bold text-white">
              Danes
            </span>
          )}
        </div>
        {povzetek && <p className="mt-0.5 text-sm text-ink-500">{povzetek}</p>}
      </div>
      <Button
        hint="Nazaj na mesečni koledar rutine"
        variant="neutral"
        icon={CalendarDays}
        onClick={() => {
          if (lahkoZapustim()) router.push(koledarHref);
        }}
      >
        Koledar
      </Button>
    </div>
  );
}
