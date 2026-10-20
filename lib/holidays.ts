import { formatISODate, parseISODate, weekdayIndex } from "@/lib/date";

const FIXED: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "元日" },
  { month: 2, day: 11, name: "建国記念の日" },
  { month: 2, day: 23, name: "天皇誕生日" },
  { month: 4, day: 29, name: "昭和の日" },
  { month: 5, day: 3, name: "憲法記念日" },
  { month: 5, day: 4, name: "みどりの日" },
  { month: 5, day: 5, name: "こどもの日" },
  { month: 8, day: 11, name: "山の日" },
  { month: 11, day: 3, name: "文化の日" },
  { month: 11, day: 23, name: "勤労感謝の日" },
];

const cache = new Map<number, Map<string, string>>();

function iso(year: number, month: number, day: number): string {
  return formatISODate(new Date(year, month - 1, day));
}

function shiftIso(value: string, days: number): string {
  const date = parseISODate(value);
  date.setDate(date.getDate() + days);
  return formatISODate(date);
}

function nthMonday(year: number, month: number, n: number): string {
  const first = new Date(year, month - 1, 1);
  const offset = (1 - first.getDay() + 7) % 7;
  return iso(year, month, 1 + offset + (n - 1) * 7);
}

function equinoxDay(year: number, kind: "spring" | "autumn"): number {
  const years = year - 1980;
  const base = kind === "spring" ? 20.8431 : 23.2488;
  return Math.floor(base + 0.242194 * years - Math.floor(years / 4));
}

function holidaysFor(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const names = new Map<string, string>();
  for (const holiday of FIXED) {
    names.set(iso(year, holiday.month, holiday.day), holiday.name);
  }
  names.set(nthMonday(year, 1, 2), "成人の日");
  names.set(nthMonday(year, 7, 3), "海の日");
  names.set(nthMonday(year, 9, 3), "敬老の日");
  names.set(nthMonday(year, 10, 2), "スポーツの日");
  names.set(iso(year, 3, equinoxDay(year, "spring")), "春分の日");
  names.set(iso(year, 9, equinoxDay(year, "autumn")), "秋分の日");

  for (const day of [...names.keys()]) {
    if (weekdayIndex(parseISODate(day)) !== 0) continue;
    let cursor = shiftIso(day, 1);
    while (names.has(cursor)) cursor = shiftIso(cursor, 1);
    names.set(cursor, "振替休日");
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let month = 1; month <= 12; month += 1) {
      const last = new Date(year, month, 0).getDate();
      for (let day = 1; day <= last; day += 1) {
        const current = iso(year, month, day);
        if (names.has(current)) continue;
        if (names.has(shiftIso(current, -1)) && names.has(shiftIso(current, 1))) {
          names.set(current, "国民の休日");
          changed = true;
        }
      }
    }
  }

  cache.set(year, names);
  return names;
}

export function holidayName(date: Date): string | null {
  return holidaysFor(date.getFullYear()).get(formatISODate(date)) ?? null;
}

export function isJapaneseHoliday(date: Date): boolean {
  return holidayName(date) !== null;
}

export function isPublicRestDay(date: Date): boolean {
  return date.getDay() === 0 || isJapaneseHoliday(date);
}
