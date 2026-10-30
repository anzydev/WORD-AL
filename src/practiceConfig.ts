import { PracticeConfigSchema, type PracticeConfig } from './game.js';

export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  matches: 1,
  rounds: 1,
  difficulty: 'easy',
  timer: 60,
  hints: false,
  strict: false,
  category: 'general',
};

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function browserStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function parsePracticeConfig(value: unknown): { config: PracticeConfig; recovered: boolean } {
  const parsed = PracticeConfigSchema.safeParse(value);
  return parsed.success
    ? { config: parsed.data, recovered: false }
    : { config: DEFAULT_PRACTICE_CONFIG, recovered: true };
}

export function loadPracticeConfig(storage: StorageLike | null): { config: PracticeConfig; recovered: boolean } {
  if (!storage) return { config: DEFAULT_PRACTICE_CONFIG, recovered: false };
  try {
    const serialized = storage.getItem('word-al-config');
    if (serialized === null) return { config: DEFAULT_PRACTICE_CONFIG, recovered: false };
    return parsePracticeConfig(JSON.parse(serialized) as unknown);
  } catch {
    return { config: DEFAULT_PRACTICE_CONFIG, recovered: true };
  }
}

export function savePracticeConfig(storage: StorageLike | null, input: unknown): boolean {
  const parsed = PracticeConfigSchema.safeParse(input);
  if (!parsed.success || !storage) return false;
  try { storage.setItem('word-al-config', JSON.stringify(parsed.data)); return true; }
  catch { return false; }
}
