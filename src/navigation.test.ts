import { describe, expect, it } from 'vitest';
import { resolveRoute } from './App';

describe('route resolution', () => {
  it.each([
    ['/', 'home'], ['/play', 'practice'], ['/multiplayer', 'multiplayer'], ['/stats', 'stats'], ['/settings', 'settings'], ['/help', 'help'],
  ])('resolves %s', (path, route) => expect(resolveRoute(path)).toBe(route));

  it('supports internal aliases and gives unknown routes a not-found destination', () => {
    expect(resolveRoute('/practice')).toBe('practice');
    expect(resolveRoute('/not-a-real-page')).toBe('not-found');
  });
});
