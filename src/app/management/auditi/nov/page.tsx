import type { Metadata } from "next";
import { AuditZapisnik } from "@/components/auditi/AuditZapisnik";

export const metadata: Metadata = { title: "Nov audit | Fines - Production" };

export default function Page() {
  return <AuditZapisnik id={null} />;
}
