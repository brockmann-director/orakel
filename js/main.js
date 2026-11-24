// Die Pfote der Wahrheit: Ablauf, Bühne, Ton, Eingabe.
import * as THREE from 'three';
import { baueBuehne } from './buehne.js';
import * as klang from './klang.js';
import { ladeSprueche, waehleAntwort } from './orakel.js';
import { erlaubeBewegung, beimSchuetteln, hoeren, kannHoeren } from './eingabe.js';
import { spieleIdent, ladeLogo } from './intro.js';
import { teilen } from './teilen.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const TEST_STEHEN = params.has('stehen'); // Antwort bleibt stehen (für Standbilder)
const istTouch = matchMedia('(pointer: coarse)').matches;
const reduziert = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Zwei Fassungen: hochkant fürs Handy, quer für den Rechner. Jede ist ein nahtloser 6-s-Loop,
// in dem die Pfote zweimal winkt. Portal, Wendepunkte und Wellen misst tools/video.py.
const FASSUNGEN = {
  hoch: {
    video: 'assets/katze.mp4',
    bild: 'assets/katze.jpg',
    portal: { x: 0.485, y: 0.558, rx: 0.1889, ry: 0.1075 },
    wenden: [1.12, 1.67, 2.17, 3.88, 4.38, 4.75],
    wellen: [{ start: 0.95, unten: 1.67, ende: 2.4 }, { start: 3.7, unten: 4.38, ende: 5.0 }],
  },
  quer: {
    video: 'assets/katze-quer.mp4',
    bild: 'assets/katze-quer.jpg',
    portal: { x: 0.498, y: 0.517, rx: 0.05, ry: 0.0894 },
    wenden: [0.45, 1.4, 2.55, 2.95, 3.85, 4.95],
    wellen: [{ start: 0.4, unten: 1.4, ende: 2.6 }, { start: 2.85, unten: 3.85, ende: 5.0 }],
  },
};
const istQuer = () => !!FASSUNGEN.quer && window.innerWidth / window.innerHeight > 1.15;
let VIDEO = istQuer() ? FASSUNGEN.quer : FASSUNGEN.hoch;

// ------------------------------------------------------------------ Bühne
const leinwand = $('#buehne');
const renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const buehne = baueBuehne(renderer);
const u = buehne.uniforms;

function groesse() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const b = renderer.getDrawingBufferSize(new THREE.Vector2());
  buehne.groesse(b.x, b.y);
}
window.addEventListener('resize', groesse);

// Standbild sofort, Video sobald es spielbereit ist.
let standbild = null;
function ladeStandbild(f) {
  standbild = new Promise((ok) => {
    new THREE.TextureLoader().load(f.bild, (t) => {
      if (f === VIDEO && !videoAktiv) { buehne.setzeMedium(t, t.image.width, t.image.height, f.portal); groesse(); }
      ok();
    }, undefined, () => ok());
  });
  return standbild;
}

const video = document.createElement('video');
video.muted = true;
video.loop = true;
video.playsInline = true;
video.setAttribute('playsinline', '');
video.setAttribute('webkit-playsinline', '');
video.preload = 'auto';
video.crossOrigin = 'anonymous';
let videoAktiv = false;
let videoTex = null;
video.addEventListener('loadeddata', async () => {
  await standbild;
  if (!videoTex) videoTex = new THREE.VideoTexture(video);
  buehne.setzeMedium(videoTex, video.videoWidth, video.videoHeight, VIDEO.portal);
  groesse();
  videoAktiv = true;
});
video.addEventListener('error', () => { videoAktiv = false; });

function waehleFassung(f, mitVideo = !params.has('standbild')) {
  VIDEO = f;
  videoAktiv = false;
  ladeStandbild(f);
  if (mitVideo) {
    const t = video.currentTime || 0;
    const lief = !video.paused;
    video.src = f.video;
    if (t) video.addEventListener('loadedmetadata', () => { video.currentTime = t % (video.duration || 6); }, { once: true });
    if (lief) videoStart();
  }
}
waehleFassung(VIDEO);
// Drehen/Fenster ziehen: in Ruhe die passende Fassung nehmen
window.addEventListener('resize', () => {
  const f = istQuer() ? FASSUNGEN.quer : FASSUNGEN.hoch;
  if (f !== VIDEO && (z.modus === 'ruhe' || z.modus === 'schlafen' || z.modus === 'ident')) waehleFassung(f);
});
function videoStart() { if (video.src) video.play().catch(() => {}); }

// --------------------------------------------------------------- Zustand
const z = {
  modus: 'schlafen', // schlafen | ident | ruhe | lauschen | ritual | antwort | wechsel
  t: 0, // Zeit im aktuellen Modus
  rate: 1,
  zoom: 0, // 0 = ganze Katze, 1 = Portal
  hell: 0,
  portal: 0.35,
  glimmen: 0,
  wirbel: 0,
  auftauchen: 0,
  umgebung: 0,
  antwort: null,
  hoerer: null,
  frage: '',
  ereignisse: new Set(),
  vonZoom: 0,
  vonRate: 1,
};

const hinweis = $('#hinweis');
const frageAnzeige = $('#frage');
function zeigeHinweis(text) { hinweis.textContent = text; hinweis.classList.toggle('sichtbar', !!text); }
function ruheHinweis() {
  if (kannHoeren) zeigeHinweis(istTouch ? 'Tippen und die Frage laut stellen. Oder schütteln.' : 'Klicken und die Frage laut stellen');
  else zeigeHinweis(istTouch ? 'Frage denken, dann schütteln oder tippen' : 'Frage denken, dann klicken');
}
function geheZu(modus) {
  z.modus = modus;
  z.t = 0;
  z.ereignisse.clear();
  z.vonZoom = z.zoom;
  z.vonRate = z.rate;
  document.body.dataset.modus = modus;
}
const einmal = (name) => (z.ereignisse.has(name) ? false : (z.ereignisse.add(name), true));

function lauschen() {
  klang.tippen();
  if (!kannHoeren) { ritual(''); return; }
  geheZu('lauschen');
  z.frage = '';
  frageAnzeige.textContent = '';
  zeigeHinweis('Die Pfote lauscht …');
  z.hoerer = hoeren({
    onText: (t) => { z.frage = t; frageAnzeige.textContent = `„${t}“`; },
    onEnde: (t) => {
      z.hoerer = null;
      if (z.modus === 'lauschen') ritual(t || z.frage);
    },
  });
}

function ritual(frage) {
  geheZu('ritual');
  z.frage = frage || '';
  if (!frage) frageAnzeige.textContent = '';
  zeigeHinweis('');
  z.antwort = waehleAntwort(z.frage);
  buehne.schreibe(z.antwort.text);
  $('#antwort-text').textContent = '';
  z.auftauchen = 0;
  planeHalt();
  klang.sog();
  klang.atmoLautstaerke(0.22, 2);
}

// Die Pfote soll mitten im Winken langsamer werden und unten stehen bleiben.
// Läuft gerade keine Welle, springen wir unsichtbar (Ruhepose = Ruhepose) an den Anfang der nächsten.
function planeHalt() {
  z.halt = null;
  if (!videoAktiv) return;
  const vt = video.currentTime;
  let welle = VIDEO.wellen.find((w) => vt >= w.start && vt < w.unten - 0.2);
  let von = vt;
  if (!welle) {
    welle = VIDEO.wellen.find((w) => vt < w.start) || VIDEO.wellen[0];
    const imRuhe = !VIDEO.wellen.some((w) => vt >= w.start && vt < w.ende);
    if (imRuhe) { video.currentTime = welle.start; von = welle.start; } else {
      // mitten im Rückschwung: ausschwingen lassen, dann an den Anfang der nächsten Welle
      von = null;
    }
  }
  const jetzt = VIDEO.wellen.find((w) => vt >= w.start && vt < w.ende);
  const strecke = von === null ? welle.unten - welle.start : welle.unten - von;
  z.halt = { welle, jetzt, dauer: Math.max(1.2, Math.min(2.6, 3 * strecke / Math.max(0.3, z.rate))), warten: von === null };
}

// Wie lange die Antwort im Portal steht, bevor die Kamera von allein zurück in die Totale fährt.
const ANTWORT_DAUER = 5.5;

function naechsteFrage(direkt = false) {
  geheZu('wechsel');
  frageAnzeige.textContent = '';
  zeigeHinweis('');
  klang.atmoLautstaerke(0.5, 2);
  z.danach = direkt === 'ruhe' ? ruheHinweis : direkt ? () => ritual('') : lauschen;
}

function antippen() {
  klang.weckeAudio();
  if (z.modus === 'ruhe') lauschen();
  else if (z.modus === 'lauschen' && z.hoerer) z.hoerer.stop();
  else if (z.modus === 'antwort' && z.t > 0.8) naechsteFrage();
}
function geschuettelt() {
  if (z.modus === 'ruhe') ritual('');
  else if (z.modus === 'lauschen' && z.hoerer) z.hoerer.stop();
  else if (z.modus === 'antwort' && z.t > 0.8) naechsteFrage(true);
}
leinwand.addEventListener('pointerdown', antippen);
window.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && z.modus !== 'schlafen') { e.preventDefault(); antippen(); } });
beimSchuetteln(geschuettelt);

// ---------------------------------------------------------------- Knöpfe
const tonKnopf = $('#ton');
function tonSymbol() { tonKnopf.classList.toggle('aus', klang.istStumm()); tonKnopf.title = klang.istStumm() ? 'Ton an' : 'Ton aus'; }
tonKnopf.addEventListener('click', () => { klang.weckeAudio(); klang.setzeStumm(!klang.istStumm()); tonSymbol(); });
tonSymbol();

$('#teilen').addEventListener('click', async () => {
  if (!z.antwort) return;
  buehne.zeichne();
  const bild = document.createElement('canvas');
  bild.width = leinwand.width;
  bild.height = leinwand.height;
  bild.getContext('2d').drawImage(leinwand, 0, 0);
  await teilen(bild, z.antwort.text);
});

// ----------------------------------------------------------------- Start
ladeSprueche();
ladeLogo();
groesse();

async function erwachen() {
  if (z.modus !== 'schlafen') return;
  klang.weckeAudio();
  erlaubeBewegung();
  videoStart();
  $('#erwachen').classList.add('weg');
  let gesehen = false;
  try { gesehen = localStorage.getItem('pfote-intro') === '1'; } catch { /* egal */ }
  geheZu('ident');
  await spieleIdent(renderer, { ueberspringbar: gesehen, onTon: () => klang.ident() });
  try { localStorage.setItem('pfote-intro', '1'); } catch { /* egal */ }
  klang.atmoStart(0.5);
  geheZu('ruhe');
  setTimeout(() => { if (z.modus === 'ruhe') ruheHinweis(); }, 1800);
}
$('#erwachen').addEventListener('click', erwachen);
window.addEventListener('keydown', (e) => { if (z.modus === 'schlafen' && (e.code === 'Space' || e.code === 'Enter')) erwachen(); });

// ------------------------------------------------------------ Animation
const ease = {
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  out: (x) => 1 - Math.pow(1 - x, 3),
};
const klemme = (x) => Math.min(1, Math.max(0, x));
const naeher = (wert, ziel, dt, tempo) => wert + (ziel - wert) * Math.min(1, dt * tempo);

let letzteVideoZeit = 0;
const uhr = new THREE.Clock();
let zeit = 0;

function schritt() {
  const dt = Math.min(uhr.getDelta(), 0.05);
  zeit += dt;
  z.t += dt;
  const t = z.t;

  if (z.modus === 'ident' || z.modus === 'schlafen') { requestAnimationFrame(schritt); return; }

  switch (z.modus) {
    case 'ruhe':
      z.hell = naeher(z.hell, 1, dt, 1.4);
      z.portal = naeher(z.portal, 0.35, dt, 1.5);
      z.glimmen = naeher(z.glimmen, 0.15 + 0.1 * Math.sin(zeit * 0.9), dt, 2);
      z.rate = naeher(z.rate, 1, dt, 1.5);
      break;
    case 'lauschen':
      z.hell = 1;
      z.portal = naeher(z.portal, 0.75, dt, 1.2);
      z.glimmen = naeher(z.glimmen, 0.55 + 0.2 * Math.sin(zeit * 2.2), dt, 2.5);
      z.wirbel = naeher(z.wirbel, 0.25, dt, 1);
      z.rate = naeher(z.rate, 0.75, dt, 0.8);
      break;
    case 'ritual': {
      // Die Pfote wird langsamer und bleibt stehen, die Kamera fährt ins Portal.
      if (z.halt) {
        const h = z.halt;
        if (h.warten) {
          // erst die laufende Welle zu Ende, dann ab dem nächsten Wellenanfang bremsen
          const vt = video.currentTime;
          if (!h.jetzt || vt >= h.jetzt.ende || vt < h.jetzt.start) {
            video.currentTime = h.welle.start;
            h.warten = false;
          }
        } else {
          // Geschwindigkeit aus dem Restweg: bremst wie ease-out und korrigiert sich selbst
          if (h.rate0 === undefined) { h.rate0 = Math.max(0.35, z.rate); h.weg = Math.max(0.2, h.welle.unten - h.welle.start); }
          const rest = h.welle.unten - video.currentTime;
          z.rate = h.rate0 * Math.pow(klemme(rest / h.weg), 0.667);
          if (rest < 0.015 && einmal('halt')) video.pause();
        }
      } else {
        z.rate = z.vonRate + (0.08 - z.vonRate) * ease.out(klemme(t / 2.8));
        if (t > 2.8 && einmal('halt')) video.pause();
      }
      z.zoom = z.vonZoom + (1 - z.vonZoom) * ease.inOut(klemme(t / 3.4));
      z.umgebung = ease.inOut(klemme(t / 3.0));
      z.portal = naeher(z.portal, 1, dt, 1.6);
      z.glimmen = naeher(z.glimmen, t < 3.2 ? 0.9 : 0.6, dt, 2);
      z.wirbel = t < 3.2 ? Math.min(1, t / 2.2) : Math.max(0.3, 1 - (t - 3.2) / 1.6);
      if (t > 2.3 && einmal('gong')) klang.gong();
      if (t > 3.2 && einmal('auf')) klang.aufsteigen();
      if (t > 3.3) z.auftauchen = ease.out(klemme((t - 3.3) / 2.2));
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
      z.glimmen = 0.55 + 0.08 * Math.sin(zeit * 1.3);
      if (t > ANTWORT_DAUER && !TEST_STEHEN) naechsteFrage('ruhe');
      break;
    case 'wechsel': {
      // Antwort sinkt, Kamera fährt zurück, die Pfote nimmt Fahrt auf.
      z.auftauchen = Math.max(0, 1 - t / 0.45);
      z.zoom = z.vonZoom * (1 - ease.inOut(klemme((t - 0.1) / 1.0)));
      z.umgebung = 1 - ease.inOut(klemme(t / 1.1));
      if (t > 0.3 && einmal('los')) { videoStart(); z.rate = 0.2; }
      if (t > 0.3) z.rate = naeher(z.rate, 1, dt, 1.8);
      z.portal = naeher(z.portal, 0.5, dt, 2.5);
      z.wirbel = naeher(z.wirbel, 0, dt, 2.5);
      if (t > 1.2) { const weiter = z.danach; geheZu('ruhe'); weiter(); }
      break;
    }
    default:
      break;
  }

  // Video: Tempo setzen, Wendepunkte der Pfote knarzen lassen
  if (videoAktiv && !video.paused) {
    const r = Math.max(0.0625, z.rate);
    if (Math.abs(video.playbackRate - r) > 0.01) video.playbackRate = r;
    const vt = video.currentTime;
    for (const w of VIDEO.wenden) {
      const durch = letzteVideoZeit <= vt ? (w > letzteVideoZeit && w <= vt) : (w > letzteVideoZeit || w <= vt);
      if (durch) klang.knarzen(0.6 + 0.4 * r, 0.25 + 0.25 * (1 - r));
    }
    letzteVideoZeit = vt;
  }

  const zoom = reduziert ? 0 : z.zoom;
  u.uZeit.value = zeit;
  u.uZoom.value = 1 + (buehne.portalZoom() - 1) * zoom;
  u.uSchwenk.value = zoom;
  u.uHell.value = z.hell;
  u.uPortal.value = z.portal;
  u.uGlimmen.value = z.glimmen;
  u.uWirbel.value = z.wirbel;
  u.uAuftauchen.value = z.auftauchen;
  u.uUmgebung.value = z.umgebung;
  buehne.zeichne();
  requestAnimationFrame(schritt);
}
requestAnimationFrame(schritt);

// Testmodus: ?test überspringt Start und Ident, ?test&modus=antwort zeigt eine Antwort.
if (TEST) {
  (async () => {
    await standbild;
    await ladeSprueche();
    try { await document.fonts.load('700 60px "Cinzel"'); } catch { /* egal */ }
    if (video.src) await new Promise((ok) => { if (videoAktiv) ok(); video.addEventListener('loadeddata', () => setTimeout(ok, 50), { once: true }); video.addEventListener('error', ok, { once: true }); setTimeout(ok, 4000); });
    videoStart();
    $('#erwachen').classList.add('weg');
    z.hell = 1;
    geheZu('ruhe');
    ruheHinweis();
    const m = params.get('modus');
    if (m === 'antwort') {
      ritual(params.get('frage') || 'Wann kommt das Budget?');
      z.t = 5.5;
      z.vonZoom = 1; z.zoom = 1; z.umgebung = 1; z.portal = 1; z.glimmen = 0.6;
      ['halt', 'gong', 'auf', 'glocke'].forEach((e) => z.ereignisse.add(e));
      video.pause();
    } else if (m === 'ritual') {
      ritual('Wann kommt das Budget?');
      z.t = Number(params.get('t') || 2);
    }
    window.__info = () => ({ modus: z.modus, t: +z.t.toFixed(2), video: videoAktiv, vt: +video.currentTime.toFixed(2), rate: +video.playbackRate.toFixed(3), pausiert: video.paused });
    window.__bereit = true;
  })();
}
