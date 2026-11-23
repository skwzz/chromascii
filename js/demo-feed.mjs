/**
 * CHROMASCII — Built-in 60FPS Procedural Demo Video Generator
 * Provides live colorful animated scenes immediately upon open before uploading a video.
 */

export class ProceduralDemoFeed {
  constructor(width = 640, height = 360) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.mode = 'plasma';
    this.elapsed = 0;
  }

  setMode(mode) {
    this.mode = mode;
  }

  render(dtSec) {
    this.elapsed += dtSec;
    const t = this.elapsed;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (this.mode === 'torus') {
      this.drawTorusKnot(ctx, w, h, t);
    } else if (this.mode === 'tunnel') {
      this.drawCyberTunnel(ctx, w, h, t);
    } else {
      this.drawNeonPlasma(ctx, w, h, t);
    }
    return this.canvas;
  }

  drawNeonPlasma(ctx, w, h, t) {
    ctx.fillStyle = '#04060e';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const orbs = [
      { cx: 0.5 + Math.cos(t * 0.9) * 0.28, cy: 0.5 + Math.sin(t * 1.1) * 0.24, r: 210, c1: '#38bdf8', c2: '#6366f1' },
      { cx: 0.5 + Math.cos(t * 1.2 + 2.1) * 0.3, cy: 0.5 + Math.sin(t * 0.8 + 1.4) * 0.25, r: 195, c1: '#f43f5e', c2: '#a855f7' },
      { cx: 0.5 + Math.cos(t * 0.7 + 4.2) * 0.26, cy: 0.5 + Math.sin(t * 1.3 + 3.0) * 0.22, r: 175, c1: '#fbbf24', c2: '#34d399' },
    ];

    for (const o of orbs) {
      const x = o.cx * w;
      const y = o.cy * h;
      const grad = ctx.createRadialGradient(x, y, 8, x, y, o.r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.28, o.c1);
      grad.addColorStop(0.65, o.c2);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flowing luminous wave ribbons
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      const hue = (t * 48 + k * 55) % 360;
      ctx.strokeStyle = `hsla(${hue}, 95%, 64%, 0.7)`;
      ctx.lineWidth = 10 - k * 1.2;
      for (let x = 0; x <= w; x += 14) {
        const y =
          h * 0.5 +
          Math.sin(x * 0.015 + t * (1.8 + k * 0.25) + k) * (55 + k * 14) +
          Math.cos(x * 0.008 - t * 1.1) * 32;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  drawTorusKnot(ctx, w, h, t) {
    ctx.fillStyle = '#03050c';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.5;
    const points = [];
    const N = 260;

    // 3D (2,3) Torus Knot projected with depth sorting
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * Math.PI * 2;
      const r = 2 + Math.cos(3 * phi);
      let x = r * Math.cos(2 * phi);
      let y = r * Math.sin(2 * phi);
      let z = -Math.sin(3 * phi);

      // Rotate Y then X
      const cosY = Math.cos(t * 0.85);
      const sinY = Math.sin(t * 0.85);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      const cosX = Math.cos(t * 0.55);
      const sinX = Math.sin(t * 0.55);
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      const persp = 5.2 / (6.8 - z2);
      points.push({
        sx: cx + x1 * 72 * persp,
        sy: cy + y2 * 72 * persp,
        z: z2,
        rad: Math.max(4, 21 * persp),
        hue: ((i / N) * 360 + t * 65) % 360,
      });
    }

    points.sort((a, b) => a.z - b.z);
    for (const p of points) {
      const light = Math.min(82, Math.max(32, 52 + p.z * 14));
      const g = ctx.createRadialGradient(p.sx - p.rad * 0.3, p.sy - p.rad * 0.3, 1, p.sx, p.sy, p.rad);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, `hsl(${p.hue}, 96%, ${light}%)`);
      g.addColorStop(1, `hsla(${p.hue}, 90%, 22%, 0.2)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawCyberTunnel(ctx, w, h, t) {
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5 + Math.cos(t * 1.1) * 55;
    const cy = h * 0.5 + Math.sin(t * 0.9) * 35;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 18; i >= 1; i--) {
      const phase = ((i - ((t * 4.5) % 1)) / 18);
      const r = Math.pow(phase, 2.2) * w * 0.72;
      const hue = (phase * 220 + t * 90) % 360;
      const sides = 6;
      const rot = t * 0.65 + phase * 1.4;

      ctx.strokeStyle = `hsla(${hue}, 95%, 60%, ${Math.min(1, phase * 1.4)})`;
      ctx.lineWidth = Math.max(2, phase * 16);
      ctx.beginPath();
      for (let s = 0; s <= sides; s++) {
        const ang = rot + (s / sides) * Math.PI * 2;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Center star core
    const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, 95);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.35, '#38bdf8');
    core.addColorStop(0.7, '#a855f7');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
