"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";
type Toast = { id: number; type: ToastType; text: string };

const ToastContext = createContext<(type: ToastType, text: string, ms?: number) => void>(() => {});

const STYLE: Record<ToastType, { cls: string; icon: LucideIcon }> = {
  success: { cls: "border-ok-500 bg-ok-50 text-ok-600", icon: CheckCircle2 },
  error: { cls: "border-nok-500 bg-nok-50 text-nok-600", icon: XCircle },
  warning: { cls: "border-warn-500 bg-warn-50 text-warn-700", icon: AlertTriangle },
  info: { cls: "border-ink-300 bg-white text-ink-700", icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((type: ToastType, text: string, ms = 5000) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const { cls, icon: Icon } = STYLE[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border-l-4 px-4 py-3 text-sm font-medium shadow-lg ${cls}`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>{t.text}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
