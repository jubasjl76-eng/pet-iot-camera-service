# Pet IoT Camera Service

Manages IP cameras installed in kennels and pet owner environments.

## Architecture Role

```
Cameras → MQTT → Camera Service → Backend API → PostgreSQL
```

This service manages cameras and forwards events to the backend API. It does NOT store data directly in databases.

## Features

- 📹 RTSP stream proxy to HLS
- 🔴 Motion detection events
- ❤️ Camera health monitoring
- 📸 Snapshot API
- 🔄 MQTT integration
- ☁️ Sends data to backend API (not direct database)

## Technology Stack

- Node.js + TypeScript
- FFmpeg for video processing
- MQTT Client

## MQTT Topics

### Subscribe
```
kennel/{kennelId}/camera/{deviceId}/status
kennel/{kennelId}/camera/{deviceId}/motion
kennel/{kennelId}/camera/{deviceId}/command
```

### Publish
```
kennel/{kennelId}/camera/{deviceId}/status
kennel/{kennelId}/camera/{deviceId}/event
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Service port | 3006 |
| MQTT_HOST | MQTT broker | localhost |
| MQTT_PORT | MQTT port | 1883 |
| LOCAL_BACKEND_URL | Local backend URL | http://localhost:3000 |
| CLOUD_BACKEND_URL | Cloud backend URL | - |
| HLS_OUTPUT | HLS output path | ./streams |
| MOTION_THRESHOLD | Motion detection threshold | 30 |
| MOTION_COOLDOWN | Motion cooldown (seconds) | 60 |

## Quick Start

### Docker

```bash
docker-compose up -d
```

### Local Development

```bash
npm install
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/cameras | List cameras |
| POST | /api/cameras | Register camera |
| GET | /api/cameras/:id | Camera details |
| GET | /api/cameras/:id/stream | Get stream URL |
| POST | /api/cameras/:id/stream/start | Start streaming |
| POST | /api/cameras/:id/stream/stop | Stop streaming |
| GET | /api/cameras/:id/snapshot | Get snapshot |
| GET | /api/cameras/:id/health | Camera health |
| GET | /health | Service health |

## Example: Register Camera

```bash
curl -X POST http://localhost:3006/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Front Door Camera",
    "location": "Kennel Entrance",
    "kennelId": "kennel-01",
    "rtspUrl": "rtsp://192.168.1.100:554/stream"
  }'
```

## Integration

This service communicates with:
- **MQTT Broker**: Receives camera events, sends commands
- **Backend API**: Sends camera data via `POST /api/devices/ingest`

## License

MIT
