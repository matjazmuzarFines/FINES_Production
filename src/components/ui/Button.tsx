"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type ButtonVariant =
  | "primary" // oranžna - glavna akcija / navigacija
  | "success" // zelena - dodaj, potrdi, shrani
  | "danger" // rdeča - izbriši, odstrani
  | "warning" // rumena - opozorilo
  | "sync" // modra - sync / zunanje funkcije
  | "neutral"; // siva - sekundarno

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-fines-500 text-white hover:bg-fines-600 active:bg-fines-700",
  success: "bg-ok-500 text-white hover:bg-ok-600",
  danger: "bg-nok-500 text-white hover:bg-nok-600",
  warning: "bg-warn-400 text-ink-900 hover:bg-warn-500",
  sync: "bg-sync-500 text-white hover:bg-sync-600",
  neutral: "bg-white text-ink-700 border border-ink-200 hover:bg-ink-100",
};

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  /** Hover tekst - kaj točno gumb naredi (max 6-8 besed). Obvezno. */
  hint: string;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  size?: "md" | "lg";
  children?: ReactNode;
};

export function Button({
  hint,
  variant = "primary",
  icon: Icon,
  size = "md",
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  const sizing = size === "lg" ? "h-12 px-5 text-base" : "h-10 px-4 text-sm";
  return (
    <button
      type={type}
      title={hint}
      aria-label={typeof children === "string" ? undefined : hint}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "children"> & {
  hint: string;
  icon: LucideIcon;
  variant?: "ghost" | ButtonVariant;
};

/** Okrogel gumb samo z ikono (puščice, info, zapri ...). */
export function IconButton({
  hint,
  icon: Icon,
  variant = "ghost",
  className = "",
  type = "button",
  ...rest
}: IconButtonProps) {
  const style =
    variant === "ghost"
      ? "text-ink-600 hover:bg-ink-100 hover:text-fines-500"
      : `${VARIANTS[variant]} shadow-sm`;
  return (
    <button
      type={type}
      title={hint}
      aria-label={hint}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${style} ${className}`}
      {...rest}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}
