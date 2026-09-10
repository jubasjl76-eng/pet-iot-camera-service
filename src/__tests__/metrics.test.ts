import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { registry, httpMetricsMiddleware } from '../metrics.js';

describe('metrics registry', () => {
  it('exposes default + gauge + http metrics', async () => {
    const text = await registry.metrics();
    expect(text).toContain('process_cpu_user_seconds_total');
    expect(text).toContain('cameras_registered');
    expect(text).toContain('streams_active');
    expect(text).toContain('http_request_duration_seconds');
    expect(text).toContain('service="pet-iot-camera-service"');
  });

  it('records a finished request', async () => {
    let finish: () => void = () => {};
    const req = { method: 'GET', path: '/openapi.json', baseUrl: '', route: { path: '/openapi.json' } } as unknown as Request;
    const res = { statusCode: 200, on: (ev: string, cb: () => void) => { if (ev === 'finish') finish = cb; } } as unknown as Response;
    httpMetricsMiddleware(req, res, () => {});
    finish();
    const text = await registry.metrics();
    expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/openapi\.json"[^}]*\}/);
  });
});
