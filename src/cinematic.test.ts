import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CinematicExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('cinematic experience contracts', () => {
  it('keeps 3-D work lazy and lifecycle-safe', () => {
    expect(source).toContain("import('three')");
    expect(source).toContain("import('gsap')");
    expect(source).toContain('trigger.kill()');
    expect(source).toContain('renderer.dispose()');
    expect(source).toContain('setup().catch');
  });

  it('provides a reduced-motion and fallback presentation', () => {
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain('cinematic-stage-fallback');
    expect(css).toContain('.cinematic-stage');
    expect(css).toContain('.cinematic-canvas.is-fallback');
  });
});
