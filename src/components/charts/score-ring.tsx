import type { OpportunityGrade } from "@/domain/types";
import { cn } from "@/lib/cn";

const GRADE_COLOR: Record<OpportunityGrade, string> = {
  A: "var(--grade-a)",
  B: "var(--grade-b)",
  C: "var(--grade-c)",
  D: "var(--grade-d)",
};

/**
 * Der Opportunity Score als Ring.
 *
 * Der zweite, dünnere Innenring zeigt die Konfidenz. Beide Werte gehören
 * zusammen: ein Score ohne Vertrauensangabe verleitet zu Fehlentscheidungen.
 */
export function ScoreRing({
  value,
  grade,
  confidence,
  size = 132,
  className,
}: {
  value: number;
  grade: OpportunityGrade;
  confidence: number;
  size?: number;
  className?: string;
}) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(Math.max(value, 0), 100) / 100) * circumference;

  const innerRadius = radius - stroke - 4;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const innerDash = Math.min(Math.max(confidence, 0), 1) * innerCircumference;

  const color = GRADE_COLOR[grade];

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="3"
          opacity="0.6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          fill="none"
          stroke="var(--text-faint)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${innerDash} ${innerCircumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums text-text">{Math.round(value)}</span>
        <span className="text-xs text-muted">von 100</span>
      </div>
    </div>
  );
}
