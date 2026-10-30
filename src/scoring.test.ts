import { describe, expect, it } from 'vitest';
import { compareStanding, createScoreBreakdown, placeStandings } from './scoring';

describe('authoritative multiplayer scoring', () => {
  it('records formula components and clamps speed bonus boundaries', () => {
    expect(createScoreBreakdown({ solved: true, attempts: 2, timeLimit: 60, remainingTime: 30, hintUsed: true, completionReason: 'solved', completedAt: 900 })).toMatchObject({ baseScore: 105, speedBonus: 2, hintPenalty: 5, finalScore: 102, remainingTime: 30 });
    expect(createScoreBreakdown({ solved: true, attempts: 1, timeLimit: 60, remainingTime: 1000, hintUsed: false, completionReason: 'solved', completedAt: 900 }).speedBonus).toBe(5);
    expect(createScoreBreakdown({ solved: true, attempts: 1, timeLimit: 60, remainingTime: -3, hintUsed: false, completionReason: 'solved', completedAt: 900 }).speedBonus).toBe(0);
  });

  it('gives unsolved and expired rounds zero regardless of time or hint usage', () => {
    expect(createScoreBreakdown({ solved: false, attempts: 6, timeLimit: 60, remainingTime: 45, hintUsed: true, completionReason: 'deadline', completedAt: 900 })).toMatchObject({ finalScore: 0, baseScore: 0, speedBonus: 0, hintPenalty: 0, completionReason: 'deadline' });
  });

  it('orders standings by score and tie-breakers, preserving shared placements', () => {
    const rows = [
      { id: 'slower', score: { total: 100, roundsWon: 1, attempts: 3, completionTime: 900 } },
      { id: 'winner', score: { total: 100, roundsWon: 1, attempts: 2, completionTime: 1000 } },
      { id: 'shared', score: { total: 100, roundsWon: 1, attempts: 2, completionTime: 1000 } },
      { id: 'points', score: { total: 110, roundsWon: 0, attempts: 0, completionTime: 0 } },
    ];
    expect(placeStandings(rows).map(({ id, place }) => [id, place])).toEqual([['points', 1], ['winner', 2], ['shared', 2], ['slower', 4]]);
    expect(compareStanding(rows[1].score, rows[2].score)).toBe(0);
  });
});
