import type { Metadata } from "next";
import { Zasedenost } from "@/components/zasedenost/Zasedenost";

export const metadata: Metadata = { title: "Zasedenost | Fines - Production" };

export default function Page() {
  return <Zasedenost />;
}
