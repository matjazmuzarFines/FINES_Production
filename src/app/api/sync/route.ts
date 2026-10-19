import { SYNC_DATOTEKE, jeSyncKljuc } from "@/lib/syncDatoteke";
import { infoDatoteke, preveriPrijavo } from "@/lib/syncServer";

/** Stanje izvozov na serverju: GET /api/sync?datoteke=nalogi,narocila (brez parametra vse). */
export async function GET(req: Request) {
  if (!(await preveriPrijavo(req))) return Response.json({ napaka: "Ni prijave" }, { status: 401 });
  const izbrane = new URL(req.url).searchParams.get("datoteke")?.split(",").filter(jeSyncKljuc) ?? [];
  const kljuci = izbrane.length ? izbrane : (Object.keys(SYNC_DATOTEKE) as (keyof typeof SYNC_DATOTEKE)[]);
  return Response.json({ datoteke: await Promise.all(kljuci.map(infoDatoteke)) });
}
