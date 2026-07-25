import "server-only";
import { randomUUID } from "node:crypto";
import { scoreOpportunity } from "@/domain/scoring";
import type { MarketAnalysis, MarketQuery } from "@/domain/types";
import { interpretMarket } from "@/server/ai";
import { logger } from "@/server/logging/logger";
import { collectSignals } from "@/server/providers/aggregator";
import { getAnalysisRepository } from "@/server/repositories";

/**
 * Der zentrale Anwendungsfall: aus einem Suchbegriff eine Analyse machen.
 *
 * Die Pipeline hat vier Schritte in fester Reihenfolge:
 *
 *   1. Sammeln    – Provider liefern Signale (Teilausfälle sind erlaubt)
 *   2. Bewerten   – deterministischer Opportunity Score
 *   3. Deuten     – Modell oder Heuristik interpretiert Signale und Score
 *   4. Sichern    – Ergebnis wird persistiert
 *
 * Die Reihenfolge ist nicht beliebig: die Interpretation kennt den Score,
 * nicht umgekehrt. So bleibt die Zahl reproduzierbar und die Erklärung
 * konsistent zu ihr.
 */

export interface AnalyzeOptions {
  /** Anzahl der zu erzeugenden Produktideen. */
  ideaCount?: number;
  /** Abbruch durch den Client. */
  signal?: AbortSignal;
  /** Wenn false, wird das Ergebnis nicht persistiert (z. B. für Discovery). */
  persist?: boolean;
  now?: Date;
}

export async function analyzeMarket(
  input: MarketQuery,
  options: AnalyzeOptions = {},
): Promise<MarketAnalysis> {
  const log = logger.child("research");
  const started = performance.now();
  const now = options.now ?? new Date();

  const query: MarketQuery = {
    term: input.term.trim(),
    category: input.category?.trim() || undefined,
    market: input.market?.trim().toUpperCase() || "DE",
    windowMonths: input.windowMonths ?? 24,
  };

  if (!query.term) {
    throw new Error("Suchbegriff darf nicht leer sein");
  }

  log.info("Analyse gestartet", { term: query.term, market: query.market });

  const signals = await collectSignals(query, { now, signal: options.signal });
  const score = scoreOpportunity(signals, { now });
  const interpretation = await interpretMarket({
    signals,
    score,
    ideaCount: options.ideaCount ?? 4,
  });

  const analysis: MarketAnalysis = {
    id: randomUUID(),
    query,
    createdAt: now.toISOString(),
    durationMs: Math.round(performance.now() - started),
    signals,
    score,
    interpretation,
  };

  if (options.persist !== false) {
    await getAnalysisRepository().save(analysis);
  }

  log.info("Analyse abgeschlossen", {
    id: analysis.id,
    term: query.term,
    score: score.value,
    grade: score.grade,
    analyst: interpretation.producedBy.analyst,
    durationMs: analysis.durationMs,
  });

  return analysis;
}
