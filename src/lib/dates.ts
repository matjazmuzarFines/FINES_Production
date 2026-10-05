// Vsi datumi v aplikaciji so lokalni nizi "YYYY-MM-DD" (brez časovnih pasov).

export type IsoDate = string;

export function toIso(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromIso(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** 1 = ponedeljek ... 7 = nedelja */
export function weekday(iso: IsoDate): number {
  const wd = fromIso(iso).getDay();
  return wd === 0 ? 7 : wd;
}

/** Današnji delovni dan: sobota/nedelja -> petek (kot v Power Appu). */
export function todayWorkday(): IsoDate {
  const today = toIso(new Date());
  const wd = weekday(today);
  if (wd === 6) return addDays(today, -1);
  if (wd === 7) return addDays(today, -2);
  return today;
}

export function nextWorkday(iso: IsoDate): IsoDate {
  return addDays(iso, weekday(iso) >= 5 ? 8 - weekday(iso) : 1);
}

export function prevWorkday(iso: IsoDate): IsoDate {
  const wd = weekday(iso);
  if (wd === 1) return addDays(iso, -3);
  if (wd === 7) return addDays(iso, -2);
  return addDays(iso, -1);
}

export function monthStart(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const d = fromIso(monthStart(iso));
  d.setMonth(d.getMonth() + months);
  return toIso(d);
}

export function monthEnd(iso: IsoDate): IsoDate {
  return addDays(addMonths(iso, 1), -1);
}

/** Prvi delovni dan v mesecu. */
export function firstWorkdayOfMonth(iso: IsoDate): IsoDate {
  let d = monthStart(iso);
  while (weekday(d) > 5) d = addDays(d, 1);
  return d;
}

/** Dnevi koledarja (pon-pet) od ponedeljka prvega tedna do petka zadnjega tedna. */
export function calendarWorkdays(month: IsoDate): IsoDate[] {
  const start = addDays(monthStart(month), 1 - weekday(monthStart(month)));
  const end = monthEnd(month);
  const days: IsoDate[] = [];
  for (let d = start; d <= end || weekday(d) !== 1; d = addDays(d, 1)) {
    if (weekday(d) <= 5) days.push(d);
  }
  return days;
}

export function inValidity(iso: IsoDate, od: string | null, doo: string | null): boolean {
  return (!od || od <= iso) && (!doo || doo >= iso);
}

const fmtLong = new Intl.DateTimeFormat("sl-SI", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtMonth = new Intl.DateTimeFormat("sl-SI", { month: "long", year: "numeric" });
const fmtShort = new Intl.DateTimeFormat("sl-SI", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const formatLong = (iso: IsoDate) => fmtLong.format(fromIso(iso));
export const formatShort = (iso: IsoDate) => fmtShort.format(fromIso(iso));
export function formatMonth(iso: IsoDate) {
  const s = fmtMonth.format(fromIso(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Preveri niz "YYYY-MM-DD" in da je datum dejansko veljaven (npr. ne 2026-02-31). */
export function isValidIso(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(fromIso(s)) === s;
}

/** Ponedeljek tedna, v katerem je datum (tedni so pon-ned). */
export function mondayOf(iso: IsoDate): IsoDate {
  return addDays(iso, 1 - weekday(iso));
}

/** ISO številka tedna (1-53). */
export function isoWeek(iso: IsoDate): number {
  const thursday = fromIso(addDays(mondayOf(iso), 3));
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  // round: odpravi zamik zaradi poletnega časa
  return Math.floor(Math.round((thursday.getTime() - jan1.getTime()) / 86400000) / 7) + 1;
}

/** "5. 10." */
export function formatDayMonth(iso: IsoDate): string {
  const d = fromIso(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

/**
 * Prebere datum iz izvoza (Excel): "15. 10. 2026", "29.09.2026", "2026-10-15",
 * Date objekt ali Excelova serijska številka. Vrne null, če ni datuma.
 */
export function parseAnyDate(v: unknown): IsoDate | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return toIso(v);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serijska številka (dnevi od 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
