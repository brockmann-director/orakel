// Studio-Ident: knapp vier Sekunden. Ein Licht fährt über das 27km-Logo aus
// gebürstetem Metall, Funkenstaub im Strahl, dann Schwarz.
import * as THREE from 'three';

export const IDENT_DAUER = 3.9;

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uLogo;
  uniform vec2 uSchirm;
  uniform float uT;
  uniform float uAsp;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float alpha(vec2 uv, float b) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    return texture2D(uLogo, uv, b).a;
  }
  float easeInOut(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5; }

  void main() {
    float t = uT;
    vec2 p = (vUv - 0.5) * uSchirm;
    float L = min(uSchirm.x * 0.6, uSchirm.y * 0.36 * uAsp) * (1.0 + 0.045 * t / 3.9);
    vec2 luv = p / vec2(L, L / uAsp) + 0.5;

    // Licht fährt von links nach rechts
    float fahrt = easeInOut((t - 0.18) / 2.1);
    float lx = mix(-0.25, 1.22, fahrt);
    float an = smoothstep(0.16, 0.26, t);
    float blitz = an * exp(-max(t - 0.2, 0.0) * 7.0);
    float licht = an * (1.0 - 0.55 * smoothstep(2.2, 2.9, t));

    // Logo als geprägtes Metall
    float al = alpha(luv, 0.0);
    float e = 3.0 / L;
    vec2 ex = vec2(e, 0.0), ey = vec2(0.0, e * uAsp);
    float hx = alpha(luv + ex, 3.0) - alpha(luv - ex, 3.0);
    float hy = alpha(luv + ey, 3.0) - alpha(luv - ey, 3.0);
    vec3 n = normalize(vec3(-hx * 1.4, -hy * 1.4, 1.0));
    vec3 P = vec3(luv.x, luv.y / uAsp, 0.0);
    vec3 Lp = vec3(lx, 0.62 / uAsp, 0.22);
    vec3 Ld = normalize(Lp - P);
    float dist = length(Lp - P);
    float fall = 1.0 / (1.0 + dist * dist * 22.0);
    vec3 H = normalize(Ld + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 70.0);
    float diff = max(dot(n, Ld), 0.0);
    float strich = noise(vec2(luv.x * 5.0, luv.y * 700.0)) * 0.6 + noise(vec2(luv.x * 30.0, luv.y * 2600.0)) * 0.4;
    vec3 metall = vec3(0.93, 0.76, 0.5);
    float grund = 0.035 + 0.2 * smoothstep(1.7, 2.7, t);
    float kante = clamp(length(vec2(hx, hy)) * 1.5, 0.0, 1.0);
    vec3 logo = metall * (grund * (0.6 + 0.7 * strich) + diff * fall * 2.4 * licht * (0.7 + 0.6 * strich));
    logo += vec3(1.0, 0.93, 0.82) * spec * fall * 7.0 * licht;
    logo += metall * kante * (fall * 2.6 * licht + grund * 1.5);
    // Glanzlinie, die einmal schräg drüberläuft
    float g = (t - 2.45) * 1.7;
    float diag = luv.x + luv.y * 0.3 - g;
    logo += vec3(1.0, 0.95, 0.86) * exp(-diag * diag * 1400.0) * step(2.4, t) * 1.4;
    vec3 farbe = logo * al;

    // Lichtquelle auf dem Schirm, Lichthof und anamorphotischer Streifen
    vec2 lpx = vec2((lx - 0.5) * L, (0.62 - 0.5) * L / uAsp + L / uAsp * 0.08);
    vec2 d = p - lpx;
    float hof = exp(-length(d) / (uSchirm.y * 0.16));
    float dunst = noise(p * 0.006 + vec2(t * 0.08, -t * 0.03)) * 0.6 + noise(p * 0.017 - t * 0.05) * 0.4;
    float streifen = exp(-abs(d.y) / (uSchirm.y * 0.0035)) * exp(-abs(d.x) / (uSchirm.x * 0.3));
    vec3 warm = vec3(1.0, 0.72, 0.42);
    farbe += warm * hof * (0.08 + 0.16 * dunst) * licht * (1.0 - al);
    farbe += vec3(1.0, 0.86, 0.68) * streifen * (0.35 * licht + 1.6 * blitz);
    farbe += vec3(1.0, 0.9, 0.75) * exp(-length(d) / (uSchirm.y * 0.025)) * (0.5 * licht + 2.0 * blitz) * (1.0 - al * 0.7);

    // Funkenstaub im Strahl
    for (int i = 0; i < 2; i++) {
      float gr = i == 0 ? 26.0 : 41.0;
      vec2 q = (p + vec2(t * 9.0, t * (14.0 + float(i) * 9.0))) / gr;
      vec2 zelle = floor(q);
      vec2 f = fract(q) - 0.5;
      float h = hash(zelle + float(i) * 17.0);
      vec2 ort = vec2(hash(zelle + 3.1), hash(zelle + 9.7)) - 0.5;
      float punkt = smoothstep(0.09, 0.0, length(f - ort * 0.7)) * step(0.93, h);
      farbe += warm * punkt * hof * 1.6 * licht;
    }

    // Ausblenden, Vignette, Korn
    farbe *= 1.0 - smoothstep(3.15, 3.85, t);
    farbe *= smoothstep(1.3, 0.3, length((vUv - 0.5) * vec2(uSchirm.x / uSchirm.y, 1.0)));
    farbe += (hash(vUv * uSchirm + fract(t * 7.3) * 91.0) - 0.5) * 0.022;
    gl_FragColor = vec4(max(farbe, 0.0), 1.0);
  }
`;

let logoTex = null;
export function ladeLogo() {
  if (logoTex) return logoTex;
  logoTex = new Promise((ok) => {
    new THREE.TextureLoader().load('assets/27km-logo-2k.png', (t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      ok(t);
    }, undefined, () => ok(null));
  });
  return logoTex;
}

// Spielt das Ident auf dem gegebenen Renderer ab. onTon wird beim Start gerufen.
export async function spieleIdent(renderer, { ueberspringbar = false, onTon } = {}) {
  const tex = await ladeLogo();
  if (!tex) return;
  const uniforms = {
    uLogo: { value: tex },
    uSchirm: { value: new THREE.Vector2() },
    uT: { value: 0 },
    uAsp: { value: tex.image.width / tex.image.height },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false });
  const szene = new THREE.Scene();
  szene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const kamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const reduziert = matchMedia('(prefers-reduced-motion: reduce)').matches;

  await new Promise((fertig) => {
    let start = null;
    let ende = IDENT_DAUER;
    const weg = () => { if (ueberspringbar) ende = Math.min(ende, (performance.now() - start) / 1000 + 0.35); };
    window.addEventListener('pointerdown', weg);
    window.addEventListener('keydown', weg);
    if (onTon) onTon();
    function bild(jetzt) {
      if (start === null) start = jetzt;
      let t = (jetzt - start) / 1000;
      if (reduziert) t = Math.max(t, 2.6); // ohne Lichtfahrt, nur das fertige Logo
      const b = renderer.getDrawingBufferSize(new THREE.Vector2());
      uniforms.uSchirm.value.copy(b);
      uniforms.uT.value = t >= ende - 0.35 && ende < IDENT_DAUER ? 3.15 + (t - (ende - 0.35)) * 2 : t;
      renderer.render(szene, kamera);
      if (t < ende) requestAnimationFrame(bild);
      else {
        window.removeEventListener('pointerdown', weg);
        window.removeEventListener('keydown', weg);
        material.dispose();
        fertig();
      }
    }
    requestAnimationFrame(bild);
  });
}
