"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, ChevronDown, Pencil, Plus, Target, Users } from "lucide-react";
import {
  PRIKAZ_TEDNOV,
  barvaVodje,
  formatPct,
  naloziCm,
  serija,
  tedenObdobje,
  tedenSt,
  trenutniTeden,
  type CmPodatki,
  type CmPodrocje,
  type CmVodja,
} from "@/lib/changeManagement";
import { supabaseConfigured } from "@/lib/supabase";
import { Button, IconButton } from "@/components/ui/Button";
import { ConfigMissing, ErrorText, Loading } from "@/components/ui/Notice";
import { SortTh, TabelaOkvir, useRazvrscanje } from "@/components/ui/Tabela";
import { Zavihki, type Zavihek } from "@/components/ui/Zavihki";
import { GrafPodrocja, type SerijaVodje } from "./GrafPodrocja";
import { PodrocjeOkno } from "./PodrocjeOkno";
import { TedenOkno } from "./TedenOkno";

export function ChangeManagement() {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <ChangeManagementInner />;
}

type ZavihekKoda = "vodje" | "operacije";

/** Zavihek = skupina vodij, ki jih primerjamo na istih grafih. */
const ZAVIHKI: (Zavihek<ZavihekKoda> & { vodje: string[]; sporocilo: boolean })[] = [
  {
    koda: "vodje",
    label: "Vodji proizvodnje in montaže",
    hint: "Napredek vodje proizvodnje in vodje montaže",
    icon: Users,
    vodje: ["VP", "VM"],
    sporocilo: true,
  },
  {
    koda: "operacije",
    label: "Vodja operacij",
    hint: "Napredek vodje operacij: proizvodnja, skladišče, tehnologija + razvoj",
    icon: Briefcase,
    vodje: ["VO"],
    sporocilo: false,
  },
];

type Okno = { tip: "teden"; vodja: CmVodja; teden: number } | { tip: "podrocje"; podrocje: CmPodrocje };

function ChangeManagementInner() {
  const [podatki, setPodatki] = useState<CmPodatki | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [okno, setOkno] = useState<Okno | null>(null);
  const [zavihek, setZavihek] = useState<ZavihekKoda>("vodje");

  const nalozi = useCallback(() => {
    naloziCm()
      .then((p) => {
        setPodatki(p);
        setNapaka(null);
      })
      .catch((e: Error) => setNapaka(e.message));
  }, []);

  useEffect(nalozi, [nalozi]);

  if (napaka)
    return (
      <ErrorText>
        Napaka pri branju podatkov: {napaka}. Če tabele še ne obstajajo, v Supabase zaženi{" "}
        <code>supabase/migrations/004_change_management.sql</code>.
      </ErrorText>
    );
  if (!podatki) return <Loading />;

  const zapri = () => setOkno(null);
  const shranjeno = () => {
    setOkno(null);
    nalozi();
  };

  const tab = ZAVIHKI.find((z) => z.koda === zavihek) ?? ZAVIHKI[0];
  const vodje = podatki.vodje.filter((v) => tab.vodje.includes(v.koda));

  // Področja vodij zavihka (v vrstnem redu področij); na grafu ena črta na vodjo.
  const vodjePodrocja = (p: CmPodrocje) =>
    vodje.filter((v) => (podatki.podrocjaVodje.get(v.id) ?? []).some((x) => x.id === p.id));
  const podrocja = podatki.podrocja.filter((p) => vodjePodrocja(p).length > 0);

  const serijeVodje = (p: CmPodrocje): SerijaVodje[] =>
    vodjePodrocja(p).map((v) => ({
      vodja: v,
      tocke: serija(
        v.zacetek,
        podatki.ocene.filter((o) => o.vodja_id === v.id && o.podrocje_id === p.id),
      ),
    }));

  const vseSerije = podrocja.flatMap(serijeVodje);
  const zacetek = vodje[0]?.zacetek ?? podatki.vodje[0]?.zacetek ?? "2026-10-05";
  // Skupna os x za vse grafe: vsaj 3 mesece, podaljša se, če gremo dlje.
  const tednov = Math.max(
    PRIKAZ_TEDNOV,
    ...vodje.map((v) => trenutniTeden(v.zacetek)),
    ...vseSerije.map((s) => s.tocke[s.tocke.length - 1].teden),
  );

  // Sklopi (npr. Proizvodnja, Skladišče) v vrstnem redu prvega področja; null = brez naslova sklopa.
  const sklopi: { sklop: string | null; podrocja: CmPodrocje[] }[] = [];
  for (const p of podrocja) {
    const s = sklopi.find((x) => x.sklop === p.sklop);
    if (s) s.podrocja.push(p);
    else sklopi.push({ sklop: p.sklop, podrocja: [p] });
  }
  const stevilka = new Map(podrocja.map((p, i) => [p.id, i + 1]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Change management · Upravljanje sprememb</h2>
        <p className="text-sm text-ink-500">
          Tedenski napredek vodij po področjih · izhodišče 0 % · cilj v {PRIKAZ_TEDNOV} tednih
        </p>
      </div>

      {/* ============ ZAVIHKI + VODJE ============ */}
      <div>
        <Zavihki zavihki={ZAVIHKI} value={tab.koda} onChange={setZavihek} label="Vodje" />
        <div className="fp-card grid gap-3 rounded-tl-none p-3 sm:grid-cols-2 lg:grid-cols-3">
          {tab.sporocilo && (
            <div className="flex flex-col justify-center rounded-xl bg-ink-800 p-4 text-white shadow-md">
              <div className="text-xs font-bold uppercase tracking-wider text-fines-400">Glavno sporočilo</div>
              <p className="mt-1 text-sm font-semibold">Tvoje delo ne sme biti pol dneva delati kot delavec.</p>
              <p className="text-sm text-ink-200">Tvoja glavna naloga je biti odgovoren za ljudi in pripravljati delo.</p>
            </div>
          )}
          {vodje.map((v) => (
            <VodjaKartica key={v.id} vodja={v} podatki={podatki} onVpisi={(teden) => setOkno({ tip: "teden", vodja: v, teden })} />
          ))}
        </div>
      </div>

      {/* ============ PODROČJA PO SKLOPIH ============ */}
      {sklopi.length === 0 && <div className="fp-card p-8 text-center text-ink-500">Področja še niso določena.</div>}
      {sklopi.map(({ sklop, podrocja: ps }) => (
        <div key={sklop ?? "-"} className="flex flex-col gap-3">
          {sklop && (
            <div className="flex items-center gap-3">
              <h3 className="shrink-0 text-sm font-bold uppercase tracking-wider" style={{ color: ps[0].barva }}>
                {sklop}
              </h3>
              <span className="h-px flex-1" style={{ background: `${ps[0].barva}55` }} aria-hidden />
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ps.map((p) => (
              <PodrocjeKartica
                key={p.id}
                st={stevilka.get(p.id) ?? 0}
                podrocje={p}
                serije={serijeVodje(p)}
                tednov={tednov}
                zacetek={zacetek}
                onUrediCilje={() => setOkno({ tip: "podrocje", podrocje: p })}
                onUrediTeden={(vodja, teden) => setOkno({ tip: "teden", vodja, teden })}
              />
            ))}
          </div>
        </div>
      ))}

      {okno?.tip === "teden" && (
        <TedenOkno
          vodja={okno.vodja}
          podrocja={podatki.podrocjaVodje.get(okno.vodja.id) ?? []}
          ocene={podatki.ocene.filter((o) => o.vodja_id === okno.vodja.id)}
          teden={okno.teden}
          zadnjiTeden={trenutniTeden(okno.vodja.zacetek)}
          onClose={zapri}
          onShranjeno={shranjeno}
        />
      )}
      {okno?.tip === "podrocje" && <PodrocjeOkno podrocje={okno.podrocje} onClose={zapri} onShranjeno={shranjeno} />}
    </div>
  );
}

function VodjaKartica({
  vodja: v,
  podatki,
  onVpisi,
}: {
  vodja: CmVodja;
  podatki: CmPodatki;
  onVpisi: (teden: number) => void;
}) {
  const mojaPodrocja = podatki.podrocjaVodje.get(v.id) ?? [];
  const teden = trenutniTeden(v.zacetek);
  const skupaj = mojaPodrocja.map(
    (p) => serija(v.zacetek, podatki.ocene.filter((o) => o.vodja_id === v.id && o.podrocje_id === p.id)).at(-1)!.skupaj,
  );
  const povprecje = skupaj.length ? skupaj.reduce((a, b) => a + b, 0) / skupaj.length : 0;
  const vpisanoTaTeden = new Set(
    podatki.ocene.filter((o) => o.vodja_id === v.id && tedenSt(v.zacetek, o.teden) === teden).map((o) => o.podrocje_id),
  ).size;
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-t-4 border-ink-200 p-3"
      style={{ borderTopColor: barvaVodje(v.koda).osnovna }}
    >
      <div className="font-bold text-ink-900">{v.naziv}</div>
      {mojaPodrocja.length === 0 ? (
        <p className="text-sm text-ink-500">Področja še niso določena.</p>
      ) : (
        <>
          <div className="text-sm text-ink-600">
            Povprečje{" "}
            <span className="font-bold tabular-nums text-ink-900">{formatPct(Math.round(povprecje * 100) / 100)}</span>
            {" · "}
            {teden}. teden: {vpisanoTaTeden}/{mojaPodrocja.length} vpisanih
          </div>
          <Button
            hint={`Vpiši oceno tega tedna za: ${v.naziv}`}
            variant="success"
            icon={Plus}
            className="mt-auto"
            onClick={() => onVpisi(teden)}
          >
            Vpiši teden
          </Button>
        </>
      )}
    </div>
  );
}

function PodrocjeKartica({
  st,
  podrocje: p,
  serije,
  tednov,
  zacetek,
  onUrediCilje,
  onUrediTeden,
}: {
  st: number;
  podrocje: CmPodrocje;
  serije: SerijaVodje[];
  tednov: number;
  zacetek: string;
  onUrediCilje: () => void;
  onUrediTeden: (vodja: CmVodja, teden: number) => void;
}) {
  const tocke = (p.tocke ?? "").split("\n").map((t) => t.trim()).filter(Boolean);

  return (
    <section className="fp-card flex min-w-0 flex-col overflow-hidden">
      {/* glava v barvi področja */}
      <div className="flex items-center gap-2.5 px-3 py-2" style={{ background: `${p.barva}14`, borderTop: `4px solid ${p.barva}` }}>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow"
          style={{ background: p.barva }}
        >
          {st}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold uppercase tracking-wide" style={{ color: p.barva }}>
            {p.naziv}
          </h3>
          {p.geslo && <p className="truncate text-xs font-semibold text-ink-600">{p.geslo}</p>}
        </div>
        <div className="hidden flex-col items-end gap-0.5 sm:flex">
          {serije.map((s) => (
            <span key={s.vodja.id} className="inline-flex items-center gap-1.5 text-xs text-ink-600" title={s.vodja.naziv}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: barvaVodje(s.vodja.koda).osnovna }} />
              <span className="font-bold tabular-nums text-ink-900">{formatPct(s.tocke.at(-1)!.skupaj)}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-2.5">
        <GrafPodrocja
          serije={serije}
          tednov={tednov}
          nacrtovanoTednov={PRIKAZ_TEDNOV}
          cilj={p.cilj}
          zacetek={zacetek}
          naziv={p.naziv}
        />

        {/* cilji: cilj v %, na čem se dela (točka "Področje: opis" ima krepko področje), pričakovanja */}
        <div className="flex flex-col gap-2 rounded-lg bg-ink-50 p-2.5">
          <div className="flex items-center gap-2">
            <h4 className="flex flex-1 items-center gap-1.5 text-sm font-bold text-ink-800">
              <Target className="h-4 w-4" style={{ color: p.barva }} aria-hidden />
              Cilj {formatPct(p.cilj).replace("+", "")} v {PRIKAZ_TEDNOV} tednih
            </h4>
            <IconButton hint="Uredi cilje, pričakovanja in točke področja" icon={Pencil} variant="primary" onClick={onUrediCilje} />
          </div>
          {tocke.length > 0 && (
            <ul className="space-y-1 text-[13px] leading-snug text-ink-800">
              {tocke.map((t) => {
                const i = t.indexOf(": ");
                return (
                  <li key={t} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.barva }} />
                    <span>
                      {i > 0 ? (
                        <>
                          <span className="font-bold">{t.slice(0, i)}:</span> {t.slice(i + 2)}
                        </>
                      ) : (
                        t
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {p.pricakovanja && (
            <p className="whitespace-pre-line border-t border-ink-200 pt-2 text-[13px] leading-snug text-ink-700">
              <span className="font-bold text-ink-800">Pričakovanja: </span>
              {p.pricakovanja}
            </p>
          )}
        </div>

        <Vpisi serije={serije} onUredi={onUrediTeden} />
      </div>
    </section>
  );
}

type VpisKljuc = "teden" | "vodja" | "sprememba" | "skupaj" | "komentar";
type Vpis = { vodja: CmVodja; teden: number; sprememba: number; skupaj: number; komentar: string };

const VPIS_VREDNOSTI: Record<VpisKljuc, (v: Vpis) => string | number> = {
  teden: (v) => v.teden,
  vodja: (v) => v.vodja.naziv,
  sprememba: (v) => v.sprememba,
  skupaj: (v) => v.skupaj,
  komentar: (v) => v.komentar,
};

/** Zložljiva tabela vpisov področja (privzeto najnovejši zgoraj). */
function Vpisi({
  serije,
  onUredi,
}: {
  serije: SerijaVodje[];
  onUredi: (vodja: CmVodja, teden: number) => void;
}) {
  const [odprta, setOdprta] = useState(false);
  const sort = useRazvrscanje(VPIS_VREDNOSTI);
  const vpisi: Vpis[] = serije
    .flatMap((s) =>
      s.tocke
        .filter((t) => t.ocena)
        .map((t) => ({ vodja: s.vodja, teden: t.teden, sprememba: t.ocena!.sprememba, skupaj: t.skupaj, komentar: t.ocena!.komentar })),
    )
    .sort((a, b) => b.teden - a.teden || a.vodja.vrstni_red - b.vodja.vrstni_red);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        title={odprta ? "Skrij tabelo vpisov" : "Pokaži tabelo vseh vpisov področja"}
        aria-expanded={odprta}
        onClick={() => setOdprta(!odprta)}
        className="flex items-center gap-1.5 self-start text-sm font-bold text-ink-700 hover:text-fines-500"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${odprta ? "rotate-180" : ""}`} aria-hidden />
        Vpisi ({vpisi.length})
      </button>
      {odprta && (
        <TabelaOkvir>
          <table className="w-full text-sm">
            <thead className="fp-thead">
              <tr>
                <SortTh sort={sort} kljuc="teden" className="pl-3">Teden</SortTh>
                <SortTh sort={sort} kljuc="vodja">Vodja</SortTh>
                <SortTh sort={sort} kljuc="sprememba" desno>Sprememba</SortTh>
                <SortTh sort={sort} kljuc="skupaj" desno>Skupaj</SortTh>
                <SortTh sort={sort} kljuc="komentar" className="w-full">Komentar</SortTh>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {vpisi.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-500">
                    Ni vpisov za to področje.
                  </td>
                </tr>
              ) : (
                sort.razvrsti(vpisi).map((v) => (
                  <tr key={`${v.vodja.id}-${v.teden}`} className="border-b border-ink-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="font-semibold">{v.teden}. teden</div>
                      <div className="text-xs text-ink-500">{tedenObdobje(v.vodja.zacetek, v.teden)}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: barvaVodje(v.vodja.koda).osnovna }} />
                        {v.vodja.naziv}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">{formatPct(v.sprememba)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-ink-700">{formatPct(v.skupaj)}</td>
                    <td className="min-w-56 whitespace-pre-line px-2 py-2 text-ink-700">{v.komentar}</td>
                    <td className="px-2 py-1">
                      <IconButton
                        hint="Uredi oceno tega tedna"
                        icon={Pencil}
                        variant="primary"
                        onClick={() => onUredi(v.vodja, v.teden)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TabelaOkvir>
      )}
    </div>
  );
}
