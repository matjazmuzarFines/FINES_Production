import type { Metadata } from "next";
import { SklRutina } from "@/components/rutina/SklRutina";

export const metadata: Metadata = { title: "Rutina skladišča | Fines - Production" };

export default function Page() {
  return <SklRutina />;
}
