import { useEffect, useRef } from 'react';

// A self-contained Canvas2D pseudo-3D brain: a point cloud shaped like two
// hemispheres, wired into a fiber-optic-style mesh (nearest-neighbor edges),
// slowly rotating, with glowing "light" pulses traveling along the strands —
// standing in for data moving through the learned brain. No 3D library
// dependency: perspective projection is done by hand (cheap, ~260 points).

interface Point3D { x: number; y: number; z: number }
interface Edge { a: number; b: number }
interface Pulse { edgeIndex: number; t: number; speed: number; reverse: boolean }

function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export default function BrainVisualization3D({ intensity = 1 }: { intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, width * dpr);
    canvas.height = Math.max(1, height * dpr);
    ctx.scale(dpr, dpr);

    // Thin out the mesh on narrow (phone-width) screens — 260 points in a
    // ~300px-wide card reads as a dense, blurry smear rather than a brain.
    const isNarrow = width > 0 && width < 420;
    const NUM_POINTS = isNarrow ? 150 : 260;
    const points: Point3D[] = [];
    for (let i = 0; i < NUM_POINTS; i++) {
      let x = randn(), y = randn(), z = randn();
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      x /= len; y /= len; z /= len;
      const lobeSign = x >= 0 ? 1 : -1;
      const gap = 0.12;
      const xs = x + lobeSign * gap;
      const ys = y * 0.82;
      const zs = z * 1.15;
      const fold = 1 + 0.06 * Math.sin(ys * 8) * Math.cos(zs * 6);
      points.push({ x: xs * fold * 140, y: ys * fold * 110, z: zs * fold * 140 });
    }

    // ── Wire each point to its ~3 nearest neighbors — a fiber-optic mesh. ──
    const edges: Edge[] = [];
    const K = 3;
    for (let i = 0; i < points.length; i++) {
      const dists: { j: number; d: number }[] = [];
      for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y, dz = points[i].z - points[j].z;
        dists.push({ j, d: dx * dx + dy * dy + dz * dz });
      }
      dists.sort((a, b) => a.d - b.d);
      for (let k = 0; k < K; k++) {
        const j = dists[k].j;
        if (!edges.some(e => (e.a === i && e.b === j) || (e.a === j && e.b === i))) {
          edges.push({ a: i, b: j });
        }
      }
    }

    const pulseCount = Math.round(24 * Math.max(0.4, Math.min(2.5, intensity)));
    const pulses: Pulse[] = Array.from({ length: pulseCount }, () => ({
      edgeIndex: Math.floor(Math.random() * edges.length),
      t: Math.random(),
      speed: (0.004 + Math.random() * 0.006) * Math.max(0.4, Math.min(2.5, intensity)),
      reverse: Math.random() < 0.5,
    }));

    let angle = 0;
    let raf = 0;
    let running = true;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    function project(p: Point3D, rotY: number) {
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const x = p.x * cosY - p.z * sinY;
      const z = p.x * sinY + p.z * cosY;
      const y = p.y;
      const fov = 420;
      const scale = fov / (fov + z + 260);
      return { x: width / 2 + x * scale, y: height / 2 + y * scale, scale };
    }

    function draw() {
      if (!running) return;
      if (width < 1 || height < 1) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      if (!reduceMotion) angle += 0.0028;

      const proj = points.map(p => project(p, angle));

      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = proj[e.a], b = proj[e.b];
        const avgScale = (a.scale + b.scale) / 2;
        ctx.strokeStyle = `rgba(168,120,255,${0.12 * avgScale})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const p of proj) {
        ctx.fillStyle = `rgba(196,160,255,${0.4 * p.scale})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4 * p.scale, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const pulse of pulses) {
        if (!reduceMotion) pulse.t += pulse.speed;
        if (pulse.t > 1) {
          pulse.t = 0;
          pulse.edgeIndex = Math.floor(Math.random() * edges.length);
          pulse.reverse = Math.random() < 0.5;
        }
        const e = edges[pulse.edgeIndex];
        const t = pulse.reverse ? 1 - pulse.t : pulse.t;
        const pa = points[e.a], pb = points[e.b];
        const w = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t, z: pa.z + (pb.z - pa.z) * t };
        const pr = project(w, angle);
        const grad = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 7 * pr.scale);
        grad.addColorStop(0, `rgba(120,220,255,${0.9 * pr.scale})`);
        grad.addColorStop(1, 'rgba(120,220,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 7 * pr.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(225,248,255,${0.95 * pr.scale})`;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 1.6 * pr.scale, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }
    draw();

    // ResizeObserver (not just `window.resize`) so the canvas keeps a correct
    // size through mobile-specific layout changes that don't fire a window
    // resize event: orientation change, and the browser chrome collapsing/
    // expanding on scroll (which shrinks/grows the visual viewport height).
    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w === width && h === height) return;
      width = w; height = h;
      canvas.width = Math.max(1, width * dpr);
      canvas.height = Math.max(1, height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(canvas);
    window.addEventListener('orientationchange', syncSize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener('orientationchange', syncSize);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ background: 'radial-gradient(ellipse at center, rgba(88,28,135,0.10) 0%, rgba(0,0,0,0) 72%)' }}
    />
  );
}
