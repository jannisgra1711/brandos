import "server-only";
import type { MarketInterpretation } from "@/domain/types";
import { getConfig } from "@/server/config/env";
import { logger } from "@/server/logging/logger";
import { anthropicAnalyst } from "./anthropic-analyst";
import { heuristicAnalyst } from "./heuristic-analyst";
import type { Analyst, InterpretationInput } from "./types";

export type { Analyst, InterpretationInput } from "./types";
export { AnalystError } from "./types";

/**
 * Der Analyst mit Rückfallebene.
 *
 * Nach aussen gibt es genau einen Analysten. Ob dahinter ein Modell oder die
 * Heuristik arbeitet, entscheidet sich zur Laufzeit – und wird im Ergebnis
 * über `producedBy.degraded` transparent gemacht, statt es zu verbergen.
 *
 * Ein Modellausfall darf niemals eine Analyse verhindern. Er darf sie nur
 * konservativer machen.
 */
export function resolveAnalyst(): Analyst {
  const { ai } = getConfig();
  if (ai.mode === "heuristic") return heuristicAnalyst;
  return anthropicAnalyst.isAvailable() ? anthropicAnalyst : heuristicAnalyst;
}

export async function interpretMarket(
  input: InterpretationInput,
): Promise<MarketInterpretation> {
  const log = logger.child("ai");
  const primary = resolveAnalyst();

  if (primary.id === heuristicAnalyst.id) {
    log.debug("Heuristik aktiv", { reason: "kein Modell verfügbar oder erzwungen" });
    return heuristicAnalyst.interpret(input);
  }

  try {
    return await primary.interpret(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unbekannter Fehler";
    log.warn("Modell nicht nutzbar – Rückfall auf Heuristik", {
      analyst: primary.id,
      message,
    });

    const fallback = await heuristicAnalyst.interpret(input);
    return {
      ...fallback,
      producedBy: {
        analyst: "heuristic",
        degraded: true,
      },
      risks: [
        ...fallback.risks,
        `Modellgestützte Interpretation nicht verfügbar (${message}) – regelbasierte Auswertung verwendet.`,
      ],
    };
  }
}
