import type { DailyRecord, LeaveMark, MonthlyAttendance, ShiftCode } from "@/types/kintai";
import { shiftFor } from "@/lib/shifts";
import { formatMinutesJa, parseDurationMinutes, parseHHMM, formatHHMM } from "@/lib/time";

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
  shifts: Partial<Record<Exclude<ShiftCode, "" | "free">, number>>;
  paidLeaveRemaining: number;
  overtimeMinutes: number;
  shortageMinutes: number;
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

export function shiftMarkFor(record: DailyRecord): LeaveMark {
  if (!record.shiftCode || record.shiftCode === "free" || hasFullLeave(record)) return "";
  return record.halfDayType === "none" ? "○" : "△";
}

export function attendanceUnits(record: DailyRecord): number {
  if (hasFullLeave(record)) return 0;
  if (record.shiftCode && record.shiftCode !== "free") return markValue(shiftMarkFor(record));
  if (record.clockIn && record.clockOut) {
    return record.halfDayType === "none" && record.kekkin !== "△" ? 1 : 0.5;
  }
  return 0;
}

export function noteForExport(record: DailyRecord): string {
  const tag =
    record.halfDayType === "am"
      ? "AM半休"
      : record.halfDayType === "pm"
        ? "PM半休"
        : record.halfDayType === "am_off"
          ? "午前休"
          : record.halfDayType === "pm_off"
            ? "午後休"
            : "";
  const text = record.note.trim();
  if (!tag) return text;
  if (text.startsWith(tag)) return text;
  return text ? `${tag} ${text}` : tag;
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
): Deviation | null {
  const inn = parseHHMM(clockIn);
  const out = parseHHMM(clockOut);
  const start = parseHHMM(expectedStart);
  const end = parseHHMM(expectedEnd);
  if (inn == null || out == null || start == null || end == null) return null;
  if (out <= inn || end <= start) return null;

  const spans: { start: number; end: number }[] = [];
  if (inn < start) {
    const spanEnd = Math.min(out, start);
    if (spanEnd > inn) spans.push({ start: inn, end: spanEnd });
  }
  if (out > end) {
    const spanStart = Math.max(inn, end);
    if (out > spanStart) spans.push({ start: spanStart, end: out });
  }

  const overlap = Math.max(0, Math.min(out, end) - Math.max(inn, start));
  const shortage = Math.max(0, end - start - overlap) + Math.max(0, breakMinutes - standardBreak);

  return {
    overtimeMinutes: spans.reduce((sum, span) => sum + (span.end - span.start), 0),
    shortageMinutes: shortage,
    span: spans.map((span) => `${formatHHMM(span.start)}〜${formatHHMM(span.end)}`).join(" / "),
    startLabel: spans.map((span) => formatHHMM(span.start)).join("・"),
    endLabel: spans.map((span) => formatHHMM(span.end)).join("・"),
  };
}

export function summarize(attendance: MonthlyAttendance): MonthSummary {
  const summary: MonthSummary = {
    koukyu: 0,
    kekkin: 0,
    tokki: 0,
    yukyu: 0,
    shifts: {},
    paidLeaveRemaining: 0,
    overtimeMinutes: 0,
    shortageMinutes: 0,
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
    summary.overtimeMinutes += record.overtimeMinutes;

    const shortage = parseDurationMinutes(record.shortageTime);
    summary.shortageMinutes += shortage;
    if (shortage > 0) summary.lateEarlyCount += 1;
    if (shortage > 0 && shortage < UNDER_HALF_MINUTES) summary.underHalfDayCount += 1;

    const mark = shiftMarkFor(record);
    const shift = shiftFor(record.shiftCode);
    if (shift && mark) {
      summary.shifts[shift.code] = (summary.shifts[shift.code] ?? 0) + markValue(mark);
    }
  }

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
