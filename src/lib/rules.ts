// Which tax years the app can compute, and how to get their rules.
import { RULES_2025, type YearRules } from "./rules2025.ts";
import { RULES_2024 } from "./rules2024.ts";

export type { YearRules, ProvinceCode, ProvinceRules, Bracket } from "./rules2025.ts";
export { taxOn, marginalRate, round2 } from "./rules2025.ts";

const BY_YEAR: Record<number, YearRules> = { 2025: RULES_2025, 2024: RULES_2024 };

/** Newest first. */
export const SUPPORTED_YEARS = Object.keys(BY_YEAR).map(Number).sort((a, b) => b - a);
export const LATEST_YEAR = SUPPORTED_YEARS[0];

/** Rules for a year; an unsupported year falls back to the latest so the app still works, and the UI warns. */
export function getRules(year: number): YearRules {
  return BY_YEAR[year] ?? BY_YEAR[LATEST_YEAR];
}
export const isSupportedYear = (year: number) => year in BY_YEAR;
