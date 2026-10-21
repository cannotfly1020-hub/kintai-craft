import ExcelJS from "exceljs";
import type { HoursContext } from "@/lib/calc";
import { writeAttendance } from "@/lib/excel/fill";
import { TEMPLATE_FILE } from "@/lib/excel/layout";
import type { MonthlyAttendance } from "@/types/kintai";

/** ブラウザ / 静的エクスポート向け: public テンプレートを差し込み */
export async function renderAttendanceBlob(attendance: MonthlyAttendance, hours?: HoursContext): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const response = await fetch(`/templates/${TEMPLATE_FILE}`);
  if (!response.ok) {
    throw new Error("出勤簿テンプレートを読み込めませんでした");
  }
  await workbook.xlsx.load(await response.arrayBuffer());
  writeAttendance(workbook, attendance, hours);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
