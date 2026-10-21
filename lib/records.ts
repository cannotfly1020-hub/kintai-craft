import type { CustomShiftPattern, DailyRecord, DayShiftSetting, HalfDayType, JobType, LeaveMark, MonthlyAttendance, ShiftCode } from "@/types/kintai";
import { computeDeviation } from "@/lib/calc";
import { formatISODate, weekdayLabel } from "@/lib/date";
import { isPublicRestDay } from "@/lib/holidays";
import { getPeriod } from "@/lib/period";
import { contractFromRecord, dutyFromPattern, primaryWorkPattern } from "@/lib/shift-patterns";
import { expectedDuty, shiftFor, SHIFTS, type DutyWindow } from "@/lib/shifts";
import {
  HOLIDAY_WORK_ID,
  HOLIDAY_WORK_NOTE,
  SUBSTITUTE_HOLIDAY_ID,
  SUBSTITUTE_HOLIDAY_NOTE,
  SUBSTITUTE_WORK_ID,
  SUBSTITUTE_WORK_NOTE,
  clearSpecialDutyFlags,
  isHolidayWork,
  withHolidayNote,
} from "@/lib/holiday-work";
import { formatShortage, scheduledWorkMinutes } from "@/lib/time";

export {
  HOLIDAY_WORK_ID,
  HOLIDAY_WORK_NOTE,
  SUBSTITUTE_HOLIDAY_ID,
  SUBSTITUTE_HOLIDAY_NOTE,
  SUBSTITUTE_WORK_ID,
  SUBSTITUTE_WORK_NOTE,
  isHolidayWork,
  isSubstituteHoliday,
  isSubstituteWork,
  isSpecialDutyMode,
} from "@/lib/holiday-work";

export function emptyPatternFields(): Pick<
  DailyRecord,
  "patternId" | "patternLabel" | "contractStart" | "contractEnd" | "contractBreak" | "isOvernight"
> {
  return {
    patternId: "",
    patternLabel: "",
    contractStart: "",
    contractEnd: "",
    contractBreak: 0,
    isOvernight: false,
  };
}

function clearedTimes(): Pick<
  DailyRecord,
  | "shiftCode"
  | "clockIn"
  | "clockOut"
  | "breakMinutes"
  | "overtimeSpan"
  | "overtimeMinutes"
  | "overtimeManual"
  | "shortageTime"
  | "shortageManual"
  | "halfDayType"
  | "patternId"
  | "patternLabel"
  | "contractStart"
  | "contractEnd"
  | "contractBreak"
  | "isOvernight"
> {
  return {
    shiftCode: "",
    clockIn: "",
    clockOut: "",
    breakMinutes: 0,
    overtimeSpan: "",
    overtimeMinutes: 0,
    overtimeManual: false,
    shortageTime: "",
    shortageManual: false,
    halfDayType: "none",
    ...emptyPatternFields(),
  };
}

export function deriveRecord(record: DailyRecord, personalMinutes?: number | null, dutyOverride?: DutyWindow | null): DailyRecord {
  const shift = shiftFor(record.shiftCode);
  const duty = dutyOverride ?? contractFromRecord(record) ?? (shift ? expectedDuty(shift, record.halfDayType, personalMinutes) : null);
  if (!duty?.start || !duty.end || !record.clockIn || !record.clockOut) {
    if (!shift && !dutyOverride && !record.contractStart) return record;
    return {
      ...record,
      overtimeMinutes: record.overtimeManual ? record.overtimeMinutes : 0,
      overtimeSpan: record.overtimeManual ? record.overtimeSpan : "",
      shortageTime: record.shortageManual ? record.shortageTime : "",
    };
  }

  const deviation = computeDeviation(
    record.clockIn,
    record.clockOut,
    duty.start,
    duty.end,
    record.breakMinutes,
    duty.breakMinutes,
    Boolean(duty.overnight),
  );
  if (!deviation) return record;

  return {
    ...record,
    overtimeMinutes: record.overtimeManual ? record.overtimeMinutes : deviation.overtimeMinutes,
    overtimeSpan: record.overtimeManual ? record.overtimeSpan : deviation.span,
    shortageTime: record.shortageManual ? record.shortageTime : formatShortage(deviation.shortageMinutes),
  };
}

export function emptyRecord(date: Date): DailyRecord {
  return {
    date: formatISODate(date),
    dayOfMonth: date.getDate(),
    dayOfWeek: weekdayLabel(date),
    koukyu: "",
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
    note: "",
    ...emptyPatternFields(),
  };
}

export function createAttendance(input: {
  year: number;
  month: number;
  jobType: JobType;
  staffName?: string;
  initialPaidLeave?: number;
  lunchCount?: number;
  lunchUnitPrice?: number;
}): MonthlyAttendance {
  const period = getPeriod(input.year, input.month);
  return {
    year: input.year,
    month: input.month,
    jobType: input.jobType,
    staffName: input.staffName ?? "",
    initialPaidLeave: input.initialPaidLeave ?? 0,
    lunchCount: input.lunchCount ?? 0,
    lunchUnitPrice: input.lunchUnitPrice ?? 0,
    records: period.dates.map(emptyRecord),
  };
}

export function isBlankRecord(record: DailyRecord): boolean {
  return (
    !record.koukyu &&
    !record.kekkin &&
    !record.tokki &&
    !record.yukyu &&
    record.halfDayType === "none" &&
    !record.shiftCode &&
    !record.clockIn &&
    !record.clockOut &&
    !record.note &&
    record.overtimeMinutes === 0 &&
    !record.shortageTime
  );
}

function applyDutyClocks(record: DailyRecord, personalMinutes?: number | null): DailyRecord {
  const shift = shiftFor(record.shiftCode);
  if (!shift) return deriveRecord(record, personalMinutes);
  const duty = expectedDuty(shift, record.halfDayType, personalMinutes);
  return deriveRecord(
    {
      ...record,
      clockIn: duty.start,
      clockOut: duty.end,
      breakMinutes: duty.breakMinutes,
      overtimeManual: false,
      shortageManual: false,
    },
    personalMinutes,
  );
}

export function chooseShift(record: DailyRecord, code: ShiftCode, _personalMinutes?: number | null): DailyRecord {
  const base = clearSpecialDutyFlags(record);
  if (!code) {
    return deriveRecord(
      {
        ...base,
        ...emptyPatternFields(),
        shiftCode: "",
        clockIn: "",
        clockOut: "",
        breakMinutes: 0,
        overtimeSpan: "",
        overtimeMinutes: 0,
        overtimeManual: false,
        shortageTime: "",
        shortageManual: false,
      },
      _personalMinutes,
    );
  }

  if (code === "free") {
    return {
      ...base,
      ...emptyPatternFields(),
      shiftCode: "free",
      overtimeManual: true,
      overtimeMinutes: 0,
      overtimeSpan: "",
      koukyu: "",
      tokki: "",
      yukyu: record.halfDayType === "am" || record.halfDayType === "pm" ? "△" : "",
      kekkin: record.kekkin === "○" ? "" : record.kekkin,
    };
  }

  return applyDutyClocks(
    {
      ...base,
      ...emptyPatternFields(),
      shiftCode: code,
      halfDayType: "none",
      koukyu: "",
      tokki: "",
      yukyu: "",
      kekkin: record.kekkin === "○" ? "" : record.kekkin,
    },
    null,
  );
}

export function applyShiftPattern(record: DailyRecord, pattern: CustomShiftPattern): DailyRecord {
  const duty = dutyFromPattern(pattern);
  if (!duty) return record;
  const shiftCode = pattern.shiftCode.trim() || pattern.label.trim() || "free";
  const base = clearSpecialDutyFlags(record);
  return deriveRecord({
    ...base,
    shiftCode,
    patternId: pattern.id,
    patternLabel: pattern.label.trim() || shiftCode,
    contractStart: duty.start,
    contractEnd: duty.end,
    contractBreak: duty.breakMinutes,
    isOvernight: Boolean(duty.overnight),
    clockIn: duty.start,
    clockOut: duty.end,
    breakMinutes: duty.breakMinutes,
    halfDayType: "none",
    koukyu: "",
    tokki: "",
    yukyu: "",
    kekkin: record.kekkin === "○" ? "" : record.kekkin,
    overtimeManual: false,
    shortageManual: false,
  });
}

export function applyAke(record: DailyRecord): DailyRecord {
  const base = clearSpecialDutyFlags(record);
  return {
    ...base,
    ...emptyPatternFields(),
    patternId: "ake",
    patternLabel: "明け",
    shiftCode: "明け",
    clockIn: "",
    clockOut: "",
    breakMinutes: 0,
    isOvernight: false,
    halfDayType: "none",
    koukyu: "",
    tokki: "",
    yukyu: "",
    kekkin: "",
    overtimeSpan: "",
    overtimeMinutes: 0,
    overtimeManual: false,
    shortageTime: "",
    shortageManual: false,
  };
}

export function chooseHalf(record: DailyRecord, half: HalfDayType, personalMinutes?: number | null): DailyRecord {
  const paidHalf = half === "am" || half === "pm";
  const base = clearSpecialDutyFlags(record);
  const next: DailyRecord = {
    ...base,
    ...emptyPatternFields(),
    halfDayType: half,
    yukyu: paidHalf ? "△" : record.yukyu === "△" ? "" : record.yukyu,
    koukyu: half === "none" ? record.koukyu : "",
    tokki: half === "none" ? record.tokki : "",
    kekkin: half !== "none" && record.kekkin === "○" ? "" : record.kekkin,
  };
  if (next.yukyu === "○") next.yukyu = paidHalf ? "△" : "○";
  if (shiftFor(next.shiftCode)) return applyDutyClocks(next, personalMinutes);
  return next;
}

export function chooseFullLeave(
  record: DailyRecord,
  kind: "koukyu" | "tokki" | "yukyu",
  on: boolean,
): DailyRecord {
  const base = clearSpecialDutyFlags(record);
  if (!on) {
    return { ...base, [kind]: "" };
  }
  return {
    ...base,
    koukyu: kind === "koukyu" ? "○" : "",
    kekkin: "",
    tokki: kind === "tokki" ? "○" : "",
    yukyu: kind === "yukyu" ? "○" : "",
    ...clearedTimes(),
  };
}

export function chooseKekkin(record: DailyRecord, mark: LeaveMark): DailyRecord {
  const base = clearSpecialDutyFlags(record);
  if (mark === "○") {
    return {
      ...base,
      koukyu: "",
      kekkin: "○",
      tokki: "",
      yukyu: "",
      ...clearedTimes(),
    };
  }
  if (mark === "△") {
    return deriveRecord({
      ...base,
      kekkin: "△",
      koukyu: "",
      tokki: "",
      yukyu: record.halfDayType === "none" ? "" : "△",
    });
  }
  return { ...base, kekkin: "" };
}

function overtimeSpanForDuty(duty: Pick<DutyWindow, "start" | "end" | "overnight">): string {
  if (!duty.start || !duty.end) return "";
  return duty.overnight ? `${duty.start}〜翌${duty.end}` : `${duty.start}〜${duty.end}`;
}

/** 職員の標準勤務（マイ・シフト優先、なければ職種デフォルト） */
export function resolveStandardWork(input: {
  patterns?: CustomShiftPattern[];
  weeklySchedule?: Record<number, DayShiftSetting>;
  sheetType: JobType;
}): { duty: DutyWindow; shiftCode: ShiftCode; pattern: CustomShiftPattern | null } {
  const pattern = primaryWorkPattern(input.patterns ?? []);
  if (pattern) {
    const duty = dutyFromPattern(pattern);
    if (duty) {
      return {
        duty,
        shiftCode: (pattern.shiftCode.trim() || pattern.label.trim() || (input.sheetType === "pt" ? "B-2" : "7.5H")) as ShiftCode,
        pattern,
      };
    }
  }
  const week = input.weeklySchedule;
  if (week) {
    const workday = [1, 2, 3, 4, 5].map((day) => week[day]).find((day) => day && !day.isHoliday && day.startTime && day.endTime);
    if (workday) {
      return {
        duty: {
          start: workday.startTime,
          end: workday.endTime,
          breakMinutes: workday.breakMinutes,
          scheduledMinutes: workday.scheduledMinutes,
          overnight: workday.startTime > workday.endTime,
        },
        shiftCode: workday.shiftCode || (input.sheetType === "pt" ? "B-2" : "7.5H"),
        pattern: null,
      };
    }
  }
  const fallback = input.sheetType === "pt" ? SHIFTS["B-2"] : SHIFTS["7.5H"] ?? SHIFTS["A-1"];
  return {
    duty: {
      start: fallback.start,
      end: fallback.end,
      breakMinutes: fallback.breakMinutes,
      scheduledMinutes: fallback.scheduledMinutes,
    },
    shiftCode: fallback.code,
    pattern: null,
  };
}

/** 休日出勤: 実働全量を時間外・休日へ、備考に「休日出勤」 */
export function applyHolidayWork(record: DailyRecord, duty: DutyWindow): DailyRecord {
  const worked = scheduledWorkMinutes(duty.start, duty.end, duty.breakMinutes);
  const base = clearSpecialDutyFlags(record);
  return {
    ...base,
    ...emptyPatternFields(),
    patternId: HOLIDAY_WORK_ID,
    patternLabel: "休出",
    shiftCode: "",
    clockIn: duty.start,
    clockOut: duty.end,
    breakMinutes: duty.breakMinutes,
    isOvernight: Boolean(duty.overnight),
    halfDayType: "none",
    koukyu: "",
    tokki: "",
    yukyu: "",
    kekkin: record.kekkin === "○" ? "" : record.kekkin,
    overtimeSpan: overtimeSpanForDuty(duty),
    overtimeMinutes: worked,
    overtimeManual: true,
    shortageTime: "",
    shortageManual: true,
    note: withHolidayNote(base.note, HOLIDAY_WORK_NOTE),
  };
}

/** 振替出勤: 通常出勤印＋所定超過のみ残業、備考に「振替出勤」（patternId は専用IDで排他） */
export function applySubstituteWork(
  record: DailyRecord,
  standard: { duty: DutyWindow; shiftCode: ShiftCode; pattern: CustomShiftPattern | null },
): DailyRecord {
  const cleared = clearSpecialDutyFlags(record);
  const base = standard.pattern
    ? applyShiftPattern(cleared, standard.pattern)
    : chooseShift(cleared, standard.shiftCode);
  return {
    ...base,
    patternId: SUBSTITUTE_WORK_ID,
    patternLabel: "振出",
    note: withHolidayNote(base.note, SUBSTITUTE_WORK_NOTE),
  };
}

/** 振替休日: 勤務日を休みに入れ替え（公休○＋備考「振替休日」） */
export function applySubstituteHoliday(record: DailyRecord): DailyRecord {
  const base = clearSpecialDutyFlags(record);
  return {
    ...base,
    ...clearedTimes(),
    patternId: SUBSTITUTE_HOLIDAY_ID,
    patternLabel: "振休",
    koukyu: "○",
    kekkin: "",
    tokki: "",
    yukyu: "",
    note: withHolidayNote(base.note, SUBSTITUTE_HOLIDAY_NOTE),
  };
}

export function editClocks(
  record: DailyRecord,
  patch: Partial<Pick<DailyRecord, "clockIn" | "clockOut" | "breakMinutes">>,
  personalMinutes?: number | null,
  dutyOverride?: DutyWindow | null,
): DailyRecord {
  const next = deriveRecord(
    {
      ...record,
      ...patch,
      overtimeManual:
        isHolidayWork(record) || (record.shiftCode === "free" && !record.contractStart) ? record.overtimeManual : false,
      shortageManual: isHolidayWork(record) ? true : false,
    },
    personalMinutes,
    dutyOverride,
  );
  if (!isHolidayWork(record) && next.patternId !== HOLIDAY_WORK_ID) return next;
  const clockIn = next.clockIn;
  const clockOut = next.clockOut;
  const worked = clockIn && clockOut ? scheduledWorkMinutes(clockIn, clockOut, next.breakMinutes) : 0;
  return {
    ...next,
    patternId: HOLIDAY_WORK_ID,
    patternLabel: "休出",
    shiftCode: "",
    koukyu: "",
    overtimeSpan: clockIn && clockOut ? overtimeSpanForDuty({ start: clockIn, end: clockOut, overnight: next.isOvernight }) : "",
    overtimeMinutes: worked,
    overtimeManual: true,
    shortageTime: "",
    shortageManual: true,
    note: withHolidayNote(next.note, HOLIDAY_WORK_NOTE),
  };
}

export function editShortage(record: DailyRecord, shortageTime: string): DailyRecord {
  return { ...record, shortageTime, shortageManual: true };
}

export function editNote(record: DailyRecord, note: string): DailyRecord {
  return { ...record, note };
}

export function editOvertime(
  record: DailyRecord,
  overtimeSpan: string,
  overtimeMinutes: number,
): DailyRecord {
  return {
    ...record,
    overtimeSpan,
    overtimeMinutes,
    overtimeManual: true,
  };
}

export function resetAutomaticOvertime(record: DailyRecord, personalMinutes?: number | null): DailyRecord {
  return deriveRecord({ ...record, overtimeManual: false }, personalMinutes);
}

export function applyHolidayDefaults(records: DailyRecord[]): DailyRecord[] {
  return records.map((record) => {
    if (!isBlankRecord(record)) return record;
    const date = new Date(record.date + "T00:00:00");
    if (!isPublicRestDay(date)) return record;
    return chooseFullLeave(record, "koukyu", true);
  });
}
