import type { JobType, ShiftCode } from "@/types/kintai";

export const TEMPLATE_FILE = "attendance_template.xlsx";

export const SHEET_NAME: Record<JobType, string> = {
  pt: "理学療法士",
  rehab_part: "リハビリフルタイムパート",
};

export const TITLE_ROW = 1;
export const GROUP_HEADER_ROW = 6;
export const COLUMN_HEADER_ROW = 7;
export const DATA_START_ROW = 8;
export const DATA_ROW_COUNT = 31;

export const ERA_YEAR_CELL = "C2";
export const MONTH_CELL = "E2";
export const NAME_CELL = "C3";
export const INITIAL_LEAVE_CELL = "G3";
export const LUNCH_UNIT_CELL = "J3";
export const PERIOD_CELL = "C4";

export interface ColumnMap {
  day: number;
  dow: number;
  koukyu: number;
  kekkin: number;
  tokki: number;
  yukyu: number;
  shifts: { code: Exclude<ShiftCode, "" | "free">; col: number; header: string }[];
  otStart: number;
  otEnd: number;
  otText: number;
  shortage: number;
  note: number;
  lastCol: number;
}

export function columnsFor(job: JobType): ColumnMap {
  if (job === "pt") {
    return {
      day: 1,
      dow: 2,
      koukyu: 3,
      kekkin: 4,
      tokki: 5,
      yukyu: 6,
      shifts: [
        { code: "B-2", col: 7, header: "B-2\n(8H)" },
        { code: "D", col: 8, header: "D\n(4H木土)" },
      ],
      otStart: 9,
      otEnd: 10,
      otText: 11,
      shortage: 12,
      note: 13,
      lastCol: 13,
    };
  }
  return {
    day: 1,
    dow: 2,
    koukyu: 3,
    kekkin: 4,
    tokki: 5,
    yukyu: 6,
    shifts: [
      { code: "A-1", col: 7, header: "A-1\n(8H)" },
      { code: "D", col: 8, header: "D\n(4H木土)" },
      { code: "7.5H", col: 9, header: "7.5H" },
    ],
    otStart: 10,
    otEnd: 11,
    otText: 12,
    shortage: 13,
    note: 14,
    lastCol: 14,
  };
}

export const FOOTER_LABELS = [
  "日数小計",
  "有休残（日）",
  "時間外休日合計",
  "欠勤合計",
  "出勤合計（日）",
  "給食回数",
  "給食合計（円）",
  "遅早外出（回）",
  "半日未満（回）",
] as const;

export function footerStartRow(): number {
  return DATA_START_ROW + DATA_ROW_COUNT + 1;
}

export function sheetLegend(job: JobType): string {
  if (job === "pt") {
    return "○＝終日、△＝半日（0.5日）。有休の午前半休は3.5時間、午後半休は4.0時間。B-2は09:00–18:00（休憩1時間、実働8.0h、午前3.5h・午後4.5h）。Dは08:30–12:30（実働4.0h）。超え勤務は所定の始業前・終業後に在籍した分。";
  }
  return "○＝終日、△＝半日（0.5日）。有休の午前半休は3.5時間、午後半休は4.0時間。A-1は08:30–17:30（休憩1時間、実働8.0h、午前3.5h・午後4.5h）。Dは08:30–12:30（実働4.0h）。7.5Hは08:30–17:00（休憩1時間、実働7.5h、午前3.5h・午後4.0h）。超え勤務は所定の始業前・終業後に在籍した分。";
}
