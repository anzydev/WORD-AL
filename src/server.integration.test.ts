import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { ProtocolErrorSchema, SERVICE_STATUS_EVENT, ServerStatusSchema } from './protocol';

let child: ChildProcess | undefined;
let socket: Socket | undefined;
const extraSockets: Socket[] = [];
let baseUrl = '';
let testDataDirectory = '';
let sessionToken = '';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host: '127.0.0.1' }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local port.');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer() {
  const end = Date.now() + 8_000;
  while (Date.now() < end) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`Server exited early with code ${child.exitCode}.`);
    try { const response = await fetch(`${baseUrl}/health`); if (response.ok) return; } catch { /* Startup still in progress. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server did not become healthy in time.');
}

describe('Fastify and Socket.IO server', () => {
  beforeAll(async () => {
    testDataDirectory = mkdtempSync(join(tmpdir(), 'word-al-server-test-'));
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', CLIENT_ORIGIN: 'http://localhost:5173', NODE_ENV: 'test', DATA_FILE: join(testDataDirectory, 'store.json'), WORDAL_TEST_ANSWER: 'crane' },
      stdio: 'ignore',
    });
    await waitForServer();
  }, 12_000);

  afterAll(async () => {
    socket?.disconnect();
    extraSockets.forEach((client) => client.disconnect());
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child!.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 4_000))]);
    }
    if (testDataDirectory) rmSync(testDataDirectory, { recursive: true, force: true });
  }, 6_000);

  it('serves health/readiness and applies configured CORS', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', service: 'word-al-server' });
    expect((await (await fetch(`${baseUrl}/ready`)).json()).status).toBe('ready');
    const cors = await fetch(`${baseUrl}/health`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' } });
    expect(cors.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('serves the production SPA entry for a refreshed route and serializes API 404 errors', async () => {
    const route = await fetch(`${baseUrl}/profile`, { headers: { Accept: 'text/html' } });
    expect(route.status).toBe(200);
    expect(await route.text()).toContain('WORD-AL');
    const missing = await fetch(`${baseUrl}/missing-api`, { headers: { Accept: 'application/json' } });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('establishes a server-managed session and validates the status handshake', async () => {
    socket = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
    const session = await new Promise<{ sessionToken: string; playerId: string }>((resolve, reject) => {
      socket!.once('session:ready', resolve);
      socket!.once('connect_error', reject);
    });
    expect(session.sessionToken).toMatch(/^[0-9a-f]{48}$/);
    sessionToken = session.sessionToken;
    expect(session.playerId).toBeTruthy();
    const good = await new Promise<any>((resolve) => socket!.emit(SERVICE_STATUS_EVENT, {}, resolve));
    expect(good.ok).toBe(true);
    expect(ServerStatusSchema.safeParse(good.status).success).toBe(true);
    const invalid = await new Promise<any>((resolve) => socket!.emit(SERVICE_STATUS_EVENT, { unexpected: true }, resolve));
    expect(ProtocolErrorSchema.safeParse(invalid).success).toBe(true);
  });

  it('bootstraps a guest profile session directly over HTTP with non-cacheable credentials', async () => {
    const response = await fetch(`${baseUrl}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const session = await response.json();
    expect(session).toMatchObject({ playerId: expect.any(String), sessionToken: expect.stringMatching(/^[0-9a-f]{48}$/) });
    const profile = await fetch(`${baseUrl}/api/profile`, { headers: { Authorization: `Bearer ${session.sessionToken}` } });
    expect(profile.status).toBe(200);
    expect(await profile.json()).toMatchObject({ id: session.playerId, identityType: 'guest', crossDevicePersistence: false });
    const malformed = await fetch(`${baseUrl}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unexpected: true }) });
    expect(malformed.status).toBe(400);
  });

  it('rejects Socket.IO handshakes from origins outside the configured allowlist', async () => {
    const rejected = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000, extraHeaders: { Origin: 'https://untrusted.example' } });
    await expect(new Promise<void>((resolve, reject) => { rejected.once('connect', () => resolve()); rejected.once('connect_error', reject); })).rejects.toBeTruthy();
    rejected.disconnect();
  });

  it('rate limits repeated room creation attempts by guest identity', async () => {
    const limited = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
    extraSockets.push(limited);
    await new Promise<void>((resolve, reject) => { limited.once('session:ready', () => resolve()); limited.once('connect_error', reject); });
    const askCreate = (index: number) => new Promise<any>((resolve) => limited.emit('room:create', { name: 'Rate test', requestId: `limit-${Date.now()}-${index}` }, resolve));
    let last: any;
    for (let index = 0; index < 6; index += 1) last = await askCreate(index);
    expect(last).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('protects guest profile APIs, validates profile edits, and bounds private history access', async () => {
    const auth = { Authorization: `Bearer ${sessionToken}` };
    expect((await fetch(`${baseUrl}/api/profile`)).status).toBe(401);
    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers: auth });
    expect(profileResponse.status).toBe(200);
    expect(await profileResponse.json()).toMatchObject({ identityType: 'guest', crossDevicePersistence: false });
    const invalidName = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: '  ' }) });
    expect(invalidName.status).toBe(400);
    const updated = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: '  Profile Test  ' }) });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ displayName: 'Profile Test', identityType: 'guest' });
    expect((await (await fetch(`${baseUrl}/api/profile/stats`, { headers: auth })).json())).toMatchObject({ completedGames: 0, winRate: 0, solveRate: 0 });
    expect((await fetch(`${baseUrl}/api/history?page=0`, { headers: auth })).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/history?page=1&pageSize=20`, { headers: auth })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/history/not-your-result`, { headers: auth })).status).toBe(404);
    const leaderboard = await fetch(`${baseUrl}/api/leaderboard?category=recent&page=1&pageSize=10`, { headers: auth });
    expect(leaderboard.status).toBe(200);
    expect(await leaderboard.json()).toMatchObject({ category: 'recent', page: 1, pageSize: 10, recentDays: 30, currentPlayer: null });
    expect((await fetch(`${baseUrl}/api/leaderboard?category=unknown`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/leaderboard?pageSize=101`)).status).toBe(400);
  });

  it('enforces HTTP payload limits with a stable error response', async () => {
    const response = await fetch(`${baseUrl}/api/profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(40_000) }) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request payload is too large.' } });
  });

  it('creates a real room and makes retried creation requests idempotent', async () => {
    const requestId = `create-${Date.now()}`;
    const create = () => new Promise<any>((resolve) => socket!.emit('room:create', { name: 'Host', requestId }, resolve));
    const first = await create();
    const retry = await create();
    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    expect(retry.duplicate).toBe(true);
    expect(retry.room.code).toBe(first.room.code);
    expect(retry.room.players).toHaveLength(1);
    expect(retry.room.players[0]).toMatchObject({ id: first.room.players[0].id, isHost: true, connected: true });
  });

  it('enforces membership, host-only configuration, readiness and configuration locking', async () => {
    const connect = async () => {
      const client = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
      extraSockets.push(client);
      await new Promise<void>((resolve, reject) => { client.once('session:ready', () => resolve()); client.once('connect_error', reject); });
      return client;
    };
    const host = await connect();
    const guest = await connect();
    const ask = (client: Socket, event: string, payload: unknown) => new Promise<any>((resolve) => client.emit(event, payload, resolve));
    const created = await ask(host, 'room:create', { name: 'Host', requestId: `lobby-${Date.now()}` });
    const code = created.room.code as string;
    expect(created.ok).toBe(true);
    const joined = await ask(guest, 'room:join', { name: 'Guest', roomCode: code });
    expect(joined.ok).toBe(true);
    const before = joined.room.revision;
    const attempted = await ask(guest, 'room:config:update', { roomCode: code, config: { ...joined.room.config, timer: 120 }, revision: before });
    expect(attempted.error.code).toBe('FORBIDDEN');
    const configured = await ask(host, 'room:config:update', { roomCode: code, config: { ...created.room.config, timer: 60 }, revision: before });
    expect(configured.ok).toBe(true);
    const ready = await ask(guest, 'room:ready', { roomCode: code, ready: true });
    expect(ready.ok).toBe(true);
    const stale = await ask(host, 'room:config:update', { roomCode: code, config: { ...created.room.config, timer: 120 }, revision: before });
    expect(stale.error.code).toBe('STALE_REVISION');
    const started = await ask(host, 'room:start', { roomCode: code });
    expect(started.ok).toBe(true);
    const locked = await ask(host, 'room:config:update', { roomCode: code, config: created.room.config });
    expect(locked.error.code).toBe('ROOM_LOCKED');
    const duplicateStart = await ask(host, 'room:start', { roomCode: code });
    expect(duplicateStart.error.code).toBe('ROOM_LOCKED');
  });

  it('transfers room host authority deterministically when the host disconnects', async () => {
    const connect = async () => {
      const client = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
      extraSockets.push(client);
      const identity = await new Promise<{ sessionToken: string; playerId: string }>((resolve, reject) => { client.once('session:ready', resolve); client.once('connect_error', reject); });
      return { client, identity };
    };
    const host = await connect();
    const guest = await connect();
    const ask = (client: Socket, event: string, payload: unknown) => new Promise<any>((resolve) => client.emit(event, payload, resolve));
    const created = await ask(host.client, 'room:create', { name: 'Host', requestId: `transfer-${Date.now()}` });
    const joined = await ask(guest.client, 'room:join', { name: 'Guest', roomCode: created.room.code });
    const transferred = new Promise<any>((resolve) => { const receive = (room: any) => { if (room.hostId !== guest.identity.playerId) return; guest.client.off('room:update', receive); resolve(room); }; guest.client.on('room:update', receive); });
    host.client.disconnect();
    const room = await transferred;
    expect(room.hostId).toBe(guest.identity.playerId);
    expect(room.players.find((player: any) => player.id === guest.identity.playerId).isHost).toBe(true);
    expect(joined.ok).toBe(true);
    const rejoined = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000, auth: { sessionToken: host.identity.sessionToken } });
    extraSockets.push(rejoined);
    const restoredRoom = new Promise<any>((resolve) => rejoined.once('room:update', resolve));
    const restoredIdentity = await new Promise<any>((resolve, reject) => { rejoined.once('session:ready', resolve); rejoined.once('connect_error', reject); });
    const restored = await restoredRoom;
    expect(restoredIdentity.playerId).toBe(host.identity.playerId);
    expect(restored.players.find((player: any) => player.id === host.identity.playerId)).toMatchObject({ connected: true, isHost: false });
  });

  it('enforces room capacity and rejects unknown room codes across independent clients', async () => {
    const connect = async () => {
      const client = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
      extraSockets.push(client);
      await new Promise<void>((resolve, reject) => { client.once('session:ready', () => resolve()); client.once('connect_error', reject); });
      return client;
    };
    const clients = await Promise.all(Array.from({ length: 7 }, () => connect()));
    const ask = (client: Socket, event: string, payload: unknown) => new Promise<any>((resolve) => client.emit(event, payload, resolve));
    const created = await ask(clients[0], 'room:create', { name: 'Player 1', requestId: `capacity-${Date.now()}` });
    expect(created.ok).toBe(true);
    const expanded = await ask(clients[0], 'room:config:update', { roomCode: created.room.code, config: { ...created.room.config, playerCount: 6 }, revision: created.room.revision });
    expect(expanded.ok).toBe(true);
    for (let index = 1; index < 6; index += 1) expect((await ask(clients[index], 'room:join', { name: `Player ${index + 1}`, roomCode: created.room.code })).ok).toBe(true);
    expect((await ask(clients[6], 'room:join', { name: 'Player 7', roomCode: created.room.code })).error.code).toBe('ROOM_FULL');
    expect((await ask(clients[6], 'room:join', { name: 'Player 7', roomCode: 'ZZZZZ' })).error.code).toBe('ROOM_NOT_FOUND');
  });

  it('runs an authoritative round without exposing an active answer or private guesses', async () => {
    const connect = async () => {
      const client = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
      extraSockets.push(client);
      await new Promise<void>((resolve, reject) => { client.once('session:ready', () => resolve()); client.once('connect_error', reject); });
      return client;
    };
    const host = await connect();
    const guest = await connect();
    const ask = (client: Socket, event: string, payload: unknown) => new Promise<any>((resolve) => client.emit(event, payload, resolve));
    const created = await ask(host, 'room:create', { name: 'Round host', requestId: `round-${Date.now()}` });
    const code = created.room.code as string;
    await ask(guest, 'room:join', { name: 'Round guest', roomCode: code });
    await ask(guest, 'room:ready', { roomCode: code, ready: true });
    const hostStatePromise = new Promise<any>((resolve) => host.once('match:state', resolve));
    const guestStatePromise = new Promise<any>((resolve) => guest.once('match:state', resolve));
    const started = await ask(host, 'room:start', { roomCode: code });
    expect(started.ok).toBe(true);
    const [hostState, guestState] = await Promise.all([hostStatePromise, guestStatePromise]);
    expect(hostState.answer).toBeUndefined();
    expect(guestState.answer).toBeUndefined();
    const guess = { roomCode: code, matchId: hostState.id, roundId: hostState.roundId, actionId: `guess-${Date.now()}`, guess: 'crane' };
    const progressPromise = new Promise<any>((resolve) => host.once('match:progress', resolve));
    const accepted = await ask(host, 'round:guess', guess);
    expect(accepted.ok).toBe(true);
    expect(accepted.state.guesses).toHaveLength(1);
    expect(accepted.state.guesses[0].feedback).toHaveLength(5);
    const retry = await ask(host, 'round:guess', guess);
    expect(retry.duplicate).toBe(true);
    expect(retry.state.guesses).toHaveLength(1);
    const publicProgress = await progressPromise;
    expect(publicProgress.players[0]).not.toHaveProperty('answer');
    expect(publicProgress.players[0]).not.toHaveProperty('feedback');
    const rejected = await ask(guest, 'round:guess', { ...guess, actionId: 'bad', guess: 'zzzzz' });
    expect(rejected.ok).toBe(false);
    expect(rejected.error.code).toBe('WORD_NOT_FOUND');
  });

  it('transfers closure authority to the host and rejects actions after room closure', async () => {
    const connect = async () => {
      const client = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
      extraSockets.push(client);
      await new Promise<void>((resolve, reject) => { client.once('session:ready', () => resolve()); client.once('connect_error', reject); });
      return client;
    };
    const host = await connect();
    const guest = await connect();
    const ask = (client: Socket, event: string, payload: unknown) => new Promise<any>((resolve) => client.emit(event, payload, resolve));
    const created = await ask(host, 'room:create', { name: 'Closing host', requestId: `close-${Date.now()}` });
    await ask(guest, 'room:join', { name: 'Guest', roomCode: created.room.code });
    const denied = await ask(guest, 'room:close', { roomCode: created.room.code });
    expect(denied.error.code).toBe('FORBIDDEN');
    const closedEvent = new Promise<any>((resolve) => guest.once('room:closed', resolve));
    const closed = await ask(host, 'room:close', { roomCode: created.room.code });
    expect(closed.ok).toBe(true);
    expect((await closedEvent).code).toBe(created.room.code);
    expect((await ask(guest, 'room:state', { roomCode: created.room.code })).ok).toBe(false);
  });

  it('offers opt-in winner abilities and applies them only to the next match first round', async () => {
    const connect = async () => {
      const client = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
      extraSockets.push(client);
      await new Promise<void>((resolve, reject) => { client.once('session:ready', () => resolve()); client.once('connect_error', reject); });
      return client;
    };
    const host = await connect();
    const guest = await connect();
    const ask = (client: Socket, event: string, payload: unknown) => new Promise<any>((resolve) => client.emit(event, payload, resolve));
    const created = await ask(host, 'room:create', { name: 'Chaos host', requestId: `chaos-${Date.now()}` });
    const code = created.room.code as string;
    await ask(guest, 'room:join', { name: 'Chaos guest', roomCode: code });
    const stateBeforeConfig = await ask(host, 'room:state', { roomCode: code });
    const config = { ...created.room.config, timer: 60, matches: 2, rounds: 1, chaos: true };
    expect((await ask(host, 'room:config:update', { roomCode: code, config, revision: stateBeforeConfig.room.revision })).ok).toBe(true);
    await ask(guest, 'room:ready', { roomCode: code, ready: true });
    const hostStart = new Promise<any>((resolve) => host.once('match:state', resolve));
    const guestStart = new Promise<any>((resolve) => guest.once('match:state', resolve));
    expect((await ask(host, 'room:start', { roomCode: code })).ok).toBe(true);
    const [hostInitial, guestInitial] = await Promise.all([hostStart, guestStart]);
    const activeGuess = (state: any, actionId: string) => ({ roomCode: code, matchId: state.id, roundId: state.roundId, actionId, guess: 'crane' });
    await ask(host, 'round:guess', activeGuess(hostInitial, `host-${Date.now()}`));
    await ask(guest, 'round:guess', activeGuess(guestInitial, `guest-${Date.now()}`));
    const completed = await ask(host, 'room:state', { roomCode: code });
    expect(completed.match.status).toBe('results');
    const eligibleIds = completed.match.players.filter((player: any) => player.place === 1).map((player: any) => player.id);
    expect(eligibleIds.length).toBeGreaterThan(0);
    const clientsByPlayer = new Map<string, Socket>([[hostInitial.players[0].id, host], [guestInitial.players[1].id, guest]]);
    const notices = new Map<string, Promise<any>>();
    eligibleIds.forEach((id: string) => notices.set(id, new Promise((resolve) => clientsByPlayer.get(id)!.once('chaos:available', resolve))));
    const nextStates = new Map([...clientsByPlayer.entries()].map(([id, client]) => [id, new Promise<any>((resolve) => client.once('match:state', resolve))]));
    const advanced = await ask(host, 'match:next', { roomCode: code, matchId: completed.match.id });
    expect(advanced).toMatchObject({ ok: true, selectingAbilities: true });
    await Promise.all(eligibleIds.map(async (id: string) => {
      const client = clientsByPlayer.get(id)!;
      const notice = await notices.get(id)!;
      expect(notice.nextMatchNumber).toBe(2);
      const selected = await ask(client, 'chaos:select', { roomCode: code, matchId: notice.matchId, ability: 'boost', targetId: id, requestId: `ability-${id}` });
      expect(selected.ok).toBe(true);
    }));
    const states = await Promise.all([...nextStates.entries()].map(async ([id, state]) => [id, await state] as const));
    states.forEach(([id, state]) => {
      expect(state.number).toBe(2);
      const own = state.players.find((player: any) => player.id === id);
      expect(own.timeEffect).toBe(eligibleIds.includes(id) ? 5 : 0);
      if (eligibleIds.includes(id)) expect(state.abilityEffects).toEqual(expect.arrayContaining([expect.objectContaining({ ability: 'boost', targetId: id, seconds: 5 })]));
      if (eligibleIds.includes(id)) expect(state.deadline - Date.now()).toBeGreaterThan(64_000);
      else expect(state.deadline - Date.now()).toBeLessThanOrEqual(60_000);
    });
  });
});
