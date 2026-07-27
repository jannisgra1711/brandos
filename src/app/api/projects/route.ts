import { NextResponse } from "next/server";
import { z } from "zod";
import { PROJECT_STATUSES } from "@/domain/types";
import { createProjectFromIdea, listProjects } from "@/server/services/project-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const status = params.get("status");

  const projects = await listProjects({
    limit: clampInt(params.get("limit"), 50, 1, 200),
    offset: clampInt(params.get("offset"), 0, 0, 10_000),
    status: isStatus(status) ? status : undefined,
    includeDiscarded: params.get("discarded") === "true",
  });

  return NextResponse.json({ projects });
}

const createSchema = z.object({
  analysisId: z.string().min(1),
  ideaId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
});

/** Übernimmt eine Idee als Vorhaben. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Anfragekörper" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Felder 'analysisId' und 'ideaId' erforderlich" },
      { status: 400 },
    );
  }

  const result = await createProjectFromIdea(parsed.data);

  // Beide Fehlschläge sind 404, aber nicht derselbe – die Meldung muss sagen,
  // was fehlt, sonst sucht der Aufrufer an der falschen Stelle.
  if (result === "analysis-not-found") {
    return NextResponse.json({ error: "Analyse nicht gefunden" }, { status: 404 });
  }
  if (result === "idea-not-found") {
    return NextResponse.json({ error: "Idee nicht in dieser Analyse" }, { status: 404 });
  }

  return NextResponse.json({ project: result }, { status: 201 });
}

function isStatus(value: string | null): value is (typeof PROJECT_STATUSES)[number] {
  return PROJECT_STATUSES.includes(value as (typeof PROJECT_STATUSES)[number]);
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
