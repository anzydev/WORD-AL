# WORD-AL release verification checklist

Status is evidence-based as of the current local audit. “Verified” means a repository test or build exercised the behavior; it does not imply independent production certification. The workspace has no `.git` repository, so a Git status/diff-based audit of pre-existing user changes was unavailable.

## Verified by automated tests and build

- Word feedback uses exact-match-first duplicate allocation; dictionary normalization, strict-mode clues, accepted word lengths, and keyboard feedback precedence have unit tests.
- Easy/Hard lengths and attempt caps, timer deadline boundaries, scoring formula/bounds, tie-breakers/shared placements, and session progression are covered by pure logic tests.
- Two independent Socket.IO clients create/join rooms, enforce host/member permissions, start authoritative play, submit accepted/rejected guesses, protect active answers/private feedback, and apply Chaos Mode to the eligible next round.
- HTTP guest-profile authorization, input/pagination boundaries, origin allowlisting, socket action throttling, HTTP payload caps, liveness/readiness, and result persistence/idempotency have integration/unit coverage.
- Direct HTTP guest-session bootstrap is rate-limited, returns non-cacheable credentials, and enables profile access without first visiting Multiplayer.
- The production frontend bundle and compiled backend entry build. Automated checks are `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run lint`, and `npm audit` (`lint` currently aliases typecheck).
- Accessibility contracts and CSS tests cover feedback labels, keyboard handling, focus visibility tokens, reduced motion, and narrow layouts. Sound tests cover disabled audio, optional playback, and duplicate event IDs.

## Implemented, but not fully end-to-end verified

- Full practice configuration combinations, visual result/history transitions, sound toggle interaction in a real browser, all profile/leaderboard routes, and every responsive breakpoint have not been exhaustively traversed in automated browser tests.
- The multiplayer integration tests exercise multiple independent clients and important authoritative flows, but do not yet exhaustively cover a six-player full session, all timer expiry races, all disconnection/reconnection timings, every rematch state, or cleanup at its configured 30-minute boundary.
- Browser inspection confirmed the compiled production-served app, guest profile/history loading, and Easy practice entry/invalid-guess rejection/accepted-guess feedback. A separate Hard-mode manual check verified physical input and six-column feedback. This remains a focused smoke test, not a replacement for repeatable browser automation.

## Partial or intentionally limited

- The local guest token is server-issued but process-memory-only; it is not account authentication and cannot survive a server restart.
- Profiles and finalized multiplayer records use a local JSON file. Atomic replacement and idempotency are tested, but transactions, multi-process safety, database constraints, schema migrations, backup automation, and durable retry queues do not exist.
- Room, timer, session, and rate-limit state are in memory. Restart recovery and horizontally scaled multiplayer are unsupported.
- Socket operation throttles are per ephemeral guest identity. Because guest identities are freely issued, these limits are not a substitute for production abuse controls; a reverse-proxy/IP policy and durable identity strategy need deployment-specific review.
- The selected category is General English only. Additional categories are unsupported rather than populated with fabricated content.
- Health/readiness are implemented; metrics export, alerting, deployment process supervision, and infrastructure-specific TLS configuration are external operational work.

## Not release-ready / external setup required

- Public production launch is blocked on durable transactional persistence, durable/shared identity and multiplayer coordination, and a deployment-specific operational/security review. No production deployment, backup, or database migration has been performed.
- The current workflow verifies lockfile install, typecheck, tests, frontend/backend production builds, and moderate-or-higher dependency audit. The latest run completed 15 test files / 90 tests; `npm audit` found zero vulnerabilities after dependency updates. It does not run browser automation or database migration validation (no migrations exist).
- The pre-update lockfile audit reported 7 advisories (2 critical); patched static-serving and Vitest releases were installed and the full audit returned zero vulnerabilities. npm also reports esbuild/fsevents install scripts as not explicitly approved by its install-script policy; clean installation, builds, and tests completed successfully.

## Commands to reproduce

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run lint
```

For current setup and single-process demo limitations, see [deployment.md](deployment.md).
