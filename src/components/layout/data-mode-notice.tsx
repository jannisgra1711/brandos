import { Database } from "lucide-react";
import type { DashboardOverview } from "@/domain/types";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<DashboardOverview["dataMode"], { text: string; tone: "positive" | "warning" | "neutral" }> = {
  live: { text: "Live-Daten", tone: "positive" },
  mixed: { text: "Teilweise Live-Daten", tone: "warning" },
  mock: { text: "Synthetische Daten", tone: "neutral" },
};

/**
 * Betriebsmodus der Datenschicht.
 *
 * Dauerhaft sichtbar, nicht versteckt: Wer eine Entscheidung auf diese Zahlen
 * stützt, muss jederzeit wissen, ob sie aus echten Quellen stammen.
 */
export function DataModeNotice({ mode }: { mode: DashboardOverview["dataMode"] }) {
  const config = LABELS[mode];
  return (
    <Badge tone={config.tone}>
      <Database size={12} strokeWidth={2.2} />
      {config.text}
    </Badge>
  );
}
