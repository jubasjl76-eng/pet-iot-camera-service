/**
 * Camera Management — in-memory, backed by a JSON file so registrations survive
 * a restart (the plan's "registry persistence").
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { config } from "../config/index.js";
import { backendClient } from "../services/backendClient.js";

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

// ── pure serialization (unit tested) ──────────────────────────────────────
export function serializeRegistry(cameras: Camera[]): string {
  return JSON.stringify(
    cameras.map((c) => ({ ...c, lastSeen: c.lastSeen.toISOString() })),
    null,
    2,
  );
}

export function parseRegistry(json: string): Camera[] {
  const raw = JSON.parse(json) as Array<Record<string, unknown>>;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => typeof c.cameraId === "string" && typeof c.rtspUrl === "string")
    .map((c) => ({
      id: String(c.id ?? `cam_${Date.now()}`),
      cameraId: String(c.cameraId),
      name: String(c.name ?? c.cameraId),
      location: c.location as string | undefined,
      kennelId: c.kennelId as string | undefined,
      rtspUrl: String(c.rtspUrl),
      streamUrl: c.streamUrl as string | undefined,
      snapshotUrl: c.snapshotUrl as string | undefined,
      isOnline: Boolean(c.isOnline),
      lastSeen: new Date(String(c.lastSeen ?? new Date().toISOString())),
      resolution: c.resolution as string | undefined,
      fps: typeof c.fps === "number" ? c.fps : undefined,
    }));
}

class CameraManager extends EventEmitter {
  private cameras = new Map<string, Camera>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(config.cameraRegistryFile)) {
        for (const cam of parseRegistry(fs.readFileSync(config.cameraRegistryFile, "utf-8"))) {
          this.cameras.set(cam.cameraId, cam);
        }
        console.log(`[Camera] Loaded ${this.cameras.size} camera(s) from ${config.cameraRegistryFile}`);
      }
    } catch (e) {
      console.error("[Camera] Failed to load registry:", (e as Error).message);
    }
  }

  private persist(): void {
    if (this.saveTimer) return; // debounce a burst of mutations
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(config.cameraRegistryFile), { recursive: true });
        fs.writeFileSync(config.cameraRegistryFile, serializeRegistry(this.getAllCameras()));
      } catch (e) {
        console.error("[Camera] Failed to persist registry:", (e as Error).message);
      }
    }, 500);
  }

  registerCamera(cfg: CameraConfig): Camera {
    const camera: Camera = {
      id: `cam_${Date.now()}`,
      cameraId: `camera_${randomUUID().slice(0, 8)}`,
      name: cfg.name,
      location: cfg.location,
      kennelId: cfg.kennelId,
      rtspUrl: cfg.rtspUrl,
      streamUrl: `/streams/${Date.now()}.m3u8`,
      snapshotUrl: `/snapshots/${Date.now()}.jpg`,
      isOnline: true,
      lastSeen: new Date(),
      resolution: cfg.resolution || "1920x1080",
      fps: cfg.fps || 30,
    };

    this.cameras.set(camera.cameraId, camera);
    this.persist();
    console.log(`[Camera] Registered: ${camera.name} (${camera.cameraId})`);

    backendClient.sendCameraEvent({
      cameraId: camera.cameraId,
      eventType: "registered",
      data: { name: camera.name, location: camera.location },
      timestamp: Date.now(),
      kennelId: camera.kennelId,
    });

    this.emit("registered", camera);
    return camera;
  }

  getCamera(cameraId: string): Camera | undefined {
    return this.cameras.get(cameraId);
  }

  getAllCameras(): Camera[] {
    return Array.from(this.cameras.values());
  }

  getCamerasByKennel(kennelId: string): Camera[] {
    return this.getAllCameras().filter((c) => c.kennelId === kennelId);
  }

  updateStatus(cameraId: string, isOnline: boolean): void {
    const camera = this.cameras.get(cameraId);
    if (camera) {
      camera.isOnline = isOnline;
      camera.lastSeen = new Date();
      this.persist();
      this.emit("statusUpdate", camera);
    }
  }

  removeCamera(cameraId: string): boolean {
    const deleted = this.cameras.delete(cameraId);
    if (deleted) {
      this.persist();
      console.log(`[Camera] Removed: ${cameraId}`);
      this.emit("removed", cameraId);
    }
    return deleted;
  }

  getRtspUrl(cameraId: string): string | undefined {
    return this.cameras.get(cameraId)?.rtspUrl;
  }
}

export const cameraManager = new CameraManager();
