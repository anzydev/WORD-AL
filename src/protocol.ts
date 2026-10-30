import { z } from 'zod';

export const SERVICE_STATUS_EVENT = 'service:status';
export const CHAOS_SELECT_EVENT = 'chaos:select';
export const ChaosSelectionSchema = z.object({
  roomCode: z.string().trim().min(5).max(5),
  matchId: z.string().uuid(),
  ability: z.enum(['strike', 'boost']),
  targetId: z.string().uuid(),
  requestId: z.string().min(1).max(80),
}).strict();
export const ServerStatusRequestSchema = z.object({}).strict();
export const ServerStatusSchema = z.object({ status: z.literal('ok'), service: z.literal('word-al-server'), activeRooms: z.number().int().nonnegative(), activePlayers: z.number().int().nonnegative() });
export const ProtocolErrorSchema = z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) });
export type ServerStatus = z.infer<typeof ServerStatusSchema>;
export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;
export type ChaosSelection = z.infer<typeof ChaosSelectionSchema>;
