import { cn } from "@/lib/cn";

/**
 * Sparkline.
 *
 * Bewusst ohne Chart-Bibliothek: eine Polyline mit Fläche braucht keine
 * 40 kB Laufzeit, rendert serverseitig und bleibt vollständig über die
 * Design-Tokens gestylt.
 */
export function Sparkline({
  values,
  tone = "accent",
  className,
  width = 120,
  height = 36,
}: {
  values: readonly number[];
  tone?: "accent" | "positive" | "negative" | "muted";
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <div className={cn("h-9 w-full rounded bg-bg-subtle", className)} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padding = 2;
  const stepX = (width - padding * 2) / (values.length - 1);

  const points = values.map((value, index) => {
    const x = padding + index * stepX;
    const y = padding + (1 - (value - min) / span) * (height - padding * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${points.at(-1)?.[0].toFixed(2)},${height} L${points[0]?.[0].toFixed(2)},${height} Z`;

  const stroke = {
    accent: "var(--accent)",
    positive: "var(--positive)",
    negative: "var(--negative)",
    muted: "var(--text-faint)",
  }[tone];

  const gradientId = `spark-${tone}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-9 w-full", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
