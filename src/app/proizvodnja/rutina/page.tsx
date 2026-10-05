import type { Metadata } from "next";
import { RutinaKoledar } from "@/components/rutina/RutinaKoledar";

export const metadata: Metadata = { title: "Rutina proizvodnje | Fines - Production" };

export default async function Page({ searchParams }: { searchParams: Promise<{ mesec?: string }> }) {
  const { mesec } = await searchParams;
  return <RutinaKoledar modul="proizvodnja" zacetniMesec={mesec} />;
}
