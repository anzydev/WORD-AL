import { useEffect, useRef, useState } from 'react';
export function CinematicExperience() {
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const setup = async () => {
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (!stage || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const [THREE, { gsap }, { ScrollTrigger }] = await Promise.all([
        import('three'),
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(stage.clientWidth, stage.clientHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / stage.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 9);
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0xe7ddc6, roughness: 0.3, metalness: 0.28 });
      const accent = new THREE.MeshStandardMaterial({ color: 0xd0a43b, roughness: 0.2, metalness: 0.58 });
      const geometry = new THREE.BoxGeometry(1.02, 1.02, 1.02);
      for (let index = 0; index < 18; index += 1) {
        const tile = new THREE.Mesh(geometry, index % 5 === 0 ? accent : material);
        const column = index % 6;
        const row = Math.floor(index / 6);
        const angle = (column - 2.5) * 0.16 + row * 0.1;
        tile.position.set((column - 2.5) * 1.12, (1 - row) * 1.28, Math.sin(column * 0.8 + row) * 0.35 - row * 0.35);
        tile.rotation.set(row * 0.24 + index * 0.04, angle, column * 0.08 - row * 0.16);
        group.add(tile);
      }
      scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff, 1.4));
      const keyLight = new THREE.DirectionalLight(0xf4ead8, 2.8);
      keyLight.position.set(3, 5, 6);
      scene.add(keyLight);
      let progress = 0;
      let frame = 0;
      const trigger = ScrollTrigger.create({ trigger: stage, start: 'top top', end: 'bottom bottom', scrub: 1, onUpdate: (self) => { progress = self.progress; } });
      const render = (time: number) => {
        const seconds = time * 0.001;
        group.rotation.y = progress * Math.PI * 1.45 + seconds * 0.06;
        group.rotation.x = Math.sin(progress * Math.PI) * 0.32;
        group.position.y = progress * -0.65;
        group.position.z = Math.sin(progress * Math.PI) * 0.5;
        camera.position.z = 9 - progress * 1.45;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      const resize = () => {
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(stage);
      frame = requestAnimationFrame(render);
      cleanup = () => {
        cancelAnimationFrame(frame);
        trigger.kill();
        observer.disconnect();
        geometry.dispose();
        material.dispose();
        accent.dispose();
        renderer.dispose();
        scene.clear();
      };
    };
    void setup().catch(() => setFallback(true));
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  return <section ref={stageRef} className={`cinematic-stage ${fallback ? 'cinematic-stage-fallback' : ''}`} aria-label="The WORD-AL experience">
    <canvas ref={canvasRef} className={`cinematic-canvas ${fallback ? 'is-fallback' : ''}`} aria-hidden="true" />
    <div className="cinematic-copy cinematic-copy-intro"><span className="eyebrow">A game of signal and instinct</span><h2>Every letter changes the shape of the answer.</h2><p>Read the board. Trust the pattern. Make the next move count.</p></div>
    <div className="cinematic-copy cinematic-copy-middle"><span className="eyebrow">Built for the long game</span><h2>Practice alone. Enter a room. Stay for the rematch.</h2><button className="text-button" onClick={() => { window.location.hash = '#/play'; }}>Choose your mode →</button></div>
    <div className="cinematic-copy cinematic-copy-end"><span className="eyebrow">Your next word is waiting</span><h2>Play with intention.</h2><button className="button button-primary" onClick={() => { window.location.hash = '#/play'; }}>Start playing</button></div>
  </section>;
}
