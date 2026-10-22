"""Contrôle automatique des « flashs » : à 30 i/s, repère toute image qui change nettement puis revient à l'état
précédent en moins de 0,3 s (élément visible trop brièvement, ou qui apparaît avant son entrée).
Liste aussi les clips de index.html dont la durée est inférieure à 0,3 s.
usage : python3 detecte-flashs.py <video>"""
import re, subprocess, sys
import numpy as np
vid = sys.argv[1]
W, H = 108, 192
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vf", f"fps=30,scale={W}:{H},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
F = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.int16)
n = len(F)
cas = []
for t in range(1, n - 1):
    d = np.abs(F[t] - F[t - 1])
    if (d > 40).mean() < .004:          # moins de 0,4 % de l'image change franchement : rien à signaler
        continue
    for k in range(1, 9):              # revient-il à l'état d'avant en moins de 0,3 s ?
        if t + k >= n:
            break
        back = np.abs(F[t + k] - F[t - 1])
        if (back > 40).mean() < (d > 40).mean() * .15:
            ys, xs = np.nonzero(d > 40)
            cas.append((t / 30, k / 30, int(xs.mean() * 10), int(ys.mean() * 10), round((d > 40).mean() * 100, 2)))
            break
print(f"{n} images analysées")
for c in cas:
    print(f"  ⚠ flash à {c[0]:6.2f} s, durée {c[1]:.2f} s, vers ({c[2]}, {c[3]}), {c[4]} % de l'image")
print("flashs détectés :", len(cas))
s = open("index.html").read()
short = [(i, float(d)) for i, d in re.findall(r'id="([^"]+)" class="clip" data-start="[\d.]+" data-duration="([\d.]+)"', s) if float(d) < .3]
print("clips de moins de 0,3 s :", short if short else "aucun")
