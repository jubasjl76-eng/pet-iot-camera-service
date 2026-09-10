/**
 * Typed config contract (hardening Phase 12, A8).
 *
 * ONE zod schema over process.env via @jubasjl76-eng/shared; a missing/invalid
 * var prints every problem and exits. The `config` object keeps its camelCase
 * domain shape + the resolved `iceServers` list so nothing else changed.
 */
import { loadConfig, z, envInt, envPort } from '@jubasjl76-eng/shared';

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

const schema = z.object({
  // public / build-time
  PORT: envPort().default(3006),
  STREAM_PORT: envPort().default(3007),

  // runtime non-secret
  MQTT_HOST: z.string().default('localhost'),
  MQTT_PORT: envPort().default(1883),
  MQTT_USERNAME: z.string().optional(),
  LOCAL_BACKEND_URL: z.string().url().optional(),
  CLOUD_BACKEND_URL: z.string().url().optional(),
  HLS_OUTPUT: z.string().default('./streams'),
  MOTION_THRESHOLD: envInt().default(30),
  MOTION_COOLDOWN: envInt().default(60),
  MOTION_ANALYZE: z.string().default('true').transform((v) => v !== 'false'),
  MOTION_SCENE: z.coerce.number().default(0.04),
  CAMERA_REGISTRY_FILE: z.string().default('./data/cameras.json'),
  HEALTH_CHECK_INTERVAL: envInt().default(60_000),
  AUDIO_SESSION_TTL: envInt().default(120_000),
  STUN_URL: z.string().default('stun:stun.l.google.com:19302'),
  TURN_URL: z.string().optional(),
  TURN_USER: z.string().optional(),

  // error tracking (Phase 15) — read raw in src/instrument.ts; in the schema so
  // boot still validates them. A DSN is not a secret.
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

  // observability (Phase 16) — /metrics is open unless this bearer token is set.
  METRICS_TOKEN: z.string().optional(),

  // secret (AWS Secrets Manager at runtime; SOPS+age for git-committed non-prod)
  MQTT_PASSWORD: z.string().optional(),
  TURN_PASS: z.string().optional(),
  API_KEY: z.string().default('smart-pet-api-key-2026'),
});

const env = loadConfig(schema, { name: 'camera' });

function iceServers(): IceServer[] {
  const list: IceServer[] = [{ urls: env.STUN_URL }];
  if (env.TURN_URL) {
    list.push({ urls: env.TURN_URL, username: env.TURN_USER, credential: env.TURN_PASS });
  }
  return list;
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
  motionThreshold: number;
  motionCooldown: number;
  motionAnalyze: boolean;
  motionScene: number;
  cameraRegistryFile: string;
  healthCheckInterval: number;
  audioSessionTtl: number;
  iceServers: IceServer[];
}

export const config: Config = {
  port: env.PORT,
  mqttHost: env.MQTT_HOST,
  mqttPort: env.MQTT_PORT,
  mqttUsername: env.MQTT_USERNAME,
  mqttPassword: env.MQTT_PASSWORD,
  localBackendUrl: env.LOCAL_BACKEND_URL,
  cloudBackendUrl: env.CLOUD_BACKEND_URL,
  apiKey: env.API_KEY,
  streamPort: env.STREAM_PORT,
  hlsOutputPath: env.HLS_OUTPUT,
  motionThreshold: env.MOTION_THRESHOLD,
  motionCooldown: env.MOTION_COOLDOWN,
  motionAnalyze: env.MOTION_ANALYZE,
  motionScene: env.MOTION_SCENE,
  cameraRegistryFile: env.CAMERA_REGISTRY_FILE,
  healthCheckInterval: env.HEALTH_CHECK_INTERVAL,
  audioSessionTtl: env.AUDIO_SESSION_TTL,
  iceServers: iceServers(),
};
