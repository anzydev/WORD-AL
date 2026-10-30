# WORD-AL competitive leaderboards

All five categories use only finalized records whose mode is `multiplayer`, with a positive completed-round count and nonnegative server-recorded points/wins. Practice, cancelled/incomplete sessions, and unpersisted outcomes do not qualify. A session result is idempotently stored under its session/player pair; shared match placements count as one win for each tied winner, matching server placement semantics. Every row is labeled Guest because the current identity is a temporary server-issued guest identity, not a permanent account.

| Category | Primary metric | Participation rule |
| --- | --- | --- |
| Top players | Sum of finalized multiplayer points | At least one completed match |
| Most wins | Sum of shared match wins | At least one completed match |
| Win rate | Wins / completed matches | `LEADERBOARD_MIN_GAMES` (default 5) |
| Solve rate | Solved rounds / completed rounds | `LEADERBOARD_MIN_ROUNDS` (default 25) |
| Recent | Points from results in the last `LEADERBOARD_RECENT_DAYS` (default 30 days) | At least one result in the window |

Equal primary metrics share a competition rank (`1, 1, 3`). Names and IDs are used only to make display order deterministic. The optional bearer session token marks the current player's row and returns their rank even when outside the current page; without a qualifying entry, percentage pages return the minimum participation rule in response metadata for the UI to explain.

The JSON adapter stores finalized results in a local file and aggregates them in memory. This is suitable only for a single local server and small datasets; it has no database indexes, cross-process consistency, or account identity. Before production, replace the adapter with indexed SQL aggregation (player ID + mode + completion timestamp), uniqueness on `(session_id, player_id)`, and a transaction for result writes. No ranking cache is currently used, so successful new-result persistence is immediately visible on the next request. Do not present these temporary guest rankings as durable cross-device standings.
