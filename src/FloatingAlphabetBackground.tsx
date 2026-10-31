import { useEffect, useRef } from 'react';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type AmbientLetter = {
  char: string;
  baseXRatio: number;
  baseYRatio: number;
  size: number;
  opacity: number;
  driftX: number;
  driftY: number;
  speed: number;
  phase: number;
  parallax: number;
  rotation: number;
  rotSpeed: number;
  colorType: 'green' | 'yellow' | 'gray';
};

function pseudoRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function FloatingAlphabetBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cancelled = false;
    let frame = 0;

    const rand = pseudoRandom(0x414c5048);
    const count = window.innerWidth < 768 ? 14 : 26;
    const letters: AmbientLetter[] = [];

    const colorTypes: Array<'green' | 'yellow' | 'gray'> = ['green', 'yellow', 'gray'];

    for (let i = 0; i < count; i += 1) {
      letters.push({
        char: ALPHABET[Math.floor(rand() * ALPHABET.length)],
        baseXRatio: rand(),
        baseYRatio: rand(),
        size: Math.floor(rand() * 42 + 24),
        opacity: rand() * 0.12 + 0.04,
        driftX: rand() * 25 + 10,
        driftY: rand() * 30 + 12,
        speed: rand() * 0.4 + 0.2,
        phase: rand() * Math.PI * 2,
        parallax: rand() * 0.18 + 0.05,
        rotation: (rand() - 0.5) * 0.4,
        rotSpeed: (rand() - 0.5) * 0.002,
        colorType: colorTypes[i % colorTypes.length],
      });
    }

    let width = 0;
    let height = 0;
    let scrollY = window.scrollY;
    let targetScrollY = scrollY;

    const resize = () => {
      const parent = canvas.parentElement;
      width = parent?.clientWidth ?? window.innerWidth;
      height = parent?.clientHeight ?? window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onScroll = () => {
      targetScrollY = window.scrollY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize);
    resize();

    const render = (timestamp: number) => {
      if (cancelled) return;
      const seconds = timestamp * 0.001;
      scrollY += (targetScrollY - scrollY) * 0.08;

      ctx.clearRect(0, 0, width, height);
      const isDark = document.documentElement.dataset.theme === 'dark';

      letters.forEach((item) => {
        const floatX = reducedMotion ? 0 : Math.sin(seconds * item.speed + item.phase) * item.driftX;
        const floatY = reducedMotion ? 0 : Math.cos(seconds * item.speed * 0.8 + item.phase) * item.driftY;
        const parallaxY = (scrollY * item.parallax) % (height || 1);

        let x = item.baseXRatio * width + floatX;
        let y = (item.baseYRatio * height + floatY + parallaxY) % (height || 1);
        if (y < 0) y += height;

        ctx.save();
        ctx.translate(x, y);
        if (!reducedMotion) {
          item.rotation += item.rotSpeed;
          ctx.rotate(item.rotation);
        }

        ctx.font = `800 ${item.size}px Inter, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Palette matching WORD-AL colors
        let fill = '';
        if (item.colorType === 'green') {
          fill = isDark ? `rgba(71, 125, 64, ${item.opacity * 1.5})` : `rgba(71, 125, 64, ${item.opacity})`;
        } else if (item.colorType === 'yellow') {
          fill = isDark ? `rgba(181, 159, 59, ${item.opacity * 1.4})` : `rgba(201, 180, 88, ${item.opacity})`;
        } else {
          fill = isDark ? `rgba(255, 255, 255, ${item.opacity * 0.7})` : `rgba(18, 18, 19, ${item.opacity * 0.8})`;
        }

        ctx.fillStyle = fill;
        ctx.fillText(item.char, 0, 0);
        ctx.restore();
      });

      if (!reducedMotion) {
        frame = requestAnimationFrame(render);
      }
    };

    if (reducedMotion) {
      render(0);
    } else {
      frame = requestAnimationFrame(render);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="alphabet-background" aria-hidden="true" />;
}
