import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/Notice";

export const metadata: Metadata = { title: "Zasedenost | Fines - Production" };

export default function Page() {
  return (
    <ComingSoon
      title="Zasedenost"
      opis="Pregled zasedenosti delovnih mest. Zavihek bo izdelan, ko bo rutina v celoti delovala."
    />
  );
}
