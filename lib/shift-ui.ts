import { cn } from "@/lib/utils";

export type ShiftTone = "day" | "night" | "ake" | "half" | "yukyu" | "koukyu" | "kyushutsu" | "furide" | "neutral";

export function shiftToneFromLabel(label: string): ShiftTone {
  const text = label.trim();
  if (!text) return "neutral";
  if (text.includes("休出") || text.includes("休日出勤")) return "kyushutsu";
  if (text.includes("振出") || text.includes("振替出勤")) return "furide";
  if (text.includes("明け")) return "ake";
  if (text.includes("公休")) return "koukyu";
  if (text.includes("有休")) return "yukyu";
  if (text.includes("夜勤") || text.includes("夜")) return "night";
  if (text.includes("半休") || text.includes("半日") || text.includes("午前") || text.includes("午後") || text.includes("パート")) {
    return "half";
  }
  return "day";
}

export function shiftBadgeClass(tone: ShiftTone, active = false): string {
  const base = "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium";
  const tones: Record<ShiftTone, string> = {
    day: "border-blue-200 bg-blue-100 text-blue-800",
    night: "border-indigo-200 bg-indigo-100 text-indigo-800",
    ake: "border-amber-200 bg-amber-100 text-amber-800",
    half: "border-emerald-200 bg-emerald-100 text-emerald-800",
    yukyu: "border-teal-200 bg-teal-100 text-teal-800 font-bold",
    koukyu: "border-gray-200 bg-gray-100 text-gray-600",
    kyushutsu: "border-rose-200 bg-rose-100 text-rose-800 font-semibold",
    furide: "border-amber-200 bg-amber-100 text-amber-800 font-semibold",
    neutral: "border-border bg-background text-foreground",
  };
  return cn(base, tones[tone], active && "ring-2 ring-offset-1 ring-sky-500");
}

export function shiftButtonClass(tone: ShiftTone, active = false): string {
  return cn(
    "rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50",
    shiftBadgeClass(tone, active).replace("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium", ""),
    active ? "font-semibold ring-2 ring-sky-500 ring-offset-1" : "hover:brightness-95",
  );
}

export function ledgerRowClass(input: {
  dayOfWeek: string;
  isHoliday: boolean;
  isKoukyu: boolean;
  isToday: boolean;
}): string {
  const { dayOfWeek, isHoliday, isKoukyu, isToday } = input;
  return cn(
    "border-b border-border/60 align-middle transition-colors",
    isKoukyu
      ? "bg-gray-50/80 text-gray-600"
      : dayOfWeek === "日" || isHoliday
        ? "bg-rose-50/40"
        : dayOfWeek === "土"
          ? "bg-blue-50/40"
          : "bg-white",
    isToday && "relative bg-amber-50/70 ring-2 ring-inset ring-amber-400",
  );
}

export function weekdayTextClass(dayOfWeek: string, isHoliday: boolean): string {
  if (dayOfWeek === "日" || isHoliday) return "font-semibold text-rose-700";
  if (dayOfWeek === "土") return "font-semibold text-blue-700";
  return "font-medium text-foreground";
}
