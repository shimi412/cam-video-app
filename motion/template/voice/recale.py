"""Recale un minutage Whisper sur la parole réelle (segments entre silences), puis recalcule les phrases.
usage: python3 recale.py <voix.wav> <timing.json> <sortie.json>
Chaque mot est rattaché au segment de parole où tombe son milieu (ou au plus proche) ; dans chaque segment,
les mots sont étirés linéairement entre le début et la fin réels de la parole. Les débuts de phrase sont
retrouvés par paires de mots du script.
"""
import json
import re
import subprocess
import sys

wav, tj, out = sys.argv[1:4]
T = json.load(open(tj))
W = T["words"]
log = subprocess.run(["ffmpeg", "-i", wav, "-af", "silencedetect=n=-40dB:d=0.15", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
ss = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
se = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
dur = T["duration"]
# segments de parole
bounds = [0.0] + se
ends = ss + [dur]
if ss and ss[0] < 0.05:  # le fichier commence par un silence
    bounds, ends = se, ss[1:] + [dur]
segs = [(a, b) for a, b in zip(bounds, ends) if b - a > 0.12]
# Fusionner les segments séparés par une micro-pause (< 0,25 s) : ce n'est pas une frontière de phrase
merged = [segs[0]]
for a, b in segs[1:]:
    if a - merged[-1][1] < 0.25:
        merged[-1] = (merged[-1][0], b)
    else:
        merged.append((a, b))
segs = merged
# Attaque réelle de la voix au début du fichier (premier instant au-dessus du seuil)
import wave as _w, numpy as _np
with _w.open(wav) as _f:
    _sr, _ch = _f.getframerate(), _f.getnchannels()
    _a = _np.frombuffer(_f.readframes(_f.getnframes()), dtype="<i2").reshape(-1, _ch)[:, 0].astype(float)
_win = int(0.01 * _sr)
_on = next(i for i in range(0, len(_a) - _win, _win) if _np.sqrt((_a[i:i + _win] ** 2).mean()) > 300) / _sr
segs[0] = (max(segs[0][0], round(_on, 3)), segs[0][1])


# Frontières : chaque silence réel est rattaché à la fin de mot ponctuée la plus proche (ordre croissant).
punct = [k for k, w in enumerate(W[:-1]) if w["word"][-1] in ",.?!;:"]
cut_after, last = [], -1
for g in range(len(segs) - 1):
    gap = (segs[g][1] + segs[g + 1][0]) / 2
    cands = [k for k in punct if k > last]
    k = min(cands, key=lambda k: abs(W[k]["end"] - gap))
    cut_after.append(k)
    last = k
groups, s0 = [], 0
for k in cut_after + [len(W) - 1]:
    groups.append(list(range(s0, k + 1)))
    s0 = k + 1
new = []
for (a, b), ws in zip(segs, groups):
    weights = [len(re.sub(r"[^A-Za-z0-9]", "", W[k]["word"])) + 2 for k in ws]
    tot = sum(weights)
    t = a
    for k, wgt in zip(ws, weights):
        d = (b - a) * wgt / tot
        new.append((k, dict(W[k], start=round(t, 3), end=round(t + d, 3))))
        t += d
W2 = [w for _, w in new]


def norm(x):
    return re.sub(r"[^a-z0-9]", "", x.lower())


firsts = [("jews","control"),("really","then"),("then","somebody"),("if","jews"),("if","jews"),("and","if"),("make","it"),("apparently","jews"),("thats","not"),("maybe","stop")]
texts = [p["text"] for p in T["phrases"]]
starts, i = [], 0
for a, b in firsts:
    while not (norm(W2[i]["word"]).startswith(a) and norm(W2[i + 1]["word"]).startswith(b)):
        i += 1
    starts.append(i)
    i += 1
ph = []
for k, s in enumerate(starts):
    e = (starts[k + 1] - 1) if k + 1 < len(starts) else len(W2) - 1
    ph.append({"phrase": k + 1, "start": W2[s]["start"], "end": W2[e]["end"], "text": texts[k]})
T2 = dict(T, words=W2, phrases=ph, segments=segs)
json.dump(T2, open(out, "w"), indent=1, ensure_ascii=False)
print(len(segs), "segments de parole,", len(W2), "mots")
for p in ph:
    print(f"{p['phrase']:2d} {p['start']:6.2f} -> {p['end']:6.2f}")
