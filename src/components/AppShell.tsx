"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, Home, Info, LogOut, Menu, X } from "lucide-react";
import { NAV, aktivnaPostavka, findNav, listiNav, parentHref, type NavGroup, type NavItem, type NavSekcija } from "@/lib/nav";
import { lahkoZapustim } from "@/lib/neshranjeno";
import { odjava, useSeja } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import { APP_VERSION, CHANGELOG } from "@/lib/changelog";
import { Button, IconButton } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { Loading } from "./ui/Notice";
import { Prijava } from "./Prijava";
import { ToastProvider } from "./ui/Toast";
import { SyncGlava } from "./SyncGlava";
import { SyncProvider } from "./SyncProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Meni je odprt samo na strani, kjer je bil odprt -> ob menjavi strani se zapre.
  const [menuOdprtNa, setMenuOdprtNa] = useState<string | null>(null);
  const menuOpen = menuOdprtNa === pathname;
  const setMenuOpen = (open: boolean) => setMenuOdprtNa(open ? pathname : null);
  const [infoOpen, setInfoOpen] = useState(false);
  const seja = useSeja();

  const isHome = pathname === "/";
  const current = findNav(pathname);
  // Razprti / zloženi moduli in razdelki menija (brskalnik si jih zapomni). Ob prihodu na stran se njen modul
  // in razdelek razpreta in ostaneta razprta tudi na drugi strani - zapre ju samo uporabnik.
  const [rocno, setRocno] = useState<Record<string, boolean>>(() => zAktivnimi(preberiMeni(), pathname));
  const [potMenija, setPotMenija] = useState(pathname);
  if (potMenija !== pathname) {
    setPotMenija(pathname);
    setRocno((r) => zAktivnimi(r, pathname));
  }
  useEffect(() => {
    try {
      localStorage.setItem(MENI_KLJUC, JSON.stringify(rocno));
    } catch {
      // brez shrambe velja do osvežitve
    }
  }, [rocno]);
  const title = current
    ? [current.group.label, current.item.label, current.sub?.label].filter(Boolean).join(" · ")
    : "Domov";

  function preklopiMeni(kljuc: string, prikazan: boolean) {
    setRocno((r) => ({ ...r, [kljuc]: !prikazan }));
  }

  function modulMenija(group: NavGroup) {
    const aktiven = current?.group === group;
    const prikazan = rocno[group.label] ?? false;
    return (
      <NavModul
        key={group.label}
        group={group}
        aktiven={aktiven}
        prikazan={prikazan}
        onPreklopi={() => preklopiMeni(group.label, prikazan)}
      >
        {group.sekcije.map((sekcija) => {
          const kljuc = kljucSekcije(group, sekcija);
          const prikazana = rocno[kljuc] ?? false;
          return (
            <NavSekcijaBlok
              key={sekcija.label}
              sekcija={sekcija}
              current={current?.item}
              pathname={pathname}
              prikazana={prikazana}
              onPreklopi={() => preklopiMeni(kljuc, prikazana)}
            />
          );
        })}
      </NavModul>
    );
  }

  function nazaj() {
    if (lahkoZapustim()) router.push(parentHref(pathname));
  }

  async function exitApp() {
    if (!lahkoZapustim()) return;
    // Odjava -> aplikacija pokaže prijavno okno; zavihek se zapre, če ga je odprla skripta.
    await odjava();
    window.close();
  }

  // Brez prijave aplikacija pokaže samo prijavno okno (podatke ščiti tudi RLS v bazi).
  if (supabaseConfigured && seja === undefined) return <Loading />;
  if (supabaseConfigured && !seja) return <Prijava />;

  return (
    <ToastProvider>
      <SyncProvider>
        <div className="flex min-h-dvh flex-col overflow-x-clip">
          {/* ============ GLAVA ============ */}
          <header className="sticky top-0 z-40 border-b-4 border-fines-500 bg-white">
            <div className="flex h-16 min-w-0 items-center gap-1.5 px-2 sm:gap-2 sm:px-4">
              <IconButton
                hint="Odpri navigacijski meni"
                icon={Menu}
                className="lg:hidden"
                onClick={() => setMenuOpen(true)}
              />
              <Link
                href="/"
                title="Pojdi na domačo stran"
                className="flex min-w-0 shrink items-center"
                onClick={(e) => {
                  if (!lahkoZapustim()) e.preventDefault();
                }}
              >
                <Image src="/fines-logo.png" alt="FINES d.o.o. logotip" width={136} height={36} priority className="h-auto w-24 sm:w-[136px]" />
              </Link>
              {!isHome && (
                <Button
                  hint="Vrni se na nadrejeno stran"
                  variant="neutral"
                  icon={ChevronLeft}
                  className="ml-2 hidden sm:inline-flex"
                  onClick={nazaj}
                >
                  Nazaj
                </Button>
              )}
              <h1 className="ml-1 min-w-0 flex-1 truncate text-sm font-bold text-ink-800 sm:ml-2 sm:text-lg">
                {title}
              </h1>
              {!isHome && (
                <IconButton
                  hint="Vrni se na nadrejeno stran"
                  variant="neutral"
                  icon={ChevronLeft}
                  className="sm:hidden"
                  onClick={nazaj}
                />
              )}
              <SyncGlava />
              <IconButton
                hint="Prikaži verzije in spremembe aplikacije"
                icon={Info}
                onClick={() => setInfoOpen(true)}
              />
              <span className="hidden text-xs text-ink-500 md:inline" title="Prijavljeni uporabnik">
                {seja?.user.email}
              </span>
              <Button hint="Odjavi se in zapri aplikacijo" variant="primary" icon={LogOut} onClick={exitApp} className="max-sm:w-10 max-sm:shrink-0 max-sm:px-0">
                <span className="hidden sm:inline">Izhod</span>
              </Button>
            </div>
          </header>

          <div className="flex flex-1">
            {/* ============ LEVA NAVIGACIJA ============ */}
            {menuOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
            )}
            <aside
              className={`fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col bg-ink-800 text-ink-100 transition-transform lg:sticky lg:top-16 lg:z-0 lg:h-[calc(100dvh-4rem)] lg:w-64 lg:translate-x-0 ${
                menuOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <div className="flex h-16 shrink-0 items-center justify-between px-4 lg:hidden">
                <span className="font-bold text-white">Meni</span>
                <IconButton
                  hint="Zapri navigacijski meni"
                  icon={X}
                  className="text-ink-200 hover:bg-ink-700"
                  onClick={() => setMenuOpen(false)}
                />
              </div>
              <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="Glavna navigacija">
                <NavLink href="/" active={isHome} icon={Home} hint="Pojdi na domačo stran">
                  Domov
                </NavLink>
                <div className="flex flex-col gap-2">{NAV.filter((g) => !g.dno).map(modulMenija)}</div>
              </nav>
              {/* Moduli, pritrjeni na spodnji rob menija (Podatki) - vidni tudi, ko meni drsi */}
              <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 px-3 py-3">
                {NAV.filter((g) => g.dno).map(modulMenija)}
              </div>
            </aside>

            {/* ============ VSEBINA ============ */}
            <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
          </div>

          {/* ============ NOGA ============ */}
          <footer className="border-t border-ink-200 bg-white px-4 py-2 text-center text-xs text-ink-500">
            FINES d.o.o. | Production | Verzija {APP_VERSION}
          </footer>
        </div>

        <Modal open={infoOpen} title="Verzije in spremembe" onClose={() => setInfoOpen(false)}>
          <div className="flex flex-col gap-5">
            {CHANGELOG.map((v) => (
              <section key={v.verzija}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-bold text-fines-500">Verzija {v.verzija}</h3>
                  <span className="text-xs text-ink-500">{v.datum}</span>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
                  {v.spremembe.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Modal>
      </SyncProvider>
    </ToastProvider>
  );
}

const MENI_KLJUC = "meni-razprto";
const kljucSekcije = (g: NavGroup, s: NavSekcija) => `${g.label}/${s.label}`;

function preberiMeni(): Record<string, boolean> {
  try {
    return (JSON.parse(localStorage.getItem(MENI_KLJUC) ?? "null") as Record<string, boolean> | null) ?? {};
  } catch {
    return {};
  }
}

/** Razpre modul in razdelek strani `pathname`; ostali ostanejo, kot jih je pustil uporabnik (privzeto zloženi). */
function zAktivnimi(rocno: Record<string, boolean>, pathname: string): Record<string, boolean> {
  const c = findNav(pathname);
  if (!c) return rocno;
  return { ...rocno, [c.group.label]: true, [kljucSekcije(c.group, c.sekcija)]: true };
}

/**
 * Modul menija (Proizvodnja, Skladišče ...): rahlo svetlejši blok, glava razpre / zloži vsebino.
 * Razdelki in postavke so zamaknjeni desno od imena modula.
 */
function NavModul({
  group,
  aktiven,
  prikazan,
  onPreklopi,
  children,
}: {
  group: NavGroup;
  aktiven: boolean;
  prikazan: boolean;
  onPreklopi: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl transition-colors ${prikazan ? "bg-white/5" : "hover:bg-white/5"}`}>
      <button
        type="button"
        title={prikazan ? `Zloži modul ${group.label}` : `Razpri modul ${group.label}`}
        aria-expanded={prikazan}
        onClick={onPreklopi}
        className="flex h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold uppercase tracking-wider text-white"
      >
        <group.icon className={`h-5 w-5 shrink-0 ${aktiven ? "text-fines-400" : "text-ink-300"}`} aria-hidden />
        <span className="flex-1">{group.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-300 transition-transform ${prikazan ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {prikazan && <div className="flex flex-col gap-2 pb-3 pl-4 pr-1">{children}</div>}
    </div>
  );
}

/**
 * Razdelek modula: oranžen naslov s tanko oranžno črto in puščico - klik razpre / zloži postavke.
 * Zložen razdelek pokaže število postavk.
 */
function NavSekcijaBlok({
  sekcija,
  current,
  pathname,
  prikazana,
  onPreklopi,
}: {
  sekcija: NavSekcija;
  current?: NavItem;
  pathname: string;
  prikazana: boolean;
  onPreklopi: () => void;
}) {
  return (
    <section aria-label={sekcija.label}>
      <button
        type="button"
        title={prikazana ? `Zloži razdelek ${sekcija.label}` : `Razpri razdelek ${sekcija.label}`}
        aria-expanded={prikazana}
        onClick={onPreklopi}
        className="flex h-7 w-full items-center gap-2 rounded-md px-3 text-left transition-colors hover:bg-white/5"
      >
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-fines-400">
          {sekcija.label}
        </span>
        {!prikazana && (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-400">{listiNav(sekcija.items).length}</span>
        )}
        <span className="h-px flex-1 bg-fines-500/40" aria-hidden />
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-fines-400 transition-transform ${prikazana ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {prikazana && (
      <div className="mt-1 flex flex-col gap-1">
        {sekcija.items.map((item) =>
          item.children ? (
            <NavPodmeni key={item.href} item={item} pathname={pathname} />
          ) : (
            <NavLink
              key={item.href}
              href={item.href}
              active={current === item}
              icon={item.icon}
              hint={item.hint}
              kmalu={item.kmalu}
            >
              {item.label}
            </NavLink>
          ),
        )}
      </div>
      )}
    </section>
  );
}

/** Postavka s podmenijem: klik razpre / zloži seznam podstrani. Na podstrani je razprta. */
function NavPodmeni({ item, pathname }: { item: NavItem; pathname: string }) {
  const aktivna = aktivnaPostavka(item.children ?? [], pathname);
  const [odprt, setOdprt] = useState(!!aktivna);
  const prikazan = odprt || !!aktivna;
  return (
    <div>
      <button
        type="button"
        title={item.hint}
        aria-expanded={prikazan}
        onClick={() => setOdprt(!prikazan)}
        className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors ${
          aktivna ? "text-white" : "text-ink-200 hover:bg-ink-700 hover:text-white"
        }`}
      >
        <item.icon className="h-5 w-5 shrink-0" aria-hidden />
        <span className="flex-1">{item.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${prikazan ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {prikazan && (
        <ul className="ml-5 mt-1 flex flex-col gap-1 border-l border-ink-600 pl-2">
          {item.children?.map((c) => (
            <li key={c.href}>
              <NavLink href={c.href} active={aktivna === c} icon={c.icon} hint={c.hint} kmalu={c.kmalu} majhen>
                {c.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  hint,
  kmalu,
  majhen,
  children,
}: {
  href: string;
  active: boolean;
  icon: typeof Home;
  hint: string;
  kmalu?: boolean;
  majhen?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={hint}
      onClick={(e) => {
        if (!lahkoZapustim()) e.preventDefault();
      }}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${majhen ? "h-10" : "h-11"} ${
        active ? "bg-fines-500 text-white" : "text-ink-200 hover:bg-ink-700 hover:text-white"
      }`}
    >
      <Icon className={`${majhen ? "h-4 w-4" : "h-5 w-5"} shrink-0`} aria-hidden />
      <span className="flex-1">{children}</span>
      {kmalu && (
        <span className="rounded-full bg-ink-600 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-200">
          kmalu
        </span>
      )}
    </Link>
  );
}
