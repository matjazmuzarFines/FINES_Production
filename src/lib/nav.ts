import type { LucideIcon } from "lucide-react";
import { BookOpen, ClipboardCheck, Factory, Gauge, ListOrdered, Warehouse } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  hint: string;
  kmalu?: boolean;
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
        hint: "Zasedenost oddelkov po delovnih tednih",
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

export function findNav(pathname: string) {
  for (const group of NAV) {
    const item = group.items.find((i) => pathname.startsWith(i.href));
    if (item) return { group, item };
  }
  return null;
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
  return NAV.some((g) => g.items.some((i) => i.href === nadrejena)) ? nadrejena : "/";
}
