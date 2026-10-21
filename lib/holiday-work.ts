import type { DailyRecord } from "@/types/kintai";

export const HOLIDAY_WORK_ID = "holiday_work";
export const SUBSTITUTE_WORK_ID = "substitute_work";
export const SUBSTITUTE_HOLIDAY_ID = "substitute_holiday";

export const HOLIDAY_WORK_NOTE = "休日出勤";
export const SUBSTITUTE_WORK_NOTE = "振替出勤";
export const SUBSTITUTE_HOLIDAY_NOTE = "振替休日";

const SPECIAL_IDS = new Set([HOLIDAY_WORK_ID, SUBSTITUTE_WORK_ID, SUBSTITUTE_HOLIDAY_ID]);

export function isSpecialDutyMode(record: Pick<DailyRecord, "patternId">): boolean {
  return SPECIAL_IDS.has(record.patternId);
}

/** patternId を正とし、通常シフト選択後に残った備考タグは無視する（固着防止） */
export function isHolidayWork(record: DailyRecord): boolean {
  if (record.patternId === HOLIDAY_WORK_ID) return true;
  if (record.patternId) return false;
  return record.note.includes(HOLIDAY_WORK_NOTE);
}

export function isSubstituteWork(record: DailyRecord): boolean {
  if (record.patternId === SUBSTITUTE_WORK_ID) return true;
  if (record.patternId) return false;
  return record.note.includes(SUBSTITUTE_WORK_NOTE);
}

export function isSubstituteHoliday(record: DailyRecord): boolean {
  if (record.patternId === SUBSTITUTE_HOLIDAY_ID) return true;
  if (record.patternId) return false;
  return record.note.includes(SUBSTITUTE_HOLIDAY_NOTE);
}

export function stripHolidayNotes(note: string): string {
  return note
    .replace(new RegExp(`\\s*${HOLIDAY_WORK_NOTE}`, "g"), "")
    .replace(new RegExp(`\\s*${SUBSTITUTE_WORK_NOTE}`, "g"), "")
    .replace(new RegExp(`\\s*${SUBSTITUTE_HOLIDAY_NOTE}`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}

export function withHolidayNote(note: string, tag: string): string {
  const base = stripHolidayNotes(note);
  return base ? `${base} ${tag}` : tag;
}

/** 他モードのフラグ（備考タグ）を落としてから更新をマージする土台 */
export function clearSpecialDutyFlags(record: DailyRecord): DailyRecord {
  return {
    ...record,
    note: stripHolidayNotes(record.note),
  };
}
