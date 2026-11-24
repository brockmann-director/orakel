// Schütteln (iPhone) und gesprochene Frage (Spracherkennung des Browsers).

export async function erlaubeBewegung() {
  // iOS fragt einmal nach „Bewegung & Ausrichtung“; muss direkt in einem Klick passieren.
  const DME = window.DeviceMotionEvent;
  const DOE = window.DeviceOrientationEvent;
  if (DME && typeof DME.requestPermission === 'function') {
    const anfragen = [DME.requestPermission()];
    if (DOE && typeof DOE.requestPermission === 'function') anfragen.push(DOE.requestPermission());
    try { return (await Promise.all(anfragen))[0] === 'granted'; } catch { return false; }
  }
  return 'ondevicemotion' in window;
}

// Schütteln: zwei kräftige Ausschläge (ohne Schwerkraft) innerhalb einer knappen Sekunde.
export function beimSchuetteln(callback) {
  let ruhe = 0;
  let spitzen = [];
  let letzte = null;
  let energie = 0;
  window.addEventListener('devicemotion', (e) => {
    const now = performance.now();
    if (now < ruhe) return;
    const a = e.acceleration;
    let ausschlag = false;
    if (a && a.x != null) {
      ausschlag = Math.hypot(a.x, a.y, a.z) > 11;
    } else {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      if (letzte) {
        const d = Math.abs(g.x - letzte.x) + Math.abs(g.y - letzte.y) + Math.abs(g.z - letzte.z);
        energie = energie * 0.75 + d;
        ausschlag = energie > 30;
      }
      letzte = { x: g.x, y: g.y, z: g.z };
    }
    if (!ausschlag) return;
    spitzen = spitzen.filter((t) => now - t < 900);
    if (!spitzen.length || now - spitzen[spitzen.length - 1] > 120) spitzen.push(now);
    if (spitzen.length >= 2) {
      spitzen = [];
      energie = 0;
      ruhe = now + 1500;
      callback();
    }
  });
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const kannHoeren = !!SR;

// Startet das Zuhören. Liefert ein Objekt mit stop(); ruft onText (laufend)
// und onEnde(endgültiger Text) auf.
export function hoeren({ onText, onEnde }) {
  if (!SR) { onEnde(''); return { stop() {} }; }
  const r = new SR();
  r.lang = 'de-DE';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let text = '';
  let fertig = false;
  const ende = () => { if (!fertig) { fertig = true; onEnde(text.trim()); } };
  r.onresult = (e) => {
    text = Array.from(e.results).map((x) => x[0].transcript).join(' ');
    onText(text);
  };
  r.onerror = ende;
  r.onend = ende;
  try { r.start(); } catch { ende(); }
  const notbremse = setTimeout(() => { try { r.stop(); } catch { /* egal */ } }, 9000);
  return {
    stop() { clearTimeout(notbremse); try { r.stop(); } catch { ende(); } setTimeout(ende, 700); },
  };
}
