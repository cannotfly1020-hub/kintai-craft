import type { DailyRecord, DayShiftSetting, HalfDayRuleType, JobType, LeaveMark, MonthlyAttendance, KnownShiftCode } from "@/types/kintai";
import { parseISODate } from "@/lib/date";
import { HOLIDAY_WORK_ID, isHolidayWork, isSubstituteHoliday, isSubstituteWork } from "@/lib/holiday-work";
import { shiftFor } from "@/lib/shifts";
import { formatMinutesJa, parseDurationMinutes, parseHHMM, formatHHMM, scheduledWorkMinutes } from "@/lib/time";

export interface Deviation {
  overtimeMinutes: number;
  shortageMinutes: number;
  span: string;
  startLabel: string;
  endLabel: string;
}

export interface MonthSummary {
  koukyu: number;
  kekkin: number;
  tokki: number;
  yukyu: number;
  shifts: Partial<Record<Exclude<KnownShiftCode, "" | "free">, number>>;
  paidLeaveRemaining: number;
  overtimeMinutes: number;
  shortageMinutes: number;
  workedMinutes: number;
  paidLeaveMinutes: number;
  payableMinutes: number;
  attendanceDays: number;
  lunchCount: number;
  lunchAmount: number;
  lateEarlyCount: number;
  underHalfDayCount: number;
}

const UNDER_HALF_MINUTES = 210;

export function markValue(mark: LeaveMark): number {
  if (mark === "○") return 1;
  if (mark === "△") return 0.5;
  return 0;
}

export function hasFullLeave(record: DailyRecord): boolean {
  return (
    record.koukyu === "○" ||
    record.kekkin === "○" ||
    record.tokki === "○" ||
    record.yukyu === "○"
  );
}

const SHEET_MINUTES: Record<JobType, { code: Exclude<KnownShiftCode, "" | "free">; minutes: number }[]> = {
  pt: [
    { code: "B-2", minutes: 480 },
    { code: "D", minutes: 240 },
  ],
  rehab_part: [
    { code: "A-1", minutes: 480 },
    { code: "7.5H", minutes: 450 },
    { code: "D", minutes: 240 },
  ],
};

function matchScheduledMinutes(job: JobType, minutes: number | null): Exclude<KnownShiftCode, "" | "free"> | null {
  if (minutes == null || minutes <= 0) return null;
  return SHEET_MINUTES[job].find((column) => column.minutes === minutes)?.code ?? null;
}

function contractMinutes(record: DailyRecord): number | null {
  if (!record.contractStart || !record.contractEnd) return null;
  const minutes = scheduledWorkMinutes(record.contractStart, record.contractEnd, record.contractBreak || 0);
  return minutes > 0 ? minutes : null;
}

function clockMinutes(record: DailyRecord): number | null {
  if (!record.clockIn || !record.clockOut) return null;
  const minutes = scheduledWorkMinutes(record.clockIn, record.clockOut, record.breakMinutes);
  return minutes > 0 ? minutes : null;
}

export function exportShiftCode(job: JobType, record: DailyRecord): Exclude<KnownShiftCode, "" | "free"> | null {
  if (record.shiftCode === "明け" || hasFullLeave(record) || isHolidayWork(record) || record.patternId === HOLIDAY_WORK_ID) {
    return null;
  }
  if (record.contractStart && record.contractEnd) return matchScheduledMinutes(job, contractMinutes(record));
  const known = shiftFor(record.shiftCode);
  if (known && known.jobs.includes(job)) return known.code;
  return matchScheduledMinutes(job, clockMinutes(record));
}

export function shiftMarkFor(record: DailyRecord): LeaveMark {
  if (record.shiftCode === "明け" || hasFullLeave(record) || isHolidayWork(record) || record.patternId === HOLIDAY_WORK_ID) {
    return "";
  }
  const known = Boolean(shiftFor(record.shiftCode));
  const timed = Boolean((record.contractStart && record.contractEnd) || (record.clockIn && record.clockOut));
  if (!known && !timed) return "";
  if ((record.shiftCode === "free" || !record.shiftCode) && !timed) return "";
  return record.halfDayType === "none" ? "○" : "△";
}

export interface HoursContext {
  halfDayRule: HalfDayRuleType;
  contractHoursPerDay?: number;
  weeklySchedule?: Record<number, DayShiftSetting>;
}

function scheduledMinutesOn(date: string, context?: HoursContext): number {
  const day = context?.weeklySchedule?.[parseISODate(date).getDay()];
  if (day && !day.isHoliday && day.scheduledMinutes > 0) return day.scheduledMinutes;
  const hours = context?.contractHoursPerDay;
  if (hours && hours > 0) return Math.round(hours * 60);
  return 240;
}

export function paidLeaveMinutes(record: DailyRecord, context?: HoursContext): number {
  const full = scheduledMinutesOn(record.date, context);
  if (record.yukyu === "○") return full;
  const half = record.yukyu === "△" || record.halfDayType === "am" || record.halfDayType === "pm";
  if (!half) return 0;
  if (context?.halfDayRule === "asymmetric_3_5_4h") {
    if (record.halfDayType === "am") return 210;
    if (record.halfDayType === "pm") return 240;
  }
  return Math.round(full / 2);
}

export function workedMinutes(record: DailyRecord): number {
  if (hasFullLeave(record) || record.shiftCode === "明け" || !record.clockIn || !record.clockOut) return 0;
  return scheduledWorkMinutes(record.clockIn, record.clockOut, record.breakMinutes);
}

export function attendanceUnits(record: DailyRecord): number {
  if (hasFullLeave(record)) return 0;
  if (record.shiftCode === "明け") return 0;
  if (record.shiftCode && record.shiftCode !== "free" && shiftFor(record.shiftCode)) return markValue(shiftMarkFor(record));
  if (record.clockIn && record.clockOut) {
    return record.halfDayType === "none" && record.kekkin !== "△" ? 1 : 0.5;
  }
  return 0;
}

export function noteForExport(record: DailyRecord, job?: JobType): string {
  const tag =
    record.halfDayType === "am"
      ? "午前半休"
      : record.halfDayType === "pm"
        ? "午後半休"
        : record.halfDayType === "am_off"
          ? "午前休"
          : record.halfDayType === "pm_off"
            ? "午後休"
            : "";
  // 休出・振出・振休は備考タグを正とし、パターン名の二重印字を避ける
  const pattern =
    isHolidayWork(record) || isSubstituteWork(record) || isSubstituteHoliday(record) || (job && exportShiftCode(job, record))
      ? ""
      : patternNote(record);
  const memo = record.note.trim();
  const text = pattern && !memo.includes(pattern) ? (memo ? `${pattern} ${memo}` : pattern) : memo;
  if (!tag) return text;
  if (text.startsWith(tag)) return text;
  return text ? `${tag} ${text}` : tag;
}

function patternNote(record: DailyRecord): string {
  const label = record.patternLabel.trim();
  if (!label) return "";
  if (!record.contractStart || !record.contractEnd) return label;
  const end = record.isOvernight ? `翌${record.contractEnd}` : record.contractEnd;
  return `${label} ${record.contractStart}〜${end}`;
}

export function splitOvertimeSpan(span: string): { start: string; end: string } {
  const parts = span
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const starts: string[] = [];
  const ends: string[] = [];
  for (const part of parts) {
    const [start, end] = part.split("〜");
    if (!start || !end) continue;
    starts.push(start.trim());
    ends.push(end.trim());
  }
  if (starts.length === 0) return { start: span.trim(), end: "" };
  return { start: starts.join("・"), end: ends.join("・") };
}

export function computeDeviation(
  clockIn: string,
  clockOut: string,
  expectedStart: string,
  expectedEnd: string,
  breakMinutes: number,
  standardBreak: number,
  overnight = false,
): Deviation | null {
  const inn = parseHHMM(clockIn);
  const out = parseHHMM(clockOut);
  const start = parseHHMM(expectedStart);
  const end = parseHHMM(expectedEnd);
  if (inn == null || out == null || start == null || end == null) return null;
  const night = overnight || end < start;
  if (!night && (out <= inn || end <= start)) return null;

  const actualEnd = night && out <= inn ? out + 24 * 60 : out;
  const expectedEndAt = night && end <= start ? end + 24 * 60 : end;
  if (actualEnd <= inn || expectedEndAt <= start) return null;

  const spans: { start: number; end: number }[] = [];
  if (inn < start) {
    const spanEnd = Math.min(actualEnd, start);
    if (spanEnd > inn) spans.push({ start: inn, end: spanEnd });
  }
  if (actualEnd > expectedEndAt) {
    const spanStart = Math.max(inn, expectedEndAt);
    if (actualEnd > spanStart) spans.push({ start: spanStart, end: actualEnd });
  }

  const overlap = Math.max(0, Math.min(actualEnd, expectedEndAt) - Math.max(inn, start));
  const shortage = Math.max(0, expectedEndAt - start - overlap) + Math.max(0, breakMinutes - standardBreak);

  return {
    overtimeMinutes: spans.reduce((sum, span) => sum + (span.end - span.start), 0),
    shortageMinutes: shortage,
    span: spans.map((span) => `${formatHHMM(span.start)}〜${formatHHMM(span.end)}`).join(" / "),
    startLabel: spans.map((span) => formatHHMM(span.start)).join("・"),
    endLabel: spans.map((span) => formatHHMM(span.end)).join("・"),
  };
}

export function summarize(attendance: MonthlyAttendance, hours?: HoursContext): MonthSummary {
  const summary: MonthSummary = {
    koukyu: 0,
    kekkin: 0,
    tokki: 0,
    yukyu: 0,
    shifts: {},
    paidLeaveRemaining: 0,
    overtimeMinutes: 0,
    shortageMinutes: 0,
    workedMinutes: 0,
    paidLeaveMinutes: 0,
    payableMinutes: 0,
    attendanceDays: 0,
    lunchCount: attendance.lunchCount,
    lunchAmount: attendance.lunchCount * attendance.lunchUnitPrice,
    lateEarlyCount: 0,
    underHalfDayCount: 0,
  };

  for (const record of attendance.records) {
    summary.koukyu += markValue(record.koukyu);
    summary.kekkin += markValue(record.kekkin);
    summary.tokki += markValue(record.tokki);
    summary.yukyu += markValue(record.yukyu);
    summary.attendanceDays += attendanceUnits(record);
    summary.workedMinutes += workedMinutes(record);
    summary.paidLeaveMinutes += paidLeaveMinutes(record, hours);
    summary.overtimeMinutes += record.overtimeMinutes;

    const shortage = parseDurationMinutes(record.shortageTime);
    summary.shortageMinutes += shortage;
    if (shortage > 0) summary.lateEarlyCount += 1;
    if (shortage > 0 && shortage < UNDER_HALF_MINUTES) summary.underHalfDayCount += 1;

    const mark = shiftMarkFor(record);
    const shiftCode = exportShiftCode(attendance.jobType, record);
    if (shiftCode && mark) {
      summary.shifts[shiftCode] = (summary.shifts[shiftCode] ?? 0) + markValue(mark);
    }
  }

  summary.payableMinutes = summary.workedMinutes + summary.paidLeaveMinutes;
  summary.paidLeaveRemaining = roundDay(attendance.initialPaidLeave - summary.yukyu);
  summary.koukyu = roundDay(summary.koukyu);
  summary.kekkin = roundDay(summary.kekkin);
  summary.tokki = roundDay(summary.tokki);
  summary.yukyu = roundDay(summary.yukyu);
  summary.attendanceDays = roundDay(summary.attendanceDays);
  for (const code of Object.keys(summary.shifts) as (keyof MonthSummary["shifts"])[]) {
    summary.shifts[code] = roundDay(summary.shifts[code] ?? 0);
  }
  return summary;
}

export function overtimeLabel(minutes: number): string {
  return formatMinutesJa(minutes);
}

function roundDay(value: number): number {
  return Math.round(value * 10) / 10;
}
