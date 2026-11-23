// Start-Intro im Stil eines 70er-Jahre-Kung-Fu-B-Movies.
import * as klang from './klang.js';

const DAUER = 6.2;
const LANDEN = 5.15; // Zeitpunkt, an dem die Katze im 3D-Bild landet

function laden(src) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function kornKacheln(n = 4, groesse = 256) {
  return Array.from({ length: n }, () => {
    const c = document.createElement('canvas');
    c.width = c.height = groesse;
    const g = c.getContext('2d');
    const d = g.createImageData(groesse, groesse);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 38;
    }
    g.putImageData(d, 0, 0);
    return c;
  });
}

const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
const knall = (t, t0, dauer = 0.35) => ease((t - t0) / dauer);

export async function spieleIntro(canvas, { ueberspringbar, onLanden }) {
  const logo = await laden('assets/27km-logo.png');
  try { await document.fonts.load('80px "Shojumaru"'); await document.fonts.load('80px "Ma Shan Zheng"'); } catch { /* egal */ }

  const g = canvas.getContext('2d');
  const korn = kornKacheln();
  let W = 0; let H = 0; let dpr = 1;
  function groesse() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  groesse();
  window.addEventListener('resize', groesse);

  // Logo als roter Stempel mit ausgespartem Logo
  let stempel = null;
  if (logo) {
    const s = document.createElement('canvas');
    const pad = 70;
    s.width = logo.width + pad * 2;
    s.height = logo.height + pad * 2;
    const sg = s.getContext('2d');
    sg.fillStyle = '#c8190f';
    sg.beginPath();
    sg.roundRect(6, 6, s.width - 12, s.height - 12, 30);
    sg.fill();
    sg.globalCompositeOperation = 'destination-out';
    sg.drawImage(logo, pad, pad);
    sg.lineWidth = 14;
    sg.strokeStyle = '#000';
    sg.beginPath();
    sg.roundRect(26, 26, s.width - 52, s.height - 52, 18);
    sg.stroke();
    // Stempel-Struktur: kleine Fehlstellen
    for (let i = 0; i < 260; i++) {
      sg.beginPath();
      sg.arc(Math.random() * s.width, Math.random() * s.height, Math.random() * 5, 0, Math.PI * 2);
      sg.fill();
    }
    sg.globalCompositeOperation = 'source-over';
    stempel = s;
  }

  const kratzer = Array.from({ length: 4 }, () => ({ x: Math.random(), leben: 0 }));
  const ereignisse = new Set();
  const einmal = (name, t, t0, fn) => { if (t >= t0 && !ereignisse.has(name)) { ereignisse.add(name); fn(); } };

  let wackeln = 0;
  let start = null;
  let fertig = false;
  let stoppProjektor = null;

  return new Promise((aufgeloest) => {
    const beenden = () => {
      if (fertig) return;
      fertig = true;
      if (stoppProjektor) stoppProjektor();
      if (!ereignisse.has('landen')) onLanden();
      canvas.style.transition = 'opacity .5s';
      canvas.style.opacity = '0';
      setTimeout(() => { canvas.style.display = 'none'; aufgeloest(); }, 520);
      window.removeEventListener('resize', groesse);
    };
    if (ueberspringbar) canvas.addEventListener('pointerdown', beenden, { once: true });

    function frame(now) {
      if (fertig) return;
      if (start === null) start = now;
      const t = (now - start) / 1000;

      einmal('projektor', t, 0, () => { stoppProjektor = klang.projektor(5.6); });
      einmal('t1', t, 0.5, () => { klang.trommel(1, 1); wackeln = 18; });
      einmal('w1', t, 1.45, () => klang.wusch(0.45, 1));
      einmal('t2', t, 1.75, () => { klang.trommel(1.1, 0.8); wackeln = 22; });
      einmal('t3', t, 2.05, () => klang.trommel(0.7, 1.2));
      einmal('w2', t, 3.55, () => klang.wusch(0.3, 0.8));
      einmal('stempel', t, 3.85, () => { klang.trommel(1.3, 0.6); wackeln = 30; });
      einmal('gong', t, LANDEN - 0.05, () => { klang.gong(1); });
      einmal('landen', t, LANDEN, () => { onLanden(); });

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const weave = { x: (Math.random() - 0.5) * 2.4, y: (Math.random() - 0.5) * 2.4 };
      wackeln *= 0.86;
      const sx = weave.x + (Math.random() - 0.5) * wackeln;
      const sy = weave.y + (Math.random() - 0.5) * wackeln;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.save();
      g.translate(sx, sy);

      const m = Math.min(W, H);
      if (t > 0.5) {
        // Strahlen-Hintergrund
        const k = knall(t, 0.5, 0.4);
        g.save();
        g.translate(W / 2, H * 0.45);
        g.rotate(t * 0.15);
        const strahlen = 18;
        const R = Math.hypot(W, H);
        for (let i = 0; i < strahlen; i++) {
          g.fillStyle = i % 2 ? '#a3120a' : '#d8410f';
          g.beginPath();
          g.moveTo(0, 0);
          g.arc(0, 0, R, (i / strahlen) * Math.PI * 2, ((i + 1) / strahlen) * Math.PI * 2);
          g.fill();
        }
        g.restore();
        g.fillStyle = `rgba(0,0,0,${1 - k})`;
        g.fillRect(0, 0, W, H);

        // Riesige Schriftzeichen mit Crash-Zoom
        const zk = knall(t, 0.5, 0.32);
        const hoch = knall(t, 1.5, 0.4);
        const s = (4 - 3 * zk) * (1 - 0.45 * hoch);
        const y = H * 0.45 - hoch * (H * 0.27);
        g.save();
        g.translate(W / 2, y);
        g.scale(s, s);
        g.font = `${m * 0.24}px "Ma Shan Zheng", serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let geist = 3; geist >= 0; geist--) {
          if (geist > 0 && zk > 0.98) continue;
          g.globalAlpha = geist ? 0.18 : 1;
          g.lineWidth = m * 0.02;
          g.strokeStyle = '#000';
          g.strokeText('真理之爪', 0, geist * 6);
          g.fillStyle = '#ffd23a';
          g.fillText('真理之爪', 0, geist * 6);
        }
        g.restore();
        g.globalAlpha = 1;
      }

      if (t > 1.75) {
        // Titel knallt rein
        const k = knall(t, 1.75, 0.28);
        const s = 2.6 - 1.6 * k;
        g.save();
        g.translate(W / 2, H * 0.5);
        g.scale(s, s);
        g.rotate(-0.04);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const fg = Math.min(m * 0.13, W * 0.11);
        const zeilen = [['DIE PFOTE', -fg * 0.62, fg], ['DER WAHRHEIT', fg * 0.55, fg * 0.86]];
        for (const [txt, yy, gr] of zeilen) {
          g.font = `${gr}px "Shojumaru", "Impact", sans-serif`;
          g.lineJoin = 'round';
          g.lineWidth = gr * 0.24;
          g.strokeStyle = '#1a0000';
          g.strokeText(txt, 0, yy + gr * 0.06);
          g.lineWidth = gr * 0.11;
          g.strokeStyle = '#b30d05';
          g.strokeText(txt, 0, yy);
          const grad = g.createLinearGradient(0, yy - gr / 2, 0, yy + gr / 2);
          grad.addColorStop(0, '#fff6a8');
          grad.addColorStop(0.5, '#ffd000');
          grad.addColorStop(1, '#ff8a00');
          g.fillStyle = grad;
          g.fillText(txt, 0, yy);
        }
        g.restore();
      }

      if (t > 2.6) {
        // Untertitel wie aus einer schlechten Synchro
        const text = 'SIE WINKT. SIE WEISS. SIE DÄNGELT.';
        const n = Math.min(text.length, Math.floor((t - 2.6) * 26));
        g.font = `bold ${Math.max(15, m * 0.042)}px "Arial Narrow", Arial, sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = 5;
        g.strokeStyle = '#000';
        g.strokeText(text.slice(0, n), W / 2, H * 0.86);
        g.fillStyle = '#ffef5a';
        g.fillText(text.slice(0, n), W / 2, H * 0.86);
      }

      if (t > 3.85 && stempel) {
        const k = knall(t, 3.85, 0.16);
        const breite = Math.min(W * 0.42, m * 0.5);
        const s = (2.8 - 1.8 * k);
        const h = breite * (stempel.height / stempel.width);
        g.save();
        g.translate(W / 2 + Math.min(W * 0.22, m * 0.25), H * 0.68);
        g.rotate(-0.13);
        g.scale(s, s);
        g.globalAlpha = 0.25 + 0.75 * k;
        g.drawImage(stempel, -breite / 2, -h / 2, breite, h);
        g.restore();
        g.globalAlpha = 1;
      }

      g.restore();

      // Filmlook: Tönung, Flackern, Korn, Kratzer, Staub, Vignette
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = '#ffd7a0';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.1})`;
      g.fillRect(0, 0, W, H);
      const kk = korn[Math.floor(t * 24) % korn.length];
      g.fillStyle = g.createPattern(kk, 'repeat');
      g.fillRect(0, 0, W, H);
      for (const kr of kratzer) {
        if (kr.leben <= 0 && Math.random() < 0.05) { kr.x = Math.random(); kr.leben = 3 + Math.random() * 10; }
        if (kr.leben > 0) {
          kr.leben--;
          kr.x += (Math.random() - 0.5) * 0.004;
          g.strokeStyle = 'rgba(255,240,210,0.35)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(kr.x * W, 0);
          g.lineTo(kr.x * W + (Math.random() - 0.5) * 6, H);
          g.stroke();
        }
      }
      for (let i = 0; i < 3; i++) {
        if (Math.random() < 0.4) {
          g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.7)' : 'rgba(255,240,220,0.5)';
          g.beginPath();
          g.ellipse(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      const vig = g.createRadialGradient(W / 2, H / 2, m * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.75)');
      g.fillStyle = vig;
      g.fillRect(0, 0, W, H);

      // Weißer Blitz beim Gong
      if (t > LANDEN - 0.1) {
        const f = Math.max(0, 1 - (t - (LANDEN - 0.1)) / 0.5);
        g.fillStyle = `rgba(255,245,220,${f})`;
        g.fillRect(0, 0, W, H);
        canvas.style.opacity = String(Math.max(0, 1 - (t - LANDEN) / 0.6));
      }

      if (t >= DAUER) { beenden(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
