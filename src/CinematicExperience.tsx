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
      const [THREE, { gsap }, { ScrollTrigger }, { GLTFLoader }] = await Promise.all([
        import('three'),
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
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
      const geometries: Array<{ dispose: () => void }> = [];
      const materials: Array<{ dispose: () => void }> = [];
      const loader = new GLTFLoader();
      const crystal = await loader.loadAsync('/models/crystal-cluster.glb');
      const source = crystal.scene;
      source.scale.setScalar(0.42);
      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.push(object.geometry);
        const material = Array.isArray(object.material) ? object.material : [object.material];
        materials.push(...material);
      });
      const crystalPositions = [[-2.2, 1.3], [-1.1, 0.7], [0, 0], [1.1, -0.7], [2.2, -1.3], [-1.5, -0.45], [0, -0.45], [1.5, -0.45]];
      crystalPositions.forEach(([targetX, targetY], index) => {
        const fragment = source.clone(true);
        fragment.userData.target = new THREE.Vector3(targetX, targetY, 0);
        fragment.position.set((index % 2 ? -1 : 1) * (3.5 + index * 0.12), 2.8 - index * 0.5, (index % 4) - 1.5);
        fragment.rotation.set(index * 0.7, index * 0.35, index * 0.2);
        fragment.scale.multiplyScalar(0.18 + (index % 3) * 0.035);
        group.add(fragment);
      });
      scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff, 1.4));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
      keyLight.position.set(3, 5, 6);
      scene.add(keyLight);
      let progress = 0;
      let frame = 0;
      const trigger = ScrollTrigger.create({ trigger: stage, start: 'top top', end: 'bottom bottom', scrub: 1, onUpdate: (self) => { progress = self.progress; } });
      const render = (time: number) => {
        const seconds = time * 0.001;
        group.rotation.y = Math.sin(progress * Math.PI) * 0.18;
        group.rotation.x = Math.sin(progress * Math.PI * 2) * 0.08;
        group.position.y = progress * -0.45;
        group.position.z = Math.sin(progress * Math.PI) * 0.45;
        group.children.forEach((child, index) => {
          const target = child.userData.target as { x: number; y: number; z: number };
          const scatter = 1 - progress;
          child.position.x += (target.x + Math.sin(seconds * 0.7 + index) * scatter * 0.7 - child.position.x) * 0.035;
          child.position.y += (target.y + Math.cos(seconds * 0.55 + index) * scatter * 0.7 - child.position.y) * 0.035;
          child.position.z += (target.z + Math.sin(seconds + index * 0.8) * scatter * 0.8 - child.position.z) * 0.035;
          child.rotation.x += 0.002 * scatter;
          child.rotation.y += 0.003 * scatter;
        });
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
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        renderer.dispose();
        scene.clear();
      };
    };
    void setup().catch(() => setFallback(true));
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  return <section ref={stageRef} className={`cinematic-stage ${fallback ? 'cinematic-stage-fallback' : ''}`} aria-label="The WORD-AL experience">
    <canvas ref={canvasRef} className={`cinematic-canvas ${fallback ? 'is-fallback' : ''}`} aria-hidden="true" />
    <div className="cinematic-copy cinematic-copy-intro"><span className="eyebrow">A game of signal and instinct</span><h2>Every choice changes the shape of the answer.</h2><p>A real crystal cluster breaks apart, then gathers into a letter as your next guess comes into focus.</p></div>
    <div className="cinematic-copy cinematic-copy-middle"><span className="eyebrow">Built for the long game</span><h2>Practice alone. Enter a room. Stay for the rematch.</h2><button className="text-button" onClick={() => { window.location.hash = '#/play'; }}>Choose your mode →</button></div>
    <div className="cinematic-copy cinematic-copy-end"><span className="eyebrow">Your next word is waiting</span><h2>Play with intention.</h2><button className="button button-primary" onClick={() => { window.location.hash = '#/play'; }}>Start playing</button></div>
  </section>;
}
