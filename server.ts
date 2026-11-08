import http from 'http';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/routes/api.js';
import { initWebSocketManager } from './server/websocket/wsManager.js';
import { initDatabase } from './server/db/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  // Initialize persistence database
  initDatabase();

  const app = express();
  const server = http.createServer(app);

  // Parse JSON payloads and cookies
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Mount central REST API
  app.use('/api/v1', apiRouter);

  // Initialize Native WebSocket Infrastructure on the HTTP server
  // Handles /device/connect (Android Agent) and /user/connect (Web Dashboard)
  const wsManager = initWebSocketManager(server);
  console.log('[WebSocket] Initialized device and user WebSocket handlers.');

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  if (!isProduction) {
    // Mount Vite dev server middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true }
    });
    app.use(vite.middlewares);
  } else {
    // Production static asset serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` SMS GATEWAY PLATFORM — CENTRAL SERVER`);
    console.log(` REST API: http://localhost:${PORT}/api/v1`);
    console.log(` Android Device WS: ws://localhost:${PORT}/device/connect`);
    console.log(` User Dashboard WS: ws://localhost:${PORT}/user/connect`);
    console.log(` Web Dashboard: http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
