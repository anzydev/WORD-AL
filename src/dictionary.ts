import { ACCEPTED, ANSWERS, normalize } from './game.js';

export type WordLength = 5 | 6;
export type WordCategory = 'general';

function cleanWords(words: readonly string[], length: WordLength): string[] {
  return [...new Set(words.map(normalize).filter((word) => word.length === length && /^[a-z]+$/.test(word)))];
}

export const answerWords: Record<WordLength, readonly string[]> = {
  5: cleanWords(ANSWERS[5], 5),
  6: cleanWords(ANSWERS[6], 6),
};

export const acceptedWords: Record<WordLength, ReadonlySet<string>> = {
  5: new Set(cleanWords([...ACCEPTED], 5)),
  6: new Set(cleanWords([...ACCEPTED], 6)),
};

export function normalizeWord(input: string): string {
  return normalize(input);
}

export function isValidWord(input: string, length: WordLength, role: 'answer' | 'guess' = 'guess'): boolean {
  const word = normalizeWord(input);
  if (word.length !== length || !/^[a-z]+$/.test(word)) return false;
  return role === 'answer'
    ? answerWords[length].includes(word)
    : acceptedWords[length].has(word);
}

export function selectAnswer(length: WordLength, options: { random?: () => number; category?: string } = {}): string {
  if (options.category !== undefined && options.category !== 'general') {
    throw new RangeError(`Word category "${options.category}" is unavailable.`);
  }
  const candidates = answerWords[length];
  if (!candidates?.length) throw new RangeError(`No eligible ${length}-letter answers are available.`);
  const value = (options.random ?? Math.random)();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return a value in [0, 1).');
  return candidates[Math.floor(value * candidates.length)];
}

export const dictionarySizes = {
  answers: { 5: answerWords[5].length, 6: answerWords[6].length },
  acceptedGuesses: { 5: acceptedWords[5].size, 6: acceptedWords[6].size },
} as const;
