import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './config.js';

describe('server configuration', () => {
  it('provides safe development defaults and validates numeric bounds', () => {
    expect(loadServerConfig({}).clientOrigins).toEqual(['http://localhost:5173']);
    expect(() => loadServerConfig({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadServerConfig({ REQUEST_BODY_LIMIT: '10' })).toThrow(/REQUEST_BODY_LIMIT/);
  });

  it('requires explicit production origins and rejects wildcard or malformed origins', () => {
    expect(() => loadServerConfig({ NODE_ENV: 'production' })).toThrow(/CLIENT_ORIGIN/);
    expect(() => loadServerConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: '*', PUBLIC_APP_URL: 'https://word-al.example' })).toThrow(/exact HTTP/);
    expect(() => loadServerConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://game.example/path', PUBLIC_APP_URL: 'https://game.example' })).toThrow(/exact HTTP/);
    expect(() => loadServerConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://game.example', PUBLIC_APP_URL: 'https://game.example' })).toThrow(/DATA_FILE/);
    expect(() => loadServerConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://game.example', PUBLIC_APP_URL: 'https://other.example', DATA_FILE: '/var/lib/word-al.json' })).toThrow(/include PUBLIC_APP_URL/);
    expect(loadServerConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://game.example', PUBLIC_APP_URL: 'https://game.example', DATA_FILE: '/var/lib/word-al.json' }).clientOrigins).toEqual(['https://game.example']);
  });
});
