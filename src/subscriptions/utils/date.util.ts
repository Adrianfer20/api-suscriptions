const DEFAULT_TIMEZONE = process.env.AUTOMATION_TZ || 'America/Caracas';

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatIso(parts: DateParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function getDateParts(value: Date | string, timeZone: string): DateParts {
  if (typeof value === 'string') {
    const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.trim());
    if (!match) {
      throw new Error('Invalid ISO date');
    }
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    };
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((p) => p.type === 'year')?.value || '0');
  const month = Number(parts.find((p) => p.type === 'month')?.value || '1');
  const day = Number(parts.find((p) => p.type === 'day')?.value || '1');
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function startOfDayTZ(value: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  return formatIso(getDateParts(value, timeZone));
}

export function formatDateInTimeZone(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
    return startOfDayTZ(date, timeZone);
}

export function addMonthsTZ(value: Date | string, months = 1, timeZone = DEFAULT_TIMEZONE): string {
  const base = getDateParts(value, timeZone);
  const totalMonths = base.year * 12 + (base.month - 1) + months;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = ((totalMonths % 12) + 12) % 12 + 1;
  const maxDay = daysInMonth(newYear, newMonth);
  const newDay = Math.min(base.day, maxDay);
  return formatIso({ year: newYear, month: newMonth, day: newDay });
}

export function addDaysTZ(value: Date | string, days: number, timeZone = DEFAULT_TIMEZONE): string {
  const inputString = typeof value === 'string' ? value : formatIso(getDateParts(value, timeZone));
  // Parse as UTC to avoid DST issues when doing simple math
  const date = new Date(`${inputString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

