// Antwort als Bild teilen (iPhone: Teilen-Menü, Mac: Download).

export async function teilen(bildCanvas, text) {
  const B = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = B;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#060203';
  g.fillRect(0, 0, B, H);
  // Bild der Bühne „cover“ einpassen, oberer Teil
  const ziel = { w: B, h: H - 330 };
  const s = Math.max(ziel.w / bildCanvas.width, ziel.h / bildCanvas.height);
  const w = bildCanvas.width * s;
  const h = bildCanvas.height * s;
  g.drawImage(bildCanvas, (B - w) / 2, (ziel.h - h) / 2, w, h);
  const verlauf = g.createLinearGradient(0, ziel.h - 200, 0, ziel.h + 10);
  verlauf.addColorStop(0, 'rgba(6,2,3,0)');
  verlauf.addColorStop(1, 'rgba(6,2,3,1)');
  g.fillStyle = verlauf;
  g.fillRect(0, ziel.h - 200, B, 210);
  g.fillStyle = '#060203';
  g.fillRect(0, ziel.h, B, H - ziel.h);

  g.textAlign = 'center';
  g.fillStyle = '#ffc65a';
  let groesse = 60;
  const woerter = `„${text}“`.split(' ');
  let zeilen;
  do {
    g.font = `700 ${groesse}px "Cinzel", serif`;
    zeilen = [];
    let z = '';
    for (const wort of woerter) {
      const probe = z ? `${z} ${wort}` : wort;
      if (g.measureText(probe).width > B - 140 && z) { zeilen.push(z); z = wort; } else z = probe;
    }
    zeilen.push(z);
    groesse -= 4;
  } while (zeilen.length * groesse * 1.25 > 230 && groesse > 30);
  const zh = (groesse + 4) * 1.25;
  const y0 = ziel.h + 150 - (zeilen.length * zh) / 2;
  zeilen.forEach((z, i) => g.fillText(z, B / 2, y0 + i * zh));
  g.font = '400 28px "Cinzel", serif';
  g.fillStyle = 'rgba(255,198,90,0.55)';
  g.fillText('DIE PFOTE DER WAHRHEIT', B / 2, H - 46);

  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
  const datei = new File([blob], 'pfote-der-wahrheit.jpg', { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [datei] })) {
    try { await navigator.share({ files: [datei], text: `Die Pfote der Wahrheit hat gesprochen: „${text}“` }); return; } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = datei.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
