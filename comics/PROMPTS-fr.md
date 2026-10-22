# Catégorie « attack » (univers comics) : formules de prompts validées

Formules utilisées pour le film validé « Gazalighting » (18/10/2026). Les prompts réels, mot pour mot, sont dans `reference/prompts-gazalighting.json`. Les identifiants Higgsfield cités sont ceux du compte Bina ; dans le logiciel, ils deviennent des références stockées (fiches personnages et image de style verrouillées).

## Références verrouillées

| Rôle | Fichier / job | Usage |
|---|---|---|
| Héros + style de rendu | job `427069e4-fd20-4958-bb9e-e820e23aa5a2` (`storage/cam-oct05-v2/concept-3-bd-heros/style-2d/heros-style-2d-v3.png`) | Toujours en référence : il porte à la fois le costume du héros et le rendu exact |
| Style seul | media `03393fc3-34cb-4890-9e6f-887464f1f40d` (image tirée de la référence YouTube `_0Cx5u303ek`) | Rendu seulement, jamais ses personnages |
| Logo CAM | media `5009df86-2392-4554-8e0d-d2ca049c0fa6`, `template/assets/logo-cam.png` | Forme de l'emblème ; jamais confié au générateur pour le texte |

## 1. Storyboard (une image, Nano Banana Pro 2K, 3:4)

```
45-second comic book storyboard sheet for an educational short film. A professional storyboard presentation page featuring {N} sequential cinematic panels in a clean grid of 3 columns and {rows} rows, every panel a tall vertical 9:16 frame for a phone screen, read left to right, top to bottom.

Style: dramatic modern 2D animated superhero film, matching the first attached image: huge solid black shadow masses, hard graphic cut between light and shadow, no gradients, very few contour lines, flat saturated colour on the lit side only, one violent coloured light source per panel, one dominant colour per panel. The second attached image carries rendering only, never its character. The world, the objects and the places are the stars of this film; the hero of the first attached image appears only in panels {liste}, and only partially in {liste}.

The upper third of every panel stays calm for on-screen titles added later. No people's faces are ever shown except the hero's in the final panel; no victims, no blood, no violence shown.

Storyboard layout: off-white production storyboard paper, thin black frame borders, each panel numbered with a small number above it and one short handwritten-style note below it. No other text inside the panels.

Panel 1. {ce qu'on voit}
...
Art direction: consistent rendering across all panels, varied camera angles, strong vertical compositions. No text, no letters, no logos anywhere inside the panels.
```

## 2. Image clé par case (Nano Banana Pro 2K, 9:16)

Références : le storyboard, puis le héros + style, puis le style seul.

```
A single full-frame panel of a dramatic modern 2D animated superhero film, not a storyboard. Panel {n} of the first attached sheet is the composition reference only; its borders, numbers and notes are not reproduced. The second and third images carry the rendering style only, never their characters: huge solid black shadow masses, hard graphic cut between light and shadow, no gradients, very few contour lines, flat saturated colour on the lit side only. Scene: {scène}. {Couleur} dominant. The upper third of the frame is calm for a title. Tall vertical phone frame. No people, no text, no letters, no numbers anywhere.
```

Quand le héros est présent : « The second image carries the hero's costume and the exact rendering style ». De face, ajouter l'emblème : « an open six-pointed star built from three separate open chevrons on a white chest plate, never a closed star », puis retoucher quand même avec `template/tools/pose-embleme.py`.

## 3. Clip par case (Kling 3.0 Pro, 9:16, 3 à 8 s, son coupé, image de début imposée)

```
Stylized 2D cel animation in the exact flat graphic style of the frame: flat colours, hard-edged black shadow shapes, few contour lines, animated on twos, no 3D, no gradients. {Une seule action}. {Un mouvement de caméra lent}. Keep {les éléments} exactly as drawn. No people / no faces / no text, no letters, no cuts.
```

Toujours passer `declined_preset_id: 24bae836-2c4a-48e0-89b6-49fcc0b21612` (Higgsfield propose sinon un préréglage au lieu de soumettre).

## 4. Voix (ElevenLabs via Higgsfield)

Voix validée : **Harrison**, preset `573e5163-59b3-4926-aab1-951ef2985f81`, `text2speech_v2`, variante `elevenlabs`. Puis respirations (`template/voice/pace-voice.py`) et minutage mot à mot (`template/voice/timing.py`). Pour un nouveau film, proposer une écoute comparée si le client veut une autre voix.

## Ce qui ne passe jamais par le générateur

Tout le texte (titres, cartouches, onomatopées, tampons, compteurs), l'emblème CAM exact, le logo final animé. Le générateur dessine du faux texte et une étoile fermée.
