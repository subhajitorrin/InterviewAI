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

function findRepoRootDir(): string {
  let curr = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(curr, 'apps', 'agent', 'presence_detector.py'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'apps', 'agent', 'presence_detector.py'))) {
    return cwd;
  }
  return path.resolve(__dirname, '../../');
}

// Persistent Python presence detector daemon
class PythonPresenceDaemon {
  private proc: any = null;
  private pendingQueue: Array<{
    resolve: (val: any) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private buffer: string = '';
  private isStarting = false;

  private start() {
    if (this.proc || this.isStarting) return;
    this.isStarting = true;
    try {
      const { spawn } = require('child_process');
      const rootDir = findRepoRootDir();
      const pythonBin = path.join(rootDir, 'apps/agent/.venv/bin/python');
      const scriptPath = path.join(rootDir, 'apps/agent/presence_detector.py');

      if (!fs.existsSync(pythonBin) || !fs.existsSync(scriptPath)) {
        console.warn('Python presence binary or script not found:', { pythonBin, scriptPath });
        this.isStarting = false;
        return;
      }

      this.proc = spawn(pythonBin, [scriptPath, '--daemon'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.proc.stdout.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const req = this.pendingQueue.shift();
          if (req) {
            clearTimeout(req.timer);
            try {
              req.resolve(JSON.parse(trimmed));
            } catch {
              req.resolve({
                cameraActive: true,
                isPresent: false,
                reason: 'Failed to parse detector response',
              });
            }
          }
        }
      });

      this.proc.stderr.on('data', (err: Buffer) => {
        console.warn('Presence daemon stderr:', err.toString());
      });

      this.proc.on('error', (err: any) => {
        console.warn('Presence daemon process error:', err);
        this.cleanup();
      });

      this.proc.on('close', () => {
        this.cleanup();
      });

      this.isStarting = false;
    } catch (err) {
      console.warn('Failed to start presence daemon:', err);
      this.isStarting = false;
    }
  }

  private cleanup() {
    if (this.proc) {
      try { this.proc.kill(); } catch {}
      this.proc = null;
    }
    this.buffer = '';
    while (this.pendingQueue.length > 0) {
      const req = this.pendingQueue.shift();
      if (req) {
        clearTimeout(req.timer);
        req.resolve({ cameraActive: true, isPresent: false, method: 'daemon-closed' });
      }
    }
  }

  public detect(imageBase64: string): Promise<any> {
    return new Promise((resolve) => {
      this.start();
      if (!this.proc || !this.proc.stdin || this.proc.killed) {
        return this.detectOneShot(imageBase64, resolve);
      }

      const timer = setTimeout(() => {
        const idx = this.pendingQueue.findIndex(q => q.resolve === resolve);
        if (idx !== -1) {
          this.pendingQueue.splice(idx, 1);
        }
        resolve({ cameraActive: true, isPresent: false, timeout: true });
      }, 1500);

      this.pendingQueue.push({ resolve, timer });

      try {
        const clean = (imageBase64 || '').replace(/[\r\n]+/g, '');
        this.proc.stdin.write(clean + '\n');
      } catch (err) {
        clearTimeout(timer);
        this.cleanup();
        this.detectOneShot(imageBase64, resolve);
      }
    });
  }

  private detectOneShot(imageBase64: string, resolve: (val: any) => void) {
    try {
      const { spawn } = require('child_process');
      const rootDir = findRepoRootDir();
      const pythonBin = path.join(rootDir, 'apps/agent/.venv/bin/python');
      const scriptPath = path.join(rootDir, 'apps/agent/presence_detector.py');

      const proc = spawn(pythonBin, [scriptPath]);
      let output = '';
      let errOutput = '';

      proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { errOutput += d.toString(); });

      proc.on('error', (err: any) => {
        resolve({
          cameraActive: true,
          isPresent: false,
          error: err.message,
          method: 'opencv-spawn-error',
        });
      });

      proc.on('close', (code: number) => {
        if (code === 0 && output.trim()) {
          try {
            resolve(JSON.parse(output.trim()));
            return;
          } catch {}
        }
        resolve({
          cameraActive: true,
          isPresent: false,
          error: errOutput || `OpenCV exit code ${code}`,
          method: 'opencv-fallback',
        });
      });

      proc.stdin.write(imageBase64 || '');
      proc.stdin.end();
    } catch (e: any) {
      resolve({
        cameraActive: true,
        isPresent: false,
        error: e.message,
        method: 'opencv-error',
      });
    }
  }
}

const presenceDaemon = new PythonPresenceDaemon();

ipcMain.handle('opencv:detectPresence', async (_event, imageBase64: string) => {
  return await presenceDaemon.detect(imageBase64);
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
