import type { Rng } from "../util/seeded-random";
import { ProviderError } from "../types";
import type { ProviderContext } from "../types";
import type { SourceId } from "@/domain/types";

/**
 * Gemeinsames Verhalten aller Mock-Provider.
 *
 * Die Mocks simulieren bewusst auch die unangenehmen Eigenschaften echter
 * Quellen – Latenz, gelegentliche Ausfälle, unterschiedliche Datenaktualität.
 * Nur so ist der Aggregator gegen genau diese Fälle getestet, bevor die
 * erste echte API angebunden wird.
 */

export async function simulateLatency(
  rng: Rng,
  context: ProviderContext,
  source: SourceId,
  minMs: number,
  maxMs: number,
): Promise<void> {
  const delay = Math.round(rng.range(minMs, maxMs));

  await new Promise<void>((resolve, reject) => {
    if (context.signal.aborted) {
      reject(new ProviderError(source, `${source}: Anfrage vor dem Start abgebrochen`));
      return;
    }

    const timer = setTimeout(() => {
      context.signal.removeEventListener("abort", onAbort);
      resolve();
    }, delay);

    function onAbort() {
      clearTimeout(timer);
      reject(new ProviderError(source, `${source}: Zeitüberschreitung nach ${delay} ms`));
    }

    context.signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Verrauscht einen Wert leicht, damit Quellen sich nicht exakt gleichen. */
export function jitter(rng: Rng, value: number, relative = 0.06): number {
  return value * rng.gaussian(1, relative);
}

/** Simuliert einen sporadischen Quellenausfall. */
export function maybeFail(rng: Rng, source: SourceId, probability: number, reason: string): void {
  if (rng.chance(probability)) {
    throw new ProviderError(source, `${source}: ${reason}`);
  }
}
