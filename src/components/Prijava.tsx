"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { prijava } from "@/lib/auth";
import { Button } from "./ui/Button";
import { ErrorText } from "./ui/Notice";

const POLJE =
  "h-10 w-full rounded-lg border border-ink-200 px-3 text-sm focus:border-fines-500 focus:outline-none focus:ring-2 focus:ring-fines-100";

/** Prijavno okno - aplikacija brez prijave ne pokaže ničesar drugega. */
export function Prijava() {
  const [email, setEmail] = useState("");
  const [geslo, setGeslo] = useState("");
  const [pokaziGeslo, setPokaziGeslo] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [prijavljam, setPrijavljam] = useState(false);

  async function potrdi(e: FormEvent) {
    e.preventDefault();
    setNapaka(null);
    setPrijavljam(true);
    try {
      await prijava(email, geslo);
    } catch (err) {
      setNapaka((err as Error).message);
      setPrijavljam(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center border-t-4 border-fines-500 bg-ink-50 px-4">
      <form onSubmit={potrdi} className="fp-card flex w-full max-w-sm flex-col gap-4 p-6">
        <Image src="/fines-logo.png" alt="FINES d.o.o. logotip" width={136} height={36} priority className="self-center" />
        <div className="text-center">
          <h1 className="text-xl font-bold text-ink-900">Prijava</h1>
          <p className="text-sm text-ink-500">Fines - Production</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink-700">
          E-mail
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            title="Vpiši e-mail uporabnika"
            className={POLJE}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink-700">
          Geslo
          <div className="relative">
            <input
              type={pokaziGeslo ? "text" : "password"}
              autoComplete="current-password"
              required
              value={geslo}
              onChange={(e) => setGeslo(e.target.value)}
              title="Vpiši geslo"
              className={`${POLJE} pr-10`}
            />
            <button
              type="button"
              title={pokaziGeslo ? "Skrij geslo" : "Pokaži geslo"}
              aria-label={pokaziGeslo ? "Skrij geslo" : "Pokaži geslo"}
              onClick={() => setPokaziGeslo(!pokaziGeslo)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-500 hover:text-fines-500"
            >
              {pokaziGeslo ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </label>
        {napaka && <ErrorText>{napaka}</ErrorText>}
        <Button type="submit" hint="Prijavi se v aplikacijo" icon={LogIn} size="lg" disabled={prijavljam}>
          {prijavljam ? "Prijavljam ..." : "Prijava"}
        </Button>
      </form>
    </div>
  );
}
