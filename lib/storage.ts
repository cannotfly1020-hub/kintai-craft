import type { JobType, MonthlyAttendance } from "@/types/kintai";
import { isWorkPatternId, type WorkPatternId } from "@/lib/patterns";
import { JOB_LABEL } from "@/lib/shifts";

const STAFF_KEY = "kintai-craft:staff";
const PATTERN_KEY = "kintai-craft:pattern";
const JOB_KEY = "kintai-craft:job";

export function draftKey(year: number, month: number, jobType: JobType): string {
  return `kintai-craft:v1:${year}-${String(month).padStart(2, "0")}:${jobType}`;
}

export function attendanceFileName(attendance: Pick<MonthlyAttendance, "year" | "month" | "jobType" | "staffName">): string {
  const name = attendance.staffName.replace(/[\\/:*?"<>|]/g, "").trim() || "氏名未設定";
  const month = String(attendance.month).padStart(2, "0");
  return `出勤簿_${JOB_LABEL[attendance.jobType]}_${name}_${attendance.year}${month}.xlsx`;
}

export function loadStaffName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STAFF_KEY) ?? "";
}

export function saveStaffName(name: string) {
  localStorage.setItem(STAFF_KEY, name);
}

export function loadPatternId(): WorkPatternId | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(PATTERN_KEY);
  return isWorkPatternId(value) ? value : null;
}

export function savePatternId(patternId: WorkPatternId) {
  localStorage.setItem(PATTERN_KEY, patternId);
}

export function loadJobType(): JobType {
  if (typeof window === "undefined") return "pt";
  return localStorage.getItem(JOB_KEY) === "rehab_part" ? "rehab_part" : "pt";
}

export function saveJobType(jobType: JobType) {
  localStorage.setItem(JOB_KEY, jobType);
}

export function loadDraft(year: number, month: number, jobType: JobType): MonthlyAttendance | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(draftKey(year, month, jobType));
  if (!raw) return null;
  try {
    return parseAttendance(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDraft(attendance: MonthlyAttendance) {
  localStorage.setItem(draftKey(attendance.year, attendance.month, attendance.jobType), JSON.stringify(attendance));
  saveStaffName(attendance.staffName);
  saveJobType(attendance.jobType);
}

export function clearDraft(attendance: MonthlyAttendance) {
  localStorage.removeItem(draftKey(attendance.year, attendance.month, attendance.jobType));
}

export function parseAttendance(value: unknown): MonthlyAttendance | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<MonthlyAttendance>;
  if (data.jobType !== "pt" && data.jobType !== "rehab_part") return null;
  if (!Array.isArray(data.records)) return null;
  return {
    year: Number(data.year) || new Date().getFullYear(),
    month: Number(data.month) || 1,
    jobType: data.jobType,
    staffName: data.staffName ?? "",
    initialPaidLeave: Number(data.initialPaidLeave) || 0,
    lunchCount: Number(data.lunchCount) || 0,
    lunchUnitPrice: Number(data.lunchUnitPrice) || 0,
    records: data.records.map((record) => ({
      date: record.date,
      dayOfMonth: record.dayOfMonth,
      dayOfWeek: record.dayOfWeek,
      koukyu: record.koukyu ?? "",
      kekkin: record.kekkin ?? "",
      tokki: record.tokki ?? "",
      yukyu: record.yukyu ?? "",
      halfDayType: record.halfDayType ?? "none",
      shiftCode: record.shiftCode ?? "",
      clockIn: record.clockIn ?? "",
      clockOut: record.clockOut ?? "",
      breakMinutes: Number(record.breakMinutes) || 0,
      overtimeSpan: record.overtimeSpan ?? "",
      overtimeMinutes: Number(record.overtimeMinutes) || 0,
      overtimeManual: Boolean(record.overtimeManual),
      shortageTime: record.shortageTime ?? "",
      shortageManual: Boolean(record.shortageManual),
      note: record.note ?? "",
    })),
  };
}
