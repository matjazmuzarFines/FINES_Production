import type { Metadata } from "next";
import { ChangeManagement } from "@/components/changeManagement/ChangeManagement";

export const metadata: Metadata = { title: "Change management | Fines - Production" };

export default function Page() {
  return <ChangeManagement />;
}
