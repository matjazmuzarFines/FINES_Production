import type { Metadata } from "next";
import { Doizdaja } from "@/components/skladisce/Doizdaja";

export const metadata: Metadata = { title: "Doizdaja materiala | Fines - Production" };

export default function Page() {
  return <Doizdaja />;
}
