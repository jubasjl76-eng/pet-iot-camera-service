/**
 * MQTT Client for Camera Service
 * Handles camera events and commands via MQTT
 */

import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { EventEmitter } from 'events';
import { config } from '../config/index.js';
import { cameraManager } from '../cameras/index.js';
import { motionDetection } from '../motion/index.js';
import { audioRelay, type AudioSignal } from '../audio/index.js';

export class MQTTCameraClient extends EventEmitter {
  private client: MqttClient | null = null;

  constructor() {
    super();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `mqtt://${config.mqttHost}:${config.mqttPort}`;
      
      const options: IClientOptions = {
        clientId: `camera-service-${Math.random().toString(16).slice(2, 10)}`,
        clean: false,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
      };

      if (config.mqttUsername && config.mqttPassword) {
        options.username = config.mqttUsername;
        options.password = config.mqttPassword;
      }

      console.log(`[MQTT] Connecting to ${url}...`);
      
      this.client = mqtt.connect(url, options);

      this.client.on('connect', () => {
        console.log('[MQTT] Connected successfully');
        this.subscribeToTopics();
        resolve();
      });

      this.client.on('error', (error) => {
        console.error('[MQTT] Connection error:', error.message);
        reject(error);
      });

      this.client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
      });

      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });
    });
  }

  private subscribeToTopics(): void {
    if (!this.client) return;

    // Subscribe to camera topics
    const topics = [
      'kennel/+/camera/+/status',
      'kennel/+/camera/+/motion',
      'kennel/+/camera/+/command',
      'kennel/+/camera/+/audio',
    ];

    topics.forEach(topic => {
      this.client?.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[MQTT] Subscribe error for ${topic}:`, err);
        } else {
          console.log(`[MQTT] Subscribed to ${topic}`);
        }
      });
    });
  }

  private handleMessage(topic: string, message: Buffer): void {
    try {
      const payload = JSON.parse(message.toString());
      const topicParts = topic.split('/');
      
      // Topic: kennel/{kennelId}/camera/{cameraId}/{type}
      const [, kennelId, , cameraId, type] = topicParts;
      
      console.log(`[MQTT] Camera message on ${topic}:`, payload);

      if (type === 'status') {
        // Update camera status
        cameraManager.updateStatus(cameraId, payload.online ?? (payload.status ?? 'online') !== 'offline');
      } else if (type === 'motion') {
        // Process motion event
        motionDetection.processMotion(cameraId, payload.intensity || 50);
      } else if (type === 'command') {
        // Handle command
        this.emit('command', { cameraId, kennelId, command: payload });
      } else if (type === 'audio') {
        // Signalling from the camera device → relay to the waiting app.
        const sessionId: string | undefined = payload.session || payload.sessionId;
        const signal: AudioSignal | undefined = payload.signal;
        if (sessionId && signal) {
          audioRelay.relay(sessionId, 'camera', signal);
          this.emit('audioSignal', { cameraId, kennelId, sessionId, signal });
        }
      }
      
    } catch (error) {
      console.error('[MQTT] Failed to parse message:', error);
    }
  }

  /**
   * Publish camera event to MQTT
   */
  publishEvent(kennelId: string, cameraId: string, eventType: string, data: any): void {
    if (!this.client || !this.client.connected) {
      console.log('[MQTT] Client not connected');
      return;
    }

    const topic = `kennel/${kennelId}/camera/${cameraId}/${eventType}`;
    this.client.publish(topic, JSON.stringify(data), { qos: 1 });
    console.log(`[MQTT] Published to ${topic}`);
  }

  /**
   * Send a two-way-audio signal to a camera device
   * (kennel/{kennelId}/camera/{cameraId}/audio).
   */
  publishAudio(kennelId: string, cameraId: string, session: string, signal: AudioSignal): void {
    if (!this.client || !this.client.connected) {
      console.log('[MQTT] Client not connected — audio signal dropped');
      return;
    }
    const topic = `kennel/${kennelId}/camera/${cameraId}/audio`;
    this.client.publish(topic, JSON.stringify({
      deviceId: cameraId, kennelId, timestamp: Date.now(), session, signal,
    }), { qos: 1 });
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  disconnect(): void {
    this.client?.end();
    this.client = null;
  }
}

export const mqttCameraClient = new MQTTCameraClient();
