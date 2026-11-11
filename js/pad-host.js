// Phone controller, game side. Opens a room on the local game server
// (node server.js), shows a QR code, and turns phone input into PAD state
// that the match code reads every frame.

export const PAD = {
  connected: 0,
  sx: 0, sy: 0,            // left stick, -1..1
  onAim: null,             // (phase, x, y) with x,y in 0..1 of the pitch
  onSkill: null,
  onOk: null,
};
let ws = null, code = null, info = null, lastMode = '';

const qs = s => document.querySelector(s);
export function padSend(msg) { if (ws && ws.readyState === 1 && PAD.connected) ws.send(JSON.stringify(msg)); }
export function padMode(m, text = '') { const k = m + text; if (k === lastMode) return; lastMode = k; padSend({ t: 'mode', m, text }); }
export const padBuzz = p => padSend({ t: 'buzz', p });
export const padFx = (text, kind = '') => padSend({ t: 'fx', text, kind });

function defaultOk() {
  // "A" on the phone presses the main button on screen
  const pick = ['#cont', '#kick', '#again', '#go', '.btn.big.y', '.btn.y', '.choice:not([disabled])'];
  for (const s of pick) { const b = [...document.querySelectorAll(s)].find(x => x.offsetParent && !x.disabled && !x.closest('.pad-ov')); if (b) { b.click(); b.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); return; } }
}

function onMsg(m) {
  if (m.t === 'welcome') { info = m; PAD.connected = m.pads; drawQR(); return; }
  if (m.t === 'join') { PAD.connected = m.pads; chip(); joined(); return; }
  if (m.t === 'leave') { PAD.connected = m.pads; chip(); if (!m.pads) toast('📱 CONTROLLER DISCONNECTED'); return; }
  if (m.t === 'stick') { PAD.sx = Math.max(-1, Math.min(1, +m.x || 0)); PAD.sy = Math.max(-1, Math.min(1, +m.y || 0)); return; }
  if (m.t === 'aim') { PAD.onAim?.(m.phase, Math.max(0, Math.min(1, +m.x)), Math.max(0, Math.min(1, +m.y))); return; }
  if (m.t === 'skill') { PAD.onSkill?.(); return; }
  if (m.t === 'ok') { (PAD.onOk || defaultOk)(); return; }
}

function toast(msg) { const t = qs('#toast'); if (!t) return; t.innerHTML = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }
function chip() { const c = qs('#padchip'); if (!c) return; c.textContent = PAD.connected ? `📱 ${PAD.connected}` : '📱 PHONE'; c.classList.toggle('live', !!PAD.connected); }
function joined() {
  toast('📱 CONTROLLER CONNECTED!');
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f), i * 80));
  const ov = qs('.pad-ov'); if (ov) { ov.querySelector('.pad-status').innerHTML = '<b class="ok">✔ PHONE CONNECTED</b>'; setTimeout(() => ov.remove(), 1100); }
  lastMode = ''; padMode('menu', 'Press A to tap the yellow button');
}
let actx;
function beep(f) { try { actx ||= new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(.05, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .1); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + .1); } catch {} }

function padURL() {
  const local = /^(localhost|127\.)/.test(location.hostname);
  const host = local && info?.ips?.[0] ? `${info.ips[0]}:${info.port}` : location.host;
  return `http://${host}/pad.html?r=${code}`;
}
function drawQR() {
  const ov = qs('.pad-ov'); if (!ov) return;
  const url = padURL(), q = window.qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(), cv = ov.querySelector('canvas'), s = Math.floor(240 / (n + 4));
  cv.width = cv.height = s * (n + 4); const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#14162B';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) c.fillRect((x + 2) * s, (y + 2) * s, s, s);
  cv.hidden = false;
  ov.querySelector('.pad-url').textContent = url.replace(/^http:\/\//, '');
  ov.querySelector('.pad-status').innerHTML = PAD.connected ? '<b class="ok">✔ PHONE CONNECTED</b>' : '<span class="blink">WAITING FOR A PHONE…</span>';
}

function connect() {
  return new Promise(res => {
    if (ws && ws.readyState <= 1) return res(ws.readyState === 1);
    code ||= Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
    if (location.protocol === 'https:' || !/^http/.test(location.protocol)) return res(false);
    try { ws = new WebSocket(`ws://${location.host}/ws?room=${code}&role=host`); } catch { return res(false); }
    const to = setTimeout(() => res(false), 2500);
    ws.onopen = () => { clearTimeout(to); res(true); };
    ws.onerror = () => { clearTimeout(to); res(false); };
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch {} };
    ws.onclose = () => { PAD.connected = 0; chip(); ws = null; };
  });
}

export async function openPad() {
  qs('.pad-ov')?.remove();
  const ov = document.createElement('div'); ov.className = 'pad-ov';
  ov.innerHTML = `<div class="box pad-box" role="dialog" aria-modal="true" aria-label="Phone controller">
    <h2>📱 USE YOUR PHONE AS THE CONTROLLER</h2>
    <div class="qr-wrap"><canvas hidden></canvas></div>
    <p class="pad-url"></p>
    <p class="pad-status"><span class="blink">CONNECTING…</span></p>
    <ol class="pad-how"><li>Phone on the <b>same Wi-Fi</b> as this laptop</li><li>Open the camera and scan the code</li><li>Left thumb runs, right thumb aims and shoots</li></ol>
    <div class="menu row"><button class="btn" data-x>CLOSE</button></div></div>`;
  document.body.append(ov);
  ov.querySelector('[data-x]').onclick = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  const ok = await connect();
  if (!ok) {
    ov.querySelector('.qr-wrap').innerHTML = '<div class="pad-off">⚠</div>';
    ov.querySelector('.pad-status').innerHTML = 'The controller needs the game server running on this laptop.';
    ov.querySelector('.pad-how').innerHTML = '<li>Open a terminal in the game folder</li><li>Run <code>node server.js</code></li><li>Open the link it prints, then tap 📱 PHONE again</li>';
  } else if (info) drawQR();
}

export function initPad() {
  const nav = qs('.top-r'); if (!nav || qs('#padchip')) return;
  const b = document.createElement('button'); b.className = 'chip pad-chip'; b.id = 'padchip'; b.textContent = '📱 PHONE';
  b.onclick = openPad; nav.prepend(b);
}
