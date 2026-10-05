import { useEffect } from "react";

// Globalna zastavica za neshranjene spremembe (rutina).
// Gumb Nazaj in navigacija pred odhodom vprašata za potrditev.

let neshranjeno = false;

export function nastaviNeshranjeno(v: boolean) {
  neshranjeno = v;
}

/** true = lahko zapustimo stran (ni sprememb ali je uporabnik potrdil). */
export function lahkoZapustim(): boolean {
  if (!neshranjeno) return true;
  const ok = window.confirm("Imaš neshranjene spremembe. Jih želiš zavreči?");
  if (ok) neshranjeno = false;
  return ok;
}

/** Komponenta s spremembami javi stanje; ob zapiranju zavihka brskalnik opozori. */
export function useNeshranjeno(imaSpremembe: boolean) {
  useEffect(() => {
    nastaviNeshranjeno(imaSpremembe);
    if (!imaSpremembe) return;
    const opozori = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", opozori);
    return () => {
      window.removeEventListener("beforeunload", opozori);
      nastaviNeshranjeno(false);
    };
  }, [imaSpremembe]);
}
