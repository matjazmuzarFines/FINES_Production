import type { ReactNode } from "react";
import { SifrantiProvider } from "@/components/auditi/Sifranti";

/** Vse strani auditov delijo šifrante (oddelki, teme, vprašanja, nastavitve). */
export default function Layout({ children }: { children: ReactNode }) {
  return <SifrantiProvider>{children}</SifrantiProvider>;
}
