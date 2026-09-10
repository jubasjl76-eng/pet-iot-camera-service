/**
 * Prometheus metrics (hardening Phase 16). GET /metrics — process metrics, an
 * HTTP request-duration histogram, and camera/stream gauges. Scraped by the
 * Grafana Cloud agent.
 */
import { collectDefaultMetrics, Registry, Histogram, Gauge } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import { cameraManager } from './cameras/index.js';
import { streamManager } from './streams/index.js';
import { mqttCameraClient } from './mqtt/index.js';
import { VERSION } from './version.js';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'pet-iot-camera-service', version: VERSION });
collectDefaultMetrics({ register: registry });

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

new Gauge({
  name: 'dependency_up',
  help: 'Dependency reachability (1 = up)',
  labelNames: ['dep'],
  registers: [registry],
  collect() {
    this.set({ dep: 'mqtt' }, mqttCameraClient.isConnected() ? 1 : 0);
  },
});

new Gauge({
  name: 'cameras_registered',
  help: 'Cameras currently registered',
  registers: [registry],
  collect() {
    this.set(cameraManager.getAllCameras().length);
  },
});

new Gauge({
  name: 'streams_active',
  help: 'HLS streams currently running',
  registers: [registry],
  collect() {
    this.set(streamManager.getActiveStreams().length);
  },
});

function routeLabel(req: Request): string {
  const sub = req.route?.path;
  if (typeof sub === 'string') return (req.baseUrl || '') + sub || sub;
  return req.baseUrl || req.path || 'other';
}

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics') return next();
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: routeLabel(req), status: String(res.statusCode) });
  });
  next();
}

export async function metricsHandler(req: Request, res: Response): Promise<void> {
  const token = process.env.METRICS_TOKEN;
  if (token && req.get('authorization') !== `Bearer ${token}`) {
    res.status(401).end();
    return;
  }
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
}
