/**
 * Camera Management
 */

import { EventEmitter } from 'events';
import { config } from '../config/index.js';
import { backendClient } from '../services/backendClient.js';

export interface Camera {
  id: string;
  cameraId: string;
  name: string;
  location?: string;
  kennelId?: string;
  rtspUrl: string;
  streamUrl?: string;
  snapshotUrl?: string;
  isOnline: boolean;
  lastSeen: Date;
  resolution?: string;
  fps?: number;
}

export interface CameraConfig {
  name: string;
  location?: string;
  kennelId?: string;
  rtspUrl: string;
  resolution?: string;
  fps?: number;
}

class CameraManager extends EventEmitter {
  private cameras: Map<string, Camera> = new Map();

  constructor() {
    super();
  }

  registerCamera(config: CameraConfig): Camera {
    const camera: Camera = {
      id: `cam_${Date.now()}`,
      cameraId: `camera_${Math.random().toString(36).slice(2, 8)}`,
      name: config.name,
      location: config.location,
      kennelId: config.kennelId,
      rtspUrl: config.rtspUrl,
      streamUrl: `/streams/${Date.now()}.m3u8`,
      snapshotUrl: `/snapshots/${Date.now()}.jpg`,
      isOnline: true,
      lastSeen: new Date(),
      resolution: config.resolution || '1920x1080',
      fps: config.fps || 30,
    };

    this.cameras.set(camera.cameraId, camera);
    console.log(`[Camera] Registered: ${camera.name} (${camera.cameraId})`);
    
    // Notify backend
    backendClient.sendCameraEvent({
      cameraId: camera.cameraId,
      eventType: 'registered',
      data: { name: camera.name, location: camera.location },
      timestamp: Date.now(),
      kennelId: camera.kennelId,
    });

    this.emit('registered', camera);
    return camera;
  }

  getCamera(cameraId: string): Camera | undefined {
    return this.cameras.get(cameraId);
  }

  getAllCameras(): Camera[] {
    return Array.from(this.cameras.values());
  }

  getCamerasByKennel(kennelId: string): Camera[] {
    return this.getAllCameras().filter(c => c.kennelId === kennelId);
  }

  updateStatus(cameraId: string, isOnline: boolean): void {
    const camera = this.cameras.get(cameraId);
    if (camera) {
      camera.isOnline = isOnline;
      camera.lastSeen = new Date();
      this.emit('statusUpdate', camera);
    }
  }

  removeCamera(cameraId: string): boolean {
    const deleted = this.cameras.delete(cameraId);
    if (deleted) {
      console.log(`[Camera] Removed: ${cameraId}`);
      this.emit('removed', cameraId);
    }
    return deleted;
  }

  // Get RTSP URL for a camera
  getRtspUrl(cameraId: string): string | undefined {
    return this.cameras.get(cameraId)?.rtspUrl;
  }
}

export const cameraManager = new CameraManager();
