import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SklRutina } from "@/components/rutina/SklRutina";
import { formatShort, isValidIso } from "@/lib/dates";

type Props = { params: Promise<{ datum: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { datum } = await params;
  return { title: `Rutina skladišča ${isValidIso(datum) ? formatShort(datum) : ""} | Fines - Production` };
}

export default async function Page({ params }: Props) {
  const { datum } = await params;
  if (!isValidIso(datum)) notFound();
  return <SklRutina key={datum} datum={datum} />;
}
