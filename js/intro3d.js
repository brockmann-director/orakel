// Studio-Intro (Fassung 3): Gewitternacht im Tal, das 27km-Logo steht als massives Metall zwischen den Bergen.
// Blitze erhellen es, ein goldenes Licht streicht darüber, der letzte Blitz blendet weiß ins Spiel.
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

function blitzGeometrie(start, ende, rnd) {
  // Mittelpunkt-Verschiebung, dazu ein, zwei Äste; als flaches Band
  let pkt = [start, ende];
  let versatz = start.distanceTo(ende) * 0.22;
  for (let s = 0; s < 6; s++) {
    const neu = [pkt[0]];
    for (let i = 1; i < pkt.length; i++) {
      const a = pkt[i - 1], b = pkt[i];
      const m = a.clone().lerp(b, 0.5);
      m.x += (rnd() - 0.5) * versatz;
      m.z += (rnd() - 0.5) * versatz * 0.3;
      neu.push(m, b);
    }
    pkt = neu;
    versatz *= 0.55;
  }
  const aeste = [];
  for (let k = 0; k < 2; k++) {
    const i = Math.floor(pkt.length * (0.25 + rnd() * 0.4));
    const von = pkt[i];
    const nach = von.clone().add(new THREE.Vector3((rnd() - 0.5) * 30, -18 - rnd() * 14, 0));
    let ast = [von, nach];
    let v = 6;
    for (let s = 0; s < 4; s++) {
      const neu = [ast[0]];
      for (let j = 1; j < ast.length; j++) { const m = ast[j - 1].clone().lerp(ast[j], 0.5); m.x += (rnd() - 0.5) * v; neu.push(m, ast[j]); }
      ast = neu; v *= 0.55;
    }
    aeste.push(ast);
  }
  const pos = [];
  const alpha = [];
  const band = (linie, breite) => {
    for (let i = 1; i < linie.length; i++) {
      const a = linie[i - 1], b = linie[i];
      const d = b.clone().sub(a).normalize();
      const n = new THREE.Vector3(-d.y, d.x, 0).multiplyScalar(breite);
      const q = [a.clone().add(n), a.clone().sub(n), b.clone().add(n), b.clone().sub(n)];
      pos.push(...q[0].toArray(), ...q[1].toArray(), ...q[2].toArray(), ...q[2].toArray(), ...q[1].toArray(), ...q[3].toArray());
      alpha.push(1, -1, 1, 1, -1, -1);
    }
  };
  band(pkt, 0.55);
  aeste.forEach((a) => band(a, 0.3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aQuer', new THREE.Float32BufferAttribute(alpha, 1));
  return g;
}

export async function spieleIntro3D(renderer, { ueberspringbar = false, klang = null, film = false } = {}) {
  const daten = await ladeLogo3D();
  const szene = new THREE.Scene();
  szene.background = new THREE.Color(0x020306);
  const kamera = new THREE.PerspectiveCamera(32, 1, 0.5, 900);
  const zeitU = { value: 0 };
  const blitzU = { value: 0 };

  // Tal bei Nacht
  const tal = await new THREE.TextureLoader().loadAsync('assets/3d/tal.jpg');
  tal.colorSpace = THREE.NoColorSpace;
  const talBreite = tal.image.width / tal.image.height;
  const radius = 220, bogen = 1.6, talHoehe = (radius * bogen) / talBreite;
  const talMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, talHoehe, 64, 1, true, Math.PI - bogen / 2, bogen),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTal: { value: tal }, uZeit: zeitU, uBlitz: blitzU, uBlitzX: { value: 0.5 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTal; uniform float uZeit; uniform float uBlitz; uniform float uBlitzX; varying vec2 vUv;
        ${NOISE}
        void main() {
          vec2 uv = vec2(1.0 - vUv.x, vUv.y);
          vec3 c = pow(max(texture2D(uTal, uv, 1.5).rgb, 0.0), vec3(2.2));
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          vec3 nacht = mix(vec3(l), c, 0.35) * vec3(0.55, 0.65, 1.0) * 0.07;
          // Gewitterwolken ziehen über den Himmel
          float w = ifbm(vec2(uv.x * 3.0 + uZeit * 0.05, uv.y * 2.0 + uZeit * 0.02));
          nacht = mix(nacht, vec3(0.02, 0.025, 0.04), smoothstep(0.55, 1.0, uv.y) * w);
          // Blitz: Berge als Silhouette gegen den hellen Himmel, nahe am Einschlag heller
          float naehe = exp(-abs(uv.x - uBlitzX) * 3.0);
          vec3 hell = mix(vec3(l), c, 0.2) * vec3(0.75, 0.82, 1.0) * (0.35 + 0.9 * naehe) + vec3(0.25, 0.28, 0.38) * smoothstep(0.45, 1.0, uv.y) * (0.6 + w);
          c = nacht + hell * uBlitz;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  talMesh.position.y = talHoehe * 0.5 - 70;
  szene.add(talMesh);

  // Logo: aus den Umrissen extrudiert, massives gebürstetes Metall
  const formen = daten.map((ringe) => {
    const s = new THREE.Shape(ringe[0].map(([x, y]) => new THREE.Vector2(x, y)));
    for (let i = 1; i < ringe.length; i++) s.holes.push(new THREE.Path(ringe[i].map(([x, y]) => new THREE.Vector2(x, y))));
    return s;
  });
  const logoGeo = new THREE.ExtrudeGeometry(formen, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.006, bevelSegments: 3, curveSegments: 4 });
  logoGeo.center();
  const logoMat = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  // goldener Glanz, der als Band über Kanten und Fasen wandert (wie bei Studio-Logos)
  const glanzU = { uGlanz: { value: -2 }, uGlanzStaerke: { value: 0 } };
  logoMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, glanzU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN; uniform float uGlanz; uniform float uGlanzStaerke;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float glanzD = (vObjPos.x + vObjPos.y * 0.45 - uGlanz) * 7.0;
        float glanzBand = exp(-glanzD * glanzD); // pow() mit negativer Basis ist auf dem iPhone NaN
        float kante = 1.0 - abs(normalize(vObjN).z);
        totalEmissiveRadiance += vec3(1.0, 0.6, 0.22) * glanzBand * (kante * 3.5 + 0.15) * uGlanzStaerke;`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = min(gl_FragColor.rgb, vec3(12.0));');
  };
  const logo = new THREE.Mesh(logoGeo, logoMat);
  const BREITE = 46;
  logo.scale.setScalar(BREITE);
  logo.position.set(0, 22, -10);
  szene.add(logo);

  // Spiegelungen: dunkles Panorama mit hellem Horizont (wird beim Blitz kräftiger)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const pano = document.createElement('canvas');
  pano.width = 1024; pano.height = 512;
  const pg = pano.getContext('2d');
  const gr = pg.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#2a3140'); gr.addColorStop(0.45, '#8892a8'); gr.addColorStop(0.55, '#1a1c22'); gr.addColorStop(1, '#050506');
  pg.fillStyle = gr; pg.fillRect(0, 0, 1024, 512);
  const panoTex = new THREE.CanvasTexture(pano);
  panoTex.mapping = THREE.EquirectangularReflectionMapping;
  panoTex.colorSpace = THREE.SRGBColorSpace;
  szene.environment = pmrem.fromEquirectangular(panoTex).texture;
  szene.environmentIntensity = 0.12;

  const mond = new THREE.DirectionalLight(0x8090c0, 0.6);
  mond.position.set(-20, 40, 60);
  szene.add(mond);
  const blitzLicht = new THREE.DirectionalLight(0xdfe6ff, 0);
  blitzLicht.position.set(0, 60, -80);
  szene.add(blitzLicht);
  const blitzFront = new THREE.DirectionalLight(0xc8d4ff, 0);
  blitzFront.position.set(-30, 50, 80);
  szene.add(blitzFront);
  // goldenes Streiflicht, das über die Kanten wandert
  const streif = new THREE.PointLight(0xffb060, 0, 70, 1.6);
  szene.add(streif);

  // Blitz-Bänder
  const blitzMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uStaerke: { value: 0 } },
    vertexShader: /* glsl */ `attribute float aQuer; varying float vQ; void main(){ vQ = aQuer; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uStaerke; varying float vQ; void main(){ float k = clamp(1.0 - abs(vQ), 0.0, 1.0); gl_FragColor = vec4(vec3(2.5, 2.7, 3.6) * k * sqrt(k) * uStaerke, 1.0); }`,
  });
  let zufall = 7;
  const rnd = () => { zufall = (zufall * 16807) % 2147483647; return zufall / 2147483647; };
  const blitzMeshes = [...BLITZE, { t: SCHLUSS, x: 4, staerke: 1.6 }].map((b) => {
    const m = new THREE.Mesh(blitzGeometrie(new THREE.Vector3(b.x, 120, -150), new THREE.Vector3(b.x + (rnd() - 0.5) * 30, 10, -150), rnd), blitzMat.clone());
    m.visible = false;
    szene.add(m);
    return m;
  });

  // Regen: kurze Striche, die durch einen Kasten um die Kamera fallen
  const N = 4200;
  const rPos = new Float32Array(N * 2 * 3);
  const rEnde = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 140, y = rnd() * 90, z = -20 + rnd() * 120;
    rPos.set([x, y, z, x, y, z], i * 6);
    rEnde.set([0, 1], i * 2);
  }
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  rGeo.setAttribute('aEnde', new THREE.BufferAttribute(rEnde, 1));
  const regenMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uZeit: zeitU, uBlitz: blitzU },
    vertexShader: /* glsl */ `
      attribute float aEnde; uniform float uZeit; varying float vE; varying float vTiefe;
      void main() {
        vec3 p = position;
        float fall = 55.0;
        p.y = mod(p.y - uZeit * fall, 90.0) - 5.0;
        p.x += (p.y - 40.0) * 0.12;
        p.y += aEnde * 2.2; p.x -= aEnde * 0.26;
        vE = aEnde;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vTiefe = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uBlitz; varying float vE; varying float vTiefe;
      void main() {
        float a = (0.09 + uBlitz * 0.5) * smoothstep(0.0, 0.6, vE) * smoothstep(160.0, 20.0, vTiefe);
        gl_FragColor = vec4(vec3(0.7, 0.78, 1.0) * a, 1.0);
      }`,
  });
  szene.add(new THREE.LineSegments(rGeo, regenMat));

  // Nebelbank im Tal
  const nebel = new THREE.Mesh(new THREE.PlaneGeometry(400, 40), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uZeit: zeitU, uBlitz: blitzU },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uZeit; uniform float uBlitz; varying vec2 vUv; ${NOISE}
      void main(){ float n = ifbm(vec2(vUv.x * 8.0 + uZeit * 0.08, vUv.y * 2.0)); float a = smoothstep(0.3, 0.8, n) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.4, vUv.y);
        gl_FragColor = vec4(vec3(0.05, 0.06, 0.08) + vec3(0.5, 0.55, 0.7) * uBlitz, a * 0.85); }`,
  }));
  nebel.position.set(0, 4, 0);
  szene.add(nebel);

  // Nachbearbeitung
  const ziel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, ziel);
  composer.addPass(new RenderPass(szene, kamera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 0.75);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const look = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uZeit: zeitU, uSchirm: { value: new THREE.Vector2(1, 1) }, uWeiss: { value: 0 }, uAuf: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uZeit; uniform vec2 uSchirm; uniform float uWeiss; uniform float uAuf; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
        float vig = smoothstep(1.2, 0.3, length((vUv - 0.5) * vec2(uSchirm.x / uSchirm.y, 1.0)));
        c *= mix(0.35, 1.0, vig) * uAuf;
        c += (h(vUv * uSchirm + fract(uZeit * 7.13) * 100.0) - 0.5) * 0.04;
        c = mix(c, vec3(1.0, 0.98, 0.95), uWeiss);
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
    kamera.aspect = b / h;
    kamera.updateProjectionMatrix();
  };
  groesse();
  window.addEventListener('resize', groesse);

  // Kamera: so weit weg, dass das Logo auch hochkant gut passt
  const abstand = () => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2));
    return (BREITE * 0.62) / tanV;
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

    function bild() {
      const jetzt = performance.now();
      const dt = film ? 1 / 30 : Math.min(0.05, (jetzt - letzte) / 1000);
      letzte = jetzt;
      t += dt;
      zeitU.value = t;

      // Ton
      if (klang) {
        if (einmal('start')) { klang.bettStart('regen', 0.55, { ein: 0.8, tiefpass: 9000 }); klang.stinger(); }
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
        if (s * b.staerke > hell) { hell = s * b.staerke; blitzX = 0.5 - b.x / (radius * bogen) * 1.0; }
      });
      // großer Schlussblitz → weiß
      const ds = t - SCHLUSS;
      const schluss = ds > 0 ? Math.min(1, ds / 0.06) : 0;
      blitzMeshes[BLITZE.length].visible = ds > 0;
      blitzMeshes[BLITZE.length].material.uniforms.uStaerke.value = schluss * 1.8;
      hell = Math.max(hell, schluss * 1.4);
      blitzU.value = hell;
      talMesh.material.uniforms.uBlitzX.value = blitzX;
      blitzLicht.intensity = hell * 9;
      blitzFront.intensity = hell * 3.5;
      szene.environmentIntensity = 0.12 + hell * 1.2;

      // Logo und Kamera
      const k = t / INTRO_DAUER;
      const d = abstand();
      // hochkant: Kamera bleibt, das Logo wird kleiner (sonst sieht man die Ränder des Tals)
      const sichtbar = 2 * d * Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2)) * kamera.aspect;
      logo.scale.setScalar(Math.min(BREITE, sichtbar / 1.18));
      kamera.position.set(Math.sin(t * 0.25) * 1.5, 20 + k * 2.5, d * (1.18 - 0.16 * k));
      kamera.lookAt(0, 22 + k * 0.6, -10);
      logo.rotation.y = -0.18 + k * 0.26;
      // goldenes Streiflicht ab 3,3 s von links nach rechts
      const sk = THREE.MathUtils.clamp((t - 3.3) / 2.6, 0, 1);
      glanzU.uGlanz.value = -0.75 + sk * 1.6;
      glanzU.uGlanzStaerke.value = Math.sin(sk * Math.PI);
      streif.position.set((-0.9 + sk * 1.8) * logo.scale.x, 36, 30);
      streif.intensity = Math.sin(sk * Math.PI) * 60;

      look.uniforms.uAuf.value = Math.min(1, t / 0.9);
      look.uniforms.uWeiss.value = ds > 0 ? Math.min(1, ds / 0.18) : 0;
      composer.render();

      if (ds > 0.22 && !aus) {
        aus = true;
        window.removeEventListener('pointerdown', ueberspringen);
        window.removeEventListener('keydown', ueberspringen);
        window.removeEventListener('resize', groesse);
        klang?.bettStop('regen', 2.5);
        // aufräumen: der Renderer gehört danach wieder dem Spiel
        szene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
        tal.dispose(); panoTex.dispose(); szene.environment.dispose(); pmrem.dispose();
        composer.dispose(); ziel.dispose();
        fertig();
        return;
      }
      if (film) window.__introBild = bild; else requestAnimationFrame(bild);
    }
    if (film) window.__introBild = bild; else requestAnimationFrame(bild);
  });
}
