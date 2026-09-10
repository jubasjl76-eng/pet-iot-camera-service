/**
 * Pet IoT Camera Service
 * Main entry point
 */

import './instrument.js'; // Sentry — must be the very first import
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { backendClient } from './services/backendClient.js';
import { cameraManager } from './cameras/index.js';
import { streamManager } from './streams/index.js';
import { healthMonitor } from './health/index.js';
import { mqttCameraClient } from './mqtt/index.js';
import { audioRelay } from './audio/index.js';
import { motionAnalyzer } from './motion/analyzer.js';
import cameraRoutes, { markShuttingDown } from './api/index.js';
import { buildOpenApiDoc, docsHtml } from './openapi.js';
import { httpMetricsMiddleware, metricsHandler } from './metrics.js';
import type { Server } from 'http';

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         🐾 Pet IoT Camera Service v1.0.0 🐾            ║
╠═══════════════════════════════════════════════════════════╣
║  Port:      ${config.port.toString().padEnd(39)}║
║  Stream:    ${config.streamPort.toString().padEnd(39)}║
║  MQTT:      ${`${config.mqttHost}:${config.mqttPort}`.padEnd(39)}║
║  Backend:   ${backendClient.getBackendUrl().padEnd(39)}║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Express app
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(httpMetricsMiddleware);

  // Routes
  app.get('/openapi.json', (_req, res) => res.json(buildOpenApiDoc()));
  app.get('/docs', (_req, res) => res.type('html').send(docsHtml));
  app.get('/metrics', metricsHandler); // Prometheus (Phase 16)
  app.use('/api', cameraRoutes);

  // Static files for HLS streams
  app.use('/streams', express.static(config.hlsOutputPath));

  // After the routes. No-op without a DSN.
  Sentry.setupExpressErrorHandler(app);

  // Start server
  httpServer = app.listen(config.port, () => {
    console.log(`[Service] Camera service running on port ${config.port}`);
    console.log('[Service] =========================================');
  });

  // Two-way audio: relay app→camera signals over MQTT
  audioRelay.setPublisher((kennelId, cameraId, sessionId, signal) => {
    mqttCameraClient.publishAudio(kennelId, cameraId, sessionId, signal);
  });

  // Real motion: an ffmpeg scene-change analyzer per camera. Runs for cameras
  // restored from the registry file and for any registered afterwards.
  for (const cam of cameraManager.getAllCameras()) motionAnalyzer.start(cam);
  cameraManager.on('registered', (cam) => motionAnalyzer.start(cam));
  cameraManager.on('removed', (cameraId: string) => motionAnalyzer.stop(cameraId));

  // Connect to MQTT
  try {
    await mqttCameraClient.connect();
    console.log('[Service] MQTT connected');
  } catch (error) {
    console.log('[Service] MQTT connection failed, running without MQTT');
  }

  // Start health monitoring
  healthMonitor.start();

  // Handle shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

let httpServer: Server | undefined;
let shuttingDown = false;

function shutdown(signal?: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  markShuttingDown(); // /api/ready → 503 immediately
  console.log(`\n[Service] ${signal ?? 'shutdown'} — draining...`);

  const guard = setTimeout(() => {
    console.error('[Service] drain timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  guard.unref();

  const teardown = () => {
    streamManager.stopAll();
    motionAnalyzer.stopAll();
    healthMonitor.stop();
    audioRelay.stop();
    mqttCameraClient.disconnect();
    backendClient.stop();
    clearTimeout(guard);
    console.log('[Service] stopped');
    process.exit(0);
  };

  if (httpServer) httpServer.close(() => teardown());
  else teardown();
}

main();
