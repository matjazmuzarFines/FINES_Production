import type { Metadata } from "next";
import { ProduktivnostPregled } from "@/components/produktivnost/ProduktivnostPregled";

export const metadata: Metadata = { title: "Produktivnost | Fines - Production" };

export default async function Page({ searchParams }: { searchParams: Promise<{ mesec?: string }> }) {
  const { mesec } = await searchParams;
  return <ProduktivnostPregled zacetniMesec={mesec} />;
}
