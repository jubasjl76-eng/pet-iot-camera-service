// Configuration
export interface Config {
  // Service
  port: number;
  
  // MQTT
  mqttHost: string;
  mqttPort: number;
  mqttUsername?: string;
  mqttPassword?: string;
  
  // Backend URLs
  localBackendUrl?: string;
  cloudBackendUrl?: string;
  
  // API
  apiKey: string;
  
  // Streaming
  streamPort: number;
  hlsOutputPath: string;
  
  // Motion detection
  motionThreshold: number;
  motionCooldown: number;
  
  // Health check
  healthCheckInterval: number;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3006'),
  
  mqttHost: process.env.MQTT_HOST || 'localhost',
  mqttPort: parseInt(process.env.MQTT_PORT || '1883'),
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  
  localBackendUrl: process.env.LOCAL_BACKEND_URL,
  cloudBackendUrl: process.env.CLOUD_BACKEND_URL,
  
  apiKey: process.env.API_KEY || 'smart-pet-api-key-2026',
  
  streamPort: parseInt(process.env.STREAM_PORT || '3007'),
  hlsOutputPath: process.env.HLS_OUTPUT || './streams',
  
  motionThreshold: parseInt(process.env.MOTION_THRESHOLD || '30'),
  motionCooldown: parseInt(process.env.MOTION_COOLDOWN || '60'),
  
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000'),
};
