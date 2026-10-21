import type { CustomShiftPattern, DailyRecord, EmploymentType, StaffRole } from "@/types/kintai";
import type { DutyWindow } from "@/lib/shifts";
import { crossesMidnight, scheduledWorkMinutes } from "@/lib/time";

export const SHIFT_PATTERN_LIMIT = 5;

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: "常勤",
  short_time: "時短",
  part_time: "パート（非常勤）",
};

export function defaultContractHours(patterns: Pick<CustomShiftPattern, "startTime" | "endTime" | "breakMinutes">[]): number {
  const first = patterns.find((item) => item.startTime && item.endTime);
  if (!first) return 4;
  const minutes = patternScheduledMinutes(first);
  if (minutes <= 0) return 4;
  return Math.round((minutes / 60) * 10) / 10;
}

export function defaultEmployment(role: StaffRole): EmploymentType {
  return role === "part_timer" ? "part_time" : "full_time";
}

export function defaultShiftPatterns(role: StaffRole, employment: EmploymentType): CustomShiftPattern[] {
  if (employment === "short_time") {
    return [
      pattern("shift_short", "時短", "09:00", "16:00", 60, "時短"),
      pattern("shift_half", "半日", "09:00", "13:00", 0, "半日"),
    ];
  }
  if (employment === "part_time") {
    return [
      pattern("shift_am", "午前パート", "08:30", "12:30", 0, "D"),
      pattern("shift_pm", "午後パート", "13:00", "17:00", 0, "午後"),
    ];
  }
  if (role === "nurse") {
    return [
      pattern("shift_day", "日勤", "09:00", "18:00", 60, "日勤"),
      pattern("shift_night", "夜勤", "16:00", "09:00", 60, "夜勤", true),
    ];
  }
  if (role === "pt_inpatient") {
    return [pattern("shift_day", "日勤", "09:00", "18:00", 60, "B-2")];
  }
  if (role === "pt_outpatient") {
    return [
      pattern("shift_day", "日勤", "09:00", "18:00", 60, "B-2"),
      pattern("shift_am", "午前", "08:30", "12:30", 0, "D"),
    ];
  }
  if (role === "rehab_assistant") {
    return [
      pattern("shift_day", "日勤", "08:30", "17:00", 60, "7.5H"),
      pattern("shift_am", "午前", "08:30", "12:30", 0, "D"),
    ];
  }
  if (role === "clerk" || role === "radiologist") {
    return [
      pattern("shift_day", "日勤", "08:30", "17:30", 60, "A-1"),
      pattern("shift_am", "午前", "08:30", "12:30", 0, "D"),
    ];
  }
  return [
    pattern("shift_day", "日勤", "09:00", "18:00", 60, "日勤"),
    pattern("shift_am", "午前", "09:00", "13:00", 0, "午前"),
  ];
}

export function patternScheduledMinutes(pattern: Pick<CustomShiftPattern, "startTime" | "endTime" | "breakMinutes">): number {
  return scheduledWorkMinutes(pattern.startTime, pattern.endTime, pattern.breakMinutes);
}

export function patternButtonLabel(pattern: Pick<CustomShiftPattern, "label" | "startTime" | "endTime">): string {
  const label = jaShiftText(pattern.label.trim() || "無題");
  const end = crossesMidnight(pattern.startTime, pattern.endTime) ? `翌${pattern.endTime}` : pattern.endTime;
  return `${label} (${pattern.startTime}-${end})`;
}

/** 画面・備考向けに AM/PM を午前/午後へ揃える。 */
export function jaShiftText(value: string): string {
  return value
    .replace(/AM半休/g, "午前半休")
    .replace(/PM半休/g, "午後半休")
    .replace(/AMパート/g, "午前パート")
    .replace(/PMパート/g, "午後パート")
    .replace(/\bAM\b/g, "午前")
    .replace(/\bPM\b/g, "午後")
    .replace(/AM/g, "午前")
    .replace(/PM/g, "午後");
}

export function patternShiftCode(pattern: Pick<CustomShiftPattern, "label" | "shiftCode">): string {
  return pattern.shiftCode.trim() || pattern.label.trim();
}

export function withOvernight(pattern: CustomShiftPattern): CustomShiftPattern {
  const overnight = Boolean(pattern.isOvernight) || crossesMidnight(pattern.startTime, pattern.endTime);
  return { ...pattern, isOvernight: overnight };
}

export function dutyFromPattern(pattern: CustomShiftPattern): DutyWindow | null {
  const start = pattern.startTime.trim();
  const end = pattern.endTime.trim();
  if (!start || !end) return null;
  const overnight = crossesMidnight(start, end);
  return {
    start,
    end,
    breakMinutes: Number(pattern.breakMinutes) || 0,
    scheduledMinutes: scheduledWorkMinutes(start, end, pattern.breakMinutes),
    overnight,
  };
}

export function contractFromRecord(record: Pick<DailyRecord, "contractStart" | "contractEnd" | "contractBreak" | "isOvernight">): DutyWindow | null {
  if (!record.contractStart || !record.contractEnd) return null;
  const overnight = crossesMidnight(record.contractStart, record.contractEnd);
  return {
    start: record.contractStart,
    end: record.contractEnd,
    breakMinutes: record.contractBreak || 0,
    scheduledMinutes: scheduledWorkMinutes(record.contractStart, record.contractEnd, record.contractBreak || 0),
    overnight,
  };
}

export function nextPatternId(patterns: Pick<CustomShiftPattern, "id">[]): string {
  const numbers = patterns.flatMap((item) => {
    const match = /^shift_(\d+)$/.exec(item.id);
    return match ? [Number(match[1])] : [];
  });
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : patterns.length + 1;
  return `shift_${next}`;
}

export function blankPattern(patterns: CustomShiftPattern[]): CustomShiftPattern {
  return {
    id: nextPatternId(patterns),
    label: "",
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: 60,
    shiftCode: "",
    isOvernight: false,
  };
}

export function normalizePatterns(value: unknown): CustomShiftPattern[] {
  if (!Array.isArray(value)) return [];
  const patterns: CustomShiftPattern[] = [];
  for (const item of value) {
    if (patterns.length >= SHIFT_PATTERN_LIMIT) break;
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<CustomShiftPattern>;
    if (typeof raw.id !== "string" || !raw.id.trim()) continue;
    const startTime = typeof raw.startTime === "string" ? raw.startTime : "";
    const endTime = typeof raw.endTime === "string" ? raw.endTime : "";
    const label = typeof raw.label === "string" ? jaShiftText(raw.label) : "";
    const shiftCode = typeof raw.shiftCode === "string" ? jaShiftText(raw.shiftCode) : "";
    patterns.push(
      withOvernight({
        id: raw.id.trim(),
        label,
        startTime,
        endTime,
        breakMinutes: Number(raw.breakMinutes) || 0,
        shiftCode,
        isOvernight: Boolean(raw.isOvernight),
      }),
    );
  }
  return patterns;
}

function pattern(
  id: string,
  label: string,
  startTime: string,
  endTime: string,
  breakMinutes: number,
  shiftCode: string,
  isOvernight = false,
): CustomShiftPattern {
  return withOvernight({ id, label, startTime, endTime, breakMinutes, shiftCode, isOvernight });
}
