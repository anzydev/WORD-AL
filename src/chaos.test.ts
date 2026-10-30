import { describe, expect, it } from 'vitest';
import { chaosAbilitySeconds, effectiveDeadline, winners } from './chaos';

describe('Chaos Mode rules', () => {
  it.each([[60, 5], [90, 8], [120, 12]] as const)('uses timer-specific strike/boost amounts for %i seconds', (timer, amount) => {
    expect(chaosAbilitySeconds(timer, 'strike')).toBe(-amount);
    expect(chaosAbilitySeconds(timer, 'boost')).toBe(amount);
  });

  it('keeps effects independent and enforces the 15-second minimum with deterministic stacking', () => {
    expect(effectiveDeadline(1_000, 60, [{ ability: 'strike', seconds: 12 }])).toBe(49_000);
    expect(effectiveDeadline(1_000, 60, [{ ability: 'strike', seconds: 12 }, { ability: 'boost', seconds: 5 }])).toBe(54_000);
    expect(effectiveDeadline(1_000, 60, [{ ability: 'strike', seconds: 50 }])).toBe(16_000);
    expect(effectiveDeadline(1_000, 90, [])).toBe(91_000);
  });

  it('keeps every shared winner eligible', () => {
    const scores = [
      { id: 'one', score: { total: 100, roundsWon: 1, attempts: 2, completionTime: 20 } },
      { id: 'two', score: { total: 100, roundsWon: 1, attempts: 2, completionTime: 20 } },
      { id: 'three', score: { total: 90, roundsWon: 1, attempts: 1, completionTime: 10 } },
    ];
    expect(winners(scores).map(({ id }) => id)).toEqual(['one', 'two']);
  });
});
