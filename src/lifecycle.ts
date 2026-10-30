export type LifecycleState = 'LOBBY' | 'ROUND_STARTING' | 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'MATCH_RESULTS' | 'SESSION_COMPLETE' | 'ROOM_CLOSED';

const transitions: Record<LifecycleState, readonly LifecycleState[]> = {
  LOBBY: ['ROUND_STARTING', 'ROOM_CLOSED'],
  ROUND_STARTING: ['ROUND_ACTIVE', 'ROOM_CLOSED'],
  ROUND_ACTIVE: ['ROUND_RESULTS', 'MATCH_RESULTS', 'ROOM_CLOSED'],
  ROUND_RESULTS: ['ROUND_STARTING', 'ROOM_CLOSED'],
  MATCH_RESULTS: ['ROUND_STARTING', 'SESSION_COMPLETE', 'LOBBY', 'ROOM_CLOSED'],
  SESSION_COMPLETE: ['LOBBY', 'ROOM_CLOSED'],
  ROOM_CLOSED: [],
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return transitions[from].includes(to);
}

export function transitionLifecycle(from: LifecycleState, to: LifecycleState): LifecycleState {
  if (!canTransition(from, to)) throw new Error(`Invalid lifecycle transition: ${from} -> ${to}`);
  return to;
}
