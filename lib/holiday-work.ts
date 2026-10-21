import type { DailyRecord } from "@/types/kintai";

export const HOLIDAY_WORK_ID = "holiday_work";
export const SUBSTITUTE_WORK_ID = "substitute_work";
export const HOLIDAY_WORK_NOTE = "休日出勤";
export const SUBSTITUTE_WORK_NOTE = "振替出勤";

export function isHolidayWork(record: DailyRecord): boolean {
  return record.patternId === HOLIDAY_WORK_ID || record.note.includes(HOLIDAY_WORK_NOTE);
}

export function isSubstituteWork(record: DailyRecord): boolean {
  return record.patternId === SUBSTITUTE_WORK_ID || record.note.includes(SUBSTITUTE_WORK_NOTE);
}

export function stripHolidayNotes(note: string): string {
  return note
    .replace(new RegExp(`\\s*${HOLIDAY_WORK_NOTE}`, "g"), "")
    .replace(new RegExp(`\\s*${SUBSTITUTE_WORK_NOTE}`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}

export function withHolidayNote(note: string, tag: string): string {
  const base = stripHolidayNotes(note);
  return base ? `${base} ${tag}` : tag;
}
