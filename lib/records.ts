import type { DailyRecord, HalfDayType, JobType, LeaveMark, MonthlyAttendance, ShiftCode } from "@/types/kintai";
import { computeDeviation } from "@/lib/calc";
import { formatISODate, weekdayLabel } from "@/lib/date";
import { isPublicRestDay } from "@/lib/holidays";
import { getPeriod } from "@/lib/period";
import { expectedDuty, shiftFor } from "@/lib/shifts";
import { formatShortage } from "@/lib/time";

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
  };
}

export function deriveRecord(record: DailyRecord, personalMinutes?: number | null): DailyRecord {
  const shift = shiftFor(record.shiftCode);
  if (!shift) return record;

  const duty = expectedDuty(shift, record.halfDayType, personalMinutes);
  if (!duty.start || !duty.end || !record.clockIn || !record.clockOut) {
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

export function chooseShift(record: DailyRecord, code: ShiftCode, personalMinutes?: number | null): DailyRecord {
  if (!code) {
    return deriveRecord(
      {
        ...record,
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
      personalMinutes,
    );
  }

  if (code === "free") {
    return {
      ...record,
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
      ...record,
      shiftCode: code,
      koukyu: "",
      tokki: "",
      yukyu: record.halfDayType === "am" || record.halfDayType === "pm" ? "△" : "",
      kekkin: record.kekkin === "○" ? "" : record.kekkin,
    },
    personalMinutes,
  );
}

export function chooseHalf(record: DailyRecord, half: HalfDayType, personalMinutes?: number | null): DailyRecord {
  const paidHalf = half === "am" || half === "pm";
  const next: DailyRecord = {
    ...record,
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
  if (!on) {
    return { ...record, [kind]: "" };
  }
  return {
    ...record,
    koukyu: kind === "koukyu" ? "○" : "",
    kekkin: "",
    tokki: kind === "tokki" ? "○" : "",
    yukyu: kind === "yukyu" ? "○" : "",
    ...clearedTimes(),
  };
}

export function chooseKekkin(record: DailyRecord, mark: LeaveMark): DailyRecord {
  if (mark === "○") {
    return {
      ...record,
      koukyu: "",
      kekkin: "○",
      tokki: "",
      yukyu: "",
      ...clearedTimes(),
    };
  }
  if (mark === "△") {
    return deriveRecord({
      ...record,
      kekkin: "△",
      koukyu: "",
      tokki: "",
      yukyu: record.halfDayType === "none" ? "" : "△",
    });
  }
  return { ...record, kekkin: "" };
}

export function editClocks(
  record: DailyRecord,
  patch: Partial<Pick<DailyRecord, "clockIn" | "clockOut" | "breakMinutes">>,
  personalMinutes?: number | null,
): DailyRecord {
  return deriveRecord(
    {
      ...record,
      ...patch,
      overtimeManual: record.shiftCode === "free" ? record.overtimeManual : false,
      shortageManual: false,
    },
    personalMinutes,
  );
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
