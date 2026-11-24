// 3D-Probe: Ruhe (Pfote winkt) → Frage (Tippen/Klick/Leertaste/Schütteln) → Pfote bremst und bleibt unten,
// Kamera fliegt ins Portal, Antwort steigt auf, steht 5,5 s, dann zurück in die Totale.
import * as THREE from 'three';
import { baueSzene3D } from './szene3d.js';
import * as klang from './klang.js';
import { ladeSprueche, waehleAntwort } from './orakel.js';
import { erlaubeBewegung, beimSchuetteln } from './eingabe.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const FILM = params.has('film'); // feste Bildrate für Aufnahmen, Bild für Bild über window.__bild()
const istTouch = matchMedia('(pointer: coarse)').matches;

const leinwand = $('#buehne');
const renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const s3 = await baueSzene3D(renderer);
const groesse = () => s3.groesse(window.innerWidth, window.innerHeight);
window.addEventListener('resize', groesse);
groesse();
await ladeSprueche();
try { await document.fonts.load('700 60px "Cinzel"'); } catch { /* egal */ }

const ANTWORT_DAUER = 5.5;
const AMPLITUDE = 0.62; // rad, so weit kippt die Pfote nach vorn
const TEMPO = 2 * Math.PI * 0.5; // eine Welle in 2 s

const z = {
  modus: 'schlafen', t: 0, phase: 0, omega: TEMPO, flug: 0, auftauchen: 0, wirbel: 0, glimmen: 0.2, dunkel: 0,
  halt: null, danach: null, ereignisse: new Set(), vonFlug: 0, blickX: 0, blickY: 0, zielX: 0, zielY: 0, hell: 0,
};
const einmal = (n) => (z.ereignisse.has(n) ? false : (z.ereignisse.add(n), true));
function geheZu(m) { z.modus = m; z.t = 0; z.ereignisse.clear(); z.vonFlug = z.flug; document.body.dataset.modus = m; }
const hinweis = $('#hinweis');
function zeigeHinweis(t) { hinweis.textContent = t; hinweis.classList.toggle('sichtbar', !!t); }
const ruheHinweis = () => zeigeHinweis(istTouch ? 'Frage denken, dann tippen oder schütteln' : 'Frage denken, dann klicken');

function frage() {
  geheZu('ritual');
  const a = waehleAntwort('');
  s3.schreibe(a.text);
  $('#antwort-text').textContent = '';
  z.antwortText = a.text;
  zeigeHinweis('');
  // Ziel: die nächste untere Umkehr, mindestens eine halbe Welle entfernt
  const k = Math.ceil((z.phase + Math.PI * 0.6) / (2 * Math.PI) - 0.5);
  const ziel = (2 * k + 1) * Math.PI;
  z.halt = { ziel, weg: ziel - z.phase, omega0: Math.max(z.omega, TEMPO * 0.7) };
  klang.sog();
  klang.atmoLautstaerke(0.22, 2);
}
function zurueck(direkt = false) {
  geheZu('wechsel');
  zeigeHinweis('');
  klang.atmoLautstaerke(0.5, 2);
  z.danach = direkt ? frage : ruheHinweis;
}

function erwachen() {
  if (z.modus !== 'schlafen') return;
  klang.weckeAudio();
  erlaubeBewegung().then((ok) => { if (ok) window.addEventListener('deviceorientation', kippen); });
  $('#erwachen').classList.add('weg');
  klang.atmoStart(0.5);
  geheZu('ruhe');
  ruheHinweis();
}
function antippen() {
  klang.weckeAudio();
  if (z.modus === 'ruhe') { klang.tippen(); frage(); } else if (z.modus === 'antwort' && z.t > 0.8) zurueck(true);
}
$('#erwachen').addEventListener('click', erwachen);
leinwand.addEventListener('pointerdown', antippen);
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'Enter') return;
  e.preventDefault();
  if (z.modus === 'schlafen') erwachen(); else antippen();
});
beimSchuetteln(() => { if (z.modus === 'ruhe') frage(); });
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  z.zielX = (e.clientX / window.innerWidth - 0.5) * 0.22;
  z.zielY = (e.clientY / window.innerHeight - 0.5) * -0.08;
});
let basis = null;
function kippen(e) {
  if (e.gamma == null) return;
  if (!basis) basis = { b: e.beta, g: e.gamma };
  z.zielX = THREE.MathUtils.clamp((e.gamma - basis.g) / 25, -1, 1) * 0.2;
  z.zielY = THREE.MathUtils.clamp((e.beta - basis.b) / 25, -1, 1) * -0.07;
}

const klemme = (x) => Math.min(1, Math.max(0, x));
const naeher = (w, ziel, dt, tempo) => w + (ziel - w) * Math.min(1, dt * tempo);
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const ausEase = (x) => 1 - Math.pow(1 - x, 3);

const uhr = new THREE.Clock();
let zeit = 0;
function schritt() {
  const dt = FILM ? 1 / 30 : Math.min(uhr.getDelta(), 0.05);
  zeit += dt; z.t += dt;
  const t = z.t;
  const U = s3.uniforms;

  switch (z.modus) {
    case 'schlafen':
    case 'ruhe':
      z.hell = naeher(z.hell, 1, dt, 1.2);
      z.omega = naeher(z.omega, TEMPO, dt, 1.5);
      z.glimmen = naeher(z.glimmen, 0.25 + 0.12 * Math.sin(zeit * 0.9), dt, 2);
      z.wirbel = naeher(z.wirbel, 0, dt, 1);
      z.dunkel = naeher(z.dunkel, 0, dt, 1.5);
      break;
    case 'ritual': {
      const h = z.halt;
      if (h) {
        const rest = h.ziel - z.phase;
        z.omega = h.omega0 * Math.pow(klemme(rest / h.weg), 0.667);
        if (rest < 0.004) { z.phase = h.ziel; z.omega = 0; z.halt = null; }
      }
      z.flug = z.vonFlug + (1 - z.vonFlug) * inOut(klemme(t / 3.4));
      z.dunkel = inOut(klemme(t / 3.0));
      z.wirbel = t < 3.2 ? Math.min(1, t / 2.2) : Math.max(0.3, 1 - (t - 3.2) / 1.6);
      z.glimmen = naeher(z.glimmen, t < 3.2 ? 1 : 0.7, dt, 2);
      if (t > 2.3 && einmal('gong')) klang.gong();
      if (t > 3.2 && einmal('auf')) klang.aufsteigen();
      if (t > 3.3) z.auftauchen = ausEase(klemme((t - 3.3) / 2.2));
      if (t > 4.0 && einmal('glocke')) klang.gloeckchen();
      if (t > 5.6) {
        geheZu('antwort');
        $('#antwort-text').textContent = z.antwortText;
        zeigeHinweis(istTouch ? 'Tippen für die nächste Frage' : 'Klicken für die nächste Frage');
      }
      break;
    }
    case 'antwort':
      z.wirbel = naeher(z.wirbel, 0.3, dt, 1);
      z.glimmen = 0.7 + 0.08 * Math.sin(zeit * 1.3);
      if (t > ANTWORT_DAUER && !params.has('stehen')) zurueck();
      break;
    case 'wechsel':
      z.auftauchen = Math.max(0, 1 - t / 0.45);
      z.flug = z.vonFlug * (1 - inOut(klemme((t - 0.1) / 1.1)));
      z.dunkel = 1 - inOut(klemme(t / 1.1));
      if (t > 0.3) z.omega = naeher(z.omega, TEMPO, dt, 1.6);
      z.wirbel = naeher(z.wirbel, 0, dt, 2.5);
      if (t > 1.25) { const weiter = z.danach; geheZu('ruhe'); weiter(); }
      break;
    default: break;
  }

  // Pfote: Phase vorwärts, Knarzen an den Umkehrpunkten
  const vorher = z.phase;
  if (window.__fix !== undefined) { z.phase = window.__fix === 1 ? Math.PI : Math.PI * 0.5; z.omega = 0; }
  z.phase += z.omega * dt;
  if (Math.floor(z.phase / Math.PI) !== Math.floor(vorher / Math.PI) && z.modus !== 'schlafen') {
    const r = z.omega / TEMPO;
    klang.knarzen(0.6 + 0.4 * r, 0.25 + 0.25 * (1 - r));
  }
  U.uWinkel.value = AMPLITUDE * (0.5 - 0.5 * Math.cos(z.phase));

  U.uWirbel.value = z.wirbel;
  U.uGlimmen.value = z.glimmen;
  U.uAuftauchen.value = z.auftauchen;
  s3.portalLicht.intensity = 2 + z.glimmen * 6 + z.dunkel * 5 + z.auftauchen * 6;
  s3.portalLicht.color.setRGB(0.6 + z.auftauchen * 0.4, 0.33 + z.auftauchen * 0.3, 1.0 - z.auftauchen * 0.5);
  s3.talMat.uniforms.uDunkel.value = z.dunkel;
  s3.look.uniforms.uHell.value = z.hell;

  if (FILM) z.zielX = Math.sin(zeit * 0.5) * 0.16; // in der Aufnahme schwenkt die Kamera wie beim Kippen
  z.blickX = naeher(z.blickX, z.zielX, dt, 2);
  z.blickY = naeher(z.blickY, z.zielY, dt, 2);
  s3.stelleKamera(z.flug, z.blickX, z.blickY, zeit);
  s3.zeichne(zeit);
  if (!FILM) requestAnimationFrame(schritt);
}
if (FILM) window.__bild = schritt; else requestAnimationFrame(schritt);

// Testhaken: ?test überspringt den Start, ?test&modus=antwort zeigt eine Antwort, &blick=0.2 dreht die Kamera
if (TEST) {
  $('#erwachen').classList.add('weg');
  geheZu('ruhe');
  z.hell = 1;
  z.zielX = z.blickX = Number(params.get('blick') || 0);
  if (params.get('phase')) z.phase = Number(params.get('phase'));
  const m = params.get('modus');
  if (m === 'antwort') {
    frage(); z.t = 5.5; z.flug = z.vonFlug = 1; z.dunkel = 1; z.auftauchen = 1; z.phase = z.halt.ziel; z.halt = null; z.omega = 0;
    ['gong', 'auf', 'glocke'].forEach((e) => z.ereignisse.add(e));
  } else if (m === 'ritual') {
    frage(); z.t = Number(params.get('t') || 2); z.flug = 0;
  }
}
window.__info = () => ({ modus: z.modus, t: +z.t.toFixed(2), phase: +z.phase.toFixed(2), flug: +z.flug.toFixed(2) });
window.__bereit = true;
