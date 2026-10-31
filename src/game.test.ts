import { describe, expect, it } from 'vitest';
import { DEFAULT_MULTIPLAYER_SETTINGS, feedbackFor, GuessInputSchema, keyboardFeedback, MultiplayerSettingsSchema, PracticeConfigSchema, scoreRound, strictViolation, type Feedback } from './game';
import { validateGuess } from './validation';

describe('WORD-AL feedback engine', () => {
  it('allocates exact matches before duplicate present matches', () => {
    expect(feedbackFor('banal', 'llama')).toEqual(['present', 'absent', 'present', 'absent', 'present']);
  });

  it.each([
    ['APPLE', 'ALLEY', ['correct', 'present', 'absent', 'present', 'absent']],
    // Correction: the final E is present because LEVEL has a second E; A is absent.
    ['LEVEL', 'LEAVE', ['correct', 'correct', 'absent', 'present', 'present']],
    ['SHEEP', 'EERIE', ['present', 'present', 'absent', 'absent', 'absent']],
    ['CRANE', 'CRANE', ['correct', 'correct', 'correct', 'correct', 'correct']],
    ['BRICK', 'PLANT', ['absent', 'absent', 'absent', 'absent', 'absent']],
  ] as const)('calculates duplicate-safe feedback for %s / %s', (answer, guess, expected) => {
    expect(feedbackFor(answer, guess)).toEqual(expected);
  });

  it('normalizes feedback inputs without mutating them and rejects mismatched lengths', () => {
    const answer = 'Crane'; const guess = 'CRANE';
    expect(feedbackFor(answer, guess)).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
    expect(answer).toBe('Crane');
    expect(() => feedbackFor('CRANE', 'CAT')).toThrow(RangeError);
  });

  it('scores the home board preview against one answer', () => {
    const rows = ['weary', 'grave', 'vigor'].map((word) => ({ word, feedback: feedbackFor('vigor', word) }));
    expect(rows.map(({ feedback }) => feedback)).toEqual([
      ['absent', 'absent', 'absent', 'present', 'absent'],
      ['present', 'present', 'absent', 'present', 'absent'],
      ['correct', 'correct', 'correct', 'correct', 'correct'],
    ]);
    expect(keyboardFeedback(rows)).toMatchObject({ v: 'correct', i: 'correct', g: 'correct', o: 'correct', r: 'correct', e: 'absent' });
  });

  it('never downgrades a keyboard key', () => {
    expect(keyboardFeedback([
      { word: 'crane', feedback: ['correct', 'absent', 'absent', 'absent', 'absent'] },
      { word: 'cabin', feedback: ['correct', 'present', 'absent', 'absent', 'absent'] },
    ])).toEqual({ c: 'correct', r: 'absent', a: 'present', n: 'absent', e: 'absent', b: 'absent', i: 'absent' });
  });

  it('calculates the documented score breakdown', () => {
    expect(scoreRound(2, 30, 60, true)).toEqual({ base: 105, speed: 2, penalty: 5, total: 102 });
    expect(scoreRound(6, null, null, false)).toEqual({ base: 45, speed: 0, penalty: 0, total: 45 });
  });

  it('clamps time to the configured round and rejects invalid solved-round attempts', () => {
    expect(scoreRound(1, 900, 60, false)).toEqual({ base: 120, speed: 5, penalty: 0, total: 125 });
    expect(scoreRound(1, -10, 60, false)).toEqual({ base: 120, speed: 0, penalty: 0, total: 120 });
    expect(() => scoreRound(0, 10, 60, false)).toThrow(RangeError);
    expect(() => scoreRound(1.5, 10, 60, false)).toThrow(RangeError);
  });

  it('validates practice settings and scoped multiplayer guess inputs', () => {
    expect(PracticeConfigSchema.safeParse({ matches: 5, rounds: 7, difficulty: 'hard', timer: null, hints: true, strict: false, category: 'general' }).success).toBe(true);
    expect(PracticeConfigSchema.safeParse({ matches: 0, rounds: 7, difficulty: 'hard', timer: null, hints: true, strict: false, category: 'general' }).success).toBe(false);
    expect(GuessInputSchema.safeParse({ roundId: 'r1', guess: 'crane' }).success).toBe(true);
    expect(GuessInputSchema.safeParse({ roundId: 'r1', guess: 'crane', score: 200 }).success).toBe(false);
    expect(MultiplayerSettingsSchema.safeParse({ playerCount: 2, difficulty: 'easy', timer: 90, matches: 1, rounds: 7, hints: false, strict: true, category: 'general', distribution: 'same', chaos: false }).success).toBe(true);
    expect(MultiplayerSettingsSchema.safeParse(DEFAULT_MULTIPLAYER_SETTINGS).success).toBe(true);
    expect(DEFAULT_MULTIPLAYER_SETTINGS).toMatchObject({ timer: 90, distribution: 'same', chaos: false });
    expect(MultiplayerSettingsSchema.safeParse({ ...DEFAULT_MULTIPLAYER_SETTINGS, playerCount: 7 }).success).toBe(false);
    for (const timer of [60, 90, 120]) for (const difficulty of ['easy', 'hard']) for (const distribution of ['same', 'random']) {
      expect(MultiplayerSettingsSchema.safeParse({ ...DEFAULT_MULTIPLAYER_SETTINGS, timer, difficulty, distribution }).success).toBe(true);
    }
    expect(MultiplayerSettingsSchema.safeParse({ ...DEFAULT_MULTIPLAYER_SETTINGS, timer: null }).success).toBe(false);
    expect(MultiplayerSettingsSchema.safeParse({ ...DEFAULT_MULTIPLAYER_SETTINGS, category: 'science' }).success).toBe(false);
  });

  it('enforces green and yellow strict-mode constraints', () => {
    const rows = [{ word: 'crane', feedback: feedbackFor('cabin', 'crane') }];
    expect(strictViolation('cable', rows)).toContain('Use N');
    expect(strictViolation('canon', rows)).toBeNull();
  });

  it('tracks duplicate minimums and gray-derived maximums in strict mode', () => {
    const prior = [{ word: 'eerie', feedback: ['present', 'present', 'absent', 'absent', 'absent'] as Feedback[] }];
    expect(strictViolation('xxeee', prior)).toContain('no more than 2');
    expect(strictViolation('abece', prior)).toBeNull();
    const greenAndYellow = [{ word: 'aaabb', feedback: ['correct', 'present', 'present', 'absent', 'absent'] as Feedback[] }];
    expect(strictViolation('abcde', greenAndYellow)).toContain('at least 3');
  });

  it('returns typed validation failures for malformed and unavailable guesses', () => {
    const options = { length: 5 as const, active: true };
    expect(validateGuess(42, options)).toMatchObject({ valid: false, reason: 'invalid_input' });
    expect(validateGuess('crane!', options)).toMatchObject({ valid: false, reason: 'invalid_characters' });
    expect(validateGuess('cat', options)).toMatchObject({ valid: false, reason: 'incorrect_length' });
    expect(validateGuess('zzzzz', options)).toMatchObject({ valid: false, reason: 'word_not_found' });
    expect(validateGuess('crane', { ...options, active: false })).toMatchObject({ valid: false, reason: 'round_not_active' });
    expect(validateGuess('CRANE', options)).toEqual({ valid: true, guess: 'crane' });
    expect(validateGuess('about', { ...options, strict: true, rows: [{ word: 'crane', feedback: ['correct','present','absent','absent','absent'] }] })).toMatchObject({ valid: false, reason: 'strict_mode_violation' });
    expect(validateGuess('about', options)).toMatchObject({ valid: true });
  });
});
