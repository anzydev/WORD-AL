import { describe, expect, it } from 'vitest';
import { DEFAULT_PRACTICE_CONFIG, loadPracticeConfig, parsePracticeConfig, savePracticeConfig, type StorageLike } from './practiceConfig';

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('practice configuration persistence', () => {
  it('uses the product defaults when no configuration is saved', () => {
    expect(loadPracticeConfig(memoryStorage())).toEqual({ config: DEFAULT_PRACTICE_CONFIG, recovered: false });
  });

  it('loads supported settings and persists a validated configuration', () => {
    const storage = memoryStorage();
    const selected = { matches: 5, rounds: 7, difficulty: 'hard', timer: null, hints: true, strict: true, category: 'general' } as const;
    expect(savePracticeConfig(storage, selected)).toBe(true);
    expect(loadPracticeConfig(storage)).toEqual({ config: selected, recovered: false });
  });

  it('recovers invalid, malformed, unsupported-category, and unavailable storage values', () => {
    expect(parsePracticeConfig({ ...DEFAULT_PRACTICE_CONFIG, rounds: 8 }).recovered).toBe(true);
    expect(parsePracticeConfig({ ...DEFAULT_PRACTICE_CONFIG, category: 'nature' }).config).toEqual(DEFAULT_PRACTICE_CONFIG);
    expect(loadPracticeConfig(memoryStorage({ 'word-al-config': '{invalid' })).recovered).toBe(true);
    expect(loadPracticeConfig(null)).toEqual({ config: DEFAULT_PRACTICE_CONFIG, recovered: false });
  });

  it('rejects bad values instead of saving partial settings', () => {
    expect(savePracticeConfig(memoryStorage(), { ...DEFAULT_PRACTICE_CONFIG, matches: 0 })).toBe(false);
    expect(savePracticeConfig(memoryStorage(), { ...DEFAULT_PRACTICE_CONFIG, timer: 45 })).toBe(false);
  });
});
