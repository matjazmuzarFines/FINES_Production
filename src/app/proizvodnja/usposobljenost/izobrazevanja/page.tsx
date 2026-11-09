import type { Metadata } from "next";
import { Izobrazevanja } from "@/components/usposobljenost/Izobrazevanja";

export const metadata: Metadata = { title: "Izobraževanja | Fines - Production" };

export default function Page() {
  return <Izobrazevanja />;
}
