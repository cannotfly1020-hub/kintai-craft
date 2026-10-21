"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StaffMember } from "@/lib/staff";
import { HALF_RULE_LABEL, ROLE_LABEL, WEEKDAY_NAMES, dayFromShiftCode, presetForRole, recomputeScheduled } from "@/lib/schedule";
import { blankPattern, defaultShiftPatterns, EMPLOYMENT_LABEL, patternScheduledMinutes, SHIFT_PATTERN_LIMIT, withOvernight } from "@/lib/shift-patterns";
import { JOB_LABEL, SHIFTS, shiftsForJob } from "@/lib/shifts";
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
  };
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<StaffRole>(seed.role);
  const [halfDayRule, setHalfDayRule] = useState<HalfDayRuleType>(seed.halfDayRule);
  const [sheetType, setSheetType] = useState(seed.sheetType);
  const [paidLeave, setPaidLeave] = useState(String(seed.initialPaidLeave));
  const [employmentType, setEmploymentType] = useState<EmploymentType>(seed.employmentType);
  const [shiftPatterns, setShiftPatterns] = useState<CustomShiftPattern[]>(() => seed.shiftPatterns.map((item) => ({ ...item })));
  const [weeklySchedule, setWeeklySchedule] = useState(() => cloneWeek(seed.weeklySchedule));
  const [error, setError] = useState("");
  const rememberedWork = useRef(rememberWorkDays(seed.weeklySchedule));

  function changeRole(next: StaffRole) {
    setRole(next);
    if (next === "custom") return;
    const preset = presetForRole(next);
    const week = cloneWeek(preset.weeklySchedule);
    rememberedWork.current = rememberWorkDays(week);
    setHalfDayRule(preset.halfDayRule);
    setSheetType(preset.sheetType);
    setWeeklySchedule(week);
    setShiftPatterns(defaultShiftPatterns(next, employmentType));
  }

  function changeEmployment(next: EmploymentType) {
    setEmploymentType(next);
    if (role === "custom") return;
    setShiftPatterns(defaultShiftPatterns(role, next));
  }

  function updatePattern(id: string, patch: Partial<CustomShiftPattern>) {
    setShiftPatterns((current) => current.map((item) => (item.id === id ? withOvernight({ ...item, ...patch }) : item)));
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
      };
      const nextDay = { ...recomputeScheduled({ ...prev, ...patch }) };
      if (!nextDay.isHoliday && nextDay.shiftCode) {
        rememberedWork.current = { ...rememberedWork.current, [index]: { ...nextDay } };
      }
      return { ...current, [index]: nextDay };
    });
  }

  function changeSymbol(index: number, code: ShiftCode) {
    putDay(index, dayFromShiftCode(code));
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
    onSave({
      name: trimmed,
      role,
      halfDayRule,
      sheetType,
      initialPaidLeave: Number.isFinite(leave) && leave >= 0 ? leave : 0,
      weeklySchedule,
      employmentType,
      shiftPatterns: shiftPatterns.map((item) => withOvernight({ ...item, label: item.label.trim() })),
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
              <div key={item.id} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_4rem_minmax(0,0.8fr)_auto_auto] items-center gap-1">
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
                <input
                  aria-label={`${item.id} 記号`}
                  className={field}
                  list="shift-code-suggestions"
                  value={item.shiftCode}
                  placeholder="日勤"
                  onChange={(event) => updatePattern(item.id, { shiftCode: event.target.value })}
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
                  onClick={() => setShiftPatterns((current) => current.filter((pattern) => pattern.id !== item.id))}
                >
                  削除
                </button>
                <span className="col-span-full text-[11px] text-muted-foreground" aria-label={`${item.id} 所定`}>
                  所定 {formatHours(patternScheduledMinutes(item))}h
                  {item.isOvernight ? "（翌日またぎ）" : ""}
                </span>
              </div>
            ))}
            <datalist id="shift-code-suggestions">
              <option value="B-2" />
              <option value="A-1" />
              <option value="D" />
              <option value="7.5H" />
              <option value="日勤" />
              <option value="夜勤" />
              <option value="時短" />
              <option value="半日" />
            </datalist>
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
            <p className="text-sm font-medium">曜日ごとの所定</p>
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
                <div key={label} className="grid grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)_3.5rem_4.5rem_2.75rem] items-center gap-1 text-xs">
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
                    aria-label={`${label} 記号`}
                    className={field}
                    value={day.shiftCode}
                    onChange={(event) => changeSymbol(index, event.target.value as ShiftCode)}
                  >
                    <option value="">—</option>
                    {shiftChoices.map((shift) => (
                      <option key={shift.code} value={shift.code}>
                        {shift.code}
                      </option>
                    ))}
                  </select>
                  <span className="tabular-nums text-muted-foreground" aria-label={`${label} 所定`}>
                    {day.isHoliday ? "0h" : `${formatHours(day.scheduledMinutes)}h`}
                  </span>
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
    if (day && !day.isHoliday && day.shiftCode) remembered[index] = { ...day };
  }
  return remembered;
}
