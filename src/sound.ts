export type SoundName = 'type' | 'submit' | 'success' | 'error' | 'hover' | 'primary' | 'secondary' | 'text' | 'icon' | 'theme' | 'choice';

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
    const profiles: Record<SoundName, { frequency: number; duration: number; type: OscillatorType }> = {
      success: { frequency: 640, duration: 0.18, type: 'sine' },
      error: { frequency: 180, duration: 0.1, type: 'sawtooth' },
      submit: { frequency: 320, duration: 0.07, type: 'square' },
      hover: { frequency: 520, duration: 0.045, type: 'triangle' },
      type: { frequency: 240, duration: 0.07, type: 'sine' },
      primary: { frequency: 440, duration: 0.1, type: 'triangle' },
      secondary: { frequency: 370, duration: 0.065, type: 'sine' },
      text: { frequency: 290, duration: 0.04, type: 'triangle' },
      icon: { frequency: 720, duration: 0.035, type: 'square' },
      theme: { frequency: 590, duration: 0.12, type: 'sine' },
      choice: { frequency: 400, duration: 0.08, type: 'triangle' },
    };
    const profile = profiles[name];
    const frequency = profile.frequency;
    const duration = profile.duration;
    oscillator.type = profile.type;
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

const keySoundLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type ControlSound = 'primary' | 'secondary' | 'text' | 'icon' | 'theme' | 'choice';

export function playControlSound(control: ControlSound) {
  playSound(control);
}

export function playKeySound(letter: string) {
  try {
    if (typeof window === 'undefined' || window.localStorage.getItem('word-al-sound') === 'false') return;
    const index = keySoundLetters.indexOf(letter.toUpperCase());
    if (index < 0 || typeof Audio === 'undefined') return;
    const sample = new Audio(`/audio/keyboard/key-${String(index + 1).padStart(2, '0')}.wav`);
    sample.volume = 0.18;
    void sample.play().catch(() => undefined);
  } catch {
    // Audio is optional and must never affect interaction.
  }
}

export function resetPlayedSoundEventsForTests() {
  playedEvents.clear();
  context = null;
}
