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
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const roomName = url.searchParams.get('room') || 'interview-room-1';
            const participantName = url.searchParams.get('name') || 'Candidate';
            const metadata = url.searchParams.get('metadata') || undefined;

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
