"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  Eraser,
  Grid3x3,
  Highlighter,
  ImagePlus,
  Minus,
  MoveUpRight,
  Pencil,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

type Tocka = [number, number];
type Orodje = "pero" | "marker" | "radirka" | "crta" | "puscica" | "pravokotnik" | "elipsa" | "tekst";
type Oblika =
  | { tip: "pero" | "marker" | "radirka"; barva: string; debelina: number; tocke: Tocka[] }
  | { tip: "crta" | "puscica" | "pravokotnik" | "elipsa"; barva: string; debelina: number; a: Tocka; b: Tocka }
  | { tip: "tekst"; barva: string; debelina: number; a: Tocka; besedilo: string };

const ORODJA: { koda: Orodje; ikona: LucideIcon; hint: string }[] = [
  { koda: "pero", ikona: Pencil, hint: "Prostoročno risanje s peresom" },
  { koda: "marker", ikona: Highlighter, hint: "Prosojen marker za označevanje" },
  { koda: "crta", ikona: Minus, hint: "Ravna črta" },
  { koda: "puscica", ikona: MoveUpRight, hint: "Puščica (npr. pot delavca)" },
  { koda: "pravokotnik", ikona: Square, hint: "Pravokotnik (miza, regal, stroj)" },
  { koda: "elipsa", ikona: Circle, hint: "Krog / elipsa za označitev" },
  { koda: "tekst", ikona: Type, hint: "Klikni na tablo in vpiši besedilo" },
  { koda: "radirka", ikona: Eraser, hint: "Radirka - briše narisano" },
];

const BARVE = [
  { barva: "#1c1c1f", ime: "črna" },
  { barva: "#dc2626", ime: "rdeča" },
  { barva: "#2563eb", ime: "modra" },
  { barva: "#16a34a", ime: "zelena" },
  { barva: "#ca5010", ime: "oranžna" },
  { barva: "#eab308", ime: "rumena" },
];

const DEBELINE = [
  { d: 3, ime: "tanka" },
  { d: 7, ime: "srednja" },
  { d: 14, ime: "debela" },
];

const SIRINA = 1600;

/**
 * Tabla za skiciranje (integriran "paint"): pero, marker, črte, puščice, oblike, tekst, radirka,
 * razveljavi / ponovi, ozadje prazno / mreža / slika (npr. slika celice za špageti diagram).
 * Deluje z miško, prstom in pisalom. Shrani kot PNG.
 */
export function Tabla({
  naslov,
  ozadje,
  onClose,
  onShrani,
}: {
  naslov: string;
  /** Začetna slika (obstoječa skica ali fotografija), na katero rišeš. */
  ozadje?: Blob | null;
  onClose: () => void;
  onShrani: (png: Blob) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ozadjeRef = useRef<HTMLCanvasElement | null>(null);
  const risbaRef = useRef<HTMLCanvasElement | null>(null);
  const delovnaRef = useRef<HTMLCanvasElement | null>(null);
  const slikaRef = useRef<ImageBitmap | null>(null);
  const trenutnaRef = useRef<Oblika | null>(null);
  const kazalecRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef(0);

  const [visina, setVisina] = useState(1000);
  const [oblike, setOblike] = useState<Oblika[]>([]);
  const [ponovi, setPonovi] = useState<Oblika[]>([]);
  const [orodje, setOrodje] = useState<Orodje>("pero");
  const [barva, setBarva] = useState(BARVE[1].barva);
  const [debelina, setDebelina] = useState(DEBELINE[1].d);
  const [mreza, setMreza] = useState(!ozadje);
  const [imaSliko, setImaSliko] = useState(false);
  const [tekst, setTekst] = useState<{ a: Tocka; x: number; y: number; vrednost: string } | null>(null);
  const [shranjujem, setShranjujem] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Slika za ozadje; višina table se prilagodi razmerju slike. */
  const uporabiSliko = useCallback((bmp: ImageBitmap) => {
    slikaRef.current?.close();
    slikaRef.current = bmp;
    setVisina(Math.max(600, Math.min(2000, Math.round((SIRINA * bmp.height) / bmp.width))));
    setImaSliko(true);
    setMreza(false);
  }, []);

  const nastaviSliko = (blob: Blob) => createImageBitmap(blob).then(uporabiSliko);

  useEffect(() => {
    if (ozadje) createImageBitmap(ozadje).then(uporabiSliko, () => {});
    return () => slikaRef.current?.close();
  }, [ozadje, uporabiSliko]);

  // ---------- risanje ----------
  // Tri plasti: ozadje (bela / slika / mreža) in risba (zaključene poteze) sta shranjeni v
  // pomožnih platnih in se izrišeta samo ob spremembi. Med potezo se na zaslon sestavi
  // ozadje + risba + trenutna poteza, zato je risanje hitro tudi pri veliko potezah.

  /** Pomožno platno enake velikosti kot tabla. */
  function platno(ref: React.RefObject<HTMLCanvasElement | null>, visinaPlatna: number) {
    ref.current ??= document.createElement("canvas");
    const c = ref.current;
    if (c.width !== SIRINA || c.height !== visinaPlatna) {
      c.width = SIRINA;
      c.height = visinaPlatna;
    }
    return c;
  }

  /** Sestavi vidno tablo: ozadje + risba + trenutna (še nezaključena) poteza. */
  const sestavi = useCallback(() => {
    const c = canvasRef.current;
    const oz = ozadjeRef.current;
    const risba = risbaRef.current;
    if (!c || !oz || !risba || oz.height !== c.height) return;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(oz, 0, 0);
    const t = trenutnaRef.current;
    if (t?.tip === "radirka") {
      // radirka briše samo risbo: kopija risbe + brisanje na delovnem platnu
      const d = platno(delovnaRef, c.height);
      const dc = d.getContext("2d")!;
      dc.clearRect(0, 0, d.width, d.height);
      dc.drawImage(risba, 0, 0);
      risiObliko(dc, t);
      ctx.drawImage(d, 0, 0);
    } else {
      ctx.drawImage(risba, 0, 0);
      if (t) risiObliko(ctx, t);
    }
  }, []);

  // ozadje - ob menjavi mreže, slike ali velikosti
  useEffect(() => {
    const oz = platno(ozadjeRef, visina);
    const ctx = oz.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, oz.width, oz.height);
    if (slikaRef.current) ctx.drawImage(slikaRef.current, 0, 0, oz.width, oz.height);
    if (mreza) {
      ctx.strokeStyle = "#e3e3e8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 40; x < oz.width; x += 40) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, oz.height);
      }
      for (let y = 40; y < oz.height; y += 40) {
        ctx.moveTo(0, y);
        ctx.lineTo(oz.width, y);
      }
      ctx.stroke();
    }
    sestavi();
  }, [mreza, visina, imaSliko, sestavi]);

  // risba - ob spremembi seznama potez (nova poteza, razveljavi, ponovi, počisti)
  useEffect(() => {
    const r = platno(risbaRef, visina);
    const ctx = r.getContext("2d")!;
    ctx.clearRect(0, 0, r.width, r.height);
    for (const o of oblike) risiObliko(ctx, o);
    sestavi();
  }, [oblike, visina, sestavi]);

  // ob zaprtju table prekliči čakajoč izris
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /** Izris med potezo največ enkrat na sličico zaslona. */
  function osveziZacasno() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      sestavi();
    });
  }

  function tocka(x: number, y: number): Tocka {
    const r = rectRef.current ?? canvasRef.current!.getBoundingClientRect();
    return [((x - r.left) * SIRINA) / r.width, ((y - r.top) * visina) / r.height];
  }

  function dodaj(o: Oblika) {
    setOblike((s) => [...s, o]);
    setPonovi([]);
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tekst) return potrdiTekst();
    // drugi prst / dlan med potezo ne začne nove poteze
    if (kazalecRef.current !== null) return;
    rectRef.current = e.currentTarget.getBoundingClientRect();
    const a = tocka(e.clientX, e.clientY);
    if (orodje === "tekst") {
      const r = rectRef.current;
      setTekst({ a, x: e.clientX - r.left, y: e.clientY - r.top, vrednost: "" });
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    kazalecRef.current = e.pointerId;
    const d = orodje === "marker" ? debelina * 2.5 : orodje === "radirka" ? debelina * 3 : debelina;
    trenutnaRef.current =
      orodje === "pero" || orodje === "marker" || orodje === "radirka"
        ? { tip: orodje, barva, debelina: d, tocke: [a] }
        : { tip: orodje, barva, debelina: d, a, b: a };
    osveziZacasno();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const t = trenutnaRef.current;
    if (!t || e.pointerId !== kazalecRef.current) return;
    if ("tocke" in t) {
      // vmesne točke hitrega giba (brskalnik jih združi v en dogodek) - gladka črta
      const dogodki = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of dogodki.length ? dogodki : [e.nativeEvent]) t.tocke.push(tocka(ev.clientX, ev.clientY));
    } else if ("b" in t) {
      t.b = tocka(e.clientX, e.clientY);
    }
    osveziZacasno();
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerId !== kazalecRef.current) return;
    kazalecRef.current = null;
    rectRef.current = null;
    const t = trenutnaRef.current;
    trenutnaRef.current = null;
    if (!t) return;
    // Potezo takoj zapiši v risbo in pokaži (brez čakanja na React), čakajoč izris prekliči.
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const r = risbaRef.current;
    if (r) risiObliko(r.getContext("2d")!, t);
    sestavi();
    dodaj(t);
  }

  function potrdiTekst() {
    if (tekst?.vrednost.trim()) dodaj({ tip: "tekst", barva, debelina, a: tekst.a, besedilo: tekst.vrednost.trim() });
    setTekst(null);
  }

  function razveljavi() {
    if (!oblike.length) return;
    setPonovi([...ponovi, oblike[oblike.length - 1]]);
    setOblike(oblike.slice(0, -1));
  }

  function ponoviKorak() {
    if (!ponovi.length) return;
    setOblike([...oblike, ponovi[ponovi.length - 1]]);
    setPonovi(ponovi.slice(0, -1));
  }

  function zapri() {
    if (oblike.length && !window.confirm("Skica ni shranjena. Zaprem tablo in zavržem risbo?")) return;
    onClose();
  }

  async function shrani() {
    const c = canvasRef.current;
    if (!c) return;
    sestavi();
    setShranjujem(true);
    try {
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Skice ni bilo mogoče pretvoriti."))), "image/png"));
      await onShrani(blob);
    } finally {
      setShranjujem(false);
    }
  }

  // Bližnjice: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tekst) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) ponoviKorak();
        else razveljavi();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        ponoviKorak();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cip = (izbran: boolean) =>
    `inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 transition-colors ${
      izbran ? "border-fines-500 bg-fines-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-100"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-100" role="dialog" aria-modal="true" aria-label={naslov}>
      {/* orodna vrstica */}
      <div className="flex flex-wrap items-center gap-2 border-b-4 border-fines-500 bg-white px-3 py-2">
        <h2 className="mr-2 text-base font-bold text-ink-900">{naslov}</h2>

        <div className="flex flex-wrap gap-1" role="group" aria-label="Orodja">
          {ORODJA.map((o) => (
            <button key={o.koda} type="button" title={o.hint} aria-label={o.hint} aria-pressed={orodje === o.koda} onClick={() => setOrodje(o.koda)} className={cip(orodje === o.koda)}>
              <o.ikona className="h-5 w-5" aria-hidden />
            </button>
          ))}
        </div>

        <span className="mx-1 h-8 w-px bg-ink-200" />

        <div className="flex gap-1" role="group" aria-label="Barva">
          {BARVE.map((b) => (
            <button
              key={b.barva}
              type="button"
              title={`Barva: ${b.ime}`}
              aria-label={`Barva: ${b.ime}`}
              aria-pressed={barva === b.barva}
              onClick={() => setBarva(b.barva)}
              className={`h-10 w-10 rounded-lg border-2 ${barva === b.barva ? "border-fines-500 ring-2 ring-fines-200" : "border-ink-200"}`}
            >
              <span className="mx-auto block h-6 w-6 rounded-full" style={{ background: b.barva }} />
            </button>
          ))}
        </div>

        <div className="flex gap-1" role="group" aria-label="Debelina">
          {DEBELINE.map((d) => (
            <button key={d.d} type="button" title={`Debelina: ${d.ime}`} aria-label={`Debelina: ${d.ime}`} aria-pressed={debelina === d.d} onClick={() => setDebelina(d.d)} className={cip(debelina === d.d)}>
              <span className="block rounded-full bg-current" style={{ width: d.d + 4, height: d.d + 4 }} />
            </button>
          ))}
        </div>

        <span className="mx-1 h-8 w-px bg-ink-200" />

        <IconButton hint="Razveljavi zadnji korak (Ctrl+Z)" variant="neutral" icon={Undo2} disabled={!oblike.length} onClick={razveljavi} />
        <IconButton hint="Ponovi razveljavljen korak (Ctrl+Y)" variant="neutral" icon={Redo2} disabled={!ponovi.length} onClick={ponoviKorak} />
        <button type="button" title="Prikaži / skrij mrežo v ozadju" aria-pressed={mreza} onClick={() => setMreza((m) => !m)} className={cip(mreza)}>
          <Grid3x3 className="h-5 w-5" aria-hidden />
        </button>
        <Button hint="Naloži sliko za ozadje (npr. tloris celice)" variant="primary" icon={ImagePlus} onClick={() => fileRef.current?.click()}>
          <span className="hidden xl:inline">Slika</span>
        </Button>
        <Button
          hint="Izbriši vso risbo na tabli"
          variant="danger"
          icon={Trash2}
          disabled={!oblike.length}
          onClick={() => {
            if (window.confirm("Izbrišem vso risbo?")) {
              setOblike([]);
              setPonovi([]);
            }
          }}
        >
          <span className="hidden xl:inline">Počisti</span>
        </Button>

        <div className="ml-auto flex gap-2">
          <Button hint="Zapri tablo brez shranjevanja" variant="neutral" icon={X} onClick={zapri}>
            Prekliči
          </Button>
          <Button hint="Shrani skico k zapisniku gembe" variant="success" icon={Save} disabled={shranjujem || (!oblike.length && !imaSliko)} onClick={shrani}>
            {shranjujem ? "Shranjujem ..." : "Shrani skico"}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) nastaviSliko(f).catch(() => window.alert("Slike ni bilo mogoče odpreti."));
            e.target.value = "";
          }}
        />
      </div>

      {/* tabla */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4">
        <div className="relative max-h-full max-w-full">
          <canvas
            ref={canvasRef}
            width={SIRINA}
            height={visina}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onLostPointerCapture={onUp}
            className="block max-h-[calc(100dvh-8rem)] max-w-full touch-none rounded-lg bg-white shadow-lg"
            style={{ cursor: orodje === "tekst" ? "text" : "crosshair", aspectRatio: `${SIRINA} / ${visina}` }}
          />
          {tekst && (
            <input
              autoFocus
              value={tekst.vrednost}
              onChange={(e) => setTekst({ ...tekst, vrednost: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") potrdiTekst();
                if (e.key === "Escape") setTekst(null);
              }}
              onBlur={potrdiTekst}
              placeholder="Vpiši besedilo, Enter"
              title="Vpiši besedilo in pritisni Enter"
              className="absolute w-56 rounded border-2 border-fines-500 bg-white/95 px-2 py-1 text-sm shadow"
              style={{ left: tekst.x, top: tekst.y - 16, color: barva }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function risiObliko(p: CanvasRenderingContext2D, o: Oblika) {
  p.save();
  p.lineCap = "round";
  p.lineJoin = "round";
  p.strokeStyle = o.barva;
  p.fillStyle = o.barva;
  p.lineWidth = o.debelina;
  p.globalCompositeOperation = o.tip === "radirka" ? "destination-out" : "source-over";
  if (o.tip === "marker") p.globalAlpha = 0.35;

  switch (o.tip) {
    case "pero":
    case "marker":
    case "radirka": {
      const t = o.tocke;
      p.beginPath();
      p.moveTo(t[0][0], t[0][1]);
      if (t.length === 1) p.lineTo(t[0][0] + 0.1, t[0][1]);
      // gladka črta skozi sredine
      for (let i = 1; i < t.length - 1; i++) {
        p.quadraticCurveTo(t[i][0], t[i][1], (t[i][0] + t[i + 1][0]) / 2, (t[i][1] + t[i + 1][1]) / 2);
      }
      if (t.length > 1) p.lineTo(t[t.length - 1][0], t[t.length - 1][1]);
      p.stroke();
      break;
    }
    case "crta":
    case "puscica": {
      const [ax, ay] = o.a;
      const [bx, by] = o.b;
      p.beginPath();
      p.moveTo(ax, ay);
      p.lineTo(bx, by);
      p.stroke();
      if (o.tip === "puscica" && Math.hypot(bx - ax, by - ay) > 2) {
        const kot = Math.atan2(by - ay, bx - ax);
        const dolzina = 14 + o.debelina * 2.5;
        p.beginPath();
        p.moveTo(bx, by);
        p.lineTo(bx - dolzina * Math.cos(kot - 0.45), by - dolzina * Math.sin(kot - 0.45));
        p.lineTo(bx - dolzina * Math.cos(kot + 0.45), by - dolzina * Math.sin(kot + 0.45));
        p.closePath();
        p.fill();
      }
      break;
    }
    case "pravokotnik":
      p.strokeRect(Math.min(o.a[0], o.b[0]), Math.min(o.a[1], o.b[1]), Math.abs(o.b[0] - o.a[0]), Math.abs(o.b[1] - o.a[1]));
      break;
    case "elipsa":
      p.beginPath();
      p.ellipse((o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2, Math.abs(o.b[0] - o.a[0]) / 2, Math.abs(o.b[1] - o.a[1]) / 2, 0, 0, Math.PI * 2);
      p.stroke();
      break;
    case "tekst":
      p.font = `bold ${18 + o.debelina * 3}px Inter, system-ui, sans-serif`;
      p.textBaseline = "middle";
      p.fillText(o.besedilo, o.a[0], o.a[1]);
      break;
  }
  p.restore();
}
