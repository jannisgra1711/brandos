import "server-only";
import { getConfig, type LogLevel } from "@/server/config/env";

/**
 * Minimaler strukturierter Logger.
 *
 * Bewusst ohne externe Abhängigkeit: BrandOS braucht heute Kontext-Präfixe
 * und Level-Filterung, nicht mehr. Die Schnittstelle ist so gewählt, dass ein
 * späterer Wechsel auf pino/OpenTelemetry keine Aufrufstelle berührt.
 */

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(scope: string): Logger;
  /** Misst die Dauer einer Operation und loggt sie auf debug-Level. */
  time<T>(label: string, fn: () => Promise<T>): Promise<T>;
}

function emit(scope: string, level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[getConfig().logging.level]) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(context ?? {}),
  };

  const line = `[${payload.ts}] ${level.toUpperCase().padEnd(5)} ${scope} – ${message}`;
  const rest = context && Object.keys(context).length > 0 ? context : undefined;

  if (level === "error") console.error(line, rest ?? "");
  else if (level === "warn") console.warn(line, rest ?? "");
  else console.log(line, rest ?? "");
}

export function createLogger(scope = "brandos"): Logger {
  return {
    debug: (message, context) => emit(scope, "debug", message, context),
    info: (message, context) => emit(scope, "info", message, context),
    warn: (message, context) => emit(scope, "warn", message, context),
    error: (message, context) => emit(scope, "error", message, context),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
    time: async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      const started = performance.now();
      try {
        return await fn();
      } finally {
        emit(scope, "debug", `${label} abgeschlossen`, {
          durationMs: Math.round(performance.now() - started),
        });
      }
    },
  };
}

export const logger = createLogger();
