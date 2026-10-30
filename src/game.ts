import { z } from 'zod';

export type Difficulty = 'easy' | 'hard';
export type TileState = 'empty' | 'filled' | 'correct' | 'present' | 'absent';
export type RoundStatus = 'ready' | 'active' | 'won' | 'lost' | 'expired';
export type TimerSetting = 60 | 90 | 120 | null;
export type Feedback = Exclude<TileState, 'empty' | 'filled'>;
export type MatchStatus = 'lobby' | 'countdown' | 'active' | 'round-results' | 'between-rounds' | 'match-results' | 'complete';
export type WordDistribution = 'same' | 'random';
export type GameEventName = 'letter-entered' | 'guess-submitted' | 'tile-feedback-revealed' | 'valid-word-accepted' | 'invalid-word-rejected' | 'round-won' | 'round-lost' | 'timer-warning' | 'timer-expired' | 'match-won' | 'match-lost' | 'ability-activated';

export const SCORING = { base: 120, attemptPenalty: 15, maxSpeedBonus: 5, hintPenalty: 5 } as const;
export const TIMER_OPTIONS = [60, 90, 120] as const;
export const PRACTICE_LIMITS = { minMatches: 1, maxMatches: 5, minRounds: 1, maxRounds: 7 } as const;
export const TIMER_SCHEMA = z.union([z.literal(60), z.literal(90), z.literal(120), z.null()]);
export const DifficultySchema = z.enum(['easy', 'hard']);
export const PracticeConfigSchema = z.object({
  matches: z.number().int().min(PRACTICE_LIMITS.minMatches).max(PRACTICE_LIMITS.maxMatches),
  rounds: z.number().int().min(PRACTICE_LIMITS.minRounds).max(PRACTICE_LIMITS.maxRounds),
  difficulty: DifficultySchema,
  timer: TIMER_SCHEMA,
  hints: z.boolean(),
  strict: z.boolean(),
  category: z.literal('general'),
});
export const GuessInputSchema = z.object({
  roundId: z.string().min(1).max(128),
  guess: z.string().regex(/^[a-zA-Z]+$/).max(6),
}).strict();
export const MultiplayerSettingsSchema = z.object({
  difficulty: DifficultySchema,
  timer: z.union([z.literal(60), z.literal(90), z.literal(120)]),
  matches: z.number().int().min(1).max(5),
  rounds: z.number().int().min(1).max(7),
  hints: z.boolean(),
  strict: z.boolean(),
  category: z.literal('general'),
  distribution: z.enum(['same', 'random']),
  chaos: z.boolean(),
});
export type MultiplayerSettings = z.infer<typeof MultiplayerSettingsSchema>;
export const DEFAULT_MULTIPLAYER_SETTINGS: MultiplayerSettings = {
  timer: 90,
  matches: 1,
  rounds: 1,
  difficulty: 'easy',
  hints: false,
  strict: false,
  category: 'general',
  distribution: 'same',
  chaos: false,
};

export const DIFFICULTIES: Record<Difficulty, { label: string; wordLength: number; attempts: number; description: string }> = {
  easy: { label: 'Easy', wordLength: 5, attempts: 6, description: 'Five letters · six guesses' },
  hard: { label: 'Hard', wordLength: 6, attempts: 8, description: 'Six letters · eight guesses' },
};

export const KEY_ROWS = [['Q','W','E','R','T','Y','U','I','O','P'], ['A','S','D','F','G','H','J','K','L'], ['ENTER','Z','X','C','V','B','N','M','BACKSPACE']];

export const ANSWERS: Record<number, string[]> = {
  5: ['arise','audio','badge','bench','blaze','cedar','charm','crane','crisp','delta','dream','eagle','ember','flame','flint','grape','heart','house','irate','ivory','jazzy','latch','lemon','light','maple','ocean','pearl','pilot','plaid','pride','prism','quiet','radio','raven','river','score','sheep','shine','skate','slate','smile','spice','stare','steam','stone','sweep','teeth','think','tiger','toast','train','trust','ultra','value','vivid','waltz','wheat','whale','world','young','zebra'],
  6: ['artist','bright','button','castle','circle','crafts','dragon','forest','friend','golden','honest','island','jungle','little','marble','moment','orange','planet','puzzle','rocket','silver','smooth','spring','street','summer','ticket','travel','violet','window','winter'],
};

export const ACCEPTED = new Set([...ANSWERS[5], ...ANSWERS[6], 'about','above','after','again','agree','alone','apple','beach','black','block','bring','chair','chase','check','child','clean','clear','close','cloud','count','cover','dance','early','enjoy','every','field','final','first','floor','found','fresh','front','glass','great','green','group','happy','human','house','known','large','laugh','learn','leave','local','magic','match','maybe','money','month','music','never','night','north','often','order','other','paper','party','phone','place','plant','point','power','quick','reach','ready','right','round','shape','short','sleep','small','sound','space','speak','spell','start','still','story','study','table','today','touch','tower','under','until','voice','watch','water','where','which','white','whole','whose','woman','write','wrong','yellow','always','answer','around','before','better','during','family','future','inside','member','number','people','public','really','school','should','simple','strong','things','though','toward','unique','without']);

export const normalize = (value: string) => value.trim().toLowerCase();

export function feedbackFor(answer: string, guess: string): Feedback[] {
  if (answer.length !== guess.length) throw new RangeError('Answer and guess must have the same configured length.');
  const result: Feedback[] = Array(answer.length).fill('absent');
  const remaining = answer.toLowerCase().split('');
  const normalizedGuess = guess.toLowerCase();
  for (let i = 0; i < answer.length; i += 1) {
    if (normalizedGuess[i] === remaining[i]) { result[i] = 'correct'; remaining[i] = ''; }
  }
  for (let i = 0; i < answer.length; i += 1) {
    if (result[i] === 'correct') continue;
    const match = remaining.indexOf(normalizedGuess[i]);
    if (match >= 0) { result[i] = 'present'; remaining[match] = ''; }
  }
  return result;
}

export function keyboardFeedback(rows: { word: string; feedback: Feedback[] }[]) {
  const priority: Record<Feedback, number> = { absent: 1, present: 2, correct: 3 };
  const output: Record<string, Feedback> = {};
  rows.forEach(({ word, feedback }) => word.split('').forEach((letter, i) => {
    const next = feedback[i];
    if (!output[letter] || priority[next] > priority[output[letter]]) output[letter] = next;
  }));
  return output;
}

export function strictViolation(guess: string, rows: { word: string; feedback: Feedback[] }[]) {
  const minimums: Record<string, number> = {};
  const maximums: Record<string, number> = {};
  const locked: Record<number, string> = {};
  const blocked: Record<number, Set<string>> = {};
  rows.forEach(({ word, feedback }) => {
    const revealed: Record<string, number> = {};
    const excluded: Record<string, boolean> = {};
    feedback.forEach((state, i) => {
      const letter = word[i];
      if (state === 'correct') locked[i] = letter;
      if (state === 'correct' || state === 'present') revealed[letter] = (revealed[letter] ?? 0) + 1;
      if (state === 'present') (blocked[i] ??= new Set()).add(letter);
      if (state === 'absent') excluded[letter] = true;
    });
    for (const [letter, count] of Object.entries(revealed)) minimums[letter] = Math.max(minimums[letter] ?? 0, count);
    for (const [letter, absent] of Object.entries(excluded)) if (absent) maximums[letter] = Math.min(maximums[letter] ?? Infinity, revealed[letter] ?? 0);
  });
  for (const [index, letter] of Object.entries(locked)) if (guess[Number(index)] !== letter) return `Keep ${letter.toUpperCase()} in position ${Number(index) + 1}.`;
  for (const [index, letters] of Object.entries(blocked)) if (letters.has(guess[Number(index)])) return `${guess[Number(index)].toUpperCase()} must move to another position.`;
  for (const [letter, minimum] of Object.entries(minimums)) if (guess.split('').filter((item) => item === letter).length < minimum) return `Use ${letter.toUpperCase()} at least ${minimum} time${minimum > 1 ? 's' : ''}.`;
  for (const [letter, maximum] of Object.entries(maximums)) if (guess.split('').filter((item) => item === letter).length > maximum) return `Use ${letter.toUpperCase()} no more than ${maximum} time${maximum === 1 ? '' : 's'}.`;
  return null;
}

export function scoreRound(attempts: number, remainingSeconds: number | null, limit: TimerSetting, hintUsed: boolean) {
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('Solved rounds require at least one whole-number attempt.');
  const base = SCORING.base - SCORING.attemptPenalty * (attempts - 1);
  const elapsedRemaining = limit !== null && remainingSeconds !== null && Number.isFinite(remainingSeconds)
    ? Math.min(limit, Math.max(0, remainingSeconds)) : 0;
  const speed = limit !== null && remainingSeconds !== null ? Math.floor(SCORING.maxSpeedBonus * elapsedRemaining / limit) : 0;
  const penalty = hintUsed ? SCORING.hintPenalty : 0;
  return { base, speed, penalty, total: Math.max(0, base + speed - penalty) };
}

export type PracticeConfig = z.infer<typeof PracticeConfigSchema>;
