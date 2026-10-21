export type JobType = "pt" | "rehab_part";

export type LeaveMark = "" | "○" | "△";

export type HalfDayType = "none" | "am" | "pm" | "am_off" | "pm_off";

export type Placement = "outpatient" | "inpatient";

/** アクセス権限（閲覧・管理範囲） */
export type UserRole = "staff" | "manager" | "admin";

/** 診療科・部門 */
export type Department = "rehabilitation" | "nursing" | "radiology" | "office" | "other";

/** 職種・勤務区分（シフトプリセット用） */
export type StaffRole =
  | "pt_outpatient"
  | "pt_inpatient"
  | "rehab_assistant"
  | "part_timer"
  | "nurse"
  | "clerk"
  | "radiologist"
  | "custom";

export type HalfDayRuleType = "equal_4h" | "asymmetric_3_5_4h";

export type EmploymentType = "full_time" | "short_time" | "part_time";

export interface CustomShiftPattern {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  shiftCode: string;
  isOvernight?: boolean;
}

export interface DayShiftSetting {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  scheduledMinutes: number;
  shiftCode: ShiftCode;
  isHoliday: boolean;
  patternId?: string;
}

export type KnownShiftCode = "B-2" | "A-1" | "D" | "7.5H" | "free" | "";

export type ShiftCode = string;

export interface DailyRecord {
  date: string;
  dayOfMonth: number;
  dayOfWeek: string;
  koukyu: LeaveMark;
  kekkin: LeaveMark;
  tokki: LeaveMark;
  yukyu: LeaveMark;
  halfDayType: HalfDayType;
  shiftCode: ShiftCode;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  overtimeSpan: string;
  overtimeMinutes: number;
  overtimeManual: boolean;
  shortageTime: string;
  shortageManual: boolean;
  note: string;
  patternId: string;
  patternLabel: string;
  contractStart: string;
  contractEnd: string;
  contractBreak: number;
  isOvernight: boolean;
}

export interface MonthlyAttendance {
  year: number;
  month: number;
  jobType: JobType;
  staffName: string;
  initialPaidLeave: number;
  lunchCount: number;
  lunchUnitPrice: number;
  records: DailyRecord[];
}
