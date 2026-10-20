export type JobType = "pt" | "rehab_part";

export type LeaveMark = "" | "○" | "△";

export type HalfDayType = "none" | "am" | "pm" | "am_off" | "pm_off";

export type Placement = "outpatient" | "inpatient";

export type StaffRole = "pt_outpatient" | "pt_inpatient" | "rehab_assistant" | "part_timer";

export type HalfDayRuleType = "equal_4h" | "asymmetric_3_5_4h";

export interface DayShiftSetting {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  scheduledMinutes: number;
  shiftCode: ShiftCode;
  isHoliday: boolean;
}

export type ShiftCode = "B-2" | "A-1" | "D" | "7.5H" | "free" | "";

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
