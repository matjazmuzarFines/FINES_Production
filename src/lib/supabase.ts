import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error(
      "Supabase ni nastavljen. Dodaj NEXT_PUBLIC_SUPABASE_URL in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY v .env.local.",
    );
  }
  client ??= createClient(url!, key!);
  return client;
}

export const SLIKE_BUCKET = "fp-rutina-slike";
