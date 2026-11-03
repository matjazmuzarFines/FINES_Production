"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

const SIRINA = 272;

/**
 * Ikona "i" ob filtru: klik (tap) odpre okvirček z daljšo razlago, kaj se zgodi, ko je filter vklopljen.
 * Okvirček je v <body> s fiksnim položajem, omejenim na zaslon (ne razširi strani na telefonu).
 */
export function InfoNamig({ naslov, children }: { naslov: string; children: ReactNode }) {
  const [poz, setPoz] = useState<{ left: number; top: number } | null>(null);
  const gumb = useRef<HTMLButtonElement>(null);
  const okvir = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!poz) return;
    const zapri = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (okvir.current?.contains(e.target as Node) || gumb.current?.contains(e.target as Node))) return;
      setPoz(null);
    };
    document.addEventListener("mousedown", zapri);
    document.addEventListener("keydown", zapri);
    window.addEventListener("resize", zapri);
    window.addEventListener("scroll", zapri, true);
    return () => {
      document.removeEventListener("mousedown", zapri);
      document.removeEventListener("keydown", zapri);
      window.removeEventListener("resize", zapri);
      window.removeEventListener("scroll", zapri, true);
    };
  }, [poz]);

  function preklopi(e: React.MouseEvent) {
    // ikona je lahko znotraj <label> checkboxa - klik ne sme preklopiti filtra
    e.preventDefault();
    e.stopPropagation();
    if (poz) return setPoz(null);
    const r = gumb.current!.getBoundingClientRect();
    const sirina = Math.min(SIRINA, window.innerWidth - 16);
    setPoz({ left: Math.max(8, Math.min(r.left + r.width / 2 - sirina / 2, window.innerWidth - sirina - 8)), top: r.bottom + 6 });
  }

  return (
    <>
      <button
        ref={gumb}
        type="button"
        title={`Pojasnilo: ${naslov}`}
        aria-label={`Pojasnilo: ${naslov}`}
        aria-expanded={!!poz}
        aria-controls={poz ? id : undefined}
        onClick={preklopi}
        className="-my-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full align-middle text-ink-400 hover:bg-ink-100 hover:text-fines-500"
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {poz &&
        createPortal(
          <div
            ref={okvir}
            id={id}
            role="tooltip"
            style={{ left: poz.left, top: poz.top, width: Math.min(SIRINA, window.innerWidth - 16) }}
            className="fixed z-50 rounded-lg border border-ink-200 bg-white p-3 text-xs font-normal leading-relaxed text-ink-700 shadow-lg"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
