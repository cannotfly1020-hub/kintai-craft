import { mkdirSync } from "node:fs";
import path from "node:path";
import { createAttendanceTemplate } from "../lib/excel/template";

async function main() {
  const destination = path.join(process.cwd(), "public", "templates");
  mkdirSync(destination, { recursive: true });

  const workbook = createAttendanceTemplate();
  const file = path.join(destination, "attendance_template.xlsx");
  await workbook.xlsx.writeFile(file);
  console.log(file);
}

main();
