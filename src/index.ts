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

  // Start health monitoring
  healthMonitor.start();

  // Handle shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function shutdown() {
  console.log('\n[Service] Shutting down...');
  streamManager.stopAll();
  healthMonitor.stop();
  backendClient.stop();
  process.exit(0);
}

main();
