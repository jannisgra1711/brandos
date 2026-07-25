import "server-only";
import type { AnalysisSummary, MarketAnalysis } from "@/domain/types";
import { getAnalysisRepository, type ListOptions } from "@/server/repositories";

/**
 * Zugriff auf früher durchgeführte Analysen.
 *
 * Dünne Schicht über dem Repository – sie existiert, damit die
 * API-Endpunkte nicht direkt gegen die Persistenz sprechen und spätere
 * Erweiterungen (Nutzerbindung, Rechte, Mandanten) genau hier andocken.
 */

export function listAnalyses(options: ListOptions = {}): Promise<AnalysisSummary[]> {
  return getAnalysisRepository().list(options);
}

export function getAnalysis(id: string): Promise<MarketAnalysis | undefined> {
  return getAnalysisRepository().findById(id);
}

export function getAnalysisSummary(id: string): Promise<AnalysisSummary | undefined> {
  return getAnalysisRepository().findSummaryById(id);
}

export function setAnalysisSaved(id: string, saved: boolean): Promise<AnalysisSummary | undefined> {
  return getAnalysisRepository().setSaved(id, saved);
}

export function deleteAnalysis(id: string): Promise<boolean> {
  return getAnalysisRepository().remove(id);
}
