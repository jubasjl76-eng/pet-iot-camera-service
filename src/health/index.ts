/**
 * Camera Health Monitoring
 */

import { EventEmitter } from 'events';
import { config } from '../config/index.js';
import { backendClient } from '../services/backendClient.ts';
import { cameraManager } from '../cameras/index.js';

export interface CameraHealth {
  cameraId: string;
  isOnline: boolean;
  uptime: number;
  streamActive: boolean;
  lastHealthCheck: Date;
  issues: string[];
}

class HealthMonitor extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private healthStatus: Map<string, CameraHealth> = new Map();

  constructor() {
    super();
  }

  /**
   * Start health monitoring
   */
  start(): void {
    console.log('[Health] Starting health monitor...');
    this.interval = setInterval(() => {
      this.checkAllCameras();
    }, config.healthCheckInterval);
    
    // Initial check
    this.checkAllCameras();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Check health of all cameras
   */
  private async checkAllCameras(): Promise<void> {
    const cameras = cameraManager.getAllCameras();

    for (const camera of cameras) {
      await this.checkCamera(camera);
    }
  }

  /**
   * Check individual camera health
   */
  private async checkCamera(camera: any): Promise<void> {
    const issues: string[] = [];
    let isOnline = true;

    // Check if camera is reachable (simplified - in production use actual ping/curl)
    const timeSinceLastSeen = Date.now() - camera.lastSeen.getTime();
    if (timeSinceLastSeen > 120000) { // 2 minutes
      isOnline = false;
      issues.push('No response from camera');
      cameraManager.updateStatus(camera.cameraId, false);
    }

    const health: CameraHealth = {
      cameraId: camera.cameraId,
      isOnline,
      uptime: isOnline ? 99.9 : 0,
      streamActive: true, // Would check actual stream
      lastHealthCheck: new Date(),
      issues,
    };

    this.healthStatus.set(camera.cameraId, health);

    // Send health to backend
    await backendClient.sendCameraEvent({
      cameraId: camera.cameraId,
      eventType: 'health_status',
      data: health,
      timestamp: Date.now(),
      kennelId: camera.kennelId,
    });

    if (issues.length > 0) {
      console.log(`[Health] Camera ${camera.cameraId} issues:`, issues);
    }
  }

  /**
   * Get health status for a camera
   */
  getHealth(cameraId: string): CameraHealth | undefined {
    return this.healthStatus.get(cameraId);
  }

  /**
   * Get all health statuses
   */
  getAllHealth(): CameraHealth[] {
    return Array.from(this.healthStatus.values());
  }
}

export const healthMonitor = new HealthMonitor();
