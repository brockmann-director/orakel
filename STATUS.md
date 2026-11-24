# Die Pfote der Wahrheit – Stand

Winkekatzen-Orakel für die 27km-Kollegies. Frage laut stellen (oder iPhone schütteln): Die riesige Porzellankatze winkt immer langsamer, die Pfote bleibt unten stehen, die Kamera fährt ins Bauch-Portal, Gong, und die Antwort steigt aus dem violetten Nebel auf.

## Stand (2026-11-24, Fassung 3 = Hauptseite)
- `index.html` ist jetzt die echte 3D-Fassung (`js/spiel3d.js`). Die Video-Fassung 2 liegt weiter unter `video.html` (`js/main.js`). `probe3d.html` leitet auf die Hauptseite um.
- Ablauf: Berühren → Gewitter-Intro mit 27km-Logo (`js/intro3d.js`, 6,6 s, beim ersten Mal nicht überspringbar, danach per Tippen) → weißer Blitz → Katze winkt im Tal, Mönchsgesang + Wind. Frage laut stellen (Tippen) oder schütteln → Pfote bremst und bleibt unten, Kamera fliegt ins Portal, Chor, Gong, Antwort steigt auf, steht 5,5 s, dann zurück in die Totale.
- Fassung 1 (Blender-Katze, Kung-Fu-Intro) hat Jan verworfen. Fassung 2 (Video-Katze aus Kling) fand er gut, aber „nur 2D“.
- Version A: kuratierte Antworten ohne KI, Test bis Ende der Woche. Danach Entscheidung über Version C (Claude + Fallback).
- Statische Seite für GitHub Pages (Branch `main`, Root). Kein Build-Schritt.

## 3D-Szene
- Katze = `assets/3d/katze.glb` (Hunyuan3D v3 aus Jans freigestelltem Higgsfield-Bild, in Blender auf 120k Dreiecke reduziert, Texturen 2k JPEG, 5 MB). Hintergrund `assets/3d/tal.jpg` = Jans Tal ohne Katze (GPT Image 2.6), auf einen Zylinder gezogen, abendlich gegradet.
- Pfote (`MODELL.pfote` in `js/szene3d.js`): Gewicht je Ecke; die Grenze zwischen Arm und Körper folgt der Spalte in der Silhouette (`spalt`, Höhe → x), sonst verzerrt der Arm. Drehung um den Ellbogen im Vertex-Shader, Ausschlag 0,5 rad.
- Portal: in die Keramik gemalt (Shader im Katzen-Material, Maske aus Lage, Nebel mit Tiefen-Verschiebung, Antwort aus `schreibeAufLeinwand`). Glanzlichter auf 12 begrenzt (sonst Half-Float-Überlauf → Bloom-Quadrate).
- Intro (`js/intro3d.js`): Nachtversion desselben Tals, Logo aus `assets/3d/logo27km.json` (Umrisse aus `assets/27km-logo-2k.png` per potrace, normiert) extrudiert als Metall, 3 Blitze (Bänder + Licht auf Bergen und Logo), Regen als Linien, goldener Glanz wandert als Band über die Kanten (Shader, kein Punktlicht: das gab einen Bloom-Fleck), Schlussblitz → Weiß, das im Spiel abklingt (`#blitz`). Hochkant bleibt die Kamera, das Logo wird kleiner.
- Ton: Mönche, Regen, Donner, Stinger, Chor von Epidemic Sound (über Higgsfield `download_sound_effect`; der Proxy sperrt pdn.epidemicsound.com, daher `media_import_url` und Download von cloudfront). Betten (`bettStart/bettLautstaerke/bettStop` in `js/klang.js`) laufen endlos überblendet.
- Schütteln: iOS fragt beim ersten Berühren nach „Bewegung & Ausrichtung“ (beide Anfragen in derselben Geste). Zwei Ausschläge > 11 m/s² innerhalb 0,9 s. Wer einmal „Nicht erlauben“ gedrückt hat: Safari-Einstellungen → Website-Daten der Seite löschen.

## Regeln (Jan)
- Insider-Witze nie erklären, nur kurze Orakel-Einleitung. Wortlaut, Wortspiele und Sarkasmus erhalten.
- Keine Urheber unter den Antworten. Namen (Lars, Matti, Matteo, Hans) dürfen bleiben.
- Kein Textfeld, Frage wird gesprochen. 27km-Logo nur im Intro.
- Look: fotorealistisch, kinoreif, nichts Billiges. Higgsfield-Credits darf Claude nach Rückfrage nutzen.

## Testen
- `python3 -m http.server` im Repo, dann `http://localhost:8000/`
- 3D: `?test` überspringt Start + Intro, `?ohneintro` nur das Intro, `&modus=antwort&stehen`, `&blick=0.2`, `?film` (feste 30 fps, `window.__bild()`).
- Video-Fassung (`video.html`): `?test` überspringt Start + Ident, `?test&modus=antwort&frage=…` zeigt direkt eine Antwort (fährt nach 5,5 s von allein zurück, `&stehen` hält sie fest), `?test&modus=ritual&t=2` springt ins Ritual, `?standbild` ohne Video.
- MiniMax-Video hat Jans Bild zweimal fälschlich als NSFW gefiltert; Kling geht.

## Offen
- Neue Sprüche Ende der Woche (u. a. Leons 27km-Kartenspiel).
- Eigene Adresse orakel.thisisjan.com (CNAME bei Strato + Datei `CNAME`).
- Münzregen aus Fassung 1 ist raus (passte nicht zum Foto-Look); bei Bedarf neu als Video-Overlay.
