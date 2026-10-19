"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { naloziSifrante, type Sifranti } from "@/lib/auditSifranti";
import { supabaseConfigured } from "@/lib/supabase";
import { ConfigMissing, ErrorText, Loading } from "@/components/ui/Notice";

type SifrantiKontekst = { s: Sifranti; osvezi: () => Promise<void> };

const Ctx = createContext<SifrantiKontekst | null>(null);

/** Šifranti auditov (oddelki, teme, vprašanja, nastavitve) - naložijo se enkrat za vse strani auditov. */
export function SifrantiProvider({ children }: { children: ReactNode }) {
  if (!supabaseConfigured) return <ConfigMissing />;
  return <Nalaganje>{children}</Nalaganje>;
}

function Nalaganje({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Sifranti | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);

  useEffect(() => {
    let preklic = false;
    naloziSifrante()
      .then((x) => !preklic && setS(x))
      .catch((e) => !preklic && setNapaka(e.message));
    return () => {
      preklic = true;
    };
  }, []);

  const osvezi = useCallback(async () => setS(await naloziSifrante()), []);

  if (napaka) return <ErrorText className="mx-auto max-w-xl">Napaka pri nalaganju nastavitev auditov: {napaka}</ErrorText>;
  if (!s) return <Loading />;
  return <Ctx.Provider value={{ s, osvezi }}>{children}</Ctx.Provider>;
}

export function useSifranti(): SifrantiKontekst {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSifranti brez SifrantiProvider");
  return c;
}
