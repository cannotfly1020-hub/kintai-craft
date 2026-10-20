import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { summarize } from "../lib/calc";
import { holidayName } from "../lib/holidays";
import { renderAttendance, renderAttendanceWorkbook } from "../lib/excel/fill";
import { getPeriod } from "../lib/period";
import {
  chooseFullLeave,
  chooseHalf,
  chooseShift,
  createAttendance,
  editClocks,
  emptyRecord,
} from "../lib/records";
import { applyAttendanceMode, applyPatternToMonth, applyPatternToPeriod } from "../lib/patterns";
import { applyStaffDay, applyWeeklySchedule, presetForRole } from "../lib/schedule";
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
assert.equal(oct6.clockIn, "09:00");
assert.equal(oct6.clockOut, "14:00");
assert.equal(oct6.yukyu, "△");
assert.equal(oct8.overtimeMinutes, 30);
assert.equal(oct8.shortageTime, "0:30");

const summary = summarize(attendance);
assert.equal(summary.yukyu, 2);
assert.equal(summary.paidLeaveRemaining, 10);
assert.equal(summary.overtimeMinutes, 150);
assert.equal(summary.lunchAmount, 1200);
assert.equal(summary.lateEarlyCount, 1);
assert.equal(summary.shifts["B-2"], 4);

const tuesday = emptyRecord(new Date(2026, 9, 20));
const thursday = emptyRecord(new Date(2026, 9, 15));
const saturday = emptyRecord(new Date(2026, 9, 17));
const sunday = emptyRecord(new Date(2026, 9, 18));
assert.equal(tuesday.dayOfWeek, "火");
assert.equal(thursday.dayOfWeek, "木");
assert.equal(saturday.dayOfWeek, "土");
assert.equal(sunday.dayOfWeek, "日");

const pattern1Tuesday = applyAttendanceMode(tuesday, "pattern_1", "pt", "normal");
assert.equal(pattern1Tuesday.shiftCode, "B-2");
assert.equal(pattern1Tuesday.clockIn, "09:00");
assert.equal(pattern1Tuesday.clockOut, "18:00");
assert.equal(pattern1Tuesday.breakMinutes, 60);
assert.equal(applyAttendanceMode(thursday, "pattern_1", "pt", "normal").shiftCode, "D");
assert.equal(applyAttendanceMode(thursday, "pattern_1", "pt", "normal").clockOut, "12:30");
assert.equal(applyAttendanceMode(sunday, "pattern_1", "pt", "normal").koukyu, "○");
assert.equal(applyAttendanceMode(saturday, "pattern_2", "pt", "normal").koukyu, "○");
assert.equal(applyAttendanceMode(tuesday, "pattern_2", "pt", "normal").shiftCode, "B-2");
assert.equal(applyAttendanceMode(tuesday, "pattern_2", "pt", "normal").clockIn, "09:00");
assert.equal(applyAttendanceMode(tuesday, "pattern_2", "pt", "normal").clockOut, "18:00");
assert.equal(applyAttendanceMode(sunday, "pattern_2", "pt", "normal").koukyu, "○");
assert.equal(applyAttendanceMode(sunday, "pattern_2", "pt", "normal").shiftCode, "");
assert.equal(applyAttendanceMode(sunday, "pattern_2", "pt", "normal").clockIn, "");
assert.equal(applyAttendanceMode(tuesday, "pattern_3", "rehab_part", "normal").shiftCode, "7.5H");
assert.equal(applyAttendanceMode(tuesday, "pattern_3", "rehab_part", "normal").clockIn, "08:30");
assert.equal(applyAttendanceMode(saturday, "pattern_3", "rehab_part", "normal").shiftCode, "D");
assert.equal(applyAttendanceMode(sunday, "pattern_3", "rehab_part", "normal").koukyu, "○");

const morningHalf = applyAttendanceMode(tuesday, "pattern_1", "pt", "pm");
assert.equal(morningHalf.clockIn, "08:30");
assert.equal(morningHalf.clockOut, "12:00");
assert.equal(morningHalf.yukyu, "△");
assert.equal(morningHalf.halfDayType, "pm");
const afternoonHalf = applyAttendanceMode(tuesday, "pattern_3", "rehab_part", "am");
assert.equal(afternoonHalf.clockIn, "13:00");
assert.equal(afternoonHalf.clockOut, "17:00");
assert.equal(afternoonHalf.yukyu, "△");
assert.equal(afternoonHalf.shiftCode, "7.5H");
const restored = applyAttendanceMode(afternoonHalf, "pattern_3", "rehab_part", "normal");
assert.equal(restored.halfDayType, "none");
assert.equal(restored.yukyu, "");
assert.equal(restored.clockIn, "08:30");
assert.equal(restored.clockOut, "17:00");

const october = applyPatternToPeriod(
  createAttendance({ year: 2026, month: 10, jobType: "pt", staffName: "一括" }),
  "pattern_1",
);
assert.equal(october.records.length, 30);
assert.equal(october.records[0].date, "2026-09-21");
assert.equal(october.records.at(-1)?.date, "2026-10-20");
const byDate = Object.fromEntries(october.records.map((record) => [record.date, record]));
assert.equal(byDate["2026-10-19"].dayOfWeek, "月");
assert.equal(byDate["2026-10-19"].shiftCode, "B-2");
assert.equal(byDate["2026-10-19"].clockIn, "09:00");
assert.equal(byDate["2026-10-19"].clockOut, "18:00");
assert.equal(byDate["2026-10-19"].breakMinutes, 60);
assert.equal(byDate["2026-10-15"].shiftCode, "D");
assert.equal(byDate["2026-10-15"].clockIn, "08:30");
assert.equal(byDate["2026-10-15"].clockOut, "12:30");
assert.equal(byDate["2026-10-15"].breakMinutes, 0);
assert.equal(byDate["2026-10-17"].shiftCode, "D");
assert.equal(byDate["2026-10-18"].koukyu, "○");
assert.equal(byDate["2026-10-18"].clockIn, "");
assert.equal(byDate["2026-10-18"].shiftCode, "");
const weekFive = applyPatternToPeriod(october, "pattern_2");
assert.equal(weekFive.records.find((record) => record.date === "2026-10-16")?.shiftCode, "B-2");
assert.equal(weekFive.records.find((record) => record.date === "2026-10-17")?.koukyu, "○");
assert.equal(weekFive.records.find((record) => record.date === "2026-10-18")?.koukyu, "○");
const rehabMonth = applyPatternToPeriod(
  createAttendance({ year: 2026, month: 10, jobType: "rehab_part" }),
  "pattern_3",
);
assert.equal(rehabMonth.records.find((record) => record.date === "2026-10-20")?.shiftCode, "7.5H");
assert.equal(rehabMonth.records.find((record) => record.date === "2026-10-20")?.clockOut, "17:00");
assert.equal(rehabMonth.records.find((record) => record.date === "2026-10-17")?.shiftCode, "D");
const edited = applyPatternToMonth(october, "pattern_1", "pm", "2026-10-19");
assert.equal(edited.records.find((record) => record.date === "2026-10-19")?.yukyu, "△");
assert.equal(edited.records.find((record) => record.date === "2026-10-19")?.clockOut, "12:00");
assert.equal(edited.records.find((record) => record.date === "2026-10-15")?.shiftCode, "D");

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

console.log("ok");
}

main();
