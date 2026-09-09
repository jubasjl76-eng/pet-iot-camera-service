/**
 * Parse `lavfi.scene_score=<float>` out of ffmpeg's `metadata=print` stderr.
 * Pure — unit tested.
 *
 * ffmpeg -i <rtsp> -vf "select='gt(scene,0)',metadata=print" -f null -
 *   ...
 *   [Parsed_metadata_1 @ 0x..] lavfi.scene_score=0.041234
 */
export function parseSceneScore(line: string): number | null {
  const m = line.match(/lavfi\.scene_score=([0-9]*\.?[0-9]+)/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/** ffmpeg args for scene-change detection on an RTSP source. */
export function ffmpegSceneArgs(rtspUrl: string, threshold: number): string[] {
  return [
    "-loglevel", "info",
    "-rtsp_transport", "tcp",
    "-i", rtspUrl,
    "-an",
    "-vf", `select='gt(scene,${threshold})',metadata=print`,
    "-f", "null",
    "-",
  ];
}
