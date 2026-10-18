// Ambient tanpura drone, sea and temple bells, synthesised with Web Audio.
// Nothing plays until the visitor turns sound on (browsers block autoplay).

const A = { ctx: null, master: null, wet: null, wave: null, on: false, timer: null, next: 0, step: 0, mel: 0, sea: null };
const SA = 146.83;
const CYCLE = [SA * 0.75, SA, SA, SA / 2];
const GAP = 1.05;
const RAGA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // raga Bhupali

function init() {
  if (A.ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  const c = (A.ctx = new AC());
  A.master = c.createGain();
  A.master.gain.value = 0;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  A.master.connect(comp);
  comp.connect(c.destination);
  const len = c.sampleRate * 3.2;
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  A.wet = c.createGain();
  A.wet.gain.value = 0.45;
  A.wet.connect(conv);
  conv.connect(A.master);
  const n = 40;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (1 / k) * (k >= 6 && k <= 14 ? 2.2 : 1) * (k % 7 === 0 ? 0.4 : 1);
  A.wave = c.createPeriodicWave(re, im);
  return true;
}

function out(node, dry, wet) {
  const g = A.ctx.createGain();
  g.gain.value = dry;
  node.connect(g);
  g.connect(A.master);
  const w = A.ctx.createGain();
  w.gain.value = wet;
  node.connect(w);
  w.connect(A.wet);
}

function pluck(f, t0, vol) {
  const c = A.ctx;
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(5200, t0);
  lp.frequency.exponentialRampToValueAtTime(700, t0 + 3.5);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 6);
  [0, 1.6].forEach((cents) => {
    const o = c.createOscillator();
    o.setPeriodicWave(A.wave);
    o.frequency.value = f * Math.pow(2, cents / 1200);
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + 6.1);
  });
  lp.connect(g);
  out(g, 0.6, 0.6);
}

function santoor(f, t0, vol) {
  const c = A.ctx;
  [[1, 'triangle', 1, 1.8], [2, 'sine', 0.35, 1], [3.01, 'sine', 0.12, 0.6]].forEach((h) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = h[1];
    o.frequency.value = f * h[0];
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol * h[2], t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + h[3]);
    o.connect(g);
    out(g, 0.45, 0.95);
    o.start(t0);
    o.stop(t0 + h[3] + 0.05);
  });
}

function phrase(t0) {
  let idx = 2 + Math.floor(Math.random() * 5);
  const n = 3 + Math.floor(Math.random() * 4);
  let tt = t0;
  for (let i = 0; i < n; i++) {
    santoor(SA * 2 * Math.pow(2, RAGA[idx] / 12), tt, 0.07 + Math.random() * 0.03);
    idx = Math.max(0, Math.min(RAGA.length - 1, idx + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.7 ? 1 : 2)));
    tt += 0.26 + Math.random() * 0.3;
  }
  santoor(SA * 2 * Math.pow(2, RAGA[idx] / 12), tt + 0.15, 0.06);
}

function scheduler() {
  if (!A.on) return;
  const c = A.ctx;
  while (A.next < c.currentTime + 1.2) {
    pluck(CYCLE[A.step % 4], A.next, A.step % 4 === 3 ? 0.11 : 0.075);
    A.next += A.step % 4 === 3 ? GAP * 1.6 : GAP;
    A.step++;
  }
  if (A.mel < c.currentTime + 1.2) {
    phrase(A.mel);
    A.mel += 9 + Math.random() * 8;
  }
  A.timer = setTimeout(scheduler, 250);
}

function seaStart() {
  const c = A.ctx;
  const len = c.sampleRate * 4;
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.2;
  }
  const s = c.createBufferSource();
  s.buffer = b;
  s.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = c.createGain();
  g.gain.value = 0.05;
  const lfo = c.createOscillator();
  const lg = c.createGain();
  lfo.frequency.value = 0.09;
  lg.gain.value = 0.04;
  lfo.connect(lg);
  lg.connect(g.gain);
  s.connect(lp);
  lp.connect(g);
  out(g, 1, 0.2);
  s.start();
  lfo.start();
  A.sea = [s, lfo];
}

export function bell(f = 880, vol = 0.22) {
  if (!A.on || !A.ctx) return;
  const c = A.ctx;
  const t0 = c.currentTime + 0.01;
  [[1, 1, 4], [2.0, 0.5, 3], [2.76, 0.45, 2.6], [5.4, 0.25, 1.6], [8.93, 0.12, 0.9]].forEach((p) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = f * p[0];
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol * p[1], t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + p[2]);
    o.connect(g);
    out(g, 0.7, 0.8);
    o.start(t0);
    o.stop(t0 + p[2] + 0.05);
  });
}

export function swish() {
  if (!A.on || !A.ctx) return;
  const c = A.ctx;
  const t0 = c.currentTime;
  const len = c.sampleRate * 0.35;
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
  const s = c.createBufferSource();
  s.buffer = b;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(900, t0);
  bp.frequency.exponentialRampToValueAtTime(3200, t0 + 0.3);
  const g = c.createGain();
  g.gain.value = 0.16;
  s.connect(bp);
  bp.connect(g);
  out(g, 1, 0.15);
  s.start(t0);
}

export const tick = () => bell(1760, 0.06);
export const isSoundOn = () => A.on;

// Returns false when the browser has no Web Audio.
export function setSound(on) {
  if (on && !init()) return false;
  A.on = on;
  try { localStorage.setItem('tg-sound', on ? '1' : '0'); } catch { /* private mode */ }
  if (on) {
    A.ctx.resume();
    const t0 = A.ctx.currentTime;
    A.master.gain.cancelScheduledValues(t0);
    A.master.gain.setValueAtTime(A.master.gain.value, t0);
    A.master.gain.linearRampToValueAtTime(0.8, t0 + 1.5);
    A.next = t0 + 0.1;
    A.step = 0;
    A.mel = t0 + 5;
    clearTimeout(A.timer);
    scheduler();
    if (!A.sea) seaStart();
    setTimeout(() => bell(659.25, 0.2), 150);
  } else if (A.ctx) {
    const t1 = A.ctx.currentTime;
    A.master.gain.cancelScheduledValues(t1);
    A.master.gain.setValueAtTime(A.master.gain.value, t1);
    A.master.gain.linearRampToValueAtTime(0, t1 + 0.6);
    clearTimeout(A.timer);
  }
  return true;
}

// Fade out when the visitor leaves the homepage.
export function stopSound() {
  if (!A.ctx || !A.on) return;
  A.on = false;
  const t1 = A.ctx.currentTime;
  A.master.gain.cancelScheduledValues(t1);
  A.master.gain.setValueAtTime(A.master.gain.value, t1);
  A.master.gain.linearRampToValueAtTime(0, t1 + 0.4);
  clearTimeout(A.timer);
}
