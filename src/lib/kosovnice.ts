import { fetchAll, getSupabase } from "./supabase";

export type Ident = {
  sifra: string; risp_sifra: string | null; naziv: string | null; klasifikat: string | null;
  klasifikacija: string | null; status: string | null; neaktiven: boolean | null; em: string | null;
};
export type KosovnicaVrstica = {
  vrstica: number; izdelek: string; nivo: number; risp_sifra: string; sifra: string;
  naziv: string; klasifikat: string | null; vrsta: string | null; kolicina: number;
};
export type Vozlisce = KosovnicaVrstica & { otroci: Vozlisce[]; skupaj: number };
export type ZalogaKosa = { zaloga: number; razpolozljiva: number; prosta_zaloga: number; em: string | null };
export type PlanKosa = { sifra: string; naziv: string; potreba: number; prevzem: number; manjka: number; poti: string[] };
export type Razlika = { pot: string; sifra: string; naziv: string; levo: number; desno: number };
export const aktivenIdent = (i: Ident) => !i.neaktiven && /^AKTIVEN(?:\s|$)/i.test(i.status ?? "");

/** Vrstni red izvoza določa starša. Preskok nivoja je napaka, ne nova korenska postavka. */
export function zgradiDrevo(vrstice: KosovnicaVrstica[]): Vozlisce {
  const sklad: Vozlisce[] = [];
  let koren: Vozlisce | undefined;
  for (const r of [...vrstice].sort((a, b) => a.vrstica - b.vrstica)) {
    if (!Number.isInteger(r.nivo) || r.nivo < 1 || r.nivo > sklad.length + 1) throw new Error(`Neveljavna hierarhija v vrstici ${r.vrstica}.`);
    if (r.nivo === 1 && koren) throw new Error("Izdelek ima več korenov kosovnice.");
    const stars = sklad[r.nivo - 2];
    const v: Vozlisce = { ...r, otroci: [], skupaj: r.nivo === 1 ? 1 : (stars?.skupaj ?? 1) * r.kolicina };
    if (r.nivo === 1) koren = v;
    else {
      if (!stars || r.izdelek !== koren?.izdelek) throw new Error(`Manjka nadrejeni sestav v vrstici ${r.vrstica}.`);
      stars.otroci.push(v);
    }
    sklad.length = r.nivo;
    sklad[r.nivo - 1] = v;
  }
  if (!koren) throw new Error("Za izbrani ident ni kosovnice.");
  return koren;
}

/** Primerjava pod istim staršem; premik komponente med sestavi ostane viden. */
export function primerjajStrukturo(a: Vozlisce, b: Vozlisce): Razlika[] {
  const razlike: Razlika[] = [];
  function obisk(levi: Vozlisce[], desni: Vozlisce[], faktorL: number, faktorD: number, pot: string) {
    const skupina = (v: Vozlisce[]) => {
      const m = new Map<string, Vozlisce[]>();
      for (const n of v) m.set(n.sifra, [...(m.get(n.sifra) ?? []), n]);
      return m;
    };
    const l = skupina(levi), d = skupina(desni);
    for (const sifra of new Set([...l.keys(), ...d.keys()])) {
      const x = l.get(sifra) ?? [], y = d.get(sifra) ?? [];
      const kL = x.reduce((s, n) => s + n.kolicina * faktorL, 0), kD = y.reduce((s, n) => s + n.kolicina * faktorD, 0);
      const naziv = (x[0] ?? y[0]).naziv;
      if (Math.abs(kL - kD) > 1e-8) razlike.push({ pot, sifra, naziv, levo: kL, desno: kD });
      // Ponovitve istega identa lahko imajo različno strukturo; vsako obravnavamo z njenim faktorjem.
      const razsiri = (v: Vozlisce[], f: number) => v.flatMap(n => n.otroci.map(o => ({ ...o, kolicina: o.kolicina * n.kolicina * f })));
      obisk(razsiri(x, faktorL), razsiri(y, faktorD), 1, 1, pot ? `${pot} / ${sifra}` : sifra);
    }
  }
  obisk(a.otroci, b.otroci, 1, 1, "");
  return razlike;
}

/** Vsaka alternativa ima lastno porabo zaloge. Znotraj nje se isti kos zaloge porabi le enkrat. */
export function materialniPlan(koren: Vozlisce, zaloga: Map<string, ZalogaKosa>, upostevajZalogo = true): Map<string, PlanKosa> {
  const ostanek = new Map([...zaloga].map(([s, z]) => [s, Math.max(0, Math.min(z.zaloga, z.razpolozljiva))]));
  const plan = new Map<string, PlanKosa>();
  let nivo = koren.otroci.map(n => ({ n, qty: n.kolicina, pot: koren.sifra }));
  // Širinsko: neposredna potreba dobi prednost pred globljimi sestavi.
  while (nivo.length) {
    const naslednji: typeof nivo = [];
    for (const { n, qty, pot } of nivo) {
      if (qty <= 1e-8) continue;
      const z = zaloga.get(n.sifra);
      let naVoljo = upostevajZalogo ? ostanek.get(n.sifra) ?? 0 : 0;
      if (/^(kos|kom|pcs)$/i.test(z?.em ?? "")) naVoljo = Math.floor(naVoljo);
      const prevzem = Math.min(qty, naVoljo), manjka = Math.max(0, qty - prevzem);
      ostanek.set(n.sifra, naVoljo - prevzem);
      // Sestav na zalogi zapre vejo samo za pokrito količino. List ostane viden tudi brez zaloge.
      if (prevzem > 1e-8 || !n.otroci.length) {
        const p = plan.get(n.sifra) ?? { sifra: n.sifra, naziv: n.naziv, potreba: 0, prevzem: 0, manjka: 0, poti: [] };
        p.potreba += n.otroci.length ? prevzem : qty;
        p.prevzem += prevzem;
        p.manjka += n.otroci.length ? 0 : manjka;
        if (!p.poti.includes(pot)) p.poti.push(pot);
        plan.set(n.sifra, p);
      }
      if (manjka > 1e-8) for (const o of n.otroci) naslednji.push({ n: o, qty: manjka * o.kolicina, pot: `${pot} / ${n.sifra}` });
    }
    nivo = naslednji;
  }
  return plan;
}

export async function naloziIdente(): Promise<Ident[]> {
  return fetchAll<Ident>((od, doV) => getSupabase().from("spl_identi")
    .select("sifra, risp_sifra, naziv, klasifikat, klasifikacija, status, neaktiven, em").eq("visible", true).order("sifra").range(od, doV));
}

export async function lokalniPredogled<T>(sifra?: string): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const r = await fetch(`/api/kosovnice-predogled${sifra ? `?sifra=${encodeURIComponent(sifra)}` : ""}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" });
  const p = await r.json();
  if (!r.ok) throw new Error(p.napaka ?? "Predogled ni na voljo.");
  return p as T;
}

export async function naloziKosovnico(sifra: string): Promise<Vozlisce | null> {
  const sb = getSupabase();
  const { data: uvoz, error } = await sb.from("spl_kosovnice_uvozi").select("id").eq("aktiven", true).eq("visible", true).maybeSingle();
  if (error) throw new Error(`Kosovnice še niso pripravljene. Zaženi skripto 027 in uvozi izvoza na strani Podatki. (${error.message})`);
  if (!uvoz) return null;
  const koreni = await fetchAll<KosovnicaVrstica>((od, doV) => sb.from("spl_kosovnice")
    .select("vrstica, izdelek, nivo, risp_sifra, sifra, naziv, klasifikat, vrsta, kolicina")
    .eq("uvoz_id", uvoz.id).eq("sifra", sifra).eq("nivo", 1).eq("visible", true).order("vrstica").range(od, doV));
  if (!koreni.length) return null;
  const vrstice = await fetchAll<KosovnicaVrstica>((od, doV) => sb.from("spl_kosovnice")
    .select("vrstica, izdelek, nivo, risp_sifra, sifra, naziv, klasifikat, vrsta, kolicina")
    .eq("uvoz_id", uvoz.id).eq("izdelek", koreni[0].izdelek).eq("visible", true).order("vrstica").range(od, doV));
  return zgradiDrevo(vrstice.map(r => ({ ...r, kolicina: Number(r.kolicina) })));
}
