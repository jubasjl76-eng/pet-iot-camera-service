# Edge deployment

This service runs **at the kennel**, next to the cameras — RTSP is LAN-local, so
it is not in `smart-pet-terraform`. Put it on a Pi 4 / mini-PC on the same
network as the cameras.

## Image

CI publishes `ghcr.io/jubasjl76-eng/pet-iot-camera-service:<version>` on every
`v*` tag (`.github/workflows/release.yml`). The image includes `ffmpeg`.

## Run

```yaml
# compose.yml on the kennel box
services:
  camera:
    image: ghcr.io/jubasjl76-eng/pet-iot-camera-service:latest
    restart: unless-stopped
    ports:
      - "3006:3006"   # API
      - "3007:3007"   # HLS
    volumes:
      - ./data:/app/data        # camera registry (survives restarts)
      - ./streams:/app/streams  # HLS segments
    environment:
      MQTT_HOST: mqtt.smartpet.example      # the cloud broker NLB
      MQTT_PORT: "1883"
      CLOUD_BACKEND_URL: https://api.smartpet.example/api
      API_KEY: <the sensors/camera edge key>
      MOTION_ANALYZE: "true"                # ffmpeg scene-change per camera
      MOTION_SCENE: "0.04"                  # 0..1, lower = more sensitive
      TURN_URL: turn:turn.smartpet.example:3478   # optional
      TURN_USER: <user>
      TURN_PASS: <pass>
```

```bash
docker compose up -d
curl localhost:3006/api/cameras
```

## Register a camera

```bash
curl -X POST localhost:3006/api/cameras \
  -H 'content-type: application/json' \
  -d '{"name":"Yard","kennelId":"home","rtspUrl":"rtsp://user:pass@10.0.0.5:554/stream1"}'
```

Registrations are written to `data/cameras.json` and reloaded on restart; the
scene-change analyzer starts automatically for each camera.

## TURN (for two-way audio/video behind NAT)

The camera service only relays WebRTC **signalling**; media is peer-to-peer. When
both peers are behind NAT you need a TURN relay. Run `coturn` once (a small cloud
VM with a public IP, UDP/TCP 3478 + a UDP media range), then set `TURN_URL` /
`TURN_USER` / `TURN_PASS`. The app reads them from
`GET /api/ice-servers` and from the `iceServers` field of a new audio session.

```bash
# minimal coturn
docker run -d --net=host coturn/coturn \
  -n --realm=smartpet.example --no-cli \
  --user=smartpet:$(openssl rand -hex 16) \
  --min-port=49160 --max-port=49200
```
