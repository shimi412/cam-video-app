"""Remplace l'étoile dessinée par le modèle par le vrai symbole CAM (trois chevrons ouverts).
usage: python3 pose-embleme.py image.png x0 y0 x1 y1 px py [teinte 0/1]
(x0..y1) = boîte de l'étoile, (px,py) = point de la plaque de poitrine (couleur de fond)."""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd
p, x0, y0, x1, y1, px, py = sys.argv[1], *map(int, sys.argv[2:8])
tint = len(sys.argv) > 8 and sys.argv[8] == "1"
import os; LOGO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "refs", "logo-cam.png")
im = Image.open(p).convert("RGB"); h = np.array(im).astype(int)
plate = h[py, px].copy()
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; r = max(x1 - x0, y1 - y0) / 2 * 1.12
M = Image.new("L", im.size, 0); d = ImageDraw.Draw(M)
for off in (-90, 90):
    d.polygon([(cx + r * math.cos(math.radians(off + k * 120)), cy + r * math.sin(math.radians(off + k * 120))) for k in range(3)], fill=255)
m = nd.binary_dilation(np.array(M) > 0, iterations=6)
star = m & (np.abs(h - plate).sum(2) > 35)
star = nd.binary_dilation(star, iterations=2) & m
h[star] = plate
L = np.array(Image.open(LOGO).convert("RGB")).astype(int)[94:536, 43:444]
a = np.clip((765 - L.sum(2)) / (765 - 450), 0, 1)
col = L * plate / 255 if tint else L
sym = Image.fromarray(np.dstack([col, a * 255]).astype("uint8"), "RGBA")
H = int((y1 - y0) * 1.08); s = sym.resize((int(sym.width * H / sym.height), H), Image.LANCZOS)
out = Image.fromarray(h.astype("uint8")); out.paste(s, (int(cx - s.width / 2), int(cy - s.height / 2)), s)
out.save(p)
print(p, "plaque", plate.tolist(), "pixels effacés", int(star.sum()))
