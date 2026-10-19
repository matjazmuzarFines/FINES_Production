"use client";

import { useRef, useState } from "react";
import { Camera, Download, FileText, Image as ImageIcon, Loader2, PenLine, Plus, Send, Trash2, UploadCloud, ZoomIn } from "lucide-react";
import { formatShort, toIso } from "@/lib/dates";
import { compressImage } from "@/lib/images";
import {
  MAX_VELIKOST,
  POVP_ACCEPT,
  POVP_STATUSI,
  dovoljenaDatoteka,
  type PovpStatus,
  type Priloga,
  prenesiPrilogo,
  type PrilogaTip,
  type VirPrilog,
} from "@/lib/priloge";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { useToast } from "@/components/ui/Toast";
import { Zavihki } from "@/components/ui/Zavihki";
import { Tabla } from "./Tabla";

type Pogled = "SLIKE" | "SKICE" | "POVP";

const POVP_STATUS: Record<PovpStatus, string> = {
  POSLANO: "Poslano",
  PONUDBA: "Prejeta ponudba",
  NAROCENO: "Naročeno",
  ZAVRNJENO: "Zavrnjeno",
};

/** Odprta tabla: nova skica, popravek skice ali risanje na sliko. */
type TablaStanje = { naslov: string; ozadje: Blob | null; zamenjaj?: Priloga };

/** Slike, skice (tabla) in povpraševanja zapisnika (gemba, audit). */
export function Priloge({
  vir,
  kljuc,
  pridobiId,
  priloge,
  onSpremenjeno,
  label = "Priloge gembe",
  opisSkic = "Tloris celice, pot delavca (špageti diagram), predlog nove postavitve ...",
}: {
  vir: VirPrilog;
  /** Mapa datotek zapisnika (npr. YYYYMMDD tedna). */
  kljuc: string;
  /** Id zapisnika; če še ne obstaja, se ustvari ob prvi prilogi. */
  pridobiId: () => Promise<number>;
  priloge: Priloga[];
  onSpremenjeno: () => Promise<void>;
  label?: string;
  opisSkic?: string;
}) {
  const notify = useToast();
  const [pogled, setPogled] = useState<Pogled>("SLIKE");
  const [nalagam, setNalagam] = useState(false);
  const [zoom, setZoom] = useState<Priloga | null>(null);
  const [tabla, setTabla] = useState<TablaStanje | null>(null);

  const slike = priloge.filter((p) => p.tip === "SLIKA");
  const skice = priloge.filter((p) => p.tip === "SKICA");
  const povp = priloge.filter((p) => p.tip === "POVPRASEVANJE");

  async function naloziDatoteke(files: File[], tip: PrilogaTip) {
    if (!files.length) return;
    setNalagam(true);
    let ok = 0;
    const napake: string[] = [];
    try {
      for (const f of files) {
        try {
          if (tip === "SLIKA") {
            await vir.dodaj(await pridobiId(), kljuc, "SLIKA", await compressImage(f), f.name);
          } else {
            if (!dovoljenaDatoteka(f.name)) throw new Error("nepodprta vrsta datoteke");
            if (f.size > MAX_VELIKOST) throw new Error("večja od 10 MB");
            await vir.dodaj(await pridobiId(), kljuc, "POVPRASEVANJE", f, f.name);
          }
          ok++;
        } catch (e) {
          napake.push(`${f.name} (${(e as Error).message})`);
        }
      }
    } catch (e) {
      napake.push((e as Error).message);
    } finally {
      await onSpremenjeno().catch(() => {});
      setNalagam(false);
    }
    if (ok) notify("success", `Naloženo: ${ok}.`);
    if (napake.length) notify("error", `Ni naloženo: ${napake.join(", ")}`, 10000);
  }

  async function odstrani(p: Priloga) {
    if (!window.confirm(`Odstranim ${p.tip === "POVPRASEVANJE" ? "datoteko" : p.tip === "SKICA" ? "skico" : "sliko"}? Datoteka bo izbrisana.`)) return;
    try {
      await vir.odstrani(p);
      await onSpremenjeno();
      notify("success", "Odstranjeno.");
    } catch (e) {
      notify("error", `Napaka: ${(e as Error).message}`);
    }
  }

  async function odpriTablo(naslov: string, p?: Priloga, zamenjaj?: boolean) {
    try {
      const ozadje = p ? await prenesiPrilogo(p) : null;
      setTabla({ naslov, ozadje, zamenjaj: zamenjaj ? p : undefined });
    } catch (e) {
      notify("error", `Slike ni bilo mogoče odpreti: ${(e as Error).message}`);
    }
  }

  async function shraniSkico(png: Blob) {
    try {
      if (tabla?.zamenjaj) await vir.zamenjaj(tabla.zamenjaj, kljuc, png);
      else await vir.dodaj(await pridobiId(), kljuc, "SKICA", png, `skica-${toIso(new Date())}.png`);
      setTabla(null);
      setPogled("SKICE");
      await onSpremenjeno();
      notify("success", "Skica je shranjena.");
    } catch (e) {
      notify("error", `Napaka pri shranjevanju skice: ${(e as Error).message}`, 10000);
    }
  }

  return (
    <section className="flex flex-col">
      <Zavihki
        label={label}
        value={pogled}
        onChange={setPogled}
        zavihki={[
          { koda: "SLIKE", label: `Slike (${slike.length})`, hint: "Fotografije z gembe", icon: Camera },
          { koda: "SKICE", label: `Tabla / skice (${skice.length})`, hint: "Skice, tlorisi, špageti diagrami", icon: PenLine },
          { koda: "POVP", label: `Povpraševanja (${povp.length})`, hint: "Povpraševanja in ponudbe (datoteke)", icon: Send },
        ]}
      />
      <div className="fp-card rounded-tl-none p-3 sm:p-4">
        {pogled === "SLIKE" && (
          <div className="flex flex-col gap-3">
            <Spusti
              naslov="Dodaj slike"
              opis="Povleci slike sem ali klikni - na telefonu / tablici odpre kamero ali galerijo"
              hint="Dodaj fotografije z gembe"
              accept="image/*"
              nalagam={nalagam}
              onFiles={(f) => naloziDatoteke(f, "SLIKA")}
            />
            <Galerija
              priloge={slike}
              prazno="Ni slik. Slikaj stanje pred izboljšavo (in kasneje po njej)."
              onZoom={setZoom}
              onOpis={async (p, opis) => {
                await vir.posodobi(p.id, { opis }).catch((e) => notify("error", e.message));
                await onSpremenjeno();
              }}
              gumbi={(p) => (
                <>
                  <IconButton hint="Nariši na sliko (nova skica)" variant="primary" icon={PenLine} onClick={() => odpriTablo("Risanje na sliko", p)} />
                  <IconButton hint="Odstrani sliko" variant="danger" icon={Trash2} onClick={() => odstrani(p)} />
                </>
              )}
            />
          </div>
        )}

        {pogled === "SKICE" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button hint="Odpri prazno tablo za skiciranje" variant="success" icon={Plus} onClick={() => odpriTablo("Nova skica")}>
                Nova skica
              </Button>
              <p className="text-sm text-ink-500">{opisSkic}</p>
            </div>
            <Galerija
              priloge={skice}
              prazno="Ni skic. Klikni Nova skica ali nariši na eno od slik."
              onZoom={setZoom}
              onOpis={async (p, opis) => {
                await vir.posodobi(p.id, { opis }).catch((e) => notify("error", e.message));
                await onSpremenjeno();
              }}
              gumbi={(p) => (
                <>
                  <IconButton hint="Uredi skico na tabli" variant="primary" icon={PenLine} onClick={() => odpriTablo("Urejanje skice", p, true)} />
                  <IconButton hint="Odstrani skico" variant="danger" icon={Trash2} onClick={() => odstrani(p)} />
                </>
              )}
            />
          </div>
        )}

        {pogled === "POVP" && (
          <div className="flex flex-col gap-3">
            <Spusti
              naslov="Dodaj povpraševanja"
              opis="Povleci datoteke sem ali klikni (PDF, Word, Excel, Outlook, slike; do 10 MB) - več naenkrat"
              hint="Naloži povpraševanja ali ponudbe"
              accept={POVP_ACCEPT}
              nalagam={nalagam}
              onFiles={(f) => naloziDatoteke(f, "POVPRASEVANJE")}
            />
            <PovpTabela
              priloge={povp}
              onSpremeni={async (p, v) => {
                await vir.posodobi(p.id, v).catch((e) => notify("error", e.message));
                await onSpremenjeno();
              }}
              onOdstrani={odstrani}
              onPrenesi={async (p) => {
                try {
                  const url = URL.createObjectURL(await prenesiPrilogo(p));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = p.ime ?? "povprasevanje";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                } catch (e) {
                  notify("error", `Napaka pri prenosu: ${(e as Error).message}`);
                }
              }}
            />
          </div>
        )}
      </div>

      <Modal open={!!zoom} title={zoom?.opis || zoom?.ime || "Slika"} onClose={() => setZoom(null)} sirina="max-w-5xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {zoom?.url && <img src={zoom.url} alt={zoom.opis ?? "Slika"} className="w-full rounded-lg" />}
      </Modal>

      {tabla && <Tabla naslov={tabla.naslov} ozadje={tabla.ozadje} onClose={() => setTabla(null)} onShrani={shraniSkico} />}
    </section>
  );
}

/** Polje "povleci in spusti ali klikni" za več datotek (slog kot UvozDropzone). */
function Spusti({
  naslov,
  opis,
  hint,
  accept,
  nalagam,
  onFiles,
}: {
  naslov: string;
  opis: string;
  hint: string;
  accept: string;
  nalagam: boolean;
  onFiles: (f: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [nad, setNad] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      title={hint}
      aria-label={naslov}
      onClick={() => !nalagam && ref.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !nalagam) ref.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!nalagam) setNad(true);
      }}
      onDragLeave={() => setNad(false)}
      onDrop={(e) => {
        e.preventDefault();
        setNad(false);
        if (!nalagam) onFiles([...e.dataTransfer.files]);
      }}
      className={`flex min-h-16 items-center gap-3 rounded-xl border-2 px-3 py-2.5 transition-colors ${
        nad
          ? "border-solid border-fines-500 bg-fines-50"
          : nalagam
            ? "cursor-wait border-solid border-sync-500 bg-sync-50"
            : "cursor-pointer border-dashed border-ink-300 bg-ink-100 hover:border-ink-400"
      }`}
    >
      {nalagam ? (
        <Loader2 className="h-8 w-8 shrink-0 animate-spin text-sync-500" aria-hidden />
      ) : (
        <UploadCloud className={`h-8 w-8 shrink-0 ${nad ? "text-fines-500" : "text-ink-400"}`} aria-hidden />
      )}
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink-800">{naslov}</p>
        <p className={`text-xs ${nalagam ? "font-semibold text-sync-600" : "text-ink-500"}`}>{nalagam ? "Nalagam ..." : opis}</p>
      </div>
      <input
        ref={ref}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Galerija({
  priloge,
  prazno,
  onZoom,
  onOpis,
  gumbi,
}: {
  priloge: Priloga[];
  prazno: string;
  onZoom: (p: Priloga) => void;
  onOpis: (p: Priloga, opis: string | null) => void;
  gumbi: (p: Priloga) => React.ReactNode;
}) {
  if (!priloge.length) {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-sm text-ink-500">
        <ImageIcon className="h-5 w-5" aria-hidden /> {prazno}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {priloge.map((p) => (
        <figure key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-white">
          <button type="button" title="Povečaj sliko" onClick={() => onZoom(p)} className="group relative aspect-[4/3] bg-ink-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.url && <img src={p.url} alt={p.opis ?? "Priloga gembe"} className="h-full w-full object-contain" />}
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent group-hover:bg-black/25 group-hover:text-white">
              <ZoomIn className="h-8 w-8" aria-hidden />
            </span>
          </button>
          <figcaption className="flex items-center gap-2 p-2">
            <input
              defaultValue={p.opis ?? ""}
              placeholder="Opis (npr. pred / po)"
              title="Vpiši kratek opis slike"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== p.opis) onOpis(p, v);
              }}
              className="h-10 min-w-0 flex-1 rounded-lg border border-ink-200 px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
            />
            {gumbi(p)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

const velikostTxt = (b: number | null) =>
  b === null ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} kB`;

const POVP_VREDNOSTI = {
  ime: (p: Priloga) => p.ime,
  opis: (p: Priloga) => p.opis,
  status: (p: Priloga) => (p.status ? POVP_STATUSI.indexOf(p.status) : null),
  dodano: (p: Priloga) => p.created_at,
  velikost: (p: Priloga) => p.velikost,
};

function PovpTabela({
  priloge,
  onSpremeni,
  onOdstrani,
  onPrenesi,
}: {
  priloge: Priloga[];
  onSpremeni: (p: Priloga, v: { opis?: string | null; status?: PovpStatus }) => void;
  onOdstrani: (p: Priloga) => void;
  onPrenesi: (p: Priloga) => void;
}) {
  const sort = useRazvrscanje(POVP_VREDNOSTI);
  return (
    <TabelaOkvir>
      <table className="w-full text-sm">
        <thead className="fp-thead">
          <tr>
            <SortTh sort={sort} kljuc="ime" className="pl-3">Datoteka</SortTh>
            <SortTh sort={sort} kljuc="opis">Opis (dobavitelj, kaj)</SortTh>
            <SortTh sort={sort} kljuc="status">Status</SortTh>
            <SortTh sort={sort} kljuc="dodano">Dodano</SortTh>
            <SortTh sort={sort} kljuc="velikost" desno>Velikost</SortTh>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {priloge.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-ink-500">
                Ni povpraševanj.
              </td>
            </tr>
          )}
          {sort.razvrsti(priloge).map((p) => (
            <tr key={p.id} className="border-b border-ink-100 hover:bg-ink-50">
              <td className="px-3 py-1.5">
                <span className="inline-flex items-center gap-2 font-semibold text-ink-900">
                  <FileText className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                  <span className="break-all">{p.ime}</span>
                </span>
              </td>
              <td className="min-w-48 px-2 py-1.5">
                <input
                  defaultValue={p.opis ?? ""}
                  placeholder="npr. Dobavitelj X - vpenjalo"
                  title="Vpiši dobavitelja in predmet povpraševanja"
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== p.opis) onSpremeni(p, { opis: v });
                  }}
                  className="h-10 w-full rounded-lg border border-ink-200 px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                />
              </td>
              <td className="px-2 py-1.5">
                <select
                  value={p.status ?? "POSLANO"}
                  title="Spremeni status povpraševanja"
                  onChange={(e) => onSpremeni(p, { status: e.target.value as PovpStatus })}
                  className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100"
                >
                  {POVP_STATUSI.map((s) => (
                    <option key={s} value={s}>
                      {POVP_STATUS[s]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-ink-600">{formatShort(toIso(new Date(p.created_at)))}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink-600">{velikostTxt(p.velikost)}</td>
              <td className="px-2 py-1.5">
                <div className="flex justify-end gap-1">
                  <IconButton hint="Prenesi datoteko" variant="primary" icon={Download} onClick={() => onPrenesi(p)} />
                  <IconButton hint="Odstrani povpraševanje" variant="danger" icon={Trash2} onClick={() => onOdstrani(p)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabelaOkvir>
  );
}
