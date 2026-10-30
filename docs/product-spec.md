# WORD-AL product specification

This document is the rule contract for the phased implementation. The visual foundation and game rules should remain recognizable to Wordle players: compact centered header, square tiles, green/yellow/gray feedback, and a restrained QWERTY keyboard.

## Round rules

A round selects one answer of the configured length. A guess must be alphabetic, exactly that length, in the accepted-guess set, and submitted while the round is active and before its authoritative deadline. Invalid guesses do not consume attempts. Correctly placed letters are allocated first; remaining answer-letter frequencies are then allocated as present, with all excess duplicates absent. A round ends on a correct guess, exhausted attempts, or timer expiry; later guesses are rejected.

The answer set is a curated subset of the accepted-guess set. `src/game.ts` holds the current sets and pure feedback helper. Easy is five letters/six attempts; Hard is six letters/eight attempts. These values are centralized in `DIFFICULTIES`.

Strict Mode requires every previously revealed green letter to remain in place and every revealed yellow letter to occur at least as often while not occupying any position where that letter was yellow. Hints are optional and may be used once per round; current practice hint behavior is a clue and multiplayer behavior must not disclose an answer before that player's round ends.

Practice configuration is 1–5 matches, 1–7 rounds per match, 60/90/120 seconds or untimed, hints on/off, Strict Mode on/off, and a category only when the answer data supports it. Current curated data supports only the general category; other category labels are not implemented categories.

## Multiplayer rules and privacy

Rooms support 2–6 players, a private unique code, a host, explicit readiness, and host-only configuration/start. Joining after a match starts is rejected. On host disconnect, authority transfers to the first remaining connected player in room insertion order. A disconnected player remains reserved while its room and in-memory session exist; there is not yet a separate reconnect grace period. Waiting rooms expire after the configured idle TTL; active rooms and completed sessions are process-local and are not durably recovered. Duplicate starts, score awards, and stale round actions are guarded by match/round identifiers, with the remaining restart/multi-instance limitations documented in deployment guidance.

The host chooses timer (60/90/120), matches (1–5), rounds (1–7), word length/difficulty, hints, Strict Mode, supported category, Same Word (default) or Random Words, and optional Chaos Mode. Settings lock for a match. Same Word gives every player one shared answer. Random Words keeps a per-player answer fixed for that round; different answer difficulty is an acknowledged fairness tradeoff. Never expose an answer before the player's round is concluded, including through room state, logs, or debug responses.

The server is authoritative for multiplayer membership, settings, answer assignment, guesses/feedback, deadlines, state transitions, scores, abilities, and rankings. Timed multiplayer rounds use server deadlines; deadline wins over a guess received at or after that deadline. Refresh/reconnect/local clock changes cannot extend time. Untimed mode is practice-only.

## Scoring and ranking

For a solved round: `base = 120 - 15 × (attempts - 1)`, `speed = floor(5 × remainingSeconds / timeLimit)` for timed games only, `hint penalty = 5` if used, and `round score = max(0, base + speed - hint penalty)`. Unsolved rounds score zero. A score breakdown is retained. Multiplayer scores are calculated by the server. Match ranking uses total points, then more rounds won, fewer attempts on solved rounds, and lower completion time; unresolved ties share placement.

Chaos Mode is disabled by default. A match winner may earn one Time Strike or Time Boost for the first round of the next match. Strike values are 5/8/12 seconds for 60/90/120-second rounds and may not reduce the target's remaining time below 15 seconds. The server validates ownership, target, and use window; abilities do not stack or persist beyond that match. Ability effects must be idempotent and must not mutate finalized rounds.

## Lifecycle and records

Target lifecycle: lobby → ready check → countdown → active round → round results → next round or match results → next-match preparation or complete/rematch/closure. Every action is scoped to match and round identifiers. Presentation/audio events (letter entered, guess submitted, feedback revealed, valid/invalid guess, round/match result, timer warning/expiry, ability activated) observe actual transitions and never alter game rules.

Practice statistics are browser-local initially: games played/won, win percentage, current/maximum streak, guess distribution, average solved attempts, and best results segmented by word length and timer category. Practice leaderboard categories distinguish five- and six-letter games; timed and untimed results are not directly comparable. Multiplayer competitive records are separate and must be server-validated. PostgreSQL is the planned durable store for profiles, finalized matches, round breakdowns, history, and aggregates; local JSON is development-only.

## Current implementation boundary

Shared TypeScript rules/types/constants and Zod settings/input schemas are in `src/game.ts`. Implemented UI and multiplayer behavior are described in `README.md`; this repository is a single npm package, not the suggested workspace monorepo. In-memory rooms, local JSON storage, and ephemeral socket identities are development functionality, not production-ready persistence/authentication. Remaining phases must close the documented lifecycle, privacy, fairness, accessibility, and reliability gaps rather than treating this specification as proof they are already solved.
