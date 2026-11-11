// Obogateno besedilo (zapisniki: Gemba walk, Audit) - shranjeno kot HTML iz urejevalnika (UrejevalnikBesedila).
// Stari zapisniki so navadno besedilo; prikažejo se pretvorjeni (vrstice "- x" = alineje, "1. x" = številčenje,
// vrstica z VELIKIMI ČRKAMI = naslov). Ista pretvorba velja za besedilo, ki ga vstavijo gumbi (predloga, vprašanja, ura).

/** Dovoljeni elementi: odstavek, naslov (h3), alineje, številčenje, krepko, ležeče, podčrtano, prečrtano. */
export type Slog = { b?: boolean; i?: boolean; u?: boolean; s?: boolean };
export type Del = Slog & { t: string };
export type Blok = { vrsta: "p" | "h"; deli: Del[]; nivo: number; oznaka?: string };

type JsonVozel = { type: string; attrs?: Record<string, unknown>; content?: JsonVozel[]; text?: string };

/** true = vrednost je HTML iz urejevalnika (ne staro navadno besedilo). */
export const jeHtml = (v: string) => /^\s*<(p|h[1-6]|ul|ol|li|blockquote|div)[\s>/]/i.test(v);

/** Naslov: del pred oklepajem ima vsaj 3 velike in nobene male črke (npr. "OPAŽANJA (dejstva ...)"). */
const jeNaslov = (v: string) => {
  const glava = v.split("(")[0];
  return v.length <= 100 && !/\p{Ll}/u.test(glava) && (glava.match(/\p{Lu}/gu)?.length ?? 0) >= 3;
};
const ALINEJA = /^\s*[-*•](?:\s+(.*)|\s*)$/;
const STEVILKA = /^\s*(\d+)[.)]\s+(.*)$/;

const odstavek = (t: string): JsonVozel => ({ type: "paragraph", ...(t ? { content: [{ type: "text", text: t }] } : {}) });

/** Navadno besedilo -> vsebina urejevalnika (JSON), vrstica = odstavek. */
export function tekstVJson(tekst: string): JsonVozel[] {
  const vozli: JsonVozel[] = [];
  const vrstice = tekst.replace(/\r/g, "").split("\n");
  for (let i = 0; i < vrstice.length; i++) {
    const v = vrstice[i];
    const al = ALINEJA.exec(v);
    const st = STEVILKA.exec(v);
    if (al || st) {
      const vrsta = al ? "bulletList" : "orderedList";
      const re = al ? ALINEJA : STEVILKA;
      const postavke: JsonVozel[] = [];
      while (i < vrstice.length && re.exec(vrstice[i])) {
        const m = re.exec(vrstice[i])!;
        postavke.push({ type: "listItem", content: [odstavek((al ? m[1] : m[2]) ?? "")] });
        i++;
      }
      i--;
      vozli.push({ type: vrsta, ...(st ? { attrs: { start: Number(st[1]) } } : {}), content: postavke });
    } else if (jeNaslov(v.trim())) {
      vozli.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: v.trim() }] });
    } else {
      vozli.push(odstavek(v));
    }
  }
  return vozli;
}

/** Vsebina za urejevalnik: HTML ostane, staro navadno besedilo se pretvori. */
export const vVsebino = (v: string) => (!v.trim() ? "" : jeHtml(v) ? v : { type: "doc", content: tekstVJson(v) });

const ENTITETE: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/** HTML -> navadno besedilo (iskanje, štetje znakov, prazen zapisnik). Staro besedilo ostane, kot je. */
export function vTekst(v: string): string {
  if (!jeHtml(v)) return v;
  return v
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITETE[e])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** HTML -> bloki za PDF (DOMParser, samo v brskalniku). Staro besedilo gre skozi isto pretvorbo kot v urejevalniku. */
export function vBloke(v: string): Blok[] {
  if (!v.trim()) return [];
  if (!jeHtml(v)) {
    // staro besedilo: JSON -> preprost HTML (samo struktura, brez slogov)
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const vHtml = (n: JsonVozel): string => {
      const vsebina = (n.content ?? []).map(vHtml).join("");
      switch (n.type) {
        case "text":
          return esc(n.text ?? "");
        case "heading":
          return `<h3>${vsebina}</h3>`;
        case "bulletList":
          return `<ul>${vsebina}</ul>`;
        case "orderedList":
          return `<ol start="${n.attrs?.start ?? 1}">${vsebina}</ol>`;
        case "listItem":
          return `<li>${vsebina}</li>`;
        default:
          return `<p>${vsebina}</p>`;
      }
    };
    return vBloke(tekstVJson(v).map(vHtml).join(""));
  }

  const koren = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${v}</body></html>`, "text/html").body;
  const bloki: Blok[] = [];

  const deli = (el: Node, slog: Slog, izhod: Del[]) => {
    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = (n.textContent ?? "").replace(/\s+/g, " ");
        if (t) izhod.push({ ...slog, t });
        return;
      }
      if (!(n instanceof HTMLElement)) return;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") return void izhod.push({ ...slog, t: "\n" });
      if (["ul", "ol", "p", "h1", "h2", "h3", "h4", "li"].includes(tag)) return; // bloki znotraj postavke obdela hodi()
      deli(
        n,
        {
          ...slog,
          ...(tag === "strong" || tag === "b" ? { b: true } : {}),
          ...(tag === "em" || tag === "i" ? { i: true } : {}),
          ...(tag === "u" ? { u: true } : {}),
          ...(tag === "s" || tag === "del" || tag === "strike" ? { s: true } : {}),
        },
        izhod,
      );
    });
  };

  const hodi = (el: Element, nivo: number) => {
    for (const n of Array.from(el.children)) {
      const tag = n.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        let st = Number(n.getAttribute("start") ?? 1) || 1;
        for (const li of Array.from(n.children)) {
          if (li.tagName.toLowerCase() !== "li") continue;
          const oznaka = tag === "ul" ? (nivo % 2 ? "◦" : "•") : `${st++}.`;
          // prvi odstavek postavke nosi oznako, ostalo (podseznami, dodatni odstavki) je zamaknjeno
          let prvi = true;
          for (const c of Array.from(li.children)) {
            const ct = c.tagName.toLowerCase();
            if (ct === "ul" || ct === "ol") {
              const ovoj = document.createElement("div");
              ovoj.appendChild(c.cloneNode(true));
              hodi(ovoj, nivo + 1);
            } else {
              const d: Del[] = [];
              deli(c, ct === "h3" ? { b: true } : {}, d);
              bloki.push({ vrsta: "p", deli: d, nivo: nivo + 1, ...(prvi ? { oznaka } : {}) });
              prvi = false;
            }
          }
          if (prvi) {
            const d: Del[] = [];
            deli(li, {}, d);
            bloki.push({ vrsta: "p", deli: d, nivo: nivo + 1, oznaka });
          }
        }
      } else if (/^h[1-6]$/.test(tag)) {
        const d: Del[] = [];
        deli(n, { b: true }, d);
        bloki.push({ vrsta: "h", deli: d, nivo });
      } else {
        const d: Del[] = [];
        deli(n, {}, d);
        bloki.push({ vrsta: "p", deli: d, nivo });
      }
    }
  };

  hodi(koren, 0);
  // prazne odstavke na koncu izpustimo
  while (bloki.length && !bloki[bloki.length - 1].deli.some((d) => d.t.trim())) bloki.pop();
  return bloki;
}
