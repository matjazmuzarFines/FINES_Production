import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuditZapisnik } from "@/components/auditi/AuditZapisnik";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Audit | Fines - Production" };

/** Audit je določen z id (/management/auditi/12). */
export default async function Page({ params }: Props) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <AuditZapisnik key={id} id={Number(id)} />;
}
