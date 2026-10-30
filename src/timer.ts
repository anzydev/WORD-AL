import type { RoundStatus, TimerSetting } from './game.js';

export type CompletionReason = 'won' | 'lost' | 'expired';
export type RoundTiming = {
  timeLimit: TimerSetting;
  startedAt: number;
  completedAt: number;
  deadline: number | null;
  remainingSeconds: number | null;
  reason: CompletionReason;
};

export function remainingSeconds(deadline: number | null, now: number): number | null {
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function deadlineReached(deadline: number | null, now: number): boolean {
  return deadline !== null && now >= deadline;
}

export function canTransitionRound(from: RoundStatus, to: RoundStatus): boolean {
  return (from === 'ready' && to === 'active') || (from === 'active' && (to === 'won' || to === 'lost' || to === 'expired'));
}

export function makeRoundTiming(timeLimit: TimerSetting, startedAt: number, completedAt: number, reason: CompletionReason): RoundTiming {
  const deadline = timeLimit === null ? null : startedAt + timeLimit * 1000;
  return { timeLimit, startedAt, completedAt, deadline, remainingSeconds: remainingSeconds(deadline, completedAt), reason };
}
