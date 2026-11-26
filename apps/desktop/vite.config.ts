import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { AccessToken } from 'livekit-server-sdk'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'livekit-token-endpoint',
      configureServer(server) {
        server.middlewares.use('/api/token', async (req, res) => {
          try {
            let roomName = 'interview-room-1';
            let participantName = 'Candidate';
            let metadata: string | undefined = undefined;

            if (req.method === 'POST') {
              const bodyStr = await new Promise<string>((resolve, reject) => {
                let data = '';
                req.on('data', chunk => { data += chunk; });
                req.on('end', () => resolve(data));
                req.on('error', reject);
              });
              if (bodyStr) {
                try {
                  const parsed = JSON.parse(bodyStr);
                  if (parsed.room) roomName = parsed.room;
                  if (parsed.name) participantName = parsed.name;
                  if (parsed.metadata) metadata = typeof parsed.metadata === 'string' ? parsed.metadata : JSON.stringify(parsed.metadata);
                } catch {}
              }
            } else {
              const url = new URL(req.url || '', `http://${req.headers.host}`);
              roomName = url.searchParams.get('room') || 'interview-room-1';
              participantName = url.searchParams.get('name') || 'Candidate';
              metadata = url.searchParams.get('metadata') || undefined;
            }

            const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
            const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

            // Deterministic identity so LiveKit server enforces a single session per candidate,
            // preventing duplicate ghost participants from causing self-echo loops.
            const normalizedIdentity = `candidate_${participantName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

            const at = new AccessToken(apiKey, apiSecret, {
              identity: normalizedIdentity,
              name: participantName,
              metadata,
              ttl: '2h',
            });

            at.addGrant({
              room: roomName,
              roomJoin: true,
              canPublish: true,
              canSubscribe: true,
              canPublishData: true,
            });

            const token = await at.toJwt();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ token }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });

        server.middlewares.use('/api/system/apps', async (_req, res) => {
          try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            const { stdout } = await execAsync('lsappinfo visibleProcessList');
            const regex = /"([^"]+)"/g;
            const names: string[] = [];
            let match: RegExpExecArray | null;

            while ((match = regex.exec(stdout)) !== null) {
              const cleanName = match[1]
                .replace(/_/g, ' ')
                .replace(/^\u200e/, '')
                .trim();

              if (
                cleanName &&
                cleanName !== 'loginwindow' &&
                cleanName !== 'WindowManager' &&
                cleanName !== 'Dock'
              ) {
                names.push(cleanName);
              }
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ apps: names }));
          } catch {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ apps: [] }));
          }
        });

        server.middlewares.use('/api/log/init', async (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const fs = await import('fs');
                const { candidateName, role } = JSON.parse(body || '{}');
                const logPath = path.resolve(__dirname, '../../conversation.log');
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
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            res.end();
          }
        });

        server.middlewares.use('/api/log/append', async (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const fs = await import('fs');
                const { speaker, text } = JSON.parse(body || '{}');
                const logPath = path.resolve(__dirname, '../../conversation.log');
                const time = new Date().toLocaleTimeString();
                const line = `[${time}] [${speaker}]: ${text.trim()}\n`;
                await fs.promises.appendFile(logPath, line, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            res.end();
          }
        });

        // Persistent Python Presence Daemon for real-time presence detection in Vite dev server
        let vitePresenceProc: any = null;
        let vitePendingQueue: Array<{ resolve: (val: any) => void; timer: any }> = [];
        let viteBuffer = '';

        const getViteRepoRoot = () => {
          let curr = __dirname;
          for (let i = 0; i < 5; i++) {
            if (path.resolve(curr, 'apps/agent/presence_detector.py')) {
              try {
                const fs = require('fs');
                if (fs.existsSync(path.join(curr, 'apps/agent/presence_detector.py'))) {
                  return curr;
                }
              } catch {}
            }
            const parent = path.dirname(curr);
            if (parent === curr) break;
            curr = parent;
          }
          return path.resolve(__dirname, '../../');
        };

        const startVitePresenceDaemon = async () => {
          if (vitePresenceProc) return;
          try {
            const { spawn } = await import('child_process');
            const fs = await import('fs');
            const rootDir = getViteRepoRoot();
            const pythonBin = path.join(rootDir, 'apps/agent/.venv/bin/python');
            const scriptPath = path.join(rootDir, 'apps/agent/presence_detector.py');

            if (!fs.existsSync(pythonBin) || !fs.existsSync(scriptPath)) {
              return;
            }

            vitePresenceProc = spawn(pythonBin, [scriptPath, '--daemon'], {
              stdio: ['pipe', 'pipe', 'pipe'],
            });

            vitePresenceProc.stdout.on('data', (chunk: Buffer) => {
              viteBuffer += chunk.toString();
              const lines = viteBuffer.split('\n');
              viteBuffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const req = vitePendingQueue.shift();
                if (req) {
                  clearTimeout(req.timer);
                  try {
                    req.resolve(JSON.parse(trimmed));
                  } catch {
                    req.resolve({ cameraActive: true, isPresent: false, reason: 'Parse error' });
                  }
                }
              }
            });

            vitePresenceProc.on('error', () => {
              if (vitePresenceProc) {
                try { vitePresenceProc.kill(); } catch {}
                vitePresenceProc = null;
              }
            });

            vitePresenceProc.on('close', () => {
              vitePresenceProc = null;
              while (vitePendingQueue.length > 0) {
                const req = vitePendingQueue.shift();
                if (req) {
                  clearTimeout(req.timer);
                  req.resolve({ cameraActive: true, isPresent: false, method: 'daemon-closed' });
                }
              }
            });
          } catch {}
        };

        const detectVitePresence = async (imageBase64: string): Promise<any> => {
          await startVitePresenceDaemon();
          if (!vitePresenceProc || !vitePresenceProc.stdin || vitePresenceProc.killed) {
            // One-shot fallback
            const { spawn } = await import('child_process');
            const rootDir = getViteRepoRoot();
            const pythonBin = path.join(rootDir, 'apps/agent/.venv/bin/python');
            const scriptPath = path.join(rootDir, 'apps/agent/presence_detector.py');
            return new Promise((resolve) => {
              try {
                const proc = spawn(pythonBin, [scriptPath]);
                let output = '';
                let errOutput = '';
                proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
                proc.stderr.on('data', (d: Buffer) => { errOutput += d.toString(); });
                proc.on('error', (err: any) => resolve({ cameraActive: true, isPresent: false, error: err.message }));
                proc.on('close', (code: number) => {
                  if (code === 0 && output.trim()) {
                    try { resolve(JSON.parse(output.trim())); return; } catch {}
                  }
                  resolve({ cameraActive: true, isPresent: false, error: errOutput });
                });
                proc.stdin.write(imageBase64 || '');
                proc.stdin.end();
              } catch (e: any) {
                resolve({ cameraActive: true, isPresent: false, error: e.message });
              }
            });
          }

          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              const idx = vitePendingQueue.findIndex(q => q.resolve === resolve);
              if (idx !== -1) vitePendingQueue.splice(idx, 1);
              resolve({ cameraActive: true, isPresent: false, timeout: true });
            }, 1500);

            vitePendingQueue.push({ resolve, timer });

            try {
              const clean = (imageBase64 || '').replace(/[\r\n]+/g, '');
              vitePresenceProc.stdin.write(clean + '\n');
            } catch {
              clearTimeout(timer);
              if (vitePresenceProc) {
                try { vitePresenceProc.kill(); } catch {}
                vitePresenceProc = null;
              }
              resolve({ cameraActive: true, isPresent: false });
            }
          });
        };

        server.middlewares.use('/api/opencv/detect-presence', async (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const imageBase64 = parsed.image || '';
                const result = await detectVitePresence(imageBase64);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message, cameraActive: true, isPresent: false }));
              }
            });
          } else {
            res.end();
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
