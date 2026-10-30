import { describe, expect, it } from 'vitest';
import { createPracticeSession, recordPracticeRound, advancePracticeSession, abandonPracticeSession, summarizeMatch, summarizePracticeSession, type PracticeRoundResult } from './session';
import { DEFAULT_PRACTICE_CONFIG } from './practiceConfig';
import { makeRoundTiming } from './timer';

function round(matchNumber: number, roundNumber: number, reason: PracticeRoundResult['reason'] = 'won'): PracticeRoundResult {
  const startedAt = 1_000 + roundNumber * 1_000 + matchNumber * 10_000;
  return { id: `${matchNumber}:${roundNumber}`, matchNumber, roundNumber, difficulty: 'easy', wordLength: 5, timeLimit: 60, reason, attempts: reason === 'won' ? 3 : 6, hintUsed: false, timing: makeRoundTiming(60, startedAt, startedAt + 5_000, reason), answer: 'crane' };
}

describe('practice session engine', () => {
  it('records each round once and gates progression behind finalized results', () => {
    const config = { ...DEFAULT_PRACTICE_CONFIG, matches: 2, rounds: 2 };
    const initial = createPracticeSession(config, 1_000);
    expect(recordPracticeRound(initial, round(1, 2))).toBe(initial);
    const first = recordPracticeRound(initial, round(1, 1));
    expect(first.status).toBe('between_rounds');
    expect(recordPracticeRound(first, round(1, 1))).toBe(first);
    const second = advancePracticeSession(first);
    expect(second.currentRound).toBe(2);
    const third = recordPracticeRound(second, round(1, 2, 'expired'));
    expect(third.status).toBe('between_matches');
    const nextMatch = advancePracticeSession(third);
    expect(nextMatch.currentMatch).toBe(2);
    expect(nextMatch.currentRound).toBe(1);
  });

  it('completes the session and produces safe match/session summaries', () => {
    const config = { ...DEFAULT_PRACTICE_CONFIG, matches: 1, rounds: 2 };
    const first = recordPracticeRound(createPracticeSession(config, 1), round(1, 1, 'lost'));
    const active = advancePracticeSession(first);
    const complete = recordPracticeRound(active, round(1, 2));
    expect(complete.status).toBe('completed');
    expect(complete.completedAt).toBeGreaterThan(complete.startedAt);
    expect(summarizeMatch(complete, 1)).toMatchObject({ roundsWon: 1, roundsLost: 1, roundsExpired: 0, attempts: 9, roundsCompleted: 2 });
    expect(summarizePracticeSession(complete)).toMatchObject({ matchesCompleted: 1, roundsCompleted: 2, won: 1, lost: 1, expired: 0, winPercentage: 50, attempts: 9 });
    expect(summarizePracticeSession(createPracticeSession(config, 1)).winPercentage).toBe(0);
  });

  it('marks an unfinished session abandoned without overwriting a completed one', () => {
    const session = createPracticeSession(DEFAULT_PRACTICE_CONFIG, 1);
    expect(abandonPracticeSession(session, 2)).toMatchObject({ status: 'abandoned', completedAt: 2 });
    const completed = recordPracticeRound(session, round(1, 1));
    expect(abandonPracticeSession(completed, 4)).toBe(completed);
  });
});
