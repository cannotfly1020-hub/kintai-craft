import type {
  CustomShiftPattern,
  DayShiftSetting,
  Department,
  EmploymentType,
  HalfDayRuleType,
  JobType,
  MonthlyAttendance,
  ShiftCode,
  StaffRole,
  UserRole,
} from "@/types/kintai";
import {
  defaultDepartmentForJobRole,
  isDepartment,
  isUserRole,
} from "@/lib/access";
import { presetForRole, recomputeScheduled, ROLE_LABEL } from "@/lib/schedule";
import { defaultContractHours, defaultEmployment, defaultShiftPatterns, normalizePatterns } from "@/lib/shift-patterns";
import { defaultClosing } from "@/lib/period";
import { createAttendance } from "@/lib/records";
import { parseAttendance } from "@/lib/storage";

export interface StaffMember {
  id: string;
  name: string;
  /** アクセス権限 */
  role: UserRole;
  /** 所属科 */
  department: Department;
  /** 職種・勤務区分（シフトプリセット） */
  jobRole: StaffRole;
  /** 職種の表示名（未設定時は ROLE_LABEL[jobRole]） */
  jobTitle?: string;
  halfDayRule: HalfDayRuleType;
  sheetType: JobType;
  initialPaidLeave: number;
  weeklySchedule: Record<number, DayShiftSetting>;
  employmentType: EmploymentType;
  shiftPatterns: CustomShiftPattern[];
  contractHoursPerDay?: number;
  /** 旧localStorage互換のみ。UIでは扱わない */
  hourlyWage?: number;
}

export const STAFF_LIST_KEY = "kintai_craft_staff_list_v1";
export const CURRENT_STAFF_KEY = "kintai_craft_current_staff_id_v1";
export const CURRENT_USER_KEY = "kintai_craft_current_user_id_v1";

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

export function loadCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function saveCurrentUserId(userId: string) {
  localStorage.setItem(CURRENT_USER_KEY, userId);
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

export function ensureStaffWorkspace(): { staff: StaffMember[]; currentId: string; currentUserId: string } {
  let existing = loadStaffList();
  if (existing.length === 0) {
    existing = [migrateLegacyStaff()];
  }
  existing = ensureDemoAccounts(existing);
  saveStaffList(existing);

  const raw = localStorage.getItem(STAFF_LIST_KEY) ?? "";
  if (/AMパート|PMパート|AM半休|PM半休|\bAM\b|\bPM\b/.test(raw)) {
    saveStaffList(existing);
  }

  const storedUser = loadCurrentUserId();
  const currentUserId = existing.some((staff) => staff.id === storedUser) ? (storedUser as string) : pickDefaultUserId(existing);
  saveCurrentUserId(currentUserId);

  const storedStaff = loadCurrentStaffId();
  const currentId = existing.some((staff) => staff.id === storedStaff) ? (storedStaff as string) : currentUserId;
  saveCurrentStaffId(currentId);
  return { staff: existing, currentId, currentUserId };
}

function pickDefaultUserId(staff: StaffMember[]): string {
  return staff.find((item) => item.role === "admin")?.id ?? staff[0].id;
}

/** デモ切替用の利用者を不足分だけ追加（既存のテスト太郎等は壊さない） */
function ensureDemoAccounts(staff: StaffMember[]): StaffMember[] {
  const byId = new Map(staff.map((item) => [item.id, item]));
  for (const seed of demoAccountSeeds()) {
    if (!byId.has(seed.id)) {
      byId.set(seed.id, seed);
    }
  }
  return Array.from(byId.values());
}

function demoAccountSeeds(): StaffMember[] {
  return [
    buildSeedStaff({
      id: "demo_yamada",
      name: "山田",
      role: "staff",
      department: "rehabilitation",
      jobRole: "pt_outpatient",
      initialPaidLeave: 10,
    }),
    buildSeedStaff({
      id: "demo_sato",
      name: "佐藤",
      role: "manager",
      department: "rehabilitation",
      jobRole: "pt_outpatient",
      initialPaidLeave: 12,
    }),
    buildSeedStaff({
      id: "demo_suzuki",
      name: "鈴木",
      role: "admin",
      department: "office",
      jobRole: "clerk",
      initialPaidLeave: 15,
    }),
    buildSeedStaff({
      id: "demo_tanaka",
      name: "田中",
      role: "staff",
      department: "nursing",
      jobRole: "nurse",
      initialPaidLeave: 10,
    }),
  ];
}

function buildSeedStaff(input: {
  id: string;
  name: string;
  role: UserRole;
  department: Department;
  jobRole: StaffRole;
  initialPaidLeave: number;
}): StaffMember {
  const preset = presetForRole(input.jobRole);
  const employmentType = defaultEmployment(input.jobRole);
  return {
    id: input.id,
    name: input.name,
    role: input.role,
    department: input.department,
    jobRole: input.jobRole,
    halfDayRule: preset.halfDayRule,
    sheetType: preset.sheetType,
    initialPaidLeave: input.initialPaidLeave,
    weeklySchedule: preset.weeklySchedule,
    employmentType,
    shiftPatterns: defaultShiftPatterns(input.jobRole, employmentType),
  };
}

function migrateLegacyStaff(): StaffMember {
  const legacyJob: JobType = localStorage.getItem(LEGACY_JOB_KEY) === "rehab_part" ? "rehab_part" : "pt";
  const storedPattern = localStorage.getItem(LEGACY_PATTERN_KEY);
  const jobRole: StaffRole = storedPattern === "pattern_3" || legacyJob === "rehab_part" ? "rehab_assistant" : "pt_outpatient";
  const preset = presetForRole(jobRole);
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
    role: "admin",
    department: defaultDepartmentForJobRole(preset.role),
    jobRole: preset.role,
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
  const jobRole = inferJobRole(data);
  const preset = presetForRole(jobRole);
  const halfDayRule = data.halfDayRule === "equal_4h" || data.halfDayRule === "asymmetric_3_5_4h" ? data.halfDayRule : preset.halfDayRule;
  const sheetType = data.sheetType === "pt" || data.sheetType === "rehab_part" ? data.sheetType : preset.sheetType;
  const employmentType = normalizeEmployment(data.employmentType, jobRole);
  const savedPatterns = Array.isArray(data.shiftPatterns) ? normalizePatterns(data.shiftPatterns) : null;
  const shiftPatterns = savedPatterns ?? defaultShiftPatterns(jobRole, employmentType);
  const contractHoursPerDay = normalizeHours(data.contractHoursPerDay);
  const department = isDepartment(data.department) ? data.department : defaultDepartmentForJobRole(jobRole);
  const role = inferAccessRole(data);
  const jobTitle = typeof data.jobTitle === "string" && data.jobTitle.trim() ? data.jobTitle.trim() : undefined;
  return {
    id: data.id,
    name: typeof data.name === "string" ? data.name : "",
    role,
    department,
    jobRole,
    jobTitle,
    halfDayRule,
    sheetType,
    initialPaidLeave: Number(data.initialPaidLeave) || 0,
    weeklySchedule: normalizeWeek(data.weeklySchedule, preset.weeklySchedule),
    employmentType,
    shiftPatterns,
    contractHoursPerDay:
      employmentType === "part_time" ? (contractHoursPerDay ?? defaultContractHours(shiftPatterns)) : contractHoursPerDay,
    hourlyWage: normalizeWage(data.hourlyWage),
  };
}

function normalizeHours(value: unknown): number | undefined {
  const hours = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return undefined;
  return Math.round(hours * 10) / 10;
}

function normalizeWage(value: unknown): number | undefined {
  const wage = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(wage) || wage <= 0) return undefined;
  return Math.round(wage);
}

function normalizeEmployment(value: unknown, jobRole: StaffRole): EmploymentType {
  if (value === "full_time" || value === "short_time" || value === "part_time") return value;
  return defaultEmployment(jobRole);
}

/** 旧データは role に職種が入っていた。新形式は jobRole + role(権限) */
function inferJobRole(data: Record<string, unknown>): StaffRole {
  if (typeof data.jobRole === "string" && data.jobRole in ROLE_LABEL) return data.jobRole as StaffRole;
  if (typeof data.role === "string" && data.role in ROLE_LABEL) return data.role as StaffRole;
  if (data.jobType === "rehab_part" || data.defaultPattern === "pattern_3") return "rehab_assistant";
  if (data.placement === "inpatient") return "pt_inpatient";
  return "pt_outpatient";
}

function inferAccessRole(data: Record<string, unknown>): UserRole {
  if (isUserRole(data.accessRole)) return data.accessRole;
  if (isUserRole(data.role) && !(data.role in ROLE_LABEL)) return data.role;
  // 旧データは権限フィールドがない → 従来どおり全機能を使えるよう admin
  return "admin";
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
