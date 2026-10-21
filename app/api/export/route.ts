import { NextResponse } from "next/server";
import type { HoursContext } from "@/lib/calc";
import { renderAttendance } from "@/lib/excel/fill";
import { attendanceFileName } from "@/lib/storage";
import type { DayShiftSetting, HalfDayRuleType, JobType, MonthlyAttendance } from "@/types/kintai";

export async function POST(request: Request) {
  let body: MonthlyAttendance;
  try {
    body = (await request.json()) as MonthlyAttendance;
  } catch {
    return NextResponse.json({ error: "依頼の形式が不正です" }, { status: 400 });
  }

  if (!isJobType(body?.jobType) || !Array.isArray(body.records)) {
    return NextResponse.json({ error: "職種または明細が不正です" }, { status: 400 });
  }

  try {
    const buffer = await renderAttendance(body, hoursContext(body));
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attendanceFileName(body))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Excelの作成に失敗しました" }, { status: 500 });
  }
}

function isJobType(value: unknown): value is JobType {
  return value === "pt" || value === "rehab_part";
}

function hoursContext(body: MonthlyAttendance): HoursContext | undefined {
  const raw = body as MonthlyAttendance & {
    halfDayRule?: unknown;
    contractHoursPerDay?: unknown;
    weeklySchedule?: unknown;
  };
  const halfDayRule: HalfDayRuleType | undefined =
    raw.halfDayRule === "equal_4h" || raw.halfDayRule === "asymmetric_3_5_4h" ? raw.halfDayRule : undefined;
  const hours = Number(raw.contractHoursPerDay);
  const weeklySchedule = weeklyScheduleOf(raw.weeklySchedule);
  if (!halfDayRule && !(hours > 0) && !weeklySchedule) return undefined;
  return {
    halfDayRule: halfDayRule ?? "equal_4h",
    contractHoursPerDay: hours > 0 ? hours : undefined,
    weeklySchedule,
  };
}

function weeklyScheduleOf(value: unknown): Record<number, DayShiftSetting> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const week: Record<number, DayShiftSetting> = {};
  for (let index = 0; index < 7; index += 1) {
    const day = source[index] ?? source[String(index)];
    if (!day || typeof day !== "object") continue;
    const item = day as Partial<DayShiftSetting>;
    week[index] = {
      startTime: typeof item.startTime === "string" ? item.startTime : "",
      endTime: typeof item.endTime === "string" ? item.endTime : "",
      breakMinutes: Number(item.breakMinutes) || 0,
      scheduledMinutes: Number(item.scheduledMinutes) || 0,
      shiftCode: typeof item.shiftCode === "string" ? item.shiftCode : "",
      isHoliday: Boolean(item.isHoliday),
    };
  }
  return Object.keys(week).length > 0 ? week : undefined;
}
