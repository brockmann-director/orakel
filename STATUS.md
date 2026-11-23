# Die Pfote der Wahrheit – Stand

Winkekatzen-Orakel für die 27km-Kollegies. Frage laut stellen (oder iPhone schütteln), die Katze winkt immer langsamer, dann steigt die Antwort aus dem Nebel im Bauch auf.

## Stand (2026-11-23)
- Version A: kuratierte Antworten ohne KI, Test bis Ende der Woche. Danach Entscheidung über Version C (Spracherkennung + Claude + Fallback).
- Statische Seite für GitHub Pages (Branch `main`, Root). Kein Build-Schritt.

## Aufbau
- `index.html`, `stil.css`, `manifest.webmanifest`
- `js/main.js` – Szene, Kamera, Zustände (schlafen → intro → ruhe → lauschen → ritual → antwort)
- `js/intro.js` – Kung-Fu-B-Movie-Intro mit 27km-Stempel (nur beim ersten Mal nicht überspringbar)
- `js/bauch.js` – Nebel-Shader + Antworttext im Bauchfenster
- `js/szene.js` – Schrein, Laternen, Räucherstäbchen, Goldstaub, Münzregen (1 von 50)
- `js/klang.js` – alle Geräusche per Web Audio (Quietschen, Glöckchen, Gong, Trommel …)
- `js/eingabe.js` – Schütteln (iOS fragt nach Bewegung), Spracherkennung de-DE
- `js/orakel.js` – Auswahl der Antwort (Signalwörter → Themen, Stimmungs-Gewichte, keine Wiederholung der letzten 14)
- `js/teilen.js` – Teilen-Bild 1080×1350
- `data/sprueche.json` – **hier kommen neue Sprüche rein** (`original`, `stimmung` ja/vielleicht/nein/rat, `themen`, `fassungen`)
- `models/katze.glb` – Katze, erzeugt von `tools/katze.py` (Blender 5 als Python-Modul: `python tools/katze.py models/katze.glb vorschau.png`)
- `vendor/` – three.js 0.170.0 (MIT)

## Regeln (Jan)
- Insider-Witze nie erklären, nur kurze Orakel-Einleitung. Wortlaut, Wortspiele und Sarkasmus erhalten.
- Keine Urheber unter den Antworten. Namen (Lars, Matti, Matteo, Hans) dürfen bleiben.
- Kein Textfeld, Frage wird gesprochen. 27km-Logo nur im Intro.

## Testen
- `python3 -m http.server` im Repo, dann `http://localhost:8000/`
- `?test` überspringt Start + Intro, `?test&modus=antwort&frage=…` zeigt direkt eine Antwort, `?muenzen` erzwingt den Münzregen.

## Offen
- Neue Sprüche Ende der Woche (u. a. Leons 27km-Kartenspiel).
- Eigene Adresse orakel.thisisjan.com (CNAME bei Strato + Datei `CNAME`).
