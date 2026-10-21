import { overtimeLabel, summarize, type HoursContext } from "@/lib/calc";
import { formatDayCount, formatHours, formatPaidLeaveHours, formatWorkedHoursLabel } from "@/lib/time";
import { shiftsForJob } from "@/lib/shifts";
import type { EmploymentType, MonthlyAttendance } from "@/types/kintai";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SummaryPanel({
  attendance,
  employmentType = "full_time",
  halfDayRule = "equal_4h",
  contractHoursPerDay,
  weeklySchedule,
}: {
  attendance: MonthlyAttendance;
  employmentType?: EmploymentType;
  halfDayRule?: HoursContext["halfDayRule"];
  contractHoursPerDay?: number;
  weeklySchedule?: HoursContext["weeklySchedule"];
}) {
  const partTime = employmentType === "part_time";
  const summary = summarize(attendance, { halfDayRule, contractHoursPerDay, weeklySchedule });
  const shifts = shiftsForJob(attendance.jobType);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{partTime ? "パート集計" : "下部集計"}</CardTitle>
        <CardDescription>
          {partTime
            ? "合計勤務時間は打刻の実働です。有休は終日ならその曜日の所定、公休の曜日は1日の契約時間、半休は所定の半分です。非対称の半休は午前3.5時間・午後4.0時間です。支給対象時間は実働と有休の合計です。"
            : "有休残は期首から当月消化（○=1.0、△=0.5）を引いた日数です。超え勤務は所定の始業前・終業後、不足は遅刻・早退と所定を超えた休憩です。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {partTime ? (
          <>
            <Stat label="今月の合計勤務時間" value={formatWorkedHoursLabel(summary.workedMinutes)} tone="emphasis" />
            <Stat
              label="今月の有休合計時間"
              value={`${formatPaidLeaveHours(summary.paidLeaveMinutes)}（取得日数: ${formatDayCount(summary.yukyu)}日）`}
              tone="emphasis"
            />
            <Stat label="支給対象時間" value={formatWorkedHoursLabel(summary.payableMinutes)} tone="emphasis" />
            <Stat label="出勤日数" value={`${formatDayCount(summary.attendanceDays)}日`} tone="emphasis" />
          </>
        ) : null}
        <Stat label="公休" value={`${formatDayCount(summary.koukyu)}日`} />
        <Stat label="欠勤" value={`${formatDayCount(summary.kekkin)}日`} />
        <Stat label="特忌" value={`${formatDayCount(summary.tokki)}日`} />
        <Stat label="有休" value={`${formatDayCount(summary.yukyu)}日`} />
        {shifts.map((shift) => (
          <Stat
            key={shift.code}
            label={shift.label}
            value={`${formatDayCount(summary.shifts[shift.code] ?? 0)}日`}
          />
        ))}
        <Stat
          label="有休残"
          value={`${formatDayCount(summary.paidLeaveRemaining)}日`}
          tone={summary.paidLeaveRemaining < 0 ? "alert" : "default"}
        />
        <Stat label="実働合計" value={`${formatHours(summary.workedMinutes)}h`} />
        <Stat label="時間外休日合計" value={durationOrZero(summary.overtimeMinutes)} />
        <Stat label="欠勤合計" value={durationOrZero(summary.shortageMinutes)} />
        <Stat label="出勤合計" value={`${formatDayCount(summary.attendanceDays)}日`} />
        <Stat label="給食" value={`${summary.lunchCount}回 / ${formatYen(summary.lunchAmount)}`} />
        <Stat label="遅早外出" value={`${summary.lateEarlyCount}回`} />
        <Stat label="半日未満" value={`${summary.underHalfDayCount}回`} />
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "alert" | "emphasis";
}) {
  return (
    <div className={tone === "emphasis" ? "rounded-lg bg-sky-50 px-3 py-2 ring-1 ring-sky-200" : "rounded-lg bg-muted/60 px-3 py-2"}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === "alert"
            ? "text-base font-semibold text-destructive"
            : tone === "emphasis"
              ? "text-base font-semibold text-sky-950"
              : "text-base font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function durationOrZero(minutes: number): string {
  return overtimeLabel(minutes) || "0分";
}

function formatYen(amount: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(amount)}円`;
}
