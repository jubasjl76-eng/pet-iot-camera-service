/**
 * Real motion detection: one ffmpeg process per camera doing scene-change
 * analysis on the RTSP stream. Each detected scene cut feeds
 * motionDetection.processMotion() (which still applies threshold + cooldown).
 *
 * Degrades safely: if ffmpeg is missing or the stream is unreachable the process
 * exits, we log, and retry with backoff. Disabled entirely with
 * MOTION_ANALYZE=false.
 */
import { spawn, ChildProcess } from "child_process";
import { config } from "../config/index.js";
import { motionDetection } from "./index.js";
import { parseSceneScore, ffmpegSceneArgs } from "./sceneScore.js";
import type { Camera } from "../cameras/index.js";

interface Running {
  proc: ChildProcess;
  retryMs: number;
  timer?: NodeJS.Timeout;
  stopped: boolean;
}

class MotionAnalyzer {
  private running = new Map<string, Running>();

  start(camera: Camera): void {
    if (!config.motionAnalyze) return;
    if (this.running.has(camera.cameraId)) return;
    if (!camera.rtspUrl) return;
    this.spawnFor(camera);
  }

  stop(cameraId: string): void {
    const r = this.running.get(cameraId);
    if (!r) return;
    r.stopped = true;
    if (r.timer) clearTimeout(r.timer);
    r.proc.kill("SIGKILL");
    this.running.delete(cameraId);
  }

  stopAll(): void {
    for (const id of [...this.running.keys()]) this.stop(id);
  }

  private spawnFor(camera: Camera): void {
    const args = ffmpegSceneArgs(camera.rtspUrl, config.motionScene);
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const entry: Running = { proc, retryMs: 2000, stopped: false };
    this.running.set(camera.cameraId, entry);

    let buf = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const score = parseSceneScore(line);
        if (score !== null) {
          // scene_score is 0..1; processMotion expects an intensity ~0..100
          void motionDetection.processMotion(camera.cameraId, Math.round(score * 100));
        }
      }
    });

    const onEnd = (why: string) => {
      if (entry.stopped) return;
      console.warn(`[MotionAnalyzer] ${camera.cameraId} ffmpeg ended (${why}); retry in ${entry.retryMs}ms`);
      entry.timer = setTimeout(() => {
        this.running.delete(camera.cameraId);
        this.spawnFor({ ...camera });
      }, entry.retryMs);
      entry.retryMs = Math.min(entry.retryMs * 2, 60_000);
    };
    proc.on("exit", (code) => onEnd(`code ${code}`));
    proc.on("error", (err) => onEnd(err.message));
  }
}

export const motionAnalyzer = new MotionAnalyzer();
