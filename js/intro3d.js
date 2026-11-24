// Studio-Intro: Gewitternacht im Dschungeltempel. Die Kamera gleitet tief über die verregnete Lagune,
// Blitze enthüllen das 27km-Logo als verwittertes Stein-Relikt im Wasser. Dann bricht Licht durch
// seine Risse, der letzte Blitz blendet weiß ins Spiel.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const INTRO_DAUER = 6.6; // bis zum weißen Blitz

// Blitze: Zeitpunkt, Ort am Himmel (x), Stärke
const BLITZE = [
  { t: 1.05, x: -38, staerke: 0.75, flackern: [0, 0.07, 0.16] },
  { t: 2.85, x: 44, staerke: 1.0, flackern: [0, 0.06, 0.2, 0.27] },
  { t: 4.7, x: -12, staerke: 0.55, flackern: [0, 0.08] },
];
const SCHLUSS = 6.35; // letzter, großer Blitz direkt hinter dem Logo
const BREITE = 14; // Logo-Breite in Metern
const LOGO_Z = -26;

const NOISE = /* glsl */ `
  float ihash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float inoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(ihash(i), ihash(i + vec2(1, 0)), u.x), mix(ihash(i + vec2(0, 1)), ihash(i + vec2(1, 1)), u.x), u.y); }
  float ifbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * inoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

let logoDaten = null;
export function ladeLogo3D() {
  if (!logoDaten) logoDaten = fetch('assets/3d/logo27km.json').then((r) => r.json());
  return logoDaten;
}

// ---------------------------------------------------------------- Stein-Texturen (einmal gemalt)
function steinTexturen(rnd) {
  const N = 512;
  const farbe = document.createElement('canvas'); farbe.width = farbe.height = N;
  const relief = document.createElement('canvas'); relief.width = relief.height = N;
  const riss = document.createElement('canvas'); riss.width = riss.height = N;
  const gf = farbe.getContext('2d'), gr = relief.getContext('2d'), gs = riss.getContext('2d');
  // Wertrauschen, kachelbar
  const gitter = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const okt = [gitter(8), gitter(16), gitter(32), gitter(64), gitter(128)];
  const wert = (g, n, x, y) => {
    const fx = x * n, fy = y * n; const ix = Math.floor(fx), iy = Math.floor(fy); const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(iy % n) * n + (ix % n)], b = g[(iy % n) * n + ((ix + 1) % n)], c = g[((iy + 1) % n) * n + (ix % n)], d = g[((iy + 1) % n) * n + ((ix + 1) % n)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const bf = gf.createImageData(N, N), br = gr.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, amp = 0.5;
    okt.forEach((g, k) => { s += amp * wert(g, 8 << k, x / N, y / N); amp *= 0.5; });
    const poren = wert(okt[4], 128, x / N, y / N) > 0.88 ? 0.55 : 1; // Lufteinschlüsse wie im Beton
    const v = Math.min(1, Math.max(0, (s - 0.2) * 1.4)) * poren;
    const i = (y * N + x) * 4;
    const grau = 105 + v * 120;
    bf.data[i] = grau * 0.94; bf.data[i + 1] = grau * 0.98; bf.data[i + 2] = grau; bf.data[i + 3] = 255;
    br.data[i] = br.data[i + 1] = br.data[i + 2] = v * 255; br.data[i + 3] = 255;
  }
  gf.putImageData(bf, 0, 0); gr.putImageData(br, 0, 0);
  // Risse: gezackte Linien, verzweigt
  gs.fillStyle = '#000'; gs.fillRect(0, 0, N, N);
  const zieh = (x, y, w, laenge, dicke, tiefe) => {
    const pfad = [[x, y]];
    for (let i = 0; i < laenge; i++) {
      w += (rnd() - 0.5) * 0.9;
      x += Math.cos(w) * 6; y += Math.sin(w) * 6;
      pfad.push([x, y]);
      if (tiefe < 2 && rnd() < 0.08) zieh(x, y, w + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), laenge * 0.4, dicke * 0.6, tiefe + 1);
    }
    for (const [g, farbeRiss, breite] of [[gf, 'rgba(12,12,14,0.9)', dicke], [gr, 'rgba(0,0,0,1)', dicke * 1.6], [gs, '#fff', dicke]]) {
      g.strokeStyle = farbeRiss; g.lineWidth = breite; g.lineJoin = 'round';
      g.beginPath(); pfad.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    }
  };
  for (let k = 0; k < 9; k++) zieh(rnd() * N, rnd() * N, rnd() * Math.PI * 2, 18 + rnd() * 30, 1.2 + rnd() * 1.8, 0);
  // weiches Leuchten um die Risse
  gs.filter = 'blur(3px)'; gs.globalCompositeOperation = 'lighter'; gs.globalAlpha = 0.6; gs.drawImage(riss, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  return { farbe: tex(farbe, true), relief: tex(relief, false), riss: tex(riss, true) };
}

function blitzGeometrie(start, ende, rnd) {
  let pkt = [start, ende];
  let versatz = start.distanceTo(ende) * 0.22;
  for (let s = 0; s < 6; s++) {
    const neu = [pkt[0]];
    for (let i = 1; i < pkt.length; i++) {
      const m = pkt[i - 1].clone().lerp(pkt[i], 0.5);
      m.x += (rnd() - 0.5) * versatz;
      m.z += (rnd() - 0.5) * versatz * 0.3;
      neu.push(m, pkt[i]);
    }
    pkt = neu;
    versatz *= 0.55;
  }
  const aeste = [];
  for (let k = 0; k < 2; k++) {
    const von = pkt[Math.floor(pkt.length * (0.25 + rnd() * 0.4))];
    let ast = [von, von.clone().add(new THREE.Vector3((rnd() - 0.5) * 30, -18 - rnd() * 14, 0))];
    let v = 6;
    for (let s = 0; s < 4; s++) {
      const neu = [ast[0]];
      for (let j = 1; j < ast.length; j++) { const m = ast[j - 1].clone().lerp(ast[j], 0.5); m.x += (rnd() - 0.5) * v; neu.push(m, ast[j]); }
      ast = neu; v *= 0.55;
    }
    aeste.push(ast);
  }
  const pos = [];
  const quer = [];
  const band = (linie, breite) => {
    for (let i = 1; i < linie.length; i++) {
      const a = linie[i - 1], b = linie[i];
      const d = b.clone().sub(a).normalize();
      const n = new THREE.Vector3(-d.y, d.x, 0).multiplyScalar(breite);
      const q = [a.clone().add(n), a.clone().sub(n), b.clone().add(n), b.clone().sub(n)];
      pos.push(...q[0].toArray(), ...q[1].toArray(), ...q[2].toArray(), ...q[2].toArray(), ...q[1].toArray(), ...q[3].toArray());
      quer.push(1, -1, 1, 1, -1, -1);
    }
  };
  band(pkt, 0.55);
  aeste.forEach((a) => band(a, 0.3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aQuer', new THREE.Float32BufferAttribute(quer, 1));
  return g;
}

export async function spieleIntro3D(renderer, { ueberspringbar = false, klang = null, film = false } = {}) {
  const daten = await ladeLogo3D();
  let zufall = 7;
  const rnd = () => { zufall = (zufall * 16807) % 2147483647; return zufall / 2147483647; };

  const szene = new THREE.Scene();
  szene.background = new THREE.Color(0x020304);
  const kamera = new THREE.PerspectiveCamera(32, 1, 0.3, 900);
  const zeitU = { value: 0 };
  const blitzU = { value: 0 };

  // ------------------------------------------------ Dschungeltempel im Gewitter (dasselbe Tal wie im Spiel)
  const tal = await new THREE.TextureLoader().loadAsync('assets/3d/sturm.jpg');
  tal.colorSpace = THREE.NoColorSpace;
  const talBreite = tal.image.width / tal.image.height;
  const radius = 220, bogen = 1.6, talHoehe = (radius * bogen) / talBreite;
  const talMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTal: { value: tal }, uZeit: zeitU, uBlitz: blitzU, uBlitzX: { value: 0.5 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTal; uniform float uZeit; uniform float uBlitz; uniform float uBlitzX; varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 uv = vec2(1.0 - vUv.x, vUv.y);
        vec3 c = pow(max(texture2D(uTal, uv, 0.8).rgb, 0.0), vec3(2.2));
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 nacht = c * 0.55;
        float w = ifbm(vec2(uv.x * 3.0 + uZeit * 0.05, uv.y * 2.0 + uZeit * 0.02));
        nacht = mix(nacht, vec3(0.006, 0.008, 0.012), smoothstep(0.6, 1.0, uv.y) * w * 0.6);
        // Blitz: Himmel reißt auf, Ruinen als Silhouetten, nahe am Einschlag heller
        float naehe = exp(-abs(uv.x - uBlitzX) * 3.0);
        vec3 hell = mix(vec3(l), c, 0.3) * vec3(0.8, 0.9, 1.0) * (1.2 + 3.0 * naehe)
                  + vec3(0.28, 0.33, 0.42) * smoothstep(0.45, 0.95, uv.y) * (0.5 + w) * (0.5 + naehe);
        gl_FragColor = vec4(nacht + hell * uBlitz, 1.0);
      }`,
  });
  const talMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, talHoehe, 64, 1, true, Math.PI - bogen / 2, bogen), talMat);
  const HORIZONT = 0.27;
  talMesh.position.y = talHoehe * 0.5 - HORIZONT * talHoehe + 1.2;
  szene.add(talMesh);

  // ------------------------------------------------ Logo als Stein-Relikt
  const formen = daten.map((ringe) => {
    const s = new THREE.Shape(ringe[0].map(([x, y]) => new THREE.Vector2(x, y)));
    for (let i = 1; i < ringe.length; i++) s.holes.push(new THREE.Path(ringe[i].map(([x, y]) => new THREE.Vector2(x, y))));
    return s;
  });
  const logoGeo = new THREE.ExtrudeGeometry(formen, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
  logoGeo.center();
  {
    // Kanten bröckeln: jede Ecke abhängig von ihrer Lage verschieben (gleiche Lage = gleicher Versatz, nichts reißt)
    const p = logoGeo.attributes.position;
    const h = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const kx = Math.round(x * 400) / 400, ky = Math.round(y * 400) / 400, kz = Math.round(z * 400) / 400;
      const a = 0.0045; // nur in der Ebene: Vorder- und Rückseite bleiben glatt (sonst Facetten)
      p.setXYZ(i, x + (h(kx, ky, kz) - 0.5) * a, y + (h(ky, kz, kx) - 0.5) * a, z);
    }
    // UVs aus der Lage, damit der Stein auf allen Seiten gleich groß gemasert ist
    const uv = logoGeo.attributes.uv;
    const n = new THREE.Vector3();
    const nor = logoGeo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      n.fromBufferAttribute(nor, i);
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (Math.abs(n.z) > 0.6) uv.setXY(i, x * 1.6, y * 1.6);
      else if (Math.abs(n.x) > Math.abs(n.y)) uv.setXY(i, z * 1.6 + 0.37, y * 1.6);
      else uv.setXY(i, x * 1.6, z * 1.6 + 0.61);
    }
  }
  const stein = steinTexturen(rnd);
  const rissU = { uRiss: { value: 0 }, uZeit: zeitU };
  const logoMat = new THREE.MeshStandardMaterial({
    map: stein.farbe, bumpMap: stein.relief, bumpScale: 2.2, roughness: 0.78, metalness: 0,
    emissive: 0xffffff, emissiveMap: stein.riss, emissiveIntensity: 0,
  });
  logoMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rissU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uRiss; uniform float uZeit;\n${NOISE}`)
      // nass vom Regen: oben glänzender, unten dunkler (zieht Wasser)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.42, 0.85, smoothstep(0.05, 0.75, ifbm(vObj.xy * 9.0)));`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(-0.25, 0.0, vObj.y));`)
      // Licht bricht durch die Risse: wandert von unten nach oben, flackert
      .replace('#include <emissivemap_fragment>', `
        vec3 rissFarbe = texture2D(emissiveMap, vEmissiveMapUv).rgb;
        float front = smoothstep(uRiss * 1.4 - 0.35, uRiss * 1.4 - 0.55, vObj.y + 0.2 + (ifbm(vObj.xy * 6.0) - 0.5) * 0.3);
        float flackern = 0.8 + 0.2 * sin(uZeit * 31.0 + vObj.x * 20.0);
        totalEmissiveRadiance = vec3(0.62, 0.92, 1.0) * rissFarbe.r * front * uRiss * 3.2 * flackern;`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = min(gl_FragColor.rgb, vec3(12.0));');
  };
  const logo = new THREE.Mesh(logoGeo, logoMat);
  logo.scale.setScalar(BREITE);
  const logoHoehe = 0.418 * BREITE;
  logo.position.set(0, logoHoehe / 2 - 0.35, LOGO_Z);
  szene.add(logo);
  // Licht aus den Rissen strahlt auf Wasser und Umgebung
  const rissLicht = new THREE.PointLight(0x9fe8ff, 0, 40, 1.4);
  rissLicht.position.set(0, logoHoehe * 0.45, LOGO_Z + 3);
  szene.add(rissLicht);

  // Spiegelungen auf dem nassen Stein
  const pmrem = new THREE.PMREMGenerator(renderer);
  const pano = document.createElement('canvas');
  pano.width = 1024; pano.height = 512;
  const pg = pano.getContext('2d');
  const gr = pg.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#202a33'); gr.addColorStop(0.45, '#6f7d8c'); gr.addColorStop(0.55, '#14181c'); gr.addColorStop(1, '#040506');
  pg.fillStyle = gr; pg.fillRect(0, 0, 1024, 512);
  const panoTex = new THREE.CanvasTexture(pano);
  panoTex.mapping = THREE.EquirectangularReflectionMapping;
  panoTex.colorSpace = THREE.SRGBColorSpace;
  szene.environment = pmrem.fromEquirectangular(panoTex).texture;
  szene.environmentIntensity = 0.1;

  // schwaches kühles Licht von vorn, damit der Stein zwischen den Blitzen lesbar bleibt
  const vorn = new THREE.DirectionalLight(0x8fa6c0, 0.5);
  vorn.position.set(6, 8, 30);
  szene.add(vorn);
  const mond = new THREE.DirectionalLight(0x7d93b0, 0.5);
  mond.position.set(-20, 30, 40);
  szene.add(mond);
  const blitzLicht = new THREE.DirectionalLight(0xdfe6ff, 0);
  blitzLicht.position.set(0, 60, -120);
  szene.add(blitzLicht);
  const blitzFront = new THREE.DirectionalLight(0xc8d4ff, 0);
  blitzFront.position.set(-30, 40, 60);
  szene.add(blitzFront);
  const laterne = new THREE.PointLight(0xff9a4a, 30, 60, 1.6);
  laterne.position.set(-24, 3, -40);
  szene.add(laterne);

  // ------------------------------------------------ Blitze
  const blitzMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uStaerke: { value: 0 } },
    vertexShader: /* glsl */ `attribute float aQuer; varying float vQ; void main(){ vQ = aQuer; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // k nie negativ werden lassen: pow() mit negativer Basis gibt auf dem iPhone NaN (schwarze Blöcke im Bloom)
    fragmentShader: /* glsl */ `uniform float uStaerke; varying float vQ; void main(){ float k = clamp(1.0 - abs(vQ), 0.0, 1.0); gl_FragColor = vec4(vec3(2.5, 2.7, 3.6) * k * sqrt(k) * uStaerke, 1.0); }`,
  });
  const blitzMeshes = [...BLITZE, { t: SCHLUSS, x: 3, staerke: 1.6 }].map((b) => {
    const m = new THREE.Mesh(blitzGeometrie(new THREE.Vector3(b.x, 120, -170), new THREE.Vector3(b.x + (rnd() - 0.5) * 30, 14, -170), rnd), blitzMat.clone());
    m.visible = false;
    szene.add(m);
    return m;
  });

  // ------------------------------------------------ Regen
  const N = 5000;
  const rPos = new Float32Array(N * 2 * 3);
  const rEnde = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 90, y = rnd() * 60, z = -40 + rnd() * 75;
    rPos.set([x, y, z, x, y, z], i * 6);
    rEnde.set([0, 1], i * 2);
  }
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  rGeo.setAttribute('aEnde', new THREE.BufferAttribute(rEnde, 1));
  const regen = new THREE.LineSegments(rGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uZeit: zeitU, uBlitz: blitzU, uRiss: rissU.uRiss },
    vertexShader: /* glsl */ `
      attribute float aEnde; uniform float uZeit; varying float vE; varying float vTiefe;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uZeit * 40.0, 60.0) - 1.0;
        p.x += (p.y - 30.0) * 0.1;
        p.y += aEnde * 1.4; p.x -= aEnde * 0.14;
        vE = aEnde;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vTiefe = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uBlitz; uniform float uRiss; varying float vE; varying float vTiefe;
      void main() {
        float a = (0.07 + uBlitz * 0.4 + uRiss * 0.06) * smoothstep(0.0, 0.6, vE) * smoothstep(90.0, 6.0, vTiefe) * smoothstep(0.5, 2.5, vTiefe);
        gl_FragColor = vec4(vec3(0.7, 0.8, 0.95) * a, 1.0);
      }`,
  }));
  regen.frustumCulled = false;
  szene.add(regen);

  // ------------------------------------------------ Lagune: Spiegelung, Regentropfen-Ringe
  const spiegelZiel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const wasserU = { uSpiegel: { value: spiegelZiel.texture }, uZeit: zeitU, uSchirm: { value: new THREE.Vector2(1, 1) }, uBlitz: blitzU, uRiss: rissU.uRiss };
  const wasser = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
    uniforms: wasserU,
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSpiegel; uniform float uZeit; uniform vec2 uSchirm; uniform float uBlitz; uniform float uRiss; varying vec3 vW;
      ${NOISE}
      // Ringe von Regentropfen: je Zelle ein Tropfen mit eigener Phase
      vec2 ringe(vec2 p) {
        vec2 st = vec2(0.0);
        for (int k = 0; k < 2; k++) {
          vec2 q = p * (k == 0 ? 1.3 : 2.1) + float(k) * 7.3;
          vec2 id = floor(q), f = fract(q) - 0.5;
          vec2 mitte = vec2(ihash(id), ihash(id + 3.7)) - 0.5;
          vec2 d = f - mitte * 0.6;
          float phase = fract(uZeit * 1.1 + ihash(id + 9.1));
          float r = length(d);
          float welle = sin((r - phase * 0.5) * 60.0) * smoothstep(0.08, 0.0, abs(r - phase * 0.5)) * (1.0 - phase);
          st += normalize(d + 0.0001) * welle;
        }
        return st;
      }
      void main() {
        vec2 p = vW.xz;
        float a = ifbm(p * 0.25 + vec2(uZeit * 0.2, uZeit * 0.1));
        vec2 stoer = (vec2(a, ifbm(p * 0.6 - uZeit * 0.15)) - 0.5) * 0.03 + ringe(p) * 0.006;
        vec3 spiegel = texture2D(uSpiegel, gl_FragCoord.xy / uSchirm + stoer).rgb;
        vec3 blick = normalize(cameraPosition - vW);
        float fres = 0.3 + 0.7 * pow(1.0 - max(blick.y, 0.0), 5.0);
        vec3 c = mix(vec3(0.004, 0.006, 0.008), spiegel, fres);
        c += vec3(0.5, 0.6, 0.75) * uBlitz * 0.06;
        float dist = length(cameraPosition - vW);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  wasser.rotation.x = -Math.PI / 2;
  szene.add(wasser);

  // Dunst über dem Wasser
  const nebel = new THREE.Mesh(new THREE.PlaneGeometry(260, 14), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uZeit: zeitU, uBlitz: blitzU },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uZeit; uniform float uBlitz; varying vec2 vUv; ${NOISE}
      void main(){ float n = ifbm(vec2(vUv.x * 10.0 + uZeit * 0.1, vUv.y * 2.0)); float a = smoothstep(0.3, 0.8, n) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.3, vUv.y);
        gl_FragColor = vec4(vec3(0.03, 0.04, 0.05) + vec3(0.4, 0.45, 0.55) * uBlitz, a * 0.7); }`,
  }));
  nebel.position.set(0, 3, LOGO_Z - 18);
  szene.add(nebel);

  // ------------------------------------------------ Nachbearbeitung
  const ziel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, ziel);
  composer.addPass(new RenderPass(szene, kamera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const look = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uZeit: zeitU, uSchirm: { value: new THREE.Vector2(1, 1) }, uWeiss: { value: 0 }, uAuf: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uZeit; uniform vec2 uSchirm; uniform float uWeiss; uniform float uAuf; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c += vec3(-0.01, 0.006, 0.012) * (1.0 - l);
        float vig = smoothstep(1.2, 0.25, length((vUv - 0.5) * vec2(uSchirm.x / uSchirm.y, 1.0)));
        c *= mix(0.25, 1.0, vig) * uAuf;
        c += (h(vUv * uSchirm + fract(uZeit * 7.13) * 100.0) - 0.5) * 0.045;
        c = mix(c, vec3(0.98, 0.99, 1.0), uWeiss);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  composer.addPass(look);

  const groesse = () => {
    const b = window.innerWidth, h = window.innerHeight;
    renderer.setSize(b, h, false);
    composer.setSize(b, h);
    const pr = renderer.getPixelRatio();
    bloom.resolution.set(b * pr, h * pr);
    look.uniforms.uSchirm.value.set(b * pr, h * pr);
    wasserU.uSchirm.value.set(b * pr, h * pr);
    spiegelZiel.setSize(Math.round(b * pr * 0.5), Math.round(h * pr * 0.5));
    kamera.aspect = b / h;
    kamera.updateProjectionMatrix();
  };
  groesse();
  window.addEventListener('resize', groesse);

  // Abstand, in dem das Logo am Ende die Breite füllt (hochkant weiter weg)
  const endAbstand = () => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2));
    return Math.max((logoHoehe * 3.2) / (2 * tanV), (BREITE * 1.6) / (2 * tanV * kamera.aspect));
  };

  return new Promise((fertig) => {
    let t = 0;
    let letzte = performance.now();
    let aus = false;
    const ereignis = new Set();
    const einmal = (n) => (ereignis.has(n) ? false : (ereignis.add(n), true));
    const ueberspringen = () => { if (ueberspringbar && t < SCHLUSS - 0.3) t = SCHLUSS - 0.3; };
    window.addEventListener('pointerdown', ueberspringen);
    window.addEventListener('keydown', ueberspringen);
    const ziel3 = new THREE.Vector3();

    function bild() {
      const jetzt = performance.now();
      const dt = film ? 1 / 30 : Math.min(0.05, (jetzt - letzte) / 1000);
      letzte = jetzt;
      t += dt;
      zeitU.value = t;

      if (klang) {
        if (einmal('start')) { klang.bettStart('regen', 0.6, { ein: 0.8, tiefpass: 9000 }); klang.stinger(); }
        if (t > BLITZE[0].t - 0.02 && einmal('d1')) klang.donner(1, 0.8);
        if (t > BLITZE[1].t - 0.42 && einmal('d2')) klang.donner(2, 1);
      }

      // Blitze: kurzes Flackern
      let hell = 0;
      let blitzX = 0.5;
      BLITZE.forEach((b, i) => {
        let s = 0;
        for (const f of b.flackern) { const d = t - b.t - f; if (d > 0) s = Math.max(s, Math.exp(-d * 18)); }
        if (t > b.t + 0.6) s = 0;
        blitzMeshes[i].visible = s > 0.05;
        blitzMeshes[i].material.uniforms.uStaerke.value = s * b.staerke;
        if (s * b.staerke > hell) { hell = s * b.staerke; blitzX = 0.5 - b.x / (radius * bogen); }
      });
      const ds = t - SCHLUSS;
      const schluss = ds > 0 ? Math.min(1, ds / 0.06) : 0;
      blitzMeshes[BLITZE.length].visible = ds > 0;
      blitzMeshes[BLITZE.length].material.uniforms.uStaerke.value = schluss * 1.8;
      hell = Math.max(hell, schluss * 1.4);
      blitzU.value = hell;
      talMat.uniforms.uBlitzX.value = blitzX;
      blitzLicht.intensity = hell * 7;
      blitzFront.intensity = hell * 2.2;
      szene.environmentIntensity = 0.1 + hell * 0.9;

      // Licht bricht durch die Risse: ab 3,6 s, im Schlussblitz voll
      const riss = THREE.MathUtils.smoothstep(t, 3.6, 6.2);
      rissU.uRiss.value = riss;
      logoMat.emissiveIntensity = 1;
      rissLicht.intensity = riss * riss * 50;

      // Kamera: gleitet tief über die Lagune auf das Relikt zu
      const k = THREE.MathUtils.smootherstep(t / INTRO_DAUER, 0, 1);
      const d = endAbstand();
      ziel3.set(0, logoHoehe * 0.5, LOGO_Z);
      kamera.position.set(Math.sin(t * 0.4) * 0.6, 0.9 + k * 0.9 + Math.sin(t * 1.3) * 0.05, LOGO_Z + d + 22 * (1 - k));
      kamera.lookAt(ziel3.x, ziel3.y + 0.6 * (1 - k), ziel3.z);
      kamera.rotateZ(Math.sin(t * 0.7) * 0.006);

      look.uniforms.uAuf.value = Math.min(1, t / 0.9);
      look.uniforms.uWeiss.value = ds > 0 ? Math.min(1, ds / 0.18) : 0;

      // Spiegelung in der Lagune
      wasser.visible = false; nebel.visible = false; regen.visible = false;
      szene.scale.y = -1;
      szene.updateMatrixWorld();
      renderer.setRenderTarget(spiegelZiel);
      renderer.clear();
      renderer.render(szene, kamera);
      renderer.setRenderTarget(null);
      szene.scale.y = 1;
      wasser.visible = true; nebel.visible = true; regen.visible = true;
      composer.render();

      if (ds > 0.22 && !aus) {
        aus = true;
        window.removeEventListener('pointerdown', ueberspringen);
        window.removeEventListener('keydown', ueberspringen);
        window.removeEventListener('resize', groesse);
        klang?.bettStop('regen', 2.5);
        // aufräumen: der Renderer gehört danach wieder dem Spiel
        szene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
        [tal, panoTex, stein.farbe, stein.relief, stein.riss].forEach((x) => x.dispose());
        szene.environment.dispose(); pmrem.dispose();
        composer.dispose(); ziel.dispose(); spiegelZiel.dispose();
        fertig();
        return;
      }
      if (film) window.__introBild = bild; else requestAnimationFrame(bild);
    }
    if (film) window.__introBild = bild; else requestAnimationFrame(bild);
  });
}
