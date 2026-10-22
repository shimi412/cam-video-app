"""Plot Hole, V4 (18/10/2026) : la grammaire du film CAM du 5 octobre, sans personnage.
Un seul grand plan : dix scènes pleines, un fond différent presque à chaque fois, et la caméra entre dans un élément
de la scène pour découvrir la suivante (iris depuis un signe, bande qui s'ouvre, panoramique qui suit une chute,
recul au noir). Un objet typographique par scène (journal, fil social, carte citée, flèche qui fait demi-tour,
mot barré, trou dans HOLE). Grille 96 BPM, accents sur les mots-clés, ressorts, un seul passage sobre.
Zones sûres Instagram : tout ce qui se lit vit dans x 120-940, y 262-1480. Rien ne naît dans les 0,6 s avant une
transition (check_holds). Machinerie reprise de cam-oct05-v2/concept-2-motion-arcane/montage/build.py.
"""
import base64
import html
import json
import math
import random
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

P = Path(__file__).parent
T = json.loads((P / "timing.json").read_text())
WD = T["words"]
DUR = 46.2
BEAT = 60 / 96

NAVY, MID, LIGHT = "#203C6C", "#4083C1", "#4CA1DF"
CR, CO, K = "#F0E8DA", "#E85240", "#0F0F11"
SL, SR = 120, 940
SW = SR - SL
CX = 540


# ------------------------------------------------------------ typo (Archivo variable, largeurs mesurées avec fontTools)
_fonts = {}


def em(text, wght, wdth):
    key = (wght, wdth)
    if key not in _fonts:
        g = instantiateVariableFont(TTFont(str(P / "assets/fonts/archivo.ttf")), {"wght": wght, "wdth": wdth})
        _fonts[key] = (g.getBestCmap(), g["hmtx"], g["head"].unitsPerEm)
    cmap, hm, upm = _fonts[key]
    return sum(hm[cmap.get(ord(c), cmap[ord("M")])][0] for c in text) / upm


def fit(lines, maxw=SW, wght=900, wdth=125, cap=300):
    return int(min([cap] + [maxw / em(s, wght, wdth) for s in lines]))


def arc(wght=900, wdth=125):
    return f"font-family:Arc;font-variation-settings:'wght' {wght},'wdth' {wdth};text-transform:uppercase;white-space:nowrap"


def fvs(wght, wdth):
    return f"\"'wght' {wght},'wdth' {wdth}\""


# ------------------------------------------------------------ éléments et mouvements
ids = iter(range(1, 100000))
nodes, moves = [], []


def node(start, end, track, inner="", style="", cid=None, extra=""):
    cid = cid or f"e{next(ids)}"
    nodes.append(f'<div id="{cid}" class="clip" data-start="{start:.3f}" data-duration="{end - start:.3f}" '
                 f'data-track-index="{track}" {extra} style="position:absolute;z-index:{track};{style}">{inner}</div>')
    return cid


def mv(s):
    moves.append(s)


def beats(t0, t1):
    b = math.ceil(t0 / BEAT - 1e-6)
    while b * BEAT < t1 - .05:
        yield b * BEAT
        b += 1


def land(sel, t, frm="y:120,scale:1.25", dur=.55, ease="back.out(1.6)"):
    mv(f'tl.fromTo("{sel}",{{{frm},opacity:0}},{{x:0,y:0,scale:1,rotation:0,opacity:1,duration:{dur},ease:"{ease}"}},{t:.3f});')


def swing(sel, t, dx=-300, dur=.55):
    mv(f'tl.fromTo("{sel}",{{x:{dx},opacity:0,skewX:{-12 if dx < 0 else 12}}},{{x:0,opacity:1,skewX:0,duration:{dur},ease:"back.out(1.4)"}},{t:.3f});')


def morph(sel, t, a, b, dur=.5, ease="back.out(1.5)"):
    mv(f'tl.fromTo("{sel}",{{fontVariationSettings:{fvs(*a)}}},{{fontVariationSettings:{fvs(*b)},duration:{dur},ease:"{ease}",immediateRender:false}},{t:.3f});')


def fade(sel, t, dur=.6, to=1):
    mv(f'tl.fromTo("{sel}",{{opacity:0}},{{opacity:{to},duration:{dur},ease:"none"}},{t:.3f});')


def bar(cid, x, y, wpx, h=14, color=CO, extra=""):
    return f'<div id="{cid}" style="position:absolute;left:{x:.0f}px;top:{y:.0f}px;width:{wpx:.0f}px;height:{h}px;background:{color};transform-origin:left center;{extra}"></div>'


def draw(sel, t, dur=.32):
    mv(f'tl.fromTo("{sel}",{{scaleX:0}},{{scaleX:1,duration:{dur},ease:"power3.inOut"}},{t:.3f});')


def drift(sel, t0, t1, y=-160, x=0):
    mv(f'tl.fromTo("{sel}",{{x:0,y:0}},{{x:{x},y:{y},duration:{t1 - t0:.2f},ease:"none"}},{t0:.3f});')


def letters(text, cls):
    return "".join(f'<span class="{cls}" style="display:inline-block">{html.escape(c) if c != " " else "&nbsp;"}</span>' for c in text)


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



def txt(cid, top, text, size, wght=900, wdth=125, color=CR, extra="", left=SL, width=SW, align="center"):
    return (f'<div id="{cid}" style="position:absolute;left:{left}px;top:{top}px;width:{width}px;text-align:{align};{arc(wght, wdth)};'
            f'font-size:{size}px;line-height:1;color:{color};{extra}">{text}</div>')


# ------------------------------------------------------------ scènes, événements, transitions (grammaire du 5 octobre)
SC = {}          # id -> [t_in, t_out, bg, contenu]
EV = []          # (scène, début, fin, libellé) : animations ponctuelles, pour la vérification de tenue
TR = []          # (temps, durée, technique, de, vers)
cur = [None]


def scene(sid, bg):
    SC[sid] = [None, None, bg, []]
    cur[0] = sid


def put(html_):
    SC[cur[0]][3].append(html_)


def ev(t0, t1, what=""):
    EV.append((cur[0], t0, t1, what))


def L(sel, t, frm="y:120,scale:1.25", dur=.55, ease="back.out(1.6)"):
    land(sel, t, frm, dur, ease); ev(t, t + dur, sel)


def SWG(sel, t, dx=-300, dur=.55):
    swing(sel, t, dx, dur); ev(t, t + dur, sel)


def MO(sel, t, a, b, dur=.5, ease="back.out(1.5)"):
    morph(sel, t, a, b, dur, ease); ev(t, t + dur, sel)


def DR(sel, t, dur=.32):
    draw(sel, t, dur); ev(t, t + dur, sel)


def FA(sel, t, dur=.6, to=1):
    fade(sel, t, dur, to); ev(t, t + dur, sel)


def PU(sel, t0, t1, amt=.035):
    for t in beats(t0, t1):
        mv(f'tl.to("{sel}",{{scale:{1 + amt},duration:.08,ease:"power2.out"}},{t:.3f});tl.to("{sel}",{{scale:1,duration:{BEAT * .7:.3f},ease:"back.out(2)"}},{t + .08:.3f});')
        ev(t, t + .08 + BEAT * .7, "pulse " + sel)


def M(js, t0, t1, what=""):
    mv(js); ev(t0, t1, what)


def BLUR(sel, t, dur=.45, stag=.04):
    """entrée au flou de mouvement, lettre par lettre (référence AVTECKS)."""
    mv(f'tl.fromTo("{sel}",{{yPercent:105,filter:"blur(10px)",opacity:0}},{{yPercent:0,filter:"blur(0px)",opacity:1,duration:{dur},ease:"back.out(1.4)",stagger:{stag}}},{t:.3f});')


def show(sid, t):
    SC[sid][0] = t


def hide(sid, t):
    SC[sid][1] = t


def iris(a, b, t, d, x, y, label):
    """La scène b s'ouvre en cercle depuis (x, y) pendant que la caméra plonge dans a vers ce même point."""
    show(b, t); hide(a, t + d)
    mv(f'tl.fromTo("#{b}",{{clipPath:"circle(0px at {x:.0f}px {y:.0f}px)"}},{{clipPath:"circle(2300px at {x:.0f}px {y:.0f}px)",duration:{d},ease:"power3.in"}},{t:.3f});')
    mv(f'tl.fromTo("#{a}",{{scale:1}},{{scale:1.45,transformOrigin:"{x:.0f}px {y:.0f}px",duration:{d},ease:"power3.in",immediateRender:false}},{t:.3f});')
    mv(f'tl.fromTo("#{b}",{{scale:1.3}},{{scale:1,transformOrigin:"{x:.0f}px {y:.0f}px",duration:{d + .45:.2f},ease:"power3.out"}},{t:.3f});')
    TR.append((t, d, label, a, b))


def pan(a, b, t, d, label):
    """Panoramique vertical continu : la caméra suit la chute."""
    show(b, t); hide(a, t + d)
    mv(f'tl.fromTo("#{a}",{{y:0}},{{y:-1920,duration:{d},ease:"power2.inOut",immediateRender:false}},{t:.3f});')
    mv(f'tl.fromTo("#{b}",{{y:1920}},{{y:0,duration:{d},ease:"power2.inOut"}},{t:.3f});')
    TR.append((t, d, label, a, b))


def band(a, b, t, d, y, label):
    """Un trait se trace à la hauteur y puis s'ouvre en aplat : la scène b apparaît depuis ce trait."""
    show(b, t); hide(a, t + d)
    t1 = t + d * .4
    mv(f'tl.fromTo("#{b}",{{clipPath:"inset({y:.0f}px 50% {1920 - y - 8:.0f}px 50%)"}},{{clipPath:"inset({y:.0f}px 0% {1920 - y - 8:.0f}px 0%)",duration:{d * .4:.2f},ease:"power3.inOut"}},{t:.3f});')
    mv(f'tl.to("#{b}",{{clipPath:"inset(0px 0% 0px 0%)",duration:{d * .6:.2f},ease:"power3.inOut"}},{t1:.3f});')
    TR.append((t, d, label, a, b))


def recede_black(a, b, t, d, label):
    """La caméra recule et tout s'éteint (entrée du passage sobre)."""
    show(b, t + d * .5); hide(a, t + d)
    mv(f'tl.to("#{a}",{{scale:.92,opacity:0,duration:{d},ease:"power2.inOut"}},{t:.3f});')
    TR.append((t, d, label, a, b))


# ------------------------------------------------------------ repères de parole
LEAD = .1


def ws(i):
    return max(0.0, WD[i]["start"] - LEAD)


def we(i):
    return WD[i]["end"]


def subpos(y_top):
    return y_top


# ============================================================ A · 0,0-2,1 · navy · l'accusation, mot par mot, le « ? » corail
scene("sA", NAVY)
show("sA", 0)
fsA = fit(["CONTROL"], SW, 900, 125, 205)
YA = 300
rows = [("a1", "JEWS", 0), ("a2", "CONTROL", 1), ("a3", "THE", 2), ("a4", "MEDIA", 3)]
for k, (cid, word, wi) in enumerate(rows):
    put(txt(cid, YA + k * (fsA + 10), word, fsA, 900, 125, CR, "opacity:0"))
QY = YA + 4 * (fsA + 10)
fsQ = 250
put(txt("aq", QY, "?", fsQ, 900, 125, CO, "opacity:0"))
L("#a1", ws(0), "y:140,scale:1.3", .5)
SWG("#a2", ws(1), -360, .5)
L("#a3", ws(2), "scale:.4", .4, "back.out(2)")
L("#a4", ws(3), "y:160,scale:1.3", .5)
MO("#a4", ws(3) + .05, (300, 100), (900, 125), .5)
TQ = 1.08
L("#aq", TQ, "scale:3.2,rotation:-18", .38, "back.out(2.2)")
T_A = 2.12
qx, qy = CX, QY + fsQ * .78           # le point du « ? »

# ============================================================ B · crème · REALLY? au flou de mouvement
scene("sB", CR)
iris("sA", "sB", T_A, .5, qx, qy, "iris depuis le point du « ? »")
fsB = fit(["REALLY?"], SW, 900, 125, 300)
YB = 960 - fsB // 2
put(f'<div id="b1" style="position:absolute;left:{SL}px;top:{YB}px;width:{SW}px;text-align:center;{arc(900, 125)};font-size:{fsB}px;line-height:1;color:{NAVY}">'
    + "".join(f'<span style="display:inline-block;overflow:hidden;vertical-align:top;height:{fsB}px"><span class="bl" style="display:inline-block">{c}</span></span>' for c in "REALLY?")
    + '</div>'
    + bar("bk", SL, YB + fsB + 24, SW, 10, CO))
TB0 = max(ws(4), T_A + .08)
BLUR("#sB .bl", TB0, .4, .03); ev(TB0, TB0 + .4 + .18, "REALLY?")
MO("#sB .bl", TB0 + .1, (400, 100), (900, 125), .45)
DR("#bk", we(4) - .3, .25)
T_B = max(we(4) - .3 + .25 + .6, 3.4)
bk_y = YB + fsB + 24

# ============================================================ C · bleu clair · TERRIBLE AT PR : le mot s'écrase, puis tout tombe
scene("sC", LIGHT)
band("sB", "sC", T_B, .5, bk_y, "le trait corail sous REALLY? s'ouvre en aplat bleu")
fsC1 = fit(["SOMEBODY NEEDS", "TO EXPLAIN WHY", "THE JEWS ARE SO"], SW, 600, 100, 96)
fsC2 = fit(["TERRIBLE"], SW * .90, 900, 125, 250)
fsC3 = fit(["AT PR."], SW, 900, 125, 170)
put(txt("c1", 300, "SOMEBODY NEEDS", fsC1, 600, 100, NAVY, "opacity:0")
    + txt("c2", 300 + fsC1 + 12, "TO EXPLAIN WHY", fsC1, 600, 100, NAVY, "opacity:0")
    + txt("c3", 300 + 2 * (fsC1 + 12), "THE JEWS ARE SO", fsC1, 600, 100, NAVY, "opacity:0")
    + f'<div id="c4" style="position:absolute;left:{SL}px;top:640px;width:{SW}px;text-align:center;{arc(900, 125)};font-size:{fsC2}px;line-height:1;color:{CR};opacity:0">{letters("TERRIBLE", "tc")}</div>'
    + txt("c5", 640 + fsC2 + 30, "AT PR.", fsC3, 900, 125, NAVY, "opacity:0"))
TC0 = max(ws(6), T_B + .08)
L("#c1", TC0, "x:-200,scale:1", .45)
L("#c2", ws(9), "x:-200,scale:1", .45)
L("#c3", ws(12), "x:-200,scale:1", .45)
TT = ws(15)
M(f'tl.set("#c4",{{opacity:1}},{TT:.3f});tl.fromTo("#sC .tc",{{y:-260,scale:1.5,opacity:0}},{{y:0,scale:1,opacity:1,duration:.42,ease:"back.out(1.5)",stagger:.03}},{TT:.3f});', TT, TT + .42 + .24, "TERRIBLE")
# l'écrasement : les lettres s'affaissent et s'inclinent à l'impact (le mot est « terrible »)
M(f'tl.to("#sC .tc",{{y:(i)=>Math.abs(i-3.5)*-9+14,rotation:(i)=>(i-3.5)*3,scaleY:.9,duration:.3,ease:"back.out(3)"}},{TT + .55:.3f});', TT + .55, TT + .85, "écrasement")
L("#c5", ws(17), "y:120,scale:1.6", .32, "back.out(1.8)")
T_C = max(ws(17) + .32 + .6, 7.2)
# la chute : TERRIBLE et AT PR. tombent, la caméra les suit (ouverture de la transition)
mv(f'tl.to("#sC .tc",{{y:1400,rotation:(i)=>(i%2?1:-1)*(20+i*6),duration:.6,ease:"power2.in",stagger:.02}},{T_C:.3f});')
mv(f'tl.to("#c5",{{y:1500,rotation:8,duration:.55,ease:"power2.in"}},{T_C + .05:.3f});')

# ============================================================ D · crème · le journal : HEADLINES, les manchettes virent au corail
scene("sD", CR)
pan("sC", "sD", T_C, .65, "TERRIBLE tombe, la caméra suit la chute jusqu'au journal")
fsD1 = fit(["IF JEWS CONTROL THE"], SW, 600, 100, 80)
fsD2 = fit(["HEADLINES"], SW, 900, 125, 190)
fsD3 = fit(["RELENTLESSLY", "NEGATIVE?"], SW, 900, 125, 120)
HY = 262 + 20 + fsD1 + 16
RY0 = HY + fsD2 + 50
widths = [SW, SW * .78, SW * .9, SW * .62, SW * .84, SW * .7]
rowsD = "".join(f'<div class="hr" style="position:absolute;left:{SL}px;top:{RY0 + i * 66}px;width:{w:.0f}px;height:38px;background:{NAVY};opacity:0"></div>' for i, w in enumerate(widths))
put(bar("dm", SL, 262, SW, 12, NAVY, "opacity:0")
    + txt("d1", 262 + 26, "IF JEWS CONTROL THE", fsD1, 600, 100, NAVY, "opacity:0")
    + txt("d2", HY, "HEADLINES", fsD2, 900, 125, NAVY, "opacity:0")
    + rowsD
    + txt("d3", RY0 + 6 * 66 + 30, "RELENTLESSLY", fsD3, 900, 125, NAVY, "opacity:0")
    + txt("d4", RY0 + 6 * 66 + 30 + fsD3 + 8, "NEGATIVE?", fsD3, 900, 125, CO, "opacity:0"))
TD0 = T_C + .1
DR("#dm", TD0, .3); mv(f'tl.set("#dm",{{opacity:1}},{TD0:.3f});')
L("#d1", max(ws(19), TD0 + .05), "y:-60,scale:1", .4)
L("#d2", ws(22), "x:-400,scale:1.1", .5)
MO("#d2", ws(22) + .05, (400, 100), (900, 125), .5)
TR0 = ws(25)
M(f'tl.fromTo("#sD .hr",{{x:600,opacity:0}},{{x:0,opacity:1,duration:.38,ease:"back.out(1.3)",stagger:.07}},{TR0:.3f});', TR0, TR0 + .38 + .42, "manchettes")
L("#d3", ws(30), "y:80,scale:1.2", .45)
M(f'tl.to("#sD .hr",{{backgroundColor:"{CO}",x:(i)=>(i%2?10:-10),duration:.22,ease:"power2.out",stagger:.05}},{ws(30) + .1:.3f});', ws(30) + .1, ws(30) + .1 + .22 + .3, "manchettes corail")
L("#d4", ws(31), "scale:1.6,rotation:-4", .4, "back.out(1.8)")
T_D = max(ws(31) + .4 + .6, 12.28)
neg_x = CX + em("NEGATIVE?", 900, 125) * fsD3 / 2 - em("?", 900, 125) * fsD3 / 2
neg_y = RY0 + 6 * 66 + 30 + fsD3 + 8 + fsD3 * .78

# ============================================================ E · noir · le fil social qui défile, le compteur viral, EVERY SINGLE DAY
scene("sE", K)
iris("sD", "sE", T_D, .55, neg_x, neg_y, "iris depuis le point du « ? » de NEGATIVE?")
fsE1 = fit(["IF JEWS CONTROL"], SW, 600, 100, 80)
fsE2 = fit(["SOCIAL MEDIA"], SW, 900, 125, 150)
FY0, FY1 = 262 + 20 + fsE1 + 16 + fsE2 + 40, 1110
cards = ""
for i in range(7):
    top = i * 230
    badge = f'<div style="position:absolute;left:28px;top:150px;padding:6px 14px;border-radius:8px;background:{CO};font:800 24px/1 Mont;color:{CR};letter-spacing:.04em">CONSPIRACY</div>' if i % 2 else ""
    cards += (f'<div class="fc" style="position:absolute;left:0;top:{top}px;width:{SW}px;height:206px;border-radius:22px;background:#1C1C24">'
              f'<div style="position:absolute;left:28px;top:26px;width:52px;height:52px;border-radius:26px;background:#3A3A48"></div>'
              f'<div style="position:absolute;left:98px;top:32px;width:220px;height:14px;border-radius:7px;background:#3A3A48"></div>'
              f'<div style="position:absolute;left:98px;top:58px;width:140px;height:11px;border-radius:6px;background:#2C2C36"></div>'
              f'<div style="position:absolute;left:28px;top:100px;width:{SW - 56 - (i * 37) % 200}px;height:16px;border-radius:8px;background:#50506A"></div>'
              f'<div style="position:absolute;left:28px;top:126px;width:{SW - 56 - (i * 91) % 300}px;height:16px;border-radius:8px;background:#50506A"></div>{badge}</div>')
put(txt("e1", 262 + 20, "IF JEWS CONTROL", fsE1, 600, 100, CR, "opacity:0")
    + txt("e2", 262 + 20 + fsE1 + 16, "SOCIAL MEDIA", fsE2, 900, 125, LIGHT, "opacity:0")
    + f'<div id="feed" style="position:absolute;left:{SL}px;top:{FY0}px;width:{SW}px;height:{FY1 - FY0}px;overflow:hidden;opacity:0"><div id="feedin" style="position:absolute;left:0;top:0;width:{SW}px">{cards}</div></div>'
    + f'<div id="cntw" style="position:absolute;left:{SL}px;top:{(FY0 + FY1) // 2 - 90}px;width:{SW}px;text-align:center;opacity:0">'
    f'<div style="display:inline-block;padding:18px 44px;border-radius:90px;background:{CR};color:{NAVY};{arc(900, 110)};font-size:96px;line-height:1"><span style="color:{CO}">↑</span> <span id="cnt">0</span></div></div>'
    )
# EVERY SINGLE DAY. : trois mots qui se posent côte à côte
fsE3 = fit(["EVERY SINGLE DAY."], SW, 900, 100, 104)
wE = [em(s, 900, 100) * fsE3 for s in ("EVERY", "SINGLE", "DAY.")]
gap = (SW - sum(wE)) / 2
xE = [SL, SL + wE[0] + gap, SL + wE[0] + gap + wE[1] + gap]
put("".join(f'<div id="ew{k}" style="position:absolute;left:{xE[k]:.0f}px;top:1150px;{arc(900, 100)};font-size:{fsE3}px;line-height:1;color:{CR};opacity:0">{s}</div>' for k, s in enumerate(("EVERY", "SINGLE", "DAY."))))
TE0 = T_D + .1
L("#e1", max(ws(33), TE0), "y:-60,scale:1", .4)
L("#e2", ws(35), "x:360,scale:1.1", .5)
MO("#e2", ws(35) + .05, (400, 100), (900, 125), .5)
TF0 = ws(37)
M(f'tl.fromTo("#feed",{{y:300,opacity:0}},{{y:0,opacity:1,duration:.5,ease:"power3.out"}},{TF0:.3f});', TF0, TF0 + .5, "fil")
drift("#feedin", TF0 + .3, 18.6, y=-900)            # défilement continu (mouvement secondaire)
TCNT = ws(43)
M(f'tl.fromTo("#cntw",{{scale:.4,opacity:0}},{{scale:1,opacity:1,duration:.4,ease:"back.out(1.8)"}},{TCNT:.3f});', TCNT, TCNT + .4, "compteur")
mv(f'const cE={{v:0}};tl.to(cE,{{v:2418906,duration:1.1,ease:"power3.out",onUpdate:()=>{{document.getElementById("cnt").textContent=Math.round(cE.v).toLocaleString("en-US")}}}},{TCNT + .05:.3f});')
ev(TCNT, TCNT + 1.15, "compteur monte")
for k, wi in enumerate((44, 45, 46)):
    L(f"#ew{k}", ws(wi), "y:90,scale:1.4", .3, "back.out(1.8)")
T_E = max(ws(46) + .3 + .6, 18.45)
cnt_c = (CX, (FY0 + FY1) // 2 - 90 + 66)

# ============================================================ F · bleu moyen · la carte citée, l'anneau qui se referme, VIRAL NARRATIVE?
scene("sF", MID)
iris("sE", "sF", T_E, .5, cnt_c[0], cnt_c[1], "iris depuis le compteur viral")
fsF1 = fit(["AND IF JEWS CONTROL"], SW, 600, 100, 80)
fsF2 = fit(["THE NARRATIVE"], SW, 900, 125, 140)
CW, CH = 700, 380
CXl, CYt = CX - CW // 2, 262 + 20 + fsF1 + 16 + fsF2 + 70
fsFq = fit(["“JEWS CONTROL", "THE MEDIA”"], CW - 80, 900, 100, 92)
RR = 430
ring = (f'<svg id="ring" style="position:absolute;left:{CX - RR - 10}px;top:{CYt + CH // 2 - RR - 10}px;opacity:0" width="{2 * RR + 20}" height="{2 * RR + 20}" viewBox="0 0 {2 * RR + 20} {2 * RR + 20}">'
        f'<circle cx="{RR + 10}" cy="{RR + 10}" r="{RR}" fill="none" stroke="{CO}" stroke-width="14" stroke-linecap="round" '
        f'stroke-dasharray="{2 * math.pi * RR:.0f}" stroke-dashoffset="{2 * math.pi * RR:.0f}" transform="rotate(-90 {RR + 10} {RR + 10})"/></svg>')
echo = "".join(f'<div class="ecf" style="position:absolute;left:{CXl - i * 28}px;top:{CYt - i * 28}px;width:{CW + i * 56}px;height:{CH + i * 56}px;border:3px solid {CR};border-radius:{30 + i * 20}px;opacity:0"></div>' for i in range(1, 4))
fsF3 = fit(["BECOME A VIRAL", "NARRATIVE?"], SW, 900, 125, 92)
put(txt("f1", 262 + 20, "AND IF JEWS CONTROL", fsF1, 600, 100, CR, "opacity:0")
    + txt("f2", 262 + 20 + fsF1 + 16, "THE NARRATIVE", fsF2, 900, 125, CR, "opacity:0")
    + ring + echo
    + f'<div id="card" style="position:absolute;left:{CXl}px;top:{CYt}px;width:{CW}px;height:{CH}px;border-radius:30px;background:#FFFFFF;box-shadow:0 26px 50px rgba(15,15,17,.25);opacity:0">'
    f'<div style="position:absolute;left:36px;top:32px;width:54px;height:54px;border-radius:27px;background:#DCD6CA"></div>'
    f'<div style="position:absolute;left:106px;top:40px;width:200px;height:14px;border-radius:7px;background:#DCD6CA"></div>'
    f'<div style="position:absolute;left:106px;top:64px;width:120px;height:11px;border-radius:6px;background:#E7E2D8"></div>'
    f'<div style="position:absolute;left:40px;top:120px;width:{CW - 80}px;text-align:center;{arc(900, 100)};font-size:{fsFq}px;line-height:1.05;color:{NAVY}">“JEWS CONTROL<br>THE MEDIA”</div>'
    f'<div id="vb" style="position:absolute;right:30px;bottom:26px;padding:10px 18px;border-radius:12px;background:{CO};color:{CR};font:800 30px/1 Mont;letter-spacing:.05em;opacity:0">↑ VIRAL</div></div>'
    + txt("f3", 1130, "BECOME A VIRAL", fsF3, 900, 125, CR, "opacity:0")
    + txt("f4", 1130 + fsF3 + 8, "NARRATIVE?", fsF3, 900, 125, CO, "opacity:0"))
L("#f1", max(ws(47), T_E + .08), "y:-60,scale:1", .4)
L("#f2", ws(52), "x:-360,scale:1.1", .5)
MO("#f2", ws(52) + .05, (400, 100), (900, 125), .5)
TCD = ws(55)
M(f'tl.fromTo("#card",{{y:300,rotationX:55,opacity:0,transformPerspective:1200}},{{y:0,rotationX:0,opacity:1,duration:.6,ease:"back.out(1.4)"}},{TCD:.3f});', TCD, TCD + .6, "carte")
TRG = ws(53)
mv(f'tl.set("#ring",{{opacity:1}},{TCD + .3:.3f});')
M(f'tl.to("#ring circle",{{strokeDashoffset:0,duration:{ws(62) - TCD - .3:.2f},ease:"power2.inOut"}},{TCD + .3:.3f});', TCD + .3, ws(62), "anneau")
T_F = max(ws(62) + .4 + .6, 23.3)
for i, t in enumerate(beats(ws(59), T_F - .6 - BEAT * 1.5)):
    M(f'tl.fromTo("#sF .ecf:nth-of-type({i % 3 + 1})",{{opacity:.8,scale:.96}},{{opacity:0,scale:1.06,duration:{BEAT * 1.5:.2f},ease:"power2.out",immediateRender:false}},{t:.3f});', t, t + BEAT * 1.5, "écho")
L("#f3", ws(59), "y:80,scale:1.2", .45)
L("#vb", ws(61), "scale:2,rotation:-8", .35, "back.out(2)")
L("#f4", ws(62), "scale:1.6,rotation:-4", .4, "back.out(1.8)")
T_F = max(ws(62) + .4 + .6, 23.3)

# ============================================================ G · noir · sobre : MAKE IT MAKE SENSE., typo fine, apparition lente
scene("sG", K)
recede_black("sF", "sG", T_F, .8, "la caméra recule et tout s'éteint ; passage sobre")
fsG = fit(["MAKE IT MAKE SENSE."], SW * .82, 250, 62, 150)
GY = 960 - fsG // 2
put(txt("g1", GY, "MAKE IT MAKE SENSE.", fsG, 250, 62, CR, "opacity:0;letter-spacing:.04em")
    + bar("gl", SL + 60, GY + fsG + 50, SW - 120, 2, CR, "opacity:0"))
TG = max(ws(63), SC["sG"][0] + .05)
FA("#g1", TG, .6)
mv(f'tl.fromTo("#g1",{{scale:1}},{{scale:1.05,duration:2.4,ease:"sine.out"}},{TG:.3f});')
mv(f'tl.set("#gl",{{opacity:.7}},{ws(65):.3f});')
DR("#gl", ws(65), .6)
T_G = max(ws(65) + .6 + .6, 25.95)
gl_y = GY + fsG + 50

# ============================================================ H · corail · EVERYTHING, puis la flèche qui fait demi-tour (against themselves)
scene("sH", CO)
band("sG", "sH", T_G, .6, gl_y, "le trait sous MAKE IT MAKE SENSE s'ouvre en aplat corail")
fsH1 = fit(["APPARENTLY,"], SW, 900, 125, 120)
fsH2 = fit(["JEWS ARE RESPONSIBLE FOR"], SW, 600, 100, 80)
fsH3 = fit(["EVERYTHING"], SW, 900, 125, 190)
fsH4 = fit(["INCLUDING THE PROPAGANDA"], SW, 600, 100, 72)
fsH5 = fit(["AGAINST THEMSELVES."], SW, 900, 125, 104)
Y1 = 262 + 20
Y2 = Y1 + fsH1 + 24
Y3 = Y2 + fsH2 + 16
Y4 = Y3 + fsH3 + 40
Y5 = Y4 + fsH4 + 14
AY = Y5 + fsH5 + 50                     # la flèche : part à droite, fait demi-tour, revient à gauche
AH = min(1480 - AY - 10, 190)
ax0, ax1 = SL + 40, SR - 120
path = f"M {ax0} {AY + 20} H {ax1} A {AH / 2:.0f} {AH / 2:.0f} 0 0 1 {ax1} {AY + 20 + AH} H {ax0 + 60}"
plen = (ax1 - ax0) + math.pi * AH / 2 + (ax1 - ax0 - 60)
arrow = (f'<svg id="arr" style="position:absolute;left:0;top:0;opacity:0" width="1080" height="1920" viewBox="0 0 1080 1920">'
         f'<path d="{path}" fill="none" stroke="{NAVY}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="{plen:.0f}" stroke-dashoffset="{plen:.0f}"/>'
         f'<polygon id="arh" points="{ax0 + 60},{AY + 20 + AH - 34} {ax0 + 60},{AY + 20 + AH + 34} {ax0 - 10},{AY + 20 + AH}" fill="{NAVY}" opacity="0"/></svg>')
put(txt("h1", Y1, "APPARENTLY,", fsH1, 900, 125, CR, "opacity:0")
    + txt("h2", Y2, "JEWS ARE RESPONSIBLE FOR", fsH2, 600, 100, NAVY, "opacity:0")
    + f'<div id="h3" style="position:absolute;left:{SL}px;top:{Y3}px;width:{SW}px;text-align:center;{arc(900, 125)};font-size:{fsH3}px;line-height:1;color:{NAVY};opacity:0">{letters("EVERYTHING", "th")}</div>'
    + txt("h4", Y4, "INCLUDING THE PROPAGANDA", fsH4, 600, 100, NAVY, "opacity:0")
    + txt("h5", Y5, "AGAINST THEMSELVES.", fsH5, 900, 125, CR, "opacity:0")
    + arrow)
L("#h1", max(ws(67), T_G + .05), "y:-80,scale:1.2", .45)
L("#h2", ws(70), "x:-200,scale:1", .4)
TEV = ws(72)
M(f'tl.set("#h3",{{opacity:1}},{TEV:.3f});tl.fromTo("#sH .th",{{y:120,scale:1.4,opacity:0}},{{y:0,scale:1,opacity:1,duration:.4,ease:"back.out(1.6)",stagger:.03}},{TEV:.3f});', TEV, TEV + .4 + .3, "EVERYTHING")
MO("#sH .th", TEV + .1, (500, 100), (900, 125), .5)
L("#h4", ws(75), "x:-200,scale:1", .4)
L("#h5", ws(76), "y:80,scale:1.2", .45)
TAR = ws(76) + .1
mv(f'tl.set("#arr",{{opacity:1}},{TAR:.3f});')
M(f'tl.to("#arr path",{{strokeDashoffset:0,duration:.75,ease:"power2.inOut"}},{TAR:.3f});', TAR, TAR + .75, "flèche demi-tour")
M(f'tl.fromTo("#arh",{{opacity:0,scale:0,transformOrigin:"{ax0 + 60}px {AY + 20 + AH}px"}},{{opacity:1,scale:1,duration:.2,ease:"back.out(2)"}},{TAR + .7:.3f});', TAR + .7, TAR + .9, "pointe")
T_H = max(TAR + .9 + .6, 31.0)
arr_c = (ax0 + 10, AY + 20 + AH)

# ============================================================ I · navy · CONSPIRACY barré, PLOT HOLE, et le O devient le trou
scene("sI", NAVY)
iris("sH", "sI", T_H, .55, arr_c[0], arr_c[1], "iris depuis la pointe de la flèche")
fsI1 = fit(["THAT'S NOT A"], SW, 600, 100, 90)
fsI2 = fit(["CONSPIRACY"], SW, 900, 125, 165)
fsI3 = fit(["THAT'S A"], SW, 600, 100, 90)
fsI4 = fit(["PLOT HOLE."], SW, 900, 125, 215)
Z1 = 430
Z2 = Z1 + fsI1 + 18
Z3 = Z2 + fsI2 + 110
Z4 = Z3 + fsI3 + 18
cw = em("CONSPIRACY", 900, 125) * fsI2
put(txt("i1", Z1, "THAT'S NOT A", fsI1, 600, 100, CR, "opacity:0")
    + txt("i2", Z2, "CONSPIRACY", fsI2, 900, 125, LIGHT, "opacity:0")
    + bar("ik", CX - cw / 2 - 10, Z2 + fsI2 * .46, cw + 20, 18, CO)
    + txt("i3", Z3, "THAT'S A", fsI3, 600, 100, CR, "opacity:0")
    + f'<div id="i4" style="position:absolute;left:{SL}px;top:{Z4}px;width:{SW}px;text-align:center;{arc(900, 125)};font-size:{fsI4}px;line-height:1;color:{CR};opacity:0">'
    f'<span id="i4a" style="display:inline-block">PLOT</span>&nbsp;<span id="i4b" style="display:inline-block;opacity:0">H<span id="io" style="display:inline-block;position:relative">O</span>LE.</span></div>')
mv(f'tl.set("#ik",{{scaleX:0}},0);')
L("#i1", max(ws(78), T_H + .05), "y:-60,scale:1", .4)
L("#i2", ws(81), "x:-400,scale:1.1", .5)
MO("#i2", ws(81) + .05, (400, 100), (900, 125), .5)
TK = we(81) + .15
DR("#ik", TK, .25)
M(f'tl.fromTo("#i2",{{x:-12}},{{x:0,duration:.3,ease:"back.out(3)",immediateRender:false}},{TK + .1:.3f});', TK + .1, TK + .4, "secousse")
L("#i3", ws(82), "y:-60,scale:1", .4)
mv(f'tl.set("#i4",{{opacity:1}},{ws(84):.3f});')
L("#i4a", ws(84), "y:120,scale:1.5", .4, "back.out(1.8)")
L("#i4b", ws(85), "y:120,scale:1.5", .4, "back.out(1.8)")
T_I = max(ws(85) + .4 + .6, 35.0)
# position du O de HOLE : PLOT + espace + H, mesurés
full = em("PLOT HOLE.", 900, 125) * fsI4
ox = CX - full / 2 + em("PLOT H", 900, 125) * fsI4 + em("O", 900, 125) * fsI4 / 2
oy = Z4 + fsI4 * .52

# ============================================================ J · crème · STOP BLAMING -> START QUESTIONING, le fil qui nous nourrit, le « ? »
scene("sJ", CR)
iris("sI", "sJ", T_I, .55, ox, oy, "iris depuis le O de HOLE : on entre dans le trou")
fsJ1 = fit(["MAYBE STOP BLAMING", "AND START QUESTIONING"], SW, 600, 100, 84)
fsJ2 = fit(["THE JEWS"], SW, 900, 125, 160)
fsJ3 = fit(["WHAT YOU'RE"], SW, 900, 125, 110)
fsJ4 = fit(["BEING FED."], SW, 900, 125, 130)
J1 = 262 + 30
J2 = J1 + fsJ1 + 16
J3 = J2 + fsJ2 + 50
J4 = J3 + fsJ3 + 10
FJ0 = J4 + fsJ4 + 40
FJ1 = 1300
cardsJ = ""
for i in range(6):
    top = i * 150
    cardsJ += (f'<div style="position:absolute;left:0;top:{top}px;width:{SW}px;height:130px;border-radius:18px;background:#FFFFFF;box-shadow:0 10px 24px rgba(15,15,17,.12)">'
               f'<div style="position:absolute;left:22px;top:20px;width:44px;height:44px;border-radius:22px;background:#DCD6CA"></div>'
               f'<div style="position:absolute;left:84px;top:24px;width:{200 + (i * 53) % 300}px;height:14px;border-radius:7px;background:#DCD6CA"></div>'
               f'<div style="position:absolute;left:84px;top:50px;width:{260 + (i * 97) % 400}px;height:12px;border-radius:6px;background:#E7E2D8"></div>'
               f'<div style="position:absolute;left:84px;top:74px;width:{180 + (i * 31) % 350}px;height:12px;border-radius:6px;background:#E7E2D8"></div></div>')
put(txt("j1", J1, "MAYBE STOP BLAMING", fsJ1, 600, 100, NAVY, "opacity:0")
    + txt("j1b", J1, "AND START QUESTIONING", fsJ1, 600, 100, NAVY, "opacity:0")
    + txt("j2", J2, "THE JEWS", fsJ2, 900, 125, NAVY, "opacity:0")
    + txt("j3", J3, "WHAT YOU'RE", fsJ3, 900, 125, NAVY, "opacity:0")
    + txt("j4", J4, "BEING FED.", fsJ4, 900, 125, CO, "opacity:0")
    + f'<div id="feedJ" style="position:absolute;left:{SL}px;top:{FJ0}px;width:{SW}px;height:{FJ1 - FJ0}px;overflow:hidden;opacity:0"><div id="feedJin" style="position:absolute;left:0;top:0;width:{SW}px">{cardsJ}</div></div>'
    + txt("jq", FJ0 + 20, "?", 300, 900, 125, CO, "opacity:0"))
L("#j1", max(ws(86), T_I + .08), "y:-60,scale:1", .4)
L("#j2", ws(90), "x:-360,scale:1.1", .5)
MO("#j2", ws(90) + .05, (400, 100), (900, 125), .45)
# « start » : la ligne du haut part, la suivante la remplace en place ; THE JEWS s'efface (on ne les blâme plus)
TS = ws(92)
M(f'tl.to("#j1",{{y:-90,opacity:0,duration:.3,ease:"back.in(1.6)"}},{TS:.3f});', TS, TS + .3, "sortie")
L("#j1b", TS + .12, "y:90,scale:1", .4)
M(f'tl.to("#j2",{{opacity:0,y:-30,fontVariationSettings:{fvs(300, 100)},duration:.45,ease:"power2.out"}},{TS + .05:.3f});', TS + .05, TS + .5, "THE JEWS disparaît (retour de Shimi : plus aucune trace au dernier plan)")
L("#j3", ws(94), "y:80,scale:1.2", .4)
L("#j4", ws(96), "scale:1.6,rotation:-4", .4, "back.out(1.8)")
TFJ = we(97) + .05
M(f'tl.fromTo("#feedJ",{{y:400,opacity:0}},{{y:0,opacity:1,duration:.55,ease:"power3.out"}},{TFJ:.3f});', TFJ, TFJ + .55, "fil")
drift("#feedJin", TFJ + .3, TFJ + 3.6, y=-520)
TQJ = TFJ + .45
L("#jq", TQJ, "scale:3.5,rotation:-20", .45, "back.out(2.2)")
T_J = TQJ + .45 + .9
DOTR = 24
dqx, dqy = CX, FJ0 + 20 + 300 * .74
put(f'<div id="dotJ" style="position:absolute;left:{dqx - DOTR:.0f}px;top:{dqy - DOTR:.0f}px;width:{2 * DOTR}px;height:{2 * DOTR}px;border-radius:50%;background:{CO};opacity:0"></div>')

# ============================================================ K · signature CAM (reprise exacte du film du 5 octobre) : le point du « ? » recouvre le cadre, iris crème, logo
scene("sK1", CO)
mv(f'tl.set("#dotJ",{{opacity:1}},{T_J:.3f});tl.to("#dotJ",{{scale:{2400 / DOTR:.0f},duration:.6,ease:"power3.in"}},{T_J:.3f});')
show("sK1", T_J + .6); hide("sJ", T_J + .65)
TR.append((T_J, .6, "le point du « ? » final grandit et recouvre le cadre en corail", "sJ", "sK1"))
scene("sO", CR)
T_K = T_J + .6 + .15
iris("sK1", "sO", T_K, .5, CX, 960, "iris crème depuis le centre : entrée de la signature CAM")
TL = T_K + .5
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
put(f'<div id="lg17" style="position:absolute;inset:0">{ring}{st17}{lines17}'
    + bar("rl17", ox, oy + VB[3] * LS + 70, (1157 - 42) * LS, 3, NAVY) + '</div>')
LAND = TL + .45 + .2 + .75
mv(f'tl.fromTo("#rg17",{{scale:.3,opacity:1}},{{scale:14,opacity:0,duration:1.1,ease:"power2.out"}},{LAND - .25:.3f});')
for k in range(3):
    mv(f'tl.fromTo("#lt{k}",{{clipPath:"inset(0% 100% 0% 0%)",y:24}},{{clipPath:"inset(0% 0% 0% 0%)",y:0,duration:.55,ease:"power3.out"}},{TL + 1.2 + k * .14:.3f});')
mv(f'tl.fromTo("#rl17",{{scaleX:0}},{{scaleX:1,duration:.6,ease:"power3.inOut"}},{TL + 1.45:.3f});')
LOGO_NET = TL + 1.45 + .6
mv(f'tl.fromTo("#lg17",{{scale:1}},{{scale:1.03,duration:{DUR - TL - .8:.2f},ease:"sine.out"}},{TL + .8:.3f});')
SC["sO"][1] = None
if LOGO_NET + 2.2 > DUR + .01:
    print(f"⚠ DUR trop courte : {DUR} < {LOGO_NET + 2.2:.2f}")

# ------------------------------------------------------------ sous-titres (≥ 46 px, mot courant en bleu clair), jamais quand le titre dit les mêmes mots
words = [x["word"] for x in WD]


def find(seq, start=0):
    norm = lambda s: "".join(c for c in s.lower().replace("’", "'") if c.isalnum() or c == "'")
    for i in range(start, len(words)):
        if [norm(x) for x in words[i:i + len(seq)]] == [norm(x) for x in seq]:
            return i
    raise ValueError(seq)


SUBS = [
    ("Then somebody needs to explain", 1340),
    ("why the Jews are so terrible at PR.", 1340),
    ("If Jews control the headlines,", 1340),
    ("why is so much coverage of Israel", 1340),
    ("relentlessly negative?", 1340),
    ("If Jews control social media,", 1340),
    ("why do anti-Semitic conspiracy theories", 1340),
    ("go viral every single day?", 1340),
    ("And if Jews control the narrative,", 1340),
    ("how did Jews control the media", 1340),
    ("become a viral narrative?", 1340),
    ("Apparently Jews are responsible for everything,", 1340),
    ("including the propaganda against themselves.", 1340),
    ("Maybe stop blaming the Jews", 1340),
    ("and start questioning what you're being fed.", 1340),
]
cur_i = 0
for gi, (g, top) in enumerate(SUBS):
    toks = g.split()
    i0 = find(toks, cur_i)
    i1 = i0 + len(toks) - 1
    cur_i = i1 + 1
    st = WD[i0]["start"]
    nxt = WD[i1 + 1]["start"] if i1 + 1 < len(WD) else DUR
    en = min(WD[i1]["end"] + .35, nxt)
    sp = " ".join(f'<span id="w{gi}_{k}">{html.escape(t)}</span>' for k, t in enumerate(toks))
    node(st, en, 20,
         f'<div style="text-align:center;text-wrap:balance"><span style="box-decoration-break:clone;-webkit-box-decoration-break:clone;background:rgba(15,15,17,.9);color:{CR};padding:6px 16px;border-radius:12px;font:800 46px/1.5 Mont">{sp}</span></div>',
         f"left:{SL}px;top:{top}px;width:{SW}px", f"sub{gi}")
    for k in range(len(toks)):
        mv(f'tl.set("#w{gi}_{k}",{{color:"#9FD2F5"}},{WD[i0 + k]["start"]:.3f});')
        if k:
            mv(f'tl.set("#w{gi}_{k - 1}",{{color:"{CR}"}},{WD[i0 + k]["start"]:.3f});')

# ------------------------------------------------------------ scènes : visibilité (aucune coupe, chaque scène est révélée par sa transition)
scenes_html = ""
for sid, (t_in, t_out, bg, content) in SC.items():
    scenes_html += f'<div id="{sid}" class="scene" style="position:absolute;inset:0;background:{bg};overflow:hidden;opacity:0">{"".join(content)}</div>'
    mv(f'tl.set("#{sid}",{{opacity:1}},{t_in:.3f});')
    if t_out is not None:
        mv(f'tl.set("#{sid}",{{opacity:0}},{t_out + .02:.3f});')


# ------------------------------------------------------------ vérification : rien ne naît ni ne change dans les 0,6 s avant une transition
def check_holds():
    bad = 0
    for (t, d, label, a, b) in sorted(TR):
        for (sc, t0, t1, what) in EV:
            if sc == a and t1 > t - .6 + 1e-3 and t0 < t - 1e-3:
                print(f"  TENUE ⚠ {t:6.2f} {a}->{b} : « {what} » {t0:.2f}-{t1:.2f}")
                bad += 1
    return bad


PH = {p["phrase"]: p["start"] for p in T["phrases"]}
VIS = {1: ws(0), 2: TB0, 3: TC0, 4: max(ws(19), TD0 + .05), 5: max(ws(33), TE0), 6: max(ws(47), T_E + .08), 7: TG,
       8: max(ws(67), T_G + .05), 9: max(ws(78), T_H + .05), 10: max(ws(86), T_I + .08)}
print("phrase : attaque voix / arrivée du visuel / écart")
for k in sorted(PH):
    flag = "  ⚠ > 0,2 s" if VIS[k] - PH[k] > .2 else ""
    print(f"  {k:2d} : {PH[k]:6.2f} / {VIS[k]:6.2f} / {VIS[k] - PH[k]:+.2f}{flag}")
print("transitions :")
for (t, d, label, a, b) in sorted(TR):
    print(f"  {t:6.2f} +{d:.2f}  {a}->{b}  {label}")
nb = check_holds()
print("violations de tenue :", nb)
json.dump({"transitions": [{"t": round(t, 3), "d": d, "technique": l, "de": a, "vers": b} for (t, d, l, a, b) in sorted(TR)],
           "sober": [T_F, T_G], "plot": ws(84), "q_final": TQJ, "logo_impact": LAND, "logo_net": LOGO_NET, "strike": TK, "counter": TCNT, "terrible": TT, "dur": DUR},
          open(P / "marks.json", "w"), indent=1, ensure_ascii=False)

audio = (f'<audio id="voice" src="assets/voix.wav" data-start="0" data-duration="{T["duration"]:.2f}" data-volume="1" data-track-index="40"></audio>'
         f'<audio id="music" src="assets/musique.wav" data-start="0" data-duration="{DUR}" data-volume="0.45" data-track-index="41"></audio>'
         f'<audio id="sfx" src="assets/bruitages.wav" data-start="0" data-duration="{DUR}" data-volume="0.35" data-track-index="42"></audio>')
fonts = ('@font-face{font-family:Arc;src:url("assets/fonts/archivo.ttf");font-weight:100 900;font-stretch:62% 125%}'
         '@font-face{font-family:Mont;src:url("assets/fonts/montserrat.ttf");font-weight:100 900}')
doc = f'''<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920">
<title>Plot Hole - V4</title><script src="assets/gsap.min.js"></script>
<style>{fonts}*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:1080px;height:1920px;overflow:hidden;background:{K}}}
#root{{position:relative;width:100%;height:100%;overflow:hidden;background:{K};color:{NAVY}}}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="1080" data-height="1920">
{scenes_html}{"".join(nodes)}{audio}</div>
<script>const tl=gsap.timeline({{paused:true}});{"".join(moves)}window.__timelines["main"]=tl;</script>
</body></html>'''
(P / "index.html").write_text(doc)
print("index.html :", len(SC), "scènes,", len(nodes), "éléments,", len(moves), "mouvements,", DUR, "s")
