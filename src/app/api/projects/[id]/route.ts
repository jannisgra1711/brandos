import { NextResponse } from "next/server";
import { z } from "zod";
import { PROJECT_STATUSES } from "@/domain/types";
import { deleteProject, getProject, updateProject } from "@/server/services/project-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const project = await getProject(id);

  if (!project) {
    return NextResponse.json({ error: "Vorhaben nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

/**
 * Nur die bearbeitbaren Felder stehen im Schema. `origin`, `analysisId` und
 * die Zeitstempel fehlen bewusst – sie beschreiben, woher das Vorhaben kommt,
 * nicht was daraus wird. Das Repository schützt sie zusätzlich.
 */
const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    status: z.enum(PROJECT_STATUSES),
    // Leerer Text löscht die Notiz – sonst liesse sie sich nie wieder entfernen.
    notes: z.string().max(10_000).transform((v) => v.trim() || undefined),
    composition: z.object({
      niche: z.string().trim().min(1).max(200),
      productType: z.string().trim().min(1).max(200),
      audience: z.string().trim().min(1).max(200),
      emotion: z.string().trim().min(1).max(200),
      style: z.string().trim().min(1).max(200),
      differentiator: z.string().trim().min(1).max(200),
    }),
  })
  .partial();

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
    return NextResponse.json({ error: "Unzulässige Felder oder Werte" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Keine Änderung angegeben" }, { status: 400 });
  }

  const updated = await updateProject(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Vorhaben nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ project: updated });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const removed = await deleteProject(id);

  if (!removed) {
    return NextResponse.json({ error: "Vorhaben nicht gefunden" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
