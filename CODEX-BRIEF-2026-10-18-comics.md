# Brief pour GPT / Codex : troisième catégorie CAM, les vidéos « attack » en univers comics (18 octobre 2026)

Tu travailles sur `cam-video-app` pour Shimon (Shimi), Bina Interactive. Tu réponds en français ; le code et l'interface restent en anglais. Shimi t'autorise à coder directement ce chantier, sans attendre son « go » entre les étapes. L'interdiction de dépense reste entière (section 5).

## 1. L'objectif

Intégrer au logiciel une **troisième catégorie de film**, à côté des deux existantes (la pâte à modeler et le motion design en code, déjà intégré sous `/motion`) : les vidéos **« attack »**, des vidéos de riposte en univers de bande dessinée. Le client choisit cette catégorie, donne son script, et l'app produit un film de la qualité de `comics/reference/gazalighting-v4-540p.mp4` (59 s, 9:16), validé par Shimi le 18/10/2026. Ce film est la barre de qualité.

## 2. À lire avant d'écrire une ligne, dans cet ordre

1. `AGENTS.md` et `MEMORY.md` : règles produit, parcours client, contrat `whimsical-v1`, décisions verrouillées. Elles s'appliquent entièrement.
2. `comics/README.md`, puis `comics/METHOD-fr.md` (fait foi), puis `comics/PROMPTS-fr.md`.
3. `comics/template/build.py` en entier, `compose-audio.py`, `detecte-flashs.py`, `voice/`, `tools/pose-embleme.py`.
4. `comics/reference/prompts-gazalighting.json` : chaque requête de génération du film, mot pour mot.
5. L'intégration motion design que tu as déjà faite (`motion/PLAN.md`, `motion/README.md`, `motion/ACCEPTANCE-fr.md`, `/motion/new`, `/motion/[id]`, `motion_runs`) : reprends ses choix de sécurité, de journal des requêtes, de prix et de rendu au lieu d'en inventer d'autres.
6. Le parcours de la catégorie pâte à modeler (storyboard d'images, devis, clips, aperçu complet, finitions) dans `src/lib/concept/` : la catégorie comics génère aussi des images et des clips payants, elle doit passer par les mêmes garde-fous.
7. Le tableau Whimsical de la méthode comics, quand Shimi te le transmet.

## 3. Ce que tu dois comprendre de la méthode

- **Une case par phrase du script.** Pour chaque case : ce qu'on voit, si le héros est présent et comment, la couleur dominante, le titre en code, le mouvement.
- **Retour client intégré (Sacha, 05/10)** : l'univers porte l'histoire. Le héros apparaît dans au plus un tiers des cases, surtout en partie (main, cape, de dos), en entier au plus une fois. Le découpage automatique doit respecter cette règle.
- **Génération payante** : une image de storyboard, une image clé par case (Nano Banana Pro 2K), un clip Kling 3.0 Pro par case validée, une voix ElevenLabs (Harrison par défaut), avec les formules de `PROMPTS-fr.md` et les références verrouillées (héros + style, style seul).
- **Corrections locales gratuites** : emblème CAM reposé avec `pose-embleme.py` (le générateur dessine une étoile fermée), cases encadrées recadrées, défauts de ciel repeints. Si Kling redessine l'emblème image par image, la case devient une image fixe animée par la caméra.
- **Montage en code** : la planche de BD géante et la caméra qui traverse les cases, tout le texte en code, la signature CAM animée à la fin. Le minutage mot à mot de la voix pilote tout.
- **Contrôles qualité obligatoires** (règle de Shimi du 18/10) : aucun élément à l'écran moins de 0,8 s (le build s'arrête), détecteur de flashs sur la vidéo rendue, zones sûres Instagram, son vers -16 LUFS avec des bruitages graves et bas. Un contrôle qui échoue bloque la présentation au client.
- **Règles éditoriales** : aucune expression illustrée au pied de la lettre (le mot reste un titre) ; aucune victime, aucun visage réel, aucune violence montrée ; les affirmations du script sont celles du client, jamais complétées.

## 4. Les questions que tu dois trancher (tu décides, et tu justifies chaque choix dans ton compte rendu)

1. **La place dans le parcours** : nouvelle catégorie au même niveau que les deux autres sur la page d'accueil, avec son propre espace (sur le modèle de `/motion`) ou une variante du parcours pâte à modeler. Respecte `whimsical-v1`.
2. **Le découpage et les prompts** : comment le modèle de langage produit le découpage case par case et les prompts à partir des formules, avec la règle « héros dans un tiers des cases au plus » vérifiée par le code.
3. **La validation humaine** : la planche d'images clés (une carte par case : image, texte lu, ce qu'on voit, ce que ça fait comprendre, ce qui bougera, Oui/Non et commentaire), puis le devis vidéo, puis les clips, puis l'aperçu complet, puis les finitions séparées, puis le téléchargement. Une case refusée est redessinée seule et revient sur la planche.
4. **Le choix de la voix** : Harrison par défaut, écoute comparée de quelques voix graves sur le même extrait si le client le demande.
5. **Les corrections automatiques** : comment l'app détecte et corrige l'emblème, les cases encadrées, les clips qui ajoutent des symboles, du faux texte ou des actions non demandées (au minimum : signaler la case pour révision humaine, jamais présenter un défaut comme réussi).
6. **Le prix** : coût réel mesuré par film (images, clips, voix, appels au modèle de langage), prix client en dollars entiers selon les règles de `AGENTS.md`, devis affiché et accepté avant chaque dépense. Coût observé sur le film de référence : environ 130 crédits Higgsfield, révisions comprises.

## 5. Hors périmètre

- Toute génération payante pour tester : interdite sans autorisation de dépense explicite de Shimi. Les tests utilisent des médias injectés (les images et clips du film de référence) et un faux transport, comme `pnpm test:client-journey` et `pnpm test:motion-journey`.
- Toucher aux tests en cours de Shimi, aux productions existantes, aux contrats de requêtes déjà payées, aux deux catégories existantes.
- Les fichiers lourds du film de référence (clips, images 2K) restent dans `storage/cam-attack-gazalighting/`, qui n'est pas versionné : copie dans des fixtures de test seulement ce dont les tests ont besoin, en basse définition.

## 6. Critères d'acceptation

- Depuis la page d'accueil, un client choisit la catégorie « attack », colle le script de Gazalighting (`comics/template/voice/script.json`), et l'app enchaîne, avec des médias injectés et sans aucun appel payant : découpage, planche de validation, devis, clips, montage, contrôles, aperçu complet, finitions, téléchargement.
- Le film obtenu par ce chemin simulé respecte la grammaire du film de référence (planche, caméra, titres en code, logo animé), et les contrôles passent (aucun élément sous 0,8 s, aucun flash, zones sûres, son).
- Un contrôle qui échoue bloque l'étape et est signalé clairement.
- La règle « héros dans un tiers des cases au plus » est vérifiée par le code.
- Aucun nom de modèle ni de fournisseur dans les écrans client.
- Un test de parcours client couvre cette catégorie, sans identifiants fournisseurs, sans toucher aux productions existantes.

## 7. Comment tu travailles

1. Écris d'abord ton plan dans `comics/PLAN.md` (où tu branches chaque étape, tes réponses aux six questions, les risques, l'ordre des chantiers), puis enchaîne directement sur le code.
2. Avance par étapes qui laissent l'app fonctionnelle : après chaque étape, les tests existants passent (`pnpm test`, `pnpm lint`, `pnpm test:client-journey`, `pnpm test:motion-journey`).
3. Arrête-toi et demande seulement si une étape exige une dépense réelle, des identifiants fournisseurs, ou de modifier une décision verrouillée de `BLUEPRINT.md` ou `AGENTS.md`.
4. À la fin, un compte rendu en français : ce qui est fait, tes choix et pourquoi, les résultats des tests et des critères d'acceptation avec les preuves, ce qui reste à faire. Ne déclare rien de prêt pour le client sans un parcours réel réussi et la validation visuelle de Shimi. Mets `MEMORY.md` à jour.
