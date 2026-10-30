import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, type MatchHistory } from './store.js';

const directories: string[] = [];
function store() {
  const directory = mkdtempSync(join(tmpdir(), 'word-al-store-test-'));
  directories.push(directory);
  const file = join(directory, 'data.json');
  return { api: createStore(file), file };
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function result(id: string, overrides: Partial<MatchHistory> = {}): MatchHistory {
  return { id, playerId: 'guest-a', displayName: 'A Player', mode: 'multiplayer', difficulty: 'easy', distribution: 'same', matches: 1, rounds: 2, completedRounds: 2, roundsWon: 1, solvedRounds: 1, attempts: 3, completionTime: 12_000, points: 100, wins: 1, placement: 1, completedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('persistent profile store', () => {
  it('creates a stable guest profile, normalizes names, and preserves it across reloads', () => {
    const { api, file } = store();
    const first = api.getProfile('guest-a', '  Alex  ');
    expect(first.displayName).toBe('Alex');
    expect(api.getProfile('guest-a', 'Different')).toEqual(first);
    api.updateProfile('guest-a', ' New Name ');
    expect(createStore(file).getProfile('guest-a').displayName).toBe('New Name');
  });

  it('persists a completed result exactly once and recalculates stats from history', () => {
    const { api, file } = store();
    api.recordMatch(result('match-1'));
    api.recordMatch(result('match-1', { points: 900 }));
    const restarted = createStore(file);
    expect(restarted.listHistory('guest-a').total).toBe(1);
    expect(restarted.getStatistics('guest-a')).toMatchObject({ completedGames: 1, wins: 1, winRate: 1, roundsPlayed: 2, solvedRounds: 1, solveRate: 0.5, points: 100, averageAttemptsOnSolved: 3, currentStreak: 1, maxStreak: 1 });
  });

  it('handles zero denominators, streak resets, pagination, and owner-only detail lookup', () => {
    const { api } = store();
    expect(api.getStatistics('empty')).toMatchObject({ completedGames: 0, winRate: 0, solveRate: 0, averageAttemptsOnSolved: null });
    api.recordMatch(result('old', { wins: 1, completedAt: '2026-01-01T00:00:00.000Z' }));
    api.recordMatch(result('loss', { wins: 0, points: 0, solvedRounds: 0, roundsWon: 0, attempts: 0, completedAt: '2026-01-02T00:00:00.000Z' }));
    api.recordMatch(result('new', { wins: 1, completedAt: '2026-01-03T00:00:00.000Z' }));
    expect(api.getStatistics('guest-a')).toMatchObject({ currentStreak: 1, maxStreak: 1, completedGames: 3 });
    expect(api.listHistory('guest-a', 1, 2).items.map((item) => item.id)).toEqual(['new', 'loss']);
    expect(api.listHistory('guest-a', 2, 2).items.map((item) => item.id)).toEqual(['old']);
    expect(api.getHistoryItem('guest-b', 'new')).toBeUndefined();
    expect(api.getHistoryItem('guest-a', 'new')?.id).toBe('new');
  });

  it('does not publish an in-memory update when the atomic file commit fails', () => {
    const { api, file } = store();
    api.getProfile('guest-a', 'Original');
    unlinkSync(file);
    mkdirSync(file);
    expect(() => api.updateProfile('guest-a', 'Uncommitted')).toThrow();
    rmSync(file, { recursive: true, force: true });
    expect(api.getProfile('guest-a').displayName).toBe('Original');
  });

  it('refuses to replace malformed persisted data with an empty store', () => {
    const { file } = store();
    writeFileSync(file, '{ broken', 'utf8');
    expect(() => createStore(file)).toThrow(/refusing to start with empty data/);
    writeFileSync(file, JSON.stringify({ profiles: {}, history: { broken: { id: 'wrong' } } }), 'utf8');
    expect(() => createStore(file)).toThrow(/invalid history record/);
  });

  it('reports readiness when an absent data file can be created under a writable ancestor', () => {
    const directory = mkdtempSync(join(tmpdir(), 'word-al-ready-test-'));
    directories.push(directory);
    const api = createStore(join(directory, 'not-created-yet', 'data.json'));
    expect(api.persistenceReady()).toBe(true);
  });

  it('ranks only finalized multiplayer history, shares equal ranks, gates percentages, and bounds recent results', () => {
    const { api } = store();
    api.recordMatch(result('a-old', { completedAt: '2026-01-01T00:00:00.000Z', points: 500 }));
    api.recordMatch(result('a-new-1', { completedAt: '2026-01-20T00:00:00.000Z', points: 40 }));
    api.recordMatch(result('a-new-2', { completedAt: '2026-01-21T00:00:00.000Z', points: 40 }));
    api.recordMatch(result('b-new-1', { playerId: 'guest-b', displayName: 'B Player', completedAt: '2026-01-20T00:00:00.000Z', points: 40 }));
    api.recordMatch(result('b-new-2', { playerId: 'guest-b', displayName: 'B Player', completedAt: '2026-01-21T00:00:00.000Z', points: 40 }));
    api.recordMatch(result('practice', { playerId: 'guest-practice', mode: 'practice', points: 50_000 }));
    api.recordMatch(result('one-game', { playerId: 'guest-one', points: 90_000 }));

    const now = Date.parse('2026-02-01T00:00:00.000Z');
    const top = api.leaderboard('top', 1, 2, { now });
    expect(top.items.map(({ id, rank }) => [id, rank])).toEqual([['guest-one', 1], ['guest-a', 2]]);
    const tied = api.leaderboard('recent', 1, 10, { now, recentDays: 30 });
    expect(tied.items.filter((entry) => entry.metric === 80).map(({ rank }) => rank)).toEqual([1, 1]);
    expect(tied.items.some(({ id }) => id === 'guest-practice')).toBe(false);
    expect(tied.items.some(({ id }) => id === 'guest-a')).toBe(true);
    expect(api.leaderboard('winRate', 1, 10, { now, minGames: 2 }).items.map(({ id }) => id)).toEqual(['guest-a', 'guest-b']);
    const current = api.leaderboard('top', 2, 1, { now, playerId: 'guest-one' });
    expect(current.currentPlayer).toMatchObject({ id: 'guest-one', rank: 1, identityType: 'guest', isCurrentPlayer: true });
    expect(api.leaderboard('top', 1, 1, { now }).pageSize).toBe(1);
  });
});
