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

/** 原本ワークブックへ値のみ差し込む（テスト・拡張用）。 */
export function writeAttendance(workbook: ExcelJS.Workbook, attendance: MonthlyAttendance, hours?: HoursContext) {
  const resolved = resolveJobSheet(workbook, attendance.jobType);
  const sheet = resolved.sheet;
  const columns = columnsFor(resolved.job);
  const summary = summarize(attendance, hours);
  const byDate = new Map(attendance.records.map((record) => [record.date, record]));

  ensurePrintSetup(sheet);

  // ヘッダーは値のみ差し込み（罫線・フォント・結合は触らない）
  writeCell(sheet.getCell(ERA_YEAR_CELL), reiwaYear(attendance.year));
  writeCell(sheet.getCell(MONTH_CELL), attendance.month);
  writeCell(sheet.getCell(NAME_CELL), attendance.staffName);
  writeCell(sheet.getCell(INITIAL_LEAVE_CELL), attendance.initialPaidLeave);
  writeCell(sheet.getCell(LUNCH_UNIT_CELL), attendance.lunchUnitPrice);
  writeCell(sheet.getCell(PERIOD_CELL), formatPeriodLabel(attendance.year, attendance.month));

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
  for (const col of writable) clearValue(sheet.getCell(row, col));
  if (!record) return;

  writeCell(sheet.getCell(row, columns.day), record.dayOfMonth);
  writeCell(sheet.getCell(row, columns.dow), record.dayOfWeek);
  writeMark(sheet.getCell(row, columns.koukyu), record.koukyu);
  writeMark(sheet.getCell(row, columns.kekkin), record.kekkin);
  writeMark(sheet.getCell(row, columns.tokki), record.tokki);
  writeMark(sheet.getCell(row, columns.yukyu), record.yukyu);

  const shiftMark = shiftMarkFor(record);
  const shiftCode = exportShiftCode(job, record);
  for (const shift of columns.shifts) {
    writeMark(sheet.getCell(row, shift.col), shiftCode === shift.code ? shiftMark : "");
  }

  const span = splitOvertimeSpan(record.overtimeSpan);
  writeCell(sheet.getCell(row, columns.otStart), span.start || null);
  writeCell(sheet.getCell(row, columns.otEnd), span.end || null);
  writeCell(sheet.getCell(row, columns.otText), overtimeLabel(record.overtimeMinutes) || null);
  writeCell(sheet.getCell(row, columns.shortage), record.shortageTime || null);
  writeCell(sheet.getCell(row, columns.note), noteForExport(record, job) || null);
}

function writeFooter(
  sheet: ExcelJS.Worksheet,
  columns: ReturnType<typeof columnsFor>,
  summary: ReturnType<typeof summarize>,
) {
  const footer = footerStartRow();
  const countRow = footer;

  // 日数小計行：原本に COUNTIF 等があれば活かし、無ければ集計値を差し込む
  writeNumberUnlessFormula(sheet.getCell(countRow, columns.koukyu), summary.koukyu);
  writeNumberUnlessFormula(sheet.getCell(countRow, columns.kekkin), summary.kekkin);
  writeNumberUnlessFormula(sheet.getCell(countRow, columns.tokki), summary.tokki);
  writeNumberUnlessFormula(sheet.getCell(countRow, columns.yukyu), summary.yukyu);
  for (const shift of columns.shifts) {
    writeNumberUnlessFormula(sheet.getCell(countRow, shift.col), summary.shifts[shift.code] ?? 0);
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
    `${formatPaidLeaveHours(summary.paidLeaveMinutes)}（取得日数: ${formatDayCount(summary.yukyu)}日）`,
    formatWorkedHoursLabel(summary.payableMinutes),
  ];

  if (FOOTER_LABELS.length !== totals.length + 1) {
    throw new Error("フッター行数が一致しません");
  }

  totals.forEach((value, index) => {
    writeCell(sheet.getCell(footer + 1 + index, 3), value);
  });
}

/** A4横・1枚収容。原本の pageSetup を保ちつつ不足分だけ補う。 */
function ensurePrintSetup(sheet: ExcelJS.Worksheet) {
  const current = sheet.pageSetup ?? {};
  sheet.pageSetup = {
    ...current,
    paperSize: (current.paperSize ?? 9) as ExcelJS.PaperSize,
    orientation: current.orientation ?? "landscape",
    fitToPage: true,
    fitToWidth: current.fitToWidth ?? 1,
    fitToHeight: current.fitToHeight ?? 1,
    horizontalCentered: current.horizontalCentered ?? true,
  };
}

function hasFormula(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  if (!value || typeof value !== "object") return false;
  return "formula" in value || "sharedFormula" in value;
}

/** 値だけ差し込む。border / fill / font / alignment / merge は変更しない。 */
function writeCell(cell: ExcelJS.Cell, value: ExcelJS.CellValue) {
  if (hasFormula(cell)) return;
  cell.value = value;
}

function clearValue(cell: ExcelJS.Cell) {
  if (hasFormula(cell)) return;
  cell.value = null;
}

function writeMark(cell: ExcelJS.Cell, mark: string) {
  writeCell(cell, mark || null);
}

function writeNumberUnlessFormula(cell: ExcelJS.Cell, value: number) {
  if (hasFormula(cell)) return;
  cell.value = value;
}
