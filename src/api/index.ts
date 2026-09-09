/**
 * Camera Service API Routes
 */

import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';
import { cameraManager, CameraConfig } from '../cameras/index.js';
import { streamManager } from '../streams/index.js';
import { motionDetection } from '../motion/index.js';
import { healthMonitor } from '../health/index.js';
import { audioRelay } from '../audio/index.js';
import { mqttCameraClient } from '../mqtt/index.js';

const router = Router();

// ICE servers (STUN + optional TURN) for the app's RTCPeerConnection.
router.get('/ice-servers', (_req: Request, res: Response) => {
  res.json({ iceServers: config.iceServers });
});

// ============== CAMERAS ==============

// GET /api/cameras - List all cameras
router.get('/cameras', (_req: Request, res: Response) => {
  const cameras = cameraManager.getAllCameras();
  res.json({ cameras });
});

// POST /api/cameras - Register new camera
router.post('/cameras', (req: Request, res: Response) => {
  const { name, location, kennelId, rtspUrl, resolution, fps } = req.body;

  if (!name || !rtspUrl) {
    res.status(400).json({ error: 'name and rtspUrl are required' });
    return;
  }

  const config: CameraConfig = {
    name,
    location,
    kennelId,
    rtspUrl,
    resolution,
    fps,
  };

  const camera = cameraManager.registerCamera(config);
  res.status(201).json({ camera });
});

// GET /api/cameras/:id - Get camera details
router.get('/cameras/:id', (req: Request, res: Response) => {
  const camera = cameraManager.getCamera(String(req.params.id));
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }
  res.json({ camera });
});

// DELETE /api/cameras/:id - Remove camera
router.delete('/cameras/:id', (req: Request, res: Response) => {
  const deleted = cameraManager.removeCamera(String(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }
  streamManager.stopStream(String(req.params.id));
  res.json({ success: true });
});

// ============== STREAMS ==============

// GET /api/cameras/:id/stream - Get stream URL
router.get('/cameras/:id/stream', (req: Request, res: Response) => {
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
router.post('/cameras/:id/stream/start', (req: Request, res: Response) => {
  const streamUrl = streamManager.startStream(String(req.params.id));
  if (!streamUrl) {
    res.status(500).json({ error: 'Failed to start stream' });
    return;
  }
  res.json({ streamUrl });
});

// POST /api/cameras/:id/stream/stop - Stop streaming
router.post('/cameras/:id/stream/stop', (req: Request, res: Response) => {
  streamManager.stopStream(String(req.params.id));
  res.json({ success: true });
});

// ============== SNAPSHOTS ==============

// GET /api/cameras/:id/snapshot - Get snapshot
router.get('/cameras/:id/snapshot', (req: Request, res: Response) => {
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
router.get('/cameras/:id/motion', (req: Request, res: Response) => {
  const timeSinceLastMotion = motionDetection.getTimeSinceLastMotion(String(req.params.id));
  res.json({ 
    cameraId: String(req.params.id),
    lastMotion: timeSinceLastMotion >= 0 ? new Date(Date.now() - timeSinceLastMotion) : null,
    cooldownSeconds: timeSinceLastMotion >= 0 ? Math.floor(timeSinceLastMotion / 1000) : null,
  });
});

// POST /api/cameras/:id/motion - Simulate motion (for testing)
router.post('/cameras/:id/motion', (req: Request, res: Response) => {
  motionDetection.simulateMotion(String(req.params.id));
  res.json({ success: true, message: 'Motion simulated' });
});

// ============== HEALTH ==============

// GET /api/cameras/:id/health - Get camera health
router.get('/cameras/:id/health', (req: Request, res: Response) => {
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
router.post('/cameras/:id/audio/session', (req: Request, res: Response) => {
  const camera = cameraManager.getCamera(String(req.params.id));
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }
  const session = audioRelay.createSession(camera.cameraId, camera.kennelId || 'default');
  res.status(201).json({ sessionId: session.id, cameraId: camera.cameraId, iceServers: config.iceServers });
});

// GET /api/cameras/:id/audio/sessions - list active sessions for a camera
router.get('/cameras/:id/audio/sessions', (req: Request, res: Response) => {
  res.json({ sessions: audioRelay.list(String(req.params.id)) });
});

// POST /api/cameras/:id/audio/signal - app → camera (offer / answer / ice)
router.post('/cameras/:id/audio/signal', (req: Request, res: Response) => {
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
router.get('/cameras/:id/audio/session/:sid/poll', (req: Request, res: Response) => {
  const signals = audioRelay.poll(String(req.params.sid), 'app');
  if (signals === null) {
    res.status(404).json({ error: 'Unknown session' });
    return;
  }
  res.json({ signals });
});

// Camera-side poll (for a device that cannot subscribe MQTT) - drain app→camera queue
router.get('/cameras/:id/audio/session/:sid/poll-camera', (req: Request, res: Response) => {
  const signals = audioRelay.poll(String(req.params.sid), 'camera');
  if (signals === null) {
    res.status(404).json({ error: 'Unknown session' });
    return;
  }
  res.json({ signals });
});

// POST /api/cameras/:id/audio/talk - push-to-talk start/end
router.post('/cameras/:id/audio/talk', (req: Request, res: Response) => {
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
router.post('/cameras/:id/audio/play', (req: Request, res: Response) => {
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
router.delete('/cameras/:id/audio/session/:sid', (req: Request, res: Response) => {
  res.json({ ok: audioRelay.end(String(req.params.sid)) });
});

// GET /api/health - Service health
router.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    service: 'camera',
    streams: streamManager.getActiveStreams(),
    cameras: cameraManager.getAllCameras().length,
    timestamp: new Date().toISOString(),
  });
});

export default router;
