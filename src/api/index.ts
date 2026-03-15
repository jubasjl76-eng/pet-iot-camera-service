/**
 * Camera Service API Routes
 */

import { Router, Request, Response } from 'express';
import { cameraManager, CameraConfig } from '../cameras/index.js';
import { streamManager } from '../streams/index.js';
import { motionDetection } from '../motion/index.js';
import { healthMonitor } from '../health/index.js';

const router = Router();

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
  const camera = cameraManager.getCamera(req.params.id);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }
  res.json({ camera });
});

// DELETE /api/cameras/:id - Remove camera
router.delete('/cameras/:id', (req: Request, res: Response) => {
  const deleted = cameraManager.removeCamera(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }
  streamManager.stopStream(req.params.id);
  res.json({ success: true });
});

// ============== STREAMS ==============

// GET /api/cameras/:id/stream - Get stream URL
router.get('/cameras/:id/stream', (req: Request, res: Response) => {
  const camera = cameraManager.getCamera(req.params.id);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  let streamUrl = streamManager.getStreamUrl(req.params.id);
  
  if (!streamUrl) {
    streamUrl = streamManager.startStream(req.params.id);
    if (!streamUrl) {
      res.status(500).json({ error: 'Failed to start stream' });
      return;
    }
  }

  res.json({ streamUrl, hls: true });
});

// POST /api/cameras/:id/stream/start - Start streaming
router.post('/cameras/:id/stream/start', (req: Request, res: Response) => {
  const streamUrl = streamManager.startStream(req.params.id);
  if (!streamUrl) {
    res.status(500).json({ error: 'Failed to start stream' });
    return;
  }
  res.json({ streamUrl });
});

// POST /api/cameras/:id/stream/stop - Stop streaming
router.post('/cameras/:id/stream/stop', (req: Request, res: Response) => {
  streamManager.stopStream(req.params.id);
  res.json({ success: true });
});

// ============== SNAPSHOTS ==============

// GET /api/cameras/:id/snapshot - Get snapshot
router.get('/cameras/:id/snapshot', (req: Request, res: Response) => {
  const camera = cameraManager.getCamera(req.params.id);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found' });
    return;
  }

  // In production, this would capture from the stream
  // For now, return placeholder
  res.json({ 
    message: 'Snapshot endpoint - requires FFmpeg integration',
    cameraId: req.params.id,
  });
});

// ============== MOTION ==============

// GET /api/cameras/:id/motion - Get motion status
router.get('/cameras/:id/motion', (req: Request, res: Response) => {
  const timeSinceLastMotion = motionDetection.getTimeSinceLastMotion(req.params.id);
  res.json({ 
    cameraId: req.params.id,
    lastMotion: timeSinceLastMotion >= 0 ? new Date(Date.now() - timeSinceLastMotion) : null,
    cooldownSeconds: timeSinceLastMotion >= 0 ? Math.floor(timeSinceLastMotion / 1000) : null,
  });
});

// POST /api/cameras/:id/motion - Simulate motion (for testing)
router.post('/cameras/:id/motion', (req: Request, res: Response) => {
  motionDetection.simulateMotion(req.params.id);
  res.json({ success: true, message: 'Motion simulated' });
});

// ============== HEALTH ==============

// GET /api/cameras/:id/health - Get camera health
router.get('/cameras/:id/health', (req: Request, res: Response) => {
  const health = healthMonitor.getHealth(req.params.id);
  if (!health) {
    res.status(404).json({ error: 'No health data available' });
    return;
  }
  res.json({ health });
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
