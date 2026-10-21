import ExcelJS from "exceljs";
import type { JobType } from "@/types/kintai";
import { JOB_LABEL } from "@/lib/shifts";
import {
  COLUMN_HEADER_ROW,
  DATA_ROW_COUNT,
  DATA_START_ROW,
  FOOTER_LABELS,
  GROUP_HEADER_ROW,
  SHEET_NAME,
  TITLE_ROW,
  columnsFor,
  footerStartRow,
  sheetLegend,
} from "@/lib/excel/layout";

const INK = "FF1F2937";
const TEAL = "FF0F5C61";
const TEAL_SOFT = "FFE5F1F2";
const PAPER = "FFFBF8F3";
const LINE = "FF9AA5A6";
const WHITE = "FFFFFFFF";

const thin = { style: "thin" as const, color: { argb: LINE } };
const medium = { style: "medium" as const, color: { argb: INK } };

function font(size: number, bold = false, color = INK): Partial<ExcelJS.Font> {
  return { name: "游ゴシック", size, bold, color: { argb: color } };
}

export function createAttendanceTemplate(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "kintai-craft";
  workbook.created = new Date();
  createSheet(workbook, "pt");
  createSheet(workbook, "rehab_part");
  return workbook;
}

function createSheet(workbook: ExcelJS.Workbook, job: JobType) {
  const columns = columnsFor(job);
  const sheet = workbook.addWorksheet(SHEET_NAME[job], {
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      paperSize: 9 as ExcelJS.PaperSize,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      printTitlesRow: "1:7",
    },
    views: [{ state: "frozen", ySplit: COLUMN_HEADER_ROW, showGridLines: false }],
  });
  sheet.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  sheet.headerFooter.oddFooter = "&L勤怠クラフト&C&A&R&P / &N";
  sheet.properties.tabColor = { argb: TEAL };

  const widths = new Map<number, number>([
    [columns.day, 8],
    [columns.dow, 5],
    [columns.koukyu, 7],
    [columns.kekkin, 7],
    [columns.tokki, 7],
    [columns.yukyu, 7],
    [columns.otStart, 12],
    [columns.otEnd, 12],
    [columns.otText, 14],
    [columns.shortage, 11],
    [columns.note, 28],
  ]);
  for (const shift of columns.shifts) widths.set(shift.col, 12);
  for (let col = 1; col <= columns.lastCol; col += 1) {
    sheet.getColumn(col).width = widths.get(col) ?? 10;
  }

  paintTitle(sheet, columns.lastCol);
  paintInfo(sheet, job, columns.lastCol);
  paintLegend(sheet, job, columns.lastCol);
  paintColumnHeaders(sheet, job);
  paintDataRows(sheet, columns.lastCol);
  paintFooter(sheet, columns.lastCol);
}

function paintTitle(sheet: ExcelJS.Worksheet, lastCol: number) {
  sheet.getRow(TITLE_ROW).height = 32;
  for (let col = 1; col <= lastCol; col += 1) {
    const cell = sheet.getCell(TITLE_ROW, col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.font = font(18, true, WHITE);
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  sheet.getCell(TITLE_ROW, 1).value = "出勤簿";
  sheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, lastCol);
}

function paintInfo(sheet: ExcelJS.Worksheet, job: JobType, lastCol: number) {
  for (let row = 2; row <= 4; row += 1) {
    sheet.getRow(row).height = 20;
    for (let col = 1; col <= lastCol; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.font = font(10);
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPER } };
    }
  }

  label(sheet, "A2", "令和");
  label(sheet, "D2", "年");
  label(sheet, "F2", "月分");
  label(sheet, "A3", "氏名");
  label(sheet, "F3", "期首有休");
  label(sheet, "H3", "日");
  label(sheet, "I3", "給食単価");
  label(sheet, "K3", "円");
  label(sheet, "A4", "期間");
  label(sheet, "F4", "締め");
  sheet.getCell("G4").value = "20日";
  sheet.getCell("G4").font = font(10, true);
  sheet.getCell("G4").alignment = { vertical: "middle", horizontal: "left" };

  const valueCells = ["C2", "E2", "C3", "G3", "J3", "C4"];
  for (const address of valueCells) {
    const cell = sheet.getCell(address);
    cell.font = font(11, true);
    cell.alignment = { vertical: "middle", horizontal: address === "C3" || address === "C4" ? "left" : "center" };
  }

  sheet.mergeCells("C3:E3");
  sheet.mergeCells("C4:E4");

  const jobCell = sheet.getCell(2, lastCol);
  jobCell.value = JOB_LABEL[job];
  jobCell.font = font(12, true, TEAL);
  jobCell.alignment = { vertical: "middle", horizontal: "right" };
}

function paintLegend(sheet: ExcelJS.Worksheet, job: JobType, lastCol: number) {
  sheet.getRow(5).height = 32;
  for (let col = 1; col <= lastCol; col += 1) {
    const cell = sheet.getCell(5, col);
    cell.font = font(8);
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL_SOFT } };
  }
  sheet.getCell(5, 1).value = sheetLegend(job);
  sheet.mergeCells(5, 1, 5, lastCol);
}

function paintColumnHeaders(sheet: ExcelJS.Worksheet, job: JobType) {
  const columns = columnsFor(job);
  const last = columns.lastCol;
  sheet.getRow(GROUP_HEADER_ROW).height = 22;
  sheet.getRow(COLUMN_HEADER_ROW).height = 32;

  for (let col = 1; col <= last; col += 1) {
    for (const row of [GROUP_HEADER_ROW, COLUMN_HEADER_ROW]) {
      const cell = sheet.getCell(row, col);
      cell.font = font(9, true);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row === GROUP_HEADER_ROW ? "FFD5E6E7" : TEAL_SOFT } };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    }
  }

  header(sheet, GROUP_HEADER_ROW, columns.koukyu, "休暇・区分");
  header(sheet, GROUP_HEADER_ROW, columns.shifts[0].col, "勤務");
  header(sheet, GROUP_HEADER_ROW, columns.otStart, "時間外・休日");
  header(sheet, GROUP_HEADER_ROW, columns.shortage, "欠勤・遅早出");
  header(sheet, GROUP_HEADER_ROW, columns.note, "備考");

  header(sheet, COLUMN_HEADER_ROW, columns.day, "日");
  header(sheet, COLUMN_HEADER_ROW, columns.dow, "曜");
  header(sheet, COLUMN_HEADER_ROW, columns.koukyu, "公休");
  header(sheet, COLUMN_HEADER_ROW, columns.kekkin, "欠勤");
  header(sheet, COLUMN_HEADER_ROW, columns.tokki, "特忌");
  header(sheet, COLUMN_HEADER_ROW, columns.yukyu, "有休");
  for (const shift of columns.shifts) header(sheet, COLUMN_HEADER_ROW, shift.col, shift.header);
  header(sheet, COLUMN_HEADER_ROW, columns.otStart, "始業");
  header(sheet, COLUMN_HEADER_ROW, columns.otEnd, "終業");
  header(sheet, COLUMN_HEADER_ROW, columns.otText, "超え勤務");
  header(sheet, COLUMN_HEADER_ROW, columns.shortage, "時間（▲）");
  header(sheet, COLUMN_HEADER_ROW, columns.note, "備考");

  sheet.mergeCells(GROUP_HEADER_ROW, columns.day, COLUMN_HEADER_ROW, columns.day);
  sheet.mergeCells(GROUP_HEADER_ROW, columns.dow, COLUMN_HEADER_ROW, columns.dow);
  header(sheet, GROUP_HEADER_ROW, columns.day, "日");
  header(sheet, GROUP_HEADER_ROW, columns.dow, "曜");
  sheet.mergeCells(GROUP_HEADER_ROW, columns.koukyu, GROUP_HEADER_ROW, columns.yukyu);
  sheet.mergeCells(
    GROUP_HEADER_ROW,
    columns.shifts[0].col,
    GROUP_HEADER_ROW,
    columns.shifts[columns.shifts.length - 1].col,
  );
  sheet.mergeCells(GROUP_HEADER_ROW, columns.otStart, GROUP_HEADER_ROW, columns.otText);
  sheet.mergeCells(GROUP_HEADER_ROW, columns.note, COLUMN_HEADER_ROW, columns.note);
}

function paintDataRows(sheet: ExcelJS.Worksheet, lastCol: number) {
  for (let offset = 0; offset < DATA_ROW_COUNT; offset += 1) {
    const rowNumber = DATA_START_ROW + offset;
    const row = sheet.getRow(rowNumber);
    row.height = 18;
    for (let col = 1; col <= lastCol; col += 1) {
      const cell = sheet.getCell(rowNumber, col);
      cell.font = font(10);
      cell.alignment = {
        vertical: "middle",
        horizontal: col === lastCol ? "left" : "center",
      };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
      if (offset % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F4EE" } };
      }
    }
  }
}

function paintFooter(sheet: ExcelJS.Worksheet, lastCol: number) {
  const start = footerStartRow();
  const end = start + FOOTER_LABELS.length - 1;
  for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 20;
    for (let col = 1; col <= lastCol; col += 1) {
      const cell = sheet.getCell(rowNumber, col);
      const edgeTop = rowNumber === start;
      const edgeBottom = rowNumber === end;
      const edgeLeft = col === 1;
      const edgeRight = col === lastCol;
      cell.border = {
        top: edgeTop ? medium : thin,
        bottom: edgeBottom ? medium : thin,
        left: edgeLeft ? medium : thin,
        right: edgeRight ? medium : thin,
      };
      cell.font = font(10, col <= 2);
      cell.alignment = {
        vertical: "middle",
        horizontal: col <= 2 ? "left" : "center",
        shrinkToFit: col >= 3,
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7F6" } };
    }
    sheet.getCell(rowNumber, 1).value = FOOTER_LABELS[rowNumber - start];
    sheet.mergeCells(rowNumber, 1, rowNumber, 2);
    // 日数小計行以外は値欄を横結合し、右側の空きマス感と文字見切れを防ぐ
    if (rowNumber > start) {
      sheet.mergeCells(rowNumber, 3, rowNumber, lastCol);
    }
  }
}

function label(sheet: ExcelJS.Worksheet, address: string, value: string) {
  const cell = sheet.getCell(address);
  cell.value = value;
  cell.font = font(10);
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function header(sheet: ExcelJS.Worksheet, row: number, col: number, value: string) {
  const cell = sheet.getCell(row, col);
  cell.value = value;
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}
