import { hasFullLeave } from "@/lib/calc";
import { parseISODate } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import {
  applyAke,
  applyShiftPattern,
  chooseFullLeave,
  chooseHalf,
  chooseKekkin,
  chooseShift,
  editClocks,
  editNote,
  editOvertime,
  editShortage,
  resetAutomaticOvertime,
} from "@/lib/records";
import { dutyFromSetting } from "@/lib/schedule";
import { contractFromRecord, patternButtonLabel, patternShiftCode } from "@/lib/shift-patterns";
import { SHIFTS, describeShift, expectedDuty, shiftFor, shiftsForJob, type DutyWindow } from "@/lib/shifts";
import { formatHours, formatMinutesJa, scheduledWorkMinutes } from "@/lib/time";
import type { CustomShiftPattern, DailyRecord, DayShiftSetting, HalfDayRuleType, JobType, LeaveMark } from "@/types/kintai";
import { cn } from "@/lib/utils";

const field =
  "h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function LedgerTable({
  jobType,
  records,
  scheduledMinutes,
  halfDayRule = "equal_4h",
  weeklySchedule,
  patterns = [],
  showAllShifts = false,
  onRecord,
  onHalfMode,
}: {
  jobType: JobType;
  records: DailyRecord[];
  scheduledMinutes?: number | null;
  halfDayRule?: HalfDayRuleType;
  weeklySchedule?: Record<number, DayShiftSetting>;
  patterns?: CustomShiftPattern[];
  showAllShifts?: boolean;
  onRecord: (date: string, next: DailyRecord) => void;
  onHalfMode?: (date: string, mode: "normal" | "am" | "pm") => void;
}) {
  const shifts = showAllShifts ? Object.values(SHIFTS) : shiftsForJob(jobType);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className="w-full min-w-[1240px] border-collapse text-sm">
        <thead className="bg-muted/80 text-xs">
          <tr className="border-b border-border">
            <th className="px-2 py-2 text-left font-medium">日</th>
            <th className="px-2 py-2 text-left font-medium">曜</th>
            <th className="px-2 py-2 text-left font-medium">公休</th>
            <th className="px-2 py-2 text-left font-medium">欠勤</th>
            <th className="px-2 py-2 text-left font-medium">特忌</th>
            <th className="px-2 py-2 text-left font-medium">有休</th>
            <th className="px-2 py-2 text-left font-medium">半休</th>
            <th className="px-2 py-2 text-left font-medium">勤務</th>
            <th className="px-2 py-2 text-left font-medium">出勤</th>
            <th className="px-2 py-2 text-left font-medium">退勤</th>
            <th className="px-2 py-2 text-left font-medium">休憩</th>
            <th className="px-2 py-2 text-left font-medium">時間外</th>
            <th className="px-2 py-2 text-left font-medium">不足</th>
            <th className="px-2 py-2 text-left font-medium">備考</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const date = parseISODate(record.date);
            const holiday = holidayName(date);
            const shift = shiftFor(record.shiftCode);
            const stored = contractFromRecord(record);
            const weekDuty = !stored && record.halfDayType === "none" ? dutyFromSetting(weeklySchedule?.[date.getDay()]) : null;
            const contract = stored ?? weekDuty;
            const duty = contract ?? (shift ? expectedDuty(shift, record.halfDayType, scheduledMinutes) : null);
            const worked = scheduledWorkMinutes(record.clockIn, record.clockOut, record.breakMinutes);
            const suggestD =
              (record.dayOfWeek === "木" || record.dayOfWeek === "土") &&
              !record.shiftCode &&
              !hasFullLeave(record);
            return (
              <tr
                key={record.date}
                id={`day-${record.date}`}
                className={cn(
                  "border-b border-border/70 align-top",
                  record.dayOfWeek === "日" && "bg-red-50/80",
                  record.dayOfWeek === "土" && "bg-sky-50/70",
                  holiday && record.dayOfWeek !== "日" && record.dayOfWeek !== "土" && "bg-amber-50/80",
                  record.date === todayKey && "outline outline-2 -outline-offset-2 outline-sky-500",
                )}
              >
                <td className="px-2 py-1.5">
                  <div className={cn("font-medium tabular-nums", record.date === todayKey && "text-primary")}>
                    {record.dayOfMonth}
                  </div>
                  {holiday ? <div className="text-[10px] text-amber-800">{holiday}</div> : null}
                </td>
                <td className={cn("px-2 py-1.5", weekdayTone(record.dayOfWeek))}>{record.dayOfWeek}</td>
                <td className="px-2 py-1.5">
                  <MarkButton
                    label="公休"
                    pressed={record.koukyu === "○"}
                    onClick={() => onRecord(record.date, chooseFullLeave(record, "koukyu", record.koukyu !== "○"))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`${record.date} 欠勤`}
                    className={field}
                    value={record.kekkin}
                    onChange={(event) => onRecord(record.date, chooseKekkin(record, event.target.value as LeaveMark))}
                  >
                    <option value="">—</option>
                    <option value="○">○ 終日</option>
                    <option value="△">△ 半日</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <MarkButton
                    label="特忌"
                    pressed={record.tokki === "○"}
                    onClick={() => onRecord(record.date, chooseFullLeave(record, "tokki", record.tokki !== "○"))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  {record.halfDayType === "am" || record.halfDayType === "pm" ? (
                    <span className="inline-flex h-7 items-center text-sm font-semibold">△</span>
                  ) : (
                    <MarkButton
                      label="有休"
                      pressed={record.yukyu === "○"}
                      onClick={() => onRecord(record.date, chooseFullLeave(record, "yukyu", record.yukyu !== "○"))}
                    />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`${record.date} 半休`}
                    className={cn(field, "min-w-24")}
                    value={record.halfDayType}
                    onChange={(event) => {
                      const value = event.target.value as DailyRecord["halfDayType"];
                      if (onHalfMode && (value === "none" || value === "am" || value === "pm")) {
                        onHalfMode(record.date, value === "none" ? "normal" : value);
                        return;
                      }
                      onRecord(record.date, chooseHalf(record, value, scheduledMinutes));
                    }}
                  >
                    <option value="none">なし</option>
                    {halfDayRule === "asymmetric_3_5_4h" ? (
                      <>
                        <option value="am">午前半休 13:00〜17:00</option>
                        <option value="pm">午後半休 08:30〜12:00</option>
                      </>
                    ) : (
                      <>
                        <option value="am">午前半休 (午後4h勤務)</option>
                        <option value="pm">午後半休 (午前4h勤務)</option>
                      </>
                    )}
                    {record.halfDayType === "am_off" ? <option value="am_off">午前休</option> : null}
                    {record.halfDayType === "pm_off" ? <option value="pm_off">午後休</option> : null}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`${record.date} 勤務`}
                    className={cn(field, "min-w-28")}
                    value={
                      patterns.some((pattern) => pattern.id === record.patternId)
                        ? `pattern:${record.patternId}`
                        : record.shiftCode
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value.startsWith("pattern:")) {
                        const pattern = patterns.find((item) => item.id === value.slice("pattern:".length));
                        if (pattern) onRecord(record.date, applyShiftPattern(record, pattern));
                        return;
                      }
                      if (value === "明け") {
                        onRecord(record.date, applyAke(record));
                        return;
                      }
                      onRecord(record.date, chooseShift(record, value, scheduledMinutes));
                    }}
                  >
                    <option value="">—</option>
                    {patterns.map((pattern) => (
                      <option key={pattern.id} value={`pattern:${pattern.id}`}>
                        {pattern.label || patternShiftCode(pattern)}
                      </option>
                    ))}
                    {shifts.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                    <option value="free">自由</option>
                    <option value="明け">明け</option>
                    {record.shiftCode &&
                    record.shiftCode !== "free" &&
                    record.shiftCode !== "明け" &&
                    !shifts.some((item) => item.code === record.shiftCode) &&
                    !patterns.some((pattern) => pattern.id === record.patternId) ? (
                      <option value={record.shiftCode}>{record.patternLabel || record.shiftCode}</option>
                    ) : null}
                  </select>
                  {record.patternLabel ? <p className="mt-1 text-[10px] font-medium">{record.patternLabel}</p> : null}
                  {duty?.start ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      所定 {duty.start}–{duty.overnight ? `翌${duty.end}` : duty.end} / {formatHours(duty.scheduledMinutes)}h
                      {record.clockIn && record.clockOut ? ` · 実働 ${formatHours(worked)}h` : ""}
                    </p>
                  ) : null}
                  <div className="mt-1 flex max-w-56 flex-wrap gap-1">
                    {patterns.map((pattern) => (
                      <button
                        key={pattern.id}
                        type="button"
                        aria-label={`${record.date} ${patternButtonLabel(pattern)}`}
                        aria-pressed={record.patternId === pattern.id}
                        onClick={() => onRecord(record.date, applyShiftPattern(record, pattern))}
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[10px]",
                          record.patternId === pattern.id
                            ? "border-sky-600 bg-sky-50 font-semibold text-sky-950"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        {patternButtonLabel(pattern)}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-label={`${record.date} 明け`}
                      aria-pressed={record.shiftCode === "明け"}
                      onClick={() => onRecord(record.date, applyAke(record))}
                      className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
                    >
                      明け
                    </button>
                    <button
                      type="button"
                      aria-label={`${record.date} 公休`}
                      aria-pressed={record.koukyu === "○"}
                      onClick={() => onRecord(record.date, chooseFullLeave(record, "koukyu", record.koukyu !== "○"))}
                      className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
                    >
                      公休
                    </button>
                  </div>
                  {suggestD ? (
                    <button
                      type="button"
                      className="mt-1 text-[10px] text-primary underline-offset-2 hover:underline"
                      onClick={() => onRecord(record.date, chooseShift(record, "D", scheduledMinutes))}
                    >
                      Dを入れる
                    </button>
                  ) : null}
                </td>
                <TimeCell label="出勤" record={record} field="clockIn" scheduledMinutes={scheduledMinutes} dutyOverride={contract} onRecord={onRecord} />
                <TimeCell label="退勤" record={record} field="clockOut" scheduledMinutes={scheduledMinutes} dutyOverride={contract} onRecord={onRecord} />
                <td className="px-2 py-1.5">
                  <input
                    aria-label={`${record.date} 休憩`}
                    className={cn(field, "w-16 tabular-nums")}
                    type="number"
                    min={0}
                    step={5}
                    value={record.breakMinutes}
                    onChange={(event) =>
                      onRecord(
                        record.date,
                        editClocks(record, { breakMinutes: Number(event.target.value) || 0 }, scheduledMinutes, contract),
                      )
                    }
                    onWheel={(event) => event.currentTarget.blur()}
                  />
                </td>
                <OvertimeCell record={record} scheduledMinutes={scheduledMinutes} onRecord={onRecord} />
                <td className="px-2 py-1.5">
                  <input
                    aria-label={`${record.date} 不足`}
                    className={cn(field, "w-16 tabular-nums")}
                    value={record.shortageTime}
                    placeholder="0:30"
                    onChange={(event) => onRecord(record.date, editShortage(record, event.target.value))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    {record.halfDayType === "am" ? <HalfTag>AM半休</HalfTag> : null}
                    {record.halfDayType === "pm" ? <HalfTag>PM半休</HalfTag> : null}
                    {record.halfDayType === "am_off" ? <HalfTag>午前休</HalfTag> : null}
                    {record.halfDayType === "pm_off" ? <HalfTag>午後休</HalfTag> : null}
                    <input
                      aria-label={`${record.date} 備考`}
                      className={field}
                      value={record.note}
                      placeholder="振休、業務メモ"
                      onChange={(event) => onRecord(record.date, editNote(record, event.target.value))}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-border px-3 py-2 text-[11px] leading-5 text-muted-foreground">
        {shifts.map((shift) => (
          <span key={shift.code} className="mr-4">
            {shift.label} {describeShift(shift)}
          </span>
        ))}
      </div>
    </div>
  );
}

function TimeCell({
  label,
  record,
  field: key,
  scheduledMinutes,
  dutyOverride,
  onRecord,
}: {
  label: string;
  record: DailyRecord;
  field: "clockIn" | "clockOut";
  scheduledMinutes?: number | null;
  dutyOverride?: DutyWindow | null;
  onRecord: (date: string, next: DailyRecord) => void;
}) {
  return (
    <td className="px-2 py-1.5">
      <input
        aria-label={`${record.date} ${label}`}
        className={cn(field, "w-[6.5rem] tabular-nums")}
        type="time"
        value={record[key]}
        onChange={(event) => onRecord(record.date, editClocks(record, { [key]: event.target.value }, scheduledMinutes, dutyOverride))}
      />
    </td>
  );
}

function OvertimeCell({
  record,
  scheduledMinutes,
  onRecord,
}: {
  record: DailyRecord;
  scheduledMinutes?: number | null;
  onRecord: (date: string, next: DailyRecord) => void;
}) {
  const knownShift = Boolean(shiftFor(record.shiftCode));
  const tracked = Boolean(record.contractStart && record.contractEnd);
  if ((knownShift || tracked) && !record.overtimeManual) {
    return (
      <td className="px-2 py-1.5">
        <p className="text-xs tabular-nums">{record.overtimeSpan || "—"}</p>
        <p className="text-xs font-medium">{record.overtimeMinutes ? formatMinutesJa(record.overtimeMinutes) : "—"}</p>
        <button
          type="button"
          className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => onRecord(record.date, { ...record, overtimeManual: true })}
        >
          手入力
        </button>
      </td>
    );
  }

  return (
    <td className="px-2 py-1.5">
      <input
        aria-label={`${record.date} 時間外`}
        className={cn(field, "mb-1")}
        value={record.overtimeSpan}
        placeholder="18:00〜19:30"
        onChange={(event) => onRecord(record.date, editOvertime(record, event.target.value, record.overtimeMinutes))}
      />
      <input
        aria-label={`${record.date} 超え分`}
        className={cn(field, "w-16 tabular-nums")}
        type="number"
        min={0}
        step={5}
        value={record.overtimeMinutes}
        onChange={(event) =>
          onRecord(record.date, editOvertime(record, record.overtimeSpan, Number(event.target.value) || 0))
        }
        onWheel={(event) => event.currentTarget.blur()}
      />
      {knownShift || tracked ? (
        <button
          type="button"
          className="mt-1 block text-[10px] text-primary underline-offset-2 hover:underline"
          onClick={() => onRecord(record.date, resetAutomaticOvertime(record, scheduledMinutes))}
        >
          自動に戻す
        </button>
      ) : null}
    </td>
  );
}

function MarkButton({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold",
        pressed
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {pressed ? "○" : label.slice(0, 1)}
    </button>
  );
}

function HalfTag({ children }: { children: string }) {
  return <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium">{children}</span>;
}

function weekdayTone(day: string): string {
  if (day === "日") return "font-medium text-red-700";
  if (day === "土") return "font-medium text-sky-800";
  return "";
}
