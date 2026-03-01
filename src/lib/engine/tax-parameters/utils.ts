/**
 * Tax Parameter Utilities
 * Helper functions for tax year extraction and parameter lookups.
 */

/**
 * Extracts the tax year from a fiscal year end date string.
 * For calendar-year filers (12/31), this is the year itself.
 * For fiscal-year filers, the tax year is the year in which the fiscal year ends.
 */
export function getTaxYear(fiscalYearEnd: string): number {
  const date = new Date(fiscalYearEnd);
  if (isNaN(date.getTime())) {
    // Fallback: try to parse just the year portion
    const yearMatch = fiscalYearEnd.match(/(\d{4})/);
    if (yearMatch) return parseInt(yearMatch[1], 10);
    return new Date().getFullYear();
  }
  return date.getFullYear();
}

/**
 * Checks whether a sunset date has passed for a given tax year.
 * A parameter is sunset if the sunset date is before the END of the tax year.
 */
export function isSunsetForYear(sunsetDate: string | undefined | null, taxYear: number): boolean {
  if (!sunsetDate) return false;
  const sunset = new Date(sunsetDate);
  const yearEnd = new Date(`${taxYear}-12-31`);
  return sunset < yearEnd;
}

/**
 * Calculate days remaining until a sunset date from a reference date.
 */
export function daysUntilSunset(sunsetDate: string, referenceDate?: string): number {
  const sunset = new Date(sunsetDate);
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const diff = sunset.getTime() - ref.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
