"""Vidéo attack Gazalighting : musique et bruitages synthétisés localement (reprise du concept 3 BD), calés sur cues.json.
Aucun échantillon tiers. Registre héroïque et grave : ostinato de cordes basses, timbales, nappe de cuivres.
Règles de Shimi (04/10) : bruitages rares, graves et bas, jamais un souffle sur chaque coupe ou transition.
"""
from pathlib import Path
import json
import wave
import numpy as np

P = Path(__file__).parent
C = json.loads((P / "cues.json").read_text())
SR = 48000
DUR = C["duration"]
N = int(DUR * SR)
SH = {int(k): v for k, v in C["shots"].items()}


def write(name, a):
    a = np.clip(a, -0.95, 0.95)
    st = np.stack([a, np.roll(a, 13) * 0.97], axis=-1)
    with wave.open(str(P / "assets" / name), "w") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((st * 32767).astype("<i2").tobytes())


def put(arr, t, sig, gain=1.0):
    k = int(t * SR)
    n = min(len(sig), len(arr) - k)
    if k >= 0 and n > 0:
        arr[k:k + n] += sig[:n] * gain


def t_(d):
    return np.arange(int(d * SR)) / SR


def lowpass(x, n=40):
    return np.convolve(x, np.ones(n) / n, mode="same")


def string(f, d=0.28):
    """Corde basse détachée : quelques harmoniques, attaque douce, filtrée."""
    t = t_(d)
    env = np.minimum(1, t / 0.015) * np.exp(-t * 6)
    s = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 7))
    return lowpass(s * env, 12)


def brass(f, d=2.0):
    """Nappe de cuivres : gonfle lentement, chaude."""
    t = t_(d)
    env = np.minimum(1, t / 0.5) * np.minimum(1, (d - t) / 0.6)
    s = sum(np.sin(2 * np.pi * f * k * t + 0.2 * np.sin(2 * np.pi * 5 * t)) / (k ** 1.3) for k in range(1, 8))
    return lowpass(s * env, 20)


def timpani(g=1.0, f0=58):
    t = t_(0.7)
    return (np.sin(2 * np.pi * (f0 * t + 4 * (1 - np.exp(-t * 12)))) * np.exp(-t * 6)) * g


def thump(g=1.0, f0=50):
    t = t_(0.35)
    return np.sin(2 * np.pi * (f0 * t + 5 * (1 - np.exp(-t * 18)))) * np.exp(-t * 14) * g


def step():
    t = t_(0.09)
    return lowpass(np.sin(2 * np.pi * 120 * t) * np.exp(-t * 45), 6)


def snip():
    t = t_(0.05)
    c = np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 120)
    out = np.zeros(int(0.12 * SR))
    out[:len(c)] += c
    out[int(0.06 * SR):int(0.06 * SR) + len(c)] += c * 0.7
    return out


def pull():
    t = t_(0.3)
    return np.sin(2 * np.pi * (220 - 120 * t) * t) * np.sin(np.pi * t / 0.3) ** 2 * 0.6


def hum(d, f=82):
    t = t_(d)
    env = np.minimum(1, t / 0.4) * np.exp(-np.maximum(0, t - d + 0.3) * 8)
    return np.sin(2 * np.pi * f * t + 3 * np.sin(2 * np.pi * 6 * t)) * env


def drone(d, f=55):
    t = t_(d)
    env = np.minimum(1, t / 1.2) * np.minimum(1, (d - t) / 1.2)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.5 * t) + 0.3 * np.sin(2 * np.pi * f * 0.5 * t)) * env


def ping():
    t = t_(0.6)
    return (np.sin(2 * np.pi * 1320 * t) + 0.4 * np.sin(2 * np.pi * 1980 * t)) * np.exp(-t * 9)


score = np.zeros(N)
sfx = np.zeros(N)
beat=60/100
for i,t in enumerate(np.arange(0,C["pull"],beat/2)):
    root=[73.42,73.42,58.74,65.41][(i//8)%4]
    put(score,t,string(root),.10)
    if i%8==0: put(score,t,brass(root,2),.04)
for index,(start,end,*_) in enumerate(SH.values()):
    if index%3==0: put(sfx,start+.3,thump(.6,46),.15)
put(score,C["logo_impact"],brass(146.84,2.2),.08)
put(sfx,C["logo_impact"],timpani(.6,44),.15)
tt=np.arange(N)/SR
env=np.minimum(1,tt/.2)*np.minimum(1,np.maximum(0,(DUR-tt)/1.0))
write("musique.wav",score*env)
write("bruitages.wav",sfx*env)
