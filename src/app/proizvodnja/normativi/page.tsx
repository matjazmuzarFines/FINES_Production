import type { Metadata } from "next";
import { NormativiUrejevalnik } from "@/components/normativi/NormativiUrejevalnik";

export const metadata: Metadata = { title: "Normativi | Fines - Production" };

export default async function Page({ searchParams }: { searchParams: Promise<{ nov?: string; naziv?: string }> }) {
  const { nov, naziv } = await searchParams;
  return <NormativiUrejevalnik nov={nov ? { ident: nov, naziv: naziv ?? "" } : undefined} />;
}
