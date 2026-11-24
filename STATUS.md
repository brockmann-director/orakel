# Die Pfote der Wahrheit – Stand

Winkekatzen-Orakel für die 27km-Kollegies. Frage laut stellen (oder iPhone schütteln): Die riesige Porzellankatze winkt immer langsamer, die Pfote bleibt unten stehen, die Kamera fährt ins Bauch-Portal, Gong, und die Antwort steigt aus dem violetten Nebel auf.

## Stand (2026-11-23, Fassung 2)
- Fassung 1 (Echtzeit-3D-Katze aus Blender, Kung-Fu-Intro) hat Jan verworfen: zu billig. Fassung 2 ist fotorealistisch.
- Katze = Video, aus Jans Higgsfield-Bild animiert (Kling 3.0 pro, Start- und Endbild gleich → nahtloser Loop, 6 s, winkt zweimal). Hochkant `assets/katze.mp4` fürs Handy, quer `assets/katze-quer.mp4` für den Rechner (Bild per Outpaint erweitert, eigener Kling-Lauf mit deutlichem Winken, abends gegradet; ab Seitenverhältnis 1,15 bildfüllend).
- Alles Bewegte darüber ist ein Shader (`js/buehne.js`): Bild bildfüllend, Portal-Nebel, aufsteigende Antwort (Text in Rot = Schrift, Grün = Glut), Licht auf der Keramik, Kamerafahrt (Zoom + Schwenk aufs Portal), Bodennebel, Korn.
- Version A: kuratierte Antworten ohne KI, Test bis Ende der Woche. Danach Entscheidung über Version C (Claude + Fallback).
- Statische Seite für GitHub Pages (Branch `main`, Root). Kein Build-Schritt.

## Aufbau
- `index.html`, `stil.css`, `manifest.webmanifest`
- `js/main.js` – Ablauf (schlafen → ident → ruhe → lauschen → ritual → antwort → wechsel), Fassungen hoch/quer mit Portal-Lage, Wendepunkten und Wellen der Pfote; `planeHalt()` lässt die Pfote mitten im Winken abbremsen und unten stehen.
- `js/intro.js` – Studio-Ident (3,9 s): Licht fährt über das 27km-Logo (`assets/27km-logo-2k.png`, aus Jans EPS) aus gebürstetem Metall. Beim ersten Mal nicht überspringbar.
- `js/buehne.js` – Bühnen-Shader und Antworttext
- `js/klang.js` – generierte Geräusche aus `assets/klang/` (Higgsfield Mirelo SFX): ident, atmo (Wind, endlos überblendet), knarzen (an den Wendepunkten der Pfote, langsamer = tiefer), gloeckchen, gong, aufsteigen, sog, tippen
- `js/eingabe.js` – Schütteln (iOS fragt nach Bewegung), Spracherkennung de-DE
- `js/orakel.js` – Auswahl der Antwort (Signalwörter → Themen, Stimmungs-Gewichte, keine Wiederholung der letzten 14)
- `js/teilen.js` – Teilen-Bild 1080×1350
- `data/sprueche.json` – **hier kommen neue Sprüche rein** (`original`, `stimmung` ja/vielleicht/nein/rat, `themen`, `fassungen`)
- `tools/video.py` – neues Video aufbereiten: `python3 tools/video.py roh.mp4` schreibt `assets/katze.mp4` + `.jpg` und misst die Wendepunkte der Pfote (für `FASSUNGEN` in main.js). Quer: `--ziel katze-quer --breite 1920 --x0 0.53 --x1 0.68` plus Grade (`--grade "eq=brightness=-0.07:contrast=1.1:saturation=0.85:gamma=0.88,colorbalance=rs=-0.04:bs=0.05:rm=-0.03:bm=0.03:rh=-0.02:bh=0.02,vignette=PI/4.5"`).
- `vendor/` – three.js 0.170.0 (MIT)

## Regeln (Jan)
- Insider-Witze nie erklären, nur kurze Orakel-Einleitung. Wortlaut, Wortspiele und Sarkasmus erhalten.
- Keine Urheber unter den Antworten. Namen (Lars, Matti, Matteo, Hans) dürfen bleiben.
- Kein Textfeld, Frage wird gesprochen. 27km-Logo nur im Intro.
- Look: fotorealistisch, kinoreif, nichts Billiges. Higgsfield-Credits darf Claude nach Rückfrage nutzen.

## Testen
- `python3 -m http.server` im Repo, dann `http://localhost:8000/`
- `?test` überspringt Start + Ident, `?test&modus=antwort&frage=…` zeigt direkt eine Antwort (fährt nach 5,5 s von allein zurück, `&stehen` hält sie fest), `?test&modus=ritual&t=2` springt ins Ritual, `?standbild` ohne Video.
- MiniMax-Video hat Jans Bild zweimal fälschlich als NSFW gefiltert; Kling geht.

## Offen
- Neue Sprüche Ende der Woche (u. a. Leons 27km-Kartenspiel).
- Eigene Adresse orakel.thisisjan.com (CNAME bei Strato + Datei `CNAME`).
- Münzregen aus Fassung 1 ist raus (passte nicht zum Foto-Look); bei Bedarf neu als Video-Overlay.
