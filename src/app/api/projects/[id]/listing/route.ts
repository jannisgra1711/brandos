import { NextResponse } from "next/server";
import { z } from "zod";
import { ETSY_LIMITS } from "@/domain/types";
import { editListing, generateListing } from "@/server/services/project-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Erzeugt den Entwurf neu und ersetzt einen bestehenden vollständig. */
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const project = await generateListing(id);

  if (!project) {
    return NextResponse.json({ error: "Vorhaben nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

/**
 * Etsys Grenzen gelten auch für Handänderungen.
 *
 * Ein zu langer Titel liesse sich hier speichern und scheiterte erst beim
 * Einstellen – also lieber sofort ablehnen. Die Kategorie fehlt bewusst: Sie
 * ist gemessen, und ein frei getipptes Kategoriefeld ohne Etsys Baum wäre
 * schlechter als der Messwert.
 */
const editSchema = z
  .object({
    title: z.string().trim().min(1).max(ETSY_LIMITS.titleMaxLength),
    tags: z
      .array(z.string().trim().min(1).max(ETSY_LIMITS.tagMaxLength))
      .max(ETSY_LIMITS.maxTags),
    description: z.string().max(50_000).transform((v) => v.trim() || undefined),
    price: z.object({
      value: z.number().positive().max(1_000_000),
      currency: z.string().trim().length(3),
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

  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Unzulässige Werte" },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Keine Änderung angegeben" }, { status: 400 });
  }

  const result = await editListing(id, parsed.data);

  if (result === undefined) {
    return NextResponse.json({ error: "Vorhaben nicht gefunden" }, { status: 404 });
  }
  if (result === "no-listing") {
    return NextResponse.json(
      { error: "Für dieses Vorhaben gibt es noch keinen Entwurf" },
      { status: 409 },
    );
  }

  return NextResponse.json({ project: result });
}
