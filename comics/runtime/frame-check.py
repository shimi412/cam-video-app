"""Deterministic still check before any clip is requested (Shimi, 2026-10-25).
Reports letterbox or pillarbox bars (uniform black or near-white rows/columns thicker than 3 % of
the frame, ending on a sharp straight edge across the frame) and a large uniform empty block (a
flat black or near-white rectangle covering more than 20 % of the frame with sharp edges).
Calibrated on the film "TEST FINAL ATTACK" (2399f947: panels 1, 2, 5, 6 have bars, 3, 4, 7 do not)
and on the Gazalighting reference stills, whose huge drawn black masses end on soft, jagged edges
(a skyline, a lamp beam) and must not read as bars. A failing image is redrawn by the director's
rework; this script never decides art direction. Output: one JSON line.
"""
import json
import subprocess
import sys

import numpy as np

W, H = 270, 480
BAR_SHARE, BLOCK_SHARE, SHARP = .03, .20, .6
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", sys.argv[1], "-vf", f"scale={W}:{H},format=gray", "-frames:v", "1", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
F = np.frombuffer(raw, np.uint8).reshape(H, W).astype(np.int16)


def padding_tone(mean):
    return mean < 28 or mean > 228


def uniform(line):
    return line.std() < 6 and padding_tone(line.mean())


def band(lines):
    """Thickness of the uniform band at the start of `lines` and the sharpness of its inner edge
    (share of the next three lines' pixels that differ strongly from the band tone)."""
    n = 0
    for line in lines:
        if not uniform(line):
            break
        n += 1
    if n == 0 or n >= len(lines):
        return n, 0.0
    return n, float((np.abs(lines[n:n + 3] - lines[n - 1].mean()) > 40).mean())


issues, bars = [], {}
for name, lines, share in (("top", F, H), ("bottom", F[::-1], H), ("left", F.T, W), ("right", F.T[::-1], W)):
    n, edge = band(lines)
    bars[name] = {"lines": int(n), "edge": round(edge, 2)}
    if n > share * BAR_SHARE and edge >= SHARP:
        issues.append(f"{'letterbox' if name in ('top', 'bottom') else 'pillarbox'} bar: {n} uniform {'rows' if name in ('top', 'bottom') else 'columns'} at the {name} of {share}, sharp edge")

# Largest flat padding-toned rectangle: 10 px cells, flat when their std is below 4, joined when their means are close.
C = 10
cells = F.reshape(H // C, C, W // C, C).transpose(0, 2, 1, 3).reshape(H // C, W // C, C * C)
mean = cells.mean(axis=2)
flat = (cells.std(axis=2) < 4) & ((mean < 28) | (mean > 228))
seen = np.zeros(flat.shape, bool)
best, best_box = 0, None
for i in range(flat.shape[0]):
    for j in range(flat.shape[1]):
        if not flat[i, j] or seen[i, j]:
            continue
        stack, comp, ref = [(i, j)], [], mean[i, j]
        seen[i, j] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < flat.shape[0] and 0 <= nx < flat.shape[1] and flat[ny, nx] and not seen[ny, nx] and abs(mean[ny, nx] - ref) < 12:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        ys, xs = [c[0] for c in comp], [c[1] for c in comp]
        box = (min(ys), max(ys) + 1, min(xs), max(xs) + 1)
        if len(comp) > best and len(comp) / ((box[1] - box[0]) * (box[3] - box[2])) >= .9:
            best, best_box = len(comp), box


def block_sharpness(box):
    """Mean sharpness of the block's four sides: a side on the frame edge is sharp; an inner side is the
    share of the three adjacent pixel lines that differ strongly from the block tone."""
    y0, y1, x0, x1 = box[0] * C, box[1] * C, box[2] * C, box[3] * C
    tone = F[y0:y1, x0:x1].mean()
    sides = []
    for lines in (F[max(0, y0 - 3):y0, x0:x1] if y0 > 0 else None, F[y1:y1 + 3, x0:x1] if y1 < H else None, F[y0:y1, max(0, x0 - 3):x0] if x0 > 0 else None, F[y0:y1, x1:x1 + 3] if x1 < W else None):
        sides.append(1.0 if lines is None or lines.size == 0 else float((np.abs(lines - tone) > 40).mean()))
    return float(np.mean(sides))


share = best / flat.size
block = {"share": round(float(share), 3), "sharp": round(block_sharpness(best_box), 2) if best_box else 0.0}
if share > BLOCK_SHARE and block["sharp"] >= SHARP:
    issues.append(f"uniform empty block covering {share * 100:.0f}% of the frame with sharp edges")
print(json.dumps({"issues": issues, "bars": bars, "block": block}))
