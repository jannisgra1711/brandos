/**
 * Darstellungsformate.
 *
 * Zentral, damit dieselbe Zahl im Dashboard und in der Analyse identisch
 * aussieht. Bewusst mit fester Locale: gemischte Formate in einer Oberfläche
 * wirken unsauber, und die Inhalte sind ohnehin deutschsprachig.
 */

const LOCALE = "de-DE";

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Kompakt: 12.400 → "12,4 Tsd." */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} Mio.`;
  if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 1)} Tsd.`;
  return formatNumber(value);
}

/** Faktor 0.124 → "+12,4 %" */
export function formatPercent(value: number, decimals = 1): string {
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${formatNumber(pct, decimals)} %`;
}

/** Anteil 0..100 → "62 %" (ohne Vorzeichen) */
export function formatScore(value: number, decimals = 0): string {
  return `${formatNumber(value, decimals)} %`;
}

export function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** "vor 3 Stunden" – relative Zeit für Listenansichten. */
export function formatRelative(iso: string, now = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return "gerade eben";
}

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function monthName(month: number): string {
  return MONTHS[(month - 1 + 12) % 12] ?? "";
}

export function monthShort(month: number): string {
  return monthName(month).slice(0, 3);
}
