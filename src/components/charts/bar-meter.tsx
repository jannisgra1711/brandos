import { cn } from "@/lib/cn";

/** Horizontaler Balken für Anteile und normalisierte Werte (0..100). */
export function BarMeter({
  value,
  tone = "accent",
  className,
}: {
  value: number;
  tone?: "accent" | "positive" | "warning" | "negative" | "muted";
  className?: string;
}) {
  const color = {
    accent: "var(--accent)",
    positive: "var(--positive)",
    warning: "var(--warning)",
    negative: "var(--negative)",
    muted: "var(--text-faint)",
  }[tone];

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, background: color }}
      />
    </div>
  );
}

/** Wählt die Farbe nach Bewertung – höhere Werte sind besser. */
export function toneForScore(value: number): "positive" | "accent" | "warning" | "negative" {
  if (value >= 70) return "positive";
  if (value >= 55) return "accent";
  if (value >= 40) return "warning";
  return "negative";
}
