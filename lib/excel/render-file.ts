import path from "node:path";
import ExcelJS from "exceljs";
import type { HoursContext } from "@/lib/calc";
import { writeAttendance } from "@/lib/excel/fill";
import { TEMPLATE_FILE } from "@/lib/excel/layout";
import type { MonthlyAttendance } from "@/types/kintai";

export function templateFilePath(): string {
  return path.join(process.cwd(), "public", "templates", TEMPLATE_FILE);
}

/** Node 専用: 原本テンプレートファイルを差し込み */
export async function renderAttendance(attendance: MonthlyAttendance, hours?: HoursContext): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templateFilePath());
  writeAttendance(workbook, attendance, hours);
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}
