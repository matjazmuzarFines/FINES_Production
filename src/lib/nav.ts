import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, Factory, Gauge, ListOrdered, Warehouse } from "lucide-react";

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
        hint: "Zasedenost delovnih mest (v izdelavi)",
        kmalu: true,
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
