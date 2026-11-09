"use client";

import { useCallback, useEffect, useState } from "react";
import { NiBaze, naloziPodatke, type Podatki } from "@/lib/usposobljenost";
import { useToast } from "@/components/ui/Toast";

/** Podatki strani usposobljenosti; niBaze = skripti 034 / 035 še nista zagnani. */
export function usePodatki() {
  const notify = useToast();
  const [podatki, setPodatki] = useState<Podatki | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [niBaze, setNiBaze] = useState(false);

  const nalozi = useCallback(
    () =>
      naloziPodatke()
        .then(setPodatki)
        .catch((e: Error) => {
          if (e instanceof NiBaze) return setNiBaze(true);
          setNapaka(e.message);
          notify("error", `Napaka pri nalaganju: ${e.message}`, 10000);
        }),
    [notify],
  );

  useEffect(() => {
    nalozi();
  }, [nalozi]);

  return { podatki, napaka, niBaze, nalozi };
}
