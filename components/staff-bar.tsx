"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { StaffMember } from "@/lib/staff";
import { HALF_RULE_LABEL, ROLE_LABEL, WEEKDAY_NAMES, presetForRole, recomputeScheduled } from "@/lib/schedule";
import { shiftsForJob } from "@/lib/shifts";
import type { DayShiftSetting, HalfDayRuleType, ShiftCode, StaffRole } from "@/types/kintai";
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
  const seed = initial ?? { ...presetForRole("pt_outpatient"), name: "", initialPaidLeave: 10 };
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<StaffRole>(seed.role);
  const [halfDayRule, setHalfDayRule] = useState<HalfDayRuleType>(seed.halfDayRule);
  const [sheetType, setSheetType] = useState(seed.sheetType);
  const [paidLeave, setPaidLeave] = useState(String(seed.initialPaidLeave));
  const [weeklySchedule, setWeeklySchedule] = useState(seed.weeklySchedule);
  const [error, setError] = useState("");

  function changeRole(next: StaffRole) {
    const preset = presetForRole(next);
    setRole(next);
    setHalfDayRule(preset.halfDayRule);
    setSheetType(preset.sheetType);
    setWeeklySchedule(preset.weeklySchedule);
  }

  function updateDay(index: number, patch: Partial<DayShiftSetting>) {
    setWeeklySchedule((current) => {
      const next = { ...current, [index]: recomputeScheduled({ ...current[index], ...patch }) };
      return next;
    });
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("氏名を入力してください");
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
    });
  }

  const shiftChoices = shiftsForJob(sheetType);

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
          <p className="text-xs text-muted-foreground">
            出力シート: {sheetType === "pt" ? "理学療法士" : "リハビリフルタイムパート"}
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">曜日ごとの所定</p>
            {WEEKDAY_NAMES.map((label, index) => {
              const day = weeklySchedule[index];
              return (
                <div key={label} className="grid grid-cols-[1.5rem_4.5rem_1fr_1fr_3.5rem_4.5rem] items-center gap-1 text-xs">
                  <span>{label}</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={day.isHoliday}
                      onChange={(event) => updateDay(index, { isHoliday: event.target.checked })}
                    />
                    公休
                  </label>
                  <input
                    aria-label={`${label} 始業`}
                    className={field}
                    type="time"
                    disabled={day.isHoliday}
                    value={day.startTime}
                    onChange={(event) => updateDay(index, { startTime: event.target.value })}
                  />
                  <input
                    aria-label={`${label} 終業`}
                    className={field}
                    type="time"
                    disabled={day.isHoliday}
                    value={day.endTime}
                    onChange={(event) => updateDay(index, { endTime: event.target.value })}
                  />
                  <input
                    aria-label={`${label} 休憩`}
                    className={field}
                    type="number"
                    min={0}
                    step={5}
                    disabled={day.isHoliday}
                    value={day.breakMinutes}
                    onChange={(event) => updateDay(index, { breakMinutes: Number(event.target.value) || 0 })}
                  />
                  <select
                    aria-label={`${label} 記号`}
                    className={field}
                    disabled={day.isHoliday}
                    value={day.shiftCode}
                    onChange={(event) => updateDay(index, { shiftCode: event.target.value as ShiftCode })}
                  >
                    <option value="">—</option>
                    {shiftChoices.map((shift) => (
                      <option key={shift.code} value={shift.code}>
                        {shift.code}
                      </option>
                    ))}
                  </select>
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
