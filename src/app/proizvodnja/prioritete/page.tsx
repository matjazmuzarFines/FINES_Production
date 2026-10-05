import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/Notice";

export const metadata: Metadata = { title: "Prioritete | Fines - Production" };

export default function Page() {
  return (
    <ComingSoon
      title="Prioritete"
      opis="Prioritete proizvodnih nalogov. Zavihek bo izdelan, ko bo rutina v celoti delovala."
    />
  );
}
