import type { Metadata } from "next";
import { Prioritete } from "@/components/prioritete/Prioritete";

export const metadata: Metadata = { title: "Prioritete | Fines - Production" };

export default function Page() {
  return <Prioritete />;
}
