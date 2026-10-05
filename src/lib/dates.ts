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
