// Der Schrein: Sockel, Laternen, Räucherstäbchen, Staub und Münzregen.
import * as THREE from 'three';

function weicherPunkt(groesse = 64, innen = 'rgba(255,255,255,1)') {
  const c = document.createElement('canvas');
  c.width = c.height = groesse;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(groesse / 2, groesse / 2, 0, groesse / 2, groesse / 2, groesse / 2);
  grad.addColorStop(0, innen);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, groesse, groesse);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function laternenTextur() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7a0a04');
  grad.addColorStop(0.5, '#ff4a12');
  grad.addColorStop(1, '#7a0a04');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(60,0,0,0.55)';
  g.lineWidth = 3;
  for (let x = 0; x < 256; x += 16) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke();
  }
  g.fillStyle = 'rgba(40,0,0,0.65)';
  g.font = 'bold 90px serif';
  g.textAlign = 'center';
  g.fillText('福', 128, 160);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function baueSchrein(scene) {
  const gruppe = new THREE.Group();
  scene.add(gruppe);

  // Boden + Sockel
  const boden = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ color: 0x120806, roughness: 0.85 }),
  );
  boden.rotation.x = -Math.PI / 2;
  boden.position.y = -0.3;
  boden.receiveShadow = true;
  gruppe.add(boden);

  const lack = new THREE.MeshPhysicalMaterial({ color: 0x2a0303, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 });
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xc9933f, metalness: 1, roughness: 0.4 });
  const sockel = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.3, 72), lack);
  sockel.position.y = -0.15;
  sockel.receiveShadow = true;
  sockel.castShadow = true;
  gruppe.add(sockel);
  const rand = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.025, 12, 96), gold);
  rand.rotation.x = Math.PI / 2;
  rand.position.y = 0.0;
  gruppe.add(rand);
  const rand2 = rand.clone();
  rand2.scale.setScalar(1.075);
  rand2.position.y = -0.29;
  gruppe.add(rand2);

  // Rückwand-Schimmer: großes, sehr dunkles Halbrund mit warmem Verlauf
  const wandTex = (() => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#050104');
    grad.addColorStop(0.55, '#2a0a06');
    grad.addColorStop(1, '#0a0302');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const wand = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 14, 64, 1, true, Math.PI * 0.6, Math.PI * 0.8),
    new THREE.MeshBasicMaterial({ map: wandTex, side: THREE.BackSide, fog: false }),
  );
  wand.position.set(0, 5, 0);
  gruppe.add(wand);

  // Laternen
  const lTex = laternenTextur();
  const laternen = [];
  const lMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: lTex, emissiveIntensity: 2.2, roughness: 1 });
  const kappe = new THREE.MeshStandardMaterial({ color: 0x0b0503, roughness: 0.6 });
  const orte = [[-2.9, 2.9, -3.6], [2.7, 3.3, -4.2], [-5.2, 3.6, -7.5], [5.4, 2.6, -6.8], [-1.2, 5.6, -10]];
  orte.forEach(([x, y, z], i) => {
    const l = new THREE.Group();
    const koerper = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 20), lMat);
    koerper.scale.set(1, 1.2, 1);
    l.add(koerper);
    const oben = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 24), kappe);
    oben.position.y = 0.55;
    const unten = oben.clone();
    unten.position.y = -0.55;
    l.add(oben, unten);
    const schnur = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 6, 4), kappe);
    schnur.position.y = 3.6;
    l.add(schnur);
    const quaste = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xffb030, emissive: 0x401000 }));
    quaste.position.y = -0.8;
    quaste.rotation.x = Math.PI;
    l.add(quaste);
    l.position.set(x, y, z);
    l.userData.phase = i * 1.7;
    gruppe.add(l);
    laternen.push(l);
    const licht = new THREE.PointLight(0xff5520, 4, 7, 2);
    licht.position.copy(l.position);
    gruppe.add(licht);
  });

  // Räucherschale mit Stäbchen
  const schale = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.12, 24), new THREE.MeshPhysicalMaterial({ color: 0x3b2a12, metalness: 0.8, roughness: 0.4 }));
  schale.position.set(1.55, -0.24, 0.55);
  schale.castShadow = true;
  gruppe.add(schale);
  const staebchen = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0x5a1c0c }));
    s.position.set(1.55 + (i - 1) * 0.04, 0.15, 0.55 + (i % 2) * 0.03);
    s.rotation.z = (i - 1) * 0.12;
    gruppe.add(s);
    const glut = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 0.3) }));
    glut.position.set(s.position.x - Math.sin(s.rotation.z) * 0.375, 0.15 + Math.cos(s.rotation.z) * 0.375, s.position.z);
    gruppe.add(glut);
    staebchen.push(glut);
  }

  // Rauch
  const rauchTex = weicherPunkt(128, 'rgba(255,255,255,0.9)');
  const rauch = [];
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: rauchTex, color: 0xb8a898, transparent: true, opacity: 0, depthWrite: false }));
    m.userData = { alter: Math.random() * 6, quelle: staebchen[i % 3].position, seed: Math.random() * 10 };
    gruppe.add(m);
    rauch.push(m);
  }

  // Goldstaub
  const N = 260;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 9;
    pos[i * 3 + 1] = Math.random() * 5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 7 - 1;
  }
  const staubGeo = new THREE.BufferGeometry();
  staubGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const staub = new THREE.Points(staubGeo, new THREE.PointsMaterial({
    map: weicherPunkt(32), color: 0xffc070, size: 0.045, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  gruppe.add(staub);

  function aktualisiere(t, dt) {
    laternen.forEach((l) => { l.rotation.z = Math.sin(t * 0.6 + l.userData.phase) * 0.04; });
    for (const m of rauch) {
      const u = m.userData;
      u.alter += dt;
      const leben = 6;
      if (u.alter > leben) { u.alter -= leben; u.seed = Math.random() * 10; }
      const k = u.alter / leben;
      const h = k * 2.4;
      m.position.set(
        u.quelle.x + Math.sin(h * 2.3 + u.seed) * 0.12 * h + h * 0.08,
        u.quelle.y + h,
        u.quelle.z + Math.cos(h * 1.7 + u.seed) * 0.1 * h,
      );
      const s = 0.08 + k * 0.7;
      m.scale.set(s, s, s);
      m.material.opacity = Math.sin(Math.PI * Math.min(k * 1.3, 1)) * 0.13;
      m.material.rotation = u.seed + t * 0.2;
    }
    const p = staubGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i * 3 + 1] += dt * 0.05;
      p[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.02;
      if (p[i * 3 + 1] > 5) p[i * 3 + 1] = 0;
    }
    staubGeo.attributes.position.needsUpdate = true;
  }

  return { gruppe, aktualisiere };
}

// Münzregen (1 von 50 Antworten)
export function baueMuenzregen(scene, kobanGeo, material) {
  const muenzen = [];
  let aktiv = false;
  const geo = kobanGeo || new THREE.SphereGeometry(0.15, 24, 12).scale(1, 1.5, 0.2);
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(geo, material);
    m.visible = false;
    m.castShadow = true;
    scene.add(m);
    muenzen.push(m);
  }
  function start() {
    aktiv = true;
    muenzen.forEach((m) => {
      m.visible = true;
      m.position.set((Math.random() - 0.5) * 3.2, 4 + Math.random() * 4, (Math.random() - 0.5) * 1.8 + 0.4);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.userData = { v: new THREE.Vector3(0, -Math.random() * 1.5, 0), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0), ruhe: 0 };
      m.scale.setScalar(0.7 + Math.random() * 0.4);
    });
  }
  function aktualisiere(dt) {
    if (!aktiv) return;
    let alleWeg = true;
    for (const m of muenzen) {
      const u = m.userData;
      if (!m.visible) continue;
      alleWeg = false;
      u.v.y -= 9.8 * dt;
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += u.w.x * dt;
      m.rotation.y += u.w.y * dt;
      const boden = Math.hypot(m.position.x, m.position.z) < 1.15 ? 0.03 : -0.27;
      if (m.position.y < boden) {
        m.position.y = boden;
        u.v.y *= -0.35;
        u.v.x = (Math.random() - 0.5) * 0.6;
        u.w.multiplyScalar(0.5);
        u.ruhe += dt * 8;
      }
      if (u.ruhe > 0) u.ruhe += dt;
      if (u.ruhe > 5) { m.scale.multiplyScalar(0.9); if (m.scale.x < 0.02) m.visible = false; }
    }
    if (alleWeg) aktiv = false;
  }
  return { start, aktualisiere };
}
