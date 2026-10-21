import { HALF_RULE_LABEL, ROLE_LABEL, WEEKDAY_NAMES } from "@/lib/schedule";
import { EMPLOYMENT_LABEL } from "@/lib/shift-patterns";
import { crossesMidnight } from "@/lib/time";
import type { CustomShiftPattern, DayShiftSetting, EmploymentType, HalfDayRuleType, StaffRole } from "@/types/kintai";
import { cn } from "@/lib/utils";

export function ScheduleBar({
  role,
  employmentType,
  halfDayRule,
  weeklySchedule,
  patterns,
  activePatternId,
  canApplyToday,
  halfMode,
  onHalf,
  onApplyMonth,
  onApplyPattern,
  onLeave,
}: {
  role: StaffRole;
  employmentType: EmploymentType;
  halfDayRule: HalfDayRuleType;
  weeklySchedule: Record<number, DayShiftSetting>;
  patterns: CustomShiftPattern[];
  activePatternId: string;
  canApplyToday: boolean;
  halfMode: "normal" | "am" | "pm" | null;
  onHalf: (mode: "normal" | "am" | "pm") => void;
  onApplyMonth: () => void;
  onApplyPattern: (pattern: CustomShiftPattern) => void;
  onLeave: (kind: "koukyu" | "yukyu") => void;
}) {
  const halves =
    halfDayRule === "asymmetric_3_5_4h"
      ? [
          { mode: "normal" as const, label: "通常出勤", detail: "週間設定の所定" },
          { mode: "pm" as const, label: "午後半休 (午前3.5h: 08:30〜12:00)", detail: "有休0.5日" },
          { mode: "am" as const, label: "午前半休 (午後4.0h: 13:00〜17:00)", detail: "有休0.5日" },
        ]
      : [
          { mode: "normal" as const, label: "通常出勤", detail: "週間設定の所定" },
          { mode: "pm" as const, label: "午後半休 (午前4h勤務)", detail: "有休0.5日" },
          { mode: "am" as const, label: "午前半休 (午後4h勤務)", detail: "有休0.5日" },
        ];

  return (
    <section className="rounded-xl bg-card p-3 ring-1 ring-foreground/10" aria-label="勤務設定">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold">{ROLE_LABEL[role]}</p>
          <p className="text-xs text-muted-foreground">
            {EMPLOYMENT_LABEL[employmentType]} · {HALF_RULE_LABEL[halfDayRule]}
          </p>
          <div className="mt-2 grid grid-cols-7 gap-1 text-[11px]">
            {WEEKDAY_NAMES.map((name, index) => {
              const day = weeklySchedule[index];
              return (
                <div key={name} className="rounded-md bg-muted/60 px-1 py-1 text-center">
                  <p className="font-medium">{name}</p>
                  <p className="text-muted-foreground">{day?.isHoliday ? "公休" : day?.shiftCode || "—"}</p>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onApplyMonth}
            className="mt-2 rounded-lg border border-sky-600 bg-background px-3 py-2 text-sm font-semibold text-sky-950 hover:bg-sky-50"
          >
            1ヶ月分を一括反映
          </button>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">本日のマイ・シフト</p>
          <div className="flex flex-wrap gap-2">
            {patterns.map((pattern) => {
              const selected = activePatternId === pattern.id;
              const end = crossesMidnight(pattern.startTime, pattern.endTime) ? `翌${pattern.endTime}` : pattern.endTime;
              return (
                <button
                  key={pattern.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={!canApplyToday}
                  onClick={() => onApplyPattern(pattern)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-left text-xs",
                    selected
                      ? "border-sky-600 bg-sky-50 font-semibold text-sky-950 ring-2 ring-sky-600"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {pattern.label || "無題"} ({pattern.startTime}–{end})
                </button>
              );
            })}
            <button
              type="button"
              disabled={!canApplyToday}
              onClick={() => onLeave("koukyu")}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              公休
            </button>
            <button
              type="button"
              disabled={!canApplyToday}
              onClick={() => onLeave("yukyu")}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              有休
            </button>
          </div>
          {patterns.length === 0 ? <p className="mt-1 text-[11px] text-muted-foreground">職員の編集からシフトを登録できます。</p> : null}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">本日の半休</p>
          <div className="grid gap-2 md:grid-cols-3">
            {halves.map((option) => {
              const selected = halfMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onHalf(option.mode)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-sky-600 bg-sky-50 text-sky-950 ring-2 ring-sky-600"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className={cn("block text-[11px]", selected ? "text-sky-900" : "text-muted-foreground")}>{option.detail}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}