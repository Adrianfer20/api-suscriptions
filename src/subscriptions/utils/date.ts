export function addMonthsToIsoDate(dateIso?: string, months = 1): string {
  const base = dateIso ? new Date(dateIso) : new Date();
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  // Normalize to YYYY-MM-DD
  return next.toISOString().split('T')[0];
}
