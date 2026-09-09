import { describe, it, expect } from "vitest";
import { parseSceneScore, ffmpegSceneArgs } from "../motion/sceneScore.js";
import { serializeRegistry, parseRegistry, type Camera } from "../cameras/index.js";

describe("parseSceneScore", () => {
  it("pulls the float out of an ffmpeg metadata line", () => {
    expect(parseSceneScore("[Parsed_metadata_1 @ 0x55] lavfi.scene_score=0.041234")).toBeCloseTo(0.041234);
    expect(parseSceneScore("frame:  12 lavfi.scene_score=1.000000")).toBe(1);
  });
  it("null on lines without a score", () => {
    expect(parseSceneScore("frame=  10 fps=25 q=-1.0 size=N/A time=00:00:00.40")).toBeNull();
    expect(parseSceneScore("")).toBeNull();
  });
});

describe("ffmpegSceneArgs", () => {
  it("builds a scene-detect + null-mux arg list", () => {
    const a = ffmpegSceneArgs("rtsp://cam/1", 0.04);
    expect(a).toContain("rtsp://cam/1");
    expect(a.join(" ")).toContain("select='gt(scene,0.04)',metadata=print");
    expect(a.slice(-3)).toEqual(["-f", "null", "-"]);
  });
});

describe("camera registry serialization", () => {
  const cams: Camera[] = [
    {
      id: "cam_1", cameraId: "camera_abc", name: "Yard", location: "north",
      kennelId: "home", rtspUrl: "rtsp://10.0.0.5/stream", isOnline: true,
      lastSeen: new Date("2026-09-09T10:00:00.000Z"), resolution: "1920x1080", fps: 30,
    },
  ];
  it("round-trips through JSON, keeping cameraId + rtspUrl and a real Date", () => {
    const back = parseRegistry(serializeRegistry(cams));
    expect(back).toHaveLength(1);
    expect(back[0].cameraId).toBe("camera_abc");
    expect(back[0].rtspUrl).toBe("rtsp://10.0.0.5/stream");
    expect(back[0].lastSeen instanceof Date).toBe(true);
    expect(back[0].lastSeen.toISOString()).toBe("2026-09-09T10:00:00.000Z");
  });
  it("drops rows missing cameraId or rtspUrl", () => {
    expect(parseRegistry('[{"name":"x"},{"cameraId":"c","rtspUrl":"rtsp://y"}]')).toHaveLength(1);
  });
  it("tolerates junk", () => {
    expect(parseRegistry("{}")).toEqual([]);
  });
});
