import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { playControlSound, playKeySound, playSound, type ControlSound } from './sound';

function soundForTarget(target: Element): ControlSound | null {
  if (target.classList.contains('theme-toggle')) return 'theme';
  if (target.classList.contains('icon-button') || target.classList.contains('close-button')) return 'icon';
  if (target.classList.contains('button-primary')) return 'primary';
  if (target.classList.contains('button-secondary') || target.classList.contains('option')) return 'secondary';
  if (target.classList.contains('choice-card') || target.classList.contains('mode-card')) return 'choice';
  if (target.classList.contains('text-button') || target.classList.contains('back-link') || target.classList.contains('wordmark')) return 'text';
  if (target.matches('button, a, [role="button"]')) return 'text';
  return null;
}

export function ExperienceEnhancements() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorActive, setCursorActive] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;
    const lenis = new Lenis({ lerp: 0.075, smoothWheel: true, syncTouch: false });
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(pointer: fine)');
    if (reducedMotion.matches || !pointer.matches) return;
    const cursor = cursorRef.current;
    if (!cursor) return;
    let x = -100;
    let y = -100;
    let lastInteractiveTarget: Element | null = null;
    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      setCursorVisible(true);
      const target = event.target instanceof Element ? event.target.closest('button, a, [role="button"], input, select, .hero-tile') : null;
      setCursorActive(Boolean(target));
      if (target && target !== lastInteractiveTarget) {
        const letter = target instanceof HTMLElement ? target.dataset.letter : undefined;
        if (letter) playKeySound(letter);
        else if (target.classList.contains('key-wide')) playSound(target.textContent?.includes('ENTER') ? 'submit' : 'error');
        else {
          const controlSound = soundForTarget(target);
          if (controlSound) playControlSound(controlSound);
        }
        lastInteractiveTarget = target;
      } else if (!target) {
        lastInteractiveTarget = null;
      }
    };
    const leave = () => setCursorVisible(false);
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('mouseleave', leave);
    };
  }, []);

  return <div ref={cursorRef} className={`custom-cursor ${cursorVisible ? 'is-visible' : ''} ${cursorActive ? 'is-active' : ''}`} aria-hidden="true"><span /></div>;
}
