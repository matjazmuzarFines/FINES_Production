// Delno iskanje besedila (standard): vnos se razdeli na besede, zadetek mora vsebovati vse besede
// v poljubnem vrstnem redu in kjerkoli, brez razlikovanja velikih črk in šumnikov ("pec" najde "Peč").

const normaliziraj = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** true, če vrednosti (skupaj) vsebujejo vse besede iskanja; prazno iskanje = vse ustreza. */
export function ujemaIskanje(iskanje: string, vrednosti: (string | number | null | undefined)[]): boolean {
  const besede = normaliziraj(iskanje).split(/\s+/).filter(Boolean);
  if (!besede.length) return true;
  const besedilo = normaliziraj(vrednosti.filter((v) => v !== null && v !== undefined).join(" "));
  return besede.every((b) => besedilo.includes(b));
}
