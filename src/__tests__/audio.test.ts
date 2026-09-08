import { describe, it, expect, vi } from 'vitest';
import { AudioRelay, type AudioSignal } from '../audio/index.js';

describe('AudioRelay', () => {
  it('creates a session and lists it', () => {
    const r = new AudioRelay();
    const s = r.createSession('cam-1', 'home');
    expect(s.id).toBeTruthy();
    expect(r.list('cam-1')).toHaveLength(1);
    expect(r.list('cam-2')).toHaveLength(0);
    r.stop();
  });

  it('app→camera signals are published and queued; camera→app are queued for poll', () => {
    const published: Array<{ cameraId: string; session: string; signal: AudioSignal }> = [];
    const r = new AudioRelay();
    r.setPublisher((_k, cameraId, session, signal) => published.push({ cameraId, session, signal }));

    const s = r.createSession('cam-1', 'home');

    // app sends an offer
    expect(r.relay(s.id, 'app', { kind: 'offer', sdp: 'v=0...' })).toBe(true);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ cameraId: 'cam-1', session: s.id, signal: { kind: 'offer' } });

    // camera answers + trickles ICE
    r.relay(s.id, 'camera', { kind: 'answer', sdp: 'v=0...a' });
    r.relay(s.id, 'camera', { kind: 'ice', candidate: 'cand-1' });

    // app polls → drains both, then empty
    const first = r.poll(s.id, 'app');
    expect(first?.map((x) => x.kind)).toEqual(['answer', 'ice']);
    expect(r.poll(s.id, 'app')).toEqual([]);

    // camera-side poll gets the earlier offer
    expect(r.poll(s.id, 'camera')?.map((x) => x.kind)).toEqual(['offer']);
    r.stop();
  });

  it('talk + play are relayed to the camera', () => {
    const pub = vi.fn();
    const r = new AudioRelay();
    r.setPublisher(pub);
    const s = r.createSession('cam-1', 'home');
    r.relay(s.id, 'app', { kind: 'talk', state: 'start' });
    r.relay(s.id, 'app', { kind: 'play', url: 'https://x/calm.mp3', loop: true });
    expect(pub).toHaveBeenCalledTimes(2);
    expect(pub.mock.calls[1][3]).toMatchObject({ kind: 'play', loop: true });
    r.stop();
  });

  it('stop ends the session and notifies the camera', () => {
    const pub = vi.fn();
    const r = new AudioRelay();
    r.setPublisher(pub);
    const s = r.createSession('cam-1', 'home');
    r.relay(s.id, 'app', { kind: 'stop' });
    expect(r.get(s.id)).toBeUndefined();
    expect(pub).toHaveBeenCalled();
    r.stop();
  });

  it('unknown session is rejected', () => {
    const r = new AudioRelay();
    expect(r.relay('nope', 'app', { kind: 'stop' })).toBe(false);
    expect(r.poll('nope', 'app')).toBeNull();
    expect(r.end('nope')).toBe(false);
    r.stop();
  });

  it('sessions expire after ttl', () => {
    vi.useFakeTimers();
    const r = new AudioRelay(1000);
    const s = r.createSession('cam-1', 'home');
    vi.advanceTimersByTime(31_000); // past ttl + one sweep
    expect(r.get(s.id)).toBeUndefined();
    r.stop();
    vi.useRealTimers();
  });
});
