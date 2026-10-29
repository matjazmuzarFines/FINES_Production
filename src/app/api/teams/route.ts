// Pošiljanje obvestila v Teams prek Power Automate (Workflows: "When a Teams webhook request is received").
// URL webhooka vsebuje ključ, zato je samo na strežniku (spremenljivka okolja), brskalnik ga ne vidi.
// Brskalnik pošlje gotove Adaptive Card priponke; strežnik preveri prijavo in jih posreduje flowu.
import { createClient } from "@supabase/supabase-js";

/** Kanal -> spremenljivka okolja z URL-jem webhooka (Vercel: Settings → Environment Variables). */
const KANALI = {
  doizdaja: "TEAMS_WEBHOOK_DOIZDAJA",
} as const;
type Kanal = keyof typeof KANALI;

/** Največja velikost sporočila (Teams sprejme ~28 KB na kartico). */
const NAJVEC_ZNAKOV = 100_000;

/** Dostop samo s prijavo (Supabase žeton v glavi Authorization). Vrne e-mail prijavljenega ali null. */
async function prijavljen(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const zeton = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!zeton) return null;
  const { data, error } = await createClient(url, key).auth.getUser(zeton);
  return error || !data.user ? null : (data.user.email ?? "");
}

export async function POST(req: Request) {
  if ((await prijavljen(req)) === null) return Response.json({ napaka: "Ni prijave - prijavi se znova." }, { status: 401 });

  const telo = (await req.json().catch(() => null)) as { kanal?: string; attachments?: unknown[] } | null;
  const kanal = telo?.kanal as Kanal | undefined;
  if (!kanal || !(kanal in KANALI)) return Response.json({ napaka: "Neznan kanal obvestila." }, { status: 400 });
  if (!Array.isArray(telo?.attachments) || telo.attachments.length === 0)
    return Response.json({ napaka: "Sporočilo je prazno." }, { status: 400 });

  const webhook = process.env[KANALI[kanal]];
  if (!webhook)
    return Response.json(
      { napaka: `Webhook za Teams ni nastavljen (spremenljivka ${KANALI[kanal]} na strežniku).` },
      { status: 503 },
    );

  const sporocilo = JSON.stringify({ type: "message", attachments: telo.attachments });
  if (sporocilo.length > NAJVEC_ZNAKOV)
    return Response.json({ napaka: "Sporočilo je preveliko - izberi manj materiala." }, { status: 413 });

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: sporocilo,
    signal: AbortSignal.timeout(20_000),
  }).catch((e: Error) => e);
  if (res instanceof Error) return Response.json({ napaka: `Power Automate ni dosegljiv: ${res.message}` }, { status: 502 });
  // Flow vrne 202 Accepted, ko sprejme zahtevo (objava v Teams teče v ozadju)
  if (!res.ok) {
    const opis = (await res.text().catch(() => "")).slice(0, 300);
    return Response.json({ napaka: `Power Automate je zavrnil sporočilo (${res.status}). ${opis}` }, { status: 502 });
  }
  return Response.json({ ok: true });
}
