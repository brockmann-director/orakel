// Fassung 3 (Probe): die Katze als echtes 3D-Modell im Tal.
// Porzellan mit Klarlack und Spiegelungen, die Pfote schwingt wirklich (Vertex-Shader),
// das Portal ist in die Keramik gemalt (Nebel mit Tiefe), die Kamera fliegt hinein.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { schreibeAufLeinwand } from './buehne.js';

// Maße im Modell (glTF, nach dem Einbacken der Knotenmatrix), gemessen aus der Textur.
const MODELL = {
  hoehe: 0.884,
  portal: { c: new THREE.Vector3(-0.0226, 0.315, 0.2), r: 0.112, n: new THREE.Vector3(0.06, 0.05, 1).normalize() },
  // Pfote: erhobener Arm auf +x, Drehpunkt am Ellbogen
  pfote: { x0: 0.2, x1: 0.232, y0: 0.44, y1: 0.56, dreh: new THREE.Vector3(0.24, 0.47, -0.02) },
};
const GROESSE = 12; // Die Katze ist zwölf Meter hoch.
const S = GROESSE / MODELL.hoehe;

const NOISE = /* glsl */ `
  float p3hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float p3noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(p3hash(i), p3hash(i + vec2(1, 0)), u.x), mix(p3hash(i + vec2(0, 1)), p3hash(i + vec2(1, 1)), u.x), u.y);
  }
  float p3fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * p3noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
`;

export async function baueSzene3D(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const szene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(28, 1, 0.5, 600);
  const zeitU = { value: 0 };

  // ------------------------------------------------------------ Tal (Hintergrund)
  const tal = await new THREE.TextureLoader().loadAsync('assets/3d/tal.jpg');
  tal.colorSpace = THREE.SRGBColorSpace;
  tal.anisotropy = 4;
  const talBreite = tal.image.width / tal.image.height;
  const radius = 140;
  const bogen = 1.5; // Öffnungswinkel in rad
  const talHoehe = (radius * bogen) / talBreite;
  const talGeo = new THREE.CylinderGeometry(radius, radius, talHoehe, 64, 1, true, Math.PI - bogen / 2, bogen);
  const talMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTal: { value: tal }, uZeit: zeitU, uDunkel: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTal; uniform float uZeit; uniform float uDunkel; varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 uv = vec2(1.0 - vUv.x, vUv.y);
        // leicht unscharf (Tiefenschärfe) und abendlich gegradet
        vec3 c = texture2D(uTal, uv, 1.2).rgb;
        c = pow(c, vec3(2.2));
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 0.78);
        c *= vec3(0.78, 0.84, 1.02) * 0.62;
        // Dunst wandert durchs Tal
        float n = p3fbm(vec2(uv.x * 4.0 + uZeit * 0.015, uv.y * 3.0));
        c = mix(c, vec3(0.30, 0.31, 0.36), n * 0.18 * smoothstep(0.1, 0.6, uv.y));
        c *= 1.0 - uDunkel * 0.55;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // Gamma: Textur ist sRGB, wir rechnen linear über pow – also ohne automatische Umwandlung lesen
  tal.colorSpace = THREE.NoColorSpace;
  const talMesh = new THREE.Mesh(talGeo, talMat);
  talMesh.position.set(0, talHoehe * 0.5 - 39, 0);
  talMesh.renderOrder = -10;
  szene.add(talMesh);

  // Himmel über dem Tal-Bild (falls die Kamera nach oben schaut)
  szene.background = new THREE.Color(0x2a2d36);

  // Umgebung für Spiegelungen: das Tal ringsum als Panorama
  const pmrem = new THREE.PMREMGenerator(renderer);
  const pano = document.createElement('canvas');
  pano.width = 2048; pano.height = 1024;
  {
    const g = pano.getContext('2d');
    const himmel = g.createLinearGradient(0, 0, 0, 512);
    himmel.addColorStop(0, '#5d6678');
    himmel.addColorStop(1, '#8c93a3');
    g.fillStyle = himmel; g.fillRect(0, 0, 2048, 512);
    g.fillStyle = '#211f24'; g.fillRect(0, 512, 2048, 512);
    // Band mit dem Tal, gespiegelt rundherum
    for (let i = 0; i < 4; i++) {
      g.save();
      if (i % 2) { g.translate((i + 1) * 512, 0); g.scale(-1, 1); } else g.translate(i * 512, 0);
      g.drawImage(tal.image, 0, 330, 512, 512 * 0.56 * 1.2);
      g.restore();
    }
    // warmes Laternenlicht unten, kühles Licht oben
    g.globalCompositeOperation = 'lighter';
    const l = g.createRadialGradient(1024, 640, 10, 1024, 640, 300);
    l.addColorStop(0, 'rgba(255,170,90,0.35)'); l.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = l; g.fillRect(0, 300, 2048, 700);
  }
  const panoTex = new THREE.CanvasTexture(pano);
  panoTex.mapping = THREE.EquirectangularReflectionMapping;
  panoTex.colorSpace = THREE.SRGBColorSpace;
  szene.environment = pmrem.fromEquirectangular(panoTex).texture;
  szene.environmentIntensity = 0.6;

  // ------------------------------------------------------------ Licht
  const himmelLicht = new THREE.HemisphereLight(0x9aa6c4, 0x1c1a22, 0.3);
  szene.add(himmelLicht);
  const schluessel = new THREE.DirectionalLight(0xfff1e2, 2.6);
  schluessel.position.set(-13, 15, 9);
  szene.add(schluessel);
  const kante = new THREE.DirectionalLight(0xa8b8ff, 2.8);
  kante.position.set(9, 10, -14);
  szene.add(kante);
  const laterne = new THREE.PointLight(0xffa45a, 16, 30, 1.6);
  laterne.position.set(-6, 1.5, 9);
  szene.add(laterne);
  const laterne2 = new THREE.PointLight(0xff9a50, 10, 26, 1.6);
  laterne2.position.set(7, 1.2, 7);
  szene.add(laterne2);

  // ------------------------------------------------------------ Katze
  const gltf = await new GLTFLoader().loadAsync('assets/3d/katze.glb');
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isMesh) mesh = o; });
  gltf.scene.updateMatrixWorld(true);
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  // Gewicht der Pfote je Ecke: weich über den Ellbogen, damit nichts aufreißt
  const pos = geo.attributes.position;
  const gewicht = new Float32Array(pos.count);
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const P = MODELL.pfote;
  for (let i = 0; i < pos.count; i++) gewicht[i] = sm(P.x0, P.x1, pos.getX(i)) * sm(P.y0, P.y1, pos.getY(i));
  geo.setAttribute('aPfote', new THREE.BufferAttribute(gewicht, 1));

  const alt = mesh.material;
  const textCanvas = document.createElement('canvas');
  textCanvas.width = textCanvas.height = 1024;
  const textTex = new THREE.CanvasTexture(textCanvas);
  textTex.colorSpace = THREE.NoColorSpace;

  const U = {
    uWinkel: { value: 0 },
    uDreh: { value: P.dreh.clone() },
    uPortalC: { value: MODELL.portal.c.clone() },
    uPortalN: { value: MODELL.portal.n.clone() },
    uPortalR: { value: MODELL.portal.r },
    uZeit: zeitU,
    uWirbel: { value: 0 },
    uGlimmen: { value: 0.2 },
    uAuftauchen: { value: 0 },
    uText: { value: textTex },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    map: alt.map,
    normalMap: new URLSearchParams(location.search).has("ohnenormal") ? null : alt.normalMap,
    roughnessMap: alt.roughnessMap,
    metalnessMap: alt.metalnessMap,
    roughness: 0.55,
    metalness: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.0,
  });
  const DEBUG = new URLSearchParams(location.search).get("debug") || "";
  if (!DEBUG.includes("roh")) mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPfote;
        uniform float uWinkel;
        uniform vec3 uDreh;
        varying vec3 vModell;
        varying vec3 vWelt;
        mat3 p3drehX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = p3drehX(uWinkel * aPfote) * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed = p3drehX(uWinkel * aPfote) * (transformed - uDreh) + uDreh;
        vModell = transformed;
        vWelt = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uPortalC; uniform vec3 uPortalN; uniform float uPortalR;
        uniform float uZeit; uniform float uWirbel; uniform float uGlimmen; uniform float uAuftauchen;
        uniform sampler2D uText;
        varying vec3 vModell;
        varying vec3 vWelt;
        ${NOISE}
        float p3maske; vec3 p3farbe;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // Lage im Portal: Ebene senkrecht zur Portal-Normalen
          vec3 n = normalize(uPortalN);
          vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), n));
          vec3 ay = cross(n, ax);
          vec3 rel = vModell - uPortalC;
          vec2 d = vec2(dot(rel, ax), dot(rel, ay)) / uPortalR;
          float r = length(d);
          p3maske = smoothstep(1.0, 0.94, r) * step(-0.02, dot(rel, n) + 0.12);
          // Tiefe: der Nebel liegt hinter der Oberfläche (Blick schräg = verschoben)
          vec3 blick = normalize(vWelt - cameraPosition);
          vec2 tiefe = vec2(dot(blick, ax), dot(blick, ay)) / max(0.25, abs(dot(blick, n)));
          float a = atan(d.y, d.x);
          float dreh = uZeit * (0.08 + uWirbel * 0.45) + uWirbel * 1.3 * (1.0 - r) * (1.0 - r);
          vec2 q0 = d + tiefe * 0.35;
          float r0 = length(q0);
          float aw = atan(q0.y, q0.x) + dreh;
          vec2 q = vec2(cos(aw), sin(aw)) * r0;
          float n1 = p3fbm(q * 2.2 + vec2(uZeit * 0.05, -uZeit * 0.04));
          float n2 = p3fbm(q * 4.2 - vec2(uZeit * 0.08) + n1 * 1.8);
          float nebel = smoothstep(0.22, 0.95, n2);
          vec3 nf = mix(vec3(0.015, 0.0, 0.04), vec3(0.36, 0.1, 0.72), nebel);
          nf = mix(nf, vec3(0.82, 0.62, 1.0), smoothstep(0.62, 0.98, n2 * (0.6 + 0.6 * n1)) * 0.55);
          nf *= 0.55 + smoothstep(0.9, 0.0, r) * 0.75 + uWirbel * 0.35 + uGlimmen * 0.4;
          nf *= mix(0.25, 1.0, smoothstep(1.0, 0.7, r));
          // Antwort steigt aus der Tiefe auf
          float k = clamp(uAuftauchen, 0.0, 1.0);
          float ke = 1.0 - pow(1.0 - k, 3.0);
          vec2 tuv = vec2(0.5 + d.x * 0.5, 0.5 + d.y * 0.5);
          tuv = (tuv - 0.5) / mix(0.4, 1.0, ke) + 0.5;
          tuv.y += (1.0 - ke) * 0.1;
          tuv += (vec2(n1, n2) - 0.5) * 0.05 * (1.0 - ke);
          nf *= mix(1.0, 0.5, ke);
          vec2 tx = texture2D(uText, tuv).rg;
          if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) tx = vec2(0.0);
          float sicht = smoothstep(0.0, 0.55, k * 1.35 - (1.0 - n2) * 0.45);
          nf += vec3(1.0, 0.55, 0.22) * tx.g * 0.9 * sicht;
          nf = mix(nf, vec3(1.0, 0.86, 0.62) * (1.6 + 0.6 * (1.0 - ke)), clamp(tx.r * sicht, 0.0, 1.0));
          p3farbe = nf;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0), p3maske);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += p3farbe * p3maske * 1.4;`)
      // Glanzlichter begrenzen: sonst laufen sie im Half-Float-Puffer über und blühen als Quadrate auf
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(12.0));`);
  };
  const katze = new THREE.Mesh(geo, mat);
  katze.scale.setScalar(S);
  szene.add(katze);

  // Licht aus dem Portal
  const portalWelt = MODELL.portal.c.clone().multiplyScalar(S);
  const portalNormal = MODELL.portal.n.clone();
  const portalLicht = new THREE.PointLight(0x9a55ff, 0, 14, 1.4);
  portalLicht.position.copy(portalWelt).addScaledVector(portalNormal, 1.6);
  szene.add(portalLicht);

  // Kontaktschatten unter der Katze
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    const schatten = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    schatten.rotation.x = -Math.PI / 2;
    schatten.position.set(0, 0.02, 0);
    szene.add(schatten);
  }
  // Boden: dunkler Stein, verschwindet im Nebel
  const bodenMat = new THREE.MeshStandardMaterial({ color: 0x2c2b30, roughness: 0.8, transparent: true, depthWrite: false });
  bodenMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vB;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvB = position.xy;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vB;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(70.0, 35.0, length(vB));');
  };
  const boden = new THREE.Mesh(new THREE.CircleGeometry(70, 64), bodenMat);
  boden.rotation.x = -Math.PI / 2;
  szene.add(boden);

  // ------------------------------------------------------------ Nebel (Schichten)
  const nebelMat = (farbe, dichte, tempo) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uZeit: zeitU, uFarbe: { value: new THREE.Color(farbe) }, uDichte: { value: dichte }, uTempo: { value: tempo }, uSeed: { value: Math.random() * 50 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uZeit; uniform vec3 uFarbe; uniform float uDichte; uniform float uTempo; uniform float uSeed;
      varying vec2 vUv; varying vec3 vW;
      ${NOISE}
      void main() {
        vec2 p = vec2(vUv.x * 6.0 + uZeit * uTempo + uSeed, vUv.y * 2.0 - uZeit * uTempo * 0.3);
        float n = p3fbm(p + p3fbm(p * 0.7 + uZeit * 0.02) * 1.5);
        float a = smoothstep(0.28, 0.78, n) * uDichte;
        a *= smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        a *= smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        gl_FragColor = vec4(uFarbe, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const schichten = [
    { z: -30, y: 2, b: 160, h: 26, d: 0.55, t: 0.006, f: 0x5a5e6a },
    { z: -8, y: -1, b: 70, h: 12, d: 0.6, t: 0.01, f: 0x6c707c },
    { z: -4, y: -1, b: 50, h: 7, d: 0.8, t: 0.012, f: 0x7a7e8a },
    { z: 4.5, y: -1.4, b: 60, h: 5.5, d: 1.0, t: 0.014, f: 0x8a8d98 },
    { z: 12, y: -1.6, b: 50, h: 3.5, d: 0.7, t: 0.02, f: 0x9a9ca6 },
  ];
  const nebel = schichten.map((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.b, s.h), nebelMat(s.f, s.d, s.t));
    m.position.set(0, s.y + s.h / 2, s.z);
    szene.add(m);
    return m;
  });
  // liegender Bodennebel über dem Stein
  const liegend = new THREE.Mesh(new THREE.PlaneGeometry(140, 90), nebelMat(0x80838e, 0.5, 0.008));
  liegend.rotation.x = -Math.PI / 2;
  liegend.position.set(0, 0.5, 10);
  szene.add(liegend);
  nebel.push(liegend);

  // ------------------------------------------------------------ Nachbearbeitung
  const ziel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, ziel);
  composer.addPass(new RenderPass(szene, kamera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const look = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uZeit: zeitU, uSchirm: { value: new THREE.Vector2(1, 1) }, uHell: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uZeit; uniform vec2 uSchirm; uniform float uHell; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        // Schatten leicht kühl, Lichter warm
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c += (vec3(-0.01, 0.0, 0.025) * (1.0 - l) + vec3(0.02, 0.008, -0.015) * l) * 0.8;
        float vig = smoothstep(1.25, 0.35, length((vUv - 0.5) * vec2(uSchirm.x / uSchirm.y, 1.0) * 1.1));
        c *= mix(0.5, 1.0, vig) * uHell;
        c += (h(vUv * uSchirm + fract(uZeit * 7.13) * 100.0) - 0.5) * 0.03;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(look);

  // ------------------------------------------------------------ Kamera
  const blickZiel = new THREE.Vector3(0, 6.0, 0);
  function totale(aspekt) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2));
    const hoeheNoetig = GROESSE * 1.32;
    const breiteNoetig = 8.6 * 1.25;
    const d = Math.max(hoeheNoetig / (2 * tanV), breiteNoetig / (2 * tanV * aspekt));
    return new THREE.Vector3(0, 5.2, d);
  }
  function portalPosition(aspekt) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2));
    const fuell = Math.min(0.86 * aspekt, 0.6);
    const d = (2 * MODELL.portal.r * S) / (fuell * 2 * tanV);
    return portalWelt.clone().addScaledVector(portalNormal, d);
  }

  function groesse(b, h) {
    renderer.setSize(b, h, false);
    const pr = renderer.getPixelRatio();
    composer.setSize(b, h);
    bloom.resolution.set(b * pr, h * pr);
    look.uniforms.uSchirm.value.set(b * pr, h * pr);
    kamera.aspect = b / h;
    kamera.updateProjectionMatrix();
  }

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  // flug: 0 = Totale, 1 = im Portal; blick: kleine Schwenks (Maus/Kippen) in rad
  function stelleKamera(flug, blickX, blickY, zeit) {
    const a = kamera.aspect;
    const t0 = totale(a);
    // ruhiges Atmen der Kamera in der Totale
    t0.x += Math.sin(zeit * 0.13) * 0.35;
    t0.y += Math.sin(zeit * 0.09) * 0.15;
    const p1 = portalPosition(a);
    // Bogen: auf dem Weg ins Portal etwas höher und seitlich
    const bogenH = Math.sin(flug * Math.PI) * 0.8;
    tmpA.lerpVectors(t0, p1, flug);
    tmpA.y += bogenH;
    // Schwenk um die Katze (Parallaxe)
    const umkreis = (1 - flug * 0.85);
    const dx = tmpA.x, dz = tmpA.z;
    const w = blickX * umkreis;
    tmpA.x = dx * Math.cos(w) + dz * Math.sin(w);
    tmpA.z = -dx * Math.sin(w) + dz * Math.cos(w);
    tmpA.y += blickY * 6 * umkreis;
    kamera.position.copy(tmpA);
    tmpB.lerpVectors(blickZiel, portalWelt, Math.min(1, flug * 1.4));
    kamera.lookAt(tmpB);
  }

  return {
    szene, kamera, uniforms: U, portalLicht, nebel, talMat, look,
    groesse,
    schreibe(text) { schreibeAufLeinwand(textCanvas, text); textTex.needsUpdate = true; },
    stelleKamera,
    zeichne(zeit) { zeitU.value = zeit; composer.render(); },
  };
}
