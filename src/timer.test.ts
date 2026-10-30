import { describe, expect, it } from 'vitest';
import { canTransitionRound, deadlineReached, makeRoundTiming, remainingSeconds } from './timer';

describe('local round timer helpers', () => {
  it('derives remaining time from the deadline and clamps at zero', () => {
    expect(remainingSeconds(61_000, 1_000)).toBe(60);
    expect(remainingSeconds(61_000, 16_000)).toBe(45);
    expect(remainingSeconds(61_000, 61_001)).toBe(0);
    expect(remainingSeconds(null, 1_000)).toBeNull();
  });

  it('gives the deadline precedence at and after the boundary', () => {
    expect(deadlineReached(10_000, 9_999)).toBe(false);
    expect(deadlineReached(10_000, 10_000)).toBe(true);
    expect(deadlineReached(10_000, 10_001)).toBe(true);
  });

  it('allows only ready-to-active and active-to-terminal transitions', () => {
    expect(canTransitionRound('ready', 'active')).toBe(true);
    expect(canTransitionRound('active', 'won')).toBe(true);
    expect(canTransitionRound('active', 'lost')).toBe(true);
    expect(canTransitionRound('active', 'expired')).toBe(true);
    expect(canTransitionRound('won', 'active')).toBe(false);
    expect(canTransitionRound('expired', 'lost')).toBe(false);
  });

  it('retains explicit round timing and completion reason for scoring', () => {
    expect(makeRoundTiming(90, 1_000, 31_000, 'won')).toEqual({ timeLimit: 90, startedAt: 1_000, completedAt: 31_000, deadline: 91_000, remainingSeconds: 60, reason: 'won' });
    expect(makeRoundTiming(null, 1_000, 31_000, 'lost')).toEqual({ timeLimit: null, startedAt: 1_000, completedAt: 31_000, deadline: null, remainingSeconds: null, reason: 'lost' });
  });
});
