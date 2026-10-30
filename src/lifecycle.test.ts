import { describe, expect, it } from 'vitest';
import { canTransition, transitionLifecycle } from './lifecycle';

describe('multiplayer lifecycle state machine', () => {
  it.each([
    ['LOBBY', 'ROUND_STARTING'], ['ROUND_STARTING', 'ROUND_ACTIVE'], ['ROUND_ACTIVE', 'ROUND_RESULTS'],
    ['ROUND_ACTIVE', 'MATCH_RESULTS'], ['ROUND_RESULTS', 'ROUND_STARTING'], ['MATCH_RESULTS', 'ROUND_STARTING'],
    ['MATCH_RESULTS', 'SESSION_COMPLETE'], ['MATCH_RESULTS', 'LOBBY'], ['SESSION_COMPLETE', 'LOBBY'], ['ROUND_ACTIVE', 'ROOM_CLOSED'],
  ] as const)('permits %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(transitionLifecycle(from, to)).toBe(to);
  });

  it.each([['LOBBY', 'ROUND_RESULTS'], ['SESSION_COMPLETE', 'ROUND_ACTIVE'], ['ROOM_CLOSED', 'LOBBY']] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => transitionLifecycle(from, to)).toThrow(/Invalid lifecycle transition/);
  });
});
