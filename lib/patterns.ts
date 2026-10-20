import type { DailyRecord, JobType, MonthlyAttendance, ShiftCode } from "@/types/kintai";
import { deriveRecord, isBlankRecord } from "@/lib/records";
import { expectedDuty, shiftFor } from "@/lib/shifts";

export type WorkPatternId = "pattern_1" | "pattern_2" | "pattern_3";

export type AttendanceMode = "normal" | "am" | "pm";

export interface WorkPattern {
  id: WorkPatternId;
  label: string;
  title: string;
  detail: string;
}

export const WORK_PATTERNS: WorkPattern[] = [
  {
    id: "pattern_1",
    label: "パターン①",
    title: "理学療法士 標準",
    detail: "月火水金 B-2 09:00–18:00 / 木・土 D 08:30–12:30 / 日 公休",
  },
  {
    id: "pattern_2",
    label: "パターン②",
    title: "週5日フル",
    detail: "月〜金 B-2 09:00–18:00 / 土・日 公休",
  },
  {
    id: "pattern_3",
    label: "パターン③",
    title: "リハビリパート 標準",
    detail: "月火水金 7.5H 08:30–17:00 / 木・土 D 08:30–12:30 / 日 公休",
  },
];

const HALF_WINDOWS: Record<"am" | "pm", { clockIn: string; clockOut: string }> = {
  pm: { clockIn: "08:30", clockOut: "12:00" },
  am: { clockIn: "13:00", clockOut: "17:00" },
};

export function isWorkPatternId(value: unknown): value is WorkPatternId {
  return value === "pattern_1" || value === "pattern_2" || value === "pattern_3";
}

export function jobForPattern(patternId: WorkPatternId, currentJob: JobType): JobType {
  if (patternId === "pattern_3") return "rehab_part";
  if (patternId === "pattern_1" || patternId === "pattern_2") return "pt";
  return currentJob;
}

export function applyPatternToPeriod(attendance: MonthlyAttendance, patternId: WorkPatternId): MonthlyAttendance {
  return {
    ...attendance,
    records: attendance.records.map((record) => applyAttendanceMode(record, patternId, attendance.jobType, "normal")),
  };
}

export function applyPatternToMonth(
  attendance: MonthlyAttendance,
  patternId: WorkPatternId | null,
  mode: AttendanceMode,
  date: string,
  onlyIfBlank = false,
): MonthlyAttendance {
  const index = attendance.records.findIndex((record) => record.date === date);
  if (index < 0) return attendance;
  if (onlyIfBlank && !isBlankRecord(attendance.records[index])) return attendance;
  const records = attendance.records.slice();
  records[index] = applyAttendanceMode(records[index], patternId, attendance.jobType, mode);
  return { ...attendance, records };
}

export function applyAttendanceMode(
  record: DailyRecord,
  patternId: WorkPatternId | null,
  jobType: JobType,
  mode: AttendanceMode,
): DailyRecord {
  if (mode === "normal") {
    if (!patternId) return clearHalf(record);
    return applyNormalPattern(record, patternId);
  }
  return applyHalfDay(record, patternId, jobType, mode);
}

function applyNormalPattern(record: DailyRecord, patternId: WorkPatternId): DailyRecord {
  const plan = dayPlan(patternId, record.dayOfWeek);
  if (plan.kind === "off") {
    return {
      ...record,
      koukyu: "○",
      kekkin: "",
      tokki: "",
      yukyu: "",
      halfDayType: "none",
      shiftCode: "",
      clockIn: "",
      clockOut: "",
      breakMinutes: 0,
      overtimeSpan: "",
      overtimeMinutes: 0,
      overtimeManual: false,
      shortageTime: "",
      shortageManual: false,
    };
  }
  return assignScheduledWork(record, plan.shift, plan.start, plan.end, plan.breakMinutes);
}

function applyHalfDay(
  record: DailyRecord,
  patternId: WorkPatternId | null,
  jobType: JobType,
  half: "am" | "pm",
): DailyRecord {
  const plan = patternId ? dayPlan(patternId, record.dayOfWeek) : null;
  const shift = plan?.kind === "work" ? plan.shift : primaryShift(patternId, jobType);
  const window = HALF_WINDOWS[half];
  return {
    ...record,
    shiftCode: shift,
    clockIn: window.clockIn,
    clockOut: window.clockOut,
    breakMinutes: 0,
    halfDayType: half,
    yukyu: "△",
    koukyu: "",
    tokki: "",
    kekkin: "",
    overtimeMinutes: 0,
    overtimeSpan: "",
    overtimeManual: true,
    shortageTime: "",
    shortageManual: true,
  };
}

function clearHalf(record: DailyRecord): DailyRecord {
  const next: DailyRecord = {
    ...record,
    halfDayType: "none",
    yukyu: record.yukyu === "△" ? "" : record.yukyu,
  };
  if (!shiftFor(next.shiftCode)) return next;
  return assignScheduledWork(
    next,
    next.shiftCode,
    shiftFor(next.shiftCode)?.start ?? next.clockIn,
    shiftFor(next.shiftCode)?.end ?? next.clockOut,
    shiftFor(next.shiftCode)?.breakMinutes ?? next.breakMinutes,
  );
}

function assignScheduledWork(
  record: DailyRecord,
  shift: ShiftCode,
  start: string,
  end: string,
  breakMinutes: number,
): DailyRecord {
  const definition = shiftFor(shift);
  const duty = definition ? expectedDuty(definition, "none") : null;
  const matches = Boolean(duty && duty.start === start && duty.end === end && duty.breakMinutes === breakMinutes);
  const next: DailyRecord = {
    ...record,
    shiftCode: shift,
    clockIn: start,
    clockOut: end,
    breakMinutes,
    halfDayType: "none",
    yukyu: "",
    koukyu: "",
    tokki: "",
    kekkin: "",
    overtimeMinutes: 0,
    overtimeSpan: "",
    overtimeManual: !matches,
    shortageTime: "",
    shortageManual: !matches,
  };
  return matches ? deriveRecord({ ...next, overtimeManual: false, shortageManual: false }) : next;
}

function primaryShift(patternId: WorkPatternId | null, jobType: JobType): ShiftCode {
  if (patternId === "pattern_3" || (!patternId && jobType === "rehab_part")) return "7.5H";
  return "B-2";
}

function dayPlan(
  patternId: WorkPatternId,
  dayOfWeek: string,
): { kind: "off" } | { kind: "work"; shift: ShiftCode; start: string; end: string; breakMinutes: number } {
  if (patternId === "pattern_2") {
    if (dayOfWeek === "土" || dayOfWeek === "日") return { kind: "off" };
    return { kind: "work", shift: "B-2", start: "09:00", end: "18:00", breakMinutes: 60 };
  }

  if (dayOfWeek === "日") return { kind: "off" };
  if (dayOfWeek === "木" || dayOfWeek === "土") {
    return { kind: "work", shift: "D", start: "08:30", end: "12:30", breakMinutes: 0 };
  }
  if (patternId === "pattern_1") {
    return { kind: "work", shift: "B-2", start: "09:00", end: "18:00", breakMinutes: 60 };
  }
  return { kind: "work", shift: "7.5H", start: "08:30", end: "17:00", breakMinutes: 60 };
}
