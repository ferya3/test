'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Float, RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export type ScenePanel = { color: string; family: 'wood' | 'stone' | 'solid' | 'fabric' };

/**
 * A procedural surface for a panel: wood grain, stone veining or a woven
 * texture, drawn once on a canvas. No image files to fetch, which matters for
 * a server that cannot always reach a CDN and for a strict CSP.
 */
function useSurface(color: string, family: ScenePanel['family']) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Deterministic, so the same panel looks the same on every visit.
    let seed = [...color].reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

    if (family === 'wood') {
      for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = `rgba(0,0,0,${0.03 + rand() * 0.07})`;
        ctx.lineWidth = 0.5 + rand() * 2;
        ctx.beginPath();
        const x = rand() * canvas.width;
        ctx.moveTo(x, 0);
        for (let y = 0; y <= canvas.height; y += 24) {
          ctx.lineTo(x + Math.sin(y / 60 + i) * 6 * rand(), y);
        }
        ctx.stroke();
      }
    } else if (family === 'stone') {
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = `rgba(60,55,50,${0.08 + rand() * 0.18})`;
        ctx.lineWidth = 0.6 + rand() * 1.6;
        ctx.beginPath();
        let x = rand() * canvas.width;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < canvas.height) {
          x += (rand() - 0.45) * 40;
          y += 10 + rand() * 30;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (family === 'fabric') {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < canvas.width; i += 3) ctx.fillRect(i, 0, 1, canvas.height);
      for (let j = 0; j < canvas.height; j += 3) ctx.fillRect(0, j, canvas.width, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    return texture;
  }, [color, family]);
}

function Panel({ panel, index, total, still }: { panel: ScenePanel; index: number; total: number; still: boolean }) {
  const map = useSurface(panel.color, panel.family);
  // A fan of sheets, like samples spread on a showroom table.
  const spread = index - (total - 1) / 2;
  const glossy = panel.family === 'solid' || panel.family === 'stone';

  const body = (
    <group position={[spread * 0.95, spread * 0.12, -Math.abs(spread) * 0.45]} rotation={[0, -spread * 0.22, spread * 0.06]}>
      <RoundedBox args={[1.5, 2.3, 0.08]} radius={0.025} smoothness={3} castShadow>
        <meshPhysicalMaterial
          map={map}
          roughness={glossy ? 0.18 : 0.55}
          clearcoat={glossy ? 1 : 0.2}
          clearcoatRoughness={0.15}
        />
      </RoundedBox>
      {/* The gold edge band. */}
      <mesh position={[0, 0, -0.045]}>
        <boxGeometry args={[1.53, 2.33, 0.012]} />
        <meshStandardMaterial color="#d4a853" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );

  if (still) return body;

  return (
    <Float speed={1.2 + index * 0.15} rotationIntensity={0.25} floatIntensity={0.5}>
      {body}
    </Float>
  );
}

/** Turns the whole fan gently toward the pointer. */
function Rig({ children, still }: { children: React.ReactNode; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  // The fan is about five units wide; on a narrow phone, shrink it to fit
  // rather than let the outer sheets fall off the edges.
  const width = useThree((state) => state.viewport.width);
  const scale = Math.min(1, width / 5.6);

  useFrame((state, delta) => {
    if (!group.current || still) return;
    const { x, y } = state.pointer;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, x * 0.25, 3, delta);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -y * 0.12, 3, delta);
  });

  return (
    <group ref={group} scale={scale}>
      {children}
    </group>
  );
}

export default function HeroScene({ panels }: { panels: ScenePanel[] }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Stop rendering when the hero is scrolled away — a WebGL loop running
    // off-screen is a phone battery spent on nothing.
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    if (wrapper.current) observer.observe(wrapper.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapper} className="size-full" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.2, 6.2], fov: 38 }}
        frameloop={visible && !still ? 'always' : 'demand'}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        shadows
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} castShadow />
        {/* Warm rim light from behind, catching the gold edges. */}
        <pointLight position={[-3, 1, -2]} intensity={14} color="#e6c47e" />
        <pointLight position={[3, -2, 2]} intensity={4} color="#ffffff" />

        <Rig still={still}>
          {panels.map((panel, i) => (
            <Panel key={i} panel={panel} index={i} total={panels.length} still={still} />
          ))}
        </Rig>

        <ContactShadows position={[0, -1.65, 0]} opacity={0.45} scale={10} blur={2.6} far={3} color="#000000" />
      </Canvas>
    </div>
  );
}
