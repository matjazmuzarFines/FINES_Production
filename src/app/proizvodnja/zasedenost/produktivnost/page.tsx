import type { Metadata } from "next";
import { Produktivnost } from "@/components/zasedenost/Produktivnost";
import { ODDELKI_NORMATIVA, type OddelekKoda } from "@/lib/normativi";

export const metadata: Metadata = { title: "Produktivnost | Fines - Production" };

export default async function Page({ searchParams }: { searchParams: Promise<{ oddelek?: string }> }) {
  const { oddelek } = await searchParams;
  const koda: OddelekKoda = ODDELKI_NORMATIVA.find((o) => o.koda === oddelek)?.koda ?? "M";
  return <Produktivnost key={koda} koda={koda} />;
}
