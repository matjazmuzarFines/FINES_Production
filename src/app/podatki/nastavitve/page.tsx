import type { Metadata } from "next";
import { DostopUporabnikov } from "@/components/podatki/DostopUporabnikov";

export const metadata: Metadata = { title: "Dostop uporabnikov | Fines - Production" };

export default function Page() {
  return <DostopUporabnikov />;
}
