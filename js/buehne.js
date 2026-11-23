// Die Bühne: das Katzen-Video (oder Standbild) bildschirmfüllend, darüber
// lebendiger Nebel im Bauch-Portal, die aufsteigende Antwort, Licht und Korn.
import * as THREE from 'three';

const SCHRIFT = '"Cinzel", "Trajan Pro", "Times New Roman", serif';

// Lage des Portals im Bild (Anteile von Breite/Höhe, y von oben).
export const PORTAL = { x: 0.487, y: 0.559, rx: 0.1927, ry: 0.1077 };

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uMedium;
  uniform vec2 uMedGr;      // Größe des Mediums in px
  uniform vec2 uSchirm;     // Zeichenfläche in px
  uniform float uUeber;     // leichtes Überfüllen
  uniform float uSeite;     // 1 = Bild schmaler als der Schirm (Seiten weich auslaufen lassen)
  uniform float uZoom;
  uniform float uSchwenk;   // 0 = Bildmitte, 1 = Portal in der Mitte
  uniform vec2 uPortalC;    // px, y von oben
  uniform vec2 uPortalR;    // px
  uniform float uZeit;
  uniform float uWirbel;
  uniform float uAuftauchen;
  uniform float uPortal;    // eigener Nebel über dem Video
  uniform float uGlimmen;   // Leuchten um das Portal
  uniform float uHell;      // Gesamthelligkeit (Ein-/Ausblenden, Fokus)
  uniform float uUmgebung;  // Umgebung abdunkeln beim Ritual
  uniform sampler2D uText;
  varying vec2 vUv;

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
  vec3 medium(vec2 uv) { return texture2D(uMedium, vec2(uv.x, 1.0 - uv.y)).rgb; }

  void main() {
    vec2 sp = (vUv - 0.5) * uSchirm;
    sp.y = -sp.y;
    float s = min(uSchirm.x / uMedGr.x, uSchirm.y / uMedGr.y) * uUeber * uZoom;
    vec2 mitte = mix(uMedGr * 0.5, uPortalC, uSchwenk);
    vec2 px = mitte + sp / s;
    vec2 uv = px / uMedGr;

    // Hintergrund: dieselbe Szene bildfüllend, stark weichgezeichnet und gedimmt
    float sc = max(uSchirm.x / uMedGr.x, uSchirm.y / uMedGr.y) * 1.08;
    vec2 cuvH = (uMedGr * 0.5 + sp / sc) / uMedGr;
    vec3 fuell = vec3(0.0);
    for (int i = 0; i < 28; i++) {
      float a = float(i) * 2.39996;
      float rr = sqrt((float(i) + 0.5) / 28.0) * 0.2;
      fuell += medium(clamp(cuvH + vec2(cos(a), sin(a) * 0.56) * rr, 0.001, 0.999));
    }
    fuell /= 28.0;
    float randNebel = fbm(vec2(vUv.x * 3.0 + uZeit * 0.02, vUv.y * 2.0 - uZeit * 0.012));
    fuell = fuell * 0.34 + vec3(0.36, 0.36, 0.42) * randNebel * 0.08;
    vec2 cuv = clamp(uv, 0.0, 1.0);
    vec2 e = min(uv, 1.0 - uv) * uMedGr;
    float kante = smoothstep(0.0, uMedGr.y * 0.05, e.y) * mix(1.0, smoothstep(0.0, uMedGr.x * 0.1, e.x), uSeite);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) kante = 0.0;
    vec3 farbe = mix(fuell, medium(cuv), kante);

    // Portal
    vec2 d = (px - uPortalC) / uPortalR;
    float r = length(d);
    float maske = smoothstep(1.0, 0.955, r);

    // Umgebung zurücknehmen, damit das Portal leuchtet
    farbe *= mix(1.0, 0.55, uUmgebung * smoothstep(1.05, 2.6, r));

    // Licht, das aus dem Portal auf die Keramik fällt
    float spill = smoothstep(2.1, 1.0, r) * (1.0 - maske);
    vec3 violettLicht = vec3(0.55, 0.22, 1.0);
    vec3 goldLicht = vec3(1.0, 0.62, 0.28);
    farbe += mix(violettLicht, goldLicht, uAuftauchen * 0.7) * spill * spill * (uGlimmen * 0.35 + uAuftauchen * 0.25);

    // eigener Nebel im Portal
    float a = atan(d.y, d.x);
    float dreh = uZeit * (0.08 + uWirbel * 0.45) + uWirbel * 1.3 * (1.0 - r) * (1.0 - r);
    float aw = a + dreh;
    vec2 q = vec2(cos(aw), sin(aw)) * r;
    float n1 = fbm(q * 2.2 + vec2(uZeit * 0.05, -uZeit * 0.04));
    float n2 = fbm(q * 4.2 - vec2(uZeit * 0.08) + n1 * 1.8);
    float nebel = smoothstep(0.22, 0.95, n2);
    vec3 tief = vec3(0.015, 0.0, 0.04);
    vec3 violett = vec3(0.36, 0.1, 0.72);
    vec3 hell = vec3(0.82, 0.62, 1.0);
    vec3 nf = mix(tief, violett, nebel);
    nf = mix(nf, hell, smoothstep(0.62, 0.98, n2 * (0.6 + 0.6 * n1)) * 0.55);
    float kern = smoothstep(0.9, 0.0, r);
    nf *= 0.55 + kern * 0.75 + uWirbel * 0.35 + uGlimmen * 0.25;
    nf *= mix(0.3, 1.0, smoothstep(1.0, 0.72, r)); // Rand tiefer = Tiefe
    farbe = mix(farbe, nf, maske * uPortal);

    // Antwort steigt aus der Tiefe auf
    float k = clamp(uAuftauchen, 0.0, 1.0);
    float ke = 1.0 - pow(1.0 - k, 3.0);
    float skala = mix(0.4, 1.0, ke);
    vec2 tuv = vec2(0.5 + d.x * 0.5, 0.5 - d.y * 0.5);
    tuv = (tuv - 0.5) / skala + 0.5;
    tuv.y -= (1.0 - ke) * 0.1;
    tuv += (vec2(n1, n2) - 0.5) * 0.05 * (1.0 - ke);
    vec2 tx = texture2D(uText, tuv).rg;
    if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) tx = vec2(0.0);
    float sicht = smoothstep(0.0, 0.55, k * 1.35 - (1.0 - n2) * 0.45);
    vec3 glutFarbe = vec3(1.0, 0.55, 0.22);
    vec3 kernFarbe = vec3(1.0, 0.86, 0.62);
    farbe += glutFarbe * tx.g * 0.75 * sicht * maske;
    farbe = mix(farbe, kernFarbe * (1.15 + 0.6 * (1.0 - ke)), clamp(tx.r * sicht, 0.0, 1.0) * maske);

    // Atmosphäre: leichter Bodennebel, Vignette, Korn
    vec2 su = vUv;
    float boden = fbm(vec2(su.x * 3.0 + uZeit * 0.03, su.y * 2.0 - uZeit * 0.015)) * smoothstep(0.45, 0.0, su.y);
    farbe = mix(farbe, vec3(0.62, 0.6, 0.68) * 0.55, boden * 0.18);
    float vig = smoothstep(1.25, 0.35, length((su - 0.5) * vec2(uSchirm.x / uSchirm.y, 1.0) * 1.1));
    farbe *= mix(0.55, 1.0, vig);
    farbe *= uHell;
    float korn = hash(vUv * uSchirm + fract(uZeit * 7.13) * 100.0) - 0.5;
    farbe += korn * 0.028;
    gl_FragColor = vec4(farbe, 1.0);
  }
`;

export function baueBuehne(renderer) {
  const textCanvas = document.createElement('canvas');
  textCanvas.width = textCanvas.height = 1024;
  const textTex = new THREE.CanvasTexture(textCanvas);
  textTex.colorSpace = THREE.NoColorSpace;

  const uniforms = {
    uMedium: { value: null },
    uMedGr: { value: new THREE.Vector2(1152, 2040) },
    uSchirm: { value: new THREE.Vector2(1, 1) },
    uUeber: { value: 1 },
    uSeite: { value: 0 },
    uZoom: { value: 1 },
    uSchwenk: { value: 0 },
    uPortalC: { value: new THREE.Vector2() },
    uPortalR: { value: new THREE.Vector2() },
    uZeit: { value: 0 },
    uWirbel: { value: 0 },
    uAuftauchen: { value: 0 },
    uPortal: { value: 0.35 },
    uGlimmen: { value: 0 },
    uHell: { value: 0 },
    uUmgebung: { value: 0 },
    uText: { value: textTex },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false });
  const szene = new THREE.Scene();
  szene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const kamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function setzeMedium(tex, breite, hoehe, portal = PORTAL) {
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    uniforms.uMedium.value = tex;
    uniforms.uMedGr.value.set(breite, hoehe);
    uniforms.uPortalC.value.set(portal.x * breite, portal.y * hoehe);
    uniforms.uPortalR.value.set(portal.rx * breite, portal.ry * hoehe);
  }

  // Zoom, bei dem das Portal den Bildschirm füllt.
  function portalZoom() {
    const { x: sw, y: sh } = uniforms.uSchirm.value;
    const m = uniforms.uMedGr.value;
    const s0 = Math.min(sw / m.x, sh / m.y) * uniforms.uUeber.value;
    const durchmesser = 2 * uniforms.uPortalR.value.x * s0;
    const ziel = Math.min(sw * 0.86, sh * 0.6);
    return Math.max(1, ziel / durchmesser);
  }

  function groesse(breite, hoehe) {
    uniforms.uSchirm.value.set(breite, hoehe);
    // Hochkant: etwas überfüllen, damit oben/unten weniger Rand bleibt
    const m = uniforms.uMedGr.value;
    const hochkant = breite / hoehe < m.x / m.y;
    uniforms.uUeber.value = hochkant ? 1.05 : 1.0;
    uniforms.uSeite.value = hochkant ? 0 : 1;
  }

  // Text in zwei Kanälen: Rot = Schrift, Grün = Glut drumherum.
  function schreibe(text) {
    const g = textCanvas.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1024, 1024);
    const radius = 365;
    // Lange Adressen dürfen nach dem @ umbrechen (das Wort danach hängt ohne Leerzeichen an).
    const woerter = text.split(/\s+/).flatMap((w) => (w.includes('@') && w.length > 12 ? [w.slice(0, w.indexOf('@') + 1), `\u2060${w.slice(w.indexOf('@') + 1)}`] : [w]));
    const fuege = (a, b) => (b.startsWith('\u2060') ? a + b.slice(1) : `${a} ${b}`);
    const roh = (w) => (w.startsWith('\u2060') ? w.slice(1) : w);
    let passend = null;
    for (let gr = 132; gr >= 44; gr -= 4) {
      g.font = `700 ${gr}px ${SCHRIFT}`;
      const zeilenH = gr * 1.14;
      for (let n = 1; n <= 8; n++) {
        const hoehe = n * zeilenH;
        if (hoehe > radius * 1.7) break;
        const zeilen = [];
        let wi = 0;
        let ok = true;
        for (let i = 0; i < n && wi < woerter.length; i++) {
          const y = -hoehe / 2 + zeilenH * (i + 0.5);
          const rand = Math.max(Math.abs(y - zeilenH * 0.5), Math.abs(y + zeilenH * 0.5));
          const breite = 2 * Math.sqrt(Math.max(radius * radius - rand * rand, 0)) * 0.9;
          let zeile = roh(woerter[wi]);
          if (g.measureText(zeile).width > breite) { ok = false; break; }
          wi++;
          while (wi < woerter.length && g.measureText(fuege(zeile, woerter[wi])).width <= breite) {
            zeile = fuege(zeile, woerter[wi]);
            wi++;
          }
          zeilen.push(zeile);
        }
        if (ok && wi >= woerter.length) { passend = { gr, zeilen, zeilenH }; break; }
      }
      if (passend) break;
    }
    if (!passend) passend = { gr: 44, zeilen: [text], zeilenH: 50 };
    g.font = `700 ${passend.gr}px ${SCHRIFT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const start = 512 - (passend.zeilen.length * passend.zeilenH) / 2 + passend.zeilenH / 2;
    const zeilen = passend.zeilen.map((z, i) => [z, start + i * passend.zeilenH + passend.gr * 0.04]);
    // Glut: nur der Schatten, Schrift selbst liegt außerhalb
    g.fillStyle = '#000';
    g.shadowColor = 'rgb(0,255,0)';
    g.shadowBlur = passend.gr * 0.55;
    g.shadowOffsetX = 2048;
    zeilen.forEach(([z, y]) => g.fillText(z, 512 - 2048, y));
    g.shadowColor = 'rgba(0,0,0,0)';
    g.shadowBlur = 0;
    g.shadowOffsetX = 0;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgb(255,0,0)';
    zeilen.forEach(([z, y]) => g.fillText(z, 512, y));
    g.globalCompositeOperation = 'source-over';
    textTex.needsUpdate = true;
  }

  function zeichne() { renderer.render(szene, kamera); }

  return { uniforms, setzeMedium, groesse, portalZoom, schreibe, zeichne };
}
