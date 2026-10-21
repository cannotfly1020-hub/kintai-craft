import type { CustomShiftPattern, DayShiftSetting, EmploymentType, HalfDayRuleType, JobType, MonthlyAttendance, ShiftCode, StaffRole } from "@/types/kintai";
import { presetForRole, recomputeScheduled, ROLE_LABEL } from "@/lib/schedule";
import { defaultEmployment, defaultShiftPatterns, normalizePatterns } from "@/lib/shift-patterns";
import { defaultClosing } from "@/lib/period";
import { createAttendance } from "@/lib/records";
import { parseAttendance } from "@/lib/storage";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  halfDayRule: HalfDayRuleType;
  sheetType: JobType;
  initialPaidLeave: number;
  weeklySchedule: Record<number, DayShiftSetting>;
  employmentType: EmploymentType;
  shiftPatterns: CustomShiftPattern[];
}

export const STAFF_LIST_KEY = "kintai_craft_staff_list_v1";
export const CURRENT_STAFF_KEY = "kintai_craft_current_staff_id_v1";

const LEGACY_NAME_KEY = "kintai-craft:staff";
const LEGACY_JOB_KEY = "kintai-craft:job";
const LEGACY_PATTERN_KEY = "kintai-craft:pattern";

export function recordsKey(staffId: string, year: number, month: number): string {
  return `kintai_craft_records_${staffId}_${year}-${String(month).padStart(2, "0")}`;
}

export function createStaffId(existing: Pick<StaffMember, "id">[]): string {
  const numbers = existing.flatMap((staff) => {
    const match = /^staff_(\d+)$/.exec(staff.id);
    return match ? [Number(match[1])] : [];
  });
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `staff_${next}`;
}

export function loadStaffList(): StaffMember[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STAFF_LIST_KEY);
  if (!raw) return [];
  try {
    return normalizeStaffList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveStaffList(staff: StaffMember[]) {
  localStorage.setItem(STAFF_LIST_KEY, JSON.stringify(staff));
}

export function loadCurrentStaffId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_STAFF_KEY);
}

export function saveCurrentStaffId(staffId: string) {
  localStorage.setItem(CURRENT_STAFF_KEY, staffId);
}

export function loadStaffRecords(staffId: string, year: number, month: number): MonthlyAttendance | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(recordsKey(staffId, year, month));
  if (!raw) return null;
  try {
    return parseAttendance(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStaffRecords(staffId: string, attendance: MonthlyAttendance) {
  localStorage.setItem(recordsKey(staffId, attendance.year, attendance.month), JSON.stringify(attendance));
}

export function clearStaffRecords(staffId: string, year: number, month: number) {
  localStorage.removeItem(recordsKey(staffId, year, month));
}

export function deleteStaffRecords(staffId: string) {
  const prefix = `kintai_craft_records_${staffId}_`;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  }
}

export function loadStaffMonth(
  staff: StaffMember,
  year: number,
  month: number,
  carry?: { lunchUnitPrice?: number; lunchCount?: number },
): { attendance: MonthlyAttendance; isNew: boolean } {
  const saved = loadStaffRecords(staff.id, year, month);
  if (saved) {
    return {
      isNew: false,
      attendance: {
        ...saved,
        staffName: staff.name,
        jobType: staff.sheetType,
        initialPaidLeave: staff.initialPaidLeave,
      },
    };
  }
  return {
    isNew: true,
    attendance: createAttendance({
      year,
      month,
      jobType: staff.sheetType,
      staffName: staff.name,
      initialPaidLeave: staff.initialPaidLeave,
      lunchCount: carry?.lunchCount ?? 0,
      lunchUnitPrice: carry?.lunchUnitPrice ?? 0,
    }),
  };
}

export function ensureStaffWorkspace(): { staff: StaffMember[]; currentId: string } {
  const existing = loadStaffList();
  if (existing.length > 0) {
    const currentId = existing.some((staff) => staff.id === loadCurrentStaffId())
      ? (loadCurrentStaffId() as string)
      : existing[0].id;
    saveCurrentStaffId(currentId);
    return { staff: existing, currentId };
  }
  const staff = [migrateLegacyStaff()];
  saveStaffList(staff);
  saveCurrentStaffId(staff[0].id);
  return { staff, currentId: staff[0].id };
}

function migrateLegacyStaff(): StaffMember {
  const legacyJob: JobType = localStorage.getItem(LEGACY_JOB_KEY) === "rehab_part" ? "rehab_part" : "pt";
  const storedPattern = localStorage.getItem(LEGACY_PATTERN_KEY);
  const role: StaffRole = storedPattern === "pattern_3" || legacyJob === "rehab_part" ? "rehab_assistant" : "pt_outpatient";
  const preset = presetForRole(role);
  let name = localStorage.getItem(LEGACY_NAME_KEY)?.trim() ?? "";
  let initialPaidLeave = 10;
  let latest = -1;
  let foundClosing = false;
  const closing = defaultClosing();
  for (const key of Object.keys(localStorage)) {
    const match = /^kintai-craft:v1:(\d+)-(\d+):(pt|rehab_part)$/.exec(key);
    if (!match || match[3] !== preset.sheetType) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const raw = localStorage.getItem(key);
    if (!raw || localStorage.getItem(recordsKey("staff_1", year, month))) continue;
    localStorage.setItem(recordsKey("staff_1", year, month), raw);
    try {
      const parsed = parseAttendance(JSON.parse(raw));
      const stamp = year * 12 + month;
      const isClosing = year === closing.year && month === closing.month;
      if (parsed && (isClosing || (!foundClosing && stamp >= latest))) {
        if (isClosing) foundClosing = true;
        latest = stamp;
        initialPaidLeave = parsed.initialPaidLeave;
        if (!name) name = parsed.staffName;
      }
    } catch {
      // The legacy draft stays on the old key when it cannot be read.
    }
  }
  return {
    id: "staff_1",
    name,
    role: preset.role,
    halfDayRule: preset.halfDayRule,
    sheetType: preset.sheetType,
    initialPaidLeave,
    weeklySchedule: preset.weeklySchedule,
    employmentType: defaultEmployment(preset.role),
    shiftPatterns: defaultShiftPatterns(preset.role, defaultEmployment(preset.role)),
  };
}

export function normalizeStaffList(value: unknown): StaffMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const staff = normalizeStaff(item);
    return staff ? [staff] : [];
  });
}

function normalizeStaff(value: unknown): StaffMember | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.id !== "string" || !data.id.trim()) return null;
  const role = inferRole(data);
  const preset = presetForRole(role);
  const halfDayRule = data.halfDayRule === "equal_4h" || data.halfDayRule === "asymmetric_3_5_4h" ? data.halfDayRule : preset.halfDayRule;
  const sheetType = data.sheetType === "pt" || data.sheetType === "rehab_part" ? data.sheetType : preset.sheetType;
  const employmentType = normalizeEmployment(data.employmentType, role);
  const savedPatterns = Array.isArray(data.shiftPatterns) ? normalizePatterns(data.shiftPatterns) : null;
  return {
    id: data.id,
    name: typeof data.name === "string" ? data.name : "",
    role,
    halfDayRule,
    sheetType,
    initialPaidLeave: Number(data.initialPaidLeave) || 0,
    weeklySchedule: normalizeWeek(data.weeklySchedule, preset.weeklySchedule),
    employmentType,
    shiftPatterns: savedPatterns ?? defaultShiftPatterns(role, employmentType),
  };
}

function normalizeEmployment(value: unknown, role: StaffRole): EmploymentType {
  if (value === "full_time" || value === "short_time" || value === "part_time") return value;
  return defaultEmployment(role);
}

function inferRole(data: Record<string, unknown>): StaffRole {
  if (typeof data.role === "string" && data.role in ROLE_LABEL) return data.role as StaffRole;
  if (data.jobType === "rehab_part" || data.defaultPattern === "pattern_3") return "rehab_assistant";
  if (data.placement === "inpatient") return "pt_inpatient";
  return "pt_outpatient";
}

function normalizeWeek(value: unknown, fallback: Record<number, DayShiftSetting>): Record<number, DayShiftSetting> {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const week = { ...fallback };
  for (let index = 0; index < 7; index += 1) {
    const raw = source[index] ?? source[String(index)];
    if (!raw || typeof raw !== "object") continue;
    const day = raw as Partial<DayShiftSetting>;
    week[index] = recomputeScheduled({
      startTime: typeof day.startTime === "string" ? day.startTime : fallback[index].startTime,
      endTime: typeof day.endTime === "string" ? day.endTime : fallback[index].endTime,
      breakMinutes: Number(day.breakMinutes) || 0,
      scheduledMinutes: Number(day.scheduledMinutes) || 0,
      shiftCode: isShiftCode(day.shiftCode) ? day.shiftCode : fallback[index].shiftCode,
      isHoliday: Boolean(day.isHoliday),
      patternId: typeof day.patternId === "string" ? day.patternId : "",
    });
  }
  return week;
}

function isShiftCode(value: unknown): value is ShiftCode {
  return typeof value === "string";
}
