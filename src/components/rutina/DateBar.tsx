"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatLong, nextWorkday, prevWorkday, todayWorkday, type IsoDate } from "@/lib/dates";
import { Button, IconButton } from "@/components/ui/Button";

export function DateBar({
  datum,
  onChange,
  koledarOdprt,
  onToggleKoledar,
}: {
  datum: IsoDate;
  onChange: (d: IsoDate) => void;
  koledarOdprt: boolean;
  onToggleKoledar: () => void;
}) {
  return (
    <div className="fp-card flex flex-wrap items-center gap-2 p-2">
      <IconButton hint="Prejšnji delovni dan" icon={ChevronLeft} onClick={() => onChange(prevWorkday(datum))} />
      <div
        className="min-w-0 flex-1 text-center text-base font-bold capitalize text-ink-800 sm:text-lg"
        suppressHydrationWarning
      >
        {formatLong(datum)}
      </div>
      <IconButton hint="Naslednji delovni dan" icon={ChevronRight} onClick={() => onChange(nextWorkday(datum))} />
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          hint="Skoči na današnji delovni dan"
          variant="neutral"
          className="flex-1 sm:flex-none"
          onClick={() => onChange(todayWorkday())}
        >
          Danes
        </Button>
        <Button
          hint={koledarOdprt ? "Skrij mesečni koledar" : "Prikaži mesečni koledar s statusi"}
          variant={koledarOdprt ? "primary" : "neutral"}
          icon={CalendarDays}
          className="flex-1 sm:flex-none"
          onClick={onToggleKoledar}
        >
          Koledar
        </Button>
      </div>
    </div>
  );
}
