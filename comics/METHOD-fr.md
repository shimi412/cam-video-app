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
