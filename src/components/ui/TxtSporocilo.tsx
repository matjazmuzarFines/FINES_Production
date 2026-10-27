"use client";

import { Copy, Download } from "lucide-react";
import { prenesiTxt } from "@/lib/prioritete";
import { Button } from "./Button";
import { useToast } from "./Toast";

/** Standardno TXT sporočilo (za Teams): predogled, Prenesi .txt in Kopiraj (oba oranžna). */
export function TxtSporocilo({
  opis,
  besedilo,
  ime,
  visina = "h-[55vh]",
}: {
  opis: string;
  besedilo: string;
  ime: string;
  /** Višina predogleda (Tailwind razred). */
  visina?: string;
}) {
  const notify = useToast();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-600">{opis} Kopiraj v Teams ali prenesi kot .txt.</p>
      <textarea
        readOnly
        value={besedilo}
        title="Besedilo sporočila"
        className={`${visina} w-full resize-y rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-xs leading-relaxed text-ink-900 focus:border-fines-500 focus:outline-none`}
        onFocus={(e) => e.target.select()}
      />
      <div className="flex justify-end gap-2">
        <Button hint="Prenesi sporočilo kot .txt datoteko" variant="primary" icon={Download} onClick={() => prenesiTxt(besedilo, ime)}>
          Prenesi .txt
        </Button>
        <Button
          hint="Kopiraj sporočilo v odložišče za Teams"
          variant="primary"
          icon={Copy}
          onClick={() =>
            navigator.clipboard
              .writeText(besedilo)
              .then(() => notify("success", "Sporočilo je kopirano - prilepi ga v Teams."))
              .catch(() => notify("error", "Kopiranje ni uspelo - označi besedilo in kopiraj ročno."))
          }
        >
          Kopiraj
        </Button>
      </div>
    </div>
  );
}
