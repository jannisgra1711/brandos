import { NextResponse } from "next/server";
import { resolveAnalyst } from "@/server/ai";
import { allProviders, dataMode, resolveProviders } from "@/server/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Betriebszustand.
 *
 * Zeigt, welche Quellen aktiv sind und welcher Analyst arbeitet – die zwei
 * Fragen, die bei einem unerwarteten Ergebnis zuerst gestellt werden.
 */
export async function GET() {
  const active = resolveProviders();

  return NextResponse.json({
    status: "ok",
    dataMode: dataMode(),
    analyst: resolveAnalyst().id,
    providers: {
      registered: allProviders().length,
      active: active.map((provider) => ({
        id: provider.id,
        label: provider.label,
        kind: provider.kind,
        capabilities: provider.capabilities,
      })),
    },
  });
}
