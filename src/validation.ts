import { strictViolation, type Feedback } from './game.js';
import { isValidWord, normalizeWord, type WordLength } from './dictionary.js';

export type GuessFailure = 'invalid_input' | 'invalid_characters' | 'incorrect_length' | 'word_not_found' | 'round_not_active' | 'strict_mode_violation';
export type GuessValidation = { valid: true; guess: string } | { valid: false; reason: GuessFailure; message: string };

export function validateGuess(input: unknown, options: {
  length: WordLength;
  active: boolean;
  strict?: boolean;
  rows?: { word: string; feedback: Feedback[] }[];
}): GuessValidation {
  if (typeof input !== 'string') return { valid: false, reason: 'invalid_input', message: 'Enter a word to continue.' };
  const guess = normalizeWord(input);
  if (!/^[a-z]+$/.test(guess)) return { valid: false, reason: 'invalid_characters', message: 'Use letters A–Z only.' };
  if (guess.length !== options.length) return { valid: false, reason: 'incorrect_length', message: `Use exactly ${options.length} letters.` };
  if (!options.active) return { valid: false, reason: 'round_not_active', message: 'This round is no longer accepting guesses.' };
  if (options.strict) {
    const violation = strictViolation(guess, options.rows ?? []);
    if (violation) return { valid: false, reason: 'strict_mode_violation', message: violation };
  }
  if (!isValidWord(guess, options.length)) return { valid: false, reason: 'word_not_found', message: 'Not in word list.' };
  return { valid: true, guess };
}
