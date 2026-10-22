"""Plot Hole V4 : musique et bruitages synthétisés en local (aucun échantillon tiers). Grille 96 BPM.
Lit marks.json écrit par build.py. Tout changement passe par un fondu (règle de Shimi du 14/10).
- scènes 1 et 3 à 6 : pulsation sèche et basse, qui monte ;
- scènes 2 et 7 (moments lents) : la pulsation s'arrête, bourdon grave seul ;
- scène 9 « plot hole » : impact et accord tenu ; scène 10 : pulsation basse qui s'éteint ; « ? » final : impact sec.
Bruitages : un impact par trou, rien d'autre.
"""
import json
import wave
from pathlib import Path
import numpy as np

P = Path(__file__).parent
SR = 48000
MK = json.loads((P / "marks.json").read_text())
DUR = MK["dur"]
N = int(DUR * SR)
BEAT = 60 / 96


def write(name, a):
    a = np.clip(a, -0.98, 0.98)
    st = np.stack([a, np.roll(a, 9) * 0.97], axis=-1)
    with wave.open(str(P / "assets" / name), "w") as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes((st * 32767).astype("<i2").tobytes())


def put(arr, t, sig, gain=1.0):
    k = int(t * SR)
    n = min(len(sig), len(arr) - k)
    if k >= 0 and n > 0:
        arr[k:k + n] += sig[:n] * gain


def tt(d):
    return np.arange(int(d * SR)) / SR


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y


def kick(g=1.0):
    t = tt(0.35)
    return np.sin(2 * np.pi * (46 * t + 9 * (1 - np.exp(-t * 28)))) * np.exp(-t * 11) * g


def bass(f, d):
    t = tt(d)
    saw = 2 * ((f * t) % 1) - 1
    return lowpass(saw * (1 - np.exp(-t * 200)) * np.exp(-t * 5), 420)


def pluck(f, d=0.25):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t * 16) * (1 - np.exp(-t * 400))


def impact(g=1.0, d=1.2):
    t = tt(d)
    sub = np.sin(2 * np.pi * (38 * t + 14 * (1 - np.exp(-t * 18)))) * np.exp(-t * 3.2)
    tr = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 400) * 0.35
    return (sub + tr) * g


def thump(g=1.0):
    """coup sec de papier percé : transitoire bref, peu de grave."""
    t = tt(0.25)
    return (np.sin(2 * np.pi * (120 * t + 60 * (1 - np.exp(-t * 60)))) * np.exp(-t * 30) + np.sin(2 * np.pi * 2600 * t) * np.exp(-t * 500) * 0.4) * g


def drone(d, f=55):
    t = tt(d)
    env = np.minimum(1, t / 1.2) * np.minimum(1, np.maximum(0, (d - t) / 1.2))
    w = 1 + 0.15 * np.sin(2 * np.pi * 0.2 * t)
    return (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 1.5 * t) * w + 0.25 * np.sin(2 * np.pi * f * 2 * t)) * env


def chord(freqs, d):
    t = tt(d)
    env = (1 - np.exp(-t * 60)) * np.exp(-t * 0.7)
    s = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3) for f in freqs)
    return s / len(freqs) * env


music = np.zeros(N)
sfx = np.zeros(N)
A1 = 55.0
roots = [A1, A1, A1 * 4 / 3, A1 * 3 / 2]
arp = [2, 3, 4, 3, 5, 4, 3, 2]
scale = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5, 2]


def pulse(t0, t1, level0, level1, arp_on=True):
    """pulsation sur la grille, niveau interpolé de level0 à level1 (fondu, jamais de marche)."""
    b = int(np.ceil(t0 / BEAT - 1e-6))
    while b * BEAT < t1:
        t = b * BEAT
        level = level0 + (level1 - level0) * (t - t0) / max(1e-6, t1 - t0)
        bar = (b // 4) % 4
        if b % 2 == 0:
            put(music, t, kick(), 0.30 * level)
        put(music, t, bass(roots[bar], 0.45), 0.10 * level)
        if arp_on and b % 2 == 1:
            put(music, t, pluck(440 * scale[arp[b % 8]], .5), 0.035 * level)
        b += 1


# V4 : pulsation continue, un bourdon sur le passage sobre, impact sur chaque transition (whoosh grave), accord sur PLOT HOLE
s7a, s7b = MK["sober"]
TP, TQ = MK["plot"], MK["q_final"]
pulse(0.0, 3.2, 0.8, 0.8, arp_on=False)
pulse(3.2, s7a, 0.6, 1.05, arp_on=True)
put(music, s7a - .2, drone(s7b - s7a + 1.2, 55), 0.14)
pulse(s7b, TP - .2, 0.75, 1.05, arp_on=True)
put(music, TP, chord([220, 261.63, 329.63, 440, 523.25], DUR - TP), 0.24)
put(music, TP, chord([55, 110], DUR - TP), 0.28)
pulse(TP + 1.6, MK["logo_impact"] - .8, 0.5, 0.3, arp_on=False)
LG = MK["logo_impact"]
put(music, LG, chord([880, 1108.7, 1318.5], DUR - LG), 0.07)               # le logo se pose (comme le 5 octobre)


def whoosh(d=.6, g=1.0):
    """souffle doux : bruit filtré grave (aucun aigu), enveloppe en cloche."""
    t = tt(d)
    n = np.random.default_rng(7).standard_normal(len(t))
    env = np.sin(np.pi * np.minimum(1, t / d)) ** 2
    return lowpass(lowpass(n * env, 650), 650) * g


def soft(g=1.0):
    """coup sourd, sans transitoire aigu (retour de Shimi du 18/10 : les bruitages faisaient mal aux oreilles)."""
    t = tt(0.3)
    return np.sin(2 * np.pi * (70 * t + 25 * (1 - np.exp(-t * 40)))) * np.exp(-t * 14) * (1 - np.exp(-t * 300)) * g


def low_impact(g=1.0, d=1.2):
    t = tt(d)
    return np.sin(2 * np.pi * (38 * t + 14 * (1 - np.exp(-t * 18)))) * np.exp(-t * 3.2) * (1 - np.exp(-t * 200)) * g


for x in MK["transitions"]:
    put(sfx, max(0, x["t"] - .15), whoosh(x["d"] + .2), 0.22)
    put(sfx, x["t"] + x["d"] * .8, soft(), 0.25)
# Film-specific accents exist only when the composition declares them.
if MK.get("terrible") is not None:
    put(sfx, MK["terrible"] + .5, low_impact(d=0.9), 0.22)
if MK.get("strike") is not None:
    put(sfx, MK["strike"], soft(), 0.3)
put(sfx, TP, low_impact(1.0, 1.6), 0.3)
put(sfx, TQ, low_impact(d=1.0), 0.2)
put(sfx, LG, low_impact(1.0, 1.4), 0.32)                     # impact grave du logo

t = tt(DUR)
env = np.minimum(1, t / 0.02) * np.minimum(1, np.maximum(0, (DUR - t) / 1.6))
write("musique.wav", music * env)
write("bruitages.wav", sfx * env)
print("musique.wav + bruitages.wav", DUR, "s")
