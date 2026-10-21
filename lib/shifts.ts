import type { HalfDayType, JobType, KnownShiftCode } from "@/types/kintai";
import { formatHHMM, formatHours, parseHHMM } from "@/lib/time";

export const AM_HALF_MINUTES = 210;
export const PM_HALF_MINUTES = 240;

export interface ShiftDefinition {
  code: Exclude<KnownShiftCode, "" | "free">;
  label: string;
  jobs: JobType[];
  start: string;
  end: string;
  breakMinutes: number;
  scheduledMinutes: number;
  morningEnd: string;
  afternoonStart: string;
  morningMinutes: number;
  afternoonMinutes: number;
}

export interface DutyWindow {
  start: string;
  end: string;
  breakMinutes: number;
  scheduledMinutes: number;
  overnight?: boolean;
}

export const JOB_LABEL: Record<JobType, string> = {
  pt: "理学療法士",
  rehab_part: "リハビリフルタイムパート",
};

const EMPTY_DUTY: DutyWindow = {
  start: "",
  end: "",
  breakMinutes: 0,
  scheduledMinutes: 0,
};

export const SHIFTS: Record<ShiftDefinition["code"], ShiftDefinition> = {
  "B-2": {
    code: "B-2",
    label: "B-2 (8H)",
    jobs: ["pt"],
    start: "09:00",
    end: "18:00",
    breakMinutes: 60,
    scheduledMinutes: 480,
    morningEnd: "12:30",
    afternoonStart: "13:30",
    morningMinutes: 210,
    afternoonMinutes: 270,
  },
  "A-1": {
    code: "A-1",
    label: "A-1 (8H)",
    jobs: ["rehab_part"],
    start: "08:30",
    end: "17:30",
    breakMinutes: 60,
    scheduledMinutes: 480,
    morningEnd: "12:00",
    afternoonStart: "13:00",
    morningMinutes: 210,
    afternoonMinutes: 270,
  },
  D: {
    code: "D",
    label: "D (4H木土)",
    jobs: ["pt", "rehab_part"],
    start: "08:30",
    end: "12:30",
    breakMinutes: 0,
    scheduledMinutes: 240,
    morningEnd: "12:30",
    afternoonStart: "12:30",
    morningMinutes: 240,
    afternoonMinutes: 0,
  },
  "7.5H": {
    code: "7.5H",
    label: "7.5H",
    jobs: ["rehab_part"],
    start: "08:30",
    end: "17:00",
    breakMinutes: 60,
    scheduledMinutes: 450,
    morningEnd: "12:00",
    afternoonStart: "13:00",
    morningMinutes: 210,
    afternoonMinutes: 240,
  },
};

export function shiftFor(code: string): ShiftDefinition | null {
  if (code !== "B-2" && code !== "A-1" && code !== "D" && code !== "7.5H") return null;
  return SHIFTS[code];
}

export function shiftsForJob(job: JobType): ShiftDefinition[] {
  return Object.values(SHIFTS).filter((shift) => shift.jobs.includes(job));
}

export function shiftAllowed(job: JobType, code: string): boolean {
  const shift = shiftFor(code);
  if (!shift) return code === "" || code === "free";
  return shift.jobs.includes(job);
}

export function expectedDuty(shift: ShiftDefinition, half: HalfDayType, personalMinutes?: number | null): DutyWindow {
  if (half === "am_off" || half === "pm_off") {
    const minutes = personalMinutes && personalMinutes > 0 ? Math.round(personalMinutes / 2) : 240;
    return spanFrom(half === "pm_off" ? shift.start : "13:00", minutes);
  }

  if (
    half === "none" &&
    personalMinutes &&
    personalMinutes > 0 &&
    personalMinutes !== shift.scheduledMinutes &&
    (shift.code === "B-2" || shift.code === "A-1" || shift.code === "7.5H")
  ) {
    return dutyWithMinutes(shift, personalMinutes);
  }

  if (half === "none") {
    return {
      start: shift.start,
      end: shift.end,
      breakMinutes: shift.breakMinutes,
      scheduledMinutes: shift.scheduledMinutes,
    };
  }

  if (half === "am") {
    const work = Math.max(0, shift.scheduledMinutes - AM_HALF_MINUTES);
    if (work === 0) return EMPTY_DUTY;
    if (work === shift.afternoonMinutes && shift.afternoonMinutes > 0) {
      return {
        start: shift.afternoonStart,
        end: shift.end,
        breakMinutes: 0,
        scheduledMinutes: work,
      };
    }
    const end = parseHHMM(shift.end);
    if (end == null) return EMPTY_DUTY;
    return {
      start: formatHHMM(end - work),
      end: shift.end,
      breakMinutes: 0,
      scheduledMinutes: work,
    };
  }

  const work = Math.max(0, shift.scheduledMinutes - PM_HALF_MINUTES);
  if (work === 0) return EMPTY_DUTY;
  if (work === shift.morningMinutes) {
    return {
      start: shift.start,
      end: shift.morningEnd,
      breakMinutes: 0,
      scheduledMinutes: work,
    };
  }
  if (work < shift.morningMinutes) {
    const start = parseHHMM(shift.start);
    if (start == null) return EMPTY_DUTY;
    return {
      start: shift.start,
      end: formatHHMM(start + work),
      breakMinutes: 0,
      scheduledMinutes: work,
    };
  }

  const afternoonStart = parseHHMM(shift.afternoonStart);
  if (afternoonStart == null) return EMPTY_DUTY;
  return {
    start: shift.start,
    end: formatHHMM(afternoonStart + (work - shift.morningMinutes)),
    breakMinutes: shift.breakMinutes,
    scheduledMinutes: work,
  };
}

function spanFrom(start: string, minutes: number): DutyWindow {
  const startMin = parseHHMM(start);
  if (startMin == null) return EMPTY_DUTY;
  return { start, end: formatHHMM(startMin + minutes), breakMinutes: 0, scheduledMinutes: minutes };
}

function dutyWithMinutes(shift: ShiftDefinition, minutes: number): DutyWindow {
  const start = parseHHMM(shift.start);
  if (start == null) return EMPTY_DUTY;
  const breakMinutes = minutes <= shift.breakMinutes ? 0 : shift.breakMinutes;
  return {
    start: shift.start,
    end: formatHHMM(start + minutes + breakMinutes),
    breakMinutes,
    scheduledMinutes: minutes,
  };
}

export function describeShift(shift: ShiftDefinition): string {
  const breakLabel = shift.breakMinutes === 0 ? "休憩なし" : `休憩${shift.breakMinutes / 60}h`;
  const blocks =
    shift.afternoonMinutes > 0
      ? `午前${formatHours(shift.morningMinutes)}h・午後${formatHours(shift.afternoonMinutes)}h`
      : "午前のみ";
  return `${shift.start}–${shift.end}（${breakLabel}、実働${formatHours(shift.scheduledMinutes)}h、${blocks}）`;
}
