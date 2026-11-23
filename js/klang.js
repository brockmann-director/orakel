// Alle Geräusche werden mit Web Audio erzeugt, ohne Sounddateien.

let ctx = null;
let master = null;
let hall = null;
let stumm = false;
let drohne = null;

try { stumm = localStorage.getItem('pfote-stumm') === '1'; } catch { /* egal */ }

export function istStumm() { return stumm; }
export function setzeStumm(s) {
  stumm = s;
  try { localStorage.setItem('pfote-stumm', s ? '1' : '0'); } catch { /* egal */ }
  if (master) master.gain.setTargetAtTime(s ? 0 : 0.9, ctx.currentTime, 0.05);
}

// Muss in einer Nutzer-Geste aufgerufen werden (iOS).
export function weckeAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = stumm ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    hall = baueHall();
    hall.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  // stiller Puffer: entsperrt iOS zuverlässig
  const b = ctx.createBuffer(1, 1, 22050);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start(0);
}

function baueHall() {
  const len = ctx.sampleRate * 3.2;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.35;
  conv.connect(g);
  return Object.assign(g, { eingang: conv });
}

function ausgang(trocken = 1, nass = 0.5) {
  const g = ctx.createGain();
  g.gain.value = trocken;
  g.connect(master);
  if (nass > 0) {
    const s = ctx.createGain();
    s.gain.value = nass;
    g.connect(s).connect(hall.eingang);
  }
  return g;
}

let rauschPuffer = null;
function rauschen() {
  if (!rauschPuffer) {
    rauschPuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = rauschPuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = rauschPuffer;
  s.loop = true;
  return s;
}

function bereit() { return ctx && ctx.state === 'running'; }

// Quietschen des Winke-Mechanismus. dehnung > 1 = langsamer, tiefer, länger.
export function quietschen(dehnung = 1, lautstaerke = 1) {
  if (!bereit()) return;
  const t = ctx.currentTime;
  const dauer = 0.09 * dehnung;
  const f0 = (1500 + Math.random() * 250) / Math.sqrt(dehnung);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * 1.35, t + dauer * 0.6);
  o.frequency.linearRampToValueAtTime(f0 * 1.1, t + dauer);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f0 * 1.6;
  bp.Q.value = 7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06 * lautstaerke, t + 0.012);
  g.gain.setValueAtTime(0.05 * lautstaerke, t + dauer * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dauer);
  o.connect(bp).connect(g).connect(ausgang(1, 0.15));
  o.start(t);
  o.stop(t + dauer + 0.02);
}

function glockenSchlag(t, grund, laut, abkling) {
  const ratios = [1, 2.76, 5.4, 8.93];
  ratios.forEach((r, i) => {
    if (grund * r > Math.min(17000, ctx.sampleRate * 0.45)) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = grund * r * (1 + (Math.random() - 0.5) * 0.004);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(laut / (i + 1.2), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + abkling / (1 + i * 0.6));
    o.connect(g).connect(ausgang(1, 0.6));
    o.start(t);
    o.stop(t + abkling + 0.1);
  });
}

export function gloeckchen() {
  if (!bereit()) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) glockenSchlag(t + i * 0.07 + Math.random() * 0.03, 2350 + Math.random() * 120, 0.12 * (1 - i * 0.15), 0.6);
}

export function gong(laut = 1) {
  if (!bereit()) return;
  const t = ctx.currentTime;
  const grund = 82;
  [1, 1.48, 2.0, 2.73, 3.3, 4.2, 5.4].forEach((r, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(grund * r * 1.01, t);
    o.frequency.exponentialRampToValueAtTime(grund * r, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((0.32 * laut) / (1 + i * 0.5), t + 0.02 + i * 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6 - i * 0.5);
    o.connect(g).connect(ausgang(1, 0.9));
    o.start(t);
    o.stop(t + 6.2);
  });
  const n = rauschen();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25 * laut, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  n.connect(lp).connect(g).connect(ausgang(1, 0.6));
  n.start(t);
  n.stop(t + 0.4);
}

export function drohnenStart() {
  if (!bereit() || drohne) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16, t + 2.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  lp.Q.value = 3;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 180;
  lfo.connect(lfoG).connect(lp.frequency);
  const oszis = [55, 55.4, 82.4, 110.3].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i < 2 ? 'sawtooth' : 'sine';
    o.frequency.value = f;
    o.connect(lp);
    o.start(t);
    return o;
  });
  lp.connect(g).connect(ausgang(1, 0.7));
  lfo.start(t);
  drohne = { g, oszis, lfo };
}

export function drohnenStopp(dauer = 2.5) {
  if (!drohne || !ctx) return;
  const t = ctx.currentTime;
  const d = drohne;
  drohne = null;
  d.g.gain.cancelScheduledValues(t);
  d.g.gain.setValueAtTime(d.g.gain.value, t);
  d.g.gain.linearRampToValueAtTime(0, t + dauer);
  d.oszis.forEach((o) => o.stop(t + dauer + 0.1));
  d.lfo.stop(t + dauer + 0.1);
}

export function wusch(dauer = 0.5, laut = 1) {
  if (!bereit()) return;
  const t = ctx.currentTime;
  const n = rauschen();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(4000, t + dauer * 0.7);
  bp.frequency.exponentialRampToValueAtTime(900, t + dauer);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5 * laut, t + dauer * 0.6);
  g.gain.linearRampToValueAtTime(0, t + dauer);
  n.connect(bp).connect(g).connect(ausgang(1, 0.3));
  n.start(t);
  n.stop(t + dauer + 0.05);
}

export function trommel(laut = 1, tief = 1) {
  if (!bereit()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150 * tief, t);
  o.frequency.exponentialRampToValueAtTime(42 * tief, t + 0.35);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9 * laut, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  o.connect(g).connect(ausgang(1, 0.4));
  o.start(t);
  o.stop(t + 0.75);
  const n = rauschen();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.4 * laut, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  n.connect(lp).connect(gn).connect(ausgang(1, 0.3));
  n.start(t);
  n.stop(t + 0.15);
}

export function projektor(dauer = 5) {
  if (!bereit()) return () => {};
  const t = ctx.currentTime;
  const n = rauschen();
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 2200;
  hp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 24;
  const lg = ctx.createGain();
  lg.gain.value = 0.025;
  lfo.connect(lg).connect(g.gain);
  n.connect(hp).connect(g).connect(ausgang(1, 0));
  n.start(t);
  lfo.start(t);
  const stopp = () => {
    const s = ctx.currentTime;
    lg.gain.setTargetAtTime(0, s, 0.1);
    n.stop(s + 0.5);
    lfo.stop(s + 0.5);
  };
  setTimeout(stopp, dauer * 1000);
  return stopp;
}

export function muenzen(anzahl = 30) {
  if (!bereit()) return;
  const t = ctx.currentTime;
  for (let i = 0; i < anzahl; i++) {
    glockenSchlag(t + 0.2 + Math.random() * 2.2, 3200 + Math.random() * 1800, 0.05, 0.25);
  }
}
