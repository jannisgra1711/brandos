/**
 * Zahlformate für die deutschsprachigen Texte der Domain.
 *
 * Warum hier und nicht in `lib/format`? Weil Scoring, Ideengenerator und
 * Analyst fertige Sätze erzeugen, die bereits Zahlen enthalten. Diese Sätze
 * entstehen serverseitig und müssen dieselbe Schreibweise verwenden wie die
 * Oberfläche – sonst stehen "36.2 Tsd." und "36,2 Tsd." nebeneinander auf
 * derselben Seite.
 *
 * `lib/format` bleibt für die UI zuständig; beide nutzen dieselbe Locale.
 */

const LOCALE = "de-DE";

export function de(value: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Faktor 0.124 → "+12,4 %" */
export function dePercent(value: number, decimals = 1): string {
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${de(pct, decimals)} %`;
}

/** Anteil 68.2 → "68 %" (kein Vorzeichen) */
export function deShare(value: number, decimals = 0): string {
  return `${de(value, decimals)} %`;
}

/** 36200 → "36,2 Tsd." */
export function deCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${de(value / 1_000_000, 1)} Mio.`;
  if (Math.abs(value) >= 1_000) return `${de(value / 1_000, 1)} Tsd.`;
  return de(value);
}

export function deCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
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

export function deMonth(month: number): string {
  return MONTHS[(month - 1 + 12) % 12] ?? "";
}
