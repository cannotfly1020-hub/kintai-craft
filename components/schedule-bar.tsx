import { HALF_RULE_LABEL, ROLE_LABEL } from "@/lib/schedule";
import { EMPLOYMENT_LABEL, patternButtonLabel } from "@/lib/shift-patterns";
import { shiftBadgeClass, shiftToneFromLabel } from "@/lib/shift-ui";
import type { CustomShiftPattern, EmploymentType, HalfDayRuleType, StaffRole } from "@/types/kintai";
import { cn } from "@/lib/utils";

export function ScheduleBar({
  role,
  employmentType,
  halfDayRule,
  patterns,
  activePatternId,
  canApplyToday,
  showAke = false,
  onApplyMonth,
  onApplyPattern,
  onAke,
  onLeave,
}: {
  role: StaffRole;
  employmentType: EmploymentType;
  halfDayRule: HalfDayRuleType;
  patterns: CustomShiftPattern[];
  activePatternId: string;
  canApplyToday: boolean;
  showAke?: boolean;
  onApplyMonth: () => void;
  onApplyPattern: (pattern: CustomShiftPattern) => void;
  onAke: () => void;
  onLeave: (kind: "koukyu" | "yukyu") => void;
}) {
  return (
    <section className="rounded-2xl bg-gradient-to-r from-white via-slate-50 to-sky-50/40 p-4 ring-1 ring-slate-200/80" aria-label="本日のシフト">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {ROLE_LABEL[role]} · {EMPLOYMENT_LABEL[employmentType]} · {HALF_RULE_LABEL[halfDayRule]}
        </p>
        <button
          type="button"
          onClick={onApplyMonth}
          className="ml-auto rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          週間設定を1ヶ月分に反映
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {patterns.map((pattern) => {
          const selected = activePatternId === pattern.id;
          const tone = shiftToneFromLabel(pattern.label);
          return (
            <button
              key={pattern.id}
              type="button"
              aria-label={patternButtonLabel(pattern)}
              aria-pressed={selected}
              disabled={!canApplyToday}
              onClick={() => onApplyPattern(pattern)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm disabled:opacity-50",
                shiftBadgeClass(tone, selected),
                selected && "font-semibold",
              )}
            >
              {patternButtonLabel(pattern)}
            </button>
          );
        })}
        {showAke ? (
          <button
            type="button"
            aria-pressed={activePatternId === "ake"}
            disabled={!canApplyToday}
            onClick={onAke}
            className={cn("rounded-full px-3 py-1.5 text-sm disabled:opacity-50", shiftBadgeClass("ake", activePatternId === "ake"))}
          >
            明け
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canApplyToday}
          onClick={() => onLeave("koukyu")}
          className={cn("rounded-full px-3 py-1.5 text-sm disabled:opacity-50", shiftBadgeClass("koukyu"))}
        >
          公休
        </button>
        <button
          type="button"
          disabled={!canApplyToday}
          onClick={() => onLeave("yukyu")}
          className={cn("rounded-full px-3 py-1.5 text-sm disabled:opacity-50", shiftBadgeClass("yukyu"))}
        >
          有休
        </button>
      </div>
      {patterns.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">職員の編集からマイ・シフトを登録できます。</p>
      ) : null}
    </section>
  );
}
