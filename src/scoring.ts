export type ScoreBreakdown = {
  solved: boolean;
  attempts: number;
  timeLimit: number;
  remainingTime: number;
  baseScore: number;
  speedBonus: number;
  hintPenalty: number;
  finalScore: number;
  completionReason: 'solved' | 'attempts_exhausted' | 'deadline';
  completedAt: number;
};

export type StandingScore = { total: number; roundsWon: number; attempts: number; completionTime: number };

export function createScoreBreakdown(input: {
  solved: boolean;
  attempts: number;
  timeLimit: number;
  remainingTime: number;
  hintUsed: boolean;
  completionReason: ScoreBreakdown['completionReason'];
  completedAt: number;
}): ScoreBreakdown {
  const remainingTime = Math.max(0, Math.min(input.timeLimit, Math.floor(input.remainingTime)));
  if (!input.solved) return {
    solved: false,
    attempts: input.attempts,
    timeLimit: input.timeLimit,
    remainingTime,
    baseScore: 0,
    speedBonus: 0,
    hintPenalty: 0,
    finalScore: 0,
    completionReason: input.completionReason,
    completedAt: input.completedAt,
  };
  if (!Number.isInteger(input.attempts) || input.attempts < 1) throw new RangeError('Solved rounds require at least one accepted attempt.');
  const baseScore = 120 - 15 * (input.attempts - 1);
  const speedBonus = Math.floor(5 * remainingTime / input.timeLimit);
  const hintPenalty = input.hintUsed ? 5 : 0;
  return {
    solved: true,
    attempts: input.attempts,
    timeLimit: input.timeLimit,
    remainingTime,
    baseScore,
    speedBonus,
    hintPenalty,
    finalScore: Math.max(0, baseScore + speedBonus - hintPenalty),
    completionReason: 'solved',
    completedAt: input.completedAt,
  };
}

export function compareStanding(left: StandingScore, right: StandingScore): number {
  return right.total - left.total
    || right.roundsWon - left.roundsWon
    || left.attempts - right.attempts
    || left.completionTime - right.completionTime;
}

export function placeStandings<T extends { score: StandingScore }>(items: readonly T[]) {
  const sorted = [...items].sort((left, right) => compareStanding(left.score, right.score));
  let previous: StandingScore | undefined;
  let place = 0;
  return sorted.map((item, index) => {
    if (!previous || compareStanding(previous, item.score) !== 0) place = index + 1;
    previous = item.score;
    return { ...item, place };
  });
}
