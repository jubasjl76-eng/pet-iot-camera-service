/**
 * Camera Service API Routes
 */

import { Router, Request, Response } from 'express';
import { z } from '@jubasjl76-eng/shared';
import { config } from '../config/index.js';
import { cameraManager, CameraConfig } from '../cameras/index.js';
import { streamManager } from '../streams/index.js';
import { motionDetection } from '../motion/index.js';
import { healthMonitor } from '../health/index.js';
import { audioRelay } from '../audio/index.js';
import { mqttCameraClient } from '../mqtt/index.js';
import { apiRoute } from '../openapi.js';

const router = Router();
const T = ['cameras'];
const A = ['audio'];
const idParam = z.object({ id: z.string() });
const sidParam = z.object({ id: z.string(), sid: z.string() });

// ICE servers (STUN + optional TURN) for the app's RTCPeerConnection.
router.get(
  '/ice-servers',
  apiRoute({
    method: 'get',
    path: '/api/ice-servers',
    tags: ['audio'],
    summary: 'STUN/TURN config for the app RTCPeerConnection.',
    responses: { 200: { description: 'ok', schema: z.object({ iceServers: z.array(z.object({ urls: z.string(), username: z.string().optional(), credential: z.string().optional() })) }) } },
  }),
  (_req: Request, res: Response) => {
    res.json({ iceServers: config.iceServers });
  },
);

// ============== CAMERAS ==============

const cameraShape = z.object({
  id: z.string(),
  cameraId: z.string().optional(),
  name: z.string(),
  location: z.string().optional(),
  kennelId: z.string().optional(),
  rtspUrl: z.string(),
  isOnline: z.boolean().optional(),
});

// GET /api/cameras - List all cameras
router.get(
  '/cameras',
  apiRoute({
    method: 'get',
    path: '/api/cameras',
    tags: T,
    summary: 'List registered cameras.',
    responses: { 200: { description: 'ok', schema: z.object({ cameras: z.array(cameraShape) }) } },
  }),
  (_req: Request, res: Response) => {
    const cameras = cameraManager.getAllCameras();
    res.json({ cameras });
  },
);

// POST /api/cameras - Register new camera
router.post(
  '/cameras',
  apiRoute({
    method: 'post',
    path: '/api/cameras',
    tags: T,
    summary: 'Register a camera by RTSP URL. Starts the scene-change analyzer.',
    request: {
      body: z.object({
        name: z.string().min(1),
        rtspUrl: z.string().min(1),
        location: z.string().optional(),
        kennelId: z.string().optional(),
        resolution: z.string().optional(),
        fps: z.coerce.number().optional(),
      }),
    },
    responses: { 201: { description: 'created', schema: z.object({ camera: cameraShape }) } },
  }),
  (req: Request, res: Response) => {
    const { name, location, kennelId, rtspUrl, resolution, fps } = req.body;
    const cfg: CameraConfig = { name, location, kennelId, rtspUrl, resolution, fps };
    const camera = cameraManager.registerCamera(cfg);
    res.status(201).json({ camera });
  },
);

// GET /api/cameras/:id - Get camera details
router.get(
  '/cameras/:id',
  apiRoute({
    method: 'get',
    path: '/api/cameras/{id}',
    tags: T,
    summary: 'One camera.',
    request: { params: idParam },
    responses: { 200: { description: 'ok', schema: z.object({ camera: cameraShape }) }, 404: { description: 'not found' } },
  }),
  (req: Request, res: Response) => {
    const camera = cameraManager.getCamera(String(req.params.id));
    if (!camera) {
      res.status(404).json({ error: 'Camera not found' });
      return;
    }
    res.json({ camera });
  },
);

// DELETE /api/cameras/:id - Remove camera
router.delete(
  '/cameras/:id',
  apiRoute({
    method: 'delete',
    path: '/api/cameras/{id}',
    tags: T,
    summary: 'Remove a camera + stop its stream.',
    request: { params: idParam },
    responses: { 200: { description: 'removed' }, 404: { description: 'not found' } },
  }),
  (req: Request, res: Response) => {
    const deleted = cameraManager.removeCamera(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Camera not found' });
      return;
    }
    streamManager.stopStream(String(req.params.id));
    res.json({ success: true });
  },
);

// ============== STREAMS ==============

// GET /api/cameras/:id/stream - Get stream URL
router.get(
  '/cameras/:id/stream',
  apiRoute({
    method: 'get', path: '/api/cameras/{id}/stream', tags: T,
    summary: 'Get (or start) the HLS stream URL for a camera.',
    request: { params: idParam },
    responses: { 200: { description: 'ok' }, 404: { description: 'not found' }, 500: { description: 'start failed' } },
  }),
  (req: Request, res: Response) => {
  const camera = cameraManager.getCamera(String(req.params.id));
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  let streamUrl = streamManager.getStreamUrl(String(req.params.id));

  if (!streamUrl) {
    streamUrl = streamManager.startStream(String(req.params.id));
    if (!streamUrl) {
      res.status(500).json({ error: 'Failed to start stream' });
      return;
    }
  }

  res.json({ streamUrl, hls: true });
});

// POST /api/cameras/:id/stream/start - Start streaming
router.post(
  '/cameras/:id/stream/start',
  apiRoute({
    method: 'post', path: '/api/cameras/{id}/stream/start', tags: T,
    summary: 'Start the stream for a camera.',
    request: { params: idParam },
    responses: { 200: { description: 'ok' }, 500: { description: 'start failed' } },
  }),
  (req: Request, res: Response) => {
  const streamUrl = streamManager.startStream(String(req.params.id));
  if (!streamUrl) {
    res.status(500).json({ error: 'Failed to start stream' });
    return;
  }
  res.json({ streamUrl });
});

// POST /api/cameras/:id/stream/stop - Stop streaming
router.post(
  '/cameras/:id/stream/stop',
  apiRoute({
    method: 'post', path: '/api/cameras/{id}/stream/stop', tags: T,
    summary: 'Stop the stream for a camera.',
    request: { params: idParam },
    responses: { 200: { description: 'ok' } },
  }),
  (req: Request, res: Response) => {
  streamManager.stopStream(String(req.params.id));
  res.json({ success: true });
});

// ============== SNAPSHOTS ==============

// GET /api/cameras/:id/snapshot - Get snapshot
router.get(
  '/cameras/:id/snapshot',
  apiRoute({
    method: 'get', path: '/api/cameras/{id}/snapshot', tags: T,
    summary: 'Capture a snapshot (placeholder — needs FFmpeg integration).',
    request: { params: idParam },
    responses: { 200: { description: 'ok' }, 404: { description: 'not found' } },
  }),
  (req: Request, res: Response) => {
  const camera = cameraManager.getCamera(String(req.params.id));
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  // In production, this would capture from the stream
  // For now, return placeholder
  res.json({
    message: 'Snapshot endpoint - requires FFmpeg integration',
    cameraId: String(req.params.id),
  });
});

// ============== MOTION ==============

// GET /api/cameras/:id/motion - Get motion status
router.get(
  '/cameras/:id/motion',
  apiRoute({
    method: 'get', path: '/api/cameras/{id}/motion', tags: T,
    summary: 'Last-motion timestamp + cooldown for a camera.',
    request: { params: idParam },
    responses: { 200: { description: 'ok' } },
  }),
  (req: Request, res: Response) => {
  const timeSinceLastMotion = motionDetection.getTimeSinceLastMotion(String(req.params.id));
  res.json({
    cameraId: String(req.params.id),
    lastMotion: timeSinceLastMotion >= 0 ? new Date(Date.now() - timeSinceLastMotion) : null,
    cooldownSeconds: timeSinceLastMotion >= 0 ? Math.floor(timeSinceLastMotion / 1000) : null,
  });
});

// POST /api/cameras/:id/motion - Simulate motion (for testing)
router.post(
  '/cameras/:id/motion',
  apiRoute({
    method: 'post', path: '/api/cameras/{id}/motion', tags: T,
    summary: 'Simulate a motion event (testing).',
    request: { params: idParam },
    responses: { 200: { description: 'ok' } },
  }),
  (req: Request, res: Response) => {
  motionDetection.simulateMotion(String(req.params.id));
  res.json({ success: true, message: 'Motion simulated' });
});

// ============== HEALTH ==============

// GET /api/cameras/:id/health - Get camera health
router.get(
  '/cameras/:id/health',
  apiRoute({
    method: 'get', path: '/api/cameras/{id}/health', tags: T,
    summary: 'Health snapshot for a camera.',
    request: { params: idParam },
    responses: { 200: { description: 'ok' }, 404: { description: 'no data' } },
  }),
  (req: Request, res: Response) => {
  const health = healthMonitor.getHealth(String(req.params.id));
  if (!health) {
    res.status(404).json({ error: 'No health data available' });
    return;
  }
  res.json({ health });
});

// ============== TWO-WAY AUDIO ==============
// Signalling relay between the pet-owner app and the camera device.
// Media is peer-to-peer WebRTC; these endpoints only shuttle offer/answer/ice
// and the talk/play/stop controls. The app polls /poll for the camera's replies.

// POST /api/cameras/:id/audio/session - open a talk session
router.post(
  '/cameras/:id/audio/session',
  apiRoute({
    method: 'post', path: '/api/cameras/{id}/audio/session', tags: A,
    summary: 'Open a two-way audio (talk) session.',
    request: { params: idParam },
    responses: { 201: { description: 'created' }, 404: { description: 'camera not found' } },
  }),
  (req: Request, res: Response) => {
  const camera = cameraManager.getCamera(String(req.params.id));
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }
  const session = audioRelay.createSession(camera.cameraId, camera.kennelId || 'default');
  res.status(201).json({ sessionId: session.id, cameraId: camera.cameraId, iceServers: config.iceServers });
});

// GET /api/cameras/:id/audio/sessions - list active sessions for a camera
router.get(
  '/cameras/:id/audio/sessions',
  apiRoute({
    method: 'get', path: '/api/cameras/{id}/audio/sessions', tags: A,
    summary: 'Active audio sessions for a camera.',
    request: { params: idParam },
    responses: { 200: { description: 'ok' } },
  }),
  (req: Request, res: Response) => {
  res.json({ sessions: audioRelay.list(String(req.params.id)) });
});

// POST /api/cameras/:id/audio/signal - app → camera (offer / answer / ice)
router.post(
  '/cameras/:id/audio/signal',
  apiRoute({
    method: 'post', path: '/api/cameras/{id}/audio/signal', tags: A,
    summary: 'Relay a WebRTC signal (offer / answer / ice) app → camera.',
    request: { params: idParam, body: z.object({ sessionId: z.string(), signal: z.record(z.string(), z.unknown()) }) },
    responses: { 200: { description: 'ok' }, 400: { description: 'bad signal' }, 404: { description: 'unknown session' } },
  }),
  (req: Request, res: Response) => {
  const { sessionId, signal } = req.body || {};
  if (!sessionId || !signal || !signal.kind) {
    res.status(400).json({ error: 'sessionId and signal{kind,...} are required' });
    return;
  }
  if (!audioRelay.relay(sessionId, 'app', signal)) {
    res.status(404).json({ error: 'Unknown session' });
    return;
  }
  res.json({ ok: true });
});

// GET /api/cameras/:id/audio/session/:sid/poll - drain signals queued for the app
router.get(
  '/cameras/:id/audio/session/:sid/poll',
  apiRoute({
    method: 'get', path: '/api/cameras/{id}/audio/session/{sid}/poll', tags: A,
    summary: 'Drain signals queued for the app.',
    request: { params: sidParam },
    responses: { 200: { description: 'ok' }, 404: { description: 'unknown session' } },
  }),
  (req: Request, res: Response) => {
  const signals = audioRelay.poll(String(req.params.sid), 'app');
  if (signals === null) {
    res.status(404).json({ error: 'Unknown session' });
    return;
  }
  res.json({ signals });
});

// Camera-side poll (for a device that cannot subscribe MQTT) - drain app→camera queue
router.get(
  '/cameras/:id/audio/session/:sid/poll-camera',
  apiRoute({
    method: 'get', path: '/api/cameras/{id}/audio/session/{sid}/poll-camera', tags: A,
    summary: 'Drain signals queued for the camera (device HTTP fallback).',
    request: { params: sidParam },
    responses: { 200: { description: 'ok' }, 404: { description: 'unknown session' } },
  }),
  (req: Request, res: Response) => {
  const signals = audioRelay.poll(String(req.params.sid), 'camera');
  if (signals === null) {
    res.status(404).json({ error: 'Unknown session' });
    return;
  }
  res.json({ signals });
});

// POST /api/cameras/:id/audio/talk - push-to-talk start/end
router.post(
  '/cameras/:id/audio/talk',
  apiRoute({
    method: 'post', path: '/api/cameras/{id}/audio/talk', tags: A,
    summary: 'Push-to-talk start / end.',
    request: { params: idParam, body: z.object({ sessionId: z.string(), state: z.enum(['start', 'end']) }) },
    responses: { 200: { description: 'ok' }, 400: { description: 'bad state' }, 404: { description: 'unknown session' } },
  }),
  (req: Request, res: Response) => {
  const { sessionId, state } = req.body || {};
  if (!sessionId || (state !== 'start' && state !== 'end')) {
    res.status(400).json({ error: "sessionId and state ('start'|'end') required" });
    return;
  }
  if (!audioRelay.relay(sessionId, 'app', { kind: 'talk', state })) {
    res.status(404).json({ error: 'Unknown session' });
    return;
  }
  res.json({ ok: true });
});

// POST /api/cameras/:id/audio/play - play a canned clip on the camera speaker
router.post(
  '/cameras/:id/audio/play',
  apiRoute({
    method: 'post', path: '/api/cameras/{id}/audio/play', tags: A,
    summary: 'Play a canned clip on the camera speaker.',
    request: { params: idParam, body: z.object({ sessionId: z.string(), url: z.string(), loop: z.boolean().optional() }) },
    responses: { 200: { description: 'ok' }, 400: { description: 'missing url' }, 404: { description: 'unknown session' } },
  }),
  (req: Request, res: Response) => {
  const { sessionId, url, loop } = req.body || {};
  if (!sessionId || !url) {
    res.status(400).json({ error: 'sessionId and url required' });
    return;
  }
  if (!audioRelay.relay(sessionId, 'app', { kind: 'play', url, loop: !!loop })) {
    res.status(404).json({ error: 'Unknown session' });
    return;
  }
  res.json({ ok: true });
});

// DELETE /api/cameras/:id/audio/session/:sid - end a session
router.delete(
  '/cameras/:id/audio/session/:sid',
  apiRoute({
    method: 'delete', path: '/api/cameras/{id}/audio/session/{sid}', tags: A,
    summary: 'End an audio session.',
    request: { params: sidParam },
    responses: { 200: { description: 'ok' } },
  }),
  (req: Request, res: Response) => {
  res.json({ ok: audioRelay.end(String(req.params.sid)) });
});

// GET /api/health - liveness (the process is up). Always 200.
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'camera',
    streams: streamManager.getActiveStreams(),
    cameras: cameraManager.getAllCameras().length,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/ready - readiness. 503 until MQTT is connected / while draining.
router.get('/ready', (_req: Request, res: Response) => {
  const mqtt = mqttCameraClient.isConnected();
  const ok = mqtt && !isShuttingDown();
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not-ready', mqtt, shuttingDown: isShuttingDown() });
});

let shuttingDown = false;
export function markShuttingDown(): void { shuttingDown = true; }
function isShuttingDown(): boolean { return shuttingDown; }

export default router;
