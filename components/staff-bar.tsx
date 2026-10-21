"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StaffMember } from "@/lib/staff";
import { HALF_RULE_LABEL, ROLE_LABEL, WEEKDAY_NAMES, dayFromPattern, dayFromShiftCode, holidayDay, presetForRole, recomputeScheduled } from "@/lib/schedule";
import { blankPattern, defaultContractHours, defaultShiftPatterns, EMPLOYMENT_LABEL, patternButtonLabel, patternScheduledMinutes, SHIFT_PATTERN_LIMIT, withOvernight } from "@/lib/shift-patterns";
import { JOB_LABEL, SHIFTS, shiftLabel, shiftsForJob } from "@/lib/shifts";
import { formatHours } from "@/lib/time";
import type { CustomShiftPattern, DayShiftSetting, EmploymentType, HalfDayRuleType, JobType, ShiftCode, StaffRole } from "@/types/kintai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const field =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function StaffBar({
  staffList,
  currentStaff,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: {
  staffList: StaffMember[];
  currentStaff: StaffMember | null;
  onSelect: (staffId: string) => void;
  onCreate: (input: Omit<StaffMember, "id">) => void;
  onUpdate: (staffId: string, input: Omit<StaffMember, "id">) => void;
  onDelete: (staffId: string) => void;
}) {
  const [draft, setDraft] = useState<StaffMember | null | "new">(null);

  function removeCurrent() {
    if (!currentStaff) return;
    if (staffList.length <= 1) {
      window.alert("最後の職員は削除できません。");
      return;
    }
    const name = currentStaff.name.trim() || "この職員";
    if (!window.confirm(`${name}さんを削除しますか？この職員の勤怠データも消えます。`)) return;
    onDelete(currentStaff.id);
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-b border-border/70 pb-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium">職員</span>
        <select
          aria-label="職員"
          className={`${field} min-w-48`}
          value={currentStaff?.id ?? ""}
          onChange={(event) => onSelect(event.target.value)}
        >
          {staffList.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {(staff.name.trim() || "氏名未設定") + `（${ROLE_LABEL[staff.role]}）`}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">
        選択中: <span className="font-medium text-foreground">{currentStaff?.name.trim() || "氏名未設定"}</span>
      </p>
      <Button type="button" variant="outline" onClick={() => setDraft("new")}>
        ＋ 職員を追加
      </Button>
      <Button type="button" variant="outline" onClick={() => currentStaff && setDraft(currentStaff)} disabled={!currentStaff}>
        職員を編集
      </Button>
      <Button type="button" variant="outline" onClick={removeCurrent}>
        職員を削除
      </Button>
      {draft ? (
        <StaffForm
          key={draft === "new" ? "new" : draft.id}
          initial={draft === "new" ? null : draft}
          onClose={() => setDraft(null)}
          onSave={(input) => {
            if (draft === "new") onCreate(input);
            else onUpdate(draft.id, input);
            setDraft(null);
          }}
        />
      ) : null}
    </div>
  );
}

function StaffForm({
  initial,
  onClose,
  onSave,
}: {
  initial: StaffMember | null;
  onClose: () => void;
  onSave: (input: Omit<StaffMember, "id">) => void;
}) {
  const created = presetForRole("pt_outpatient");
  const seed = initial ?? {
    ...created,
    name: "",
    initialPaidLeave: 10,
    employmentType: "full_time" as const,
    shiftPatterns: defaultShiftPatterns("pt_outpatient", "full_time"),
    contractHoursPerDay: undefined,
    hourlyWage: undefined,
  };
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<StaffRole>(seed.role);
  const [halfDayRule, setHalfDayRule] = useState<HalfDayRuleType>(seed.halfDayRule);
  const [sheetType, setSheetType] = useState(seed.sheetType);
  const [paidLeave, setPaidLeave] = useState(String(seed.initialPaidLeave));
  const [employmentType, setEmploymentType] = useState<EmploymentType>(seed.employmentType);
  const [contractHours, setContractHours] = useState(seed.contractHoursPerDay != null ? String(seed.contractHoursPerDay) : "");
  const [hourlyWage, setHourlyWage] = useState(seed.hourlyWage != null ? String(seed.hourlyWage) : "");
  const [shiftPatterns, setShiftPatterns] = useState<CustomShiftPattern[]>(() => seed.shiftPatterns.map((item) => ({ ...item })));
  const [weeklySchedule, setWeeklySchedule] = useState(() => linkWeekToPatterns(cloneWeek(seed.weeklySchedule), seed.shiftPatterns));
  const [error, setError] = useState("");
  const rememberedWork = useRef(rememberWorkDays(weeklySchedule));

  function applyPatterns(nextPatterns: CustomShiftPattern[], week: Record<number, DayShiftSetting>) {
    const linked = linkWeekToPatterns(week, nextPatterns);
    rememberedWork.current = rememberWorkDays(linked);
    setShiftPatterns(nextPatterns.map((item) => ({ ...item })));
    setWeeklySchedule(linked);
  }

  function changeRole(next: StaffRole) {
    setRole(next);
    if (next === "custom") return;
    const preset = presetForRole(next);
    const patterns = defaultShiftPatterns(next, employmentType);
    setHalfDayRule(preset.halfDayRule);
    setSheetType(preset.sheetType);
    applyPatterns(patterns, cloneWeek(preset.weeklySchedule));
  }

  function changeEmployment(next: EmploymentType) {
    const patterns = role === "custom" ? shiftPatterns : defaultShiftPatterns(role, next);
    setEmploymentType(next);
    if (role !== "custom") {
      setWeeklySchedule((current) => {
        const linked = assignPatternsToWeek(current, patterns);
        rememberedWork.current = rememberWorkDays(linked);
        return linked;
      });
      setShiftPatterns(patterns.map((item) => ({ ...item })));
    }
    if (next === "part_time") {
      setContractHours((current) => {
        const parsed = Number(current);
        return parsed > 0 ? current : String(defaultContractHours(patterns));
      });
    }
  }

  function updatePattern(id: string, patch: Partial<CustomShiftPattern>) {
    setShiftPatterns((current) => {
      const source = current.find((item) => item.id === id);
      if (!source) return current;
      const updated = withOvernight({ ...source, ...patch });
      setWeeklySchedule((week) => {
        let changed = false;
        const next = { ...week };
        for (let index = 0; index < 7; index += 1) {
          const day = next[index];
          if (!day || day.patternId !== id || day.isHoliday) continue;
          next[index] = dayFromPattern(updated);
          rememberedWork.current = { ...rememberedWork.current, [index]: { ...next[index] } };
          changed = true;
        }
        return changed ? next : week;
      });
      return current.map((item) => (item.id === id ? updated : item));
    });
  }

  function unlinkPattern(id: string) {
    setShiftPatterns((current) => current.filter((item) => item.id !== id));
    setWeeklySchedule((current) => {
      const next = { ...current };
      for (let index = 0; index < 7; index += 1) {
        const day = next[index];
        if (day?.patternId === id) next[index] = { ...day, patternId: "" };
      }
      return next;
    });
  }

  function putDay(index: number, patch: Partial<DayShiftSetting>) {
    setWeeklySchedule((current) => {
      const prev = current[index] ?? {
        startTime: "",
        endTime: "",
        breakMinutes: 0,
        scheduledMinutes: 0,
        shiftCode: "" as ShiftCode,
        isHoliday: false,
        patternId: "",
      };
      const keepsLink = Object.prototype.hasOwnProperty.call(patch, "patternId");
      const nextDay = {
        ...recomputeScheduled({
          ...prev,
          ...patch,
          patternId: keepsLink ? patch.patternId ?? "" : "",
        }),
      };
      if (!nextDay.isHoliday && (nextDay.shiftCode || nextDay.startTime)) {
        rememberedWork.current = { ...rememberedWork.current, [index]: { ...nextDay } };
      }
      return { ...current, [index]: nextDay };
    });
  }

  function applyPatternToDay(dayIndex: number, pattern: CustomShiftPattern) {
    const next = dayFromPattern(pattern);
    rememberedWork.current = { ...rememberedWork.current, [dayIndex]: { ...next } };
    setWeeklySchedule((current) => ({ ...current, [dayIndex]: next }));
  }

  function applyPatternToWeekdays(pattern: CustomShiftPattern) {
    const nextDay = dayFromPattern(pattern);
    setWeeklySchedule((current) => {
      const next = { ...current };
      for (const dayIndex of [1, 2, 3, 4, 5]) {
        next[dayIndex] = { ...nextDay };
        rememberedWork.current = { ...rememberedWork.current, [dayIndex]: { ...nextDay } };
      }
      return next;
    });
  }

  function setDayAsHoliday(dayIndex: number) {
    setWeeklySchedule((current) => {
      const prev = current[dayIndex];
      if (prev && !prev.isHoliday && (prev.shiftCode || prev.startTime)) {
        rememberedWork.current = { ...rememberedWork.current, [dayIndex]: { ...prev } };
      }
      return { ...current, [dayIndex]: holidayDay() };
    });
  }

  function handleSchedulePatternSelect(index: number, selectedValue: string) {
    if (!selectedValue) {
      setDayAsHoliday(index);
      return;
    }
    if (selectedValue.startsWith("pattern:")) {
      const patternId = selectedValue.slice("pattern:".length);
      const pattern = shiftPatterns.find((item) => item.id === patternId);
      if (!pattern) return;
      applyPatternToDay(index, pattern);
      return;
    }
    const fromPalette = shiftPatterns.find(
      (item) => item.id === selectedValue || item.label === selectedValue || (item.shiftCode.trim() || item.label.trim()) === selectedValue,
    );
    if (fromPalette) {
      applyPatternToDay(index, fromPalette);
      return;
    }
    putDay(index, { ...dayFromShiftCode(selectedValue), patternId: "" });
  }

  function symbolValue(day: DayShiftSetting): string {
    if (day.isHoliday) return "";
    const linked = day.patternId && shiftPatterns.find((item) => item.id === day.patternId);
    if (linked) return `pattern:${linked.id}`;
    const matched = matchPattern(day, shiftPatterns);
    if (matched) return `pattern:${matched.id}`;
    return day.shiftCode;
  }

  function toggleHoliday(index: number, on: boolean) {
    if (on) {
      setWeeklySchedule((current) => {
        const prev = current[index];
        if (prev && !prev.isHoliday && prev.shiftCode) {
          rememberedWork.current = { ...rememberedWork.current, [index]: { ...prev } };
        }
        return {
          ...current,
          [index]: recomputeScheduled({
            ...(prev ?? {
              startTime: "",
              endTime: "",
              breakMinutes: 0,
              scheduledMinutes: 0,
              shiftCode: "" as ShiftCode,
              isHoliday: true,
            }),
            startTime: "",
            endTime: "",
            breakMinutes: 0,
            scheduledMinutes: 0,
            shiftCode: "",
            isHoliday: true,
          }),
        };
      });
      return;
    }
    const restored = rememberedWork.current[index];
    if (restored?.shiftCode) {
      putDay(index, { ...restored, isHoliday: false });
      return;
    }
    const presetDay = presetForRole(role === "custom" ? "pt_outpatient" : role).weeklySchedule[index];
    putDay(index, !presetDay.isHoliday && presetDay.shiftCode ? { ...presetDay } : dayFromShiftCode(sheetType === "pt" ? "B-2" : "7.5H"));
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("氏名を入力してください");
      return;
    }
    if (shiftPatterns.some((item) => !item.label.trim() || !item.startTime || !item.endTime)) {
      setError("マイ・シフトは名前・始業・終業を入力してください");
      return;
    }
    const leave = Number(paidLeave);
    const contract = Number(contractHours);
    const wage = Number(hourlyWage);
    onSave({
      name: trimmed,
      role,
      halfDayRule,
      sheetType,
      initialPaidLeave: Number.isFinite(leave) && leave >= 0 ? leave : 0,
      weeklySchedule,
      employmentType,
      shiftPatterns: shiftPatterns.map((item) => withOvernight({ ...item, label: item.label.trim() })),
      contractHoursPerDay: employmentType === "part_time" && contract > 0 ? Math.round(contract * 10) / 10 : undefined,
      hourlyWage: employmentType === "part_time" && wage > 0 ? Math.round(wage) : undefined,
    });
  }

  const shiftChoices = role === "custom" ? Object.values(SHIFTS) : shiftsForJob(sheetType);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-form-title"
        className="relative my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <h2 id="staff-form-title" className="text-base font-semibold">
          {initial ? "職員を編集" : "職員を追加"}
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <Label htmlFor="new-staff-name">氏名（例: 山田 太郎）</Label>
            <Input id="new-staff-name" value={name} placeholder="山田 太郎" onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <Label htmlFor="new-staff-role">区分・職種</Label>
            <select id="new-staff-role" className={field} value={role} onChange={(event) => changeRole(event.target.value as StaffRole)}>
              {(Object.keys(ROLE_LABEL) as StaffRole[]).map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <Label htmlFor="new-staff-employment">雇用形態</Label>
            <select
              id="new-staff-employment"
              className={field}
              value={employmentType}
              onChange={(event) => changeEmployment(event.target.value as EmploymentType)}
            >
              {(Object.keys(EMPLOYMENT_LABEL) as EmploymentType[]).map((item) => (
                <option key={item} value={item}>
                  {EMPLOYMENT_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          {employmentType === "part_time" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <Label htmlFor="new-staff-contract">1日の契約時間（有休換算用）</Label>
                <Input
                  id="new-staff-contract"
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={contractHours}
                  onChange={(event) => setContractHours(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">終日有休は曜日の所定を優先し、所定がない日はこの時間です。初期値は4.0時間です。</span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <Label htmlFor="new-staff-wage">時給（任意）</Label>
                <Input
                  id="new-staff-wage"
                  type="number"
                  min={0}
                  step={10}
                  value={hourlyWage}
                  placeholder="1200"
                  onChange={(event) => setHourlyWage(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">マイ・シフトパレット（最大{SHIFT_PATTERN_LIMIT}枠）</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={shiftPatterns.length >= SHIFT_PATTERN_LIMIT}
                onClick={() => setShiftPatterns((current) => [...current, blankPattern(current)])}
              >
                シフトを追加
              </Button>
            </div>
            {shiftPatterns.length === 0 ? <p className="text-xs text-muted-foreground">登録されたシフトはまだありません。</p> : null}
            {shiftPatterns.map((item) => (
              <div key={item.id} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_4rem_auto_auto] items-center gap-1">
                <input
                  aria-label={`${item.id} 名前`}
                  className={field}
                  value={item.label}
                  placeholder="時短"
                  onChange={(event) => updatePattern(item.id, { label: event.target.value })}
                />
                <input
                  aria-label={`${item.id} 始業`}
                  className={field}
                  type="time"
                  value={item.startTime}
                  onChange={(event) => updatePattern(item.id, { startTime: event.target.value })}
                />
                <input
                  aria-label={`${item.id} 終業`}
                  className={field}
                  type="time"
                  value={item.endTime}
                  onChange={(event) => updatePattern(item.id, { endTime: event.target.value })}
                />
                <input
                  aria-label={`${item.id} 休憩`}
                  className={field}
                  type="number"
                  min={0}
                  step={5}
                  value={item.breakMinutes}
                  onChange={(event) => updatePattern(item.id, { breakMinutes: Number(event.target.value) || 0 })}
                />
                <label className="flex items-center gap-1 text-xs">
                  <input
                    aria-label={`${item.id} 日またぎ`}
                    type="checkbox"
                    checked={Boolean(item.isOvernight)}
                    onChange={(event) => updatePattern(item.id, { isOvernight: event.target.checked })}
                  />
                  翌
                </label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => unlinkPattern(item.id)}
                >
                  削除
                </button>
                <span className="col-span-full text-[11px] text-muted-foreground" aria-label={`${item.id} 所定`}>
                  所定 {formatHours(patternScheduledMinutes(item))}h
                  {item.isOvernight ? "（翌日またぎ）" : ""}
                </span>
              </div>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <Label htmlFor="new-staff-half">半休ルール</Label>
            <select
              id="new-staff-half"
              className={field}
              value={halfDayRule}
              onChange={(event) => setHalfDayRule(event.target.value as HalfDayRuleType)}
            >
              {(Object.keys(HALF_RULE_LABEL) as HalfDayRuleType[]).map((item) => (
                <option key={item} value={item}>
                  {HALF_RULE_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          {role === "custom" ? (
            <label className="flex flex-col gap-1 text-sm">
              <Label htmlFor="new-staff-sheet">出力シート</Label>
              <select
                id="new-staff-sheet"
                className={field}
                value={sheetType}
                onChange={(event) => setSheetType(event.target.value as JobType)}
              >
                <option value="pt">{JOB_LABEL.pt}</option>
                <option value="rehab_part">{JOB_LABEL.rehab_part}</option>
              </select>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">出力シート: {JOB_LABEL[sheetType]}</p>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">曜日ごとの所定</p>
              {shiftPatterns.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {shiftPatterns.map((pattern) => (
                    <button
                      key={`weekdays-${pattern.id}`}
                      type="button"
                      aria-label={`「${pattern.label.trim() || "無題"}」を月〜金に一括適用`}
                      onClick={() => applyPatternToWeekdays(pattern)}
                      className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs text-sky-800 hover:bg-sky-100"
                    >
                      「{pattern.label.trim() || "無題"}」を月〜金に一括適用
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">先にマイ・シフトを登録すると、ここから曜日へ反映できます。</p>
              )}
            </div>
            {WEEKDAY_NAMES.map((label, index) => {
              const day = weeklySchedule[index] ?? {
                startTime: "",
                endTime: "",
                breakMinutes: 0,
                scheduledMinutes: 0,
                shiftCode: "" as ShiftCode,
                isHoliday: true,
              };
              return (
                <div key={label} className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-2">
                  <div className="grid grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)_3.5rem_minmax(9.5rem,1.4fr)_2.75rem] items-center gap-1 text-xs">
                    <span>{label}</span>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={day.isHoliday}
                        onChange={(event) => toggleHoliday(index, event.target.checked)}
                      />
                      公休
                    </label>
                    <input
                      aria-label={`${label} 始業`}
                      className={field}
                      type="time"
                      disabled={day.isHoliday}
                      value={day.startTime}
                      onChange={(event) => putDay(index, { startTime: event.target.value, isHoliday: false })}
                    />
                    <input
                      aria-label={`${label} 終業`}
                      className={field}
                      type="time"
                      disabled={day.isHoliday}
                      value={day.endTime}
                      onChange={(event) => putDay(index, { endTime: event.target.value, isHoliday: false })}
                    />
                    <input
                      aria-label={`${label} 休憩`}
                      className={field}
                      type="number"
                      min={0}
                      step={5}
                      disabled={day.isHoliday}
                      value={day.breakMinutes}
                      onChange={(event) => putDay(index, { breakMinutes: Number(event.target.value) || 0, isHoliday: false })}
                    />
                    <select
                      aria-label={`${label} シフト`}
                      className={field}
                      value={symbolValue(day)}
                      onChange={(event) => handleSchedulePatternSelect(index, event.target.value)}
                    >
                      <option value="">--（公休 / 指定なし）</option>
                      {shiftPatterns.map((pattern) => (
                        <option key={pattern.id} value={`pattern:${pattern.id}`}>
                          {patternButtonLabel(pattern)}
                        </option>
                      ))}
                      {shiftChoices.length > 0 ? (
                        <optgroup label="原本の時間帯">
                          {shiftChoices.map((shift) => (
                            <option key={shift.code} value={shift.code}>
                              {shift.label}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {day.shiftCode &&
                      !matchPattern(day, shiftPatterns) &&
                      !(day.patternId && shiftPatterns.some((pattern) => pattern.id === day.patternId)) &&
                      !shiftChoices.some((shift) => shift.code === day.shiftCode) ? (
                        <option value={day.shiftCode}>{shiftLabel(day.shiftCode)}</option>
                      ) : null}
                    </select>
                    <span className="tabular-nums text-muted-foreground" aria-label={`${label} 所定`}>
                      {day.isHoliday ? "0h" : `${formatHours(day.scheduledMinutes)}h`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-6">
                    {shiftPatterns.map((pattern) => (
                      <button
                        key={`${label}-${pattern.id}`}
                        type="button"
                        aria-label={`${label}に${pattern.label.trim() || "無題"}を適用`}
                        onClick={() => applyPatternToDay(index, pattern)}
                        className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs text-sky-800 hover:bg-sky-100"
                      >
                        {pattern.label.trim() || "無題"} を適用
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-label={`${label}を公休にする`}
                      onClick={() => setDayAsHoliday(index)}
                      className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      公休にする
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <Label htmlFor="new-staff-leave">有休残日数</Label>
            <Input
              id="new-staff-leave"
              type="number"
              min={0}
              step={0.5}
              value={paidLeave}
              onChange={(event) => setPaidLeave(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit">保存</Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function cloneWeek(week: Record<number, DayShiftSetting>): Record<number, DayShiftSetting> {
  const copy: Record<number, DayShiftSetting> = {};
  for (let index = 0; index < 7; index += 1) {
    copy[index] = { ...(week[index] ?? { startTime: "", endTime: "", breakMinutes: 0, scheduledMinutes: 0, shiftCode: "", isHoliday: true }) };
  }
  return copy;
}

function rememberWorkDays(week: Record<number, DayShiftSetting>): Partial<Record<number, DayShiftSetting>> {
  const remembered: Partial<Record<number, DayShiftSetting>> = {};
  for (let index = 0; index < 7; index += 1) {
    const day = week[index];
    if (day && !day.isHoliday && (day.shiftCode || day.startTime)) remembered[index] = { ...day };
  }
  return remembered;
}

function matchPattern(day: DayShiftSetting, patterns: CustomShiftPattern[]): CustomShiftPattern | null {
  if (day.isHoliday) return null;
  if (day.patternId) {
    const linked = patterns.find((item) => item.id === day.patternId);
    if (linked) return linked;
  }
  const byTime = patterns.find(
    (item) =>
      item.startTime === day.startTime &&
      item.endTime === day.endTime &&
      Number(item.breakMinutes) === Number(day.breakMinutes),
  );
  if (byTime) return byTime;
  const code = day.shiftCode.trim();
  if (!code) return null;
  return (
    patterns.find((item) => item.shiftCode.trim() === code || item.label.trim() === code || (item.shiftCode.trim() || item.label.trim()) === code) ??
    null
  );
}

/** 曜日の所定をマイ・シフトへ紐づけ、一致する枠があれば時間も揃える。 */
function linkWeekToPatterns(
  week: Record<number, DayShiftSetting>,
  patterns: CustomShiftPattern[],
): Record<number, DayShiftSetting> {
  const next = cloneWeek(week);
  for (let index = 0; index < 7; index += 1) {
    const day = next[index];
    if (!day || day.isHoliday) {
      next[index] = holidayDay();
      continue;
    }
    const matched = matchPattern(day, patterns);
    if (matched) {
      next[index] = dayFromPattern(matched);
      continue;
    }
    if (day.scheduledMinutes > 0) {
      const byMinutes = patterns.find((item) => patternScheduledMinutes(item) === day.scheduledMinutes);
      if (byMinutes) {
        next[index] = dayFromPattern(byMinutes);
        continue;
      }
    }
    next[index] = { ...day, patternId: "" };
  }
  return next;
}

/** 雇用形態変更時など、紐づかない出勤日はマイ・シフトへ寄せる。 */
function assignPatternsToWeek(
  week: Record<number, DayShiftSetting>,
  patterns: CustomShiftPattern[],
): Record<number, DayShiftSetting> {
  const linked = linkWeekToPatterns(week, patterns);
  if (patterns.length === 0) return linked;
  for (let index = 0; index < 7; index += 1) {
    const day = linked[index];
    if (!day || day.isHoliday || day.patternId) continue;
    const half = patterns.find((item) => patternScheduledMinutes(item) <= 240) ?? patterns[0];
    const full = patterns.find((item) => patternScheduledMinutes(item) > 240) ?? patterns[0];
    linked[index] = dayFromPattern(day.scheduledMinutes > 0 && day.scheduledMinutes <= 240 ? half : full);
  }
  return linked;
}
