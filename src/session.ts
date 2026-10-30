import type { PracticeConfig, Difficulty } from './game.js';
import type { CompletionReason, RoundTiming } from './timer.js';

export type SessionStatus = 'ready' | 'in_progress' | 'between_rounds' | 'between_matches' | 'completed' | 'abandoned';
export type PracticeRoundResult = {
  id: string;
  matchNumber: number;
  roundNumber: number;
  difficulty: Difficulty;
  wordLength: number;
  timeLimit: PracticeConfig['timer'];
  reason: CompletionReason;
  attempts: number;
  hintUsed: boolean;
  timing: RoundTiming;
  answer: string;
};
export type PracticeSession = {
  config: PracticeConfig;
  status: SessionStatus;
  currentMatch: number;
  currentRound: number;
  roundResults: PracticeRoundResult[];
  startedAt: number;
  completedAt: number | null;
};

export function createPracticeSession(config: PracticeConfig, startedAt: number): PracticeSession {
  return { config, status: 'in_progress', currentMatch: 1, currentRound: 1, roundResults: [], startedAt, completedAt: null };
}

export function recordPracticeRound(session: PracticeSession, result: PracticeRoundResult): PracticeSession {
  if (session.status !== 'in_progress' || result.matchNumber !== session.currentMatch || result.roundNumber !== session.currentRound) return session;
  if (session.roundResults.some((item) => item.id === result.id)) return session;
  const roundResults = [...session.roundResults, result];
  const isLastRound = session.currentRound === session.config.rounds;
  const isLastMatch = session.currentMatch === session.config.matches;
  return {
    ...session,
    roundResults,
    status: isLastRound && isLastMatch ? 'completed' : isLastRound ? 'between_matches' : 'between_rounds',
    completedAt: isLastRound && isLastMatch ? result.timing.completedAt : null,
  };
}

export function advancePracticeSession(session: PracticeSession): PracticeSession {
  if (session.status === 'between_rounds') return { ...session, status: 'in_progress', currentRound: session.currentRound + 1 };
  if (session.status === 'between_matches') return { ...session, status: 'in_progress', currentMatch: session.currentMatch + 1, currentRound: 1 };
  return session;
}

export function abandonPracticeSession(session: PracticeSession, completedAt: number): PracticeSession {
  if (session.status === 'completed' || session.status === 'abandoned') return session;
  return { ...session, status: 'abandoned', completedAt };
}

export function summarizePracticeSession(session: PracticeSession) {
  const rounds = session.roundResults;
  const won = rounds.filter((round) => round.reason === 'won').length;
  const lost = rounds.filter((round) => round.reason === 'lost').length;
  const expired = rounds.filter((round) => round.reason === 'expired').length;
  return {
    matchesCompleted: new Set(rounds.filter((round) => round.roundNumber === session.config.rounds).map((round) => round.matchNumber)).size,
    roundsCompleted: rounds.length,
    won,
    lost,
    expired,
    winPercentage: rounds.length ? Math.round((won / rounds.length) * 100) : 0,
    attempts: rounds.reduce((total, round) => total + round.attempts, 0),
    rounds,
  };
}

export function summarizeMatch(session: PracticeSession, matchNumber: number) {
  const rounds = session.roundResults.filter((round) => round.matchNumber === matchNumber);
  return {
    roundsWon: rounds.filter((round) => round.reason === 'won').length,
    roundsLost: rounds.filter((round) => round.reason === 'lost').length,
    roundsExpired: rounds.filter((round) => round.reason === 'expired').length,
    attempts: rounds.reduce((total, round) => total + round.attempts, 0),
    roundsCompleted: rounds.length,
  };
}
