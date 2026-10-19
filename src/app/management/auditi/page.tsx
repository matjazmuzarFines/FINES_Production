import type { Metadata } from "next";
import { AuditiPregled } from "@/components/auditi/AuditiPregled";

export const metadata: Metadata = { title: "Auditi | Fines - Production" };

export default function Page() {
  return <AuditiPregled />;
}
