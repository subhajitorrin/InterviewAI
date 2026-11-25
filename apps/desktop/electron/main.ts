import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { getRunningMacApps } from './system-monitor';
import { createParticipantToken } from './livekit-token';

function getLogFilePath(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'packages')) || fs.existsSync(path.join(cwd, 'apps'))) {
    return path.join(cwd, 'conversation.log');
  }
  const parent = path.resolve(cwd, '..');
  if (fs.existsSync(path.join(parent, 'packages')) || fs.existsSync(path.join(parent, 'apps'))) {
    return path.join(parent, 'conversation.log');
  }
  return path.resolve(__dirname, '../../conversation.log');
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#090D16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  // Automatically grant media permissions (camera/mic) in Electron
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(true);
    }
  });

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('livekit:getToken', async (_event, { roomName, participantName, metadata }: { roomName: string; participantName?: string; metadata?: string }) => {
  return await createParticipantToken(roomName, participantName, metadata);
});

ipcMain.handle('system:getRunningApps', async () => {
  return await getRunningMacApps();
});

ipcMain.handle('system:getDeviceInfo', async () => {
  return {
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
  };
});

ipcMain.handle('log:init', async (_event, { candidateName, role }: { candidateName: string; role: string }) => {
  try {
    const logPath = getLogFilePath();
    const header = [
      '================================================================================',
      'INTERVIEW CONVERSATION LOG',
      `Candidate: ${candidateName || 'Candidate'}`,
      `Target Role: ${role || 'Engineering'}`,
      `Started At: ${new Date().toLocaleString()}`,
      '================================================================================',
      '',
    ].join('\n');
    await fs.promises.writeFile(logPath, header, 'utf-8');
    return true;
  } catch (err) {
    console.warn('Failed to initialize conversation log:', err);
    return false;
  }
});

ipcMain.handle('log:append', async (_event, { speaker, text }: { speaker: string; text: string }) => {
  try {
    if (!text || !text.trim()) return false;
    const logPath = getLogFilePath();
    const time = new Date().toLocaleTimeString();
    const line = `[${time}] [${speaker}]: ${text.trim()}\n`;
    await fs.promises.appendFile(logPath, line, 'utf-8');
    return true;
  } catch (err) {
    console.warn('Failed to append to conversation log:', err);
    return false;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
