import type { TimerSetting } from './game.js';
import { compareStanding, type StandingScore } from './scoring.js';

export type ChaosAbility = 'strike' | 'boost';

export function chaosAbilitySeconds(timer: Exclude<TimerSetting, null>, ability: ChaosAbility): number {
  const amount = timer === 60 ? 5 : timer === 90 ? 8 : 12;
  return ability === 'strike' ? -amount : amount;
}

export function effectiveDeadline(startedAt: number, timer: number, effects: readonly { ability: ChaosAbility; seconds: number }[]): number {
  const modifier = effects.reduce((total, effect) => total + (effect.ability === 'strike' ? -Math.abs(effect.seconds) : Math.abs(effect.seconds)), 0);
  return startedAt + Math.max(15, timer + modifier) * 1000;
}

export function winners<T extends { id: string; score: StandingScore }>(scores: readonly T[]): T[] {
  if (!scores.length) return [];
  const top = [...scores].sort((left, right) => compareStanding(left.score, right.score))[0].score;
  return scores.filter((item) => compareStanding(item.score, top) === 0);
}
