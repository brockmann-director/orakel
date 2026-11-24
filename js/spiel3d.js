// Die Pfote der Wahrheit (Fassung 3, echtes 3D).
// Ablauf: Berühren → Gewitter-Intro mit 27km-Logo → weißer Blitz → Katze winkt im Tal.
// Frage (laut stellen, tippen, schütteln) → Pfote bremst und bleibt unten, Kamera fliegt ins Portal,
// Antwort steigt aus dem Nebel, steht 5,5 s, dann zurück in die Totale.
import * as THREE from 'three';
import { baueSzene3D } from './szene3d.js';
import { spieleIntro3D, ladeLogo3D } from './intro3d.js';
import * as klang from './klang.js';
import { ladeSprueche, waehleAntwort } from './orakel.js';
import { erlaubeBewegung, beimSchuetteln, hoeren, kannHoeren } from './eingabe.js';
import { teilen } from './teilen.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const FILM = params.has('film'); // feste Bildrate für Aufnahmen, Bild für Bild über window.__bild()
const istTouch = matchMedia('(pointer: coarse)').matches;
const reduziert = matchMedia('(prefers-reduced-motion: reduce)').matches;

const leinwand = $('#buehne');
const renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
ladeLogo3D();
const s3 = await baueSzene3D(renderer);
const groesse = () => s3.groesse(window.innerWidth, window.innerHeight);
window.addEventListener('resize', groesse);
groesse();
await ladeSprueche();
try { await document.fonts.load('700 60px "Cinzel"'); } catch { /* egal */ }
document.body.classList.add('bereit');
$('#erwachen .beruehren').textContent = 'Berühren, um sie zu erwecken';

let TEMPO_FEST = false; // Test: Pfote steht (?test&phase=3.14&fest)
const ANTWORT_DAUER = 5.5; // so lange steht die Antwort, dann fährt die Kamera zurück
const AMPLITUDE = 0.42; // rad, so weit kippt die Pfote nach vorn
const TEMPO = 2 * Math.PI * 0.5; // eine Welle in 2 s
const MOENCHE_RUHE = 0.3;
const MOENCHE_RITUAL = 0.7;

const z = {
  modus: 'schlafen', // schlafen | ident | ruhe | lauschen | ritual | antwort | wechsel
  t: 0, phase: 0, omega: TEMPO, flug: 0, auftauchen: 0, wirbel: 0, glimmen: 0.2, dunkel: 0, hell: 0,
  halt: null, danach: null, ereignisse: new Set(), vonFlug: 0, blickX: 0, blickY: 0, zielX: 0, zielY: 0,
  antwort: null, frage: '', hoerer: null, chor: null, weiss: 0,
};
const einmal = (n) => (z.ereignisse.has(n) ? false : (z.ereignisse.add(n), true));
function geheZu(m) { z.modus = m; z.t = 0; z.ereignisse.clear(); z.vonFlug = z.flug; document.body.dataset.modus = m; }

const hinweis = $('#hinweis');
const frageAnzeige = $('#frage');
function zeigeHinweis(t) { hinweis.textContent = t; hinweis.classList.toggle('sichtbar', !!t); }
function ruheHinweis() {
  if (kannHoeren) zeigeHinweis(istTouch ? 'Tippen und die Frage laut stellen. Oder schütteln.' : 'Klicken und die Frage laut stellen');
  else zeigeHinweis(istTouch ? 'Frage denken, dann schütteln oder tippen' : 'Frage denken, dann klicken');
}

// ------------------------------------------------------------------ Ablauf
function lauschen() {
  klang.tippen();
  if (!kannHoeren) { ritual(''); return; }
  geheZu('lauschen');
  z.frage = '';
  frageAnzeige.textContent = '';
  zeigeHinweis('Die Pfote lauscht …');
  z.hoerer = hoeren({
    onText: (t) => { z.frage = t; frageAnzeige.textContent = `„${t}“`; },
    onEnde: (t) => { z.hoerer = null; if (z.modus === 'lauschen') ritual(t || z.frage); },
  });
}

function ritual(frage) {
  geheZu('ritual');
  z.frage = frage || '';
  if (!frage) frageAnzeige.textContent = '';
  zeigeHinweis('');
  z.antwort = waehleAntwort(z.frage);
  s3.schreibe(z.antwort.text);
  $('#antwort-text').textContent = '';
  // Ziel: die nächste untere Umkehr, mindestens eine halbe Welle entfernt
  const k = Math.ceil((z.phase + Math.PI * 0.6) / (2 * Math.PI) - 0.5);
  const ziel = (2 * k + 1) * Math.PI;
  z.halt = { ziel, weg: ziel - z.phase, omega0: Math.max(z.omega, TEMPO * 0.7) };
  klang.sog();
  klang.atmoLautstaerke(0.2, 2);
  klang.bettLautstaerke('moench', MOENCHE_RITUAL, 2.5);
}

function naechsteFrage(wie = 'ruhe') {
  geheZu('wechsel');
  frageAnzeige.textContent = '';
  zeigeHinweis('');
  klang.atmoLautstaerke(0.45, 2);
  klang.bettLautstaerke('moench', MOENCHE_RUHE, 2.5);
  z.danach = wie === 'ruhe' ? ruheHinweis : wie === 'schuetteln' ? () => ritual('') : lauschen;
}

function antippen() {
  klang.weckeAudio();
  if (z.modus === 'ruhe') lauschen();
  else if (z.modus === 'lauschen' && z.hoerer) z.hoerer.stop();
  else if (z.modus === 'antwort' && z.t > 0.8) naechsteFrage('lauschen');
}
function geschuettelt() {
  if (z.modus === 'ruhe') { klang.tippen(); ritual(''); }
  else if (z.modus === 'lauschen' && z.hoerer) z.hoerer.stop();
  else if (z.modus === 'antwort' && z.t > 0.8) naechsteFrage('schuetteln');
}
leinwand.addEventListener('pointerdown', antippen);
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'Enter') return;
  e.preventDefault();
  if (z.modus === 'schlafen') erwachen(); else if (z.modus !== 'ident') antippen();
});
beimSchuetteln(geschuettelt);

// Blick: Maus am Rechner, Kippen am Handy
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

// ------------------------------------------------------------------ Knöpfe
const tonKnopf = $('#ton');
function tonSymbol() { tonKnopf.classList.toggle('aus', klang.istStumm()); tonKnopf.title = klang.istStumm() ? 'Ton an' : 'Ton aus'; }
tonKnopf.addEventListener('click', () => { klang.weckeAudio(); klang.setzeStumm(!klang.istStumm()); tonSymbol(); });
tonSymbol();

$('#teilen').addEventListener('click', async () => {
  if (!z.antwort) return;
  s3.zeichne(zeit); // direkt danach abgreifen, solange das Bild noch im Puffer ist
  const bild = document.createElement('canvas');
  bild.width = leinwand.width;
  bild.height = leinwand.height;
  bild.getContext('2d').drawImage(leinwand, 0, 0);
  await teilen(bild, z.antwort.text);
});

// ------------------------------------------------------------------- Start
const blitz = $('#blitz');
async function erwachen() {
  if (z.modus !== 'schlafen') return;
  // alles, was eine Geste braucht, sofort (iOS: Ton und Bewegungssensoren)
  klang.weckeAudio();
  erlaubeBewegung().then((ok) => { if (ok) window.addEventListener('deviceorientation', kippen); });
  $('#erwachen').classList.add('weg');
  let gesehen = false;
  try { gesehen = localStorage.getItem('pfote-intro3d') === '1'; } catch { /* egal */ }
  geheZu('ident');
  if (!params.has('ohneintro')) {
    await spieleIntro3D(renderer, { ueberspringbar: gesehen, klang, film: FILM });
    try { localStorage.setItem('pfote-intro3d', '1'); } catch { /* egal */ }
  }
  // aus dem Weiß des letzten Blitzes ins Tal
  groesse();
  z.weiss = params.has('ohneintro') ? 0 : 1;
  blitz.style.opacity = String(z.weiss);
  z.hell = 1;
  klang.atmoStart(0.45);
  klang.bettStart('moench', MOENCHE_RUHE, { ein: 3, tiefpass: 4200, nass: 0.25 });
  geheZu('ruhe');
  setTimeout(() => { if (z.modus === 'ruhe') ruheHinweis(); }, 1600);
}
$('#erwachen').addEventListener('click', erwachen);

// --------------------------------------------------------------- Animation
const klemme = (x) => Math.min(1, Math.max(0, x));
const naeher = (w, ziel, dt, tempo) => w + (ziel - w) * Math.min(1, dt * tempo);
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const ausEase = (x) => 1 - Math.pow(1 - x, 3);

const uhr = new THREE.Clock();
let zeit = 0;
function schritt() {
  const dt = FILM ? 1 / 30 : Math.min(uhr.getDelta(), 0.05);
  if (z.modus === 'ident') { if (!FILM) requestAnimationFrame(schritt); return; }
  zeit += dt; z.t += dt;
  const t = z.t;
  const U = s3.uniforms;

  switch (z.modus) {
    case 'schlafen':
    case 'ruhe':
      z.hell = naeher(z.hell, 1, dt, 1.2);
      if (!TEMPO_FEST) z.omega = naeher(z.omega, TEMPO, dt, 1.5);
      z.glimmen = naeher(z.glimmen, 0.25 + 0.12 * Math.sin(zeit * 0.9), dt, 2);
      z.wirbel = naeher(z.wirbel, 0, dt, 1);
      z.dunkel = naeher(z.dunkel, 0, dt, 1.5);
      z.flug = naeher(z.flug, 0, dt, 1.5);
      break;
    case 'lauschen':
      // die Katze hört zu: winkt langsamer, das Portal pulsiert, die Kamera rückt ein Stück heran
      z.omega = naeher(z.omega, TEMPO * 0.7, dt, 1);
      z.glimmen = naeher(z.glimmen, 0.6 + 0.25 * Math.sin(zeit * 2.2), dt, 2.5);
      z.wirbel = naeher(z.wirbel, 0.3, dt, 1);
      z.flug = naeher(z.flug, 0.12, dt, 0.8);
      z.dunkel = naeher(z.dunkel, 0.25, dt, 1);
      break;
    case 'ritual': {
      const h = z.halt;
      if (h) {
        const rest = h.ziel - z.phase;
        z.omega = h.omega0 * Math.sqrt(klemme(rest / h.weg)); // gleichmäßig bremsen: steht nach höchstens ~5 s
        if (rest < 0.004) { z.phase = h.ziel; z.omega = 0; z.halt = null; }
      }
      z.flug = z.vonFlug + (1 - z.vonFlug) * inOut(klemme(t / 3.4));
      z.dunkel = Math.max(z.dunkel, inOut(klemme(t / 3.0)));
      z.wirbel = t < 3.2 ? Math.min(1, t / 2.2) : Math.max(0.3, 1 - (t - 3.2) / 1.6);
      z.glimmen = naeher(z.glimmen, t < 3.2 ? 1 : 0.7, dt, 2);
      if (t > 0.6 && einmal('chor')) z.chor = klang.chor(0.32);
      if (t > 2.3 && einmal('gong')) klang.gong();
      if (t > 3.2 && einmal('auf')) klang.aufsteigen();
      if (t > 3.3) z.auftauchen = ausEase(klemme((t - 3.3) / 2.2));
      if (t > 4.0 && einmal('glocke')) klang.gloeckchen();
      if (t > 5.6) {
        geheZu('antwort');
        $('#antwort-text').textContent = z.antwort.text;
        zeigeHinweis(istTouch ? 'Tippen für die nächste Frage' : 'Klicken für die nächste Frage');
      }
      break;
    }
    case 'antwort':
      z.wirbel = naeher(z.wirbel, 0.3, dt, 1);
      z.glimmen = 0.7 + 0.08 * Math.sin(zeit * 1.3);
      if (t > ANTWORT_DAUER && !params.has('stehen')) naechsteFrage('ruhe');
      break;
    case 'wechsel':
      if (einmal('chor-aus')) { Promise.resolve(z.chor).then((c) => c?.stop(1.8)); z.chor = null; }
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

  // weißer Blitz vom Intro klingt ab
  if (z.weiss > 0) { z.weiss = Math.max(0, z.weiss - dt / 1.5); blitz.style.opacity = Math.pow(z.weiss, 2.2).toFixed(3); }

  if (FILM) z.zielX = Math.sin(zeit * 0.5) * 0.16; // in der Aufnahme schwenkt die Kamera wie beim Kippen
  z.blickX = naeher(z.blickX, z.zielX, dt, 2);
  z.blickY = naeher(z.blickY, z.zielY, dt, 2);
  s3.stelleKamera(reduziert ? Math.min(z.flug, 0.6) : z.flug, z.blickX, z.blickY, zeit);
  s3.zeichne(zeit);
  if (!FILM) requestAnimationFrame(schritt);
}
if (FILM) window.__bild = () => (z.modus === 'ident' ? window.__introBild?.() : schritt());
else requestAnimationFrame(schritt);

// Testhaken: ?test überspringt Start und Intro, ?test&modus=antwort zeigt eine Antwort,
// &stehen lässt sie stehen, &blick=0.2 dreht die Kamera, ?ohneintro überspringt nur das Intro.
if (TEST) {
  $('#erwachen').classList.add('weg');
  geheZu('ruhe');
  z.hell = 1;
  z.zielX = z.blickX = Number(params.get('blick') || 0);
  if (params.get('phase')) { z.phase = Number(params.get('phase')); if (params.has('fest')) { z.omega = 0; TEMPO_FEST = true; } }
  const m = params.get('modus');
  if (m === 'antwort') {
    ritual(params.get('frage') || ''); z.t = 5.5; z.flug = z.vonFlug = 1; z.dunkel = 1; z.auftauchen = 1; z.phase = z.halt.ziel; z.halt = null; z.omega = 0;
    ['chor', 'gong', 'auf', 'glocke'].forEach((e) => z.ereignisse.add(e));
  } else if (m === 'ritual') {
    ritual(''); z.t = Number(params.get('t') || 2); z.flug = 0;
  }
}
window.__info = () => ({ modus: z.modus, t: +z.t.toFixed(2), phase: +z.phase.toFixed(2), flug: +z.flug.toFixed(2) });
window.__bereit = true;
