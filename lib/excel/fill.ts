import path from "node:path";
import ExcelJS from "exceljs";
import type { DailyRecord, JobType, MonthlyAttendance } from "@/types/kintai";
import { exportShiftCode, noteForExport, overtimeLabel, shiftMarkFor, splitOvertimeSpan, summarize, type HoursContext } from "@/lib/calc";
import { formatDayCount, formatPaidLeaveHours, formatWorkedHoursLabel } from "@/lib/time";
import { formatISODate, reiwaYear } from "@/lib/date";
import { createAttendanceTemplate } from "@/lib/excel/template";
import {
  DATA_START_ROW,
  ERA_YEAR_CELL,
  FOOTER_LABELS,
  INITIAL_LEAVE_CELL,
  LUNCH_UNIT_CELL,
  MONTH_CELL,
  NAME_CELL,
  PERIOD_CELL,
  SHEET_NAME,
  TEMPLATE_FILE,
  columnsFor,
  footerStartRow,
} from "@/lib/excel/layout";
import { formatPeriodLabel, getPeriod } from "@/lib/period";

export function templateFilePath(): string {
  return path.join(process.cwd(), "public", "templates", TEMPLATE_FILE);
}

export async function renderAttendance(attendance: MonthlyAttendance, hours?: HoursContext): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templateFilePath());
  writeAttendance(workbook, attendance, hours);
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

export async function renderAttendanceWorkbook(attendance: MonthlyAttendance, hours?: HoursContext): Promise<Buffer> {
  const workbook = createAttendanceTemplate();
  writeAttendance(workbook, attendance, hours);
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

export function resolveJobSheet(workbook: ExcelJS.Workbook, job: JobType): { job: JobType; sheet: ExcelJS.Worksheet } {
  const preferred = workbook.getWorksheet(SHEET_NAME[job]);
  if (preferred) return { job, sheet: preferred };
  const alternate: JobType = job === "pt" ? "rehab_part" : "pt";
  const fallback = workbook.getWorksheet(SHEET_NAME[alternate]);
  if (fallback) return { job: alternate, sheet: fallback };
  const named = workbook.worksheets.find((sheet) => sheet.name === SHEET_NAME.pt || sheet.name === SHEET_NAME.rehab_part);
  if (named) {
    const matched: JobType = named.name === SHEET_NAME.pt ? "pt" : "rehab_part";
    return { job: matched, sheet: named };
  }
  throw new Error("原本に出力できるシートがありません");
}

function writeAttendance(workbook: ExcelJS.Workbook, attendance: MonthlyAttendance, hours?: HoursContext) {
  const resolved = resolveJobSheet(workbook, attendance.jobType);
  const sheet = resolved.sheet;
  const columns = columnsFor(resolved.job);
  const summary = summarize(attendance, hours);
  const byDate = new Map(attendance.records.map((record) => [record.date, record]));

  setValue(sheet, ERA_YEAR_CELL, reiwaYear(attendance.year));
  setValue(sheet, MONTH_CELL, attendance.month);
  setValue(sheet, NAME_CELL, attendance.staffName);
  setValue(sheet, INITIAL_LEAVE_CELL, attendance.initialPaidLeave);
  setValue(sheet, LUNCH_UNIT_CELL, attendance.lunchUnitPrice);
  setValue(sheet, PERIOD_CELL, formatPeriodLabel(attendance.year, attendance.month));

  const dates = getPeriod(attendance.year, attendance.month).dates;
  for (let index = 0; index < dates.length && index < 31; index += 1) {
    const record = byDate.get(formatISODate(dates[index]));
    writeDailyRow(sheet, DATA_START_ROW + index, columns, record, resolved.job);
  }

  const footer = footerStartRow();
  const countRow = footer;
  setNumber(sheet, countRow, columns.koukyu, summary.koukyu);
  setNumber(sheet, countRow, columns.kekkin, summary.kekkin);
  setNumber(sheet, countRow, columns.tokki, summary.tokki);
  setNumber(sheet, countRow, columns.yukyu, summary.yukyu);
  for (const shift of columns.shifts) {
    setNumber(sheet, countRow, shift.col, summary.shifts[shift.code] ?? 0);
  }

  const totals = [
    summary.paidLeaveRemaining,
    overtimeLabel(summary.overtimeMinutes),
    overtimeLabel(summary.shortageMinutes),
    summary.attendanceDays,
    summary.lunchCount,
    summary.lunchAmount,
    summary.lateEarlyCount,
    summary.underHalfDayCount,
    formatWorkedHoursLabel(summary.workedMinutes),
    `${formatPaidLeaveHours(summary.paidLeaveMinutes)}（取得日数: ${formatDayCount(summary.yukyu)}日）`,
    formatWorkedHoursLabel(summary.payableMinutes),
  ];
  totals.forEach((value, index) => {
    setValue(sheet, sheet.getCell(footer + 1 + index, 3).address, value);
  });

  if (FOOTER_LABELS.length !== totals.length + 1) {
    throw new Error("フッター行数が一致しません");
  }

  const selected = workbook.worksheets.findIndex((item) => item.name === sheet.name);
  if (selected >= 0) {
    const currentView = workbook.views?.[0];
    workbook.views = [{ ...currentView, activeTab: selected }];
  }
}

function writeDailyRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  columns: ReturnType<typeof columnsFor>,
  record: DailyRecord | undefined,
  job: JobType,
) {
  const writable = [
    columns.day,
    columns.dow,
    columns.koukyu,
    columns.kekkin,
    columns.tokki,
    columns.yukyu,
    ...columns.shifts.map((shift) => shift.col),
    columns.otStart,
    columns.otEnd,
    columns.otText,
    columns.shortage,
    columns.note,
  ];
  for (const col of writable) sheet.getCell(row, col).value = null;
  if (!record) return;

  setValue(sheet, sheet.getCell(row, columns.day).address, record.dayOfMonth);
  setValue(sheet, sheet.getCell(row, columns.dow).address, record.dayOfWeek);
  setMark(sheet, row, columns.koukyu, record.koukyu);
  setMark(sheet, row, columns.kekkin, record.kekkin);
  setMark(sheet, row, columns.tokki, record.tokki);
  setMark(sheet, row, columns.yukyu, record.yukyu);
  const shiftMark = shiftMarkFor(record);
  const shiftCode = exportShiftCode(job, record);
  for (const shift of columns.shifts) {
    setMark(sheet, row, shift.col, shiftCode === shift.code ? shiftMark : "");
  }
  const span = splitOvertimeSpan(record.overtimeSpan);
  setText(sheet, row, columns.otStart, span.start);
  setText(sheet, row, columns.otEnd, span.end);
  setText(sheet, row, columns.otText, overtimeLabel(record.overtimeMinutes));
  setText(sheet, row, columns.shortage, record.shortageTime);
  setText(sheet, row, columns.note, noteForExport(record, job));
}

function setMark(sheet: ExcelJS.Worksheet, row: number, col: number, mark: string) {
  sheet.getCell(row, col).value = mark || null;
}

function setText(sheet: ExcelJS.Worksheet, row: number, col: number, value: string) {
  sheet.getCell(row, col).value = value || null;
}

function setNumber(sheet: ExcelJS.Worksheet, row: number, col: number, value: number) {
  sheet.getCell(row, col).value = value;
}

function setValue(sheet: ExcelJS.Worksheet, address: string, value: ExcelJS.CellValue) {
  sheet.getCell(address).value = value;
}
