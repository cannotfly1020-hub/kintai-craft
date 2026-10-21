import ExcelJS from "exceljs";
import type { DailyRecord, JobType, MonthlyAttendance } from "@/types/kintai";
import { exportShiftCode, noteForExport, overtimeLabel, shiftMarkFor, splitOvertimeSpan, summarize, type HoursContext } from "@/lib/calc";
import { formatPaidLeaveSummaryLabel, formatWorkedHoursLabel } from "@/lib/time";
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
  columnsFor,
  footerStartRow,
} from "@/lib/excel/layout";
import { formatPeriodLabel, getPeriod } from "@/lib/period";

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

/** 原本ワークブックへ値のみ差し込む（テスト・拡張用）。 */
export function writeAttendance(workbook: ExcelJS.Workbook, attendance: MonthlyAttendance, hours?: HoursContext) {
  const resolved = resolveJobSheet(workbook, attendance.jobType);
  const sheet = resolved.sheet;
  const columns = columnsFor(resolved.job);
  const summary = summarize(attendance, hours);
  const byDate = new Map(attendance.records.map((record) => [record.date, record]));

  ensurePrintSetup(sheet);

  writeValue(sheet, ERA_YEAR_CELL, reiwaYear(attendance.year));
  writeValue(sheet, MONTH_CELL, attendance.month);
  writeValue(sheet, NAME_CELL, attendance.staffName);
  writeValue(sheet, INITIAL_LEAVE_CELL, attendance.initialPaidLeave);
  writeValue(sheet, LUNCH_UNIT_CELL, attendance.lunchUnitPrice);
  writeValue(sheet, PERIOD_CELL, formatPeriodLabel(attendance.year, attendance.month));

  const dates = getPeriod(attendance.year, attendance.month).dates;
  for (let index = 0; index < dates.length && index < 31; index += 1) {
    const record = byDate.get(formatISODate(dates[index]));
    writeDailyRow(sheet, DATA_START_ROW + index, columns, record, resolved.job);
  }

  writeFooter(sheet, columns, summary);

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
  for (const col of writable) clearValue(masterCell(sheet.getCell(row, col)));
  if (!record) return;

  writeValueAt(sheet, row, columns.day, record.dayOfMonth);
  writeValueAt(sheet, row, columns.dow, record.dayOfWeek);
  writeMarkAt(sheet, row, columns.koukyu, record.koukyu);
  writeMarkAt(sheet, row, columns.kekkin, record.kekkin);
  writeMarkAt(sheet, row, columns.tokki, record.tokki);
  writeMarkAt(sheet, row, columns.yukyu, record.yukyu);

  const shiftMark = shiftMarkFor(record);
  const shiftCode = exportShiftCode(job, record);
  for (const shift of columns.shifts) {
    writeMarkAt(sheet, row, shift.col, shiftCode === shift.code ? shiftMark : "");
  }

  const span = splitOvertimeSpan(record.overtimeSpan);
  writeValueAt(sheet, row, columns.otStart, span.start || null);
  writeValueAt(sheet, row, columns.otEnd, span.end || null);
  writeValueAt(sheet, row, columns.otText, overtimeLabel(record.overtimeMinutes) || null);
  writeValueAt(sheet, row, columns.shortage, record.shortageTime || null);
  writeValueAt(sheet, row, columns.note, noteForExport(record, job) || null);
}

function writeFooter(
  sheet: ExcelJS.Worksheet,
  columns: ReturnType<typeof columnsFor>,
  summary: ReturnType<typeof summarize>,
) {
  const footer = footerStartRow();

  writeNumberUnlessFormula(masterCell(sheet.getCell(footer, columns.koukyu)), summary.koukyu);
  writeNumberUnlessFormula(masterCell(sheet.getCell(footer, columns.kekkin)), summary.kekkin);
  writeNumberUnlessFormula(masterCell(sheet.getCell(footer, columns.tokki)), summary.tokki);
  writeNumberUnlessFormula(masterCell(sheet.getCell(footer, columns.yukyu)), summary.yukyu);
  for (const shift of columns.shifts) {
    writeNumberUnlessFormula(masterCell(sheet.getCell(footer, shift.col)), summary.shifts[shift.code] ?? 0);
  }

  const totals: ExcelJS.CellValue[] = [
    summary.paidLeaveRemaining,
    overtimeLabel(summary.overtimeMinutes) || "0分",
    overtimeLabel(summary.shortageMinutes) || "0分",
    summary.attendanceDays,
    summary.lunchCount,
    summary.lunchAmount,
    summary.lateEarlyCount,
    summary.underHalfDayCount,
    formatWorkedHoursLabel(summary.workedMinutes),
    formatPaidLeaveSummaryLabel(summary.paidLeaveMinutes, summary.yukyu),
    formatWorkedHoursLabel(summary.payableMinutes),
  ];

  if (FOOTER_LABELS.length !== totals.length + 1) {
    throw new Error("フッター行数が一致しません");
  }

  totals.forEach((value, index) => {
    // 結合セルは左上（C列）のみへ代入。mergeCells は再実行しない。
    writeFooterValue(masterCell(sheet.getCell(footer + 1 + index, 3)), value);
  });
}

function ensurePrintSetup(sheet: ExcelJS.Worksheet) {
  const current = sheet.pageSetup ?? {};
  sheet.pageSetup = {
    ...current,
    paperSize: 9 as ExcelJS.PaperSize,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: current.horizontalCentered ?? true,
  };
}

function masterCell(cell: ExcelJS.Cell): ExcelJS.Cell {
  if (cell.isMerged && cell.master) return cell.master;
  return cell;
}

function hasFormula(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  if (!value || typeof value !== "object") return false;
  return "formula" in value || "sharedFormula" in value;
}

/** 値のみ代入。font / border / fill は触らない。 */
function writeCellValue(cell: ExcelJS.Cell, value: ExcelJS.CellValue) {
  if (hasFormula(cell)) return;
  cell.value = value;
}

function writeValue(sheet: ExcelJS.Worksheet, address: string, value: ExcelJS.CellValue) {
  writeCellValue(masterCell(sheet.getCell(address)), value);
}

function writeValueAt(sheet: ExcelJS.Worksheet, row: number, col: number, value: ExcelJS.CellValue) {
  writeCellValue(masterCell(sheet.getCell(row, col)), value);
}

function writeMarkAt(sheet: ExcelJS.Worksheet, row: number, col: number, mark: string) {
  writeCellValue(masterCell(sheet.getCell(row, col)), mark || null);
}

function clearValue(cell: ExcelJS.Cell) {
  if (hasFormula(cell)) return;
  cell.value = null;
}

function writeNumberUnlessFormula(cell: ExcelJS.Cell, value: number) {
  if (hasFormula(cell)) return;
  cell.value = value;
}

/**
 * フッター文字列用。原本の alignment を保ったまま shrinkToFit だけ足す。
 * font / border / fill は変更しない。
 */
function writeFooterValue(cell: ExcelJS.Cell, value: ExcelJS.CellValue) {
  if (hasFormula(cell)) return;
  cell.value = value;
  const prev = cell.alignment ?? {};
  cell.alignment = {
    ...prev,
    vertical: prev.vertical ?? "middle",
    horizontal: prev.horizontal ?? "center",
    shrinkToFit: true,
  };
}
