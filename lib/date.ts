const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function weekdayIndex(date: Date): number {
  return date.getDay();
}

export function weekdayLabel(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

export function reiwaYear(year: number): number {
  return year - 2018;
}

export function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}
