"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CircleDashed, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { formatShort, toIso } from "@/lib/dates";

/** Povzetek zadnjega uvoza, prikazan v polju. */
export type UvozPovzetek = { datoteka: string; stevilo: number; created_at: string };

type Stanje = "prazno" | "nalaganje" | "nalozeno";

const STANJA: Record<Stanje, { okvir: string; ikona: string; Ikona: typeof CheckCircle2; status: string }> = {
  prazno: {
    okvir: "border-dashed border-ink-300 bg-ink-100 hover:border-ink-400",
    ikona: "text-ink-400",
    Ikona: CircleDashed,
    status: "Ni podatkov",
  },
  nalaganje: {
    okvir: "border-solid border-sync-500 bg-sync-50 cursor-wait",
    ikona: "text-sync-500 animate-spin",
    Ikona: Loader2,
    status: "Nalagam ...",
  },
  nalozeno: {
    okvir: "border-solid border-ok-500 bg-ok-50 hover:border-ok-600",
    ikona: "text-ok-500",
    Ikona: CheckCircle2,
    status: "Naloženo",
  },
};

/**
 * Standardno polje za uvoz datoteke (povleci in spusti ali klikni).
 * Stanja: sivo = ni podatkov, modro = nalaganje, zeleno = naloženo; ikona stanja v desnem zgornjem kotu.
 * Med vlečenjem datoteke čez polje je obroba oranžna.
 */
export function UvozDropzone({
  naslov,
  hint,
  enota,
  uvoz,
  nalagam,
  onemogoceno,
  accept = ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  onFile,
}: {
  naslov: string;
  /** Hover tekst (max 6-8 besed). */
  hint: string;
  /** Enota v povzetku, npr. "nalogov", "postavk". */
  enota: string;
  uvoz: UvozPovzetek | null;
  nalagam: boolean;
  onemogoceno?: boolean;
  accept?: string;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nadOknom, setNadOknom] = useState(false);

  const stanje: Stanje = nalagam ? "nalaganje" : uvoz ? "nalozeno" : "prazno";
  const s = STANJA[stanje];
  const zaklenjeno = nalagam || !!onemogoceno;

  function sprejmi(files: FileList | null) {
    const f = files?.[0];
    if (f && !zaklenjeno) onFile(f);
  }

  const kdaj = uvoz ? new Date(uvoz.created_at) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={zaklenjeno}
      aria-label={`${naslov}: ${s.status}`}
      title={hint}
      onClick={() => !zaklenjeno && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !zaklenjeno) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!zaklenjeno) setNadOknom(true);
      }}
      onDragLeave={() => setNadOknom(false)}
      onDrop={(e) => {
        e.preventDefault();
        setNadOknom(false);
        sprejmi(e.dataTransfer.files);
      }}
      className={`relative flex min-h-16 items-center gap-3 rounded-xl border-2 py-2.5 pl-3 pr-9 transition-colors ${
        nadOknom ? "border-solid border-fines-500 bg-fines-50" : s.okvir
      } ${onemogoceno ? "cursor-not-allowed opacity-60" : zaklenjeno ? "" : "cursor-pointer"}`}
    >
      <s.Ikona className={`absolute right-2 top-2 h-5 w-5 ${s.ikona}`} aria-hidden />
      <UploadCloud
        className={`h-8 w-8 shrink-0 ${nadOknom ? "text-fines-500" : stanje === "nalozeno" ? "text-ok-600" : stanje === "nalaganje" ? "text-sync-500" : "text-ink-400"}`}
        aria-hidden
      />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink-800">{naslov}</p>
        {stanje === "nalaganje" ? (
          <p className="text-xs font-semibold text-sync-600">Nalagam ...</p>
        ) : uvoz && kdaj ? (
          <p className="flex items-center gap-1 truncate text-xs text-ok-600" title={uvoz.datoteka}>
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {uvoz.stevilo} {enota} · {formatShort(toIso(kdaj))}{" "}
            {kdaj.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}
          </p>
        ) : (
          <p className="text-xs text-ink-500">Ni podatkov - povleci datoteko sem ali klikni</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          sprejmi(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
