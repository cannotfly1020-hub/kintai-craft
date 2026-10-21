import { overtimeLabel, summarize, type HoursContext } from "@/lib/calc";
import { formatDayCount, formatPaidLeaveHours, formatWorkedHoursLabel } from "@/lib/time";
import { shiftsForJob } from "@/lib/shifts";
import type { EmploymentType, MonthlyAttendance } from "@/types/kintai";
import { cn } from "@/lib/utils";

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
    <section className="space-y-3" aria-label="月次サマリー">
      <div className="rounded-2xl bg-gradient-to-br from-slate-50 via-white to-sky-50 p-4 ring-1 ring-slate-200/80">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">今月の見通し</h2>
            <p className="text-xs text-muted-foreground">
              {partTime ? "パート向けに実働時間を前面に表示しています。" : "出勤・残業・有休を一目で確認できます。"}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="出勤日数"
            value={`${formatDayCount(summary.attendanceDays)}日`}
            tone="slate"
          />
          <Kpi
            label="今月の総実労働時間"
            value={formatWorkedHoursLabel(summary.workedMinutes)}
            tone={partTime ? "sky" : "slate"}
            emphasize={partTime}
          />
          <Kpi
            label="時間外（残業）合計"
            value={durationOrZero(summary.overtimeMinutes)}
            tone="amber"
          />
          <Kpi
            label="有給取得"
            value={
              partTime
                ? `${formatDayCount(summary.yukyu)}日 · ${formatPaidLeaveHours(summary.paidLeaveMinutes)}`
                : `${formatDayCount(summary.yukyu)}日`
            }
            tone="teal"
          />
          <Kpi label="公休数" value={`${formatDayCount(summary.koukyu)}日`} tone="gray" />
        </div>
        {partTime ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Kpi label="支給対象時間" value={formatWorkedHoursLabel(summary.payableMinutes)} tone="sky" emphasize />
            <Kpi
              label="有休残"
              value={`${formatDayCount(summary.paidLeaveRemaining)}日`}
              tone={summary.paidLeaveRemaining < 0 ? "rose" : "teal"}
            />
          </div>
        ) : null}
      </div>

      <details className="rounded-xl bg-card ring-1 ring-foreground/10 open:pb-3">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
          詳細集計を見る
          <span className="ml-2 text-xs font-normal text-muted-foreground">欠勤・給食・勤務区分など</span>
        </summary>
        <div className="grid gap-2 px-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="欠勤" value={`${formatDayCount(summary.kekkin)}日`} />
          <Stat label="特忌" value={`${formatDayCount(summary.tokki)}日`} />
          {shifts.map((shift) => (
            <Stat key={shift.code} label={shift.label} value={`${formatDayCount(summary.shifts[shift.code] ?? 0)}日`} />
          ))}
          {!partTime ? (
            <Stat
              label="有休残"
              value={`${formatDayCount(summary.paidLeaveRemaining)}日`}
              tone={summary.paidLeaveRemaining < 0 ? "alert" : "default"}
            />
          ) : null}
          <Stat label="欠勤合計（時間）" value={durationOrZero(summary.shortageMinutes)} />
          <Stat label="給食" value={`${summary.lunchCount}回 / ${formatYen(summary.lunchAmount)}`} />
          <Stat label="遅早外出" value={`${summary.lateEarlyCount}回`} />
          <Stat label="半日未満" value={`${summary.underHalfDayCount}回`} />
        </div>
      </details>
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
  emphasize = false,
}: {
  label: string;
  value: string;
  tone: "slate" | "sky" | "amber" | "teal" | "gray" | "rose";
  emphasize?: boolean;
}) {
  const tones = {
    slate: "bg-white ring-slate-200 text-slate-900",
    sky: "bg-sky-50 ring-sky-200 text-sky-950",
    amber: "bg-amber-50 ring-amber-200 text-amber-950",
    teal: "bg-teal-50 ring-teal-200 text-teal-950",
    gray: "bg-gray-50 ring-gray-200 text-gray-800",
    rose: "bg-rose-50 ring-rose-200 text-rose-900",
  } as const;
  return (
    <div className={cn("rounded-xl px-3 py-3 ring-1", tones[tone], emphasize && "shadow-sm")}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-semibold tracking-tight", emphasize ? "text-lg" : "text-base")}>{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "alert";
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone === "alert" ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>{value}</p>
    </div>
  );
}

function durationOrZero(minutes: number): string {
  return overtimeLabel(minutes) || "0分";
}

function formatYen(amount: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(amount)}円`;
}
