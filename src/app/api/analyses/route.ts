import { NextResponse } from "next/server";
import { listAnalyses } from "@/server/services/history-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Historie als JSON – Grundlage für die spätere öffentliche API. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const analyses = await listAnalyses({
    limit: clampInt(params.get("limit"), 25, 1, 100),
    offset: clampInt(params.get("offset"), 0, 0, 10_000),
    savedOnly: params.get("saved") === "true",
    term: params.get("term") ?? undefined,
  });

  return NextResponse.json({ analyses });
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
