const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

const isDev = !app.isPackaged;
const BACKUP_FOLDER_NAME = "出勤簿_自動バックアップ";
const BACKUP_KEEP_DAYS = 14;

/** @type {import('http').Server | null} */
let staticServer = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function formatLocalDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getBackupDirectoryPath() {
  const documentsPath = app.getPath("documents");
  const backupDir = path.join(documentsPath, BACKUP_FOLDER_NAME);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

function isDailyBackupFileName(file) {
  return Boolean(file && file.startsWith("kintai_backup_") && file.endsWith(".json"));
}

function cleanOldBackupFiles(backupDir, keepCount = BACKUP_KEEP_DAYS) {
  try {
    if (!fs.existsSync(backupDir)) return;
    const backupFiles = fs
      .readdirSync(backupDir)
      .filter((file) => isDailyBackupFileName(file))
      .sort();
    while (backupFiles.length > keepCount) {
      const oldest = backupFiles.shift();
      if (oldest) fs.unlinkSync(path.join(backupDir, oldest));
    }
  } catch (error) {
    console.error("cleanOldBackupFiles error:", error);
  }
}

function setupBackupIpc() {
  ipcMain.handle("save-daily-backup", async (_event, payload) => {
    try {
      if (!payload) {
        return { success: false, message: "バックアップデータが空です。" };
      }

      let targetDate = "";
      let dumpData = null;
      if (payload.data && typeof payload.data === "object") {
        targetDate = payload.targetDate || formatLocalDate();
        dumpData = payload.data;
      } else {
        targetDate = payload.targetDate || formatLocalDate();
        dumpData = payload;
      }

      const backupDir = getBackupDirectoryPath();
      const fileName = `kintai_backup_${targetDate}.json`;
      const filePath = path.join(backupDir, fileName);
      const jsonStr = typeof dumpData === "string" ? dumpData : JSON.stringify(dumpData, null, 2);
      fs.writeFileSync(filePath, jsonStr, "utf8");
      cleanOldBackupFiles(backupDir, BACKUP_KEEP_DAYS);

      return {
        success: true,
        filePath,
        fileName,
        message: `「ドキュメント\\${BACKUP_FOLDER_NAME}」に保存しました。`,
      };
    } catch (error) {
      console.error("save-daily-backup error:", error);
      return { success: false, message: error?.message || "ファイル書き出しに失敗しました。" };
    }
  });

  ipcMain.handle("open-backup-folder", async () => {
    try {
      const backupDir = getBackupDirectoryPath();
      await shell.openPath(backupDir);
      return { success: true };
    } catch (error) {
      console.error("open-backup-folder error:", error);
      return { success: false, message: error?.message || "フォルダを開けませんでした。" };
    }
  });
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain; charset=utf-8",
  };
  return map[ext] || "application/octet-stream";
}

function resolveStaticRoot() {
  // asar 内の out/ を配信（electron-builder files に out/** を含める）
  return path.join(app.getAppPath(), "out");
}

function startStaticServer() {
  const root = resolveStaticRoot();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let relative = urlPath === "/" ? "/index.html" : urlPath;
        let filePath = path.normalize(path.join(root, relative));
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // SPA / Next export fallback
          filePath = path.join(root, "index.html");
        }
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
        res.end(data);
      } catch (error) {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("静的サーバーの起動に失敗しました"));
        return;
      }
      staticServer = server;
      resolve(`http://127.0.0.1:${address.port}`);
    });
    server.on("error", reject);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "kintai-craft 出勤簿",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const origin = await startStaticServer();
    await mainWindow.loadURL(origin);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  setupBackupIpc();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
  if (process.platform !== "darwin") app.quit();
});
