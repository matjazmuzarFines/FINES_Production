"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ZoomIn } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * Polje za fotografijo: prikaže shranjeno ali novo (še neshranjeno) sliko.
 * Klik na kamero odpre kamero (telefon/tablica) ali izbiro datoteke.
 */
export function PhotoField({
  label,
  savedUrl,
  pending,
  required,
  onPick,
}: {
  label: string;
  savedUrl?: string;
  pending?: Blob;
  required?: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [predogled, setPredogled] = useState<{ blob: Blob; url: string }>();
  const [zoom, setZoom] = useState(false);

  // Predogled še neshranjene slike (data URL - ni potrebno sproščanje).
  useEffect(() => {
    if (!pending) return;
    const reader = new FileReader();
    reader.onload = () => setPredogled({ blob: pending, url: reader.result as string });
    reader.readAsDataURL(pending);
  }, [pending]);

  const pendingUrl = pending && predogled?.blob === pending ? predogled.url : undefined;
  const src = pendingUrl ?? savedUrl;
  const border = required && !src ? "border-warn-400 bg-warn-50" : "border-ink-200 bg-ink-50";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative h-20 w-20 overflow-hidden rounded-lg border-2 border-dashed ${border}`}>
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Fotografija: ${label}`} className="h-full w-full object-cover" />
            <button
              type="button"
              title={`Povečaj fotografijo: ${label}`}
              aria-label={`Povečaj fotografijo: ${label}`}
              onClick={() => setZoom(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent hover:bg-black/30 hover:text-white"
            >
              <ZoomIn className="h-6 w-6" aria-hidden />
            </button>
            {pending && (
              <span
                title="Fotografija še ni shranjena"
                className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-warn-500"
              />
            )}
          </>
        ) : null}
        <button
          type="button"
          title={src ? `Zamenjaj fotografijo: ${label}` : `Dodaj fotografijo: ${label}`}
          aria-label={src ? `Zamenjaj fotografijo: ${label}` : `Dodaj fotografijo: ${label}`}
          onClick={() => inputRef.current?.click()}
          className={
            src
              ? "absolute bottom-1 right-1 rounded-full bg-white/90 p-1 text-fines-500 shadow"
              : "flex h-full w-full items-center justify-center text-ink-400 hover:text-fines-500"
          }
        >
          <Camera className={src ? "h-4 w-4" : "h-7 w-7"} aria-hidden />
        </button>
      </div>
      <span className="text-[11px] font-semibold uppercase text-ink-500">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <Modal open={zoom} title={label} onClose={() => setZoom(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt={`Fotografija: ${label}`} className="w-full rounded-lg" />}
      </Modal>
    </div>
  );
}
