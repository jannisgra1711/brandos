import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAnalysis, getAnalysis, setAnalysisSaved } from "@/server/services/history-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const analysis = await getAnalysis(id);

  if (!analysis) {
    return NextResponse.json({ error: "Analyse nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ analysis });
}

const patchSchema = z.object({ saved: z.boolean() });

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Anfragekörper" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Feld 'saved' (boolean) erforderlich" }, { status: 400 });
  }

  const updated = await setAnalysisSaved(id, parsed.data.saved);
  if (!updated) {
    return NextResponse.json({ error: "Analyse nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ analysis: updated });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const removed = await deleteAnalysis(id);

  if (!removed) {
    return NextResponse.json({ error: "Analyse nicht gefunden" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
