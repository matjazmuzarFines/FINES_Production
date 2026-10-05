import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrRutina } from "@/components/rutina/PrRutina";
import { formatShort, isValidIso } from "@/lib/dates";

type Props = { params: Promise<{ datum: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { datum } = await params;
  return { title: `Rutina proizvodnje ${isValidIso(datum) ? formatShort(datum) : ""} | Fines - Production` };
}

export default async function Page({ params }: Props) {
  const { datum } = await params;
  if (!isValidIso(datum)) notFound();
  return <PrRutina key={datum} datum={datum} />;
}
