/**
 * Backend Client for Edge/Cloud Communication
 */

import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';

const BACKEND_URL = process.env.LOCAL_BACKEND_URL || process.env.CLOUD_BACKEND_URL || 'http://localhost:3000/api';
const OFFLINE_QUEUE_FILE = process.env.OFFLINE_QUEUE_FILE || './data/camera-offline-queue.json';

interface CameraEvent {
  cameraId: string;
  eventType: string;
  data: any;
  timestamp: number;
  kennelId?: string;
}

class BackendClient {
  private client: AxiosInstance;
  private online: boolean = true;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: BACKEND_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.API_KEY || 'smart-pet-api-key-2026',
      },
    });

    setInterval(() => this.checkConnectivity(), 30000);
    this.startSyncWorker();
  }

  private async checkConnectivity(): Promise<void> {
    try {
      await this.client.get('/health');
      if (!this.online) {
        console.log('[Backend] Connection restored!');
        this.online = true;
        this.syncQueue();
      }
    } catch {
      if (this.online) {
        console.log('[Backend] Offline - queueing events');
        this.online = false;
      }
    }
  }

  async sendCameraEvent(event: CameraEvent): Promise<boolean> {
    try {
      await this.client.post('/devices/ingest', {
        deviceId: event.cameraId,
        deviceType: 'camera',
        eventType: event.eventType,
        value: event.data,
        timestamp: event.timestamp,
        kennelId: event.kennelId,
      });
      return true;
    } catch {
      this.queueOffline(event);
      return false;
    }
  }

  private queueOffline(event: CameraEvent): void {
    const queue = this.getOfflineQueue();
    queue.push(event);
    if (queue.length > 500) queue.shift();
    this.saveOfflineQueue(queue);
  }

  private getOfflineQueue(): CameraEvent[] {
    try {
      if (fs.existsSync(OFFLINE_QUEUE_FILE)) {
        return JSON.parse(fs.readFileSync(OFFLINE_QUEUE_FILE, 'utf-8'));
      }
    } catch {}
    return [];
  }

  private saveOfflineQueue(queue: CameraEvent[]): void {
    try {
      const dir = path.dirname(OFFLINE_QUEUE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(OFFLINE_QUEUE_FILE, JSON.stringify(queue));
    } catch {}
  }

  async syncQueue(): Promise<void> {
    if (!this.online) return;
    const queue = this.getOfflineQueue();
    if (queue.length === 0) return;

    const synced: number[] = [];
    for (let i = 0; i < queue.length; i++) {
      try {
        await this.client.post('/devices/ingest', queue[i]);
        synced.push(i);
      } catch { break; }
    }

    if (synced.length > 0) {
      const remaining = queue.filter((_, i) => !synced.includes(i));
      this.saveOfflineQueue(remaining);
      console.log(`[Backend] Synced ${synced.length} camera events`);
    }
  }

  private startSyncWorker(): void {
    this.syncInterval = setInterval(() => {
      if (this.online) this.syncQueue();
    }, 30000);
  }

  isOnline(): boolean { return this.online; }
  getBackendUrl(): string { return BACKEND_URL; }
  stop(): void { if (this.syncInterval) clearInterval(this.syncInterval); }
}

export const backendClient = new BackendClient();
