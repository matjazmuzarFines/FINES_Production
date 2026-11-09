import type { Metadata } from "next";
import { MatrikaUsposobljenosti } from "@/components/usposobljenost/Matrika";

export const metadata: Metadata = { title: "Matrika usposobljenosti | Fines - Production" };

export default function Page() {
  return <MatrikaUsposobljenosti />;
}
