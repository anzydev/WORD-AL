import { describe, expect, it } from 'vitest';
import { acceptedWords, answerWords, dictionarySizes, isValidWord, normalizeWord, selectAnswer } from './dictionary';

describe('dictionary boundary', () => {
  it('normalizes case and outer whitespace without changing unsupported characters', () => {
    expect(normalizeWord('  CRANE  ')).toBe('crane');
    expect(isValidWord(' CRANE ', 5)).toBe(true);
    expect(isValidWord('crane!', 5)).toBe(false);
    expect(isValidWord('café', 5)).toBe(false);
  });

  it('validates words by length and distinguishes answers from accepted guesses', () => {
    expect(isValidWord('artist', 6)).toBe(true);
    expect(isValidWord('crane', 6)).toBe(false);
    expect(isValidWord('about', 5)).toBe(true);
    expect(isValidWord('about', 5, 'answer')).toBe(false);
    for (const length of [5, 6] as const) {
      expect(answerWords[length].every((word) => word.length === length && acceptedWords[length].has(word))).toBe(true);
      expect(new Set(answerWords[length]).size).toBe(answerWords[length].length);
    }
    expect(dictionarySizes.answers[5]).toBeGreaterThan(0);
    expect(dictionarySizes.acceptedGuesses[6]).toBeGreaterThan(dictionarySizes.answers[6]);
  });

  it('selects eligible answers deterministically and rejects missing pools/categories', () => {
    expect(selectAnswer(5, { random: () => 0 })).toBe(answerWords[5][0]);
    expect(selectAnswer(5, { random: () => 0.999999 })).toBe(answerWords[5][answerWords[5].length - 1]);
    expect(() => selectAnswer(5, { category: 'nature' })).toThrow(/unavailable/);
    expect(() => selectAnswer(7 as 5, { random: () => 0 })).toThrow(/No eligible/);
    expect(() => selectAnswer(5, { random: () => 1 })).toThrow(/Random source/);
  });
});
