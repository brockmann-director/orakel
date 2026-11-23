// Die Pfote der Wahrheit – Bühne, Katze, Ablauf.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { baueBauch } from './bauch.js';
import { baueSchrein, baueMuenzregen } from './szene.js';
import * as klang from './klang.js';
import { ladeSprueche, waehleAntwort } from './orakel.js';
import { erlaubeBewegung, beimSchuetteln, hoeren, kannHoeren } from './eingabe.js';
import { spieleIntro } from './intro.js';
import { teilen } from './teilen.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.has('test'); // für automatische Screenshots
const istTouch = matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ Renderer
const leinwand = $('#buehne');
const renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070203);
scene.fog = new THREE.Fog(0x070203, 8, 20);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.18;

const kamera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, kamera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.96);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------- Licht
const spot = new THREE.SpotLight(0xffd9b0, 34, 16, 0.5, 0.75, 2);
spot.position.set(2.6, 5.6, 4.2);
spot.target.position.set(0, 1, 0);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.bias = -0.0004;
spot.shadow.radius = 5;
scene.add(spot, spot.target);
const rand1 = new THREE.DirectionalLight(0xff7a30, 2.6);
rand1.position.set(-3.5, 3, -4);
const rand2 = new THREE.DirectionalLight(0x7b6aff, 0.7);
rand2.position.set(3.5, 2.2, -3);
scene.add(rand1, rand2, new THREE.HemisphereLight(0x4a2a3a, 0x0a0505, 0.35));
const bauchLicht = new THREE.PointLight(0xffb040, 0, 2.2, 2);
bauchLicht.position.set(0, 0.62, 0.95);
scene.add(bauchLicht);

const schrein = baueSchrein(scene);

// ------------------------------------------------------------------- Katze
const bauch = baueBauch();
const katze = new THREE.Group();
katze.visible = false;
scene.add(katze);
let arm = null;
const augenMat = new THREE.MeshPhysicalMaterial({ color: 0x050302, roughness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 0.3, emissive: 0xffa630, emissiveIntensity: 0 });
const goldMat = new THREE.MeshPhysicalMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.22 });
let muenzregen = null;

const materialien = {
  Keramik: () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.06 }),
  Rot: () => new THREE.MeshPhysicalMaterial({ color: 0x8a0a06, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
  Gold: () => goldMat,
  Schwarz: () => new THREE.MeshPhysicalMaterial({ color: 0x0a0706, roughness: 0.3 }),
  Rosa: () => new THREE.MeshPhysicalMaterial({ color: 0xf07a86, roughness: 0.4, clearcoat: 0.6 }),
  Auge: () => augenMat,
};

const katzeGeladen = new GLTFLoader().loadAsync('models/katze.glb').then((gltf) => {
  const cache = {};
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.name === 'Bauch') { o.material = bauch.material; o.castShadow = false; return; }
    const name = (o.material.name || '').replace(/\.\d+$/, '');
    if (materialien[name]) {
      if (name === 'Keramik' && !o.geometry.attributes.color) {
        cache.KeramikWeiss ??= new THREE.MeshPhysicalMaterial({ color: 0xf6f2e8, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.06 });
        o.material = cache.KeramikWeiss;
      } else {
        cache[name] ??= materialien[name]();
        o.material = cache[name];
      }
    }
  });
  arm = gltf.scene.getObjectByName('Arm');
  katze.add(gltf.scene);
  const koban = gltf.scene.getObjectByName('Koban');
  muenzregen = baueMuenzregen(scene, koban ? koban.geometry : null, goldMat);
});

// ----------------------------------------------------------------- Kamera
const BAUCH = new THREE.Vector3(0, 0.6, 0.39);
const kam = { pos: new THREE.Vector3(0, 1.4, 9), ziel: new THREE.Vector3(0, 1.05, 0), nah: 0, wackeln: 0 };
let zeiger = { x: 0, y: 0 };

function kameraPosition(nah) {
  const a = kamera.aspect;
  const tanH = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2)) * 2;
  const dFern = Math.max(3.0 / tanH, 2.15 / (tanH * a));
  const dNah = a < 1 ? 1.05 / (tanH * a) : 1.45 / tanH;
  const fern = new THREE.Vector3(0, 1.35, dFern);
  const fernZiel = new THREE.Vector3(0, a < 0.8 ? 1.0 : 1.02, 0);
  const nahPos = new THREE.Vector3(0, BAUCH.y + 0.12, BAUCH.z + dNah);
  const e = nah * nah * (3 - 2 * nah);
  return {
    pos: fern.lerp(nahPos, e),
    ziel: fernZiel.lerp(BAUCH, e),
  };
}

function groesse() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  kamera.aspect = w / h;
  kamera.updateProjectionMatrix();
}
window.addEventListener('resize', groesse);
groesse();

window.addEventListener('pointermove', (e) => {
  zeiger = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
});

// -------------------------------------------------------------- Zustand
const z = {
  modus: 'schlafen', // schlafen | intro | ruhe | lauschen | ritual | antwort
  phase: 0,
  tempo: 0.55, // Winken in Hz
  zielTempo: 0.55,
  ritualZeit: 0,
  auftauchen: 0,
  zielAuftauchen: 0,
  wirbel: 0,
  glimmen: 0.2,
  augen: 0,
  nah: 0,
  zielNah: 0,
  landen: -1,
  antwort: null,
  hoerer: null,
  frage: '',
};

const hinweis = $('#hinweis');
const frageAnzeige = $('#frage');
function zeigeHinweis(text) { hinweis.textContent = text; hinweis.classList.toggle('sichtbar', !!text); }
function ruheHinweis() {
  if (kannHoeren) zeigeHinweis(istTouch ? 'Tippen und Frage laut stellen. Oder einfach schütteln.' : 'Klicken und Frage laut stellen.');
  else zeigeHinweis(istTouch ? 'Frage denken, dann schütteln oder tippen.' : 'Frage denken, dann klicken.');
}

function geheZu(modus) {
  z.modus = modus;
  document.body.dataset.modus = modus;
}

function lauschen() {
  if (!kannHoeren) { ritual(''); return; }
  geheZu('lauschen');
  z.frage = '';
  frageAnzeige.textContent = '';
  zeigeHinweis('Die Pfote lauscht …');
  z.zielTempo = 0.35;
  z.hoerer = hoeren({
    onText: (t) => { z.frage = t; frageAnzeige.textContent = `„${t}“`; },
    onEnde: (t) => {
      z.hoerer = null;
      if (z.modus !== 'lauschen') return;
      ritual(t || z.frage);
    },
  });
}

function ritual(frage) {
  geheZu('ritual');
  z.frage = frage || '';
  if (!frage) frageAnzeige.textContent = '';
  zeigeHinweis('');
  z.antwort = waehleAntwort(z.frage);
  bauch.schreibe(z.antwort.text);
  $('#antwort-text').textContent = z.antwort.text;
  z.ritualZeit = 0;
  z.zielAuftauchen = 0;
  z.auftauchen = 0;
  z.ritualTempo0 = z.tempo;
  z.gongDa = false;
  z.muenzenDa = false;
  klang.gloeckchen();
  klang.drohnenStart();
}

function antwortFertig() {
  geheZu('antwort');
  klang.drohnenStopp(3);
  z.zielTempo = 0.55;
  zeigeHinweis(istTouch ? 'Tippen für die nächste Frage' : 'Klicken für die nächste Frage');
}

function naechsteFrage(direktRitual = false) {
  z.zielAuftauchen = 0;
  z.zielNah = 0;
  frageAnzeige.textContent = '';
  if (direktRitual) setTimeout(() => ritual(''), 650);
  else setTimeout(lauschen, 350);
  geheZu('wechsel');
}

function antippen() {
  klang.weckeAudio();
  if (z.modus === 'ruhe') lauschen();
  else if (z.modus === 'lauschen' && z.hoerer) z.hoerer.stop();
  else if (z.modus === 'antwort') naechsteFrage();
}

function geschuettelt() {
  if (z.modus === 'ruhe') ritual('');
  else if (z.modus === 'lauschen' && z.hoerer) z.hoerer.stop();
  else if (z.modus === 'antwort') naechsteFrage(true);
}

leinwand.addEventListener('pointerdown', antippen);
window.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); antippen(); } });
beimSchuetteln(geschuettelt);

// ---------------------------------------------------------------- Knöpfe
const tonKnopf = $('#ton');
function tonSymbol() { tonKnopf.classList.toggle('aus', klang.istStumm()); tonKnopf.title = klang.istStumm() ? 'Ton an' : 'Ton aus'; }
tonKnopf.addEventListener('click', () => { klang.weckeAudio(); klang.setzeStumm(!klang.istStumm()); tonSymbol(); });
tonSymbol();

$('#teilen').addEventListener('click', async () => {
  if (!z.antwort) return;
  composer.render();
  const bild = document.createElement('canvas');
  bild.width = leinwand.width;
  bild.height = leinwand.height;
  bild.getContext('2d').drawImage(leinwand, 0, 0);
  await teilen(bild, z.antwort.text);
});

// ---------------------------------------------------------------- Start
async function erwachen() {
  klang.weckeAudio();
  erlaubeBewegung();
  $('#erwachen').classList.add('weg');
  await katzeGeladen;
  let gesehen = false;
  try { gesehen = localStorage.getItem('pfote-intro') === '1'; } catch { /* egal */ }
  geheZu('intro');
  const intro = $('#intro');
  intro.style.display = 'block';
  await spieleIntro(intro, {
    ueberspringbar: gesehen,
    onLanden: () => { katze.visible = true; z.landen = 0; },
  });
  try { localStorage.setItem('pfote-intro', '1'); } catch { /* egal */ }
  geheZu('ruhe');
  ruheHinweis();
}

$('#erwachen-knopf').addEventListener('click', erwachen);
ladeSprueche();

// ---------------------------------------------------------- Animation
const uhr = new THREE.Clock();
let zeit = 0;

function schritt() {
  const dt = Math.min(uhr.getDelta(), 0.05);
  zeit += dt;

  // Landung aus dem Intro
  if (z.landen >= 0) {
    z.landen += dt;
    const t = z.landen;
    if (t < 0.42) {
      const k = t / 0.42;
      katze.position.y = 6 * (1 - k * k);
      katze.scale.set(0.92, 1.1, 0.92);
    } else if (t < 1.0) {
      if (!z.gelandet) { z.gelandet = true; kam.wackeln = 0.12; klang.trommel(1.2, 0.7); klang.gloeckchen(); }
      const k = (t - 0.42) / 0.58;
      katze.position.y = 0;
      const squash = Math.exp(-k * 5) * Math.cos(k * 14) * 0.18;
      katze.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    } else {
      katze.position.y = 0;
      katze.scale.set(1, 1, 1);
      z.landen = -1;
    }
  }

  // Ritual-Ablauf
  if (z.modus === 'ritual') {
    z.ritualZeit += dt;
    const t = z.ritualZeit;
    z.zielNah = 1;
    z.wirbel = Math.min(1, t / 1.5);
    z.augen = Math.min(1, t / 2.5);
    if (t < 3.0) {
      const k = t / 3.0;
      z.tempo = THREE.MathUtils.lerp(z.ritualTempo0, 0.05, 1 - Math.pow(1 - k, 2));
      z.zielTempo = z.tempo;
    } else if (!z.anhalten) {
      z.anhalten = { von: z.phase, nach: Math.ceil(z.phase / (Math.PI * 2)) * Math.PI * 2, t: 0 };
    }
    if (t > 3.3 && !z.gongDa) { z.gongDa = true; klang.gong(0.85); z.zielAuftauchen = 1; kam.wackeln = 0.03; }
    if (t > 3.7 && !z.muenzenDa) {
      z.muenzenDa = true;
      if ((Math.random() < 1 / 50 || params.has('muenzen')) && muenzregen) { muenzregen.start(); klang.muenzen(40); }
    }
    if (t > 3.3) z.wirbel = Math.max(0.3, 1 - (t - 3.3) / 1.6);
    if (t > 5.8) { z.anhalten = null; antwortFertig(); }
  } else {
    z.wirbel += (0 - z.wirbel) * dt * 1.5;
    z.augen += ((z.modus === 'lauschen' ? 0.35 : 0) - z.augen) * dt * 2;
    if (z.modus !== 'antwort') z.zielNah = 0;
  }

  // Winken
  if (arm) {
    const vorher = z.phase;
    if (z.anhalten) {
      z.anhalten.t = Math.min(1, z.anhalten.t + dt / 0.9);
      const e = 1 - Math.pow(1 - z.anhalten.t, 3);
      z.phase = THREE.MathUtils.lerp(z.anhalten.von, z.anhalten.nach, e);
      z.tempo = 0;
    } else {
      if (z.modus !== 'ritual') z.tempo += (z.zielTempo - z.tempo) * dt * 0.8;
      z.phase += z.tempo * dt * Math.PI * 2;
    }
    if (Math.floor(vorher / Math.PI) !== Math.floor(z.phase / Math.PI) && z.modus !== 'schlafen') {
      klang.quietschen(Math.min(7, Math.max(1, 0.55 / Math.max(z.tempo, 0.07))), z.modus === 'ritual' ? 1.3 : 0.8);
    }
    arm.rotation.x = 0.06 + 0.46 * (0.5 - 0.5 * Math.cos(z.phase));
  }

  // Bauch
  z.auftauchen += (z.zielAuftauchen - z.auftauchen) * Math.min(1, dt * (z.zielAuftauchen > z.auftauchen ? 0.9 : 3));
  bauch.material.uniforms.uZeit.value = zeit;
  bauch.material.uniforms.uWirbel.value = z.wirbel;
  bauch.material.uniforms.uAuftauchen.value = z.auftauchen;
  bauch.material.uniforms.uGlimmen.value = 0.25 + 0.25 * Math.sin(zeit * 0.8) * 0.5 + z.augen * 0.3;
  bauchLicht.intensity = z.auftauchen * 0.7 + z.wirbel * 0.4;
  augenMat.emissiveIntensity = z.augen * 1.3;

  // Kamera
  z.nah += (z.zielNah - z.nah) * Math.min(1, dt * (z.zielNah > z.nah ? 0.55 : 1.6));
  const k = kameraPosition(z.nah);
  const drift = 1 - z.nah * 0.8;
  k.pos.x += (Math.sin(zeit * 0.21) * 0.25 + zeiger.x * 0.35) * drift;
  k.pos.y += (Math.sin(zeit * 0.17) * 0.12 - zeiger.y * 0.2) * drift;
  kam.wackeln *= Math.pow(0.02, dt);
  k.pos.x += (Math.random() - 0.5) * kam.wackeln;
  k.pos.y += (Math.random() - 0.5) * kam.wackeln;
  kamera.position.copy(k.pos);
  kamera.lookAt(k.ziel);

  schrein.aktualisiere(zeit, dt);
  if (muenzregen) muenzregen.aktualisiere(dt);
  composer.render();
  requestAnimationFrame(schritt);
}
requestAnimationFrame(schritt);

// Testmodus: Zustände direkt anspringen (?test&modus=antwort)
if (TEST) {
  katzeGeladen.then(async () => {
    await ladeSprueche();
    try { await document.fonts.load('700 60px "Cinzel"'); } catch { /* egal */ }
    $('#erwachen').classList.add('weg');
    katze.visible = true;
    geheZu('ruhe');
    ruheHinweis();
    const m = params.get('modus');
    if (m === 'antwort') {
      ritual(params.get('frage') || 'Wann kommt das Budget?');
      z.ritualZeit = 5.7;
      z.zielAuftauchen = 1; z.auftauchen = 1; z.nah = 1; z.gongDa = true; z.muenzenDa = true;
    }
    window.__bereit = true;
  });
}
