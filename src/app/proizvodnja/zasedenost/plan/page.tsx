import type { Metadata } from "next";
import { DelovniPlan } from "@/components/zasedenost/DelovniPlan";
import { ODDELKI_NORMATIVA, type OddelekKoda } from "@/lib/normativi";

export const metadata: Metadata = { title: "Delovni plan | Fines - Production" };

export default async function Page({ searchParams }: { searchParams: Promise<{ oddelek?: string }> }) {
  const { oddelek } = await searchParams;
  const koda: OddelekKoda = ODDELKI_NORMATIVA.find((o) => o.koda === oddelek)?.koda ?? "P";
  return <DelovniPlan koda={koda} />;
}
