// Das Bauchfenster: wabernder dunkler Nebel, aus dem die Antwort aufsteigt.
import * as THREE from 'three';

const SCHRIFT = '"Cinzel", "Trajan Pro", "Times New Roman", serif';

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform float uZeit;
  uniform float uWirbel;
  uniform float uAuftauchen;
  uniform float uGlimmen;
  uniform sampler2D uText;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  void main() {
    vec2 uv = vec2(1.0 - vUv.x, vUv.y);
    vec2 p = uv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);

    // Strudel: innen dreht es schneller
    float dreh = uZeit * (0.12 + uWirbel * 0.9) + uWirbel * 2.2 * (1.0 - r) * (1.0 - r);
    float aw = a + dreh;
    vec2 q = vec2(cos(aw), sin(aw)) * r;
    float n1 = fbm(q * 2.4 + vec2(uZeit * 0.05, -uZeit * 0.04));
    float n2 = fbm(q * 4.6 - vec2(uZeit * 0.09) + n1 * 1.7);
    float nebel = smoothstep(0.25, 0.95, n2);

    vec3 tief = vec3(0.004, 0.0, 0.012);
    vec3 violett = vec3(0.16, 0.03, 0.26);
    vec3 tuerkis = vec3(0.02, 0.12, 0.14);
    vec3 farbe = mix(tief, violett, nebel);
    farbe = mix(farbe, tuerkis, smoothstep(0.55, 0.95, n1) * 0.55);
    farbe *= 0.5 + uGlimmen * 0.7 + uWirbel * 0.5;
    farbe *= mix(0.35, 1.0, smoothstep(1.02, 0.55, r)); // Rand dunkler = Tiefe

    // Antwort steigt aus der Tiefe auf
    float k = clamp(uAuftauchen, 0.0, 1.0);
    float ke = 1.0 - pow(1.0 - k, 3.0);
    float skala = mix(0.45, 1.0, ke);
    vec2 tuv = (uv - 0.5) / skala + 0.5;
    tuv.y += (1.0 - ke) * 0.12;
    tuv += (vec2(n1, n2) - 0.5) * 0.06 * (1.0 - ke);
    float t = texture2D(uText, tuv).a;
    if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) t = 0.0;
    float sicht = smoothstep(0.0, 0.6, k * 1.35 - (1.0 - n2) * 0.45);
    t *= sicht * mix(0.72, 1.0, nebel);
    vec3 gold = vec3(1.0, 0.6, 0.16);
    farbe = mix(farbe, gold * (1.25 + 0.8 * (1.0 - ke)), clamp(t, 0.0, 1.0));

    // Glas: Fresnel-Rand und weicher Glanzpunkt
    vec3 V = normalize(-vViewPos);
    float fres = pow(1.0 - max(dot(normalize(vNormalV), V), 0.0), 3.0);
    farbe += vec3(0.25, 0.2, 0.32) * fres * 0.6;
    float glanz = smoothstep(0.22, 0.0, length((uv - vec2(0.33, 0.74)) * vec2(1.0, 1.7)));
    farbe += vec3(1.0, 0.95, 0.9) * glanz * 0.22;

    gl_FragColor = vec4(farbe, 1.0);
  }
`;

export function baueBauch() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uZeit: { value: 0 },
      uWirbel: { value: 0 },
      uAuftauchen: { value: 0 },
      uGlimmen: { value: 0.2 },
      uText: { value: tex },
    },
  });

  function schreibe(text) {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 1024, 1024);
    const radius = 372;
    const woerter = text.split(/\s+/);
    let passend = null;
    for (let groesse = 150; groesse >= 46; groesse -= 4) {
      g.font = `700 ${groesse}px ${SCHRIFT}`;
      const zeilenH = groesse * 1.12;
      // Zeilenzahl schätzen, dann prüfen, ob alles in den Kreis passt
      for (let n = 1; n <= 8; n++) {
        const hoehe = n * zeilenH;
        if (hoehe > radius * 1.7) break;
        const zeilen = [];
        let wi = 0;
        let ok = true;
        for (let i = 0; i < n && wi < woerter.length; i++) {
          const y = -hoehe / 2 + zeilenH * (i + 0.5);
          const rand = Math.max(Math.abs(y - zeilenH * 0.5), Math.abs(y + zeilenH * 0.5));
          const breite = 2 * Math.sqrt(Math.max(radius * radius - rand * rand, 0)) * 0.92;
          let zeile = woerter[wi];
          if (g.measureText(zeile).width > breite) { ok = false; break; }
          wi++;
          while (wi < woerter.length && g.measureText(`${zeile} ${woerter[wi]}`).width <= breite) {
            zeile += ` ${woerter[wi]}`;
            wi++;
          }
          zeilen.push(zeile);
        }
        if (ok && wi >= woerter.length) { passend = { groesse, zeilen, zeilenH }; break; }
      }
      if (passend) break;
    }
    if (!passend) {
      g.font = `700 46px ${SCHRIFT}`;
      passend = { groesse: 46, zeilen: [text], zeilenH: 52 };
    }
    g.font = `700 ${passend.groesse}px ${SCHRIFT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(255,255,255,0.6)';
    g.shadowBlur = passend.groesse * 0.06;
    const start = 512 - (passend.zeilen.length * passend.zeilenH) / 2 + passend.zeilenH / 2;
    passend.zeilen.forEach((z, i) => g.fillText(z, 512, start + i * passend.zeilenH + passend.groesse * 0.04));
    tex.needsUpdate = true;
  }

  return { material, schreibe };
}
