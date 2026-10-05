import type { Metadata } from "next";
import { NormativiUrejevalnik } from "@/components/normativi/NormativiUrejevalnik";

export const metadata: Metadata = { title: "Normativi | Fines - Production" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ident?: string }> }) {
  const { ident } = await searchParams;
  return <NormativiUrejevalnik zacetniIdent={ident} />;
}
