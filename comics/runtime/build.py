"""Vidéo « attack » Gazalighting (univers comics CAM) : génère index.html et cues.json depuis timing.json.

Méthode : BINA/2 PROCESS/Videos attack univers comics - methode.md (film BD du 4 octobre).
- Les neuf clips vivent dans les cases d'une planche de BD (papier, bordures noires, gouttières). La caméra plonge
  dans une case, la tient pendant la phrase, recule par la gouttière et plonge dans la suivante. Aucune coupe sèche.
- Retour de Sacha (05/10) : l'univers porte l'histoire, le héros n'est entier qu'en case 9.
- Tout le texte est en code (titres, onomatopées, cartouches) ; rien n'est écrit par le générateur d'images.
- Signature : le logo CAM animé du film du 5 octobre (particules, étoile en 3D, onde, lettrage, trait).
Aucun temps n'est écrit à la main : tout se cale sur la voix (phrases et mots).
"""
import base64
import html
import json
import math
import random
import re
import subprocess
from pathlib import Path

P = Path(__file__).parent
T = json.loads((P / "timing.json").read_text())
FILM = json.loads((P / "film.json").read_text())
PANELS = FILM["panels"]
PH = {p["phrase"]: p for p in T["phrases"]}
WORDS = T["words"]
VOICE_END = T["duration"]
PULL = VOICE_END + 0.2           # la caméra recule sur la planche
CARD = PULL + 1.3                # signature CAM
LOGO_LEN = 4.3
DUR = round(CARD + LOGO_LEN, 2)

PAPER = "#F1E7CF"
INK = "#0B0B0F"
YELLOW = "#FFD93B"
RED = "#E2231A"
WHITE = "#FFFFFF"
NAVY, MID, LIGHT = "#203C6C", "#4083C1", "#4CA1DF"
CR = "#F0E8DA"


def norm(x):
    return re.sub(r"[^a-z0-9]", "", x.lower())


def word_at(token, after=0.0, nth=1):
    k = norm(token)
    seen = 0
    for w in WORDS:
        if w["start"] >= after - 0.01 and norm(w["word"]).startswith(k[:6]):
            seen += 1
            if seen == nth:
                return w["start"]
    raise ValueError(token)


def media_len(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]))


ids = iter(range(1, 100000))
screen, page_nodes, moves = [], [], []


def clip_div(dest, start, dur, track, inner="", style="", cid=None, extra=""):
    cid = cid or f"c{next(ids)}"
    dest.append(f'<div id="{cid}" class="clip" data-start="{start:.3f}" data-duration="{dur:.3f}" data-track-index="{track}" {extra} '
                f'style="position:absolute;{style}">{inner}</div>')
    return cid


def mv(s):
    moves.append(s)


# ------------------------------------------------------------ logo CAM vectoriel
STAR = {
    "navy": (NAVY, [(242.5, 95), (325.3, 238.5), (280.6, 238.5), (242.5, 172.5), (204.4, 238.5), (95, 238.5), (72.5, 199.5), (182.2, 199.5)]),
    "mid": (MID, [(391.3, 239.5), (436.3, 239.5), (381.6, 334.8), (441.4, 439), (276, 439), (298.5, 400.5), (374.2, 400.5), (336.3, 334.8)]),
    "light": (LIGHT, [(126.3, 295), (149.3, 334.9), (111.8, 400), (186.5, 400), (241.3, 494.9), (218.6, 533.8), (164.4, 439.5), (42.9, 439.5)]),
}
VB = (42, 94, 400, 441)
TINT = {"navy": "#7F96BF", "mid": "#9CC3E6", "light": "#B4DBF4"}
FROM = {"navy": (0, -1), "mid": (.87, .5), "light": (-.87, .5)}


def inside(pt, poly):
    x, y = pt
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def star_mask_uri():
    polys = "".join(f'<polygon points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="#000"/>' for _, pts in STAR.values())
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}">{polys}</svg>'
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def brand_star(cid, cx, cy, width, t, seed=7, nparts=18, sweep=True):
    """Moment de marque : particules bleues qui convergent, trois pièces en 3D avec échos, balayage de lumière."""
    x0, y0, vw, vh = VB
    s = width / vw
    h = vh * s
    left, top = cx - width / 2, cy - h / 2
    rnd = random.Random(seed)
    html_ = f'<div id="{cid}" style="position:absolute;left:{left:.0f}px;top:{top:.0f}px;width:{width:.0f}px;height:{h:.0f}px;perspective:1100px">'
    parts = []
    for k, (col, pts) in STAR.items():
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        n = 0
        while n < nparts:
            p = (rnd.uniform(min(xs), max(xs)), rnd.uniform(min(ys), max(ys)))
            if inside(p, pts):
                ang = rnd.uniform(0, 2 * math.pi)
                dist = rnd.uniform(520, 900)
                parts.append((k, col, (p[0] - x0) * s, (p[1] - y0) * s, math.cos(ang) * dist, math.sin(ang) * dist, rnd.uniform(10, 20)))
                n += 1
    for i, (k, col, px, py, dx, dy, r) in enumerate(parts):
        html_ += f'<div class="{cid}-pt" id="{cid}-pt{i}" style="position:absolute;left:{px - r / 2:.0f}px;top:{py - r / 2:.0f}px;width:{r:.0f}px;height:{r:.0f}px;border-radius:2px;background:{col};transform:rotate(45deg)"></div>'
    for k, (col, pts) in STAR.items():
        poly = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        for e, (c2, op) in enumerate([(TINT[k], .5), (TINT[k], .28)]):
            html_ += (f'<div id="{cid}-{k}-e{e}" style="position:absolute;left:0;top:0;width:{width:.0f}px;height:{h:.0f}px;opacity:0">'
                      f'<svg width="{width:.0f}" height="{h:.0f}" viewBox="{x0} {y0} {vw} {vh}"><polygon points="{poly}" fill="{c2}" opacity="{op}"/></svg></div>')
        html_ += (f'<div id="{cid}-{k}" style="position:absolute;left:0;top:0;width:{width:.0f}px;height:{h:.0f}px">'
                  f'<svg width="{width:.0f}" height="{h:.0f}" viewBox="{x0} {y0} {vw} {vh}"><polygon points="{poly}" fill="{col}"/></svg></div>')
    if sweep:
        m = star_mask_uri()
        html_ += (f'<div style="position:absolute;inset:0;overflow:hidden;-webkit-mask-image:url({m});-webkit-mask-size:100% 100%;mask-image:url({m});mask-size:100% 100%">'
                  f'<div id="{cid}-sw" style="position:absolute;left:-60%;top:-20%;width:45%;height:140%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);opacity:0"></div></div>')
    html_ += "</div>"
    # particules : arrivent de loin, convergent, puis s'effacent quand les pièces se posent
    for i, (k, col, px, py, dx, dy, r) in enumerate(parts):
        d = .55 + (i % 7) * .03
        mv(f'tl.fromTo("#{cid}-pt{i}",{{x:{dx:.0f},y:{dy:.0f},opacity:0}},{{x:0,y:0,opacity:1,duration:{d:.2f},ease:"power2.inOut"}},{t + (i % 9) * .02:.3f});')
    mv(f'tl.to(".{cid}-pt",{{opacity:0,scale:.2,duration:.25,ease:"power2.out"}},{t + .62:.3f});')
    for i, k in enumerate(("navy", "mid", "light")):
        fx, fy = FROM[k]
        ry = (-1) ** i * 95
        t1 = t + .45 + i * .1
        for e, lag in enumerate((.07, .14)):
            mv(f'tl.fromTo("#{cid}-{k}-e{e}",{{x:{fx * 260:.0f},y:{fy * 260:.0f},z:-700,rotationY:{ry},rotationX:35,opacity:0,transformPerspective:1100}},'
               f'{{x:0,y:0,z:0,rotationY:0,rotationX:0,opacity:1,duration:.75,ease:"back.out(1.25)"}},{t1 + lag:.3f});')
            mv(f'tl.to("#{cid}-{k}-e{e}",{{opacity:0,x:{fx * 18 * (e + 1):.0f},y:{fy * 18 * (e + 1):.0f},duration:.25,ease:"power2.out"}},{t1 + lag + .6:.3f});')
        mv(f'tl.fromTo("#{cid}-{k}",{{x:{fx * 260:.0f},y:{fy * 260:.0f},z:-700,rotationY:{ry},rotationX:35,opacity:0,transformPerspective:1100}},'
           f'{{x:0,y:0,z:0,rotationY:0,rotationX:0,opacity:1,duration:.75,ease:"back.out(1.25)"}},{t1:.3f});')
    if sweep:
        mv(f'tl.fromTo("#{cid}-sw",{{x:0,opacity:0}},{{x:{width * 2.3:.0f},opacity:1,duration:.7,ease:"power2.inOut"}},{t + 1.3:.3f});')
    return html_, h


# ---------------------------------------------------------------- planche
CW, CH, G = 1080, 1920, 100
BORDER = 22
# case -> (colonne, ligne, taille) ; 2 = case double.
LAYOUT = {}
for i in range(len(PANELS)):
    group, local = divmod(i, 3)
    LAYOUT[i + 1] = ((0, group * 2, 2) if local == 0 else (2, group * 2 + local - 1, 1))
PAGE_W = 3 * CW + 4 * G
PAGE_H = math.ceil(len(PANELS)/3) * 2 * CH + (math.ceil(len(PANELS)/3)*2+1)*G


def rect(c):
    col, row, n = LAYOUT[c]
    return (G + col * (CW + G), G + row * (CH + G), n * CW + (n - 1) * G, n * CH + (n - 1) * G)


def center(c):
    x, y, w, h = rect(c)
    return x + w / 2, y + h / 2


def focus_scale(c):
    x, y, w, h = rect(c)
    return 0.94 * min(1080 / w, 1920 / h)


order = list(range(1, len(PANELS)+1))
starts = {c: (0.0 if c == 1 else PH[c]["start"] - 0.15) for c in order}
ends = {c: (starts[c + 1] if c < len(PANELS) else PULL) for c in order}
TRANS = {}
for c in order[:-1]:
    n = c + 1
    d = round(min(1.0, 0.4 * (ends[c] - starts[c]), 0.4 * (ends[n] - starts[n])), 3)
    TRANS[c] = (starts[n] - 0.55 * d, starts[n] + 0.45 * d)
OPEN = 0.9

cues = {"shots": {}, "transitions": {}}
for c in order:
    vin = 0.0 if c == 1 else TRANS[c - 1][0]
    vout = TRANS[c][1] if c in TRANS else CARD + 0.6
    cues["shots"][c] = [round(starts[c], 3), round(ends[c], 3)]
    cues["transitions"][c] = [round(vin, 3), round(vout, 3)]

# ---------------------------------------------------------------- cases : image fixe avant, clip, dernière image après
# Case 2 : seules les 2,4 premières secondes du clip servent (ensuite Kling fait tomber les affiches).
# Case 9 (v3) : le héros de dos face au mur d'écrans de propagande ; le mot reste un titre, l'image ne le mime pas.
MAXSRC = {}
for c in order:
    x, y, w, h = rect(c)
    vin, vout = cues["transitions"][c]
    f = P / f"assets/clips/case-{c:02d}.mp4"
    L = min(media_len(f), MAXSRC.get(c, 99))
    win = vout - vin
    rate = round(max(0.5, min(2.0, (L - 0.05) / win)), 3) if L - 0.05 < win else 1.0
    timed = P / f"assets/clips/case-{c:02d}-timed.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-vf", f"setpts=PTS/{rate},fps=30,tpad=stop_mode=clone:stop_duration={win},trim=duration={win}", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", str(timed)],check=True)
    f = timed
    rate = 1.0
    last_t = win - 0.04
    after = P / f"assets/stills/case-{c:02d}-fin.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{last_t:.3f}", "-i", str(f), "-frames:v", "1", "-q:v", "2", str(after)], check=True)
    before = P / f"assets/stills/case-{c:02d}-debut.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-frames:v", "1", "-q:v", "2", str(before)], check=True)
    fit = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
    inner = (f'<div id="inner{c}" style="position:absolute;inset:0">'
             f'<img src="assets/stills/case-{c:02d}-debut.jpg" style="{fit}">'
             f'<img id="fin{c}" src="assets/stills/case-{c:02d}-fin.jpg" style="{fit};opacity:0">'
             f'<video id="shot{c}" class="clip" data-start="{vin:.3f}" data-duration="{win:.3f}" data-track-index="{1 + (c % 2)}" '
             f'src="assets/clips/case-{c:02d}-timed.mp4" data-media-start="0"{f" data-playback-rate={chr(34)}{rate}{chr(34)}" if rate != 1 else ""} '
             f'muted playsinline style="{fit}"></video></div>')
    page_nodes.append(f'<div id="case{c}" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;overflow:hidden;'
                      f'background:{INK};outline:{BORDER}px solid {INK}">{inner}</div>')
    if vout < DUR:
        mv(f'tl.set("#fin{c}",{{opacity:1}},{vout - 0.02:.3f});')
    cues["shots"][c].append(rate)


# ---------------------------------------------------------------- caméra locale dans la case (Shimi, 25/10/2026)
# Une case « local » est l'image validée en boucle : son mouvement se fait ici, en plus de la caméra de planche.
# push : échelle 1.00 -> 1.06 (subtle) / 1.12 (medium) ; pull : l'inverse ; pans et tilts : translation de 4 % / 8 %
# du cadre avec une légère échelle pour qu'aucun bord n'apparaisse ; hold : rien. Un clip généré garde le comportement existant.
LOCAL_MOVES = []
for c in order:
    p = PANELS[c - 1]
    if p.get("motion") != "local":
        continue
    move = p.get("cameraMove") or {}
    kind, amount = move.get("kind", "hold"), move.get("amount", "subtle")
    if kind == "hold":
        continue
    x, y, w, h = rect(c)
    vin, vout = cues["transitions"][c]
    zoom = 1.06 if amount == "subtle" else 1.12
    shift = 0.04 if amount == "subtle" else 0.08
    if kind == "push":
        a, b = {"scale": 1.0}, {"scale": zoom}
    elif kind == "pull":
        a, b = {"scale": zoom}, {"scale": 1.0}
    else:
        s = round(1 + shift * 1.3, 3)
        dx, dy = round(w * shift / 2, 1), round(h * shift / 2, 1)
        # La caméra tourne vers la gauche : l'image glisse vers la droite ; vers le haut : l'image descend.
        a, b = {"pan-left": ({"scale": s, "x": -dx}, {"scale": s, "x": dx}), "pan-right": ({"scale": s, "x": dx}, {"scale": s, "x": -dx}),
                "tilt-up": ({"scale": s, "y": -dy}, {"scale": s, "y": dy}), "tilt-down": ({"scale": s, "y": dy}, {"scale": s, "y": -dy})}[kind]
    mv(f'tl.fromTo("#inner{c}",{json.dumps(a)},{{...{json.dumps(b)},duration:{vout - vin:.3f},ease:"sine.inOut"}},{vin:.3f});')
    LOCAL_MOVES.append({"panel": c, "kind": kind, "amount": amount, "from": vin, "to": vout})
cues["localMoves"] = LOCAL_MOVES


# ---------------------------------------------------------------- caméra
def cam_state(c, k=1.0):
    cx, cy = center(c)
    s = focus_scale(c) * k
    return dict(x=-cx, y=-cy, s=s)


def cam_to(st, t, d, ease, rot=0.0):
    mv(f'tl.to("#page",{{x:{st["x"]:.1f},y:{st["y"]:.1f},duration:{d:.3f},ease:"{ease}"}},{t:.3f});')
    mv(f'tl.to("#cam",{{scale:{st["s"]:.4f},rotation:{rot},duration:{d:.3f},ease:"{ease}"}},{t:.3f});')


PUSH = 1.035
s1 = cam_state(1)
mv(f'tl.set("#page",{{x:{s1["x"]:.1f},y:{s1["y"] + 600:.1f}}},0);tl.set("#cam",{{scale:{s1["s"] * 0.55:.4f},rotation:-2}},0);')
cam_to(s1, 0, OPEN, "power3.out")
prev_end = OPEN
for c in order:
    hold_end = TRANS[c][0] if c in TRANS else PULL
    cam_to(cam_state(c, PUSH), prev_end, hold_end - prev_end, "sine.inOut")
    if c in TRANS:
        n = c + 1
        t0, t1 = TRANS[c]
        d = t1 - t0
        (ax, ay), (bx, by) = center(c), center(n)
        mid = dict(x=-(ax + bx) / 2, y=-(ay + by) / 2, s=0.52 * min(focus_scale(c), focus_scale(n)))
        rot = 1.6 if c % 2 else -1.6
        cam_to(mid, t0, d * 0.5, "power2.in", rot)
        cam_to(cam_state(n), t0 + d * 0.5, d * 0.5, "power2.out", 0)
        prev_end = t1
xs = [rect(c) for c in order[-3:]]          # recul final sur les dernières cases
fx0, fy0 = min(r[0] for r in xs), min(r[1] for r in xs)
fx1, fy1 = max(r[0] + r[2] for r in xs), max(r[1] + r[3] for r in xs)
final = dict(x=-(fx0 + fx1) / 2, y=-(fy0 + fy1) / 2, s=0.9 * min(1080 / (fx1 - fx0 + 2 * G), 1920 / (fy1 - fy0 + 2 * G)))
cam_to(final, PULL, 1.2, "power3.inOut", 0)
cues["pull"] = PULL

# ---------------------------------------------------------------- lettrage BD (titres en espace écran, zone sûre x 100-940, y 262-1480)
FONT = "font-family:Bangers;letter-spacing:2px;text-transform:uppercase"


def title_css(size=118, color=WHITE, top=300):
    return (f"left:100px;top:{top}px;width:840px;text-align:center;{FONT};color:{color};font-size:{size}px;line-height:1.0;"
            f"-webkit-text-stroke:7px {INK};paint-order:stroke fill;text-shadow:9px 9px 0 {INK}")


# Contrôle qualité (retour de Shimi du 18/10 : « WAR ENDED. » apparaissait l'espace d'une seconde, comme un jump cut raté).
# Toute apparition à l'écran (titre, cartouche, tampon, onomatopée, compteur) enregistre sa fenêtre pleinement visible ;
# le build s'arrête si l'une dure moins de MIN_VISIBLE.
MIN_VISIBLE = 0.8
VISIBLE = []


def seen(name, t_in, t_out):
    VISIBLE.append((name, t_in, t_out))


def title(t_in, t_out, txt, size=118, color=WHITE, top=300, frm="scale:1.5,rotation:4", rot=-2, cid=None):
    seen("titre " + re.sub("<[^>]+>|&[a-z#0-9]+;", " ", txt), t_in + 0.32, t_out - 0.2)
    cid = clip_div(screen, t_in, t_out - t_in, 10, style=title_css(size, color, top), inner=txt, cid=cid)
    mv(f'tl.fromTo("#{cid}",{{{frm},opacity:0}},{{x:0,y:0,scale:1,opacity:1,rotation:{rot},duration:.32,ease:"back.out(2)"}},{t_in:.3f});')
    mv(f'tl.to("#{cid}",{{opacity:0,duration:.2}},{t_out - 0.2:.3f});')
    return cid


def ends_before(c, margin=0.25):
    return (TRANS[c][0] if c in TRANS else PULL) - margin


# Data-driven titles and captions. All text is escaped; no generated code or arbitrary HTML.
# Captions only since 2026-10-25 (Shimi): film.json carries no narration title any more, so this
# loop renders nothing for new films; it stays for a panel that still carries a title.
# A title too short to read (< MIN_VISIBLE fully visible) is repaired here without Claude
# (2026-10-21): carried through the transition up to just before the next title enters, or
# dropped when even that cannot hold it. Every repair is recorded and disclosed for review.
TITLE_IN, TITLE_FADE = 0.32, 0.2
TITLE_REPAIRS = []
ENTRANCES = []
for c in order:
    p = PANELS[c-1]
    if not p.get("title"):
        continue
    txt = p["title"]
    words = txt.split()
    lines, line = [], ""
    for word in words:
        if line and len(line + " " + word) > 18:
            lines.append(line); line = word
        else:
            line = (line + " " + word).strip()
    if line: lines.append(line)
    size = min(112, 760 / max(len(x) for x in lines) * 1.5)
    t_in, t_out = starts[c] + .1, ends_before(c, 0)
    if t_out - t_in - TITLE_IN - TITLE_FADE < MIN_VISIBLE:
        if c == len(PANELS):
            limit = CARD
        elif PANELS[c].get("title"):
            limit = starts[c + 1] + .05
        else:
            limit = ends_before(c + 1, 0)
        t_out = max(t_out, min(limit, t_in + TITLE_IN + TITLE_FADE + MIN_VISIBLE + .3))
        visible = round(t_out - t_in - TITLE_IN - TITLE_FADE, 3)
        if visible < MIN_VISIBLE:
            TITLE_REPAIRS.append({"panel": c, "action": "dropped", "visible": visible})
            continue
        TITLE_REPAIRS.append({"panel": c, "action": "carried", "visible": visible})
    ENTRANCES.append(round(t_in, 3))
    title(t_in, t_out, "<br>".join(html.escape(x) for x in lines), size=size, rot=0, frm="y:45", cid=f"title{c}")

# Captions hold at most two lines so the safe zone (text bottom <= 1481 px) holds:
# about 34 characters at 52 px, up to 52 characters at 44 px when a short group is merged.
CAP_CHARS, CAP_MERGE = 34, 52
cues["subs"] = []
if FILM.get("captions", True):
    def text_of(g):
        return " ".join(w["word"] for w in g)
    groups = []
    cursor = 0
    while cursor < len(WORDS):
        end = cursor + 1
        while end < len(WORDS) and end - cursor < 6 and len(text_of(WORDS[cursor:end + 1])) <= CAP_CHARS:
            end += 1
        while end < len(WORDS) and WORDS[end-1]["end"] - WORDS[cursor]["start"] < .8 and len(text_of(WORDS[cursor:end + 1])) <= CAP_MERGE:
            end += 1
        group = WORDS[cursor:end]
        if groups and group[-1]["end"] - group[0]["start"] < .8 and len(text_of(groups[-1] + group)) <= CAP_MERGE:
            groups[-1].extend(group)
        else:
            groups.append(group)
        cursor = end
    for gi, group in enumerate(groups):
        st=group[0]["start"]
        en=min(groups[gi+1][0]["start"] if gi+1<len(groups) else group[-1]["end"]+.4, group[-1]["end"]+.6)
        text=text_of(group)
        font = 52 if len(text) <= CAP_CHARS else 44
        sp=" ".join(f'<span id="w{gi}_{k}">{html.escape(w["word"])}</span>' for k,w in enumerate(group))
        clip_div(screen,st,en-st,20,cid=f"sub{gi}",style="left:120px;top:1290px;width:800px;display:flex;justify-content:center",inner=f'<div style="max-width:800px;text-align:center;text-wrap:balance;background:{YELLOW};color:{INK};border:6px solid {INK};padding:10px 22px 6px;{FONT};font-size:{font}px;line-height:1.12">{sp}</div>')
        for k,w in enumerate(group): mv(f'tl.set("#w{gi}_{k}",{{color:"{RED}"}},{w["start"]:.3f});')
        cues["subs"].append([st,en,text]); seen("caption "+text,st,en)

# ---------------------------------------------------------------- signature CAM animée (reprise du film du 5 octobre)
TL = CARD + 0.45
LS = .74
sw17 = VB[2] * LS
ox = 540 - (1157 - 42) * LS / 2
oy = 880 - (534 - 94) * LS / 2
SCX, SCY = ox + sw17 / 2, oy + VB[3] * LS / 2
st17, sh17 = brand_star("bs17", SCX, SCY, sw17, TL, seed=11, nparts=22)
lines17 = ""
for k, (y0, y1) in enumerate([(0, 76), (95, 174), (193, 271)]):
    lines17 += (f'<div id="lt{k}" style="position:absolute;left:{ox + (536 - 42) * LS:.0f}px;top:{oy + (198 - 94 + y0) * LS:.0f}px;width:{622 * LS:.0f}px;height:{(y1 - y0) * LS:.0f}px;overflow:hidden">'
                f'<img src="assets/logo-cam-texte.png" style="position:absolute;left:0;top:{-y0 * LS:.0f}px;width:{622 * LS:.0f}px;height:{271 * LS:.0f}px"></div>')
ring = f'<div id="rg17" style="position:absolute;left:{SCX - 60:.0f}px;top:{SCY - 60:.0f}px;width:120px;height:120px;border-radius:50%;border:5px solid {LIGHT};opacity:0"></div>'
bar17 = (f'<div id="rl17" style="position:absolute;left:{ox:.0f}px;top:{oy + VB[3] * LS + 70:.0f}px;width:{(1157 - 42) * LS:.0f}px;height:3px;'
         f'background:{NAVY};transform-origin:left center"></div>')
clip_div(screen, CARD, DUR - CARD, 30, cid="card", style=f"inset:0;background:{CR}",
         inner=f'<div id="lg17" style="position:absolute;inset:0">{ring}{st17}{lines17}{bar17}</div>')
mv(f'tl.fromTo("#card",{{clipPath:"circle(0px at 540px 960px)"}},{{clipPath:"circle(1200px at 540px 960px)",duration:.45,ease:"power3.in"}},{CARD:.3f});')
LAND = TL + .45 + .2 + .75
mv(f'tl.fromTo("#rg17",{{scale:.3,opacity:1}},{{scale:14,opacity:0,duration:1.1,ease:"power2.out"}},{LAND - .25:.3f});')
for k in range(3):
    mv(f'tl.fromTo("#lt{k}",{{clipPath:"inset(0% 100% 0% 0%)",y:24}},{{clipPath:"inset(0% 0% 0% 0%)",y:0,duration:.55,ease:"power3.out"}},{TL + 1.2 + k * .14:.3f});')
mv(f'tl.fromTo("#rl17",{{scaleX:0}},{{scaleX:1,duration:.6,ease:"power3.inOut"}},{TL + 1.45:.3f});')
LOGO_NET = TL + 1.45 + .6
mv(f'tl.fromTo("#lg17",{{scale:1}},{{scale:1.03,duration:{DUR - TL - .8:.2f},ease:"sine.out"}},{TL + .8:.3f});')
cues["card"] = CARD
cues["logo_impact"] = LAND
if LOGO_NET + 1.8 > DUR + .01:
    print(f"⚠ DUR trop courte : {DUR} < {LOGO_NET + 1.8:.2f}")

# ---------------------------------------------------------------- audio
cues["phrases"] = {p: [PH[p]["start"], PH[p]["end"]] for p in PH}
cues["duration"] = DUR

(P / "cues.json").write_text(json.dumps(cues, indent=1))

audio = ""

fonts = ('@font-face{font-family:Bangers;src:url("assets/fonts/bangers.ttf")}'
         '@font-face{font-family:Mont;src:url("assets/fonts/montserrat.ttf");font-weight:100 900}')
cam = (f'<div id="cam" style="position:absolute;left:540px;top:960px;width:0;height:0;transform-origin:0 0">'
       f'<div id="page" style="position:absolute;left:0;top:0;width:{PAGE_W}px;height:{PAGE_H}px;background:{PAPER}">'
       + "".join(page_nodes) + '</div></div>')
doc = f'''<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920">
<title>CAM Attack</title><script src="assets/gsap.min.js"></script>
<style>{fonts}*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:1080px;height:1920px;overflow:hidden;background:{PAPER}}}
#root{{position:relative;width:1080px;height:1920px;overflow:hidden;background:{PAPER}}}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="1080" data-height="1920">
{cam}{"".join(screen)}{audio}</div>
<script>const tl=gsap.timeline({{paused:true}});{"".join(moves)}tl.to("#root",{{opacity:1,duration:{DUR},ease:"none"}},0);window.__timelines=window.__timelines||{{}};window.__timelines["main"]=tl;</script>
</body></html>'''
(P / "index.html").write_text(doc)
(P / "visibility.json").write_text(json.dumps(VISIBLE))
bad = [(n, a, b - a) for n, a, b in VISIBLE if b - a < MIN_VISIBLE]
(P / "build-audit.json").write_text(json.dumps({"duration":DUR,"logoAt":CARD,"panels":len(PANELS),"titleRepairs":TITLE_REPAIRS,"titleEntrances":ENTRANCES,"localMoves":LOCAL_MOVES,"briefItems":[f"{n} ({d:.2f} s at {a:.2f} s)" for n, a, d in bad]}))
print(f"contrôle durée d'affichage (≥ {MIN_VISIBLE} s) :", len(VISIBLE), "apparitions,", len(bad), "trop courtes,", len(TITLE_REPAIRS), "titres réparés")
for n, a, d in bad:
    print(f"  ⚠ {a:6.2f} s  {d:.2f} s  {n}")
print("index.html :", len(page_nodes), "éléments de planche,", len(screen), "éléments écran,", DUR, "s")
# No SystemExit: remaining brief items are reported in build-audit.json and block review in render.ts.
for c in order:
    s, e, r = cues["shots"][c]
    vin, vout = cues["transitions"][c]
    print(f"  case {c}: phrase {s:6.2f} -> {e:6.2f}  clip visible {vin:6.2f} -> {vout:6.2f}  vitesse {r}")
