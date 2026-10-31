import { useEffect, useRef, useState } from 'react';
import { FloatingAlphabetBackground } from './FloatingAlphabetBackground';

type Floating3DLetter = {
  mesh: import('three').Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  driftX: number;
  driftY: number;
  driftZ: number;
  speedX: number;
  speedY: number;
  speedZ: number;
  phaseX: number;
  phaseY: number;
  phaseZ: number;
  parallaxFactor: number;
};

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

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
      if (!stage || !canvas) return;

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const [THREE, { gsap }, { ScrollTrigger }, { FontLoader }, { TextGeometry }] = await Promise.all([
        import('three'),
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('three/examples/jsm/loaders/FontLoader.js'),
        import('three/examples/jsm/geometries/TextGeometry.js'),
      ]);

      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(stage.clientWidth, stage.clientHeight, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, stage.clientWidth / stage.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 10.5);

      // Subtle atmospheric lighting matching WORD-AL aesthetic
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
      scene.add(ambientLight);

      // Key light: illuminates front and top bevels of 3D letters
      const keyLight = new THREE.DirectionalLight(0xfffbf0, 2.4);
      keyLight.position.set(5, 7, 7);
      scene.add(keyLight);

      // Rim light: soft emerald glow on edges
      const rimLight = new THREE.DirectionalLight(0x78ba70, 1.5);
      rimLight.position.set(-6, -4, -2);
      scene.add(rimLight);

      // Accent light: warm gold fill
      const accentLight = new THREE.DirectionalLight(0xd4af37, 1.1);
      accentLight.position.set(2, -6, 5);
      scene.add(accentLight);

      // Load 3D font
      const fontLoader = new FontLoader();
      const font = await fontLoader.loadAsync('/fonts/helvetiker_bold.typeface.json');
      if (cancelled) return;

      const group = new THREE.Group();
      const geometries: Array<{ dispose: () => void }> = [];
      const materials: Array<{ dispose: () => void }> = [];

      // Curated WORD-AL theme materials: green, yellow, gray, subtle off-white/charcoal
      const themePalette = [
        { color: 0x477d40, opacity: 0.85, roughness: 0.35, metalness: 0.18 }, // Wordle Green
        { color: 0xc9b458, opacity: 0.85, roughness: 0.32, metalness: 0.22 }, // Wordle Gold/Yellow
        { color: 0x6b6d70, opacity: 0.75, roughness: 0.40, metalness: 0.15 }, // Wordle Slate Gray
        { color: 0xa8b0b8, opacity: 0.65, roughness: 0.30, metalness: 0.25 }, // Frosted Silver
        { color: 0x5a9452, opacity: 0.80, roughness: 0.34, metalness: 0.20 }, // Emerald Green
        { color: 0xb59f3b, opacity: 0.78, roughness: 0.36, metalness: 0.20 }, // Warm Amber
      ];

      const materialInstances = themePalette.map((props) => {
        const mat = new THREE.MeshStandardMaterial({
          color: props.color,
          roughness: props.roughness,
          metalness: props.metalness,
          transparent: true,
          opacity: props.opacity,
        });
        materials.push(mat);
        return mat;
      });

      // Alphabet letter bank
      const letterChars = [
        'W', 'O', 'R', 'D', 'A', 'L', 'P', 'U', 'Z', 'E',
        'S', 'T', 'G', 'Y', 'V', 'I', 'M', 'N', 'C', 'B',
        'K', 'H', 'F', 'Q', 'X', 'J', 'W', 'O', 'R', 'D',
        'A', 'L', 'P', 'E', 'S',
      ];

      // Cache geometry per unique letter
      const geometryCache = new Map<string, import('three').BufferGeometry>();
      const getGeometry = (char: string) => {
        let geom = geometryCache.get(char);
        if (!geom) {
          geom = new TextGeometry(char, {
            font,
            size: 0.82,
            depth: 0.22,
            curveSegments: 3,
            bevelEnabled: true,
            bevelThickness: 0.035,
            bevelSize: 0.025,
            bevelOffset: 0,
            bevelSegments: 2,
          });
          geom.center(); // Center rotation origin
          geometryCache.set(char, geom);
          geometries.push(geom);
        }
        return geom;
      };

      const rand = seededRandom(0x574f5244);
      const isMobile = stage.clientWidth < 768;
      const count = isMobile ? 18 : 32;
      const letters: Floating3DLetter[] = [];

      for (let i = 0; i < count; i += 1) {
        const char = letterChars[i % letterChars.length];
        const geom = getGeometry(char);
        const mat = materialInstances[i % materialInstances.length];
        const mesh = new THREE.Mesh(geom, mat);

        // Distribute in 3D space with safe margins around reading text
        const side = i % 2 === 0 ? 1 : -1;
        const xSpread = rand() * 5.5 + 2.0; // Pushed outwards from center
        const baseX = side * (isMobile ? Math.min(xSpread, 4.2) : xSpread);
        const baseY = (rand() - 0.5) * (isMobile ? 10.0 : 12.0);
        const baseZ = (rand() - 0.5) * 8.0 - 1.0; // Depth variation (-5 to +3)

        // Scale based on depth for atmospheric perspective
        const depthScale = THREE.MathUtils.lerp(0.5, 1.15, (baseZ + 5) / 8);
        mesh.scale.setScalar(depthScale);

        // Initial 3D orientation
        mesh.rotation.set(
          (rand() - 0.5) * Math.PI,
          (rand() - 0.5) * Math.PI,
          (rand() - 0.5) * Math.PI * 0.5
        );

        mesh.position.set(baseX, baseY, baseZ);
        group.add(mesh);

        letters.push({
          mesh,
          baseX,
          baseY,
          baseZ,
          // Multi-axis rotation speeds
          rotSpeedX: (rand() - 0.5) * 0.007,
          rotSpeedY: (rand() - 0.5) * 0.009,
          rotSpeedZ: (rand() - 0.5) * 0.005,
          // Floating drift oscillation
          driftX: rand() * 0.45 + 0.25,
          driftY: rand() * 0.55 + 0.3,
          driftZ: rand() * 0.35 + 0.15,
          speedX: rand() * 0.5 + 0.3,
          speedY: rand() * 0.6 + 0.35,
          speedZ: rand() * 0.4 + 0.2,
          phaseX: rand() * Math.PI * 2,
          phaseY: rand() * Math.PI * 2,
          phaseZ: rand() * Math.PI * 2,
          parallaxFactor: rand() * 1.2 + 0.6,
        });
      }

      scene.add(group);

      let progress = 0;
      let frame = 0;

      const trigger = ScrollTrigger.create({
        trigger: stage,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        onUpdate: (self) => {
          progress = self.progress;
        },
      });

      const render = (time: number) => {
        const seconds = time * 0.001;

        if (!prefersReducedMotion) {
          // Dynamic group motion responsive to scroll
          group.rotation.y = Math.sin(progress * Math.PI) * 0.22 + seconds * 0.015;
          group.rotation.x = Math.sin(progress * Math.PI * 1.5) * 0.08;

          letters.forEach((item) => {
            // Independent 3D rotation around multiple axes
            item.mesh.rotation.x += item.rotSpeedX;
            item.mesh.rotation.y += item.rotSpeedY;
            item.mesh.rotation.z += item.rotSpeedZ;

            // Smooth floating and drifting harmonic motion
            const floatX = Math.sin(seconds * item.speedX + item.phaseX) * item.driftX;
            const floatY = Math.cos(seconds * item.speedY + item.phaseY) * item.driftY;
            const floatZ = Math.sin(seconds * item.speedZ + item.phaseZ) * item.driftZ;

            // Scroll parallax displacement: layers at varying depths shift naturally
            const scrollParallaxY = (progress - 0.5) * -5.0 * item.parallaxFactor;
            const scrollParallaxZ = Math.sin(progress * Math.PI) * 1.4;

            item.mesh.position.x = item.baseX + floatX;
            item.mesh.position.y = item.baseY + floatY + scrollParallaxY;
            item.mesh.position.z = item.baseZ + floatZ + scrollParallaxZ;
          });

          // Camera depth parallax
          camera.position.z = 10.5 - Math.sin(progress * Math.PI) * 1.2;
          camera.position.y = (progress - 0.5) * -1.2;
        }

        renderer.render(scene, camera);
        if (!prefersReducedMotion) {
          frame = requestAnimationFrame(render);
        }
      };

      const resize = () => {
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        if (prefersReducedMotion) {
          renderer.render(scene, camera);
        }
      };

      const observer = new ResizeObserver(resize);
      observer.observe(stage);

      if (prefersReducedMotion) {
        renderer.render(scene, camera);
      } else {
        frame = requestAnimationFrame(render);
      }

      cleanup = () => {
        cancelAnimationFrame(frame);
        trigger.kill();
        observer.disconnect();
        geometries.forEach((geom) => geom.dispose());
        materials.forEach((mat) => mat.dispose());
        renderer.dispose();
        scene.clear();
      };
    };

    void setup().catch(() => setFallback(true));

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <section
      ref={stageRef}
      className={`cinematic-stage ${fallback ? 'cinematic-stage-fallback' : ''}`}
      aria-label="The WORD-AL experience"
    >
      <FloatingAlphabetBackground />
      <canvas
        ref={canvasRef}
        className={`cinematic-canvas ${fallback ? 'is-fallback' : ''}`}
        aria-hidden="true"
      />
      <div className="cinematic-copy cinematic-copy-intro">
        <span className="eyebrow">A game of signal and instinct</span>
        <h2>Every choice changes the shape of the answer.</h2>
        <p>3D letters tumble and drift in space, coming into focus as your next guess takes shape.</p>
      </div>
      <div className="cinematic-copy cinematic-copy-middle">
        <span className="eyebrow">Built for the long game</span>
        <h2>Practice alone. Enter a room. Stay for the rematch.</h2>
        <button className="text-button" onClick={() => { window.location.hash = '#/play'; }}>
          Choose your mode →
        </button>
      </div>
      <div className="cinematic-copy cinematic-copy-end">
        <span className="eyebrow">Your next word is waiting</span>
        <h2>Play with intention.</h2>
        <button className="button button-primary" onClick={() => { window.location.hash = '#/play'; }}>
          Start playing
        </button>
      </div>
    </section>
  );
}
