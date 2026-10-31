import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { randomBytes, randomUUID, randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import fastifyStatic from '@fastify/static';
import { DEFAULT_MULTIPLAYER_SETTINGS, feedbackFor, MultiplayerSettingsSchema, type Difficulty, type Feedback } from '../src/game.ts';
import { answerWords, selectAnswer } from '../src/dictionary.ts';
import { validateGuess } from '../src/validation.ts';
import { CHAOS_SELECT_EVENT, ChaosSelectionSchema, SERVICE_STATUS_EVENT, ServerStatusRequestSchema, ServerStatusSchema } from '../src/protocol.ts';
import { compareStanding, createScoreBreakdown, placeStandings, type ScoreBreakdown } from '../src/scoring.ts';
import { chaosAbilitySeconds, effectiveDeadline, winners as getWinners } from '../src/chaos.ts';
import { transitionLifecycle, type LifecycleState } from '../src/lifecycle.ts';
import { getHistoryItem, getProfile, getStatistics, leaderboard, listHistory, persistenceReady, recordMatch, updateProfile, type MatchHistory } from './store.js';
import { loadServerConfig } from './config.js';

const config = loadServerConfig(process.env);
const { PORT: port, HOST: host, clientOrigins } = config;
const app = Fastify({ logger: { level: config.LOG_LEVEL }, bodyLimit: config.REQUEST_BODY_LIMIT, requestIdHeader: 'x-request-id', genReqId: () => randomUUID() });
app.setErrorHandler((cause: Error & { statusCode?: number }, request, reply) => {
  const statusCode = cause.statusCode && cause.statusCode >= 400 && cause.statusCode < 600 ? cause.statusCode : 500;
  const code = statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : statusCode === 400 ? 'INVALID_INPUT' : statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED';
  const message = statusCode === 413 ? 'The request payload is too large.' : statusCode === 400 ? 'The request payload is invalid.' : statusCode >= 500 ? 'An internal server error occurred.' : 'The request could not be completed.';
  request.log[statusCode >= 500 ? 'error' : 'warn']({ err: statusCode >= 500 ? cause : undefined, requestId: request.id, statusCode, code }, 'Request failed');
  void reply.code(statusCode).send(error(code, message));
});
await app.register(cors, { origin: clientOrigins });
const staticRoot = resolve(process.cwd(), 'dist');
if (existsSync(staticRoot)) await app.register(fastifyStatic, { root: staticRoot, wildcard: false });

type MatchConfig = z.infer<typeof MultiplayerSettingsSchema>;
const defaultConfig: MatchConfig = DEFAULT_MULTIPLAYER_SETTINGS;
const answerPool = (difficulty: Difficulty) => answerWords[difficulty === 'easy' ? 5 : 6];
function chooseAnswer(difficulty: Difficulty) { const forced = process.env.NODE_ENV === 'test' ? process.env.WORDAL_TEST_ANSWER?.toLowerCase() : undefined; const length = difficulty === 'easy' ? 5 : 6; return forced && answerWords[length].includes(forced) ? forced : selectAnswer(length); }
function shuffledWords(words: readonly string[]) { const result = [...words]; for (let i = result.length - 1; i > 0; i -= 1) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; } return result; }
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });
const newRoomCode = () => { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes = randomBytes(5); return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join(''); };

type Player = { id: string; name: string; ready: boolean; connected: boolean; joinedAt: number; socketId?: string };
type PlayerRound = { guesses: { word: string; feedback: Feedback[] }[]; usedHint: boolean; status: 'active' | 'won' | 'lost' | 'expired'; completedAt?: number; result?: ScoreBreakdown };
type CompetitiveScore = { total: number; roundsWon: number; roundsCompleted: number; attempts: number; completionTime: number };
type Ability = 'strike' | 'boost';
type PendingAbility = { ownerId: string; targetId: string; ability: Ability; seconds: number; timer: MatchConfig['timer']; sourceMatchId: string; targetSessionId: string; targetMatchNumber: number };
type AppliedAbility = PendingAbility & { matchId: string; roundId: string; appliedAt: number };
type ChaosWindow = { sourceMatchId: string; nextMatchNumber: number; closesAt: number; eligible: Set<string>; selected: Set<string> };
type Match = { id: string; sessionId: string; number: number; config: MatchConfig; roundNumber: number; roundId: string; status: 'active' | 'results' | 'complete'; lifecycle: LifecycleState; startedAt: number; deadline: number; deadlines: Map<string, number>; answers: Map<string, string>; players: Map<string, PlayerRound>; roundResults: Map<string, ScoreBreakdown>; scores: Map<string, CompetitiveScore>; sessionScores: Map<string, CompetitiveScore>; archived: boolean; timeEffects: Map<string, number>; abilityEffects: Map<string, AppliedAbility[]> };
type ArchivedMatch = { sessionId: string; matchId: string; config: MatchConfig; scores: [string, CompetitiveScore][]; roundResults: [string, ScoreBreakdown][]; abilityEffects: AppliedAbility[]; completedAt: number };
type Room = { id: string; code: string; hostId: string; players: Map<string, Player>; status: 'waiting' | 'in_progress' | 'closed'; createdAt: number; lastActivity: number; revision: number; config: MatchConfig; match?: Match; timer?: NodeJS.Timeout; chaosTimer?: NodeJS.Timeout; chaosWindow?: ChaosWindow; consumedActions: Map<string, Set<string>>; pendingEffects: PendingAbility[]; abilityAudit: AppliedAbility[]; usedAbilities: Set<string>; abilityRequestIds: Set<string>; rematchReady: Set<string>; history: ArchivedMatch[] };
const rooms = new Map<string, Room>();
const SESSION_TTL_MS = config.SESSION_TTL_MS;
const sessions = new Map<string, { playerId: string; name: string; expiresAt: number }>();
const socketToSession = new Map<string, string>();
const createRequests = new Map<string, { roomId: string; expiresAt: number }>();
const profileChanges = new Map<string, { windowStarted: number; count: number }>();
const socketRateLimits = new Map<string, { windowStarted: number; count: number }>();
const sessionIssueLimits = new Map<string, { windowStarted: number; count: number }>();
function requestRateLimited(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  const entry = sessionIssueLimits.get(key) ?? { windowStarted: now, count: 0 };
  if (now - entry.windowStarted >= windowMs) { entry.windowStarted = now; entry.count = 0; }
  entry.count += 1;
  sessionIssueLimits.set(key, entry);
  if (sessionIssueLimits.size > 10_000) for (const [itemKey, item] of sessionIssueLimits) if (now - item.windowStarted > windowMs * 2) sessionIssueLimits.delete(itemKey);
  return entry.count > maximum;
}
function socketRateLimited(operation: string, playerId: string, max: number, windowMs: number) {
  const now = Date.now();
  const key = `${operation}:${playerId}`;
  const entry = socketRateLimits.get(key) ?? { windowStarted: now, count: 0 };
  if (now - entry.windowStarted >= windowMs) { entry.windowStarted = now; entry.count = 0; }
  entry.count += 1;
  socketRateLimits.set(key, entry);
  if (socketRateLimits.size > 10_000) for (const [itemKey, item] of socketRateLimits) if (now - item.windowStarted > windowMs * 2) socketRateLimits.delete(itemKey);
  return entry.count > max;
}
const persistenceTimers = new Set<NodeJS.Timeout>();

function publicRoom(room: Room) { return { code: room.code, status: room.status, hostId: room.hostId, revision: room.revision, config: room.config, rematchReadyCount: room.rematchReady.size, lifecycle: room.match?.lifecycle ?? 'LOBBY', players: [...room.players.values()].map((player) => ({ id: player.id, name: player.name, ready: player.ready, connected: player.connected, isHost: player.id === room.hostId, rematchReady: room.rematchReady.has(player.id) })) }; }
function publicMatch(room: Room) { const match = room.match; if (!match) return null; const placements = new Map(placeStandings([...match.scores.entries()].map(([id, score]) => ({ id, score }))).map((standing) => [standing.id, standing.place])); const sessionPlacements = new Map(placeStandings([...match.sessionScores.entries()].map(([id, score]) => ({ id, score }))).map((standing) => [standing.id, standing.place])); return { id: match.id, number: match.number, roundNumber: match.roundNumber, roundId: match.roundId, status: match.status, deadline: match.deadline, config: match.config, players: [...room.players.values()].map((player) => { const round = match.players.get(player.id); const score = match.scores.get(player.id); const sessionScore = match.sessionScores.get(player.id); return { id: player.id, name: player.name, connected: player.connected, guesses: round?.guesses.length ?? 0, status: round?.status ?? 'active', score: score?.total ?? 0, roundsWon: score?.roundsWon ?? 0, roundsCompleted: score?.roundsCompleted ?? 0, attempts: score?.attempts ?? 0, completionTime: score?.completionTime ?? 0, place: placements.get(player.id) ?? 1, sessionScore: sessionScore?.total ?? 0, sessionPlace: sessionPlacements.get(player.id) ?? 1, timeEffect: match.timeEffects.get(player.id) ?? 0, roundResult: match.status === 'active' ? undefined : match.roundResults.get(`${match.roundId}:${player.id}`) }; }) }; }
function privateMatch(room: Room, playerId: string) { const match = room.match; const round = match?.players.get(playerId); if (!match || !round) return null; return { ...publicMatch(room), deadline: match.deadlines.get(playerId) ?? match.deadline, answer: match.status === 'results' || match.status === 'complete' ? match.answers.get(playerId) : undefined, guesses: round.guesses, usedHint: round.usedHint, ownStatus: round.status, score: match.scores.get(playerId), abilityEffects: match.abilityEffects.get(playerId) ?? [] }; }
function socketFor(room: Room, playerId: string) { const socketId = room.players.get(playerId)?.socketId; return socketId ? io.sockets.sockets.get(socketId) : undefined; }
function broadcastRoom(room: Room) { room.revision += 1; room.lastActivity = Date.now(); io.to(room.code).emit('room:update', publicRoom(room)); }
function broadcastMatch(room: Room) { io.to(room.code).emit('match:progress', publicMatch(room)); room.players.forEach((player) => { const socket = socketFor(room, player.id); const payload = privateMatch(room, player.id); if (socket && payload) socket.emit('match:state', payload); }); }
function findRoom(code: string) { const normalized = code.trim().toUpperCase(); return [...rooms.values()].find((room) => room.code === normalized); }
function membership(socket: SocketLike, roomCode: string) { const session = sessions.get(socketToSession.get(socket.id) ?? ''); const room = findRoom(roomCode); const player = session && room?.players.get(session.playerId); return session && room && player?.socketId === socket.id && player.connected ? { session, room, player } : null; }
function rankedScores(match: Match) { return [...match.scores.entries()].sort(([, left], [, right]) => compareStanding(left, right)); }
type SocketLike = { id: string; data: Record<string, unknown>; join: (room: string) => Promise<void> | void; leave: (room: string) => Promise<void> | void; emit: (event: string, payload: unknown) => boolean };

function persistFinalResult(room: Room, result: MatchHistory, attempt = 1) {
  try {
    recordMatch(result);
    if (rooms.get(room.id) === room) io.to(room.code).emit('match:persistence', { resultId: result.id, status: 'saved' });
  } catch (cause) {
    app.log.error({ err: cause, resultId: result.id, attempt }, 'Could not persist finalized match result');
    if (rooms.get(room.id) === room) io.to(room.code).emit('match:persistence', { resultId: result.id, status: attempt < 5 ? 'retrying' : 'failed' });
    if (attempt >= 5) return;
    const timer = setTimeout(() => { persistenceTimers.delete(timer); persistFinalResult(room, result, attempt + 1); }, Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
    timer.unref();
    persistenceTimers.add(timer);
  }
}

function finalizeRound(room: Room, reason: 'deadline' | 'complete') {
  const match = room.match;
  if (!match || match.status !== 'active') return;
  match.status = 'results';
  match.lifecycle = transitionLifecycle(match.lifecycle, match.roundNumber === match.config.rounds ? 'MATCH_RESULTS' : 'ROUND_RESULTS');
  if (room.timer) clearTimeout(room.timer);
  room.timer = undefined;
  match.players.forEach((round, playerId) => {
    if (round.status === 'active') round.status = reason === 'deadline' ? 'expired' : 'lost';
    round.completedAt ??= Date.now();
    const deadline = match.deadlines.get(playerId) ?? match.deadline;
    const solved = round.status === 'won';
    const remaining = Math.max(0, (deadline - round.completedAt) / 1000);
    const result = createScoreBreakdown({ solved, attempts: round.guesses.length, timeLimit: match.config.timer, remainingTime: remaining, hintUsed: round.usedHint, completionReason: solved ? 'solved' : round.status === 'expired' ? 'deadline' : 'attempts_exhausted', completedAt: round.completedAt });
    round.result = result;
    match.roundResults.set(`${match.roundId}:${playerId}`, result);
    const previous = match.scores.get(playerId) ?? { total: 0, roundsWon: 0, roundsCompleted: 0, attempts: 0, completionTime: 0 };
    const delta: CompetitiveScore = { total: result.finalScore, roundsWon: solved ? 1 : 0, roundsCompleted: 1, attempts: solved ? round.guesses.length : 0, completionTime: solved ? Math.max(0, round.completedAt - match.startedAt) : 0 };
    match.scores.set(playerId, { total: previous.total + delta.total, roundsWon: previous.roundsWon + delta.roundsWon, roundsCompleted: previous.roundsCompleted + 1, attempts: previous.attempts + delta.attempts, completionTime: previous.completionTime + delta.completionTime });
    const sessionPrevious = match.sessionScores.get(playerId) ?? { total: 0, roundsWon: 0, roundsCompleted: 0, attempts: 0, completionTime: 0 };
    match.sessionScores.set(playerId, { total: sessionPrevious.total + delta.total, roundsWon: sessionPrevious.roundsWon + delta.roundsWon, roundsCompleted: sessionPrevious.roundsCompleted + 1, attempts: sessionPrevious.attempts + delta.attempts, completionTime: sessionPrevious.completionTime + delta.completionTime });
  });
  const finalSessionMatch = match.number === match.config.matches && match.roundNumber === match.config.rounds;
  if (match.roundNumber === match.config.rounds && !match.archived) {
    room.history.push({ sessionId: match.sessionId, matchId: match.id, config: { ...match.config }, scores: [...match.scores.entries()].map(([id, score]) => [id, { ...score }]), roundResults: [...match.roundResults.entries()].map(([key, result]) => [key, { ...result }]), abilityEffects: room.abilityAudit.filter((effect) => effect.matchId === match.id).map((effect) => ({ ...effect })), completedAt: Date.now() });
    match.archived = true;
  }
  if (finalSessionMatch) {
    const ranking = [...match.sessionScores.entries()].sort(([, left], [, right]) => compareStanding(left, right));
    const top = ranking[0]?.[1];
    const winners = ranking.filter(([, score]) => top && compareStanding(score, top) === 0).map(([playerId]) => playerId);
    const placements = new Map(placeStandings(ranking.map(([id, score]) => ({ id, score }))).map((standing) => [standing.id, standing.place]));
    match.sessionScores.forEach((score, playerId) => {
      const player = room.players.get(playerId);
      if (player) persistFinalResult(room, { id: `${match.sessionId}:${playerId}`, playerId, displayName: player.name, mode: 'multiplayer', difficulty: match.config.difficulty, distribution: match.config.distribution, matches: match.config.matches, rounds: match.config.rounds, completedRounds: score.roundsCompleted, roundsWon: score.roundsWon, solvedRounds: score.roundsWon, attempts: score.attempts, completionTime: score.completionTime, points: score.total, wins: winners.includes(playerId) ? 1 : 0, placement: placements.get(playerId) ?? ranking.length, roundsSummary: [...match.roundResults.entries()].filter(([key]) => key.endsWith(`:${playerId}`)).map(([, result]) => result), completedAt: new Date().toISOString() });
    });
  }
  broadcastMatch(room);
  io.to(room.code).emit('round:results', { matchId: match.id, roundId: match.roundId, revision: room.revision });
}

function scheduleRoundDeadline(room: Room, roundId: string) {
  const match = room.match;
  if (!match || match.roundId !== roundId) return;
  const remainingDeadlines = [...match.players.entries()].filter(([, playerRound]) => playerRound.status === 'active').map(([playerId]) => match.deadlines.get(playerId) ?? match.deadline);
  if (!remainingDeadlines.length) return finalizeRound(room, 'complete');
  if (room.timer) clearTimeout(room.timer);
  const nextDeadline = Math.min(...remainingDeadlines);
  room.timer = setTimeout(() => { if (room.match?.roundId === roundId) expireDuePlayers(room); }, Math.max(0, nextDeadline - Date.now()) + 20);
}

function expireDuePlayers(room: Room) {
  const match = room.match;
  if (!match || match.status !== 'active') return;
  const now = Date.now();
  match.players.forEach((round, playerId) => {
    const deadline = match.deadlines.get(playerId) ?? match.deadline;
    if (round.status === 'active' && now >= deadline) { round.status = 'expired'; round.completedAt = deadline; }
  });
  if ([...match.players.values()].every((round) => round.status !== 'active')) finalizeRound(room, 'complete');
  else { broadcastMatch(room); scheduleRoundDeadline(room, match.roundId); }
}

function startRound(room: Room) {
  const match = room.match;
  if (!match) return;
  match.lifecycle = transitionLifecycle(match.lifecycle, 'ROUND_STARTING');
  match.roundId = randomUUID();
  match.roundNumber += 1;
  match.status = 'active';
  match.startedAt = Date.now();
  match.deadline = match.startedAt + match.config.timer * 1000;
  match.deadlines = new Map();
  match.answers = new Map();
  match.players = new Map();
  match.timeEffects = new Map();
  match.abilityEffects = new Map();
  const pool = answerPool(match.config.difficulty);
  const shuffled = shuffledWords(pool);
  const first = chooseAnswer(match.config.difficulty);
  const matchAbilities = match.roundNumber === 1 ? room.pendingEffects.filter((effect) => effect.targetSessionId === match.sessionId && effect.targetMatchNumber === match.number) : [];
  [...room.players.values()].filter((player) => player.connected).forEach((player, index) => {
    const effects = matchAbilities.filter((effect) => effect.targetId === player.id);
    const deadline = effectiveDeadline(match.startedAt, match.config.timer, effects);
    match.deadlines.set(player.id, deadline);
    match.timeEffects.set(player.id, Math.round((deadline - match.deadline) / 1000));
    const appliedAt = Date.now();
    const audit = effects.map((effect) => ({ ...effect, matchId: match.id, roundId: match.roundId, appliedAt }));
    match.abilityEffects.set(player.id, audit);
    room.abilityAudit.push(...audit);
    match.answers.set(player.id, match.config.distribution === 'same' ? first : shuffled[index % shuffled.length]);
    match.players.set(player.id, { guesses: [], usedHint: false, status: 'active' });
    const emptyScore = { total: 0, roundsWon: 0, roundsCompleted: 0, attempts: 0, completionTime: 0 };
    match.scores.set(player.id, match.scores.get(player.id) ?? emptyScore);
    match.sessionScores.set(player.id, match.sessionScores.get(player.id) ?? { ...emptyScore });
  });
  if (match.roundNumber === 1) room.pendingEffects = room.pendingEffects.filter((effect) => !(effect.targetSessionId === match.sessionId && effect.targetMatchNumber === match.number));
  match.lifecycle = transitionLifecycle(match.lifecycle, 'ROUND_ACTIVE');
  scheduleRoundDeadline(room, match.roundId);
  broadcastMatch(room);
}
function startMatch(room: Room) { room.status = 'in_progress'; room.match = { id: randomUUID(), sessionId: randomUUID(), number: 1, config: { ...room.config }, roundNumber: 0, roundId: '', status: 'active', lifecycle: 'LOBBY', startedAt: 0, deadline: 0, deadlines: new Map(), answers: new Map(), players: new Map(), roundResults: new Map(), scores: new Map(), sessionScores: new Map(), archived: false, timeEffects: new Map(), abilityEffects: new Map() }; if (room.chaosTimer) clearTimeout(room.chaosTimer); room.chaosTimer = undefined; room.chaosWindow = undefined; room.rematchReady.clear(); room.usedAbilities.clear(); room.abilityRequestIds.clear(); room.pendingEffects = []; broadcastRoom(room); startRound(room); io.to(room.code).emit('match:started', publicMatch(room)); }

function beginNextMatch(room: Room, previous: Match) {
  if (room.timer) clearTimeout(room.timer);
  room.match = { ...previous, id: randomUUID(), number: previous.number + 1, roundNumber: 0, roundId: '', status: 'active', lifecycle: transitionLifecycle(previous.lifecycle, 'LOBBY'), answers: new Map(), players: new Map(), scores: new Map(), deadlines: new Map(), archived: false, timeEffects: new Map(), abilityEffects: new Map() };
  startRound(room);
  io.to(room.code).emit('match:started', publicMatch(room));
}

function finishChaosSelection(room: Room, sourceMatchId: string) {
  const window = room.chaosWindow;
  const match = room.match;
  if (!window || !match || window.sourceMatchId !== sourceMatchId || match.id !== sourceMatchId || match.lifecycle !== 'MATCH_RESULTS') return;
  if (room.chaosTimer) clearTimeout(room.chaosTimer);
  room.chaosTimer = undefined;
  room.chaosWindow = undefined;
  io.to(room.code).emit('chaos:resolved', { matchId: sourceMatchId, nextMatchNumber: window.nextMatchNumber, selectedCount: window.selected.size });
  beginNextMatch(room, match);
}

function openChaosSelection(room: Room, match: Match): number | undefined {
  const eligible = new Set(getWinners([...match.scores.entries()].map(([id, score]) => ({ id, score }))).map(({ id }) => id));
  if (!eligible.size) { beginNextMatch(room, match); return undefined; }
  const closesAt = Date.now() + 30_000;
  room.chaosWindow = { sourceMatchId: match.id, nextMatchNumber: match.number + 1, closesAt, eligible, selected: new Set() };
  eligible.forEach((playerId) => socketFor(room, playerId)?.emit('chaos:available', { matchId: match.id, nextMatchNumber: match.number + 1, closesAt, timer: match.config.timer, options: ['strike', 'boost'] }));
  room.chaosTimer = setTimeout(() => finishChaosSelection(room, match.id), Math.max(0, closesAt - Date.now()));
  return closesAt;
}

app.get('/health', async () => ({ status: 'ok', service: 'word-al-server', timestamp: new Date().toISOString() }));
app.get('/ready', async (_request, reply) => { const ready = persistenceReady(); if (!ready) reply.code(503); return { status: ready ? 'ready' : 'not_ready', rooms: rooms.size, activePlayers: [...rooms.values()].reduce((total, room) => total + [...room.players.values()].filter((player) => player.connected).length, 0) }; });
function authenticatedPlayer(request: { headers: { authorization?: string } }) { const token = request.headers.authorization?.replace(/^Bearer\s+/i, ''); const session = token ? sessions.get(token) : undefined; return session && session.expiresAt > Date.now() ? session : undefined; }
app.post('/api/session', async (request, reply) => {
  if (!z.object({}).strict().safeParse(request.body ?? {}).success) return reply.code(400).send(error('INVALID_INPUT', 'Session requests must have an empty JSON body.'));
  if (requestRateLimited(request.ip || 'unknown', 20, 60_000)) return reply.code(429).send(error('RATE_LIMITED', 'Please wait before starting another guest session.'));
  const sessionToken = randomBytes(24).toString('hex');
  const session = { playerId: randomUUID(), name: 'Player', expiresAt: Date.now() + SESSION_TTL_MS };
  sessions.set(sessionToken, session);
  return reply.header('Cache-Control', 'no-store').send({ sessionToken, playerId: session.playerId, expiresAt: session.expiresAt });
});
app.get('/api/profile', async (request, reply) => { const session = authenticatedPlayer(request); if (!session) return reply.code(401).send(error('UNAUTHORIZED', 'A valid guest session is required.')); return { ...getProfile(session.playerId, session.name), identityType: 'guest', crossDevicePersistence: false }; });
app.get('/api/profile/stats', async (request, reply) => { const session = authenticatedPlayer(request); if (!session) return reply.code(401).send(error('UNAUTHORIZED', 'A valid guest session is required.')); return getStatistics(session.playerId); });
app.patch('/api/profile', async (request, reply) => {
  const session = authenticatedPlayer(request);
  if (!session) return reply.code(401).send(error('UNAUTHORIZED', 'A valid guest session is required.'));
  const parsed = z.object({ displayName: z.string().trim().min(1).max(20).refine((value) => !/[\x00-\x1f\x7f]/.test(value), 'Display name contains unsupported characters.') }).strict().safeParse(request.body);
  if (!parsed.success) return reply.code(400).send(error('INVALID_INPUT', 'Display name must be 1–20 printable characters.'));
  const now = Date.now();
  const limit = profileChanges.get(session.playerId) ?? { windowStarted: now, count: 0 };
  if (now - limit.windowStarted >= 60_000) { limit.windowStarted = now; limit.count = 0; }
  if (limit.count >= 10) return reply.code(429).send(error('RATE_LIMITED', 'Please wait before updating your display name again.'));
  limit.count += 1;
  profileChanges.set(session.playerId, limit);
  session.name = parsed.data.displayName;
  sessions.forEach((candidate) => { if (candidate.playerId === session.playerId) candidate.name = session.name; });
  rooms.forEach((room) => { const player = room.players.get(session.playerId); if (player) { player.name = session.name; broadcastRoom(room); } });
  return updateProfile(session.playerId, parsed.data.displayName);
});
app.get('/api/history', async (request, reply) => {
  const session = authenticatedPlayer(request);
  if (!session) return reply.code(401).send(error('UNAUTHORIZED', 'A valid guest session is required.'));
  const parsed = z.object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict().safeParse(request.query);
  if (!parsed.success) return reply.code(400).send(error('INVALID_INPUT', 'History pagination must use page ≥ 1 and pageSize between 1 and 50.'));
  return listHistory(session.playerId, parsed.data.page, parsed.data.pageSize);
});
app.get('/api/history/:matchId', async (request, reply) => {
  const session = authenticatedPlayer(request);
  if (!session) return reply.code(401).send(error('UNAUTHORIZED', 'A valid guest session is required.'));
  const { matchId } = request.params as { matchId: string };
  const result = getHistoryItem(session.playerId, matchId);
  if (!result) return reply.code(404).send(error('NOT_FOUND', 'That completed result is unavailable.'));
  return result;
});
app.get('/api/leaderboard', async (request, reply) => {
  const query = z.object({ category: z.enum(['top', 'wins', 'winRate', 'solveRate', 'recent']).default('top'), page: z.coerce.number().int().min(1).max(1_000_000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict().safeParse(request.query);
  if (!query.success) return reply.code(400).send(error('INVALID_INPUT', 'Choose a supported leaderboard and a valid page/pageSize.'));
  const session = authenticatedPlayer(request);
  const result = leaderboard(query.data.category, query.data.page, query.data.pageSize, { minGames: config.LEADERBOARD_MIN_GAMES, minRounds: config.LEADERBOARD_MIN_ROUNDS, recentDays: config.LEADERBOARD_RECENT_DAYS, playerId: session?.playerId });
  return { category: query.data.category, ...result };
});
app.setNotFoundHandler((request, reply) => { if (request.method === 'GET' && request.headers.accept?.includes('text/html') && existsSync(resolve(staticRoot, 'index.html'))) return reply.sendFile('index.html'); return reply.code(404).send(error('NOT_FOUND', 'The requested resource was not found.')); });

const io = new Server(app.server, { cors: { origin: clientOrigins }, maxHttpBufferSize: config.REQUEST_BODY_LIMIT, allowRequest: (request, callback) => { const origin = request.headers.origin; callback(null, !origin || clientOrigins.includes(origin)); } });
io.on('connection', async (socket) => {
  const provided = typeof socket.handshake.auth?.sessionToken === 'string' ? socket.handshake.auth.sessionToken : '';
  const previous = provided ? sessions.get(provided) : undefined;
  const sessionToken = previous && previous.expiresAt > Date.now() ? provided : randomBytes(24).toString('hex');
  const session = sessions.get(sessionToken) ?? { playerId: randomUUID(), name: 'Player', expiresAt: Date.now() + SESSION_TTL_MS };
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionToken, session); socketToSession.set(socket.id, sessionToken); socket.data.sessionToken = sessionToken; socket.data.playerId = session.playerId; socket.emit('session:ready', { sessionToken, playerId: session.playerId, expiresAt: session.expiresAt });
  socket.use((packet, next) => {
    const limits: Record<string, number> = { 'room:create': 5, 'room:join': 15, 'round:guess': 60, 'chaos:select': 10 };
    const maximum = limits[String(packet[0])];
    if (!maximum || !socketRateLimited(String(packet[0]), session.playerId, maximum, 60_000)) return next();
    const acknowledge = packet[packet.length - 1];
    if (typeof acknowledge === 'function') (acknowledge as (payload: unknown) => void)(error('RATE_LIMITED', 'Please wait before trying that again.'));
  });
  socket.on(SERVICE_STATUS_EVENT, (payload: unknown, reply?: (response: unknown) => void) => { if (!ServerStatusRequestSchema.safeParse(payload).success) return reply?.(error('INVALID_INPUT', 'Invalid status request.')); const activePlayers = [...rooms.values()].reduce((total, room) => total + [...room.players.values()].filter((player) => player.connected).length, 0); const status = ServerStatusSchema.parse({ status: 'ok', service: 'word-al-server', activeRooms: rooms.size, activePlayers }); reply?.({ ok: true, status }); });
  for (const room of rooms.values()) { const player = room.players.get(session.playerId); if (player) { player.connected = true; player.socketId = socket.id; await socket.join(room.code); socket.emit('room:update', publicRoom(room)); if (room.match) { socket.emit('match:progress', publicMatch(room)); const own = privateMatch(room, player.id); if (own) socket.emit('match:state', own); } const window = room.chaosWindow; if (window?.eligible.has(player.id) && !window.selected.has(player.id)) socket.emit('chaos:available', { matchId: window.sourceMatchId, nextMatchNumber: window.nextMatchNumber, closesAt: window.closesAt, timer: room.match?.config.timer, options: ['strike', 'boost'] }); } }

  socket.on('room:create', async (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ name: z.string().trim().min(1).max(20), requestId: z.string().max(80).optional() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'Enter a display name.')); const playerId = session.playerId; const requestKey = data.data.requestId ? `${playerId}:${data.data.requestId}` : undefined; const prior = requestKey ? createRequests.get(requestKey) : undefined; const priorRoom = prior && prior.expiresAt > Date.now() ? rooms.get(prior.roomId) : undefined; if (priorRoom) { await socket.join(priorRoom.code); reply?.({ ok: true, room: publicRoom(priorRoom), duplicate: true }); return; } const existing = [...rooms.values()].find((room) => room.players.has(playerId) && room.status !== 'closed'); if (existing) return reply?.(error('ALREADY_IN_ROOM', 'You are already in a room.')); session.name = data.data.name; let code = newRoomCode(); while (findRoom(code)) code = newRoomCode(); const player: Player = { id: playerId, name: session.name, ready: true, connected: true, joinedAt: Date.now(), socketId: socket.id }; const room: Room = { id: randomUUID(), code, hostId: playerId, players: new Map([[playerId, player]]), status: 'waiting', createdAt: Date.now(), lastActivity: Date.now(), revision: 0, config: { ...defaultConfig }, consumedActions: new Map(), pendingEffects: [], abilityAudit: [], usedAbilities: new Set(), abilityRequestIds: new Set(), rematchReady: new Set(), history: [] }; rooms.set(room.id, room); if (requestKey) createRequests.set(requestKey, { roomId: room.id, expiresAt: Date.now() + 10 * 60_000 }); await socket.join(room.code); broadcastRoom(room); reply?.({ ok: true, room: publicRoom(room) }); });
  socket.on('room:join', async (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string().trim().min(5).max(5), name: z.string().trim().min(1).max(20) }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'Enter a five-character room code and a display name.')); const room = findRoom(data.data.roomCode); if (!room || room.status === 'closed') return reply?.(error('ROOM_NOT_FOUND', 'That room is unavailable.')); if (room.status !== 'waiting') return reply?.(error('MATCH_STARTED', 'That match has already started.')); const existing = room.players.get(session.playerId); if (existing) { existing.connected = true; existing.socketId = socket.id; await socket.join(room.code); broadcastRoom(room); return reply?.({ ok: true, room: publicRoom(room) }); } if (room.players.size >= room.config.playerCount) return reply?.(error('ROOM_FULL', `That room is set for ${room.config.playerCount} players.`)); session.name = data.data.name; room.players.set(session.playerId, { id: session.playerId, name: session.name, ready: false, connected: true, joinedAt: Date.now(), socketId: socket.id }); await socket.join(room.code); broadcastRoom(room); reply?.({ ok: true, room: publicRoom(room) }); });
  socket.on('room:state', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string() }).safeParse(payload); const found = data.success ? membership(socket, data.data.roomCode) : null; if (!found) return reply?.(error('NOT_MEMBER', 'You are not in that room.')); reply?.({ ok: true, room: publicRoom(found.room), match: privateMatch(found.room, found.player.id) }); });
  socket.on('room:ready', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string(), ready: z.boolean(), revision: z.number().int().optional() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'That readiness change is invalid.')); const found = membership(socket, data.data.roomCode); if (!found) return reply?.(error('NOT_MEMBER', 'You are not in that room.')); if (found.room.status !== 'waiting') return reply?.(error('ROOM_LOCKED', 'Readiness is locked after the match starts.')); found.player.ready = data.data.ready; broadcastRoom(found.room); reply?.({ ok: true }); });
  socket.on('room:config:update', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string(), config: MultiplayerSettingsSchema, revision: z.number().int().optional() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_CONFIG', 'Those match settings are not valid.')); const found = membership(socket, data.data.roomCode); if (!found) return reply?.(error('NOT_MEMBER', 'You are not in a room.')); if (found.room.hostId !== found.player.id) return reply?.(error('FORBIDDEN', 'Only the host can change match settings.')); const rematchConfigurable = found.room.match?.lifecycle === 'SESSION_COMPLETE'; if (found.room.status !== 'waiting' && !rematchConfigurable) return reply?.(error('ROOM_LOCKED', 'Match settings are locked.')); if (data.data.config.playerCount < [...found.room.players.values()].length) return reply?.(error('INVALID_CONFIG', 'Player count cannot be below the current room size.')); if (data.data.revision !== undefined && data.data.revision !== found.room.revision) return reply?.(error('STALE_REVISION', 'The room changed. Refreshing its latest state.')); found.room.config = data.data.config; broadcastRoom(found.room); reply?.({ ok: true }); });
  socket.on('room:start', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string(), revision: z.number().int().optional() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'That start request is invalid.')); const found = membership(socket, data.data.roomCode); if (!found) return reply?.(error('NOT_MEMBER', 'You are not in that room.')); if (found.room.hostId !== found.player.id) return reply?.(error('FORBIDDEN', 'Only the host can start the match.')); if (found.room.status !== 'waiting') return reply?.(error('ROOM_LOCKED', 'This match has already started.')); const players = [...found.room.players.values()].filter((player) => player.connected); if (players.length < 2) return reply?.(error('NOT_ENOUGH_PLAYERS', 'At least 2 connected players are required to start the match.')); found.player.ready = true; if (players.some((player) => !player.ready)) return reply?.(error('NOT_READY', 'Everyone must be ready before the match starts.')); if (found.room.config.playerCount > players.length) found.room.config.playerCount = Math.max(2, players.length); startMatch(found.room); reply?.({ ok: true }); });
  socket.on('room:leave', async (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string() }).safeParse(payload); const found = data.success ? membership(socket, data.data.roomCode) : null; if (!found) return reply?.(error('NOT_MEMBER', 'You are not in that room.')); found.room.players.delete(found.player.id); found.room.chaosWindow?.eligible.delete(found.player.id); found.room.chaosWindow?.selected.delete(found.player.id); await socket.leave(found.room.code); if (found.room.players.size === 0) { if (found.room.timer) clearTimeout(found.room.timer); if (found.room.chaosTimer) clearTimeout(found.room.chaosTimer); found.room.chaosWindow = undefined; rooms.delete(found.room.id); } else { if (found.room.hostId === found.player.id) found.room.hostId = [...found.room.players.keys()][0]; broadcastRoom(found.room); if (found.room.chaosWindow && [...found.room.chaosWindow.eligible].every((playerId) => found.room.chaosWindow!.selected.has(playerId))) finishChaosSelection(found.room, found.room.chaosWindow.sourceMatchId); } reply?.({ ok: true }); });
  socket.on('round:guess', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string(), matchId: z.string(), roundId: z.string(), actionId: z.string().min(1).max(80), guess: z.string().max(8), revision: z.number().int().optional() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'That guess could not be submitted.')); const found = membership(socket, data.data.roomCode); const match = found?.room.match; if (!found || !match) return reply?.(error('NOT_IN_MATCH', 'You are not in an active match.')); if (match.id !== data.data.matchId || match.roundId !== data.data.roundId || match.status !== 'active') return reply?.(error('STALE_ROUND', 'That round is no longer active.')); if (Date.now() >= (match.deadlines.get(found.player.id) ?? match.deadline)) { expireDuePlayers(found.room); return reply?.(error('DEADLINE', 'Time has expired for this round.')); } const actions = found.room.consumedActions.get(found.player.id) ?? new Set<string>(); if (actions.has(data.data.actionId)) return reply?.({ ok: true, duplicate: true, state: privateMatch(found.room, found.player.id) }); const round = match.players.get(found.player.id)!; const length = match.config.difficulty === 'easy' ? 5 : 6; const validation = validateGuess(data.data.guess, { length, active: round.status === 'active', strict: match.config.strict, rows: round.guesses }); if (!validation.valid) { const codes = { invalid_input: 'INVALID_INPUT', invalid_characters: 'INVALID_CHARACTERS', incorrect_length: 'INCORRECT_LENGTH', word_not_found: 'WORD_NOT_FOUND', round_not_active: 'ROUND_COMPLETE', strict_mode_violation: 'STRICT_MODE' }; return reply?.(error(codes[validation.reason], validation.message)); } const guess = validation.guess; actions.add(data.data.actionId); found.room.consumedActions.set(found.player.id, actions); const answer = match.answers.get(found.player.id)!; round.guesses.push({ word: guess, feedback: feedbackFor(answer, guess) }); if (guess === answer) round.status = 'won'; else if (round.guesses.length >= (match.config.difficulty === 'easy' ? 6 : 8)) round.status = 'lost'; if (round.status !== 'active') round.completedAt = Date.now(); broadcastMatch(found.room); reply?.({ ok: true, state: privateMatch(found.room, found.player.id) }); if ([...match.players.values()].every((item) => item.status !== 'active')) finalizeRound(found.room, 'complete'); });
  socket.on('round:hint', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string(), matchId: z.string(), roundId: z.string() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'That hint request is invalid.')); const found = membership(socket, data.data.roomCode); const match = found?.room.match; if (!found || !match || match.id !== data.data.matchId || match.roundId !== data.data.roundId || match.status !== 'active') return reply?.(error('STALE_ROUND', 'That round is no longer active.')); const round = match.players.get(found.player.id)!; if (Date.now() >= (match.deadlines.get(found.player.id) ?? match.deadline)) { expireDuePlayers(found.room); return reply?.(error('DEADLINE', 'Time has expired for this round.')); } if (round.status !== 'active') return reply?.(error('ROUND_COMPLETE', 'Your round is already complete.')); if (!match.config.hints || round.usedHint) return reply?.(error('HINT_UNAVAILABLE', 'No hint is available.')); round.usedHint = true; const answer = match.answers.get(found.player.id)!; const letter = answer.split('').find((candidate) => !round.guesses.some((guess) => guess.word.includes(candidate))) ?? answer[0]; socket.emit('round:hint', { letter: letter.toUpperCase() }); reply?.({ ok: true }); });
  socket.on(CHAOS_SELECT_EVENT, (payload: unknown, reply?: (response: unknown) => void) => {
    const data = ChaosSelectionSchema.safeParse(payload);
    if (!data.success) return reply?.(error('INVALID_INPUT', 'That ability selection is invalid.'));
    const found = membership(socket, data.data.roomCode);
    if (!found) return reply?.(error('NOT_MEMBER', 'You are not in that room.'));
    const room = found.room;
    if (room.abilityRequestIds.has(data.data.requestId)) return reply?.({ ok: true, duplicate: true });
    const match = room.match;
    const window = room.chaosWindow;
    if (!match || !window || !match.config.chaos || match.id !== data.data.matchId || match.id !== window.sourceMatchId || match.lifecycle !== 'MATCH_RESULTS' || match.number >= match.config.matches) return reply?.(error('ABILITY_UNAVAILABLE', 'No Chaos selection is available right now.'));
    if (Date.now() >= window.closesAt) { finishChaosSelection(room, match.id); return reply?.(error('SELECTION_EXPIRED', 'The ability selection window has closed.')); }
    if (!window.eligible.has(found.player.id)) return reply?.(error('NOT_ELIGIBLE', 'Only a finalized match winner can select an ability.'));
    const useKey = `${match.id}:${found.player.id}`;
    if (room.usedAbilities.has(useKey) || window.selected.has(found.player.id)) return reply?.(error('ABILITY_USED', 'You have already selected an ability for this match.'));
    const target = room.players.get(data.data.targetId);
    if (!target || !target.connected || !match.sessionScores.has(target.id) || (data.data.ability === 'strike' && target.id === found.player.id)) return reply?.(error('INVALID_TARGET', 'Choose a connected eligible participant.'));
    const signedAmount = chaosAbilitySeconds(match.config.timer, data.data.ability);
    room.pendingEffects.push({ ownerId: found.player.id, targetId: target.id, ability: data.data.ability, seconds: Math.abs(signedAmount), timer: match.config.timer, sourceMatchId: match.id, targetSessionId: match.sessionId, targetMatchNumber: window.nextMatchNumber });
    room.usedAbilities.add(useKey);
    room.abilityRequestIds.add(data.data.requestId);
    window.selected.add(found.player.id);
    socket.emit('chaos:confirmed', { matchId: match.id, ability: data.data.ability, targetId: target.id, seconds: Math.abs(signedAmount) });
    reply?.({ ok: true });
    if ([...window.eligible].every((playerId) => window.selected.has(playerId))) finishChaosSelection(room, match.id);
  });

  socket.on('match:next', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string(), matchId: z.string() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'That transition request is invalid.')); const found = membership(socket, data.data.roomCode); const match = found?.room.match; if (!found || !match || found.room.hostId !== found.player.id || match.id !== data.data.matchId || match.status !== 'results' || !['ROUND_RESULTS', 'MATCH_RESULTS'].includes(match.lifecycle) || found.room.chaosWindow) return reply?.(error('INVALID_TRANSITION', 'The next round is not ready to start.')); if (match.roundNumber < match.config.rounds) startRound(found.room); else if (match.number < match.config.matches) { if (match.config.chaos) { const closesAt = openChaosSelection(found.room, match); reply?.({ ok: true, selectingAbilities: true, closesAt }); } else { beginNextMatch(found.room, match); reply?.({ ok: true }); } } else { match.status = 'complete'; match.lifecycle = transitionLifecycle(match.lifecycle, 'SESSION_COMPLETE'); broadcastRoom(found.room); broadcastMatch(found.room); reply?.({ ok: true }); } });

  socket.on('rematch:ready', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string(), ready: z.boolean() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'That rematch response is invalid.')); const found = membership(socket, data.data.roomCode); if (!found || found.room.match?.lifecycle !== 'SESSION_COMPLETE') return reply?.(error('INVALID_TRANSITION', 'A rematch is not available right now.')); if (data.data.ready) found.room.rematchReady.add(found.player.id); else found.room.rematchReady.delete(found.player.id); broadcastRoom(found.room); reply?.({ ok: true, readyCount: found.room.rematchReady.size }); });

  socket.on('rematch:start', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string(), revision: z.number().int().optional() }).safeParse(payload); if (!data.success) return reply?.(error('INVALID_INPUT', 'That rematch start request is invalid.')); const found = membership(socket, data.data.roomCode); const room = found?.room; if (!found || !room || room.hostId !== found.player.id || room.match?.lifecycle !== 'SESSION_COMPLETE') return reply?.(error('INVALID_TRANSITION', 'The rematch is not ready to start.')); const connected = [...room.players.values()].filter((player) => player.connected); if (connected.length < 2) return reply?.(error('NOT_ENOUGH_PLAYERS', 'At least 2 connected players are required to start a rematch.')); if (connected.some((player) => !room.rematchReady.has(player.id))) return reply?.(error('NOT_READY', 'All connected players must opt in. Players who decline can leave the room.')); if (room.config.playerCount > connected.length) room.config.playerCount = Math.max(2, connected.length); if (!MultiplayerSettingsSchema.safeParse(room.config).success) return reply?.(error('INVALID_CONFIG', 'The saved match settings are no longer valid.')); room.match!.lifecycle = transitionLifecycle(room.match!.lifecycle, 'LOBBY'); room.status = 'waiting'; room.players.forEach((player) => { player.ready = true; }); startMatch(room); reply?.({ ok: true }); });

  socket.on('room:close', (payload: unknown, reply?: (response: unknown) => void) => { const data = z.object({ roomCode: z.string() }).safeParse(payload); const found = data.success ? membership(socket, data.data.roomCode) : null; if (!found) return reply?.(error('NOT_MEMBER', 'You are not in that room.')); if (found.room.hostId !== found.player.id) return reply?.(error('FORBIDDEN', 'Only the host can close the room.')); const room = found.room; room.status = 'closed'; if (room.match && room.match.lifecycle !== 'ROOM_CLOSED') room.match.lifecycle = transitionLifecycle(room.match.lifecycle, 'ROOM_CLOSED'); if (room.timer) clearTimeout(room.timer); if (room.chaosTimer) clearTimeout(room.chaosTimer); room.timer = undefined; room.chaosTimer = undefined; room.chaosWindow = undefined; broadcastRoom(room); io.to(room.code).emit('room:closed', { code: room.code }); rooms.delete(room.id); io.in(room.code).socketsLeave(room.code); reply?.({ ok: true }); });
  socket.on('disconnect', () => { socketToSession.delete(socket.id); for (const room of rooms.values()) { const player = room.players.get(session.playerId); if (!player || player.socketId !== socket.id) continue; player.connected = false; player.ready = false; player.socketId = undefined; if (room.status === 'waiting' && [...room.players.values()].every((item) => !item.connected)) { rooms.delete(room.id); } else if (room.status === 'waiting') broadcastRoom(room); else if (room.match) broadcastMatch(room); } });
  socket.on('disconnect', () => { for (const room of rooms.values()) { if (room.hostId !== session.playerId || room.players.get(session.playerId)?.connected) continue; const successor = [...room.players.values()].find((player) => player.connected); if (!successor) continue; room.hostId = successor.id; broadcastRoom(room); app.log.info({ roomCode: room.code, newHostId: successor.id }, 'Room host transferred after disconnect'); } });
});

const cleanupTimer = setInterval(() => { const cutoff = Date.now() - config.ROOM_IDLE_TTL_MS; rooms.forEach((room, id) => { if (room.players.size === 0 || (room.status === 'waiting' && room.lastActivity < cutoff)) { if (room.timer) clearTimeout(room.timer); if (room.chaosTimer) clearTimeout(room.chaosTimer); rooms.delete(id); } }); const activeTokens = new Set(socketToSession.values()); sessions.forEach((session, token) => { if (session.expiresAt <= Date.now() && !activeTokens.has(token)) sessions.delete(token); }); createRequests.forEach((request, key) => { if (request.expiresAt <= Date.now() || !rooms.has(request.roomId)) createRequests.delete(key); }); }, config.ROOM_CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
await app.listen({ port, host });
app.log.info(`WORD-AL server listening on ${host}:${port}`);
let shuttingDown = false;
const shutdown = async (signal: string) => { if (shuttingDown) return; shuttingDown = true; clearInterval(cleanupTimer); for (const room of rooms.values()) { if (room.timer) clearTimeout(room.timer); if (room.chaosTimer) clearTimeout(room.chaosTimer); } for (const timer of persistenceTimers) clearTimeout(timer); persistenceTimers.clear(); io.emit('server:shutdown', { message: 'Server is shutting down.' }); await new Promise<void>((resolveClose) => io.close(() => resolveClose())); app.log.info({ signal }, 'WORD-AL server stopped cleanly'); };
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
