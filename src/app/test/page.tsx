import type { Metadata } from "next";
import { TestSync } from "@/components/TestSync";

export const metadata: Metadata = { title: "Test sync | Fines - Production" };

export default function Page() {
  return <TestSync />;
}
