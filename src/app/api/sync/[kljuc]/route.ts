import { SYNC_DATOTEKE, jeSyncKljuc } from "@/lib/syncDatoteke";
import { preberiDatoteko, preveriPrijavo } from "@/lib/syncServer";

/** Vsebina izvoza s serverja: GET /api/sync/nalogi (samo znane datoteke, brez poljubnih poti). */
export async function GET(req: Request, ctx: RouteContext<"/api/sync/[kljuc]">) {
  if (!(await preveriPrijavo(req))) return Response.json({ napaka: "Ni prijave" }, { status: 401 });
  const { kljuc } = await ctx.params;
  if (!jeSyncKljuc(kljuc)) return Response.json({ napaka: "Neznana datoteka" }, { status: 404 });
  try {
    const vsebina = await preberiDatoteko(kljuc);
    return new Response(new Uint8Array(vsebina), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${SYNC_DATOTEKE[kljuc].datoteka}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ napaka: `Datoteke ni mogoče prebrati: ${(e as Error).message}` }, { status: 502 });
  }
}
