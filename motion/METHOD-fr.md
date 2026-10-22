# Motion design en code : la méthode validée

Validée par Shimi le 18/10/2026 sur Plot Hole V4, après le film CAM du 5 octobre. Elle sert à tout film de motion design typographique produit en code (HyperFrames + GSAP), sans modèle vidéo, pour un réel 9:16 avec voix off. Elle remplace les essais précédents : V1 et V2 (une idée-concept qui se battait avec le texte), version A (un signe au centre, trop statique).

Liens : [[Production video IA]], [[Design for Motion (Shaw) - regles de motion design]], [[Tarification motion design code (2026-10-18)]], [[Motion design IA - trois methodes analysees (2026-10-18)]].

## Le principe en une phrase

Un seul grand plan sans coupe : chaque phrase de la voix a sa scène plein cadre, avec son fond et son objet, et la caméra entre dans un élément de la scène (un point, un trait, une lettre, un compteur) pour ouvrir la suivante.

## Les règles qui font le résultat

1. **La barre est le film CAM du 5 octobre.** On repart de son code, jamais d'une page blanche. On oublie les règles « le concept d'abord » et « réduire » du livre de Shaw ; on garde celles du mouvement, du rythme, du contraste et de la caméra.
2. **Une scène par phrase, un fond par scène.** Palette du 5 octobre : navy #203C6C, bleu moyen #4083C1, bleu clair #4CA1DF, crème #F0E8DA, corail #E85240, noir #0F0F11. Deux scènes qui se suivent n'ont jamais le même fond. Le corail est réservé à ce qui est faux ou à ce qui frappe.
3. **Aucune coupe.** Cinq raccords seulement, tous pris dans un geste :
   - *iris* : la scène suivante s'ouvre en cercle depuis un élément précis (point d'un « ? », compteur, pointe de flèche, lettre O) pendant que la caméra plonge dedans ;
   - *bande* : un trait se trace sous un mot puis s'ouvre en aplat de la couleur suivante ;
   - *chute* : les lettres tombent et la caméra les suit vers le bas jusqu'à la scène suivante ;
   - *recul au noir* : la caméra recule et tout s'éteint, pour le seul passage calme ;
   - *recouvrement* : un point grandit jusqu'à remplir le cadre et devient le fond suivant.
   Chaque raccord se fait au sommet de la vitesse (référence Vox) et part d'un élément de la scène d'avant, jamais du vide.
4. **Un objet différent par scène, qui illustre la phrase.** Journal et manchettes pour « headlines », fil social qui défile et compteur pour « viral », carte citée entourée d'un anneau pour « narrative », flèche qui fait demi-tour pour « against themselves », mot barré puis remplacé pour « not a conspiracy, a plot hole ». Jamais deux scènes avec la même mécanique.
5. **Le mot joue ce qu'il dit.** TERRIBLE s'écrase, EVERYTHING prend du gras en montant, CONSPIRACY se fait barrer, THE JEWS s'efface quand la voix dit « stop blaming ».
6. **Typographie Archivo variable, composée au millimètre.** Largeurs mesurées avec fontTools (`fit()`), entrées qui prennent du gras (`morph` de 400 à 900), entrées au flou de mouvement lettre par lettre pour les mots courts. Phrase de liaison en petit (graisse 600), mot-clé en grand (graisse 900).
7. **Mouvement constant, accents sur le temps.** Grille 96 BPM ; chaque mot-clé entre sur l'attaque de sa syllabe (accent 0,1 s avant), ressorts (`back.out`), jamais de fondu mou sauf dans le passage calme. Un mouvement secondaire continu (fil qui défile, échos qui pulsent) pour qu'aucune image ne soit fixe.
8. **Un seul passage calme.** Fond noir, typo fine, apparition lente, sur la phrase pivot (« Make it make sense »).
9. **Lisibilité avant tout.** Jamais d'effet qui couvre ou abîme un mot qu'on doit lire. Tout ce qui se lit vit dans la zone sûre Instagram (x 120 à 940, y 262 à 1480). Sous-titres Montserrat 46 px dans un bloc fixe en bas, mot courant en bleu clair, absents quand le grand titre dit déjà les mêmes mots.
10. **Ce qui quitte la phrase quitte l'image.** Un mot retiré du sens disparaît entièrement (opacité 0), sinon le dernier plan forme une phrase fausse (retour de Shimi : « THE JEWS » restait en gris derrière « AND START QUESTIONING »).
11. **Tenue avant chaque raccord.** Rien ne naît ni ne bouge dans les 0,6 s qui précèdent une transition. `check_holds()` doit afficher 0.
12. **Signature de marque à la fin.** Pour CAM : le point du dernier signe grandit et recouvre le cadre, iris crème, puis le logo du 5 octobre (particules qui convergent, trois pièces de l'étoile en 3D, onde, lettrage révélé, trait), environ 4 s, impact grave et accord aigu.
13. **Son doux.** Musique synthétisée en local sur la grille. Bruitages graves seulement (souffle filtré sous 650 Hz, coups sourds, aucun transitoire aigu), crête des bruitages au moins 15 dB sous la voix. Tout changement passe par un fondu. Mix vers -17 LUFS (retour de Shimi : les premiers bruitages « faisaient mal aux oreilles »).

## Le déroulé, dans l'ordre

1. **Voix** : ElevenLabs via Higgsfield, **Bram** depuis la décision de Shimi du 21 octobre 2026 (Dylan pour Plot Hole V4 et les tests antérieurs), respirations entre les phrases (`pace-voice.py`), minutage mot à mot avec Whisper medium (`timing.py`), recalage sur les silences (`recale.py`). Vérifier chaque début de phrase.
2. **Références** : ouvrir le film du 5 octobre et les références de Shimi, mesurer (fonds, raccords, durée des plans), dire en une phrase ce qu'on prend.
3. **Découpage** : une ligne par phrase de la voix → fond, objet, mot qui joue, raccord de sortie et l'élément d'où il part.
4. **Build** : copier `storage/plot-hole-v4/montage/` (build.py, compose-audio.py, fonts Archivo et Montserrat, gsap), réécrire les scènes. `python3 build.py` : écarts voix/image sous 0,3 s, 0 violation de tenue.
5. **Son** : `python3 compose-audio.py`, puis mesure (crêtes, LUFS) avant d'écouter.
6. **Rendu** : `npx --yes hyperframes@0.8.91 render . -o ../rendus/<nom>.mp4 --quiet` (environ 1 min pour 45 s).
7. **Contrôles avec les yeux** : planche 1 image/s avec les zones mortes Instagram en rouge, planche des raccords (t-1 / -0,6 / -0,3 / t / +0,3), dernier plan en pleine taille, une scène vide se voit tout de suite.
8. **Planche de validation** (Artifact privé) : film basse définition avec le son, une case par scène avec son extrait animé, « ce qui bouge », « ce que ça fait comprendre », vote Oui/Non et commentaire. Seuls les Oui comptent.
9. **Retours** : corriger seulement ce qui est demandé, re-rendre, recontrôler.

## Pièges connus

- Les guillemets doubles dans `style="font-variation-settings:..."` cassent l'attribut : guillemets simples.
- `SC[scène][3][-1] = ...` remplace tout le contenu si la scène a été posée en un seul `put` : la scène sort vide. Toujours ajouter par `put`.
- Un trait SVG à bout arrondi non tracé affiche un point : opacité 0 jusqu'au tracé.
- Une rotation de caméra découvre les coins : zoom de 1,09 avec.
- Deux rendus du même dossier lancés à moins d'une minute peuvent s'annuler.

## Coût et prix

Zéro crédit de génération (la voix seule : environ 2 crédits). Coût réel : la session Claude. Prix client selon [[Tarification motion design code (2026-10-18)]] : environ 10 $ la vidéo, retours facturés de la même façon.

## Fichiers de référence

- Film validé : `REPOS/cam-video-app/storage/plot-hole-v4/rendus/PLOT-HOLE-V4.mp4` (46,2 s).
- Code : `REPOS/cam-video-app/storage/plot-hole-v4/montage/build.py` et `compose-audio.py`.
- Film d'origine de la grammaire : `REPOS/cam-video-app/storage/cam-oct05-v2/concept-2-motion-arcane/montage/build.py`.
- Références motion : `REPOS/cam-video-app/storage/cam-oct05-v2/refs/` (dossiers `motion-v2/` et `motion-v3-1018/`). En local seulement pour l'instant (`storage/` n'est pas versionné).
