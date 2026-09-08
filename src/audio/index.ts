/**
 * Two-way audio — "talk to your dog".
 *
 * This service is a signalling relay between the pet-owner app and the camera
 * device. Media itself is peer-to-peer WebRTC (or a direct RTSP-back-channel);
 * this only shuttles the small control messages:
 *
 *   app  ──HTTP──▶  camera-service  ──MQTT kennel/{k}/camera/{id}/audio──▶  camera
 *   camera ──MQTT audio──▶  camera-service  ──HTTP poll──▶  app
 *
 * Signals: offer | answer | ice | talk(start|end) | play(url) | stop
 * Sessions are in-memory and expire after `ttlMs` of inactivity.
 */
import { randomUUID } from 'crypto';

export type AudioSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: string }
  | { kind: 'talk'; state: 'start' | 'end' }
  | { kind: 'play'; url: string; loop?: boolean }
  | { kind: 'stop' };

export type Party = 'app' | 'camera';

interface Session {
  id: string;
  cameraId: string;
  kennelId: string;
  createdAt: number;
  lastActivity: number;
  /** queued signals waiting to be polled by each party */
  toApp: Array<{ at: number; signal: AudioSignal }>;
  toCamera: Array<{ at: number; signal: AudioSignal }>;
}

export type AudioPublisher = (
  kennelId: string,
  cameraId: string,
  sessionId: string,
  signal: AudioSignal
) => void;

export class AudioRelay {
  private sessions = new Map<string, Session>();
  private publish: AudioPublisher | null = null;
  private ttlMs: number;
  private sweep: NodeJS.Timeout;

  constructor(ttlMs = 120_000) {
    this.ttlMs = ttlMs;
    this.sweep = setInterval(() => this.expire(), 30_000);
    if (this.sweep.unref) this.sweep.unref();
  }

  setPublisher(fn: AudioPublisher): void {
    this.publish = fn;
  }

  createSession(cameraId: string, kennelId: string): Session {
    const s: Session = {
      id: randomUUID(),
      cameraId,
      kennelId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      toApp: [],
      toCamera: [],
    };
    this.sessions.set(s.id, s);
    return s;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  list(cameraId?: string): Array<Omit<Session, 'toApp' | 'toCamera'> & { queued: { app: number; camera: number } }> {
    return [...this.sessions.values()]
      .filter((s) => !cameraId || s.cameraId === cameraId)
      .map(({ toApp, toCamera, ...rest }) => ({ ...rest, queued: { app: toApp.length, camera: toCamera.length } }));
  }

  /**
   * A signal arrived from `from`. Route it to the other party:
   *  - from 'app'    → publish to the camera over MQTT (and queue for camera poll)
   *  - from 'camera' → queue for the app to poll
   */
  relay(sessionId: string, from: Party, signal: AudioSignal): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.lastActivity = Date.now();

    if (from === 'app') {
      s.toCamera.push({ at: Date.now(), signal });
      if (this.publish) this.publish(s.kennelId, s.cameraId, s.id, signal);
    } else {
      s.toApp.push({ at: Date.now(), signal });
    }
    if (signal.kind === 'stop') this.end(sessionId);
    return true;
  }

  /** Drain and return everything queued for `party`. */
  poll(sessionId: string, party: Party): AudioSignal[] | null {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    s.lastActivity = Date.now();
    const q = party === 'app' ? s.toApp : s.toCamera;
    const out = q.map((e) => e.signal);
    q.length = 0;
    return out;
  }

  end(sessionId: string): boolean {
    const s = this.sessions.get(sessionId);
    if (s && this.publish) this.publish(s.kennelId, s.cameraId, sessionId, { kind: 'stop' });
    return this.sessions.delete(sessionId);
  }

  private expire(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastActivity > this.ttlMs) this.sessions.delete(id);
    }
  }

  stop(): void {
    clearInterval(this.sweep);
    this.sessions.clear();
  }
}

export const audioRelay = new AudioRelay(Number(process.env.AUDIO_SESSION_TTL) || 120_000);
