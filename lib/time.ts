export function parseHHMM(value: string): number | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!matched) return null;
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (hours > 47 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatHHMM(totalMinutes: number): string {
  const minutesInDay = 24 * 60;
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatMinutesJa(totalMinutes: number): string {
  if (totalMinutes <= 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}分`;
  if (minutes === 0) return `${hours}時間`;
  return `${hours}時間${minutes}分`;
}

export function formatShortage(totalMinutes: number): string {
  if (totalMinutes <= 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function parseDurationMinutes(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const clock = /^(\d+):(\d{1,2})$/.exec(trimmed);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const ja = /^(?:(\d+)時間)?(?:(\d+)分)?$/.exec(trimmed);
  if (ja && (ja[1] || ja[2])) {
    return Number(ja[1] || 0) * 60 + Number(ja[2] || 0);
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatHours(totalMinutes: number): string {
  const hours = totalMinutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function formatDayCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
