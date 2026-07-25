import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/server/logging/logger";
import { analyzeMarket } from "@/server/services/research-service";

/**
 * Startet eine Analyse.
 *
 * Der Endpunkt existiert, weil die Recherche vom Client aus angestoßen wird
 * und dort einen expliziten Ladezustand braucht. Die Antwort ist bewusst
 * schlank – die vollständige Analyse liefert die Detailseite serverseitig.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  term: z.string().trim().min(2, "Bitte mindestens zwei Zeichen eingeben").max(80),
  category: z.string().trim().max(60).optional(),
  market: z.string().trim().length(2).optional(),
  ideaCount: z.number().int().min(1).max(8).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Anfragekörper" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
      { status: 400 },
    );
  }

  try {
    const analysis = await analyzeMarket(
      {
        term: parsed.data.term,
        category: parsed.data.category,
        market: parsed.data.market,
      },
      { ideaCount: parsed.data.ideaCount, signal: request.signal },
    );

    return NextResponse.json({
      id: analysis.id,
      term: analysis.query.term,
      score: analysis.score.value,
      grade: analysis.score.grade,
      durationMs: analysis.durationMs,
      analyst: analysis.interpretation.producedBy.analyst,
    });
  } catch (error) {
    logger.child("api").error("Analyse fehlgeschlagen", {
      term: parsed.data.term,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Die Analyse konnte nicht abgeschlossen werden. Bitte erneut versuchen." },
      { status: 500 },
    );
  }
}
