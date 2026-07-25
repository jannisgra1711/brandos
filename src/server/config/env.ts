import "server-only";

/**
 * Zentrale, einmalig validierte Konfiguration.
 *
 * Regel: `process.env` wird ausschließlich hier gelesen. So gibt es genau
 * einen Ort, an dem sichtbar ist, welche Schalter das System kennt – und
 * genau einen Ort, der beim Deployment geprüft werden muss.
 */

export type AiMode = "auto" | "anthropic" | "heuristic";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  ai: {
    mode: AiMode;
    apiKey: string | undefined;
    model: string;
  };
  providers: {
    timeoutMs: number;
    keys: {
      etsy?: string;
      pinterest?: string;
      reddit?: string;
      serpApi?: string;
      rapidApi?: string;
    };
  };
  storage: {
    dataDir: string;
  };
  logging: {
    level: LogLevel;
  };
}

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const normalized = value?.trim().toLowerCase() as T | undefined;
  return normalized && allowed.includes(normalized) ? normalized : fallback;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function load(): AppConfig {
  return {
    ai: {
      mode: readEnum(process.env.BRANDOS_AI_MODE, ["auto", "anthropic", "heuristic"], "auto"),
      apiKey: optional(process.env.ANTHROPIC_API_KEY),
      model: optional(process.env.BRANDOS_AI_MODEL) ?? "claude-opus-5",
    },
    providers: {
      timeoutMs: readInt(process.env.BRANDOS_PROVIDER_TIMEOUT_MS, 8000),
      keys: {
        etsy: optional(process.env.ETSY_API_KEY),
        pinterest: optional(process.env.PINTEREST_ACCESS_TOKEN),
        reddit: optional(process.env.REDDIT_CLIENT_ID),
        serpApi: optional(process.env.SERPAPI_KEY),
        rapidApi: optional(process.env.RAPIDAPI_KEY),
      },
    },
    storage: {
      dataDir: optional(process.env.BRANDOS_DATA_DIR) ?? ".data",
    },
    logging: {
      level: readEnum(
        process.env.BRANDOS_LOG_LEVEL,
        ["debug", "info", "warn", "error"],
        process.env.NODE_ENV === "production" ? "info" : "debug",
      ),
    },
  };
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  cached ??= load();
  return cached;
}

/** Nur für Tests. */
export function resetConfig(): void {
  cached = undefined;
}
