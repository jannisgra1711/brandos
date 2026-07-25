import "server-only";
import type { Capability, SourceId } from "@/domain/types";
import { logger } from "@/server/logging/logger";
import { googleTrendsProvider } from "./live/google-trends";
import { amazonMockProvider } from "./mock/amazon-mock";
import { etsyMockProvider } from "./mock/etsy-mock";
import { googleTrendsMockProvider } from "./mock/google-trends-mock";
import { pinterestMockProvider } from "./mock/pinterest-mock";
import { redditMockProvider } from "./mock/reddit-mock";
import { tiktokMockProvider } from "./mock/tiktok-mock";
import type { DataProvider } from "./types";

/**
 * Provider-Registry.
 *
 * Einziger Ort, an dem konkrete Datenquellen bekannt sind. Services fragen
 * ausschließlich nach *Fähigkeiten*, nie nach Anbietern.
 *
 * Auflösungsregel je Quelle: die verfügbare Live-Implementierung gewinnt,
 * sonst übernimmt der Mock. Damit ist der Übergang von synthetisch zu echt
 * ein Konfigurationsschritt, keine Code-Änderung.
 */

const registry = new Map<string, DataProvider>();

export function registerProvider(provider: DataProvider): void {
  registry.set(`${provider.id}:${provider.kind}`, provider);
}

// Mock-Provider bilden die Grundausstattung. Live-Provider werden hier
// zusätzlich registriert, sobald sie implementiert sind.
[
  googleTrendsProvider,
  googleTrendsMockProvider,
  etsyMockProvider,
  redditMockProvider,
  pinterestMockProvider,
  amazonMockProvider,
  tiktokMockProvider,
].forEach(registerProvider);

/** Alle registrierten Provider – inklusive derzeit nicht verfügbarer. */
export function allProviders(): DataProvider[] {
  return [...registry.values()];
}

/**
 * Die tatsächlich einzusetzenden Provider: pro Quelle genau einer,
 * Live bevorzugt.
 */
export function resolveProviders(): DataProvider[] {
  const bySource = new Map<SourceId, DataProvider>();

  for (const provider of registry.values()) {
    if (!provider.isAvailable()) continue;

    const current = bySource.get(provider.id);
    if (!current) {
      bySource.set(provider.id, provider);
      continue;
    }

    const incomingWins =
      (provider.kind === "live" && current.kind === "mock") ||
      (provider.kind === current.kind && provider.priority > current.priority);

    if (incomingWins) bySource.set(provider.id, provider);
  }

  const resolved = [...bySource.values()].sort((a, b) => b.priority - a.priority);

  logger.child("registry").debug("Provider aufgelöst", {
    count: resolved.length,
    live: resolved.filter((p) => p.kind === "live").map((p) => p.id),
    mock: resolved.filter((p) => p.kind === "mock").map((p) => p.id),
  });

  return resolved;
}

/** Provider, die eine bestimmte Fähigkeit abdecken. */
export function providersFor(capability: Capability): DataProvider[] {
  return resolveProviders().filter((p) => p.capabilities.includes(capability));
}

/** Betriebsmodus der Datenschicht – wird im UI transparent angezeigt. */
export function dataMode(): "live" | "mixed" | "mock" {
  const resolved = resolveProviders();
  const live = resolved.filter((p) => p.kind === "live").length;
  if (live === 0) return "mock";
  if (live === resolved.length) return "live";
  return "mixed";
}
