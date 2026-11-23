// Ton: generierte Geräusche (assets/klang/*.mp3) über Web Audio, mit Hall und Mischpult.

const NAMEN = ['ident', 'atmo', 'knarzen', 'gloeckchen', 'gong', 'aufsteigen', 'sog', 'tippen'];
const roh = {};
const puffer = {};
let ctx = null;
let master = null;
let hall = null;
let stumm = false;
let atmo = null;

try { stumm = localStorage.getItem('pfote-stumm') === '1'; } catch { /* egal */ }

// Dateien schon vor der ersten Berührung laden (dekodiert wird danach).
for (const n of NAMEN) {
  roh[n] = fetch(`assets/klang/${n}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
}

export function istStumm() { return stumm; }
export function setzeStumm(s) {
  stumm = s;
  try { localStorage.setItem('pfote-stumm', s ? '1' : '0'); } catch { /* egal */ }
  if (master) master.gain.setTargetAtTime(s ? 0 : 1, ctx.currentTime, 0.08);
}

function dekodiere(n) {
  if (!puffer[n]) {
    puffer[n] = roh[n].then((ab) => (ab ? new Promise((ok) => ctx.decodeAudioData(ab.slice(0), ok, () => ok(null))) : null));
  }
  return puffer[n];
}

// Muss in einer Nutzer-Geste aufgerufen werden (iOS).
export function weckeAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = stumm ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    master.connect(comp).connect(ctx.destination);
    hall = baueHall();
    hall.connect(master);
    NAMEN.forEach(dekodiere);
  }
  if (ctx.state === 'suspended') ctx.resume();
  const b = ctx.createBuffer(1, 1, 22050);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start(0);
}

function baueHall() {
  const len = Math.floor(ctx.sampleRate * 4.5);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  conv.connect(g);
  return Object.assign(g, { eingang: conv });
}

// Spielt ein Geräusch. Liefert ein Objekt mit stop(dauer) oder null.
export async function spiele(name, { laut = 1, rate = 1, nass = 0.25, verz = 0, ein = 0, schleife = false, tiefpass = 0 } = {}) {
  if (!ctx) return null;
  const buf = await dekodiere(name);
  if (!buf || !ctx) return null;
  const t = ctx.currentTime + verz;
  const q = ctx.createBufferSource();
  q.buffer = buf;
  q.loop = schleife;
  q.playbackRate.value = rate;
  const g = ctx.createGain();
  if (ein > 0) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(laut, t + ein);
  } else g.gain.value = laut;
  let kette = q;
  if (tiefpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = tiefpass;
    kette = q.connect(lp);
  }
  kette.connect(g);
  g.connect(master);
  if (nass > 0) {
    const s = ctx.createGain();
    s.gain.value = nass;
    g.connect(s).connect(hall.eingang);
  }
  q.start(t);
  return {
    quelle: q,
    gain: g,
    stop(dauer = 0.4) {
      const j = ctx.currentTime;
      g.gain.cancelScheduledValues(j);
      g.gain.setValueAtTime(g.gain.value, j);
      g.gain.linearRampToValueAtTime(0, j + dauer);
      try { q.stop(j + dauer + 0.05); } catch { /* schon aus */ }
    },
  };
}

// Atmosphäre: Wind im Tal, endlos mit Überblendung.
export async function atmoStart(laut = 0.5) {
  if (!ctx || atmo) return;
  const buf = await dekodiere('atmo');
  if (!buf) return;
  atmo = { laut, aktiv: true, teile: [] };
  const ueber = 2.5;
  const naechstes = async () => {
    if (!atmo || !atmo.aktiv) return;
    const teil = await spiele('atmo', { laut: atmo.laut, ein: ueber, nass: 0.1, tiefpass: 5200 });
    if (!teil) return;
    atmo.teile.push(teil);
    if (atmo.teile.length > 2) atmo.teile.shift();
    setTimeout(() => teil.stop(ueber), (buf.duration - ueber) * 1000);
    atmo.timer = setTimeout(naechstes, (buf.duration - ueber) * 1000);
  };
  naechstes();
}
export function atmoLautstaerke(laut, dauer = 1.5) {
  if (!atmo || !ctx) return;
  atmo.laut = laut;
  const j = ctx.currentTime;
  atmo.teile.forEach((t) => { t.gain.gain.cancelScheduledValues(j); t.gain.gain.setValueAtTime(t.gain.gain.value, j); t.gain.gain.linearRampToValueAtTime(laut, j + dauer); });
}

export const ident = () => spiele('ident', { laut: 1, nass: 0.2 });
export const tippen = () => spiele('tippen', { laut: 0.55, nass: 0.4 });
export const gloeckchen = () => spiele('gloeckchen', { laut: 0.9, nass: 0.35 });
export const gong = () => spiele('gong', { laut: 1, nass: 0.45 });
export const aufsteigen = () => spiele('aufsteigen', { laut: 0.6, nass: 0.4, ein: 0.3 });
export const sog = () => spiele('sog', { laut: 0.8, nass: 0.3, ein: 1.2 });
// Knarzen der Pfote; langsamer = tiefer und gedehnter.
export const knarzen = (tempo = 1, laut = 0.5) => spiele('knarzen', { laut, rate: Math.max(0.5, Math.min(1.15, tempo)), nass: 0.3 });
