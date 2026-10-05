"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { formatShort, toIso } from "@/lib/dates";
import type { Uvoz } from "@/lib/zasedenost";

/** Okno za uvoz xlsx z nalogi: povleci in spusti ali klikni. */
export function NalogiDropzone({
  uvoz,
  zaseden,
  onFile,
}: {
  uvoz: Uvoz | null;
  zaseden: boolean;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nadOknom, setNadOknom] = useState(false);

  function sprejmi(files: FileList | null) {
    const f = files?.[0];
    if (f) onFile(f);
  }

  const kdaj = uvoz ? new Date(uvoz.created_at) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      title="Povleci sem xlsx z nalogi ali klikni za izbiro"
      onClick={() => !zaseden && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !zaseden) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setNadOknom(true);
      }}
      onDragLeave={() => setNadOknom(false)}
      onDrop={(e) => {
        e.preventDefault();
        setNadOknom(false);
        if (!zaseden) sprejmi(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-3 transition-colors ${
        nadOknom ? "border-fines-500 bg-fines-50" : "border-ink-300 bg-white hover:border-fines-500"
      } ${zaseden ? "cursor-wait opacity-60" : ""}`}
    >
      <UploadCloud className={`h-8 w-8 shrink-0 ${nadOknom ? "text-fines-500" : "text-ink-400"}`} aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink-800">{zaseden ? "Uvažam ..." : "Uvoz nalogov (.xlsx)"}</p>
        {uvoz && kdaj ? (
          <p className="flex items-center gap-1 truncate text-xs text-ink-500" title={uvoz.datoteka}>
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {uvoz.st_nalogov} nalogov · {formatShort(toIso(kdaj))}{" "}
            {kdaj.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}
          </p>
        ) : (
          <p className="text-xs text-ink-500">Povleci datoteko sem ali klikni</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          sprejmi(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
