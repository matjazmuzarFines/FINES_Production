import type { Metadata } from "next";
import { Pakiranje } from "@/components/orodja/Pakiranje";

export const metadata: Metadata = { title: "Pakiranje | Fines - Production" };

export default function Page() {
  return <Pakiranje />;
}
