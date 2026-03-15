/**
 * Stream Manager
 * Handles RTSP to HLS conversion and streaming
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';
import { cameraManager } from '../cameras/index.js';

interface StreamSession {
  cameraId: string;
  process: ChildProcess;
  startedAt: Date;
  hlsPath: string;
}

class StreamManager {
  private streams: Map<string, StreamSession> = new Map();
  private outputPath: string;

  constructor() {
    this.outputPath = config.hlsOutputPath;
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }
  }

  /**
   * Start streaming a camera to HLS
   */
  startStream(cameraId: string): string | null {
    const camera = cameraManager.getCamera(cameraId);
    if (!camera) {
      console.error(`[Stream] Camera not found: ${cameraId}`);
      return null;
    }

    if (this.streams.has(cameraId)) {
      console.log(`[Stream] Already streaming: ${cameraId}`);
      return this.getStreamUrl(cameraId);
    }

    const hlsPath = path.join(this.outputPath, `${cameraId}`);
    
    // FFmpeg command for RTSP to HLS
    const ffmpeg = spawn('ffmpeg', [
      '-i', camera.rtspUrl,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-b:v', '1000k',
      '-maxrate', '1500k',
      '-bufsize', '2000k',
      '-g', '30',
      '-hls_time', '2',
      '-hls_list_size', '5',
      '-hls_flags', 'delete_segments',
      '-hls_segment_filename', `${hlsPath}/segment%03d.ts`,
      '-f', 'hls',
      `${hlsPath}/index.m3u8`,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg outputs to stderr
    });

    ffmpeg.on('error', (err) => {
      console.error(`[Stream] FFmpeg error for ${cameraId}:`, err.message);
      this.stopStream(cameraId);
    });

    ffmpeg.on('exit', (code) => {
      console.log(`[Stream] FFmpeg exited for ${cameraId}: code ${code}`);
      this.streams.delete(cameraId);
    });

    // Ensure directory exists
    if (!fs.existsSync(hlsPath)) {
      fs.mkdirSync(hlsPath, { recursive: true });
    }

    this.streams.set(cameraId, {
      cameraId,
      process: ffmpeg,
      startedAt: new Date(),
      hlsPath,
    });

    console.log(`[Stream] Started streaming: ${cameraId}`);
    return this.getStreamUrl(cameraId);
  }

  /**
   * Stop streaming a camera
   */
  stopStream(cameraId: string): void {
    const stream = this.streams.get(cameraId);
    if (stream) {
      stream.process.kill('SIGTERM');
      this.streams.delete(cameraId);
      console.log(`[Stream] Stopped streaming: ${cameraId}`);
    }
  }

  /**
   * Get HLS stream URL
   */
  getStreamUrl(cameraId: string): string | null {
    const stream = this.streams.get(cameraId);
    if (!stream) return null;
    return `/streams/${cameraId}/index.m3u8`;
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): string[] {
    return Array.from(this.streams.keys());
  }

  /**
   * Check if camera is streaming
   */
  isStreaming(cameraId: string): boolean {
    return this.streams.has(cameraId);
  }

  /**
   * Stop all streams
   */
  stopAll(): void {
    for (const cameraId of this.streams.keys()) {
      this.stopStream(cameraId);
    }
  }
}

export const streamManager = new StreamManager();
