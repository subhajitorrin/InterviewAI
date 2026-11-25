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

        server.middlewares.use('/api/opencv/detect-presence', async (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const { spawn } = await import('child_process');
                const parsed = JSON.parse(body || '{}');
                const imageBase64 = parsed.image || '';

                const rootDir = path.resolve(__dirname, '../../');
                const pythonBin = path.join(rootDir, 'apps/agent/.venv/bin/python');
                const scriptPath = path.join(rootDir, 'apps/agent/presence_detector.py');

                const proc = spawn(pythonBin, [scriptPath]);
                let output = '';
                let errOutput = '';

                proc.stdout.on('data', (d) => { output += d.toString(); });
                proc.stderr.on('data', (d) => { errOutput += d.toString(); });

                proc.on('close', (code) => {
                  res.setHeader('Content-Type', 'application/json');
                  if (code === 0 && output.trim()) {
                    try {
                      res.end(output.trim());
                      return;
                    } catch {}
                  }
                  res.end(JSON.stringify({
                    cameraActive: true,
                    isPresent: false,
                    error: errOutput || `OpenCV exit code ${code}`,
                    method: 'opencv-fallback'
                  }));
                });

                proc.stdin.write(imageBase64);
                proc.stdin.end();
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
