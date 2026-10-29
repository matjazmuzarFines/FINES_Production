// Obvestila v Teams: aplikacija sestavi celotno sporočilo (Adaptive Card), Power Automate ga samo objavi v chat.
// Tako je flow enostaven in se ne spreminja, ko se spremeni vsebina sporočila.
import { formatShort } from "./dates";
import { RDECA_OD, RUMENA_OD, poKrovnih, type Stolpec } from "./doizdaja";
import { formatNum } from "./stevila";
import { getSupabase } from "./supabase";

/** Naslov aplikacije za gumb v sporočilu (isti kot v e-mailih). */
const URL_APLIKACIJE = (process.env.NEXT_PUBLIC_APP_URL || "https://finesproduction.vercel.app").replace(/\/$/, "");

/** Priponka sporočila Teams z Adaptive Card. */
export type TeamsPriponka = { contentType: "application/vnd.microsoft.card.adaptive"; contentUrl: null; content: unknown };

/** Največ materialov na eno kartico (Teams omeji velikost kartice) - več materialov gre v več kartic. */
const NA_KARTICO = 8;

const datum = (iso: string | null) => (iso ? formatShort(iso) : "–");
const casZdaj = () =>
  new Date().toLocaleString("sl-SI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Barva okvirja materiala v kartici po dnevih čakanja (kot na tabli). */
const slogPoStarosti = (starost: number | null) =>
  starost === null ? "default" : starost >= RDECA_OD ? "attention" : starost >= RUMENA_OD ? "warning" : "good";
const barvaPoStarosti = (starost: number | null) =>
  starost === null ? "Default" : starost >= RDECA_OD ? "Attention" : starost >= RUMENA_OD ? "Warning" : "Good";

function blokMateriala(s: Stolpec, nazivKrovnega: (krovni: string) => string | null) {
  const em = s.em ?? "";
  const zaIzdajo = s.kartice.reduce((a, k) => a + k.za_izdajo, 0);
  const vrstice = poKrovnih(s.kartice, nazivKrovnega).flatMap((sk) =>
    sk.kartice.map((k) => ({
      title: k.nalog.krovni === k.nalog.st_naloga ? k.nalog.st_naloga : `${k.nalog.st_naloga} (krovni ${k.nalog.krovni})`,
      value:
        `**${formatNum(k.za_izdajo)} ${em}** · rok ${datum(k.nalog.rok)}` +
        (k.pokritost === "delno" ? ` · na voljo samo ${formatNum(k.na_voljo)}` : k.pokritost === "nic" ? " · ni zaloge" : ""),
    })),
  );
  return {
    type: "Container",
    style: slogPoStarosti(s.starost),
    spacing: "Medium",
    items: [
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [{ type: "TextBlock", text: `**${s.ident}** · ${s.naziv ?? ""}`, wrap: true }],
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: s.starost === null ? "" : `${s.starost}. dan`,
                weight: "Bolder",
                color: barvaPoStarosti(s.starost),
              },
            ],
          },
        ],
      },
      {
        type: "TextBlock",
        text: `Za izdajo ${formatNum(zaIzdajo)} ${em} · prevzeto ${formatNum(s.prevzeto)} ${em} (${datum(s.prevzemi[s.prevzemi.length - 1]?.datum ?? null)}) · zaloga ${formatNum(s.zaloga)} ${em}`,
        size: "Small",
        isSubtle: true,
        wrap: true,
        spacing: "None",
      },
      { type: "FactSet", facts: vrstice, spacing: "Small" },
    ],
  };
}

/**
 * Sestavi sporočilo za chat skladišča: glava (kdo, kdaj, koliko), za vsak material okvir v barvi dni čakanja
 * z nalogi (krovni, rok, količina) in gumb za odprtje Doizdaje. Več kot NA_KARTICO materialov gre v več kartic.
 */
export function sporociloDoizdaje(
  stolpci: Stolpec[],
  nazivKrovnega: (krovni: string) => string | null,
  poslal: string | null,
): TeamsPriponka[] {
  const nalogov = new Set(stolpci.flatMap((s) => s.kartice.map((k) => k.nalog.st_naloga))).size;
  const deli: Stolpec[][] = [];
  for (let i = 0; i < stolpci.length; i += NA_KARTICO) deli.push(stolpci.slice(i, i + NA_KARTICO));
  return deli.map((del, i) => ({
    contentType: "application/vnd.microsoft.card.adaptive",
    contentUrl: null,
    content: {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      msteams: { width: "Full" },
      body: [
        {
          type: "TextBlock",
          text: `📦 Doizdaja materiala${deli.length > 1 ? ` (${i + 1}/${deli.length})` : ""}`,
          size: "Large",
          weight: "Bolder",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "Material je prispel od dobavitelja - izdaj ga na spodnje delovne naloge.",
          wrap: true,
          spacing: "None",
        },
        {
          type: "TextBlock",
          text: `${casZdaj()} · ${stolpci.length} materialov · ${nalogov} nalogov${poslal ? ` · poslal ${poslal}` : ""}`,
          size: "Small",
          isSubtle: true,
          wrap: true,
          spacing: "None",
        },
        ...del.map((s) => blokMateriala(s, nazivKrovnega)),
      ],
      actions: [{ type: "Action.OpenUrl", title: "Odpri Doizdajo", url: `${URL_APLIKACIJE}/skladisce/doizdaja` }],
    },
  }));
}

/** Pošlje sporočilo prek strežnika aplikacije (/api/teams) - vrne e-mail pošiljatelja. */
export async function posljiVTeams(kanal: "doizdaja", attachments: TeamsPriponka[]) {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch("/api/teams", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: JSON.stringify({ kanal, attachments }),
  });
  if (!res.ok) {
    const napaka = (await res.json().catch(() => null)) as { napaka?: string } | null;
    throw new Error(napaka?.napaka ?? `Pošiljanje ni uspelo (${res.status}).`);
  }
}

/** E-mail prijavljenega uporabnika (za podpis sporočila). */
export async function prijavljenEmail(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.email ?? null;
}
