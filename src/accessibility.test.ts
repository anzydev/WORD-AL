import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(left: string, right: string) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function token(name: string, source: string) {
  return source.match(new RegExp(`${name}:\\s*(#[a-f\\d]{6})`, 'i'))?.[1];
}

describe('accessibility and responsive style contracts', () => {
  it('keeps feedback text and focus indicators at readable contrast in both themes', () => {
    const light = css.match(/:root \{[^}]+\}/)?.[0] ?? '';
    const dark = css.match(/:root\[data-theme="dark"\] \{[^}]+\}/)?.[0] ?? '';
    const white = '#ffffff';
    const ink = '#121213';
    expect(contrast(token('--green', light)!, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--gray', light)!, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--muted', light)!, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--yellow', light)!, ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--green', dark)!, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--gray', dark)!, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--yellow', dark)!, ink)).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain('button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--green-dark)');
  });

  it('retains narrow-screen layouts, touch-sized keys, safe-area padding, and reduced motion', () => {
    expect(css).toContain('@media (max-width: 430px)');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('env(safe-area-inset-bottom');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('overflow-x: clip');
    expect(css).toContain('.board[data-length="6"] .tile');
  });
});
