"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { PRILOGE_AUDITA, kljucPrilogAudita } from "@/lib/auditi";
import type { IsoDate } from "@/lib/dates";
import { compressImage } from "@/lib/images";
import type { Priloga } from "@/lib/priloge";

export type Faza = "PRED" | "PO";

/** Slika akcije: že naložena (priloga) ali čaka na shranjevanje akcije (datoteka). */
export type SlikaAkcije = { kljuc: string; faza: Faza; url: string; priloga?: Priloga; datoteka?: File };

/** Slike akcije iz baze (po akciji). */
export async function naloziSlikeAkcije(akcijaId: number): Promise<SlikaAkcije[]> {
  const p = await PRILOGE_AUDITA.naloziKjer("akcija_id", akcijaId);
  return p
    .filter((x) => x.tip === "SLIKA" && x.url)
    .map((x) => ({ kljuc: `p${x.id}`, faza: x.faza === "PO" ? "PO" : "PRED", url: x.url!, priloga: x }));
}

/** Naloži slike, ki čakajo (nova akcija ali nova slika), na audit in akcijo. */
export async function shraniCakajoceSlike(slike: SlikaAkcije[], a: { id: number; audit_id: number; datum: IsoDate }) {
  for (const s of slike) {
    if (!s.datoteka) continue;
    await PRILOGE_AUDITA.dodaj(a.audit_id, kljucPrilogAudita(a.datum), "SLIKA", await compressImage(s.datoteka), s.datoteka.name, null, {
      akcija_id: a.id,
      faza: s.faza,
    });
  }
}

/**
 * Slike ene faze (pred / po): gumb Slikaj odpre kamero telefona, Galerija izbere obstoječe slike.
 * Nove slike se naložijo ob shranjevanju akcije; že naložene se odstranijo takoj (s potrditvijo).
 */
export function SlikeFaze({
  faza,
  slike,
  onChange,
  onOdstraniShranjeno,
  naslov,
}: {
  faza: Faza;
  slike: SlikaAkcije[];
  onChange: (s: SlikaAkcije[]) => void;
  onOdstraniShranjeno: (s: SlikaAkcije) => Promise<void>;
  naslov: string;
}) {
  const kamera = useRef<HTMLInputElement>(null);
  const galerija = useRef<HTMLInputElement>(null);
  const [brisem, setBrisem] = useState<string | null>(null);
  const moje = slike.filter((s) => s.faza === faza);

  // sprosti začasne URL-je izbranih datotek
  const urlji = useRef(new Set<string>());
  useEffect(() => {
    const u = urlji.current;
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, []);

  function dodaj(files: FileList | null) {
    const nove = [...(files ?? [])]
      .filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name))
      .map((f) => {
        const url = URL.createObjectURL(f);
        urlji.current.add(url);
        return { kljuc: `n${Math.random().toString(36).slice(2, 9)}`, faza, url, datoteka: f };
      });
    if (nove.length) onChange([...slike, ...nove]);
  }

  async function odstrani(s: SlikaAkcije) {
    if (!s.priloga) return onChange(slike.filter((x) => x.kljuc !== s.kljuc));
    if (!window.confirm("Odstranim sliko? Datoteka bo izbrisana.")) return;
    setBrisem(s.kljuc);
    try {
      await onOdstraniShranjeno(s);
      onChange(slike.filter((x) => x.kljuc !== s.kljuc));
    } finally {
      setBrisem(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-600">{naslov}</span>
      <div className="flex flex-wrap items-center gap-2">
        {moje.map((s) => (
          <div key={s.kljuc} className="relative h-20 w-20 overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
            <a href={s.url} target="_blank" rel="noreferrer" title="Odpri sliko v polni velikosti">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={`Slika ${faza === "PRED" ? "pred" : "po"}`} className="h-full w-full object-cover" />
            </a>
            {!s.priloga && (
              <span title="Slika se naloži ob shranjevanju" className="absolute bottom-0 left-0 right-0 bg-sync-500/90 text-center text-[10px] font-bold text-white">
                novo
              </span>
            )}
            <button
              type="button"
              title="Odstrani sliko"
              aria-label="Odstrani sliko"
              disabled={brisem === s.kljuc}
              onClick={() => odstrani(s)}
              className="absolute right-0.5 top-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-nok-500 text-white shadow hover:bg-nok-600"
            >
              {brisem === s.kljuc ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        ))}
        <button
          type="button"
          title={`Slikaj s kamero (slika ${faza === "PRED" ? "pred" : "po"})`}
          onClick={() => kamera.current?.click()}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ok-500 bg-ok-50 text-xs font-bold text-ok-600 hover:bg-ok-500 hover:text-white"
        >
          <Camera className="h-6 w-6" aria-hidden />
          Slikaj
        </button>
        <button
          type="button"
          title="Izberi sliko iz galerije"
          onClick={() => galerija.current?.click()}
          className="flex h-20 w-14 flex-col items-center justify-center gap-1 rounded-lg border border-ink-200 bg-white text-[11px] font-semibold text-ink-600 hover:bg-ink-100"
        >
          <ImagePlus className="h-5 w-5" aria-hidden />
          Galerija
        </button>
      </div>
      <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (dodaj(e.target.files), (e.target.value = ""))} />
      <input ref={galerija} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (dodaj(e.target.files), (e.target.value = ""))} />
    </div>
  );
}
