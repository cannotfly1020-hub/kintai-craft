import { STAFF_LIST_KEY, CURRENT_STAFF_KEY, CURRENT_USER_KEY } from "@/lib/staff";

const LAST_BACKUP_DAY_KEY = "kintai_craft_last_desktop_backup_day";

declare global {
  interface Window {
    desktopApp?: {
      isDesktop: boolean;
      platform?: string;
      version?: string;
      saveDailyBackup: (data: unknown) => Promise<{
        success: boolean;
        filePath?: string;
        fileName?: string;
        message?: string;
      }>;
      openBackupFolder: () => Promise<{ success: boolean; message?: string } | boolean>;
    };
  }
}

function formatLocalDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.desktopApp?.isDesktop);
}

/** localStorage 上の勤怠関連キーをまとめたバックアップペイロード */
export function buildKintaiBackupPayload() {
  const storage: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (
      key.startsWith("kintai_craft") ||
      key.startsWith("kintai-craft") ||
      key === STAFF_LIST_KEY ||
      key === CURRENT_STAFF_KEY ||
      key === CURRENT_USER_KEY
    ) {
      storage[key] = localStorage.getItem(key) ?? "";
    }
  }
  return {
    app: "kintai-craft",
    version: "1.0.0",
    targetDate: formatLocalDate(),
    exportedAt: new Date().toISOString(),
    data: storage,
  };
}

/** 1日1回を基本に、デスクトップへ日次バックアップを送る */
export async function runDesktopDailyBackup(force = false): Promise<boolean> {
  if (!isDesktopApp() || !window.desktopApp?.saveDailyBackup) return false;
  const today = formatLocalDate();
  if (!force && localStorage.getItem(LAST_BACKUP_DAY_KEY) === today) return false;

  const payload = buildKintaiBackupPayload();
  const result = await window.desktopApp.saveDailyBackup(payload);
  if (result?.success) {
    localStorage.setItem(LAST_BACKUP_DAY_KEY, today);
    return true;
  }
  console.warn("[desktop-backup] failed:", result?.message);
  return false;
}

export async function openDesktopBackupFolder(): Promise<void> {
  if (!isDesktopApp() || !window.desktopApp?.openBackupFolder) return;
  await window.desktopApp.openBackupFolder();
}
