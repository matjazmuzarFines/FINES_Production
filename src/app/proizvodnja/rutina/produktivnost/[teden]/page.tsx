import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GembaZapisnik } from "@/components/produktivnost/GembaZapisnik";
import { isValidIso, isoWeek, mondayOf } from "@/lib/dates";

type Props = { params: Promise<{ teden: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { teden } = await params;
  return { title: `Gemba ${isValidIso(teden) ? `T${isoWeek(teden)}` : ""} | Fines - Production` };
}

/** Teden je določen s ponedeljkom (YYYY-MM-DD); drug dan v tednu preusmeri na ponedeljek. */
export default async function Page({ params }: Props) {
  const { teden } = await params;
  if (!isValidIso(teden)) notFound();
  if (mondayOf(teden) !== teden) redirect(`/proizvodnja/rutina/produktivnost/${mondayOf(teden)}`);
  return <GembaZapisnik key={teden} teden={teden} />;
}
