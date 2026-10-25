# Vidéos « attack » en univers comics : la méthode

Catégorie CAM « attack » : vidéos de riposte à une accusation antisémite, dans un univers de bande dessinée américaine. Méthode reconstituée le 18/10/2026 à partir du film du 4 octobre (concept 3, `cam-concept-3-bd-super-heros-55s.mp4`, montré à CAM le 5 octobre), de ses prompts et de son code de montage. Même logique que les deux autres catégories : la méthode du film validé d'abord, puis une planche validée par Shimi avant toute génération payante.

Liens : [[Production video IA]], [[Motion design en code - methode validee]], [[cam-production-2026-10-04]], [[Prospect - Automatisation medias IA (Base44)]].

## Retour client à appliquer (Sacha, revue du 5 octobre, de mémoire de Shimi)

**Décision de Shimi du 22/10/2026 : plus de super-héros dans Attack.** On garde l'univers de bande dessinée (lieux, objets, accessoires symboliques, silhouettes anonymes sans visage ni identité), mais aucun héros, aucun personnage costumé ni récurrent n'apparaît dans les cases. Chaque case a `hero: "absent"`. Les paragraphes ci-dessous sur le héros décrivent l'ancienne méthode (films du 4 et du 18 octobre) et ne s'appliquent plus aux nouveaux films ; la fiche héros n'est plus envoyée en référence aux générateurs.

Sacha n'aimait pas trop le design du super-héros. Décision de Shimi du 18/10/2026 : **moins de lumière sur le personnage, plus sur l'univers BD.** Concrètement :

- Le héros n'est plus le sujet de chaque case. Il apparaît dans deux ou trois cases au plus, souvent en partie (silhouette en contre-jour, cape, main gantée, l'emblème sur le plastron), et il reprend sa place entière pour la réplique finale.
- Les cases racontent l'histoire par les méchants, les objets, les lieux et le texte : la fabrication du mensonge, le livre découpé, l'affiche, le téléphone. C'est ce qui portait déjà le film du 4 octobre.
- La grammaire BD passe au premier plan : planche et gouttières, cases de tailles variées, cartouches de narration, onomatopées, lignes de vitesse, éléments qui sortent de leur case, couverture de comics en ouverture ou en signature.
- Le dessin du héros reste à reprendre si on le garde au centre d'une vidéo (silhouette plus simple, plus graphique) : à proposer sur planche, pas à décider seul.

## Ce qui a fait le film du 4 octobre

| Étape | Ce qui a été fait | Fichiers |
|---|---|---|
| 1. Personnages | Héros original aux couleurs de CAM (plastron blanc, emblème CAM : étoile à trois chevrons ouverts, navy, bleu moyen, bleu clair), monstres noirs et statue-caricature repris du concept pâte à modeler et redessinés en BD. Fiches sur fond gris uni, sans décor ni texte. | `storage/cam-oct05-v2/concept-3-bd-heros/heros-LOCK-01.png`, `monstre-bd.png`, `effigie-bd.png` |
| 2. Style | Premier essai en comics classique (encre, trame Ben-Day) refusé par Shimi : « ça fait pas assez bande dessinée ». Style retenu d'après la référence YouTube de Shimi (`_0Cx5u303ek`, animation 2D de super-héros) : **grandes masses d'ombre noire, coupe nette ombre/lumière sans dégradé, très peu de contours, couleur saturée seulement côté éclairé, une seule lumière colorée violente, une couleur dominante par case, pas de trame, pas de texture papier, pas de rendu 3D**. Image de style validée : job `427069e4`. | `style-2d/heros-style-2d-v3.png` |
| 3. Storyboard | Une planche de 12 cases verticales 9:16 générée d'un coup (Nano Banana Pro 2K) à partir du script : cadrage, action et note par case, le haut de chaque case laissé calme pour les titres. | `storyboard-planche-v1.png` |
| 4. Images clés | Une image par case, en redessinant la case du storyboard dans le style validé, avec les fiches en références. Formule de prompt : « Redraw the first image (composition reference) as a frame of a dramatic modern 2D animated superhero film. The second image carries the hero's design AND the exact rendering style… » + la scène + la palette de la case + « No text anywhere ». | `images-cles-v2/` |
| 5. Animation | 12 clips Kling 3.0 Pro de 3 à 12 s, image de début imposée (et de fin pour une transformation). Formule : « Stylized 2D cel animation in the exact flat graphic style of the frame: flat colours, hard-edged black shadow shapes, animated on twos, no 3D, no gradients » + une seule action + un mouvement de caméra lent + « Keep … exactly as drawn. No text, no cuts. » | `clips/` |
| 6. Voix | « Xavier » (ElevenLabs via Higgsfield), volume 0,55 au mixage (la voix sort à -13 LUFS). Minutage mot à mot recalé sur les silences. | `montage/timing.json` |
| 7. Montage | HyperFrames, tout calé sur la voix. **Une planche de BD géante** (papier crème, bordures noires de 22 px, gouttières de 100 px, cases simples et doubles) ; la caméra plonge dans une case, la tient pendant la phrase avec une légère poussée, recule par la gouttière en tournant un peu et plonge dans la suivante, puis recule sur toute la planche à la fin. Aucune coupe sèche. Tout le texte est en code : cartouches jaunes Bangers (mot courant en rouge), titres blancs à contour noir épais et ombre décalée, onomatopée « SNIP! », accusation barrée d'un trait rouge, croix rouge sur l'affiche, trois ordres finaux dont « EXPOSE IT. » dans un éclat rouge, signature CAM. | `montage/build.py`, `compose-audio.py`, `controle.py` |
| 8. Contrôles | Planche 1 image/s, une image par sous-titre avec zones sûres, planche des raccords. Sous-titres jamais sur un visage (`sub-pos.json`). | `_travail/controle-*.jpg` |

Coût observé : environ 119 crédits Higgsfield (32 pour les images, 87 pour les 12 clips), hors dessins de départ.

## Pièges connus

- **Le générateur dessine une étoile fermée** à la place de l'emblème CAM : poser le vrai symbole en retouche (`pose-embleme.py`) sur les images de face. Moins de héros à l'écran, c'est aussi moins de retouches.
- **Kling ajoute des symboles et du faux texte** : une étoile à cinq branches sur la case 9 (recadrée au-dessus de la poitrine), un faux texte sur l'affiche de la case 10 (gardée en image fixe animée par la caméra). Vérifier chaque clip image par image avant le montage.
- `generate_video` renvoie parfois un préréglage au lieu de soumettre : relancer avec `declined_preset_id`.
- Une image 2K Nano Banana Pro coûte 2 crédits, pas 1.
- La voix Xavier sort fort (-13 LUFS) : gain 0,5 au mixage pour un film vers -16 LUFS.
- **Kling redessine l'emblème à chaque image** dès que le héros est de face (case 9 du film Gazalighting, 18/10) : la retouche image par image ne tient pas. Pour une case où l'emblème est lisible, garder l'image clé retouchée en image fixe animée par la caméra, et faire l'action par fondu avec une seconde image retouchée, dont on ne reprend que la zone qui change (la lampe).
- Kling ajoute des actions non demandées en fin de clip (affiches qui se décollent, case 2) : ne garder que le début du clip, ralenti, et figer sur sa dernière image propre.
- Les titres en code ne doivent jamais couvrir le visage du héros ni l'objet de l'action : les poser sur les jambes ou le décor.

## Premier film produit avec cette méthode

« Gazalighting » (script de Vanesa, 18/10/2026) : `REPOS/cam-video-app/storage/cam-attack-gazalighting/cam-attack-gazalighting-v2.mp4`, 57,9 s. Planche validée par Shimi : https://claude.ai/artifact/AbrGBCQhDkXwKnyB4bEVJW. Coût : environ 105 crédits (voix 2, storyboard 2, images 18 + 6 de reprises, clips 75, image flamme éteinte 2).

## Le déroulé pour une nouvelle vidéo « attack »

1. Script réel de CAM (Google Doc de Vanesa du 15/10, catégorie « attack »), voix générée, minutage mot à mot vérifié.
2. Découpage : une case par phrase. Pour chaque case : ce qu'on voit (univers, méchants, objet, lieu), si le héros y est et comment (en entier, en partie, absent), la couleur dominante, le texte posé en code, la transition.
3. **Planche de validation** (comme pour le motion design) : le storyboard, puis les images clés, chacune avec « ce qu'on voit » et « ce que ça fait comprendre », vote Oui/Non par case. Coût affiché avant tout lancement.
4. Clips seulement sur les cases validées, puis montage sur la planche BD, contrôles, aperçu complet, finitions.

## Retours de Shimi sur la v2 (18/10/2026) et v3

- **Voix** : Xavier trop claire. Choix à l'écoute parmi 9 voix sur le même extrait : **Harrison** (ElevenLabs via Higgsfield, preset `573e5163-59b3-4926-aab1-951ef2985f81`), respirations ajoutées entre les phrases (`voix/pace-voice.py`), gain 0,68 au mixage pour un film vers -16 LUFS.
- **Jamais d'illustration littérale d'une expression** : la lampe à gaz qui s'éteint sur « Gazalighting » a été refusée. Fin v3 : le héros de dos face à un mur d'écrans de propagande brouillés, le mot reste un titre en code.
- Film v3 : `REPOS/cam-video-app/storage/cam-attack-gazalighting/cam-attack-gazalighting-v3.mp4`, 59 s. Planche des choix : https://claude.ai/artifact/MBe6FSSxu1Gmo8nnyBzFa5.

## Contrôle qualité : rien ne flashe (règle de Shimi du 18/10/2026)

Après « WAR ENDED. » apparu l'espace d'une fraction de seconde (« comme un jump cut raté »), deux contrôles obligatoires avant de montrer un film :

1. **Au build** : chaque apparition à l'écran (titre, cartouche, tampon, onomatopée, compteur) déclare sa fenêtre pleinement visible avec `seen(nom, début, fin)`. Le build s'arrête (`CONTRÔLE ÉCHOUÉ`) si l'une dure moins de 0,8 s. Correction : faire entrer l'élément plus tôt dans la phrase, ou le laisser tenir pendant la transition vers la case suivante. Ne jamais le rallonger en silence.
2. **Sur la vidéo rendue** : `detecte-flashs.py <video>` repère toute zone qui change puis revient à l'état précédent en moins de 0,8 s. Regarder chaque signalement image par image : l'entrée en rebond d'un titre est un faux positif ; un élément qui apparaît puis disparaît est un vrai défaut.

Au premier passage, le contrôle du build a trouvé quatre éléments trop brefs dans le film Gazalighting (WAR ENDED, HUNDREDS OF HOSTAGES, REAL GENOCIDE, KA-BOOM!).

## Méthode du 25/10/2026 : les skills dans l'app, la caméra en local, Kling pour l'action, des contrôles qui agissent

Décision de Shimi du 25/10/2026 après le film « TEST FINAL ATTACK » (2399f947). Constat : le réalisateur n'écrivait qu'un texte de scène et un mouvement de caméra par case, les prompts image et clip étaient des gabarits en code (`prompts.ts`) et non la méthode de prompting de nos skills ; chaque « action » était un lent push, pan ou tilt sur une image fixe 2D, ce qui poussait Kling à inventer (une main qui entre dans le cadre, un lettrage « THE END », un calendrier avec du texte) ou à ne presque pas bouger (case 3 figée huit secondes) ; les inspections consultatives voyaient des bandes noires, des cadres, des lettrages et des éléments non demandés sans que rien n'agisse ; la narration apparaissait deux fois à l'écran (titres en code plus cartouches). Quatre décisions, appliquées à Attack seulement (Clay viendra ensuite), sans changer le parcours client ni les prix affichés.

### 1. Les skills deviennent la méthode dans l'app

- `comics/skills/attack-prompting.md` (moins de 38 000 caractères, en anglais comme ses sources) reprend, cités le plus fidèlement possible de `cinema-director-v3.md` et du prompteur JBoogx `seedance-prompter-v3` (copiés dans `comics/skills/`), les règles qui s'appliquent à notre cas exact : une image fixe animée par Kling 3.0 image-to-video, 9:16, 3 à 8 s, image de fin verrouillée en option, aucun slot de référence. On y trouve « write the visible », la discipline de longueur, l'ordre verrouillé adapté à un prompt mono-image, l'absence de tout slot de texte, la grammaire de première image et de caméra (un seul axe, mots de vitesse nommés, jamais « fast », pas de coupe, `no camera movement` / `no zoom` quand c'est statique), le `reference_handling` de JBoogx (l'image de départ est la référence : nommer ce qui reste exactement comme dessiné et ce qui a le droit de bouger), `movement_in_this_scene`, la ligne `Avoid:`, les durées et les pièges.
- Le skill est enregistré dans `skillCatalog` (`attack-prompting`) ; le réalisateur et la reprise (`reworkComicPanel`) lisent `comics-method` et `attack-prompting` à chaque tour (`runAgent` accepte `skills: string[]`, le premier obligatoire ; les autres appelants gardent `skill`).

### 2. Ce que le réalisateur rend par case

- `motion: "local"` (défaut) ou `"generated"`. `generated` seulement quand la narration implique un changement physique visible dans la case (une clé tourne, une grille s'ouvre, la lumière inonde, un papier se déchire, une silhouette marche) ; une idée de caméra seule est `local`, avec `cameraMove` (`hold`, `push`, `pull`, `pan-left`, `pan-right`, `tilt-up`, `tilt-down` ; `subtle` ou `medium`), appliqué par le montage gratuitement. Au plus la moitié des cases environ en `generated`, sauf si le script l'exige.
- `videoPrompt` : vide en local ; en `generated`, le prompt Kling complet écrit avec la méthode (200 à 900 caractères), vérifié par `validatePlan` : jamais « text », « title », « caption », « lettering » demandés (les mots ne sont tolérés que niés ou dans la ligne `Avoid:`), ce qui reste fixe nommé, une ligne `Avoid:` présente. `lockEndFrame` (vrai par défaut) verrouille l'image de fin sur la même image.
- `title` devient facultatif et le build l'ignore : cartouches seulement, plus de titres de narration. Les films sauvegardés (sans les nouveaux champs) se chargent et se comportent comme avant (`panelMotion` les lit comme `legacy` : leur gabarit de clip reste celui payé).

### 3. Caméra en local, Kling pour l'action

- Une case `local` ne donne lieu à aucune requête Kling et à aucune ligne de clip dans l'estimation ou le devis (`pricing.ts`, `mediaRequests`, `allowanceFor`) : le worker fabrique son clip en local (boucle ffmpeg de l'image validée, `localClip`), marqué `localClips[case]`, et `build.py` anime l'image sur la fenêtre de la case selon `cameraMove` (push : échelle 1,00 vers 1,06 subtle / 1,12 medium ; pull : l'inverse ; pans et tilts : translation de 4 % / 8 % du cadre avec une légère échelle pour qu'aucun bord n'apparaisse ; hold : rien), en plus de la caméra de planche. Un clip généré garde le comportement existant.
- Une case `generated` envoie le `videoPrompt` du réalisateur tel quel (aucun gabarit autour), `start_image` et, si `lockEndFrame`, `end_image` = la même image validée (Kling 3.0 accepte les deux rôles), `sound: off`, durée inchangée.

### 4. Des contrôles qui agissent

- (a) Avant tout clip, `comics/runtime/frame-check.py` (Python en sandbox, comme `flash-check.py`) vérifie chaque image : bandes de letterbox ou de pillarbox (lignes uniformes noires ou quasi blanches, plus épaisses que 3 % du cadre et terminées par une arête nette sur toute la largeur) et bloc uniforme vide (rectangle plat noir ou quasi blanc de plus de 20 % du cadre à bords nets). Calibrage sur 2399f947 : cases 1, 2, 5, 6 à bandes détectées, 3, 4, 7 propres ; sur les images de référence Gazalighting, dont les grandes masses noires dessinées se terminent sur des bords doux, seule la case 3 (bande noire droite en bas) est signalée. Une image qui échoue est redessinée par `reworkComicPanel(kind:'image')` sous la franchise de reprise existante (au plus 2 par case, clés `-rwN`), la meilleure candidate restante est gardée.
- (b) L'inspection (`inspection.ts`) rend des `flags` structurés à côté de son texte : `lettering`, `added-figure`, `added-symbol`, `padded-frame`, `hero`, `frozen`, `other`. Une image signalée `lettering` / `padded-frame` / `hero` / `added-figure` est redessinée comme en (a) ; un clip signalé `lettering` / `added-figure` / `added-symbol` / `hero` est régénéré une fois par la reprise du réalisateur (motif = les flags et le texte du problème) puis, s'il est encore signalé, remplacé par la caméra locale de la case (gratuit, divulgué dans les notes du film comme repli sur image fixe).
- (c) Clips figés : énergie de mouvement mesurée avec ffmpeg (différence absolue moyenne entre images consécutives, 12 i/s, 108x192 en gris). Mesures sur les sept clips de 2399f947 : 4,03, 7,05, 0,81, 6,36, 11,44, 5,42, 6,88 ; le clip à 0,81 (case 3) est le figé. Sur les clips de référence Gazalighting : 2,69, 1,18, 9,32, 2,44, 6,37, 0,34, 3,12, 1,51, 8,43 (0,34 et 1,18 sont des images fixes gardées volontairement, 1,51 un clip figé sur sa dernière image propre). Seuil `FROZEN_CLIP_ENERGY = 2` : en dessous, le clip part en caméra locale, sans inspection payante. Ne jamais abaisser ce seuil pour faire passer une référence.
- Tout reste dans le prix approuvé (les reprises puisent dans la franchise existante, les chemins locaux ne coûtent rien) ; le client ne lit jamais un message de fournisseur. Un clip rejeté par un contrôle n'est jamais réutilisé par empreinte.

### 5. Cartouches seulement

`film.json` ne porte plus de titre de narration ni de prompt ; `build.py` ne rend aucun titre pour une case sans `title` et le réalisateur n'en écrit pas ; les exclusions d'entrée de titre du contrôle de flash restent valables sans titre.

Preuves : `tests/comics-single-journey.test.ts` (une case locale ne coûte aucun clip, une case générée envoie le prompt du réalisateur avec image de début et de fin, une image letterboxée est redessinée et la meilleure candidate gardée, un clip signalé est repris puis replié en local, un clip figé part en local sans inspection, `film.json` sans titre, un plan sauvegardé sans les nouveaux champs garde son gabarit) et `scripts/check-comics-journey.ts` (navigateur réel, montage réel, contrôles déterministes réels sur les médias de référence, V1/V2/V3, zéro appel payant). Aucun film payant n'a été produit pour ce changement : la qualité artistique des prochaines générations reste à juger par Shimi.

### Ajustements du 25/10/2026 au soir (film ff695062)

Les trois clips Kling de la V1 sont revenus quasi figés (énergie 0,14 / 0,26 / 1,10) : l'image de fin verrouillée sur l'image de départ annulait l'action. Désormais une case `generated` n'envoie jamais d'`end_image` ; le champ `lockEndFrame` reste dans le schéma par compatibilité mais est ignoré. Seuil de clip figé ramené de 2 à 1 (calibré sur le film Gazalighting validé : clips vivants à 1,18 et 1,51 ; figés mesurés à 0,81 / 0,34 / 0,14 / 0,26).
