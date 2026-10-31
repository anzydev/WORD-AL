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

  it('uses scroll-led crystal fragments that assemble into a letter', () => {
    expect(source).toContain('const crystalPositions');
    expect(source).toContain('new THREE.IcosahedronGeometry');
    expect(source).toContain('child.userData.target');
    expect(source).toContain('group.position.z');
    expect(css).toContain('rgba(106,170,100,.22)');
    expect(css).toContain('#121213 48%');
    expect(css).toContain('.custom-cursor');
  });
});
