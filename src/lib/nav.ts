import type { LucideIcon } from "lucide-react";
import { ChartColumn, BookOpen, CalendarRange, ClipboardCheck, Factory, Gauge, ListOrdered, Warehouse } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  hint: string;
  kmalu?: boolean;
  /** Podmeni: klik na postavko ga razpre (postavka sama ni stran). */
  children?: NavItem[];
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: "Proizvodnja",
    icon: Factory,
    items: [
      {
        label: "Rutina",
        href: "/proizvodnja/rutina",
        icon: ClipboardCheck,
        hint: "Odpri dnevno rutino delovnih mest",
      },
      {
        label: "Zasedenost",
        href: "/proizvodnja/zasedenost",
        icon: Gauge,
        hint: "Pokaži pregled zasedenosti in delovni plan",
        children: [
          {
            label: "Pregled zasedenosti",
            href: "/proizvodnja/zasedenost",
            icon: ChartColumn,
            hint: "Zasedenost oddelkov po delovnih tednih",
          },
          {
            label: "Delovni plan",
            href: "/proizvodnja/zasedenost/plan",
            icon: CalendarRange,
            hint: "Razporedi krovne naloge na delovna mesta",
          },
        ],
      },
      {
        label: "Normativi",
        href: "/proizvodnja/normativi",
        icon: BookOpen,
        hint: "Urejanje normativov izdelkov",
      },
      {
        label: "Prioritete",
        href: "/proizvodnja/prioritete",
        icon: ListOrdered,
        hint: "Prioritete proizvodnih nalogov (v izdelavi)",
        kmalu: true,
      },
    ],
  },
  {
    label: "Skladišče",
    icon: Warehouse,
    items: [
      {
        label: "Rutina",
        href: "/skladisce/rutina",
        icon: ClipboardCheck,
        hint: "Odpri dnevno rutino skladišča",
      },
    ],
  },
];

/** Ali je stran (ali njena podstran) na poti `href`. */
const naPoti = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Postavka z najdaljšim ujemanjem poti (Delovni plan ima prednost pred Pregledom zasedenosti). */
export function aktivnaPostavka(items: NavItem[], pathname: string): NavItem | null {
  return (
    items
      .filter((i) => naPoti(pathname, i.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

export function findNav(pathname: string) {
  for (const group of NAV) {
    const item = aktivnaPostavka(group.items, pathname);
    if (item) return { group, item, sub: item.children ? aktivnaPostavka(item.children, pathname) : null };
  }
  return null;
}

/** Vse strani (postavke brez podmenija + postavke podmenijev) - za domačo stran. */
export function listiNav(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => i.children ?? [i]);
}

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kam pelje gumb "Nazaj": na nadrejeno stran.
 * /proizvodnja/rutina/2026-10-05 -> /proizvodnja/rutina?mesec=2026-10 (koledar istega meseca)
 * /proizvodnja/rutina            -> /
 */
export function parentHref(pathname: string): string {
  const deli = pathname.split("/").filter(Boolean);
  const zadnji = deli.pop();
  const nadrejena = `/${deli.join("/")}`;
  if (zadnji && DATUM_RE.test(zadnji)) return `${nadrejena}?mesec=${zadnji.slice(0, 7)}`;
  // Strani iz menija (tudi Delovni plan pod Pregledom zasedenosti) vodijo domov.
  const strani = NAV.flatMap((g) => listiNav(g.items));
  if (strani.some((i) => i.href === pathname)) return "/";
  return strani.some((i) => i.href === nadrejena) ? nadrejena : "/";
}
