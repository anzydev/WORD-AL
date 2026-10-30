import { accessSync, constants, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export type Profile = { id: string; identityType: 'guest'; displayName: string; createdAt: string; updatedAt: string; games: number; wins: number; rounds: number; solvedRounds: number; points: number; currentStreak: number; maxStreak: number };
export type RoundSummary = { solved: boolean; attempts: number; timeLimit: number; remainingTime: number; baseScore: number; speedBonus: number; hintPenalty: number; finalScore: number; completionReason: string; completedAt: number };
export type MatchHistory = { id: string; playerId: string; displayName?: string; mode: 'practice' | 'multiplayer'; difficulty: 'easy' | 'hard'; distribution?: 'same' | 'random'; matches: number; rounds: number; completedRounds: number; roundsWon?: number; solvedRounds?: number; attempts?: number; completionTime?: number; points: number; wins: number; placement?: number; roundsSummary?: RoundSummary[]; completedAt: string };
export type PlayerStatistics = { completedGames: number; wins: number; winRate: number; roundsPlayed: number; solvedRounds: number; solveRate: number; points: number; averageAttemptsOnSolved: number | null; bestResult: MatchHistory | null; currentStreak: number; maxStreak: number };
export type LeaderboardCategory = 'top' | 'wins' | 'winRate' | 'solveRate' | 'recent';
type StoreData = { profiles: Record<string, Profile>; history: Record<string, MatchHistory> };

const StoreDataSchema = z.object({ profiles: z.record(z.string(), z.record(z.string(), z.unknown())), history: z.record(z.string(), z.record(z.string(), z.unknown())) });
const initial: StoreData = { profiles: {}, history: {} };
const now = () => new Date().toISOString();

function defaultProfile(id: string, displayName: string): Profile {
  const timestamp = now();
  return { id, identityType: 'guest', displayName: displayName.trim().slice(0, 20) || 'Player', createdAt: timestamp, updatedAt: timestamp, games: 0, wins: 0, rounds: 0, solvedRounds: 0, points: 0, currentStreak: 0, maxStreak: 0 };
}

function blankStats(): PlayerStatistics { return { completedGames: 0, wins: 0, winRate: 0, roundsPlayed: 0, solvedRounds: 0, solveRate: 0, points: 0, averageAttemptsOnSolved: null, bestResult: null, currentStreak: 0, maxStreak: 0 }; }

export function createStore(file: string) {
  let data: StoreData = initial;
  if (existsSync(file)) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(file, 'utf8')) as unknown; }
    catch (cause) { throw new Error(`Could not load persistence file ${file}; refusing to start with empty data. Check the file and its permissions.`, { cause }); }
    const parsed = StoreDataSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Persistence file ${file} has an invalid schema; refusing to overwrite it.`);
    const profiles = Object.fromEntries(Object.entries(parsed.data.profiles).map(([id, value]) => {
      if (typeof value.id !== 'string' || value.id !== id || (value.identityType !== undefined && value.identityType !== 'guest') || typeof value.displayName !== 'string') throw new Error(`Persistence file ${file} contains an invalid profile record.`);
      return [id, { ...value, identityType: 'guest' }];
    })) as Record<string, Profile>;
    const history = Object.fromEntries(Object.entries(parsed.data.history).map(([id, value]) => {
      if (typeof value.id !== 'string' || value.id !== id || typeof value.playerId !== 'string' || typeof value.completedAt !== 'string') throw new Error(`Persistence file ${file} contains an invalid history record.`);
      return [id, value];
    })) as Record<string, MatchHistory>;
    data = { profiles, history };
  }

  function commit(next: StoreData) {
    mkdirSync(dirname(file), { recursive: true });
    const temporaryFile = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporaryFile, JSON.stringify(next, null, 2), { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryFile, file);
    data = next;
  }

  function ensureProfile(source: StoreData, id: string, displayName = 'Player') {
    const existing = source.profiles[id];
    if (existing) return existing;
    const profile = defaultProfile(id, displayName);
    source.profiles[id] = profile;
    return profile;
  }

  function getStatistics(id: string): PlayerStatistics {
    const history = Object.values(data.history).filter((item) => item.playerId === id && item.completedAt).sort((left, right) => right.completedAt.localeCompare(left.completedAt));
    if (!history.length) return blankStats();
    const completedGames = history.length;
    const wins = history.reduce((total, result) => total + result.wins, 0);
    const roundsPlayed = history.reduce((total, result) => total + result.completedRounds, 0);
    const solvedRounds = history.reduce((total, result) => total + (result.solvedRounds ?? 0), 0);
    const points = history.reduce((total, result) => total + result.points, 0);
    const attempts = history.reduce((total, result) => total + (result.attempts ?? 0), 0);
    const currentStreak = history.slice(0, history.findIndex((result) => result.wins === 0) < 0 ? history.length : history.findIndex((result) => result.wins === 0)).length;
    let streak = 0;
    let maxStreak = 0;
    for (const result of [...history].reverse()) { streak = result.wins > 0 ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak); }
    const bestResult = [...history].sort((left, right) => right.points - left.points)[0] ?? null;
    return { completedGames, wins, winRate: wins / completedGames, roundsPlayed, solvedRounds, solveRate: roundsPlayed ? solvedRounds / roundsPlayed : 0, points, averageAttemptsOnSolved: solvedRounds ? attempts / solvedRounds : null, bestResult, currentStreak, maxStreak };
  }

  function getProfile(id: string, displayName = 'Player') {
    if (data.profiles[id]) return data.profiles[id];
    const next = structuredClone(data);
    const profile = ensureProfile(next, id, displayName);
    commit(next);
    return profile;
  }

  function updateProfile(id: string, displayName: string) {
    const next = structuredClone(data);
    const profile = ensureProfile(next, id);
    profile.displayName = displayName.trim().slice(0, 20) || profile.displayName;
    profile.updatedAt = now();
    commit(next);
    return profile;
  }

  function recordMatch(result: MatchHistory) {
    const existing = data.history[result.id];
    if (existing) return existing;
    const next = structuredClone(data);
    const profile = ensureProfile(next, result.playerId, result.displayName ?? 'Player');
    next.history[result.id] = { ...result, displayName: result.displayName ?? profile.displayName, roundsWon: result.roundsWon ?? 0, solvedRounds: result.solvedRounds ?? 0, attempts: result.attempts ?? 0, completionTime: result.completionTime ?? 0 };
    const playerHistory = Object.values(next.history).filter((item) => item.playerId === result.playerId).sort((left, right) => right.completedAt.localeCompare(left.completedAt));
    profile.games = playerHistory.length;
    profile.wins = playerHistory.reduce((total, item) => total + item.wins, 0);
    profile.rounds = playerHistory.reduce((total, item) => total + item.completedRounds, 0);
    profile.solvedRounds = playerHistory.reduce((total, item) => total + (item.solvedRounds ?? 0), 0);
    profile.points = playerHistory.reduce((total, item) => total + item.points, 0);
    profile.currentStreak = playerHistory.slice(0, playerHistory.findIndex((item) => item.wins === 0) < 0 ? playerHistory.length : playerHistory.findIndex((item) => item.wins === 0)).length;
    let streak = 0;
    profile.maxStreak = 0;
    for (const item of [...playerHistory].reverse()) { streak = item.wins > 0 ? streak + 1 : 0; profile.maxStreak = Math.max(profile.maxStreak, streak); }
    profile.updatedAt = now();
    commit(next);
    return data.history[result.id];
  }

  function listHistory(id: string, page = 1, pageSize = 20) {
    const rows = Object.values(data.history).filter((item) => item.playerId === id).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
  }

  function getHistoryItem(playerId: string, matchId: string) {
    return data.history[matchId]?.playerId === playerId ? data.history[matchId] : undefined;
  }

  function leaderboard(category: LeaderboardCategory = 'top', page = 1, pageSize = 25, options: { minGames?: number; minRounds?: number; recentDays?: number; playerId?: string; now?: number } = {}) {
    const cutoff = (options.now ?? Date.now()) - (options.recentDays ?? 30) * 24 * 60 * 60 * 1000;
    const groups = new Map<string, MatchHistory[]>();
    for (const result of Object.values(data.history)) {
      if (result.mode !== 'multiplayer' || !result.playerId || !Number.isFinite(Date.parse(result.completedAt)) || result.completedRounds <= 0 || result.rounds <= 0 || result.completedRounds > result.rounds || !Number.isInteger(result.points) || result.points < 0 || result.wins < 0 || result.wins > 1 || (result.roundsWon ?? 0) > result.completedRounds || (result.solvedRounds ?? 0) > result.completedRounds) continue;
      if (category === 'recent' && Date.parse(result.completedAt) < cutoff) continue;
      const rows = groups.get(result.playerId) ?? [];
      rows.push(result);
      groups.set(result.playerId, rows);
    }
    const entries = [...groups.entries()].map(([id, results]) => {
      const games = results.length;
      const rounds = results.reduce((total, result) => total + result.completedRounds, 0);
      const wins = results.reduce((total, result) => total + result.wins, 0);
      const solved = results.reduce((total, result) => total + (result.solvedRounds ?? 0), 0);
      const metric = category === 'wins' ? wins : category === 'winRate' ? wins / games : category === 'solveRate' ? (rounds ? solved / rounds : 0) : results.reduce((total, result) => total + result.points, 0);
      const latest = [...results].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
      return { id, displayName: data.profiles[id]?.displayName ?? latest?.displayName ?? 'Guest', identityType: 'guest' as const, metric, games, rounds, isCurrentPlayer: id === options.playerId };
    }).filter((entry) => category !== 'winRate' || entry.games >= (options.minGames ?? 5)).filter((entry) => category !== 'solveRate' || entry.rounds >= (options.minRounds ?? 25));
    entries.sort((left, right) => right.metric - left.metric || left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
    let previousMetric: number | undefined;
    let rank = 0;
    const ranked = entries.map((entry, index) => {
      if (previousMetric === undefined || entry.metric !== previousMetric) rank = index + 1;
      previousMetric = entry.metric;
      return { ...entry, rank };
    });
    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
    return { items: ranked.slice((safePage - 1) * safePageSize, safePage * safePageSize), total: ranked.length, page: safePage, pageSize: safePageSize, currentPlayer: options.playerId ? ranked.find(({ id }) => id === options.playerId) ?? null : null, recentDays: category === 'recent' ? options.recentDays ?? 30 : undefined, minimumGames: category === 'winRate' ? options.minGames ?? 5 : undefined, minimumRounds: category === 'solveRate' ? options.minRounds ?? 25 : undefined };
  }

  function persistenceReady() {
    try {
      if (existsSync(file)) accessSync(file, constants.R_OK | constants.W_OK);
      else {
        let directory = dirname(file);
        while (!existsSync(directory)) {
          const parent = dirname(directory);
          if (parent === directory) return false;
          directory = parent;
        }
        accessSync(directory, constants.W_OK);
      }
      return true;
    } catch { return false; }
  }

  return { getProfile, updateProfile, recordMatch, listHistory, getHistoryItem, getStatistics, leaderboard, persistenceReady };
}

const store = createStore(process.env.DATA_FILE ?? '.data/word-al.json');
export const getProfile = store.getProfile;
export const updateProfile = store.updateProfile;
export const recordMatch = store.recordMatch;
export const listHistory = store.listHistory;
export const getHistoryItem = store.getHistoryItem;
export const getStatistics = store.getStatistics;
export const leaderboard = store.leaderboard;
export const persistenceReady = store.persistenceReady;
