# WORD-AL

WORD-AL is a clean, Wordle-inspired word puzzle with configurable solo practice and private multiplayer rooms. The interface keeps the familiar centered board, square tiles, green/yellow/gray feedback, and compact QWERTY keyboard while adding practice controls, scoring, stats, and room configuration.

## Current implementation

- Responsive landing screen with help, stats, settings, light/dark themes, and persistent preferences.
- Editorial-cinematic landing experience with lazy-loaded Three.js/GSAP scroll choreography, sculptural letter tiles, reduced-motion behavior, and a DOM fallback when WebGL is unavailable.
- Easy mode: five letters and six guesses.
- Hard mode: six letters and eight guesses.
- Valid-word checking, duplicate-letter feedback, keyboard feedback precedence, timers, hints, and Strict Mode.
- Practice configuration for one to five matches, one to seven rounds, 60/90/120-second or untimed rounds.
- Local practice statistics and score breakdowns.
- Server-managed multiplayer room creation/join flow, lobby readiness, host configuration, private round state, server-authoritative timers, feedback, scoring, rematches, and Chaos Mode time effects.
- Server-backed profiles, idempotent local match history, statistics, leaderboard API, health/readiness endpoints, static production serving, and CI checks.
- Guest profile editing, private paginated multiplayer history, derived competitive statistics, and a profile persistence status notice when saving is delayed or fails.

The evidence-based release checklist is in [docs/release-checklist.md](docs/release-checklist.md). It distinguishes tested behavior from partial implementations and production blockers.

Multiplayer requires the Fastify/Socket.IO server. Practice remains fully local and does not depend on a server.

## Architecture

```text
src/game.ts       Shared client-safe rules, dictionaries, feedback, scoring, and types
src/App.tsx       React screens and practice gameplay controller
src/MultiplayerRealtime.tsx  Socket.IO client, lobby, and multiplayer board
src/styles.css    Central visual system, responsive layout, and cinematic presentation
src/CinematicExperience.tsx  Lazy-loaded Three.js/GSAP landing scene with fallback and cleanup
server/index.ts   Fastify, Socket.IO room/match authority, scoring, and API routes
server/store.ts   Idempotent local persistence adapter for profiles and history
docs/architecture.md  Decisions and planned boundaries
```

## Prerequisites

- Node.js 20+
- npm 10+

## Install and run

```bash
npm ci
npm run dev
```

The web app runs on `http://localhost:5173` and the server on port `3000`.

Useful commands:

```bash
npm run dev:web       # Vite only
npm run dev:server    # Fastify + Socket.IO only
npm run typecheck
npm run test
npm run build
npm run build:server  # standalone backend TypeScript build
npm run start:server  # run the compiled backend after building
```

Copy `.env.example` to `.env` when configuring the server. The server validates port, host, exact allowed origins, logging, request size, session/room lifecycle, leaderboard thresholds, and data-file settings at startup. Production requires explicit `CLIENT_ORIGIN`, `PUBLIC_APP_URL`, and `DATA_FILE`; configure `VITE_SERVER_URL` at frontend build time only when serving the API/socket server from a different origin. The JSON file store uses atomic file replacement and idempotent result IDs, but is not a production database. It refuses malformed data rather than replacing it with an empty store. There is no migration command: stop the service and back up the JSON file before upgrades, and do not point multiple server processes at it. See [deployment and operations](docs/deployment.md).

## Rules

Feedback uses a two-pass algorithm: exact matches are allocated first, then remaining letters are matched as present. Scores follow the product formula: `max(0, 120 - 15 × (attempts - 1) + speed bonus - hint penalty)`. Multiplayer guesses, deadlines, answers, feedback, scoring, and ability effects are calculated by the server.

## Verification

Guest session tokens are server-managed and expire after the configured TTL; profile/history APIs require the token and guests are explicitly not promised cross-device persistence. Final multiplayer session results are stored once per player and retried on transient file-write failures; practice results remain browser-local. Multiplayer rooms and active sessions are in-memory and do not survive server restarts. `/health` is liveness; `/ready` checks persistence access. The application is hardened for a single-process demo, but **not ready for public production** until transactional storage/migrations, durable/shared sessions and multiplayer state, and deployment operations are implemented. No production deployment or backup has been performed.
