import type { ReactNode } from "react";
import type { OpportunityGrade, TrendDirection } from "@/domain/types";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "positive" | "warning" | "negative";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-bg-subtle text-muted",
  accent: "border-transparent bg-accent-soft text-accent",
  positive: "border-transparent bg-positive-soft text-positive",
  warning: "border-transparent bg-warning-soft text-warning",
  negative: "border-transparent bg-negative-soft text-negative",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Note des Opportunity Scores – die Farbe trägt die Aussage. */
export function GradeBadge({ grade, className }: { grade: OpportunityGrade; className?: string }) {
  const tone: Tone = grade === "A" ? "positive" : grade === "B" ? "accent" : grade === "C" ? "warning" : "negative";
  const label = {
    A: "Starke Chance",
    B: "Tragfähig",
    C: "Grenzfall",
    D: "Zurückhaltung",
  }[grade];

  return (
    <Badge tone={tone} className={className}>
      <span className="font-semibold">{grade}</span>
      <span className="text-[11px] font-normal opacity-80">{label}</span>
    </Badge>
  );
}

const DIRECTIONS: Record<TrendDirection, { label: string; tone: Tone }> = {
  rising: { label: "steigend", tone: "positive" },
  stable: { label: "stabil", tone: "neutral" },
  declining: { label: "fallend", tone: "negative" },
  volatile: { label: "schwankend", tone: "warning" },
};

export function TrendBadge({ direction }: { direction: TrendDirection }) {
  const config = DIRECTIONS[direction];
  return <Badge tone={config.tone}>{config.label}</Badge>;
}
