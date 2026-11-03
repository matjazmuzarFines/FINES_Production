import type { Metadata } from "next";
import { VijacniMaterialStran } from "@/components/podatki/VijacniMaterialStran";

export const metadata: Metadata = { title: "Vijačni material | Fines - Production" };

export default function Page() {
  return <VijacniMaterialStran />;
}
