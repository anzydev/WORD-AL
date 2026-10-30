import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  CLIENT_ORIGIN: z.string().optional(),
  PUBLIC_APP_URL: z.string().url().optional(),
  DATA_FILE: z.string().trim().min(1).default('.data/word-al.json'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REQUEST_BODY_LIMIT: z.coerce.number().int().min(1024).max(1_048_576).default(32_768),
  ROOM_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(60_000),
  ROOM_IDLE_TTL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(1_800_000),
  SESSION_TTL_MS: z.coerce.number().int().min(60_000).max(604_800_000).default(86_400_000),
  LEADERBOARD_MIN_GAMES: z.coerce.number().int().min(1).max(100_000).default(5),
  LEADERBOARD_MIN_ROUNDS: z.coerce.number().int().min(1).max(1_000_000).default(25),
  LEADERBOARD_RECENT_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
});

export type ServerConfig = z.infer<typeof EnvSchema> & { clientOrigins: string[] };

export function loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid WORD-AL server configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  const value = parsed.data;
  const clientOrigins = (value.CLIENT_ORIGIN ?? (value.NODE_ENV === 'production' ? '' : 'http://localhost:5173')).split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!clientOrigins.length || clientOrigins.some((origin) => origin === '*' || !isOrigin(origin))) throw new Error('CLIENT_ORIGIN must contain one or more exact HTTP(S) origins; wildcard origins are not allowed.');
  if (value.NODE_ENV === 'production' && !value.CLIENT_ORIGIN) throw new Error('CLIENT_ORIGIN must be explicitly configured in production.');
  if (value.NODE_ENV === 'production' && !env.DATA_FILE) throw new Error('DATA_FILE must be explicitly configured in production.');
  if (value.PUBLIC_APP_URL && !isOrigin(value.PUBLIC_APP_URL)) throw new Error('PUBLIC_APP_URL must be an origin URL without a path, query, or fragment.');
  if (value.NODE_ENV === 'production' && !value.PUBLIC_APP_URL) throw new Error('PUBLIC_APP_URL must be explicitly configured in production.');
  if (value.PUBLIC_APP_URL && !clientOrigins.includes(value.PUBLIC_APP_URL)) throw new Error('CLIENT_ORIGIN must include PUBLIC_APP_URL.');
  return { ...value, clientOrigins };
}

function isOrigin(value: string) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && url.origin === value.replace(/\/$/, ''); }
  catch { return false; }
}
