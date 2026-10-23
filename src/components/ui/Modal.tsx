"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./Button";

/**
 * Standardno okno. Na telefonu (pod sm) zavzame cel zaslon, da je dovolj prostora za vnos;
 * od sm naprej je okno na sredini. Noga (gumbi Shrani / Prekliči) je vedno vidna pod vsebino.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  sirina = "max-w-lg",
  noga,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Največja širina okna (Tailwind razred), privzeto max-w-lg. */
  sirina?: string;
  /** Gumbi na dnu okna - ne drsijo z vsebino. */
  noga?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const okno = (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`fp-card flex h-[100dvh] w-full flex-col max-sm:!rounded-none sm:h-auto sm:max-h-[85vh] ${sirina}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-2 sm:px-5 sm:py-3">
          <h2 className="min-w-0 truncate text-lg font-bold text-ink-900">{title}</h2>
          <IconButton hint="Zapri okno" icon={X} onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {noga && <div className="border-t border-ink-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">{noga}</div>}
      </div>
    </div>
  );
  // Okno se izriše v <body>: znotraj sticky / transform elementov (npr. panel ob planu) bi ga prekrili sosednji elementi
  return typeof document === "undefined" ? okno : createPortal(okno, document.body);
}
