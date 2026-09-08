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
- 🗣️ **Two-way audio** — "talk to your dog": WebRTC signalling relay between the
  pet-owner app and the camera, plus push-to-talk and canned-clip playback
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
kennel/{kennelId}/camera/{deviceId}/audio      ← two-way audio signalling (from device)
```

### Publish
```
kennel/{kennelId}/camera/{deviceId}/status
kennel/{kennelId}/camera/{deviceId}/event
kennel/{kennelId}/camera/{deviceId}/audio      ← two-way audio signalling (to device)
```

## Two-way audio API

Media is peer-to-peer WebRTC; the service only shuttles the small control
messages (`offer` / `answer` / `ice` / `talk` / `play` / `stop`). The app opens a
session, POSTs its signals, and polls for the camera's replies. The camera side
receives signals over MQTT `…/audio` (or `GET …/poll-camera` if it can't do MQTT).

| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/cameras/:id/audio/session` | → `{ sessionId }` |
| GET | `/api/cameras/:id/audio/sessions` | list active |
| POST | `/api/cameras/:id/audio/signal` | `{ sessionId, signal:{kind:"offer"\|"answer"\|"ice", …} }` |
| GET | `/api/cameras/:id/audio/session/:sid/poll` | → `{ signals: [...] }` queued for the app |
| GET | `/api/cameras/:id/audio/session/:sid/poll-camera` | → queued for the camera |
| POST | `/api/cameras/:id/audio/talk` | `{ sessionId, state:"start"\|"end" }` |
| POST | `/api/cameras/:id/audio/play` | `{ sessionId, url, loop? }` |
| DELETE | `/api/cameras/:id/audio/session/:sid` | end |

Sessions are in-memory and expire after `AUDIO_SESSION_TTL` ms of inactivity.

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
| AUDIO_SESSION_TTL | Two-way-audio session idle TTL (ms) | 120000 |

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
