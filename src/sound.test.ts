import { afterEach, describe, expect, it, vi } from 'vitest';
import { playSound, resetPlayedSoundEventsForTests } from './sound';

class FakeAudioContext {
  state = 'running'; currentTime = 1; destination = {};
  oscillator = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
  createOscillator = vi.fn(() => this.oscillator);
  createGain = vi.fn(() => this.gain);
  resume = vi.fn().mockRejectedValue(new Error('audio locked'));
}

describe('optional sound feedback', () => {
  afterEach(() => { vi.unstubAllGlobals(); resetPlayedSoundEventsForTests(); });

  it('does not create or play audio when sound is disabled', () => {
    const ctor = vi.fn();
    vi.stubGlobal('window', { localStorage: { getItem: () => 'false' }, AudioContext: ctor });
    playSound('type');
    expect(ctor).not.toHaveBeenCalled();
  });

  it('synthesizes tones and deduplicates network event retries', () => {
    const instances: FakeAudioContext[] = [];
    class MockAudioContext extends FakeAudioContext { constructor() { super(); instances.push(this); } }
    const ctor = vi.fn(MockAudioContext);
    vi.stubGlobal('window', { localStorage: { getItem: () => 'true' }, AudioContext: ctor });
    playSound('success', 'round-1:complete');
    playSound('success', 'round-1:complete');
    expect(ctor).toHaveBeenCalledTimes(1);
    const audio = instances[0];
    expect(audio.createOscillator).toHaveBeenCalledTimes(1);
    expect(audio.createGain).toHaveBeenCalledTimes(1);
    expect(audio.oscillator.start).toHaveBeenCalledTimes(1);
    expect(audio.oscillator.frequency.value).toBe(640);
  });

  it('supports a short hover tone for interactive affordances', () => {
    const instances: FakeAudioContext[] = [];
    class MockAudioContext extends FakeAudioContext { constructor() { super(); instances.push(this); } }
    vi.stubGlobal('window', { localStorage: { getItem: () => 'true' }, AudioContext: vi.fn(MockAudioContext) });
    playSound('hover');
    expect(instances[0].oscillator.frequency.value).toBe(520);
  });

  it('silently tolerates unavailable audio and rejected resume promises', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'true' }, AudioContext: class extends FakeAudioContext { state = 'suspended'; } });
    expect(() => playSound('submit')).not.toThrow();
    await Promise.resolve();
  });
});
