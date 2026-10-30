# Deployment and operations

## Current deployment boundary

WORD-AL can be built as a single-process Node service that serves `dist/`, the HTTP API, and Socket.IO from one origin. That mode is suitable for a controlled demo or a single-instance deployment with persistent local disk. It is **not yet suitable for a public production launch**: guest sessions, active rooms, timer state, and socket rate-limit counters live in process memory, while profile/history persistence uses a synchronous JSON file without cross-process locking or a database transaction. A restart loses sessions and active games; multiple instances can overwrite each other's JSON updates. No database schema or migration system exists, so no database migration is run or implied here.

## Prerequisites and local setup

- Node.js 20+ and npm 10+.
- `npm ci` for lockfile-pinned installation.
- Copy `.env.example` to `.env`; keep secrets out of source control.
- Run `npm run dev` for Vite and the Fastify/Socket.IO server.

The web client defaults to `http://localhost:3000` in Vite development and to the same origin in a production build. For a separately hosted API/socket server, set the public build variable `VITE_SERVER_URL` to its HTTPS origin before `npm run build`. This variable is intentionally public; never place credentials in `VITE_*` variables.

## Configuration

The server validates its configuration at startup. Supported variables are listed in `.env.example`: `PORT`, `HOST`, `CLIENT_ORIGIN` (comma-separated exact origins; no wildcard), `PUBLIC_APP_URL`, `DATA_FILE`, `LOG_LEVEL`, `REQUEST_BODY_LIMIT`, room cleanup/TTL values, session TTL, and leaderboard qualification thresholds. Production requires explicit `CLIENT_ORIGIN`, `PUBLIC_APP_URL`, and `DATA_FILE`. `DATA_FILE` defaults to `.data/word-al.json` only for development/test; choose a persistent, backed-up path for a single-instance deployment. The frontend reads only `VITE_SERVER_URL`.

## Build, run, and checks

```sh
npm ci
npm run typecheck
npm test
npm run build
NODE_ENV=production PORT=3000 HOST=0.0.0.0 \
  CLIENT_ORIGIN=https://word-al.example PUBLIC_APP_URL=https://word-al.example \
  DATA_FILE=/var/lib/word-al/word-al.json LOG_LEVEL=info \
  npm run start:server
```

Build with `VITE_SERVER_URL` set for the target topology. `npm run build` creates the frontend `dist/` and compiled backend `dist-server/`; run `npm run start:server` from the project directory so Fastify can serve the adjacent static assets and history fallback. If the web app and API are on different origins, configure the exact web origin in `CLIENT_ORIGIN` and verify both HTTP CORS and Socket.IO connectivity.

## Health and diagnostics

- `GET /health` is a liveness response.
- `GET /ready` reports readiness and non-sensitive active-room/player counts; it returns 503 if the configured persistence file/directory is not accessible.
- `POST /api/session` creates a short-lived guest identity for direct profile access; its bearer token response is marked `Cache-Control: no-store` and issuance is rate-limited.
- Fastify logs include request IDs; do not add tokens, answers, or guesses to application logs.
- Startup configuration errors name invalid variable fields. If profile/history writes fail, inspect the server's structured error log and ensure the data file's parent directory is writable.
- The CI workflow runs `npm ci`, the frontend/backend production build, lint/typecheck, tests (including server integration/config tests), and `npm audit`.

## Backups, upgrades, and recovery

There are currently no SQL migrations. For the JSON store, stop the single server process, make an operator-managed backup of the configured data file, then deploy and restart. Do not edit or reset it as part of startup. The store refuses malformed persisted data rather than silently starting empty; restore a known-good copy if startup reports a schema/read error. Atomic rename protects a single write from partial replacement, but does not provide concurrency control, transactionality, point-in-time recovery, or a substitute for backups.

## Known blockers before a public production launch

1. Replace JSON storage with a transactional database adapter and a reviewed, ordered migration/backup/restore process.
2. Persist guest sessions securely (or add real account authentication) and share session state across processes.
3. Move rooms, timers, idempotency records, and rate limits to coordinated shared state before running multiple instances; add graceful recovery for active games after restart.
4. Add deployment-specific TLS, process supervision, log retention, metrics/alerts, and security/dependency review. This repository does not deploy itself, and no production deployment or backup has been performed.
