import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { computeDeviation, noteForExport, summarize } from "../lib/calc";
import { holidayName } from "../lib/holidays";
import { renderAttendance, renderAttendanceWorkbook, resolveJobSheet } from "../lib/excel/fill";
import { createAttendanceTemplate } from "../lib/excel/template";
import { SHEET_NAME } from "../lib/excel/layout";
import { getPeriod } from "../lib/period";
import {
  chooseFullLeave,
  chooseHalf,
  applyShiftPattern,
  chooseShift,
  createAttendance,
  editClocks,
  emptyRecord,
} from "../lib/records";
import { applyStaffDay, applyWeeklySchedule, dayFromPattern, dayFromShiftCode, presetForRole, recomputeScheduled } from "../lib/schedule";
import { defaultShiftPatterns, patternScheduledMinutes } from "../lib/shift-patterns";
import { createStaffId, normalizeStaffList, recordsKey } from "../lib/staff";
import { expectedDuty, SHIFTS } from "../lib/shifts";
import { parseISODate } from "../lib/date";

const b2 = SHIFTS["B-2"];
const seven = SHIFTS["7.5H"];
const a1 = SHIFTS["A-1"];
const d = SHIFTS.D;

assert.deepEqual(
  expectedDuty(b2, "none"),
  { start: "09:00", end: "18:00", breakMinutes: 60, scheduledMinutes: 480 },
);
assert.deepEqual(expectedDuty(b2, "am"), {
  start: "13:30",
  end: "18:00",
  breakMinutes: 0,
  scheduledMinutes: 270,
});
assert.deepEqual(expectedDuty(b2, "pm"), {
  start: "09:00",
  end: "14:00",
  breakMinutes: 60,
  scheduledMinutes: 240,
});
assert.deepEqual(expectedDuty(seven, "am"), {
  start: "13:00",
  end: "17:00",
  breakMinutes: 0,
  scheduledMinutes: 240,
});
assert.deepEqual(expectedDuty(seven, "pm"), {
  start: "08:30",
  end: "12:00",
  breakMinutes: 0,
  scheduledMinutes: 210,
});
assert.deepEqual(expectedDuty(a1, "pm"), {
  start: "08:30",
  end: "13:30",
  breakMinutes: 60,
  scheduledMinutes: 240,
});
assert.equal(expectedDuty(d, "pm").scheduledMinutes, 0);
assert.deepEqual(expectedDuty(d, "am"), {
  start: "12:00",
  end: "12:30",
  breakMinutes: 0,
  scheduledMinutes: 30,
});
assert.deepEqual(expectedDuty(b2, "am_off"), {
  start: "13:00",
  end: "17:00",
  breakMinutes: 0,
  scheduledMinutes: 240,
});
assert.deepEqual(expectedDuty(b2, "pm_off"), {
  start: "09:00",
  end: "13:00",
  breakMinutes: 0,
  scheduledMinutes: 240,
});
assert.deepEqual(expectedDuty(b2, "none", 360), {
  start: "09:00",
  end: "16:00",
  breakMinutes: 60,
  scheduledMinutes: 360,
});
assert.equal(expectedDuty(b2, "pm_off", 360).scheduledMinutes, 180);
assert.equal(expectedDuty(b2, "pm_off", 360).end, "12:00");
assert.equal(expectedDuty(d, "none", 360).scheduledMinutes, 240);
assert.deepEqual(expectedDuty(d, "am"), {
  start: "12:00",
  end: "12:30",
  breakMinutes: 0,
  scheduledMinutes: 30,
});

assert.equal(getPeriod(2026, 11).dates.length, 31);
assert.equal(getPeriod(2025, 3).dates.length, 28);
assert.equal(getPeriod(2024, 3).dates.length, 29);
assert.equal(getPeriod(2026, 1).dates[0].getMonth(), 11);

assert.equal(holidayName(parseISODate("2026-01-01")), "元日");
assert.equal(holidayName(parseISODate("2026-01-12")), "成人の日");
assert.equal(holidayName(parseISODate("2026-05-06")), "振替休日");
assert.equal(holidayName(parseISODate("2026-09-22")), "国民の休日");
assert.equal(holidayName(parseISODate("2024-02-12")), "振替休日");
assert.equal(holidayName(parseISODate("2026-10-20")), null);

const attendance = createAttendance({
  year: 2026,
  month: 10,
  jobType: "pt",
  staffName: "テスト太郎",
  initialPaidLeave: 12,
  lunchCount: 3,
  lunchUnitPrice: 400,
});

attendance.records = attendance.records.map((record) => {
  if (record.date === "2026-10-01") {
    return editClocks(chooseShift(record, "B-2"), { clockOut: "19:30" });
  }
  if (record.date === "2026-10-02") {
    return editClocks(chooseShift(record, "B-2"), { clockIn: "08:30" });
  }
  if (record.date === "2026-10-05") {
    return chooseHalf(chooseShift(record, "B-2"), "am");
  }
  if (record.date === "2026-10-06") {
    return chooseShift(chooseHalf(record, "pm"), "B-2");
  }
  if (record.date === "2026-10-07") {
    return chooseFullLeave(record, "yukyu", true);
  }
  if (record.date === "2026-10-08") {
    return editClocks(chooseShift(record, "B-2"), { clockIn: "09:30", clockOut: "18:30" });
  }
  return record;
});

const oct1 = attendance.records.find((record) => record.date === "2026-10-01");
const oct2 = attendance.records.find((record) => record.date === "2026-10-02");
const oct5 = attendance.records.find((record) => record.date === "2026-10-05");
const oct6 = attendance.records.find((record) => record.date === "2026-10-06");
const oct8 = attendance.records.find((record) => record.date === "2026-10-08");
assert.ok(oct1 && oct2 && oct5 && oct6 && oct8);
assert.equal(oct1.overtimeMinutes, 90);
assert.equal(oct1.overtimeSpan, "18:00〜19:30");
assert.equal(oct1.shortageTime, "");
assert.equal(oct2.overtimeMinutes, 30);
assert.equal(oct2.overtimeSpan, "08:30〜09:00");
assert.equal(oct5.yukyu, "△");
assert.equal(oct5.clockIn, "13:30");
assert.equal(oct5.clockOut, "18:00");
assert.equal(oct5.overtimeMinutes, 0);
assert.equal(oct6.shiftCode, "B-2");
assert.equal(oct6.clockIn, "09:00");
assert.equal(oct6.clockOut, "18:00");
assert.equal(oct6.breakMinutes, 60);
assert.equal(oct6.halfDayType, "none");
assert.equal(oct6.koukyu, "");
assert.equal(oct6.yukyu, "");
const switched = chooseShift(chooseHalf(chooseShift(emptyRecord(new Date(2026, 9, 20)), "B-2"), "am"), "B-2");
assert.equal(switched.clockIn, "09:00");
assert.equal(switched.clockOut, "18:00");
assert.equal(switched.breakMinutes, 60);
assert.equal(switched.halfDayType, "none");
const morning = chooseShift(switched, "D");
assert.equal(morning.shiftCode, "D");
assert.equal(morning.clockIn, "08:30");
assert.equal(morning.clockOut, "12:30");
assert.equal(morning.breakMinutes, 0);
const part = chooseShift(morning, "7.5H");
assert.equal(part.shiftCode, "7.5H");
assert.equal(part.clockIn, "08:30");
assert.equal(part.clockOut, "17:00");
assert.equal(part.breakMinutes, 60);
assert.equal(oct8.overtimeMinutes, 30);
assert.equal(oct8.shortageTime, "0:30");

const summary = summarize(attendance);
assert.equal(summary.yukyu, 1.5);
assert.equal(summary.paidLeaveRemaining, 10.5);
assert.equal(summary.overtimeMinutes, 150);
assert.equal(summary.lunchAmount, 1200);
assert.equal(summary.lateEarlyCount, 1);
assert.equal(summary.shifts["B-2"], 4.5);

const tuesday = emptyRecord(new Date(2026, 9, 20));
const thursday = emptyRecord(new Date(2026, 9, 15));
const saturday = emptyRecord(new Date(2026, 9, 17));
const sunday = emptyRecord(new Date(2026, 9, 18));
assert.equal(tuesday.dayOfWeek, "火");
assert.equal(thursday.dayOfWeek, "木");
assert.equal(saturday.dayOfWeek, "土");
assert.equal(sunday.dayOfWeek, "日");

const october = createAttendance({ year: 2026, month: 10, jobType: "pt", staffName: "一括" });
assert.equal(october.records.length, 30);
assert.equal(october.records[0].date, "2026-09-21");
assert.equal(october.records.at(-1)?.date, "2026-10-20");
assert.equal(october.records.find((record) => record.date === "2026-10-19")?.dayOfWeek, "月");

assert.equal(recordsKey("staff_1", 2026, 11), "kintai_craft_records_staff_1_2026-11");
assert.equal(createStaffId([]), "staff_1");
assert.equal(createStaffId([{ id: "staff_1" }, { id: "staff_4" }]), "staff_5");
const migrated = normalizeStaffList([
  { id: "staff_2", name: "佐藤 花子", jobType: "rehab_part", defaultPattern: "pattern_3", initialPaidLeave: 8 },
  { id: "", name: "空", jobType: "pt", defaultPattern: "pattern_1", initialPaidLeave: 1 },
]);
assert.equal(migrated.length, 1);
assert.equal(migrated[0].name, "佐藤 花子");
assert.equal(migrated[0].role, "rehab_assistant");
assert.equal(migrated[0].halfDayRule, "asymmetric_3_5_4h");
assert.equal(migrated[0].sheetType, "rehab_part");
assert.equal(migrated[0].initialPaidLeave, 8);
assert.equal(migrated[0].weeklySchedule[0].isHoliday, true);
assert.equal(migrated[0].weeklySchedule[4].shiftCode, "D");
assert.equal(migrated[0].weeklySchedule[4].scheduledMinutes, 240);

const inpatient = normalizeStaffList([{ id: "staff_9", name: "入院", placement: "inpatient", initialPaidLeave: 3 }]);
assert.equal(inpatient[0].role, "pt_inpatient");
assert.equal(inpatient[0].halfDayRule, "equal_4h");
assert.equal(inpatient[0].sheetType, "pt");
assert.equal(inpatient[0].weeklySchedule[1].shiftCode, "B-2");
assert.equal(inpatient[0].weeklySchedule[1].scheduledMinutes, 480);
assert.equal(inpatient[0].weeklySchedule[4].startTime, "09:00");
assert.equal(inpatient[0].weeklySchedule[4].endTime, "18:00");
assert.equal(inpatient[0].weeklySchedule[4].breakMinutes, 60);
assert.equal(inpatient[0].weeklySchedule[4].shiftCode, "B-2");
assert.equal(inpatient[0].weeklySchedule[4].isHoliday, false);
assert.equal(inpatient[0].weeklySchedule[0].isHoliday, true);
assert.equal(inpatient[0].weeklySchedule[0].startTime, "");
assert.equal(inpatient[0].weeklySchedule[0].shiftCode, "");
assert.equal(inpatient[0].weeklySchedule[6].isHoliday, true);
assert.equal(inpatient[0].weeklySchedule[6].startTime, "");
assert.equal(inpatient[0].weeklySchedule[6].shiftCode, "");
assert.equal(presetForRole("pt_outpatient").weeklySchedule[4].shiftCode, "D");
assert.equal(presetForRole("pt_outpatient").weeklySchedule[6].shiftCode, "D");
assert.equal(presetForRole("rehab_assistant").halfDayRule, "asymmetric_3_5_4h");
assert.equal(presetForRole("rehab_assistant").sheetType, "rehab_part");
const nursePreset = presetForRole("nurse");
assert.equal(nursePreset.halfDayRule, "equal_4h");
assert.equal(nursePreset.sheetType, "rehab_part");
assert.equal(nursePreset.weeklySchedule[1].shiftCode, "A-1");
assert.equal(nursePreset.weeklySchedule[1].startTime, "08:30");
assert.equal(nursePreset.weeklySchedule[1].endTime, "17:30");
assert.equal(nursePreset.weeklySchedule[1].breakMinutes, 60);
assert.equal(nursePreset.weeklySchedule[1].scheduledMinutes, 480);
assert.equal(nursePreset.weeklySchedule[5].shiftCode, "A-1");
assert.equal(nursePreset.weeklySchedule[0].isHoliday, true);
assert.equal(nursePreset.weeklySchedule[6].isHoliday, true);
for (const role of ["clerk", "radiologist"] as const) {
  const preset = presetForRole(role);
  assert.equal(preset.halfDayRule, "equal_4h");
  assert.equal(preset.sheetType, "rehab_part");
  assert.equal(preset.weeklySchedule[1].shiftCode, "A-1");
  assert.equal(preset.weeklySchedule[1].endTime, "17:30");
  assert.equal(preset.weeklySchedule[1].breakMinutes, 60);
  assert.equal(preset.weeklySchedule[4].shiftCode, "D");
  assert.equal(preset.weeklySchedule[4].startTime, "08:30");
  assert.equal(preset.weeklySchedule[4].endTime, "12:30");
  assert.equal(preset.weeklySchedule[4].breakMinutes, 0);
  assert.equal(preset.weeklySchedule[5].shiftCode, "A-1");
  assert.equal(preset.weeklySchedule[6].shiftCode, "D");
  assert.equal(preset.weeklySchedule[0].isHoliday, true);
}
assert.equal(presetForRole("part_timer").halfDayRule, "equal_4h");
const nurseStaff = { ...nursePreset, name: "看護", initialPaidLeave: 10 };
const nurseMonth = applyWeeklySchedule(
  createAttendance({ year: 2026, month: 10, jobType: "pt", staffName: "看護" }),
  nurseStaff,
);
assert.equal(nurseMonth.jobType, "rehab_part");
const nurseMonday = nurseMonth.records.find((record) => record.date === "2026-09-21");
assert.equal(nurseMonday?.shiftCode, "A-1");
assert.equal(nurseMonday?.clockIn, "08:30");
assert.equal(nurseMonday?.clockOut, "17:30");
assert.equal(nurseMonday?.breakMinutes, 60);
const nursePm = applyStaffDay(nurseMonth, nurseStaff, "pm", "2026-09-21").records.find((record) => record.date === "2026-09-21");
assert.equal(nursePm?.clockIn, "08:30");
assert.equal(nursePm?.clockOut, "12:30");
assert.equal(nursePm?.yukyu, "△");
const nurseAm = applyStaffDay(nurseMonth, nurseStaff, "am", "2026-09-21").records.find((record) => record.date === "2026-09-21");
assert.equal(nurseAm?.clockIn, "13:00");
assert.equal(nurseAm?.clockOut, "17:00");
const nurseFull = defaultShiftPatterns("nurse", "full_time");
assert.equal(nurseFull[0].label, "日勤");
assert.equal(nurseFull[0].startTime, "09:00");
assert.equal(nurseFull[0].endTime, "18:00");
assert.equal(patternScheduledMinutes(nurseFull[0]), 480);
const night = nurseFull[1];
assert.equal(night.label, "夜勤");
assert.equal(night.startTime, "16:00");
assert.equal(night.endTime, "09:00");
assert.equal(night.isOvernight, true);
assert.equal(patternScheduledMinutes(night), 960);
const nightDaySetting = dayFromPattern(night);
assert.equal(nightDaySetting.patternId, night.id);
assert.equal(nightDaySetting.shiftCode, "夜勤");
assert.equal(nightDaySetting.startTime, "16:00");
assert.equal(nightDaySetting.endTime, "09:00");
assert.equal(nightDaySetting.breakMinutes, 60);
assert.equal(nightDaySetting.isHoliday, false);
assert.equal(nightDaySetting.scheduledMinutes, 960);
const shortPatterns = defaultShiftPatterns("nurse", "short_time");
assert.equal(shortPatterns[0].label, "時短");
assert.equal(patternScheduledMinutes(shortPatterns[0]), 360);
assert.equal(patternScheduledMinutes(shortPatterns[1]), 240);
const partPatterns = defaultShiftPatterns("nurse", "part_time");
assert.equal(partPatterns[0].label, "AMパート");
assert.equal(partPatterns[0].startTime, "08:30");
assert.equal(partPatterns[0].endTime, "12:30");
assert.equal(partPatterns[0].breakMinutes, 0);
assert.equal(patternScheduledMinutes(partPatterns[0]), 240);
const shortDay = applyShiftPattern(emptyRecord(new Date(2026, 9, 21)), shortPatterns[0]);
assert.equal(shortDay.clockIn, "09:00");
assert.equal(shortDay.clockOut, "16:00");
assert.equal(shortDay.breakMinutes, 60);
assert.equal(shortDay.shiftCode, "時短");
assert.equal(shortDay.patternLabel, "時短");
assert.equal(shortDay.overtimeMinutes, 0);
assert.equal(shortDay.shortageTime, "");
assert.equal(noteForExport(shortDay), "時短 09:00〜16:00");
const shortLate = editClocks(shortDay, { clockOut: "16:30" });
assert.equal(shortLate.overtimeMinutes, 30);
assert.equal(shortLate.overtimeSpan, "16:00〜16:30");
const nightDay = applyShiftPattern(emptyRecord(new Date(2026, 9, 21)), night);
assert.equal(nightDay.clockIn, "16:00");
assert.equal(nightDay.clockOut, "09:00");
assert.equal(nightDay.isOvernight, true);
assert.equal(nightDay.shiftCode, "夜勤");
assert.equal(nightDay.koukyu, "");
assert.equal(nightDay.overtimeMinutes, 0);
assert.equal(recomputeScheduled({ startTime: "16:00", endTime: "09:00", breakMinutes: 60, scheduledMinutes: 0, shiftCode: "夜勤", isHoliday: false }).scheduledMinutes, 960);
const nightMonth = applyShiftPattern(
  createAttendance({ year: 2026, month: 10, jobType: "rehab_part", staffName: "夜勤" }).records.find((record) => record.date === "2026-09-21")!,
  night,
);
assert.equal(nightMonth.clockIn, "16:00");
assert.equal(nightMonth.clockOut, "09:00");
const nightSummary = summarize({
  ...createAttendance({ year: 2026, month: 10, jobType: "rehab_part", staffName: "夜勤" }),
  records: createAttendance({ year: 2026, month: 10, jobType: "rehab_part", staffName: "夜勤" }).records.map((record) =>
    record.date === "2026-09-21" ? nightMonth : record,
  ),
});
assert.equal(nightSummary.workedMinutes, 960);
const nightLate = editClocks(nightDay, { clockOut: "09:30" });
assert.equal(nightLate.overtimeMinutes, 30);
assert.equal(nightLate.overtimeSpan, "09:00〜09:30");
const nightEarlyOut = editClocks(nightDay, { clockOut: "08:30" });
assert.equal(nightEarlyOut.shortageTime, "0:30");
assert.deepEqual(computeDeviation("09:00", "19:30", "09:00", "18:00", 60, 60), {
  overtimeMinutes: 90,
  shortageMinutes: 0,
  span: "18:00〜19:30",
  startLabel: "18:00",
  endLabel: "19:30",
});
const keptWeek = normalizeStaffList([{ id: "staff_1", name: "テスト太郎", role: "pt_outpatient", initialPaidLeave: 12 }]);
assert.equal(keptWeek[0].employmentType, "full_time");
assert.equal(keptWeek[0].shiftPatterns[0].shiftCode, "B-2");
assert.equal(keptWeek[0].weeklySchedule[4].shiftCode, "D");
assert.equal(keptWeek[0].weeklySchedule[1].startTime, "09:00");
assert.equal(dayFromShiftCode("B-2").startTime, "09:00");
assert.equal(dayFromShiftCode("B-2").endTime, "18:00");
assert.equal(dayFromShiftCode("B-2").breakMinutes, 60);
assert.equal(dayFromShiftCode("B-2").scheduledMinutes, 480);
assert.equal(dayFromShiftCode("B-2").isHoliday, false);
assert.equal(dayFromShiftCode("D").startTime, "08:30");
assert.equal(dayFromShiftCode("D").endTime, "12:30");
assert.equal(dayFromShiftCode("D").breakMinutes, 0);
assert.equal(dayFromShiftCode("7.5H").endTime, "17:00");
assert.equal(dayFromShiftCode("A-1").endTime, "17:30");
assert.equal(dayFromShiftCode("").isHoliday, true);
assert.equal(dayFromShiftCode("").startTime, "");
assert.equal(dayFromShiftCode("").shiftCode, "");
const longBreak = recomputeScheduled({
  startTime: "08:30",
  endTime: "18:00",
  breakMinutes: 90,
  scheduledMinutes: 0,
  shiftCode: "B-2",
  isHoliday: false,
});
assert.equal(longBreak.scheduledMinutes, 480);
assert.equal(recomputeScheduled({ ...longBreak, isHoliday: true }).scheduledMinutes, 0);
const customStaff = normalizeStaffList([
  {
    id: "staff_3",
    name: "可変",
    role: "custom",
    halfDayRule: "equal_4h",
    sheetType: "pt",
    initialPaidLeave: 1,
    weeklySchedule: {
      1: { startTime: "08:30", endTime: "18:00", breakMinutes: 90, scheduledMinutes: 1, shiftCode: "B-2", isHoliday: false },
      2: { startTime: "08:30", endTime: "17:30", breakMinutes: 60, scheduledMinutes: 1, shiftCode: "A-1", isHoliday: false },
    },
  },
]);
assert.equal(customStaff[0].role, "custom");
assert.equal(customStaff[0].weeklySchedule[1].breakMinutes, 90);
assert.equal(customStaff[0].weeklySchedule[1].startTime, "08:30");
assert.equal(customStaff[0].weeklySchedule[1].endTime, "18:00");
assert.equal(customStaff[0].weeklySchedule[1].scheduledMinutes, 480);
assert.equal(customStaff[0].weeklySchedule[0].isHoliday, false);
assert.equal(customStaff[0].weeklySchedule[0].startTime, "");
const customMonth = applyWeeklySchedule(
  createAttendance({ year: 2026, month: 10, jobType: "pt", staffName: "可変" }),
  { ...customStaff[0], name: "可変" },
);
const customTuesday = customMonth.records.find((record) => record.date === "2026-10-20");
assert.equal(customTuesday?.shiftCode, "A-1");
assert.equal(customTuesday?.clockIn, "08:30");
assert.equal(customTuesday?.clockOut, "17:30");
assert.equal(customTuesday?.breakMinutes, 60);

const ptStaff = { ...presetForRole("pt_outpatient"), name: "週間", initialPaidLeave: 10 };
const scheduledMonth = applyWeeklySchedule(createAttendance({ year: 2026, month: 10, jobType: "pt", staffName: "週間" }), ptStaff);
assert.equal(scheduledMonth.records.length, 30);
assert.equal(scheduledMonth.jobType, "pt");
assert.equal(scheduledMonth.records.find((record) => record.date === "2026-10-01")?.shiftCode, "D");
assert.equal(scheduledMonth.records.find((record) => record.date === "2026-10-01")?.clockOut, "12:30");
assert.equal(scheduledMonth.records.find((record) => record.date === "2026-10-04")?.koukyu, "○");
assert.equal(scheduledMonth.records.find((record) => record.date === "2026-10-20")?.shiftCode, "B-2");
assert.equal(scheduledMonth.records.find((record) => record.date === "2026-10-20")?.clockIn, "09:00");
const equalPm = applyStaffDay(scheduledMonth, ptStaff, "pm", "2026-10-20");
const equalPmDay = equalPm.records.find((record) => record.date === "2026-10-20");
assert.equal(equalPmDay?.clockIn, "09:00");
assert.equal(equalPmDay?.clockOut, "13:00");
assert.equal(equalPmDay?.yukyu, "△");
assert.equal(equalPm.records.find((record) => record.date === "2026-10-01")?.shiftCode, "D");
const equalAm = applyStaffDay(scheduledMonth, ptStaff, "am", "2026-10-20");
assert.equal(equalAm.records.find((record) => record.date === "2026-10-20")?.clockIn, "13:00");
assert.equal(equalAm.records.find((record) => record.date === "2026-10-20")?.clockOut, "17:00");

const assistant = { ...presetForRole("rehab_assistant"), name: "助手", initialPaidLeave: 5 };
const assistantMonth = applyWeeklySchedule(
  createAttendance({ year: 2026, month: 10, jobType: "rehab_part", staffName: "助手" }),
  assistant,
);
assert.equal(assistantMonth.jobType, "rehab_part");
assert.equal(assistantMonth.records.find((record) => record.date === "2026-10-20")?.shiftCode, "7.5H");
const assistantAm = applyStaffDay(assistantMonth, assistant, "am", "2026-10-20").records.find((record) => record.date === "2026-10-20");
const assistantPm = applyStaffDay(assistantMonth, assistant, "pm", "2026-10-20").records.find((record) => record.date === "2026-10-20");
assert.equal(assistantAm?.clockIn, "13:00");
assert.equal(assistantAm?.clockOut, "17:00");
assert.equal(assistantAm?.yukyu, "△");
assert.equal(assistantPm?.clockIn, "08:30");
assert.equal(assistantPm?.clockOut, "12:00");
assert.equal(assistantPm?.yukyu, "△");

async function main() {
const buffer = await renderAttendanceWorkbook(attendance);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
const sheet = workbook.getWorksheet("理学療法士");
assert.ok(sheet);
assert.equal(sheet.getCell("A1").value, "出勤簿");
assert.equal(sheet.getCell("A1").font?.bold, true);
assert.equal(sheet.getCell("C2").value, 8);
assert.equal(sheet.getCell("E2").value, 10);
assert.equal(sheet.getCell("C3").value, "テスト太郎");
assert.equal(sheet.getCell("C4").value, "9/21 〜 10/20");
assert.equal(sheet.getCell("A8").border?.left?.style, "thin");

const oct1Row = 18;
assert.equal(sheet.getCell(oct1Row, 1).value, 1);
assert.equal(sheet.getCell(oct1Row, 7).value, "○");
assert.equal(sheet.getCell(oct1Row, 9).value, "18:00");
assert.equal(sheet.getCell(oct1Row, 10).value, "19:30");
assert.equal(sheet.getCell(oct1Row, 11).value, "1時間30分");
assert.equal(sheet.getCell(oct1Row, 7).border?.left?.style, "thin");

const oct5Row = 22;
assert.equal(sheet.getCell(oct5Row, 6).value, "△");
assert.equal(sheet.getCell(oct5Row, 7).value, "△");
assert.equal(sheet.getCell(oct5Row, 13).value, "AM半休");

const rehab = createAttendance({
  year: 2026,
  month: 10,
  jobType: "rehab_part",
  staffName: "パート花子",
  initialPaidLeave: 5,
});
rehab.records = rehab.records.map((record) => {
  if (record.date === "2026-10-03") {
    return editClocks(chooseHalf(chooseShift(record, "7.5H"), "pm"), { clockOut: "12:30" });
  }
  return record;
});
const oct3 = rehab.records.find((record) => record.date === "2026-10-03");
assert.ok(oct3);
assert.equal(oct3.clockIn, "08:30");
assert.equal(oct3.overtimeMinutes, 30);
assert.equal(oct3.overtimeSpan, "12:00〜12:30");

const rehabBuffer = await renderAttendanceWorkbook(rehab);
const rehabBook = new ExcelJS.Workbook();
await rehabBook.xlsx.load(rehabBuffer as unknown as ArrayBuffer);
const rehabSheet = rehabBook.getWorksheet("リハビリフルタイムパート");
assert.ok(rehabSheet);
assert.equal(rehabSheet.getCell(20, 9).value, "△");
assert.equal(rehabSheet.getCell(20, 12).value, "30分");
assert.equal(rehabSheet.getCell("A1").font?.name, "游ゴシック");

const fromFile = await renderAttendance(attendance);
const reloaded = new ExcelJS.Workbook();
await reloaded.xlsx.load(fromFile as unknown as ArrayBuffer);
const reloadedSheet = reloaded.getWorksheet("理学療法士");
assert.ok(reloadedSheet);
assert.equal(reloadedSheet.getCell("A1").value, "出勤簿");
assert.equal(reloadedSheet.getCell("A1").font?.bold, true);
assert.equal(reloadedSheet.getCell("A8").border?.left?.style, "thin");
assert.equal(reloadedSheet.getCell(oct1Row, 11).value, "1時間30分");
assert.equal(reloadedSheet.getCell("C3").value, "テスト太郎");

const missingPt = createAttendanceTemplate();
const ptWorksheet = missingPt.getWorksheet(SHEET_NAME.pt);
assert.ok(ptWorksheet);
missingPt.removeWorksheet(ptWorksheet.id);
const fallback = resolveJobSheet(missingPt, "pt");
assert.equal(fallback.job, "rehab_part");
assert.equal(fallback.sheet.name, SHEET_NAME.rehab_part);

const nurseBuffer = await renderAttendanceWorkbook(nurseMonth);
const nurseBook = new ExcelJS.Workbook();
await nurseBook.xlsx.load(nurseBuffer as unknown as ArrayBuffer);
const nurseSheet = nurseBook.getWorksheet(SHEET_NAME.rehab_part);
assert.ok(nurseSheet);
assert.equal(nurseSheet.getCell("C3").value, "看護");
assert.equal(nurseSheet.getCell(8, 7).value, "○");

const paletteMonth = {
  ...nurseMonth,
  staffName: "時短",
  records: nurseMonth.records.map((record) =>
    record.date === "2026-09-21" ? applyShiftPattern(record, shortPatterns[0]) : record,
  ),
};
const paletteBuffer = await renderAttendanceWorkbook(paletteMonth);
const paletteBook = new ExcelJS.Workbook();
await paletteBook.xlsx.load(paletteBuffer as unknown as ArrayBuffer);
const paletteSheet = paletteBook.getWorksheet(SHEET_NAME.rehab_part);
assert.ok(paletteSheet);
assert.equal(paletteSheet.getCell(8, 7).value, null);
assert.equal(paletteSheet.getCell(8, 14).value, "時短 09:00〜16:00");

console.log("ok");
}

main();
