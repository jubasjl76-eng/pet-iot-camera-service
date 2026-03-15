/**
 * Motion Detection Service
 */

import { EventEmitter } from 'events';
import { config } from '../config/index.js';
import { backendClient } from '../services/backendClient.js';
import { cameraManager, Camera } from '../cameras/index.js';

export interface MotionEvent {
  cameraId: string;
  timestamp: number;
  intensity: number;
  region?: string;
}

class MotionDetection extends EventEmitter {
  private lastMotion: Map<string, number> = new Map();
  private cooldown: number;

  constructor() {
    super();
    this.cooldown = config.motionCooldown;
  }

  /**
   * Process a motion detection event from camera
   */
  async processMotion(cameraId: string, intensity: number): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastMotion.get(cameraId) || 0;

    // Cooldown check
    if (now - lastTime < this.cooldown * 1000) {
      return;
    }

    if (intensity < config.motionThreshold) {
      return;
    }

    this.lastMotion.set(cameraId, now);

    const motionEvent: MotionEvent = {
      cameraId,
      timestamp: now,
      intensity,
    };

    console.log(`[Motion] Detected on ${cameraId}: intensity ${intensity}`);

    // Emit event
    this.emit('motion', motionEvent);

    // Send to backend
    const camera = cameraManager.getCamera(cameraId);
    await backendClient.sendCameraEvent({
      cameraId,
      eventType: 'motion_detected',
      data: { intensity, timestamp: now },
      timestamp: now,
      kennelId: camera?.kennelId,
    });
  }

  /**
   * Simulate motion detection (for testing)
   */
  simulateMotion(cameraId: string): void {
    const intensity = Math.floor(Math.random() * 100);
    this.processMotion(cameraId, intensity);
  }

  /**
   * Reset cooldown for a camera
   */
  resetCooldown(cameraId: string): void {
    this.lastMotion.delete(cameraId);
  }

  /**
   * Get time since last motion
   */
  getTimeSinceLastMotion(cameraId: string): number {
    const lastTime = this.lastMotion.get(cameraId);
    if (!lastTime) return -1;
    return Date.now() - lastTime;
  }
}

export const motionDetection = new MotionDetection();
