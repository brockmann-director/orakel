// Wählt eine Antwort aus der Spruchsammlung (data/sprueche.json).
// Version A: kuratiert, ohne KI. Signalwörter aus der gesprochenen Frage
// lenken die Auswahl auf passende Themen.

const GEWICHTE = { ja: 0.34, rat: 0.26, vielleicht: 0.22, nein: 0.18 };
const GEDAECHTNIS = 14; // so viele letzte Sprüche nicht wiederholen
const SPEICHER = 'pfote-zuletzt';

let daten = null;

export async function ladeSprueche() {
  const r = await fetch('data/sprueche.json', { cache: 'no-cache' });
  daten = await r.json();
  return daten;
}

function zuletzt() {
  try { return JSON.parse(localStorage.getItem(SPEICHER) || '[]'); } catch { return []; }
}
function merke(id) {
  const l = zuletzt().filter((x) => x !== id);
  l.unshift(id);
  try { localStorage.setItem(SPEICHER, JSON.stringify(l.slice(0, GEDAECHTNIS))); } catch { /* egal */ }
}

function zufall(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

export function themenAus(frage) {
  if (!frage || !daten) return [];
  const f = ` ${frage.toLowerCase()} `;
  const treffer = [];
  for (const [thema, woerter] of Object.entries(daten.signalwoerter)) {
    if (woerter.some((w) => f.includes(w))) treffer.push(thema);
  }
  return treffer;
}

export function waehleAntwort(frage = '') {
  const alle = daten.sprueche;
  const gesperrt = new Set(zuletzt());
  let frisch = alle.filter((s) => !gesperrt.has(s.id));
  if (frisch.length < 5) frisch = alle;

  const themen = themenAus(frage);
  let pool = [];
  if (themen.length && Math.random() < 0.8) {
    pool = frisch.filter((s) => s.themen.some((t) => themen.includes(t)));
  }
  if (!pool.length) {
    // klassische 8-Ball-Mischung über die Stimmung
    let x = Math.random();
    let stimmung = 'ja';
    for (const [k, g] of Object.entries(GEWICHTE)) {
      if ((x -= g) <= 0) { stimmung = k; break; }
    }
    pool = frisch.filter((s) => s.stimmung === stimmung);
    if (!pool.length) pool = frisch;
  }
  const spruch = zufall(pool);
  merke(spruch.id);
  return { id: spruch.id, text: zufall(spruch.fassungen), themen };
}
