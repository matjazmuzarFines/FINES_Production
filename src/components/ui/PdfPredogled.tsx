"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { prenesiDatoteko } from "@/lib/prenos";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ErrorText, Loading } from "./Notice";
import { useToast } from "./Toast";

/**
 * Standardni predogled PDF: okno s pripravljenim PDF ter gumboma Prenesi PDF in Natisni v nogi.
 * Komponenta se izriše samo, ko je predogled odprt (PDF se pripravi enkrat ob odprtju).
 */
export function PdfPredogled({
  naslov,
  pripravi,
  imeDatoteke,
  onClose,
}: {
  naslov: string;
  pripravi: () => Promise<Blob>;
  /** Ime datoteke samo z ASCII znaki. */
  imeDatoteke: string;
  onClose: () => void;
}) {
  const notify = useToast();
  const [priprava] = useState(pripravi);
  const [pdf, setPdf] = useState<{ blob: Blob; url: string } | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const okvir = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let url: string | null = null;
    let preklic = false;
    priprava
      .then((blob) => {
        if (preklic) return;
        url = URL.createObjectURL(blob);
        setPdf({ blob, url });
      })
      .catch((e) => {
        if (!preklic) setNapaka((e as Error).message);
      });
    return () => {
      preklic = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [priprava]);

  function natisni() {
    try {
      okvir.current!.contentWindow!.focus();
      okvir.current!.contentWindow!.print();
    } catch {
      // brskalnik ne dovoli tiska iz okvirja: PDF se odpre v novem zavihku
      if (pdf && !window.open(pdf.url, "_blank")) notify("error", "Tiska ni bilo mogoče odpreti. Prenesi PDF.");
    }
  }

  return (
    <Modal
      open
      title={naslov}
      onClose={onClose}
      sirina="max-w-5xl"
      noga={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="primary" icon={Download} disabled={!pdf} hint="Prenesi prikazani dokument kot PDF" onClick={() => pdf && prenesiDatoteko(pdf.blob, imeDatoteke)}>
            Prenesi PDF
          </Button>
          <Button variant="primary" icon={Printer} disabled={!pdf} hint="Natisni dokument na izbran tiskalnik" onClick={natisni}>
            Natisni
          </Button>
        </div>
      }
    >
      {napaka && <ErrorText>PDF ni uspel: {napaka}</ErrorText>}
      {!napaka && !pdf && <Loading />}
      {pdf && (
        <>
          <iframe ref={okvir} src={pdf.url} title={naslov} className="h-[68vh] w-full rounded border border-ink-200 max-sm:hidden" />
          <p className="text-sm text-ink-600 sm:hidden">Na telefonu dokument odpreš s klikom na Prenesi PDF.</p>
        </>
      )}
    </Modal>
  );
}
