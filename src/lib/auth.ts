import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured } from "./supabase";

/**
 * Trenutna seja (Supabase Auth). undefined = še preverjam, null = ni prijave.
 * Seja ostane shranjena v brskalniku, dokler se uporabnik ne odjavi (Izhod).
 */
export function useSeja(): Session | null | undefined {
  const [seja, setSeja] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => setSeja(data.session));
    const { data } = sb.auth.onAuthStateChange((_dogodek, s) => setSeja(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return seja;
}

export async function prijava(email: string, geslo: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password: geslo });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Napačen e-mail ali geslo." : error.message);
}

export async function odjava() {
  await getSupabase().auth.signOut();
}
