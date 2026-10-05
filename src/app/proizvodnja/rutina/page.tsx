import type { Metadata } from "next";
import { PrRutina } from "@/components/rutina/PrRutina";

export const metadata: Metadata = { title: "Rutina proizvodnje | Fines - Production" };

export default function Page() {
  return <PrRutina />;
}
