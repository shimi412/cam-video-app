"""Planche « raccords » : pour chaque transition (marks.json), images à t-1,0 / t-0,6 / t-0,3 / t / t+0,3.
usage : python3 planche-raccords.py <video> <sortie.jpg>"""
import json, subprocess, sys, tempfile
from pathlib import Path
P = Path(__file__).parent
vid, out = sys.argv[1], sys.argv[2]
tr = json.loads((P / "marks.json").read_text())["transitions"]
tmp = Path(tempfile.mkdtemp())
rows = []
for k, x in enumerate(tr):
    cells = []
    for j, dt in enumerate((-1.0, -.6, -.3, 0, .3)):
        f = tmp / f"{k:02d}_{j}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, x['t'] + dt):.3f}", "-i", vid, "-frames:v", "1", "-vf", "scale=216:384", str(f)], check=True)
        cells.append(f)
    r = tmp / f"row{k:02d}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y"] + sum([["-i", str(c)] for c in cells], []) + ["-filter_complex", "hstack=5,pad=iw+8:ih+8:4:4:gray", str(r)], check=True)
    rows.append(r)
half = (len(rows) + 1) // 2
cols = []
for part in (rows[:half], rows[half:]):
    c = tmp / f"col{len(cols)}.png"
    if len(part) < half:
        part = part + [rows[-1]]
    subprocess.run(["ffmpeg", "-v", "error", "-y"] + sum([["-i", str(r)] for r in part], []) + ["-filter_complex", f"vstack={len(part)}", str(c)], check=True)
    cols.append(c)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(cols[0]), "-i", str(cols[1]), "-filter_complex", "hstack=2,pad=iw+40:ih:20:0:gray", "-q:v", "3", out], check=True)
print(len(tr), "transitions ->", out)
