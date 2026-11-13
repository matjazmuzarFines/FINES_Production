/** Število iz vnosa ali CSV/Excel: sprejme "4,5", "4.5", " 1 234,5 ". Prazno -> null. */
export function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "");
  if (s === "") return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

const fmt = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 3 });
const fmt1 = new Intl.NumberFormat("sl-SI", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 4,5 (do 3 decimalke) */
export const formatNum = (n: number | null | undefined) => (n === null || n === undefined ? "" : fmt.format(n));
/** 12,0 (ena decimalka - ure) */
export const formatUre = (n: number) => fmt1.format(n);
/**
 * Razlika ur proti planu "+2,0 h" / "−1,5 h" / "0,0 h". Poraba ur se vedno kaže v URAH, procent je rezerviran za
 * produktivnost (normativne / štempljane ure) - da zaposleni ne mešajo dveh procentov z nasprotno logiko barv.
 */
export const formatRazlikaUr = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${fmt1.format(Math.abs(r))} h`;
};

const fmtVnos = new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 3, useGrouping: false });
/** Za vnosna polja: 10000 / 4,5 (brez ločila tisočic, sicer parseNum("10.000") vrne 10). */
export const formatVnos = (n: number | null | undefined) => (n === null || n === undefined ? "" : fmtVnos.format(n));
