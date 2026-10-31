import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { playKeySound, playSound } from './sound';

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
        else playSound('hover');
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
