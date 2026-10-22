# Brief pour GPT / Codex : intégrer le motion design en code dans CAM (18 octobre 2026)

Tu travailles sur `cam-video-app` pour Shimon (Shimi), Bina Interactive. Tu réponds en français ; le code et l'interface restent en anglais. Shimi t'autorise à coder directement ce chantier, sans attendre son « go » entre les étapes (décision du 18/10/2026). L'interdiction de dépense reste entière (section 5).

## 1. L'objectif

Ajouter au logiciel un nouveau type de film : **le motion design typographique en code**, sans modèle vidéo. Le client donne un script, l'app produit un film comme celui de `motion/reference/plot-hole-v4-540p.mp4` (46 s, 9:16), validé par Shimi le 18/10/2026. Ce film est la barre de qualité : ce que l'app produit doit s'en approcher, pas s'en contenter d'une version simplifiée.

Le film est aujourd'hui fabriqué à la main par Claude dans une session. Il faut que l'app sache le faire, dans le parcours client existant.

## 2. À lire avant d'écrire une ligne, dans cet ordre

1. `AGENTS.md` et `MEMORY.md` de ce dépôt : règles produit, parcours client, contrat `whimsical-v1`, décisions verrouillées. Elles s'appliquent entièrement à ce chantier.
2. `motion/README.md` puis `motion/METHOD-fr.md` : la méthode validée (13 règles, déroulé, pièges). Elle fait foi.
3. `motion/template/build.py` en entier : c'est le cœur. Au-dessus des scènes, la machinerie réutilisable (mesure typographique avec fontTools, `scene/put`, transitions `iris/pan/band/recede_black`, logo CAM `brand_star`, sous-titres, `check_holds`). En dessous, les scènes A à K de Plot Hole, l'exemple complet.
4. `motion/template/compose-audio.py` et `motion/template/voice/` : son et chaîne de voix.
5. Le tableau Whimsical du parcours validé (lien dans `MEMORY.md`) et, quand Shimi te le transmet, le tableau Whimsical de la méthode motion design.
6. Dans `src/lib/concept/` : `production-flow.ts`, `storyboard.ts`, `presenter-text.ts`, `montage.ts`, `render.ts`, `brand-ending.ts`, `word-timing.ts`, `cam-voice.ts`, `editorial-audio.ts`, puis `src/lib/pricing.ts`, `src/lib/ai-routing.ts`, `src/lib/brain-llm.ts`. Comprends comment le parcours actuel fonctionne avant de proposer où brancher le motion design.

## 3. Ce que tu dois comprendre de la méthode

- **C'est un modèle de langage qui écrit le film.** Pour chaque script, Claude réécrit la section des scènes de `build.py` (une scène par phrase : fond, objet, mot qui joue son sens, raccord qui part d'un élément de la scène). Ce n'est pas un gabarit à trous. La machinerie au-dessus des scènes reste identique d'un film à l'autre.
- Le rendu se fait avec HyperFrames (`npx --yes hyperframes@0.8.91 render`), qui a besoin de Node et d'un Chromium sans écran, environ 1 minute pour 45 s.
- La voix est générée (ElevenLabs Dylan, par la voie déjà utilisée dans l'app), puis rythmée et minutée mot à mot. Le minutage mot à mot pilote tout le film.
- Les contrôles automatiques font partie de la méthode : écart voix/image sous 0,3 s, `check_holds()` à 0, zones sûres Instagram (x 120-940, y 262-1480), bruitages au moins 15 dB sous la voix, mot retiré du sens qui disparaît entièrement, signature de marque à la fin.

## 4. Les questions que tu dois trancher (tu décides, et tu justifies chaque choix dans ton compte rendu)

1. **Où le motion design entre dans le parcours.** Nouvelle catégorie de film choisie par le client, ou traitement de scène à côté de `metaphor` et `presenter-text` ? Tiens compte du contrat `whimsical-v1` (« presenter/text treatments use local motion design without an AI animation request »).
2. **L'équivalent du storyboard.** Pour ce type de film, la validation humaine porte sur une planche : une carte par scène avec son extrait animé, « ce qui bouge », « ce que ça fait comprendre », Oui/Non et commentaire, plus le film basse définition. Comment cela s'insère dans les étapes existantes (validation du storyboard, aperçu complet, finitions séparées, téléchargement).
3. **Le moteur d'écriture.** Appel à l'API Claude (modèle et effort configurables) avec la méthode et le gabarit en contexte, sortie validée (le script Python s'exécute, contrôles à zéro) avant rendu. Où tourne l'exécution de Python et du rendu (serveur, conteneur, file de travaux), et comment on la sécurise : le code écrit par le modèle ne doit avoir accès qu'à son dossier de travail.
4. **Les retours.** Un retour client sur une scène doit modifier cette scène seulement et garder le reste du film identique.
5. **Le prix.** Coût réel mesuré à chaque film (jetons de l'API Claude + voix). Prix client d'environ 10 $ par vidéo, retours facturés de la même façon, plafond de 15 à 20 $. Respecter les règles de prix de `AGENTS.md` (dollars entiers, coûts fournisseurs séparés, prix affiché avant lancement et accepté).

## 5. Ce qui est hors périmètre de ce chantier

- La version avec modèle vidéo ou avec objets générés (Higgsfield) : plus tard, sur décision de Shimi.
- Toute génération payante pour tester : interdite sans autorisation de dépense explicite de Shimi. Les tests utilisent des médias injectés et un faux transport, comme `pnpm test:client-journey`.
- Toucher aux tests en cours de Shimi, aux productions existantes, aux contrats de requêtes déjà payées.

## 6. Critères d'acceptation

- À partir du script de Plot Hole (`motion/template/voice/script.json`) et du minutage fourni (`motion/template/timing.json`), sans aucun appel payant, l'app enchaîne : écriture des scènes (réponse du modèle simulée par le `build.py` de référence), contrôles, rendu, planche de validation, aperçu complet, finitions, téléchargement.
- Le film obtenu par ce chemin simulé est identique au film de référence (même `index.html`, mêmes contrôles à zéro).
- Un contrôle qui échoue (tenue, zone sûre, son) bloque la présentation au client et est signalé clairement, sans prétendre que c'est réussi.
- Un test du parcours client couvre ce nouveau type de film, sans identifiants fournisseurs.
- Aucun nom de modèle ni de fournisseur dans les écrans client.

## 7. Comment tu travailles

1. Écris d'abord ton plan dans `motion/PLAN.md` (où tu branches chaque étape, tes réponses aux cinq questions de la section 4, les risques, l'ordre des chantiers), puis enchaîne directement sur le code, sans attendre de validation.
2. Avance par étapes qui laissent l'app fonctionnelle : après chaque étape, les tests existants passent (`pnpm test`, `pnpm lint`, `pnpm test:client-journey`).
3. Ne casse rien d'existant : productions en cours, tests de Shimi, contrats `whimsical-v1` et anciens, coûts déjà payés.
4. Arrête-toi et demande seulement si une étape exige une dépense réelle, des identifiants fournisseurs, ou de modifier une décision verrouillée de `BLUEPRINT.md` ou `AGENTS.md`.
5. À la fin, un compte rendu en français : ce qui est fait, les choix faits et pourquoi, les résultats des tests et des critères d'acceptation de la section 6 (avec les preuves), ce qui reste à faire. Ne déclare rien de prêt pour le client sans un parcours réel réussi et la validation visuelle de Shimi. Mets aussi `MEMORY.md` à jour.
