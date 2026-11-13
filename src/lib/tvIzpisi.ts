// Izpisi strani na FIN:TV: kode komponent v FinOS (fos_tv_viri) in opisi za okno TvPovezava.
// Lahka datoteka (brez pdf-lib) - stran jo uvozi takoj; objava je v tvObjava.ts.
import type { TvIzpis } from "@/components/TvPovezava";
import type { OddelekKoda } from "./normativi";

/** Koda komponente pregleda plana za oddelek (FinOS 025). */
export const kodaPregleda = (oddelek: OddelekKoda) => `fp_plan_pregled_${oddelek.toLowerCase()}`;
/** Koda komponente workflowa plana za oddelek (FinOS 026). */
export const kodaWorkflowa = (oddelek: OddelekKoda) => `fp_plan_workflow_${oddelek.toLowerCase()}`;
/** Koda komponente "Delo - prejšnji dan" za oddelek (FinOS 027). */
export const kodaDela = (oddelek: OddelekKoda) => `fp_delo_vceraj_${oddelek.toLowerCase()}`;
/** Koda komponente "Zaključeni krovni" za oddelek (FinOS 028). */
export const kodaZakljucenih = (oddelek: OddelekKoda) => `fp_zakljuceni_krovni_${oddelek.toLowerCase()}`;

const SYNC_POROCANO =
  "Samodejno ob vsakem uvozu Poročanega dela (Sync na strani Podatki - zjutraj in popoldan). Sync teče v brskalniku, ki ima povezano mapo izvozov iz ERP; brez synca se TV ne osveži.";

/** Zasedenost → Produktivnost. */
export const tvIzpisiProduktivnosti = (oddelek: OddelekKoda): TvIzpis[] => [
  {
    naslov: "Delo - prejšnji dan",
    koda: kodaDela(oddelek),
    vsebina:
      "Za vsako celico krog štempljanih ur prejšnjega delovnega dne proti planiranim uram iz delovnega plana (zelena do plana, rumena do +10 %, rdeča nad +10 % - krožnica čez plan je zunaj zelene), pod krogom ure po krovnih nalogih, izven plana in režija; zgoraj desno oddelek skupaj.",
    format: "PDF, ena stran 16:9 na oddelek (TV čez cel zaslon).",
    kdaj: SYNC_POROCANO,
    velja: "Samo na dan objave - naslednji dan je prazno do novega uvoza.",
    prenos: "Zavihek Plan in ure → Izvoz → PDF - delo prejšnji dan.",
  },
  {
    naslov: "Zaključeni krovni",
    koda: kodaZakljucenih(oddelek),
    vsebina: "Produktivnost krovnih nalogov iz delovnega plana, zaključenih v zadnjih 30 dneh (normativne ure ÷ štempljane ure), po celicah.",
    format: "PDF, ena stran 16:9 na celico.",
    kdaj: SYNC_POROCANO,
    velja: "7 dni od objave (vsak nov uvoz jih zamenja).",
    prenos: "Zavihek Zaključeni krovni → Izvoz → PDF - zaključeni krovni.",
  },
];

/** Zasedenost → Delovni plan. */
export const tvIzpisiDelovnegaPlana = (oddelek: OddelekKoda): TvIzpis[] => [
  {
    naslov: "Delovni plan - workflow",
    koda: kodaWorkflowa(oddelek),
    vsebina: "Workflow po delovnih mestih: koraki (krovni nalogi) po dnevih tedna.",
    format: "PDF A4 ležeče, en list na delovno mesto, za vsak teden svoje strani.",
    kdaj: "Ob vsakem Shrani plan - za vsak teden od tekočega naprej, za katerega je plan narejen (tekoči teden takoj, ostali ko so pripravljeni).",
    velja: "Strani tedna veljajo pon - ned; TV v ponedeljek sam preklopi na nov teden.",
    prenos: "Zavihek Plan → Izvoz → PDF - workflow.",
  },
  {
    naslov: "Delovni plan - pregled (roki)",
    koda: kodaPregleda(oddelek),
    vsebina: "Časovnica po celicah: krovni nalogi od začetka do roka, kosi po družinah.",
    format: "PDF A4 pokončno, en list na celico, za vsak teden svoje strani.",
    kdaj: "Ob vsakem Shrani plan (skupaj z workflowom).",
    velja: "Strani tedna veljajo pon - ned.",
    prenos: "Zavihek Plan → Izvoz → PDF - pregled (roki).",
  },
];
