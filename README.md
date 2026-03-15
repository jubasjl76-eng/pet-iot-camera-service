# Pet IoT Camera Service

Manages IP cameras installed in kennels and pet owner environments.

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
- MQTT client

## Supported Protocols

- RTSP (input)
- HLS (output)

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

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Service port | 3006 |
| MQTT_HOST | MQTT broker | localhost |
| HLS_OUTPUT | HLS output path | ./streams |
| MOTION_THRESHOLD | Motion detection threshold | 30 |
| LOCAL_BACKEND_URL | Local backend URL | - |
| CLOUD_BACKEND_URL | Cloud backend URL | - |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/cameras | List cameras |
| POST | /api/cameras | Register camera |
| GET | /api/cameras/:id | Camera details |
| DELETE | /api/cameras/:id | Remove camera |
| GET | /api/cameras/:id/stream | Get stream URL |
| POST | /api/cameras/:id/stream/start | Start streaming |
| POST | /api/cameras/:id/stream/stop | Stop streaming |
| GET | /api/cameras/:id/snapshot | Get snapshot |
| GET | /api/cameras/:id/health | Camera health |

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

## MQTT Topics

```
kennel/{kennelId}/camera/{cameraId}/motion
kennel/{kennelId}/camera/{cameraId}/status
```

## Architecture

```
Cameras (RTSP) → Camera Service → Backend API → Cloud
                     ↓
               HLS Streams
                     ↓
               Dashboard/App
```

## License

MIT
