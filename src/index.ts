/**
 * Pet IoT Camera Service
 * Main entry point
 */

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
import cameraRoutes from './api/index.js';

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

  // Routes
  app.use('/api', cameraRoutes);

  // Static files for HLS streams
  app.use('/streams', express.static(config.hlsOutputPath));

  // Start server
  app.listen(config.port, () => {
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

function shutdown() {
  console.log('\n[Service] Shutting down...');
  streamManager.stopAll();
  motionAnalyzer.stopAll();
  healthMonitor.stop();
  audioRelay.stop();
  mqttCameraClient.disconnect();
  backendClient.stop();
  process.exit(0);
}

main();
