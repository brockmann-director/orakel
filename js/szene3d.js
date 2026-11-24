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
  // Trennlinie zwischen Kopf und Arm in der Vorderansicht (Spalt in der Silhouette), y → x
  pfote: { spalt: [[0.5, 0.145], [0.6, 0.17], [0.68, 0.176], [0.74, 0.168], [0.8, 0.152], [0.95, 0.15]], y0: 0.46, y1: 0.54, oben: 0.8, dreh: new THREE.Vector3(0.22, 0.48, -0.01) },
};
const GROESSE = 12; // Die Katze ist zwölf Meter hoch.
const S = GROESSE / MODELL.hoehe;
const SOCKEL = 0.68; // die Katze steht auf einem Steinsockel im Wasser

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
  const tal = await new THREE.TextureLoader().loadAsync('assets/3d/tempel.jpg');
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
        vec3 c = texture2D(uTal, uv, 0.6).rgb;
        c = pow(c, vec3(2.2));
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 0.85) * vec3(0.92, 1.0, 1.0) * 0.8;
        // Dunst zieht langsam durchs Tal
        float n = p3fbm(vec2(uv.x * 4.0 + uZeit * 0.015, uv.y * 3.0));
        c += vec3(0.02, 0.05, 0.055) * n * smoothstep(0.2, 0.6, uv.y) * smoothstep(0.95, 0.6, uv.y);
        c *= 1.0 - uDunkel * 0.6;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // Gamma: Textur ist sRGB, wir rechnen linear über pow – also ohne automatische Umwandlung lesen
  tal.colorSpace = THREE.NoColorSpace;
  const talMesh = new THREE.Mesh(talGeo, talMat);
  // Horizont der Platte (Anteil von unten) auf Augenhöhe der Totale
  const HORIZONT = 0.27;
  talMesh.position.set(0, talHoehe * 0.5 - HORIZONT * talHoehe + 2.4, 0);
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
    himmel.addColorStop(0, '#5f8f98');
    himmel.addColorStop(1, '#2c4a52');
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
    l.addColorStop(0, 'rgba(255,150,80,0.22)'); l.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = l; g.fillRect(0, 300, 2048, 700);
  }
  const panoTex = new THREE.CanvasTexture(pano);
  panoTex.mapping = THREE.EquirectangularReflectionMapping;
  panoTex.colorSpace = THREE.SRGBColorSpace;
  szene.environment = pmrem.fromEquirectangular(panoTex).texture;
  szene.environmentIntensity = 0.22;

  // ------------------------------------------------------------ Licht
  const himmelLicht = new THREE.HemisphereLight(0x6d9aa3, 0x05080a, 0.12);
  szene.add(himmelLicht);
  // Lichtkegel von oben (wie durch eine Öffnung im Blätterdach)
  const kegelLicht = new THREE.SpotLight(0xd4f4ff, 2600, 80, 0.2, 0.75, 1.5);
  kegelLicht.position.set(1.2, 46, 3.5);
  kegelLicht.target.position.set(0, 4, 0.5);
  szene.add(kegelLicht, kegelLicht.target);
  // schwaches Mondlicht von vorn, damit das Gesicht nicht absäuft
  const schluessel = new THREE.DirectionalLight(0x9fc6d2, 0.35);
  schluessel.position.set(-8, 10, 14);
  szene.add(schluessel);
  const kante = new THREE.DirectionalLight(0x8fe6ff, 3.2);
  kante.position.set(9, 12, -14);
  szene.add(kante);
  const kante2 = new THREE.DirectionalLight(0x6fbfd0, 1.6);
  kante2.position.set(-11, 6, -10);
  szene.add(kante2);
  // warmer Akzent: eine Laterne halb hinter der Katze
  const laterne = new THREE.PointLight(0xff9a4a, 22, 26, 1.6);
  laterne.position.set(-7.5, 1.2, -2.5);
  szene.add(laterne);
  const laterne2 = new THREE.PointLight(0xff8a40, 6, 20, 1.6);
  laterne2.position.set(6.5, 0.8, 6);
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
  const spaltX = (y) => {
    const t = P.spalt;
    if (y <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++) if (y <= t[i][0]) { const [y0, x0] = t[i - 1]; const [y1, x1] = t[i]; return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0); }
    return t[t.length - 1][1];
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i); const g = spaltX(y);
    // rechts vom Spalt, oberhalb des Ellbogens: starr mitdrehen; am Ellbogen weich biegen
    gewicht[i] = sm(g - 0.006, g + 0.006, x) * sm(P.y0, P.y1, y) * (1 - sm(P.oben, P.oben + 0.01, y));
  }
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
        gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(12.0));
        // der Lichtkegel kommt von oben: nach unten fällt das Licht ab (Portal ausgenommen)
        gl_FragColor.rgb *= mix(mix(0.42, 1.0, smoothstep(0.02, 0.7, vModell.y)), 1.0, p3maske);`);
  };
  const katze = new THREE.Mesh(geo, mat);
  katze.scale.setScalar(S);
  katze.position.y = SOCKEL;
  szene.add(katze);

  // Licht aus dem Portal
  const portalWelt = MODELL.portal.c.clone().multiplyScalar(S).add(new THREE.Vector3(0, SOCKEL, 0));
  const portalNormal = MODELL.portal.n.clone();
  const portalLicht = new THREE.PointLight(0x9a55ff, 0, 14, 1.4);
  portalLicht.position.copy(portalWelt).addScaledVector(portalNormal, 1.6);
  szene.add(portalLicht);

  // Steinsockel: die Katze steht auf einer flachen Insel im Wasser
  const steinMat = new THREE.MeshStandardMaterial({ color: 0x14191a, roughness: 0.45, metalness: 0 });
  steinMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vS;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vS;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sn = p3fbm(vS.xz * 1.3 + vS.y * 2.0);
        float moos = smoothstep(0.55, 0.75, p3fbm(vS.xz * 0.7 + 4.0)) * smoothstep(0.2, 0.75, vS.y);
        diffuseColor.rgb *= 0.55 + sn * 0.8;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.16, 0.08), moos * 0.8);
        diffuseColor.rgb *= mix(0.35, 1.0, smoothstep(-0.4, 0.5, vS.y)); // nass und dunkel am Wasser`);
  };
  const sockelGeo = new THREE.CylinderGeometry(6.0, 7.2, 1.4, 56, 3);
  {
    // unregelmäßiger Rand
    const p = sockelGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const w = Math.atan2(z, x);
      const f = 1 + 0.05 * Math.sin(w * 7 + 1.3) + 0.035 * Math.sin(w * 13 + 0.4) + (y < 0 ? 0.04 : 0);
      p.setXYZ(i, x * f, y + 0.08 * Math.sin(w * 5), z * f);
    }
    sockelGeo.computeVertexNormals();
  }
  const sockel = new THREE.Mesh(sockelGeo, steinMat);
  sockel.position.y = 0.0;
  szene.add(sockel);

  // Wasser: echte Spiegelung (die Welt einmal gespiegelt in einen Puffer), dazu Kräuseln
  const spiegelZiel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const wasserU = { uSpiegel: { value: spiegelZiel.texture }, uZeit: zeitU, uSchirm: { value: new THREE.Vector2(1, 1) }, uKegel: { value: 1 } };
  const wasser = new THREE.Mesh(new THREE.CircleGeometry(90, 72), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: wasserU,
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSpiegel; uniform float uZeit; uniform vec2 uSchirm; uniform float uKegel; varying vec3 vW;
      ${NOISE}
      void main() {
        vec2 p = vW.xz;
        // Kräuseln: zwei Rauschfelder, die gegeneinander ziehen
        float a = p3fbm(p * 0.35 + vec2(uZeit * 0.12, uZeit * 0.05));
        float b = p3fbm(p * 0.9 - vec2(uZeit * 0.08, -uZeit * 0.11));
        vec2 stoer = (vec2(a, b) - 0.5) * 0.035;
        // Ringe um den Sockel
        float r = length(p);
        stoer += normalize(p + 0.001) * sin(r * 3.2 - uZeit * 1.6) * 0.004 * smoothstep(16.0, 7.0, r);
        vec2 suv = gl_FragCoord.xy / uSchirm + stoer;
        vec3 spiegel = texture2D(uSpiegel, suv).rgb;
        vec3 blick = normalize(cameraPosition - vW);
        float fres = 0.25 + 0.75 * pow(1.0 - max(blick.y, 0.0), 4.0);
        vec3 tief = vec3(0.006, 0.014, 0.016);
        vec3 c = mix(tief, spiegel * 0.85, fres);
        // Lichtkegel trifft das Wasser
        c += vec3(0.25, 0.5, 0.55) * 0.12 * uKegel * exp(-dot(p - vec2(0.8, 1.5), p - vec2(0.8, 1.5)) / 60.0) * (0.6 + a);
        float alpha = smoothstep(90.0, 45.0, r);
        gl_FragColor = vec4(c, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  wasser.rotation.x = -Math.PI / 2;
  wasser.renderOrder = -5;
  szene.add(wasser);

  // Lichtkegel als Volumen: weicher Konus, flimmernder Staub darin
  const kegel = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 9.5, 48, 48, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uZeit: zeitU, uKegel: wasserU.uKegel },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying float vH;
      void main(){ vH = uv.y; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uZeit; uniform float uKegel; varying vec3 vN; varying vec3 vW; varying float vH;
      ${NOISE}
      void main(){
        vec3 v = normalize((viewMatrix * vec4(vW, 1.0)).xyz);
        float rand = abs(dot(vN, v));
        float weich = rand * rand;
        float streifen = 0.65 + 0.35 * p3fbm(vec2(atan(vW.z, vW.x) * 3.0, vW.y * 0.05 - uZeit * 0.03));
        float hoehe = smoothstep(0.0, 0.25, vH) * smoothstep(1.0, 0.55, vH);
        float a = weich * streifen * hoehe * 0.075 * uKegel;
        gl_FragColor = vec4(vec3(0.62, 0.92, 1.0) * a, 1.0);
      }`,
  }));
  kegel.position.set(0.6, 24, 1.8);
  kegel.rotation.z = -0.025;
  kegel.renderOrder = 5;
  szene.add(kegel);

  const STAUB = 900;
  const staubPos = new Float32Array(STAUB * 3);
  const staubSeed = new Float32Array(STAUB);
  for (let i = 0; i < STAUB; i++) {
    const h = Math.random();
    const r = Math.sqrt(Math.random()) * (1.5 + 8 * (1 - h));
    const w = Math.random() * Math.PI * 2;
    staubPos.set([Math.cos(w) * r + 0.6, h * 30, Math.sin(w) * r + 1.8], i * 3);
    staubSeed[i] = Math.random();
  }
  const staubGeo = new THREE.BufferGeometry();
  staubGeo.setAttribute('position', new THREE.BufferAttribute(staubPos, 3));
  staubGeo.setAttribute('aSeed', new THREE.BufferAttribute(staubSeed, 1));
  const staub = new THREE.Points(staubGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uZeit: zeitU, uKegel: wasserU.uKegel, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `attribute float aSeed; uniform float uZeit; uniform float uPixel; varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y - uZeit * (0.15 + aSeed * 0.25), 30.0);
        p.x += sin(uZeit * 0.3 + aSeed * 40.0) * 0.6;
        p.z += cos(uZeit * 0.25 + aSeed * 30.0) * 0.6;
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPixel * (14.0 + aSeed * 22.0) / -mv.z;
        vA = (0.35 + 0.65 * abs(sin(uZeit * (0.6 + aSeed) + aSeed * 20.0))) * smoothstep(0.0, 3.0, p.y) * smoothstep(30.0, 22.0, p.y);
      }`,
    fragmentShader: /* glsl */ `uniform float uKegel; varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; float k = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * k * vA * 0.5 * uKegel, 1.0); }`,
  }));
  staub.frustumCulled = false;
  staub.renderOrder = 6;
  szene.add(staub);

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
    { z: -30, y: 1, b: 160, h: 26, d: 0.5, t: 0.006, f: 0x2c4a50 },
    { z: -8, y: -0.5, b: 70, h: 12, d: 0.45, t: 0.01, f: 0x35565c },
    { z: -4, y: -0.5, b: 50, h: 7, d: 0.5, t: 0.012, f: 0x3e6066 },
    { z: 5, y: -0.6, b: 60, h: 4.5, d: 0.45, t: 0.014, f: 0x4a6c72 },
    { z: 13, y: -0.8, b: 50, h: 3.0, d: 0.35, t: 0.02, f: 0x56787e },
  ];
  const nebel = schichten.map((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.b, s.h), nebelMat(s.f, s.d, s.t));
    m.position.set(0, s.y + s.h / 2, s.z);
    szene.add(m);
    return m;
  });
  // liegender Bodennebel über dem Stein
  const liegend = new THREE.Mesh(new THREE.PlaneGeometry(140, 90), nebelMat(0x4d7076, 0.3, 0.008));
  liegend.rotation.x = -Math.PI / 2;
  liegend.position.set(0, 0.35, 10);
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
        // Tiefen türkis, Lichter neutral bis warm, etwas mehr Kontrast (S-Kurve)
        c += (vec3(-0.012, 0.01, 0.014) * (1.0 - l) + vec3(0.015, 0.006, -0.01) * l);
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
        float vig = smoothstep(1.2, 0.25, length((vUv - 0.5) * vec2(uSchirm.x / uSchirm.y, 1.0) * 1.1));
        c *= mix(0.32, 1.0, vig) * uHell;
        c += (h(vUv * uSchirm + fract(uZeit * 7.13) * 100.0) - 0.5) * 0.03;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(look);

  // ------------------------------------------------------------ Kamera
  const blickZiel = new THREE.Vector3(0, 6.6, 0);
  function totale(aspekt) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2));
    const hoeheNoetig = GROESSE * 1.32;
    const breiteNoetig = 8.6 * 1.25;
    const d = Math.max(hoeheNoetig / (2 * tanV), breiteNoetig / (2 * tanV * aspekt));
    return new THREE.Vector3(0, 2.6, d);
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
    wasserU.uSchirm.value.set(b * pr, h * pr);
    spiegelZiel.setSize(Math.round(b * pr * 0.5), Math.round(h * pr * 0.5));
    staub.material.uniforms.uPixel.value = h * pr * 0.004;
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
    zeichne(zeit) {
      zeitU.value = zeit;
      // Spiegelung: Welt an der Wasserfläche spiegeln und in den Puffer rendern
      wasser.visible = false; nebel.forEach((m) => { m.visible = false; });
      szene.scale.y = -1;
      szene.updateMatrixWorld();
      renderer.setRenderTarget(spiegelZiel);
      renderer.clear();
      renderer.render(szene, kamera);
      renderer.setRenderTarget(null);
      szene.scale.y = 1;
      wasser.visible = true; nebel.forEach((m) => { m.visible = true; });
      composer.render();
    },
    kegelU: wasserU.uKegel,
  };
}
