# WORD-AL architecture

## Principles

WORD-AL is a small TypeScript application with a shared rules boundary. The UI may provide fast local feedback, while multiplayer word assignment, deadlines, feedback, scores, and lifecycle transitions are server-authoritative.

## Frontend

`src/App.tsx` contains the current route shell and the initial feature surfaces. It intentionally uses a small hash router so direct local routes work without introducing a dependency for the foundation. `src/game.ts` is UI-independent and owns the feedback algorithm, normalized dictionary membership, Strict Mode constraints, difficulty constants, and score calculation.

`src/styles.css` contains semantic design tokens for light and dark themes. The visual language is restrained: a centered header, compact square tile grid, thin borders, green/yellow/gray feedback, and no decorative background treatments. Local storage is used only for preferences, practice configuration, and practice statistics.

The landing page adds `src/CinematicExperience.tsx` as an isolated, lazy-loaded visual layer. Three.js and GSAP/ScrollTrigger are loaded only for the cinematic section; the scene uses bounded, scroll-reactive crystal fragments that assemble into a letter, caps device pixel ratio, responds to resize, disposes renderer/material/geometry resources, and falls back to readable DOM content when motion is reduced or WebGL initialization fails. `src/ExperienceEnhancements.tsx` provides optional Lenis easing and a pointer-capable custom cursor; both are enhancement-only and never replace native keyboard, touch, focus, or reduced-motion behavior. Gameplay routes do not depend on the scene.

## Server

`server/index.ts` exposes `/health` and `/ready` and establishes Socket.IO room, lobby, gameplay, scoring, progression, rematch, and closure events. `src/lifecycle.ts` centralizes permitted lifecycle transitions. Each room's current round and session summaries are in memory; reconnecting clients can recover their state while the process remains running, but a server restart loses active sessions and detailed round history. `src/scoring.ts` owns pure score-breakdown and shared-placement logic. Every accepted multiplayer action is validated on the server, and active answers/private guesses are excluded from public progress payloads.

Chaos Mode is opt-in. Eligible shared match winners receive a 30-second selection window before the next match; no selection means no effect. Multiple distinct winners' effects stack additively, each owner may select once, Time Strike cannot reduce a player's round below 15 seconds, and all effects are limited to the next match's first round. Each participant's effective deadline is enforced independently by the server. If a host disconnects, authority transfers to the first remaining connected player in room insertion order; the server broadcasts the change. Reconnection can restore the player's seat only while the process and guest session remain available.

## Shared rules and data

The answer dictionary is separate from the accepted guess set. The starter dictionary is deliberately compact and curated for a runnable local game. It can be replaced with a licensed generated dataset without changing the feedback or session APIs.

The server imports the pure rules from `src/game.ts`, which is currently the client-safe shared module. This is a single-package npm project rather than the suggested `apps/web`, `apps/server`, `packages/shared` monorepo. Keeping the established npm setup avoids a disruptive package-manager migration; extracting a dedicated shared package remains a structural follow-up if independent package versioning/builds become necessary. Types and schemas belong at this boundary, not duplicated in the UI and server.

## Profile and persistence boundary

`server/store.ts` is the single local persistence adapter for guest profiles and finalized multiplayer session results. A result is keyed by session ID plus player ID, so a retried finalization is idempotent. The store derives totals, rates, and streaks from completed history rather than treating a separate aggregate as authoritative. Writes clone the current state, serialize to a unique temporary file, and atomically rename it into place before publishing the new in-memory state. The server retries failed finalized-result writes with bounded exponential backoff and emits `match:persistence` status; it never labels a failed write as saved. History APIs require the server-issued guest token, paginate results, and authorize detail lookup against the token's player ID. The persisted result contains only post-match per-round score summaries, not answer words or active-round state.

The guest identity is stable only while its server session token remains valid (24 hours) and available to the same browser. It is not an account, cannot be recovered after token loss/server restart, and does not provide cross-device persistence. Practice statistics remain local to the browser and are not mixed into competitive persisted statistics. Configure `DATA_FILE` for the JSON location; no database credentials or migrations are needed for this local adapter. Back up JSON before manual changes or upgrades. This is not safe for multiple server instances or production durability: PostgreSQL with versioned schema migrations, transactions, uniqueness constraints, and indexed history queries is a deployment prerequisite. Active rooms and retry queues are in memory and will be lost on process restart.
