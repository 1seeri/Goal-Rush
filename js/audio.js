// =============================================================
//  audio.js — a stadium crowd synthesised live with the Web Audio
//  API. No sound files: filtered noise makes the murmur, envelopes
//  make roars, an oscillator makes the referee's whistle.
// =============================================================
let ctx = null, master = null, bed = null, bedGain = null, noiseBuf = null, swellTimer = 0, clapTimer = 0;
let level = 0;             // 0 = silent, 1 = in the stands
let muted = false;
try { muted = localStorage.getItem('ft-muted') === '1'; } catch {}

function noise(seconds = 4) {
  // pinkish noise (Paul Kellet's filter) sounds more like people than white noise
  const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
      b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
    }
  }
  return buf;
}
function source(loop = true) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = loop; s.playbackRate.value = .9 + Math.random() * .2; return s; }

export function start() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : .9;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = noise();

  // The bed: three voices of band-passed noise, each wobbling slowly so it breathes
  bedGain = ctx.createGain(); bedGain.gain.value = 0; bedGain.connect(master);
  bed = [[420, .9], [900, .6], [1800, .25]].map(([f, g]) => {
    const s = source(), bp = ctx.createBiquadFilter(), v = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = .8;
    v.gain.value = g; lfo.frequency.value = .07 + Math.random() * .12; lg.gain.value = g * .35;
    lfo.connect(lg); lg.connect(v.gain); s.connect(bp); bp.connect(v); v.connect(bedGain); s.start(); lfo.start();
    return { s, bp };
  });
  schedule();
}

// Move between rooms: 0 outside, .35 concourse, 1 in the stands
export function setLevel(x, seconds = 1.6) {
  level = x;
  if (!ctx) return;
  const g = bedGain.gain; g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(x * .28, ctx.currentTime + seconds);
  // muffle the crowd when we're "outside"
  bed.forEach(({ bp }, i) => bp.frequency.setTargetAtTime([420, 900, 1800][i] * (.55 + .45 * x), ctx.currentTime, .5));
}

// Random swells and chants keep the bed alive
function schedule() {
  clearTimeout(swellTimer); clearTimeout(clapTimer);
  const swell = () => { if (level > .2) roar(.25 + Math.random() * .25, 1.2 + Math.random() * 2, 600); swellTimer = setTimeout(swell, 5000 + Math.random() * 9000); };
  const claps = () => { if (level > .6 && Math.random() < .5) clapChant(); clapTimer = setTimeout(claps, 14000 + Math.random() * 16000); };
  swellTimer = setTimeout(swell, 3000); clapTimer = setTimeout(claps, 8000);
}

// A roar: noise with a fast attack and long tail. Bigger = goal.
export function roar(size = 1, seconds = 3.2, freq = 1000) {
  if (!ctx || muted || level === 0) return;
  const t = ctx.currentTime, s = source(false), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  bp.type = 'bandpass'; bp.frequency.setValueAtTime(freq * .8, t); bp.frequency.linearRampToValueAtTime(freq * 1.3, t + .4); bp.Q.value = .6;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(size * .55 * level, t + .25);
  g.gain.setTargetAtTime(0, t + .5, seconds / 3);
  s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t + seconds + 2);
}

// "Clap, clap, clap-clap-clap"
function clapChant() {
  const pattern = [0, .5, 1, 1.25, 1.5], t0 = ctx.currentTime + .1;
  for (let r = 0; r < 3; r++) pattern.forEach(p => clap(t0 + r * 2.1 + p));
}
function clap(t) {
  const s = source(false), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  hp.type = 'bandpass'; hp.frequency.value = 1500; hp.Q.value = 1.2;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18 * level, t + .005); g.gain.exponentialRampToValueAtTime(.001, t + .12);
  s.connect(hp); hp.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + .2);
}

// Referee's whistle: a pea whistle is a fast-warbling tone around 2.8 kHz
export function whistle(blasts = 1) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + .05;
  for (let i = 0; i < blasts; i++) {
    const t = t0 + i * .55, len = i === blasts - 1 ? .7 : .3;
    const o = ctx.createOscillator(), trill = ctx.createOscillator(), tg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 2850; trill.frequency.value = 38; tg.gain.value = 140;
    trill.connect(tg); tg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.11, t + .02); g.gain.setValueAtTime(.11, t + len - .05); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g); g.connect(master); o.start(t); trill.start(t); o.stop(t + len + .05); trill.stop(t + len + .05);
  }
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m; try { localStorage.setItem('ft-muted', m ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : .9, ctx.currentTime, .1);
}
export const ready = () => !!ctx;

// A footstep on a marble gallery floor: a short, low thud with a faint echo
let stepSide = 0;
export function step() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  for (const [delay, vol] of [[0, .22], [.11, .05]]) {
    const s = source(false), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 520 + (stepSide ? 60 : 0);
    g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(vol, t + delay + .006); g.gain.exponentialRampToValueAtTime(.001, t + delay + .14);
    s.connect(lp); lp.connect(g); g.connect(master); s.start(t + delay, Math.random() * 2); s.stop(t + delay + .2);
  }
  stepSide = 1 - stepSide;
}
