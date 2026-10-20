import { eachDay, formatISODate, reiwaYear } from "@/lib/date";

export interface Period {
  start: Date;
  end: Date;
  dates: Date[];
}

export function periodBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 2, 21);
  const end = new Date(year, month - 1, 20);
  return { start, end };
}

export function getPeriod(year: number, month: number): Period {
  const { start, end } = periodBounds(year, month);
  return { start, end, dates: eachDay(start, end) };
}

export function formatPeriodLabel(year: number, month: number): string {
  const { start, end } = periodBounds(year, month);
  return `${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}`;
}

export function formatClosingTitle(year: number, month: number): string {
  return `令和${reiwaYear(year)}年${month}月分`;
}

export function defaultClosing(today = new Date()): { year: number; month: number } {
  let year = today.getFullYear();
  let month = today.getMonth() + 1;
  if (today.getDate() >= 21) {
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return { year, month };
}

export function shiftClosing(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const cursor = new Date(year, month - 1 + delta, 1);
  return { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
}

export function periodDateSet(year: number, month: number): string[] {
  return getPeriod(year, month).dates.map(formatISODate);
}
