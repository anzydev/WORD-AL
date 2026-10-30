export type SoundName = 'type' | 'submit' | 'success' | 'error';

let context: AudioContext | null = null;
const playedEvents = new Set<string>();

/** Optional synthesized UI tones. Audio is unlocked only by calls made from user actions. */
export function playSound(name: SoundName, eventId?: string) {
  try {
    if (typeof window === 'undefined' || window.localStorage.getItem('word-al-sound') === 'false') return;
    if (eventId) {
      if (playedEvents.has(eventId)) return;
      playedEvents.add(eventId);
      if (playedEvents.size > 256) playedEvents.delete(playedEvents.values().next().value!);
    }
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    context ??= new AudioContextCtor();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequency = name === 'success' ? 640 : name === 'error' ? 180 : name === 'submit' ? 320 : 240;
    const duration = name === 'success' ? 0.18 : 0.07;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch {
    // Audio is optional and must never affect gameplay.
  }
}

export function resetPlayedSoundEventsForTests() {
  playedEvents.clear();
}
