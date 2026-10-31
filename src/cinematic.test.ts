import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CinematicExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

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

  it('uses floating 3D alphabet letters with scroll parallax and rotation', () => {
    expect(source).toContain("import('three/examples/jsm/loaders/FontLoader.js')");
    expect(source).toContain("import('three/examples/jsm/geometries/TextGeometry.js')");
    expect(source).toContain("loadAsync('/fonts/helvetiker_bold.typeface.json')");
    expect(source).toContain('rotSpeed');
    expect(source).toContain('parallax');
    expect(css).toContain('rgba(106,170,100,.22)');
    expect(css).toContain('#121213 48%');
    expect(css).toContain('.custom-cursor');
  });

  it('mounts the transparent alphabet background inside the cinematic scene', () => {
    expect(source).toContain('<FloatingAlphabetBackground />');
    expect(app).not.toContain('<FloatingAlphabetBackground />');
    expect(css).toContain('.alphabet-background');
    expect(css).toContain('pointer-events: none');
  });
});
