"""Ajoute des respirations entre les phrases d'une voix, sans la régénérer ni la ralentir.
usage: python3 pace-voice.py <voix.wav> <timing.json> <sortie.wav> <sortie-timing.json>
Coupe au milieu du silence entre deux phrases et y insère une pause. Décale le minutage en conséquence.
"""
import json
import sys
import numpy as np
import wave

src, tj, out, outj = sys.argv[1:5]
T = json.load(open(tj))
# Pause ajoutée AVANT la phrase n (secondes). Plus longue avant les changements de mouvement.
PAUSE = {2: 0.6, 3: 0.25, 4: 0.7, 5: 0.7, 6: 0.55, 7: 0.6, 8: 0.7, 9: 0.75}   # film attack Gazalighting, voix Harrison
EXTRA = {"during": 0.45, "its": 0.45}   # respiration entre les deux phrases des cases 4 et 8

with wave.open(src) as w:
    sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, ch)

words = T["words"]
ph = T["phrases"]
cuts = []  # (instant de coupe dans l'original, durée de pause)
for p in ph[1:]:
    n = p["phrase"]
    if n not in PAUSE:
        continue
    first = min(range(len(words)), key=lambda i: abs(words[i]["start"] - p["start"]))
    prev_end = words[first - 1]["end"] if first > 0 else p["start"]
    cuts.append(((prev_end + words[first]["start"]) / 2, PAUSE[n]))
for i, w_ in enumerate(words):
    k = "".join(ch for ch in w_["word"].lower() if ch.isalpha())
    if i > 0 and k in EXTRA and w_["word"][0].isupper():
        cuts.append(((words[i - 1]["end"] + w_["start"]) / 2, EXTRA[k]))
cuts.sort()
# Caler chaque coupe sur le silence réel le plus proche (fenêtre de 20 ms la plus calme à ±0,4 s)
mono = a[:, 0].astype(float)
win = int(0.02 * sr)
snapped = []
for c, d in cuts:
    k0, k1 = int((c - 0.4) * sr), int((c + 0.4) * sr)
    best = min(range(max(0, k0), min(len(mono) - win, k1), win // 2), key=lambda k: (mono[k:k + win] ** 2).mean())
    snapped.append(((best + win / 2) / sr, d, int(np.sqrt((mono[best:best + win] ** 2).mean()))))
for c, d, r in snapped:
    print(f"  coupe {c:6.2f} s  pause {d:.2f} s  niveau {r}")
cuts = [(c, d) for c, d, _ in snapped]


def shift(t):
    return t + sum(d for c, d in cuts if c <= t)


pieces, last_i = [], 0
for c, d in cuts:
    i = int(c * sr)
    pieces += [a[last_i:i], np.zeros((int(d * sr), ch), dtype="<i2")]
    last_i = i
pieces.append(a[last_i:])
b = np.concatenate(pieces)
with wave.open(out, "w") as w:
    w.setnchannels(ch)
    w.setsampwidth(sw)
    w.setframerate(sr)
    w.writeframes(b.tobytes())

T2 = dict(T)
T2["file"] = out.split("/")[-1]
T2["duration"] = len(b) / sr
T2["words"] = [dict(w_, start=round(shift(w_["start"]), 3), end=round(shift(w_["end"]), 3)) for w_ in words]
T2["phrases"] = [dict(p, start=round(shift(p["start"]), 3), end=round(shift(p["end"]), 3)) for p in ph]
json.dump(T2, open(outj, "w"), indent=1, ensure_ascii=False)
print(f"{T['duration']:.2f} s -> {T2['duration']:.2f} s, {len(cuts)} respirations")
