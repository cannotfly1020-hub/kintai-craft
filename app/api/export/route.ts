import { NextResponse } from "next/server";
import { renderAttendance } from "@/lib/excel/fill";
import { attendanceFileName } from "@/lib/storage";
import type { JobType, MonthlyAttendance } from "@/types/kintai";

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
    const buffer = await renderAttendance(body);
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
