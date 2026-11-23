#!/usr/bin/env python3
"""Bereitet das generierte Katzen-Video für die Seite auf.

  python3 tools/video.py <roh.mp4> [--x0 0.72 --x1 0.98 --y0 0.08 --y1 0.48]

- schreibt assets/katze.mp4 (H.264, ohne Ton, faststart) und assets/katze.jpg (erstes Bild)
- misst die Wendepunkte der winkenden Pfote (Schwerpunkt der hellen Pixel im Pfoten-Ausschnitt)
  und gibt sie als Liste für VIDEO.wenden in js/main.js aus.
Braucht ffmpeg und numpy/Pillow.
"""
import argparse
import subprocess
import sys

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('roh')
ap.add_argument('--x0', type=float, default=0.72)
ap.add_argument('--x1', type=float, default=0.98)
ap.add_argument('--y0', type=float, default=0.08)
ap.add_argument('--y1', type=float, default=0.48)
ap.add_argument('--breite', type=int, default=1080)
ap.add_argument('--ziel', default='katze', help='Dateiname in assets/ ohne Endung, z. B. katze-quer')
ap.add_argument('--grade', default='', help='zusätzlicher ffmpeg-Filter, z. B. eq=brightness=-0.05')
a = ap.parse_args()

info = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                       'stream=width,height,r_frame_rate', '-of', 'csv=p=0', a.roh],
                      capture_output=True, text=True, check=True).stdout.strip().split(',')
w, h = int(info[0]), int(info[1])
num, den = info[2].split('/')
fps = float(num) / float(den)
print(f'Quelle: {w}x{h} @ {fps:.2f} fps', file=sys.stderr)

hoehe = round(a.breite * h / w / 2) * 2
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.roh, '-an', '-vf', f'scale={a.breite}:{hoehe}:flags=lanczos' + (f',{a.grade}' if a.grade else ''),
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
                '-movflags', '+faststart', f'assets/{a.ziel}.mp4'], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'assets/{a.ziel}.mp4', '-frames:v', '1', '-q:v', '3',
                f'assets/{a.ziel}.jpg'], check=True)

# Pfote vermessen (kleine Auflösung reicht)
kw, kh = 270, round(270 * h / w)
roh = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.roh, '-vf', f'scale={kw}:{kh}', '-f', 'rawvideo',
                      '-pix_fmt', 'gray', '-'], capture_output=True, check=True).stdout
bilder = np.frombuffer(roh, np.uint8).reshape(-1, kh, kw).astype(np.float32)
x0, x1, y0, y1 = int(a.x0 * kw), int(a.x1 * kw), int(a.y0 * kh), int(a.y1 * kh)
aus = bilder[:, y0:y1, x0:x1]
gewicht = np.clip(aus - 150, 0, None)
ys = np.arange(aus.shape[1])[None, :, None]
xs = np.arange(aus.shape[2])[None, None, :]
s = gewicht.sum((1, 2)) + 1e-6
cy = (gewicht * ys).sum((1, 2)) / s
cx = (gewicht * xs).sum((1, 2)) / s
signal = cy - cy.mean() + (cx - cx.mean()) * 0.5
k = np.ones(5) / 5
glatt = np.convolve(np.pad(signal, 2, mode='wrap'), k, 'valid')
wenden = []
for i in range(1, len(glatt) - 1):
    if (glatt[i] - glatt[i - 1]) * (glatt[i + 1] - glatt[i]) < 0 and abs(glatt[i] - np.median(glatt)) > 0.3 * np.std(glatt):
        wenden.append(round(i / fps, 2))
print(f'Hub der Pfote: {np.ptp(glatt):.1f} px (bei {kw} px Breite)', file=sys.stderr)
print('wenden:', wenden)

# Portal vermessen (violette Pixel in der Bildmitte, erstes Bild)
rgb = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.roh, '-frames:v', '1', '-vf', f'scale={kw * 2}:{kh * 2}',
                      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
im = np.frombuffer(rgb, np.uint8).reshape(kh * 2, kw * 2, 3).astype(float)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
m = (b > r * 1.05) & (b > g * 1.4) & (b > 60)
m[: int(kh * 2 * 0.25)] = False
m[int(kh * 2 * 0.85):] = False
ys, xs = np.nonzero(m)
cy, cx = int(np.median(ys)), int(np.median(xs))
reihe = np.nonzero(m[cy])[0]
spalte = np.nonzero(m[:, cx])[0]
W2, H2 = kw * 2, kh * 2
print('portal: { x: %.3f, y: %.3f, rx: %.4f, ry: %.4f }' % ((reihe.min() + reihe.max()) / 2 / W2, (spalte.min() + spalte.max()) / 2 / H2,
                                                          (reihe.max() - reihe.min()) / 2 / W2, (spalte.max() - spalte.min()) / 2 / H2))
