// Configuration

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

export interface Config {
  port: number;

  mqttHost: string;
  mqttPort: number;
  mqttUsername?: string;
  mqttPassword?: string;

  localBackendUrl?: string;
  cloudBackendUrl?: string;
  apiKey: string;

  streamPort: number;
  hlsOutputPath: string;

  // Motion detection
  motionThreshold: number;
  motionCooldown: number;
  motionAnalyze: boolean; // run the ffmpeg scene-change analyzer
  motionScene: number; // ffmpeg scene-change threshold 0..1

  // Camera registry (survives a restart)
  cameraRegistryFile: string;

  healthCheckInterval: number;

  // Two-way audio
  audioSessionTtl: number;
  iceServers: IceServer[]; // STUN + optional TURN, handed to the app
}

const int = (v: string | undefined, d: number) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : d;
};
const flt = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function iceServers(): IceServer[] {
  const list: IceServer[] = [
    { urls: process.env.STUN_URL || "stun:stun.l.google.com:19302" },
  ];
  if (process.env.TURN_URL) {
    list.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USER,
      credential: process.env.TURN_PASS,
    });
  }
  return list;
}

export const config: Config = {
  port: int(process.env.PORT, 3006),

  mqttHost: process.env.MQTT_HOST || "localhost",
  mqttPort: int(process.env.MQTT_PORT, 1883),
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,

  localBackendUrl: process.env.LOCAL_BACKEND_URL,
  cloudBackendUrl: process.env.CLOUD_BACKEND_URL,
  apiKey: process.env.API_KEY || "smart-pet-api-key-2026",

  streamPort: int(process.env.STREAM_PORT, 3007),
  hlsOutputPath: process.env.HLS_OUTPUT || "./streams",

  motionThreshold: int(process.env.MOTION_THRESHOLD, 30),
  motionCooldown: int(process.env.MOTION_COOLDOWN, 60),
  motionAnalyze: process.env.MOTION_ANALYZE !== "false",
  motionScene: flt(process.env.MOTION_SCENE, 0.04),

  cameraRegistryFile: process.env.CAMERA_REGISTRY_FILE || "./data/cameras.json",

  healthCheckInterval: int(process.env.HEALTH_CHECK_INTERVAL, 60000),

  audioSessionTtl: int(process.env.AUDIO_SESSION_TTL, 120000),
  iceServers: iceServers(),
};
