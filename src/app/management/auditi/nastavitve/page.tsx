import type { Metadata } from "next";
import { AuditNastavitve } from "@/components/auditi/AuditNastavitve";

export const metadata: Metadata = { title: "Nastavitve auditov | Fines - Production" };

export default function Page() {
  return <AuditNastavitve />;
}
