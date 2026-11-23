// Schütteln (iPhone) und gesprochene Frage (Spracherkennung des Browsers).

export async function erlaubeBewegung() {
  const DME = window.DeviceMotionEvent;
  if (DME && typeof DME.requestPermission === 'function') {
    try { return (await DME.requestPermission()) === 'granted'; } catch { return false; }
  }
  return 'ondevicemotion' in window;
}

export function beimSchuetteln(callback) {
  let letzte = null;
  let ruhe = 0;
  let energie = 0;
  window.addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null) return;
    const now = performance.now();
    if (letzte) {
      const d = Math.abs(a.x - letzte.x) + Math.abs(a.y - letzte.y) + Math.abs(a.z - letzte.z);
      energie = energie * 0.8 + d;
      if (energie > 55 && now > ruhe) {
        ruhe = now + 1500;
        energie = 0;
        callback();
      }
    }
    letzte = { x: a.x, y: a.y, z: a.z };
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
