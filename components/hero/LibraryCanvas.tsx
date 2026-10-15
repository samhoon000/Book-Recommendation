"use client";

import { useEffect, useRef } from "react";

/**
 * "The reading room after hours": layered shelves of thousands of book spines receding into the dark.
 * The pointer is a reading lamp: spines near it warm up, shelves shift with slight parallax,
 * and dust drifts through the light. With reduced motion, a single still frame is drawn.
 */

const CLOTH = ["#6b2f2a", "#2f4a3c", "#2c3a5c", "#5a4a2a", "#4a2f45", "#7a5a30", "#444037", "#5c3b2b", "#2b4b4f", "#6e6250", "#38452e", "#53303a"];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Layer {
  canvas: HTMLCanvasElement;
  depth: number; // 0 far … 1 near
  shift: number; // max parallax in px
}

interface Dust {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
}

const LAYER_SPECS = [
  { depth: 0, scale: 0.34, shift: 10, alpha: 0.55 },
  { depth: 0.5, scale: 0.58, shift: 24, alpha: 0.8 },
  { depth: 1, scale: 0.95, shift: 46, alpha: 1 },
];

function paintLayer(w: number, h: number, dpr: number, scale: number, seed: number, alpha: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const rand = mulberry32(seed);
  const rowH = 132 * scale;
  const plank = Math.max(2, 9 * scale);
  ctx.globalAlpha = alpha;

  for (let top = -rand() * rowH; top < h; top += rowH + plank) {
    let x = -rand() * 20;
    while (x < w) {
      // occasional gap between groups of books
      if (rand() < 0.035) {
        x += (8 + rand() * 40) * scale;
        continue;
      }
      const bw = (7 + rand() * 13) * scale * (rand() < 0.06 ? 2 : 1);
      const bh = rowH * (0.62 + rand() * 0.34);
      const color = CLOTH[Math.floor(rand() * CLOTH.length)];
      const lean = rand() < 0.03 ? (rand() - 0.5) * 0.35 : 0;
      ctx.save();
      ctx.translate(x + bw / 2, top + rowH);
      ctx.rotate(lean);
      ctx.fillStyle = color;
      ctx.fillRect(-bw / 2, -bh, bw, bh);
      // spine curvature: light on one edge, shadow on the other
      const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      g.addColorStop(0, "rgba(0,0,0,0.35)");
      g.addColorStop(0.35, "rgba(255,240,210,0.10)");
      g.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(-bw / 2, -bh, bw, bh);
      // gilt title bands
      if (bw > 5 && rand() < 0.75) {
        ctx.fillStyle = `rgba(224,170,72,${0.35 + rand() * 0.4})`;
        const bands = rand() < 0.5 ? 2 : 1;
        for (let i = 0; i < bands; i++) {
          const by = -bh * (0.18 + i * 0.1 + rand() * 0.05);
          ctx.fillRect(-bw / 2 + bw * 0.18, by, bw * 0.64, Math.max(0.8, 1.6 * scale));
        }
        if (rand() < 0.5) ctx.fillRect(-bw / 2 + bw * 0.3, -bh * 0.55, bw * 0.4, bh * 0.16);
      }
      ctx.restore();
      x += bw + (rand() < 0.2 ? 1.5 * scale : 0.4);
    }
    // the shelf plank
    ctx.fillStyle = "#2a2118";
    ctx.fillRect(0, top + rowH, w, plank);
    ctx.fillStyle = "rgba(255,220,160,0.09)";
    ctx.fillRect(0, top + rowH, w, Math.max(1, plank * 0.18));
  }
  return c;
}

export function LibraryCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let layers: Layer[] = [];
    const light = document.createElement("canvas");
    const lctx = light.getContext("2d")!;
    let dust: Dust[] = [];

    // lamp state: target follows the pointer, position eases toward it
    const target = { x: 0.72, y: 0.42, active: false };
    const lamp = { x: 0.72, y: 0.42 };
    const pointer = { x: 0.5, y: 0.5 };
    let raf = 0;
    let visible = true;
    let t0 = performance.now();

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.25);
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);
      light.width = canvas.width;
      light.height = canvas.height;
      layers = LAYER_SPECS.map((spec, i) => ({
        canvas: paintLayer(w + spec.shift * 2, h + spec.shift, dpr, spec.scale * (w < 640 ? 0.8 : 1), 1337 + i * 101, spec.alpha),
        depth: spec.depth,
        shift: spec.shift,
      }));
      const count = Math.round(Math.min(160, (w * h) / 9000));
      const rand = mulberry32(7);
      dust = Array.from({ length: count }, () => ({
        x: rand() * w,
        y: rand() * h,
        z: 0.3 + rand() * 0.7,
        vx: (rand() - 0.5) * 0.06,
        vy: -0.03 - rand() * 0.08,
      }));
    };

    const draw = (time: number) => {
      const dt = Math.min(48, time - t0);
      t0 = time;
      if (!target.active) {
        // idle: the lamp wanders slowly so the room feels inhabited even without a cursor
        const s = time / 1000;
        target.x = 0.68 + Math.sin(s * 0.21) * 0.16;
        target.y = 0.42 + Math.sin(s * 0.33 + 1) * 0.14;
      }
      const ease = reduce ? 1 : 1 - Math.pow(0.9, dt / 16);
      lamp.x += (target.x - lamp.x) * ease;
      lamp.y += (target.y - lamp.y) * ease;
      pointer.x += ((target.active ? target.x : 0.5) - pointer.x) * ease * 0.6;
      pointer.y += ((target.active ? target.y : 0.5) - pointer.y) * ease * 0.6;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0c0a08";
      ctx.fillRect(0, 0, w, h);

      // 1. the dark room: all layers, heavily dimmed, farther ones fogged
      for (const layer of layers) {
        const ox = -layer.shift - (pointer.x - 0.5) * layer.shift * 2;
        const oy = -(pointer.y - 0.5) * layer.shift;
        ctx.globalAlpha = 0.16 + layer.depth * 0.1;
        ctx.drawImage(layer.canvas, ox, oy, layer.canvas.width / dpr, layer.canvas.height / dpr);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(12,10,8,${0.5 - layer.depth * 0.35})`;
        ctx.fillRect(0, 0, w, h);
      }

      // 2. the lamp: the same shelves at full color, masked to a warm pool of light
      const lx = lamp.x * w;
      const ly = lamp.y * h;
      const radius = Math.max(260, Math.min(w, h) * 0.55);
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.globalCompositeOperation = "source-over";
      lctx.clearRect(0, 0, w, h);
      for (const layer of layers) {
        const ox = -layer.shift - (pointer.x - 0.5) * layer.shift * 2;
        const oy = -(pointer.y - 0.5) * layer.shift;
        lctx.globalAlpha = 0.45 + layer.depth * 0.55;
        lctx.drawImage(layer.canvas, ox, oy, layer.canvas.width / dpr, layer.canvas.height / dpr);
      }
      lctx.globalAlpha = 1;
      lctx.globalCompositeOperation = "destination-in";
      const mask = lctx.createRadialGradient(lx, ly, 0, lx, ly, radius);
      mask.addColorStop(0, "rgba(0,0,0,0.95)");
      mask.addColorStop(0.35, "rgba(0,0,0,0.55)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      lctx.fillStyle = mask;
      lctx.fillRect(0, 0, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(light, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // warm haze in the air around the lamp
      const haze = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius * 0.9);
      haze.addColorStop(0, "rgba(224,170,72,0.10)");
      haze.addColorStop(1, "rgba(224,170,72,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);

      // 3. dust motes, bright only inside the light
      for (const p of dust) {
        if (!reduce) {
          p.x += p.vx * dt * p.z + (pointer.x - 0.5) * 0.02 * p.z;
          p.y += p.vy * dt * p.z * 0.4;
          if (p.y < -4) p.y = h + 4;
          if (p.x < -4) p.x = w + 4;
          if (p.x > w + 4) p.x = -4;
        }
        const d = Math.hypot(p.x - lx, p.y - ly) / radius;
        const a = 0.05 + Math.max(0, 1 - d) * 0.75 * p.z;
        ctx.fillStyle = `rgba(255,226,170,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.6 + p.z * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      t0 = performance.now();
      raf = requestAnimationFrame(draw);
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      target.active = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (target.active) {
        target.x = x;
        target.y = y;
      }
    };

    build();
    if (reduce) {
      draw(performance.now());
    } else {
      start();
      window.addEventListener("pointermove", onPointer, { passive: true });
    }

    const ro = new ResizeObserver(() => {
      build();
      if (reduce) draw(performance.now());
    });
    ro.observe(canvas);

    // Stop drawing when the hero is offscreen or the tab is hidden.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !reduce) start();
    });
    io.observe(canvas);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible && !reduce) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
