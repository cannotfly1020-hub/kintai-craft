import { hasFullLeave } from "@/lib/calc";
import { parseISODate } from "@/lib/date";
import { holidayName } from "@/lib/holidays";
import {
  HOLIDAY_WORK_ID,
  SUBSTITUTE_HOLIDAY_ID,
  SUBSTITUTE_WORK_ID,
  applyAke,
  applyHolidayWork,
  applyShiftPattern,
  applySubstituteHoliday,
  applySubstituteWork,
  chooseFullLeave,
  chooseHalf,
  chooseKekkin,
  chooseShift,
  editClocks,
  editNote,
  editOvertime,
  editShortage,
  isHolidayWork,
  isSpecialDutyMode,
  isSubstituteHoliday,
  isSubstituteWork,
  resetAutomaticOvertime,
  resolveStandardWork,
} from "@/lib/records";
import { dutyFromSetting } from "@/lib/schedule";
import { contractFromRecord, patternButtonLabel, patternShiftCode } from "@/lib/shift-patterns";
import { SHIFTS, describeShift, expectedDuty, shiftFor, shiftLabel, shiftsForJob, type DutyWindow } from "@/lib/shifts";
import { formatHours, formatMinutesJa, scheduledWorkMinutes } from "@/lib/time";
import { ledgerRowClass, shiftBadgeClass, shiftToneFromLabel, weekdayTextClass } from "@/lib/shift-ui";
import type { CustomShiftPattern, DailyRecord, DayShiftSetting, HalfDayRuleType, JobType, LeaveMark } from "@/types/kintai";
import { cn } from "@/lib/utils";

const field =
  "h-9 w-full rounded-md border border-input bg-white/90 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
const monoField = cn(field, "font-mono tabular-nums");

export function LedgerTable({
  jobType,
  records,
  scheduledMinutes,
  halfDayRule = "equal_4h",
  weeklySchedule,
  patterns = [],
  showAllShifts = false,
  showAke = false,
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
  showAke?: boolean;
  onRecord: (date: string, next: DailyRecord) => void;
  onHalfMode?: (date: string, mode: "normal" | "am" | "pm") => void;
}) {
  const shifts = showAllShifts ? Object.values(SHIFTS) : shiftsForJob(jobType);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10">
      <table className="w-full min-w-[1240px] border-collapse text-sm">
        <thead className="bg-slate-100/90 text-xs text-slate-700">
          <tr className="border-b border-border">
            <th className="px-3 py-3 text-left font-semibold">日</th>
            <th className="px-3 py-3 text-left font-semibold">曜</th>
            <th className="px-3 py-3 text-left font-semibold">公休</th>
            <th className="px-3 py-3 text-left font-semibold">欠勤</th>
            <th className="px-3 py-3 text-left font-semibold">特忌</th>
            <th className="px-3 py-3 text-left font-semibold">有休</th>
            <th className="px-3 py-3 text-left font-semibold">半休</th>
            <th className="px-3 py-3 text-left font-semibold">勤務</th>
            <th className="px-3 py-3 text-left font-semibold">出勤</th>
            <th className="px-3 py-3 text-left font-semibold">退勤</th>
            <th className="px-3 py-3 text-left font-semibold">休憩</th>
            <th className="px-3 py-3 text-left font-semibold">時間外</th>
            <th className="px-3 py-3 text-left font-semibold">不足</th>
            <th className="px-3 py-3 text-left font-semibold">備考</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const date = parseISODate(record.date);
            const holiday = holidayName(date);
            const isToday = record.date === todayKey;
            const isKoukyu = record.koukyu === "○";
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
            const standard = resolveStandardWork({ patterns, weeklySchedule, sheetType: jobType });
            const specialMode = isSpecialDutyMode(record);
            const holidayWork = isHolidayWork(record);
            const substituteWork = isSubstituteWork(record);
            const substituteHoliday = isSubstituteHoliday(record);
            const statusLabel = holidayWork
              ? "休出"
              : substituteWork
                ? "振出"
                : substituteHoliday
                  ? "振休"
                  : record.shiftCode === "明け"
                    ? "明け"
                    : record.yukyu === "○"
                      ? "有休"
                      : record.koukyu === "○"
                        ? "公休"
                        : record.halfDayType === "am"
                          ? "午前半休"
                          : record.halfDayType === "pm"
                            ? "午後半休"
                            : record.patternLabel ||
                              (record.shiftCode && record.shiftCode !== "free" ? shiftLabel(record.shiftCode) : "");
            const dutySelectValue = holidayWork
              ? HOLIDAY_WORK_ID
              : substituteWork
                ? SUBSTITUTE_WORK_ID
                : substituteHoliday
                  ? SUBSTITUTE_HOLIDAY_ID
                  : patterns.some((pattern) => pattern.id === record.patternId)
                    ? `pattern:${record.patternId}`
                    : record.shiftCode;
            return (
              <tr
                key={record.date}
                id={`day-${record.date}`}
                className={ledgerRowClass({
                  dayOfWeek: record.dayOfWeek,
                  isHoliday: Boolean(holiday),
                  isKoukyu,
                  isToday,
                })}
              >
                <td className="relative px-3 py-2.5">
                  {isToday ? <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-amber-500" aria-hidden /> : null}
                  <div className={cn("font-mono text-sm font-semibold tabular-nums", isToday && "text-amber-900")}>
                    {record.dayOfMonth}
                    {isToday ? <span className="ml-1 text-[10px] font-bold text-amber-700">今日</span> : null}
                  </div>
                  {holiday ? <div className="text-[10px] font-medium text-rose-700">{holiday}</div> : null}
                </td>
                <td className={cn("px-3 py-2.5", weekdayTextClass(record.dayOfWeek, Boolean(holiday)))}>{record.dayOfWeek}</td>
                <td className="px-3 py-2.5">
                  <MarkButton
                    label="公休"
                    pressed={record.koukyu === "○" && !substituteHoliday}
                    tone="koukyu"
                    onClick={() => onRecord(record.date, chooseFullLeave(record, "koukyu", !(record.koukyu === "○" && !substituteHoliday)))}
                  />
                </td>
                <td className="px-3 py-2.5">
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
                <td className="px-3 py-2.5">
                  <MarkButton
                    label="特忌"
                    pressed={record.tokki === "○"}
                    onClick={() => onRecord(record.date, chooseFullLeave(record, "tokki", record.tokki !== "○"))}
                  />
                </td>
                <td className="px-3 py-2.5">
                  {record.halfDayType === "am" || record.halfDayType === "pm" ? (
                    <span className={shiftBadgeClass("half")}>△</span>
                  ) : (
                    <MarkButton
                      label="有休"
                      pressed={record.yukyu === "○"}
                      tone="yukyu"
                      onClick={() => onRecord(record.date, chooseFullLeave(record, "yukyu", record.yukyu !== "○"))}
                    />
                  )}
                </td>
                <td className="px-3 py-2.5">
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
                <td className="px-3 py-2.5">
                  {statusLabel ? (
                    <span className={cn("mb-1.5", shiftBadgeClass(shiftToneFromLabel(statusLabel)))}>{statusLabel}</span>
                  ) : null}
                  <select
                    aria-label={`${record.date} 勤務`}
                    className={cn(field, "mt-1 min-w-28")}
                    value={dutySelectValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === HOLIDAY_WORK_ID) {
                        onRecord(record.date, applyHolidayWork(record, standard.duty));
                        return;
                      }
                      if (value === SUBSTITUTE_WORK_ID) {
                        onRecord(record.date, applySubstituteWork(record, standard));
                        return;
                      }
                      if (value === SUBSTITUTE_HOLIDAY_ID) {
                        onRecord(record.date, applySubstituteHoliday(record));
                        return;
                      }
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
                    {holidayWork ? <option value={HOLIDAY_WORK_ID}>休出</option> : null}
                    {substituteWork ? <option value={SUBSTITUTE_WORK_ID}>振出</option> : null}
                    {substituteHoliday ? <option value={SUBSTITUTE_HOLIDAY_ID}>振休</option> : null}
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
                    {showAke ? <option value="明け">明け</option> : null}
                    {record.shiftCode &&
                    record.shiftCode !== "free" &&
                    record.shiftCode !== "明け" &&
                    !shifts.some((item) => item.code === record.shiftCode) &&
                    !patterns.some((pattern) => pattern.id === record.patternId) &&
                    !specialMode ? (
                      <option value={record.shiftCode}>{record.patternLabel || shiftLabel(record.shiftCode)}</option>
                    ) : null}
                    {!showAke && record.shiftCode === "明け" ? <option value="明け">明け</option> : null}
                  </select>
                  {duty?.start ? (
                    <p className="mt-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                      所定 {duty.start}–{duty.overnight ? `翌${duty.end}` : duty.end} / {formatHours(duty.scheduledMinutes)}h
                      {record.clockIn && record.clockOut ? ` · 実働 ${formatHours(worked)}h` : ""}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex max-w-64 flex-wrap gap-1">
                    {patterns.map((pattern) => {
                      const selected = !specialMode && record.patternId === pattern.id;
                      return (
                        <button
                          key={pattern.id}
                          type="button"
                          aria-label={`${record.date} ${patternButtonLabel(pattern)}`}
                          aria-pressed={selected}
                          onClick={() => onRecord(record.date, applyShiftPattern(record, pattern))}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px]",
                            shiftBadgeClass(shiftToneFromLabel(pattern.label), selected),
                          )}
                        >
                          {pattern.label.trim() || "無題"}
                        </button>
                      );
                    })}
                    {showAke ? (
                      <button
                        type="button"
                        aria-label={`${record.date} 明け`}
                        aria-pressed={!specialMode && record.shiftCode === "明け"}
                        onClick={() => onRecord(record.date, applyAke(record))}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px]",
                          shiftBadgeClass("ake", !specialMode && record.shiftCode === "明け"),
                        )}
                      >
                        明け
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`${record.date} 公休`}
                      aria-pressed={record.koukyu === "○" && !substituteHoliday}
                      onClick={() =>
                        onRecord(record.date, chooseFullLeave(record, "koukyu", !(record.koukyu === "○" && !substituteHoliday)))
                      }
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px]",
                        shiftBadgeClass("koukyu", record.koukyu === "○" && !substituteHoliday),
                      )}
                    >
                      公休
                    </button>
                    <button
                      type="button"
                      aria-label={`${record.date} 休日出勤`}
                      aria-pressed={holidayWork}
                      onClick={() => onRecord(record.date, applyHolidayWork(record, standard.duty))}
                      className={cn("rounded-full px-2 py-0.5 text-[10px]", shiftBadgeClass("kyushutsu", holidayWork))}
                    >
                      休日出勤
                    </button>
                    <button
                      type="button"
                      aria-label={`${record.date} 振替出勤`}
                      aria-pressed={substituteWork}
                      onClick={() => onRecord(record.date, applySubstituteWork(record, standard))}
                      className={cn("rounded-full px-2 py-0.5 text-[10px]", shiftBadgeClass("furide", substituteWork))}
                    >
                      振替出勤
                    </button>
                    <button
                      type="button"
                      aria-label={`${record.date} 振替休日`}
                      aria-pressed={substituteHoliday}
                      onClick={() => onRecord(record.date, applySubstituteHoliday(record))}
                      className={cn("rounded-full px-2 py-0.5 text-[10px]", shiftBadgeClass("furikyu", substituteHoliday))}
                    >
                      振替休日
                    </button>
                  </div>
                  {suggestD ? (
                    <button
                      type="button"
                      className="mt-1 text-[10px] text-primary underline-offset-2 hover:underline"
                      onClick={() => onRecord(record.date, chooseShift(record, "D", scheduledMinutes))}
                    >
                      半日を入れる
                    </button>
                  ) : null}
                </td>
                <TimeCell label="出勤" record={record} field="clockIn" scheduledMinutes={scheduledMinutes} dutyOverride={contract} onRecord={onRecord} />
                <TimeCell label="退勤" record={record} field="clockOut" scheduledMinutes={scheduledMinutes} dutyOverride={contract} onRecord={onRecord} />
                <td className="px-3 py-2.5">
                  <input
                    aria-label={`${record.date} 休憩`}
                    className={cn(monoField, "w-16")}
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
                <td className="px-3 py-2.5">
                  <input
                    aria-label={`${record.date} 不足`}
                    className={cn(monoField, "w-16")}
                    value={record.shortageTime}
                    placeholder="0:30"
                    onChange={(event) => onRecord(record.date, editShortage(record, event.target.value))}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {record.halfDayType === "am" ? <span className={shiftBadgeClass("half")}>午前半休</span> : null}
                    {record.halfDayType === "pm" ? <span className={shiftBadgeClass("half")}>午後半休</span> : null}
                    {record.halfDayType === "am_off" ? <span className={shiftBadgeClass("half")}>午前休</span> : null}
                    {record.halfDayType === "pm_off" ? <span className={shiftBadgeClass("half")}>午後休</span> : null}
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
    <td className="px-3 py-2.5 align-middle">
      <input
        aria-label={`${record.date} ${label}`}
        className={cn(monoField, "w-[6.75rem]")}
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
      <td className="px-3 py-2.5 align-middle">
        <p className="font-mono text-xs tabular-nums">{record.overtimeSpan || "—"}</p>
        <p className="font-mono text-xs font-medium tabular-nums">
          {record.overtimeMinutes ? formatMinutesJa(record.overtimeMinutes) : "—"}
        </p>
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
    <td className="px-3 py-2.5 align-middle">
      <input
        aria-label={`${record.date} 時間外`}
        className={cn(monoField, "mb-1")}
        value={record.overtimeSpan}
        placeholder="18:00〜19:30"
        onChange={(event) => onRecord(record.date, editOvertime(record, event.target.value, record.overtimeMinutes))}
      />
      <input
        aria-label={`${record.date} 超え分`}
        className={cn(monoField, "w-16")}
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

function MarkButton({
  label,
  pressed,
  onClick,
  tone,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  tone?: "koukyu" | "yukyu";
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-md border px-1.5 text-xs font-semibold transition-colors",
        pressed
          ? tone === "yukyu"
            ? "border-teal-300 bg-teal-100 text-teal-900"
            : tone === "koukyu"
              ? "border-gray-300 bg-gray-200 text-gray-800"
              : "border-primary bg-primary text-primary-foreground"
          : "border-border bg-white text-muted-foreground hover:bg-muted",
      )}
    >
      {pressed ? "○" : label.slice(0, 1)}
    </button>
  );
}
