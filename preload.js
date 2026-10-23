const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  isDesktop: true,
  platform: process.platform,
  version: "1.0.0",

  /**
   * 日次自動バックアップを Documents/出勤簿_自動バックアップ へ書き出す
   * @param {object} data
   */
  saveDailyBackup: (data) => ipcRenderer.invoke("save-daily-backup", data),

  /** バックアップフォルダをエクスプローラーで開く */
  openBackupFolder: () => ipcRenderer.invoke("open-backup-folder"),
});

window.addEventListener("DOMContentLoaded", () => {
  console.log("勤怠クラフト: デスクトップアプリケーションモードで起動しました。");
});
