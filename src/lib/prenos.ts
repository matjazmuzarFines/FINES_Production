// Prenos datotek brez knjižnice pdf-lib: uporabno tudi na straneh, ki PDF naložijo šele ob kliku.

/** Ime datoteke samo z ASCII znaki (č -> c ...), da ga razume vsak e-mail odjemalec. */
export const asciiIme = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/_$/, "");

export function prenesiDatoteko(blob: Blob, ime: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ime;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
