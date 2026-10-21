"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { LedgerTable } from "@/components/ledger-table";
import { ScheduleBar } from "@/components/schedule-bar";
import { StaffBar } from "@/components/staff-bar";
import { useStaff } from "@/components/staff-provider";
import { SummaryPanel } from "@/components/summary-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatISODate } from "@/lib/date";
import { HALF_RULE_LABEL, ROLE_LABEL, applyStaffDay, applyWeeklySchedule } from "@/lib/schedule";
import { formatClosingTitle, formatPeriodLabel, defaultClosing, getPeriod, shiftClosing } from "@/lib/period";
import {
  applyAke,
  applyHolidayDefaults,
  applyHolidayWork,
  applyShiftPattern,
  applySubstituteHoliday,
  applySubstituteWork,
  chooseFullLeave,
  createAttendance,
  resolveStandardWork,
} from "@/lib/records";
import { JOB_LABEL } from "@/lib/shifts";
import { loadStaffMonth, saveStaffRecords, type StaffMember } from "@/lib/staff";
import { attendanceFileName } from "@/lib/storage";
import type { CustomShiftPattern, DailyRecord, MonthlyAttendance } from "@/types/kintai";

const MONTH_ITEMS = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [String(index + 1), `${index + 1}月`]));

function YearField({ year, onCommit }: { year: number; onCommit: (year: number) => void }) {
  return (
    <Input
      key={year}
      aria-label="年"
      className="w-24 tabular-nums"
      inputMode="numeric"
      defaultValue={year}
      onBlur={(event) => {
        const next = Number(event.target.value);
        if (!Number.isInteger(next) || next < 2019 || next > 2100) {
          event.target.value = String(year);
          return;
        }
        if (next !== year) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

const offeredMonths = new Set<string>();

export function AttendanceApp() {
  const { ready, staffList, currentStaff, selectStaff, addStaff, updateStaff, removeStaff } = useStaff();
  const { currentUser, visibleStaff } = useAuth();
  const [attendance, setAttendance] = useState<MonthlyAttendance | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const viewedMonth = useRef<{ year: number; month: number } | null>(null);
  const attendanceStaffId = useRef<string | null>(null);

  function commitAttendance(staffId: string, next: MonthlyAttendance) {
    attendanceStaffId.current = staffId;
    setAttendance(next);
  }

  function showMonth(staff: StaffMember, year: number, month: number, carry?: { lunchUnitPrice?: number; lunchCount?: number }) {
    viewedMonth.current = { year, month };
    const loaded = loadStaffMonth(staff, year, month, carry);
    if (!loaded.isNew) {
      commitAttendance(staff.id, { ...loaded.attendance, jobType: staff.sheetType });
      return;
    }
    const token = `${staff.id}:${year}-${month}`;
    const range = formatPeriodLabel(year, month);
    const name = staff.name.trim() || "この職員";
    const accepted =
      !offeredMonths.has(token) &&
      window.confirm(`${name}さんの${range}はまだ空です。週間設定で1ヶ月分を作成しますか？`);
    offeredMonths.add(token);
    if (!accepted) {
      commitAttendance(staff.id, loaded.attendance);
      setNotice({ tone: "ok", text: "空の出勤簿です。「1ヶ月分を一括反映」から作成できます。" });
      return;
    }
    commitAttendance(staff.id, applyWeeklySchedule(loaded.attendance, staff));
    setNotice({ tone: "ok", text: `${range} を週間設定で作成し、保存しました。` });
  }

  useEffect(() => {
    if (!ready || !currentUser || visibleStaff.length === 0) return;
    if (currentStaff && visibleStaff.some((staff) => staff.id === currentStaff.id)) return;
    selectStaff(visibleStaff[0].id);
    // Keep the open ledger inside the logged-in user's visible set when the demo user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity ids + visibleStaff drive the clamp
  }, [ready, currentUser?.id, currentStaff?.id, visibleStaff, selectStaff]);

  useEffect(() => {
    if (!currentStaff) return;
    const target = viewedMonth.current ?? defaultClosing();
    showMonth(currentStaff, target.year, target.month);
    // Reload only when the selected staff changes. Later edits to that staff stay on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showMonth reads the staff from this render
  }, [currentStaff?.id]);

  useEffect(() => {
    if (!attendance || !currentStaff) return;
    if (attendanceStaffId.current !== currentStaff.id) return;
    saveStaffRecords(currentStaff.id, attendance);
  }, [attendance, currentStaff]);

  if (!ready || !attendance || !currentStaff) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">出勤簿を読み込んでいます…</p>;
  }

  const period = getPeriod(attendance.year, attendance.month);
  const book = attendance;
  const activeStaff = currentStaff;
  const today = formatISODate(new Date());
  const todayRecord = book.records.find((record) => record.date === today);

  function openMonth(year: number, month: number) {
    showMonth(activeStaff, year, month, {
      lunchUnitPrice: book.lunchUnitPrice,
      lunchCount: book.lunchCount,
    });
  }

  function update(patch: Partial<MonthlyAttendance>) {
    setAttendance((current) => (current ? { ...current, ...patch } : current));
  }

  function updateRecord(date: string, next: DailyRecord) {
    setAttendance((current) =>
      current
        ? { ...current, records: current.records.map((record) => (record.date === date ? next : record)) }
        : current,
    );
  }

  function scrollToDay(date: string) {
    requestAnimationFrame(() => {
      document.getElementById(`day-${date}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function applyMonth() {
    const range = formatPeriodLabel(book.year, book.month);
    const accepted = window.confirm(`この職員の曜日ごとの所定で、${range} を上書きしますか？`);
    if (!accepted) return;
    commitAttendance(activeStaff.id, applyWeeklySchedule(book, activeStaff));
    setNotice({ tone: "ok", text: `${range} を週間設定で反映し、保存しました。` });
    scrollToDay(today);
  }

  function applyPattern(date: string, pattern: CustomShiftPattern) {
    const record = book.records.find((item) => item.date === date);
    if (!record) {
      setNotice({ tone: "ok", text: "この締め月にその日がないため、シフトは入れていません。" });
      return;
    }
    updateRecord(date, applyShiftPattern(record, pattern));
    setNotice(null);
    scrollToDay(date);
  }

  function applyLeave(date: string, kind: "koukyu" | "yukyu") {
    const record = book.records.find((item) => item.date === date);
    if (!record) {
      setNotice({ tone: "ok", text: "この締め月にその日がないため、休暇は入れていません。" });
      return;
    }
    updateRecord(date, chooseFullLeave(record, kind, true));
    setNotice(null);
    scrollToDay(date);
  }

  function standardWork() {
    return resolveStandardWork({
      patterns: activeStaff.shiftPatterns,
      weeklySchedule: activeStaff.weeklySchedule,
      sheetType: activeStaff.sheetType,
    });
  }

  function applyHolidayWorkDay(date: string) {
    const record = book.records.find((item) => item.date === date);
    if (!record) {
      setNotice({ tone: "ok", text: "この締め月にその日がないため、休日出勤は入れていません。" });
      return;
    }
    updateRecord(date, applyHolidayWork(record, standardWork().duty));
    setNotice({ tone: "ok", text: "休日出勤を入れました（実働全量が時間外・休日になります）。" });
    scrollToDay(date);
  }

  function applySubstituteWorkDay(date: string) {
    const record = book.records.find((item) => item.date === date);
    if (!record) {
      setNotice({ tone: "ok", text: "この締め月にその日がないため、振替出勤は入れていません。" });
      return;
    }
    updateRecord(date, applySubstituteWork(record, standardWork()));
    setNotice({ tone: "ok", text: "振替出勤を入れました（所定超過のみ残業になります）。" });
    scrollToDay(date);
  }

  function applySubstituteHolidayDay(date: string) {
    const record = book.records.find((item) => item.date === date);
    if (!record) {
      setNotice({ tone: "ok", text: "この締め月にその日がないため、振替休日は入れていません。" });
      return;
    }
    updateRecord(date, applySubstituteHoliday(record));
    setNotice({ tone: "ok", text: "振替休日を入れました（公休として扱います）。" });
    scrollToDay(date);
  }

  async function download() {
    const current = attendance;
    if (!current) return;
    if (!current.staffName.trim()) {
      const text = "氏名を入力してください";
      setNotice({ tone: "error", text });
      toast.error(text);
      nameRef.current?.focus();
      return;
    }
    setNotice(null);
    setExporting(true);
    try {
      const { renderAttendanceBlob } = await import("@/lib/excel/export-client");
      const blob = await renderAttendanceBlob(current, {
        halfDayRule: activeStaff.halfDayRule,
        contractHoursPerDay: activeStaff.contractHoursPerDay,
        weeklySchedule: activeStaff.weeklySchedule,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attendanceFileName(current);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const text = "出勤簿を書き出しました";
      setNotice({ tone: "ok", text });
      toast.success(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Excelの作成に失敗しました";
      setNotice({ tone: "error", text });
      toast.error(text);
    } finally {
      setExporting(false);
    }
  }

  const previous = shiftClosing(attendance.year, attendance.month, -1);
  const next = shiftClosing(attendance.year, attendance.month, 1);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3">
          <StaffBar
            staffList={staffList}
            currentStaff={currentStaff}
            onSelect={(staffId) => {
              if (staffId === activeStaff.id) return;
              saveStaffRecords(activeStaff.id, attendance);
              selectStaff(staffId);
            }}
            onCreate={(input) => {
              saveStaffRecords(activeStaff.id, attendance);
              addStaff(input);
            }}
            onUpdate={(staffId, input) => {
              updateStaff(staffId, input);
              if (staffId === activeStaff.id) {
                setAttendance((current) =>
                  current
                    ? { ...current, jobType: input.sheetType, staffName: input.name, initialPaidLeave: input.initialPaidLeave }
                    : current,
                );
              }
            }}
            onDelete={removeStaff}
          />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                勤
              </span>
              <div>
                <p className="text-sm font-semibold">勤怠クラフト</p>
                <p className="text-xs text-muted-foreground">20日締め · 前月21日から当月20日</p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                update({ records: applyHolidayDefaults(attendance.records) });
                toast.success("空欄の日曜・祝日を公休にしました");
              }}
            >
              日曜・祝日を公休に
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!window.confirm("この月の明細を消しますか？氏名と有休残は残します。")) return;
                commitAttendance(
                  activeStaff.id,
                  createAttendance({
                    year: attendance.year,
                    month: attendance.month,
                    jobType: attendance.jobType,
                    staffName: attendance.staffName,
                    initialPaidLeave: attendance.initialPaidLeave,
                    lunchUnitPrice: attendance.lunchUnitPrice,
                  }),
                );
              }}
            >
              明細をクリア
            </Button>
            <Button onClick={download} disabled={exporting}>
              <Download data-icon="inline-start" />
              {exporting ? "書き出し中…" : "Excelをダウンロード"}
            </Button>
            </div>
          </div>
          {notice ? (
            <p className={notice.tone === "error" ? "w-full text-sm text-destructive" : "w-full text-sm text-primary"} role="status">
              {notice.text}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-6">
        <ScheduleBar
          role={activeStaff.jobRole}
          employmentType={activeStaff.employmentType}
          halfDayRule={activeStaff.halfDayRule}
          patterns={activeStaff.shiftPatterns}
          activePatternId={todayRecord?.patternId ?? ""}
          canApplyToday={Boolean(todayRecord)}
          showAke={activeStaff.jobRole === "nurse"}
          onApplyMonth={applyMonth}
          onApplyPattern={(pattern) => applyPattern(today, pattern)}
          onAke={() => {
            const record = book.records.find((item) => item.date === today);
            if (!record) {
              setNotice({ tone: "ok", text: "この締め月に本日がないため、明けは入れていません。" });
              return;
            }
            updateRecord(today, applyAke(record));
            setNotice(null);
            scrollToDay(today);
          }}
          onLeave={(kind) => applyLeave(today, kind)}
          onHolidayWork={() => applyHolidayWorkDay(today)}
          onSubstituteWork={() => applySubstituteWorkDay(today)}
          onSubstituteHoliday={() => applySubstituteHolidayDay(today)}
        />
        <SummaryPanel
          attendance={attendance}
          employmentType={activeStaff.employmentType}
          halfDayRule={activeStaff.halfDayRule}
          contractHoursPerDay={activeStaff.contractHoursPerDay}
          weeklySchedule={activeStaff.weeklySchedule}
        />
        <Card>
          <CardHeader>
            <CardTitle>帳票ヘッダー</CardTitle>
            <CardDescription>
              {formatClosingTitle(attendance.year, attendance.month)}（{formatPeriodLabel(attendance.year, attendance.month)}、{period.dates.length}日）を、{JOB_LABEL[attendance.jobType]}シートへ差し込みます。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Label>締め月</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="前の締め月"
                  onClick={() => openMonth(previous.year, previous.month)}
                >
                  <ChevronLeft />
                </Button>
                <YearField
                  year={attendance.year}
                  onCommit={(year) => openMonth(year, attendance.month)}
                />
                <Select
                  items={MONTH_ITEMS}
                  value={String(attendance.month)}
                  onValueChange={(value) => {
                    if (!value) return;
                    openMonth(attendance.year, Number(value));
                  }}
                >
                  <SelectTrigger className="w-24" aria-label="月">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MONTH_ITEMS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="次の締め月"
                  onClick={() => openMonth(next.year, next.month)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>区分・半休</Label>
              <p className="flex h-8 items-center text-sm">
                {ROLE_LABEL[activeStaff.jobRole]} · {HALF_RULE_LABEL[activeStaff.halfDayRule]}
              </p>
              <p className="text-xs text-muted-foreground">
                出力シート: {JOB_LABEL[attendance.jobType]}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="staff-name">氏名</Label>
              <Input
                id="staff-name"
                ref={nameRef}
                autoComplete="name"
                placeholder="山田 花子"
                value={attendance.staffName}
                onChange={(event) => {
                  update({ staffName: event.target.value });
                  updateStaff(activeStaff.id, { name: event.target.value });
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="paid-leave">期首有休（日）</Label>
              <Input
                id="paid-leave"
                type="number"
                min={0}
                step={0.5}
                value={attendance.initialPaidLeave}
                onChange={(event) => {
                  const initialPaidLeave = Number(event.target.value) || 0;
                  update({ initialPaidLeave });
                  updateStaff(activeStaff.id, { initialPaidLeave });
                }}
                onWheel={(event) => event.currentTarget.blur()}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="lunch-count">給食回数</Label>
              <Input
                id="lunch-count"
                type="number"
                min={0}
                step={1}
                value={attendance.lunchCount}
                onChange={(event) => update({ lunchCount: Number(event.target.value) || 0 })}
                onWheel={(event) => event.currentTarget.blur()}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="lunch-price">給食単価（円）</Label>
              <Input
                id="lunch-price"
                type="number"
                min={0}
                step={10}
                value={attendance.lunchUnitPrice}
                onChange={(event) => update({ lunchUnitPrice: Number(event.target.value) || 0 })}
                onWheel={(event) => event.currentTarget.blur()}
              />
            </div>
          </CardContent>
        </Card>

        <LedgerTable
          jobType={attendance.jobType}
          records={attendance.records}
          halfDayRule={activeStaff.halfDayRule}
          weeklySchedule={activeStaff.weeklySchedule}
          patterns={activeStaff.shiftPatterns}
          showAllShifts={activeStaff.jobRole === "custom"}
          showAke={activeStaff.jobRole === "nurse"}
          onRecord={updateRecord}
          onHalfMode={(date, mode) => setAttendance((current) => (current ? applyStaffDay(current, activeStaff, mode, date) : current))}
        />
      </main>
    </div>
  );
}
