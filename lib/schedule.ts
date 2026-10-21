import type { DailyRecord, DayShiftSetting, HalfDayRuleType, MonthlyAttendance, ShiftCode, StaffRole } from "@/types/kintai";
import { deriveRecord, emptyPatternFields } from "@/lib/records";
import { expectedDuty, shiftFor, type DutyWindow } from "@/lib/shifts";
import { formatHHMM, parseHHMM } from "@/lib/time";

export const ROLE_LABEL: Record<StaffRole, string> = {
  pt_outpatient: "理学療法士（外来）",
  pt_inpatient: "理学療法士（入院）",
  rehab_assistant: "リハビリ助手（特定）",
  nurse: "看護師",
  clerk: "事務（医事・総務）",
  radiologist: "放射線技師",
  part_timer: "パート / その他",
  custom: "カスタム / シフト制（自由設定）",
};

export const HALF_RULE_LABEL: Record<HalfDayRuleType, string> = {
  equal_4h: "4h均等（午前休・午後休とも実働4.0h）",
  asymmetric_3_5_4h: "非対称（午前3.5h / 午後4.0h）",
};

const WEEKDAY_INDEX: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };

export const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;

export interface RolePreset {
  role: StaffRole;
  halfDayRule: HalfDayRuleType;
  sheetType: "pt" | "rehab_part";
  weeklySchedule: Record<number, DayShiftSetting>;
}

export function presetForRole(role: StaffRole): RolePreset {
  if (role === "rehab_assistant") {
    return {
      role,
      halfDayRule: "asymmetric_3_5_4h",
      sheetType: "rehab_part",
      weeklySchedule: schedule({
        0: holiday(),
        1: work("08:30", "17:00", 60, "7.5H"),
        2: work("08:30", "17:00", 60, "7.5H"),
        3: work("08:30", "17:00", 60, "7.5H"),
        4: work("08:30", "12:30", 0, "D"),
        5: work("08:30", "17:00", 60, "7.5H"),
        6: work("08:30", "12:30", 0, "D"),
      }),
    };
  }
  if (role === "pt_inpatient") {
    return {
      role,
      halfDayRule: "equal_4h",
      sheetType: "pt",
      weeklySchedule: schedule({
        0: holiday(),
        1: work("09:00", "18:00", 60, "B-2"),
        2: work("09:00", "18:00", 60, "B-2"),
        3: work("09:00", "18:00", 60, "B-2"),
        4: work("09:00", "18:00", 60, "B-2"),
        5: work("09:00", "18:00", 60, "B-2"),
        6: holiday(),
      }),
    };
  }
  if (role === "custom") {
    const open = (): DayShiftSetting => ({
      startTime: "",
      endTime: "",
      breakMinutes: 0,
      scheduledMinutes: 0,
      shiftCode: "",
      isHoliday: false,
    });
    return {
      role,
      halfDayRule: "equal_4h",
      sheetType: "pt",
      weeklySchedule: schedule({
        0: open(),
        1: open(),
        2: open(),
        3: open(),
        4: open(),
        5: open(),
        6: open(),
      }),
    };
  }
  if (role === "nurse") {
    return {
      role,
      halfDayRule: "equal_4h",
      sheetType: "rehab_part",
      weeklySchedule: schedule({
        0: holiday(),
        1: work("08:30", "17:30", 60, "A-1"),
        2: work("08:30", "17:30", 60, "A-1"),
        3: work("08:30", "17:30", 60, "A-1"),
        4: work("08:30", "17:30", 60, "A-1"),
        5: work("08:30", "17:30", 60, "A-1"),
        6: holiday(),
      }),
    };
  }
  if (role === "clerk" || role === "radiologist") {
    return {
      role,
      halfDayRule: "equal_4h",
      sheetType: "rehab_part",
      weeklySchedule: schedule({
        0: holiday(),
        1: work("08:30", "17:30", 60, "A-1"),
        2: work("08:30", "17:30", 60, "A-1"),
        3: work("08:30", "17:30", 60, "A-1"),
        4: work("08:30", "12:30", 0, "D"),
        5: work("08:30", "17:30", 60, "A-1"),
        6: work("08:30", "12:30", 0, "D"),
      }),
    };
  }
  if (role === "part_timer") {
    return {
      role,
      halfDayRule: "equal_4h",
      sheetType: "rehab_part",
      weeklySchedule: schedule({
        0: holiday(),
        1: work("08:30", "17:00", 60, "7.5H"),
        2: work("08:30", "17:00", 60, "7.5H"),
        3: work("08:30", "17:00", 60, "7.5H"),
        4: work("08:30", "17:00", 60, "7.5H"),
        5: work("08:30", "17:00", 60, "7.5H"),
        6: holiday(),
      }),
    };
  }
  return {
    role: "pt_outpatient",
    halfDayRule: "equal_4h",
    sheetType: "pt",
    weeklySchedule: schedule({
      0: holiday(),
      1: work("09:00", "18:00", 60, "B-2"),
      2: work("09:00", "18:00", 60, "B-2"),
      3: work("09:00", "18:00", 60, "B-2"),
      4: work("08:30", "12:30", 0, "D"),
      5: work("09:00", "18:00", 60, "B-2"),
      6: work("08:30", "12:30", 0, "D"),
    }),
  };
}

export function applyWeeklySchedule<T extends { sheetType: "pt" | "rehab_part"; weeklySchedule: Record<number, DayShiftSetting>; name: string; initialPaidLeave: number }>(
  attendance: MonthlyAttendance,
  staff: T,
): MonthlyAttendance {
  return {
    ...attendance,
    jobType: staff.sheetType,
    staffName: staff.name,
    initialPaidLeave: staff.initialPaidLeave,
    records: attendance.records.map((record) => applyScheduleDay(record, staff, "normal")),
  };
}

export function applyStaffDay<T extends { sheetType: "pt" | "rehab_part"; halfDayRule: HalfDayRuleType; weeklySchedule: Record<number, DayShiftSetting>; name?: string; initialPaidLeave?: number }>(
  attendance: MonthlyAttendance,
  staff: T,
  mode: "normal" | "am" | "pm",
  date: string,
): MonthlyAttendance {
  const index = attendance.records.findIndex((record) => record.date === date);
  if (index < 0) return attendance;
  const records = attendance.records.slice();
  records[index] = applyScheduleDay(records[index], staff, mode);
  return { ...attendance, jobType: staff.sheetType, records };
}

export function halfWindow(
  rule: HalfDayRuleType,
  mode: "am" | "pm",
  day: DayShiftSetting,
  sheetType: "pt" | "rehab_part",
): { clockIn: string; clockOut: string; scheduledMinutes: number } {
  if (rule === "asymmetric_3_5_4h") {
    return mode === "pm"
      ? { clockIn: "08:30", clockOut: "12:00", scheduledMinutes: 210 }
      : { clockIn: "13:00", clockOut: "17:00", scheduledMinutes: 240 };
  }
  if (mode === "am") return { clockIn: "13:00", clockOut: "17:00", scheduledMinutes: 240 };
  const start = day.isHoliday ? (sheetType === "pt" ? "09:00" : "08:30") : day.startTime || "09:00";
  const startMin = parseHHMM(start) ?? 9 * 60;
  return { clockIn: start, clockOut: formatHHMM(startMin + 240), scheduledMinutes: 240 };
}

export function holidayDay(): DayShiftSetting {
  return { startTime: "", endTime: "", breakMinutes: 0, scheduledMinutes: 0, shiftCode: "", isHoliday: true };
}

export function dayFromShiftCode(code: ShiftCode): DayShiftSetting {
  const shift = shiftFor(code);
  if (!shift) return holidayDay();
  return {
    startTime: shift.start,
    endTime: shift.end,
    breakMinutes: shift.breakMinutes,
    scheduledMinutes: shift.scheduledMinutes,
    shiftCode: code,
    isHoliday: false,
  };
}

export function dutyFromSetting(day: DayShiftSetting | undefined): DutyWindow | null {
  if (!day || day.isHoliday || !day.startTime || !day.endTime) return null;
  const scheduled = recomputeScheduled(day);
  return {
    start: scheduled.startTime,
    end: scheduled.endTime,
    breakMinutes: scheduled.breakMinutes,
    scheduledMinutes: scheduled.scheduledMinutes,
  };
}

export function recomputeScheduled(day: DayShiftSetting): DayShiftSetting {
  if (day.isHoliday) return holidayDay();
  const start = parseHHMM(day.startTime);
  const end = parseHHMM(day.endTime);
  if (start == null || end == null || end <= start) return { ...day, scheduledMinutes: 0 };
  return { ...day, scheduledMinutes: Math.max(0, end - start - (Number(day.breakMinutes) || 0)) };
}

function applyScheduleDay(
  record: DailyRecord,
  staff: { sheetType: "pt" | "rehab_part"; halfDayRule?: HalfDayRuleType; weeklySchedule: Record<number, DayShiftSetting> },
  mode: "normal" | "am" | "pm",
): DailyRecord {
  const day = staff.weeklySchedule[WEEKDAY_INDEX[record.dayOfWeek] ?? 0] ?? holiday();
  if (mode === "normal") {
    if (day.isHoliday) return clearWork(record);
    return assignScheduledWork(record, day.shiftCode, day.startTime, day.endTime, day.breakMinutes);
  }
  const rule = staff.halfDayRule ?? "equal_4h";
  const window = halfWindow(rule, mode, day, staff.sheetType);
  const shift = day.isHoliday || !day.shiftCode ? (staff.sheetType === "pt" ? "B-2" : "7.5H") : day.shiftCode;
  return {
    ...record,
    ...emptyPatternFields(),
    shiftCode: shift,
    clockIn: window.clockIn,
    clockOut: window.clockOut,
    breakMinutes: 0,
    halfDayType: mode,
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

function assignScheduledWork(record: DailyRecord, shift: ShiftCode, start: string, end: string, breakMinutes: number): DailyRecord {
  const definition = shiftFor(shift);
  const duty = definition ? expectedDuty(definition, "none") : null;
  const matches = Boolean(duty && duty.start === start && duty.end === end && duty.breakMinutes === breakMinutes);
  const next: DailyRecord = {
    ...record,
    ...emptyPatternFields(),
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

function clearWork(record: DailyRecord): DailyRecord {
  return {
    ...record,
    koukyu: "○",
    kekkin: "",
    tokki: "",
    yukyu: "",
    halfDayType: "none",
    shiftCode: "",
    ...emptyPatternFields(),
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

function work(startTime: string, endTime: string, breakMinutes: number, shiftCode: ShiftCode): DayShiftSetting {
  return recomputeScheduled({ startTime, endTime, breakMinutes, scheduledMinutes: 0, shiftCode, isHoliday: false });
}

function holiday(): DayShiftSetting {
  return holidayDay();
}

function schedule(days: Record<number, DayShiftSetting>): Record<number, DayShiftSetting> {
  return days;
}
