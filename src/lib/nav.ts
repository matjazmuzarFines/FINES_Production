import type { LucideIcon } from "lucide-react";
import { Bolt, BriefcaseBusiness, CalendarClock, ChartColumn, TrendingUp, BookOpen, CalendarRange, ClipboardCheck, Database, Factory, Footprints, Gauge, GitCompareArrows, GraduationCap, Grid3x3, ListOrdered, PackageCheck, PackageSearch, RefreshCw, ShieldCheck, UserCog, Warehouse } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  hint: string;
  kmalu?: boolean;
  /** Podmeni: klik na postavko ga razpre (postavka sama ni stran). */
  children?: NavItem[];
};

/** Razdelek modula (npr. Rutinsko delo, Planiranje) - v meniju oranžen naslov in tanka oranžna črta. */
export type NavSekcija = {
  label: string;
  items: NavItem[];
};

/** Modul aplikacije (npr. Proizvodnja, Skladišče). */
export type NavGroup = {
  label: string;
  icon: LucideIcon;
  sekcije: NavSekcija[];
  /** Modul je pritrjen na spodnji rob menija (npr. Podatki), ločen od ostalih. */
  dno?: boolean;
};

export const NAV: NavGroup[] = [
  {
    label: "Management",
    icon: BriefcaseBusiness,
    sekcije: [
      {
        label: "Rutinsko delo",
        items: [
          {
            label: "Auditi",
            href: "/management/auditi",
            icon: ShieldCheck,
            hint: "Gemba walki vodstva po oddelkih podjetja",
          },
        ],
      },
    ],
  },
  {
    label: "Proizvodnja",
    icon: Factory,
    sekcije: [
      {
        label: "Rutinsko delo",
        items: [
          {
            label: "Rutina vodij",
            href: "/proizvodnja/rutina",
            icon: ClipboardCheck,
            hint: "Odpri dnevno rutino delovnih mest",
          },
          {
            label: "Produktivnost",
            href: "/proizvodnja/rutina/produktivnost",
            icon: Footprints,
            hint: "Tedenski Gemba walk in akcije produktivnosti",
          },
        ],
      },
      {
        label: "Planiranje",
        items: [
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
            label: "Prioritete",
            href: "/proizvodnja/prioritete",
            icon: ListOrdered,
            hint: "Prioritete odprem in delovnih nalogov",
          },
        ],
      },
      {
        label: "Orodja",
        items: [
          {
            label: "Primerjava kosovnic",
            href: "/proizvodnja/orodja/primerjava-kosovnic",
            icon: GitCompareArrows,
            hint: "Primerjaj kosovnici in material za skladišče",
          },
          {
            label: "Pakiranje",
            href: "/proizvodnja/orodja/pakiranje",
            icon: PackageCheck,
            hint: "Navodila za pakiranje odprem in nabiranje",
          },
        ],
      },
      {
        label: "Management",
        items: [
          {
            label: "Change management",
            href: "/proizvodnja/change-management",
            icon: TrendingUp,
            hint: "Tedenski napredek vodij po področjih",
          },
          {
            label: "Usposobljenost",
            href: "/proizvodnja/usposobljenost",
            icon: GraduationCap,
            hint: "Matrika usposobljenosti in izobraževanja zaposlenih",
            children: [
              {
                label: "Matrika usposobljenosti",
                href: "/proizvodnja/usposobljenost",
                icon: Grid3x3,
                hint: "Znanje zaposlenih po delovnih mestih in družinah",
              },
              {
                label: "Izobraževanja",
                href: "/proizvodnja/usposobljenost/izobrazevanja",
                icon: CalendarClock,
                hint: "Koledar ocenjevanj in zgodovina izpitov",
              },
            ],
          },
        ],
      },
      {
        label: "Podatki proizvodnje",
        items: [
          {
            label: "Normativi",
            href: "/proizvodnja/normativi",
            icon: BookOpen,
            hint: "Urejanje normativov izdelkov",
          },
          {
            label: "Vijačni material",
            href: "/proizvodnja/vijacni-material",
            icon: Bolt,
            hint: "Zaloga in lokacije vijačnega materiala",
          },
        ],
      },
    ],
  },
  {
    label: "Skladišče",
    icon: Warehouse,
    sekcije: [
      {
        label: "Rutinsko delo",
        items: [
          {
            label: "Rutina",
            href: "/skladisce/rutina",
            icon: ClipboardCheck,
            hint: "Odpri dnevno rutino skladišča",
          },
        ],
      },
      {
        label: "Material",
        items: [
          {
            label: "Doizdaja materiala",
            href: "/skladisce/doizdaja",
            icon: PackageSearch,
            hint: "Prevzet material, ki ga še izdati",
          },
        ],
      },
    ],
  },
  {
    label: "Podatki",
    icon: Database,
    dno: true,
    sekcije: [
      {
        label: "Uvoz podatkov",
        items: [
          {
            label: "Sync iz ERP",
            href: "/podatki",
            icon: RefreshCw,
            hint: "Uvoz izvozov iz mape na serverju",
          },
        ],
      },
      {
        label: "Nastavitve",
        items: [
          {
            label: "Dostop uporabnikov",
            href: "/podatki/nastavitve",
            icon: UserCog,
            hint: "Določi, katere strani vidi uporabnik",
          },
        ],
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

/** Modul, razdelek in postavka strani - najdaljše ujemanje poti (/podatki/nastavitve ima prednost pred /podatki). */
export function findNav(pathname: string) {
  let najdeno: { group: NavGroup; sekcija: NavSekcija; item: NavItem; sub: NavItem | null } | null = null;
  for (const group of NAV) {
    for (const sekcija of group.sekcije) {
      const item = aktivnaPostavka(sekcija.items, pathname);
      if (item && (!najdeno || item.href.length > najdeno.item.href.length))
        najdeno = { group, sekcija, item, sub: item.children ? aktivnaPostavka(item.children, pathname) : null };
    }
  }
  return najdeno;
}

/** Pot strani, po kateri se preverja dostop (podstran podmenija ali postavka); domača stran = null. */
export function stranZaDostop(pathname: string): string | null {
  const c = findNav(pathname);
  return c ? (c.sub?.href ?? c.item.href) : null;
}

/** Meni samo s stranmi, ki jih `ima` dovoli (prazni razdelki in moduli izpadejo). */
export function filtrirajNav(ima: (href: string) => boolean): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    sekcije: g.sekcije
      .map((s) => ({
        ...s,
        items: s.items
          .map((i) => (i.children ? { ...i, children: i.children.filter((c) => ima(c.href)) } : i))
          .filter((i) => (i.children ? i.children.length > 0 : ima(i.href))),
      }))
      .filter((s) => s.items.length > 0),
  })).filter((g) => g.sekcije.length > 0);
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
  const strani = NAV.flatMap((g) => g.sekcije.flatMap((s) => listiNav(s.items)));
  if (strani.some((i) => i.href === pathname)) return "/";
  return strani.some((i) => i.href === nadrejena) ? nadrejena : "/";
}
