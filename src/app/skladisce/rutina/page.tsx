import type { Metadata } from "next";
import { RutinaKoledar } from "@/components/rutina/RutinaKoledar";

export const metadata: Metadata = { title: "Rutina skladišča | Fines - Production" };

export default async function Page({ searchParams }: { searchParams: Promise<{ mesec?: string }> }) {
  const { mesec } = await searchParams;
  return <RutinaKoledar modul="skladisce" zacetniMesec={mesec} />;
}
