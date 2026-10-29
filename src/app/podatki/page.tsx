import type { Metadata } from "next";
import { PodatkiSync } from "@/components/podatki/PodatkiSync";

export const metadata: Metadata = { title: "Podatki | Fines - Production" };

export default function Page() {
  return <PodatkiSync />;
}
