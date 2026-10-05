import type { ReactNode } from "react";
import { AlertTriangle, Construction, Database } from "lucide-react";

export function WarningText({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm font-medium text-warn-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export function ConfigMissing() {
  return (
    <div className="fp-card mx-auto max-w-xl p-6 text-center">
      <Database className="mx-auto h-10 w-10 text-fines-500" aria-hidden />
      <h2 className="mt-3 text-lg font-bold">Povezava z bazo ni nastavljena</h2>
      <p className="mt-2 text-sm text-ink-600">
        V datoteko <code className="rounded bg-ink-100 px-1">.env.local</code> dodaj{" "}
        <code className="rounded bg-ink-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> in{" "}
        <code className="rounded bg-ink-100 px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> ter
        ponovno zaženi <code className="rounded bg-ink-100 px-1">npm run dev</code>.
      </p>
    </div>
  );
}

export function ComingSoon({ title, opis }: { title: string; opis: string }) {
  return (
    <div className="fp-card mx-auto max-w-xl p-8 text-center">
      <Construction className="mx-auto h-12 w-12 text-fines-500" aria-hidden />
      <h2 className="mt-4 text-xl font-bold">{title}</h2>
      <p className="mt-2 text-ink-600">{opis}</p>
      <p className="mt-4 inline-block rounded-full bg-warn-50 px-3 py-1 text-sm font-semibold text-warn-700">
        V izdelavi
      </p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Nalagam">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-fines-100 border-t-fines-500" />
    </div>
  );
}
