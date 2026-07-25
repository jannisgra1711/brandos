import type { SeasonalitySignal } from "@/domain/types";
import { monthShort } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Saisonverlauf als Monatsraster.
 *
 * Peak-Monate werden farblich hervorgehoben, weil sie die Handlungsfrage
 * beantworten ("wann muss ich fertig sein?") – der Rest bleibt zurückhaltend.
 */
export function SeasonalityChart({
  seasonality,
  currentMonth,
  className,
}: {
  seasonality: SeasonalitySignal;
  currentMonth: number;
  className?: string;
}) {
  const max = Math.max(...seasonality.monthlyIndex, 1);

  return (
    <div className={cn("flex items-end gap-1.5", className)}>
      {seasonality.monthlyIndex.map((value, index) => {
        const month = index + 1;
        const isPeak = seasonality.peakMonths.includes(month);
        const isCurrent = month === currentMonth;
        const heightPct = Math.max(8, (value / max) * 100);

        return (
          <div key={month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-24 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-t-sm transition-colors",
                  isPeak ? "bg-accent" : "bg-border-strong",
                  isCurrent && !isPeak && "bg-text-faint",
                )}
                style={{ height: `${heightPct}%` }}
                title={`${monthShort(month)}: Index ${value.toFixed(2)}`}
              />
            </div>
            <span
              className={cn(
                "text-[10px] tabular-nums",
                isCurrent ? "font-semibold text-text" : "text-faint",
              )}
            >
              {monthShort(month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
