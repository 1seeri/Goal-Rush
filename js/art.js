// =============================================================
//  art.js — generative stadium illustrations on <canvas>.
//  Each venue gets its own drawing from a seed: bowl shape, roof,
//  floodlights, and a crowd coloured by the nations who played there.
//  This is an illustration, not a photograph.
// =============================================================
export function rng(seed) {
  let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) | 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const ROOFED = new Set(['Mercedes-Benz Stadium', 'AT&T Stadium', 'NRG Stadium', 'SoFi Stadium', 'BC Place']);

export function stadiumArt(canvas, { seed, stadium, colours, reduced }) {
  const ctx = canvas.getContext('2d');
  let W, H, dpr, raf = 0, alive = true, crowd = [], flashes = [], roarT = -10;
  const r = rng(seed);
  const tilt = .33 + r() * .08;        // how flat the bowl looks
  const roof = ROOFED.has(stadium);
  const tiers = 2 + Math.floor(r() * 2);
  const towers = roof ? 0 : 4;
  const palette = [...colours, '#E9E4D6', '#2E3A35', '#8C8F86', '#C9A35B'];

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const b = canvas.getBoundingClientRect(); W = b.width; H = b.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    // place crowd dots on the bowl, tier by tier
    crowd = [];
    const rr = rng(seed + 'crowd');
    const cx = W / 2, cy = H * .62, RX = W * .47, RY = RX * tilt;
    for (let tier = 0; tier < tiers; tier++) {
      const r0 = .58 + tier * (.4 / tiers), r1 = r0 + .4 / tiers - .02;
      const rows = 10;
      for (let row = 0; row < rows; row++) {
        const k = r0 + (r1 - r0) * row / rows;
        const n = Math.floor(260 * k * (W / 1200) + 60);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rr() * .02;
          const x = cx + Math.cos(a) * RX * k, y = cy + Math.sin(a) * RY * k - (k - .58) * H * .18;
          const near = (Math.sin(a) + 1) / 2;           // front of bowl = closer = bigger
          // sections of the crowd wear the same colours, like real supporters' ends
          const block = Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 14);
          const c = rr() < .7 ? palette[block % Math.max(1, colours.length)] : palette[Math.floor(rr() * palette.length)];
          crowd.push({ x, y, s: (.9 + near * 1.6) * (W / 1200 + .4), c, ph: rr() * 6.28, near });
        }
      }
    }
    crowd.sort((a, b) => a.y - b.y);
  }

  function draw(now) {
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2, cy = H * .62, RX = W * .47, RY = RX * tilt;

    // night sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05090A'); sky.addColorStop(.55, '#0E1A17'); sky.addColorStop(1, '#0F1714');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // floodlight haze
    ctx.globalCompositeOperation = 'lighter';
    const haze = ctx.createRadialGradient(cx, cy - RY * .2, 10, cx, cy, RX * 1.1);
    haze.addColorStop(0, 'rgba(255,244,214,.20)'); haze.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = haze; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // outer shell of the bowl
    ctx.fillStyle = '#121A17';
    ctx.beginPath(); ctx.ellipse(cx, cy - H * .07, RX * 1.02, RY * 1.08, 0, 0, 7); ctx.fill();

    // pitch: mowed stripes inside the inner ellipse
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, RX * .56, RY * .56, 0, 0, 7); ctx.clip();
    const pw = RX * 1.0, ph = RY * .86;
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? '#1F6B45' : '#247A4F';
      ctx.fillRect(cx - pw / 2 + i * pw / 12, cy - ph / 2, pw / 12 + 1, ph);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.4;
    const fx = cx - pw * .4, fy = cy - ph * .38, fw = pw * .8, fh = ph * .76;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.beginPath(); ctx.moveTo(cx, fy); ctx.lineTo(cx, fy + fh); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, fh * .2 / tilt * tilt * 1.2, fh * .2, 0, 0, 7); ctx.stroke();
    ctx.strokeRect(fx, cy - fh * .28, fw * .14, fh * .56); ctx.strokeRect(fx + fw * .86, cy - fh * .28, fw * .14, fh * .56);
    ctx.restore();

    // crowd: tiny figures that shimmer; phone torches flash now and then
    const roar = Math.max(0, 1 - (t - roarT) / 2.5);
    for (const p of crowd) {
      const bob = reduced ? 0 : Math.sin(t * (2 + roar * 6) + p.ph) * (.25 + roar * 1.6) * p.near;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s + bob, p.s, p.s * 1.15);
    }
    if (!reduced && Math.random() < .5 + roar) flashes.push({ i: Math.floor(Math.random() * crowd.length), life: 1 });
    ctx.globalCompositeOperation = 'lighter';
    flashes = flashes.filter(f => (f.life -= .06) > 0);
    for (const f of flashes) {
      const p = crowd[f.i]; const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6 * f.life + 1);
      g.addColorStop(0, `rgba(255,255,255,${f.life})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - 8, p.y - 8, 16, 16);
    }
    ctx.globalCompositeOperation = 'source-over';

    // roof ring or floodlight towers
    if (roof) {
      ctx.strokeStyle = '#1A2420'; ctx.lineWidth = RY * .16;
      ctx.beginPath(); ctx.ellipse(cx, cy - H * .2, RX * .95, RY * .9, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,244,214,.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy - H * .2 + RY * .08, RX * .9, RY * .82, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }
    for (let i = 0; i < towers; i++) {
      const a = Math.PI + (i + .5) * Math.PI / towers * 1, x = cx + Math.cos(a) * RX * .98, y = cy + Math.sin(a) * RY * 1.15 - H * .12;
      ctx.strokeStyle = '#1C2622'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + H * .2); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createRadialGradient(x, y, 2, x, y, W * .22);
      beam.addColorStop(0, 'rgba(255,248,226,.85)'); beam.addColorStop(.08, 'rgba(255,248,226,.25)'); beam.addColorStop(1, 'rgba(255,248,226,0)');
      ctx.fillStyle = beam; ctx.beginPath(); ctx.arc(x, y, W * .22, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFF8E6'; ctx.fillRect(x - 9, y - 4, 18, 7);
    }

    // vignette into the gallery wall
    const v = ctx.createLinearGradient(0, H * .55, 0, H);
    v.addColorStop(0, 'rgba(15,23,20,0)'); v.addColorStop(1, 'rgba(15,23,20,1)');
    ctx.fillStyle = v; ctx.fillRect(0, H * .55, W, H * .45);

    if (alive && !reduced) raf = requestAnimationFrame(draw);
  }
  const ro = new ResizeObserver(() => { build(); if (reduced) draw(0); });
  ro.observe(canvas); build();
  raf = requestAnimationFrame(draw);
  return {
    roar() { roarT = performance.now() / 1000; },
    stop() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); }
  };
}
