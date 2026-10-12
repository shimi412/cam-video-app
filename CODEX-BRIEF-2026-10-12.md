# Brief de reprise pour Codex — cam-video-app — 12 octobre 2026

Tu reprends le développement de `cam-video-app`, le produit vendu à CAM (Combat Antisemitism Movement) par Bina Interactive. Tu travailles pour Shimon (Shimi). Tu réponds en français, le code et l'interface restent en anglais. Un seul chantier à la fois : tu proposes un plan, tu attends « go », tu exécutes, tu rends compte, tu passes au suivant.

## 1. Ce que tu dois lire avant d'écrire une ligne

Dans cet ordre :

1. `BLUEPRINT.md` (ce repo) : décisions verrouillées du 20/08 et du 22/09. Elles ne se rediscutent pas sans Shimon.
2. `README.md` (bloc « nextjs-agent-rules ») puis `node_modules/next/dist/docs/` : Next.js 16 diffère de ce que tu connais, tu copies le pattern d'une page existante avant d'en écrire une.
3. `src/lib/runner.ts`, `src/lib/brain-llm.ts`, `src/lib/recipes.ts`, `src/lib/pricing.ts`, `src/lib/credits.ts`, `src/db/schema.ts`, `src/lib/providers/*`, `src/app/page.tsx`, `src/app/admin/page.tsx`.
4. `storage/cam-oct05-v2/BRIEF.md` et les scripts de production du 4 octobre (voir section 4) : c'est la méthode validée qu'il faut industrialiser.
5. Fiche projet : `BINA/1 PROJETS/Prospect - Automatisation medias IA (Base44)/Prospect - Automatisation medias IA (Base44).md` et ses notes `cam-production-2026-10-04.md`, `cam-rd-2026-09-29.md`. Le devis signé est `devis-cam.html` dans le même dossier.

## 2. Ce que le devis signé engage (19 août 2026, acompte encaissé le 17 septembre)

Mise en place à 3 000 $, « système opérationnel sous 4 semaines », puis 200 $/mois de suivi et production à l'usage par crédits. Les sept livrables du devis, mot pour mot dans l'esprit :

| # | Livrable du devis | Ce que ça veut dire concrètement |
|---|---|---|
| L1 | Interface conversationnelle de production | Une conversation : l'employé décrit le besoin, joint ses références (fichiers, liens, sujets détectés), confirme le prix affiché, suit l'avancement en temps réel. Bibliothèque des vidéos produites accessible à tout moment. |
| L2 | Bibliothèque de modèles vidéo prêts à l'emploi | Plusieurs formats, styles, rythmes et voix. Tout le prompting est figé dans le système, l'équipe joue avec des choix simples. |
| L3 | Assistant de campagnes | À partir des sujets détectés et des campagnes passées, le système propose des idées de campagnes avec brief prêt à lancer et prix estimé. |
| L4 | Chaîne de production automatisée | Script → voix off → visuels → sous-titres → assemblage → export aux formats des plateformes. Objectif : moins de 30 minutes par vidéo. |
| L5 | Compte de production et paiement en ligne | Recharge Stripe, solde visible en permanence, alerte solde bas, recharge automatique optionnelle. Échec technique non décompté, itération créative facturée au tarif affiché. Relevé mensuel détaillé. 100 $ de crédits offerts à la livraison. |
| L6 | Audit et connexion à l'app de surveillance (Base44) | Audit inclus ; branchement direct si leur app expose les accès (un sujet détecté devient un brief prêt à lancer), sinon devis complémentaire. En attendant : fichiers et liens. |
| L7 | Formation | Sessions de prise en main et guides pas à pas. |

Engagements pris par mail depuis : modes automatique et manuel (réunion du 19/08) ; estimation avant lancement, confirmation obligatoire ; « les premiers templates produits par le logiciel à partir de vos propres scripts » (mail du 28/09) ; les deux semaines après la revue du 5 octobre pour livrer (mail du 28/09). Jalon de mi-parcours tenu le 5 octobre : trois concepts montrés, CAM doit envoyer des scripts réels (Vanesa Levine, promis pour le 11/10, rien reçu au 12/10).

Hors devis, dit par écrit au client le 28/09 : créer un nouveau concept de marque (page dédiée façon Lenny Bricks) et écrire les scripts.

## 3. État réel du repo au 12 octobre

Commit HEAD `1977fd9` (20/08), plus des modifications non commitées du 22/09 (adaptateur Runway, scripts collage Fern, `BLUEPRINT.md`). Première chose à faire au chantier 0 : commiter proprement ce qui traîne.

Ce qui existe et fonctionne (testé le 20/08 en conditions réelles fal.ai + API Claude) :

- Page Studio (`src/app/page.tsx`) : script collé, mode auto ou manuel (modèle, ton, tier, voix, format), cadrage par Claude Sonnet 5 (`BRAIN_MODE=api`), estimation ligne par ligne, confirmation, progression par polling, vidéo lisible, feuille de production en mode `dryrun`.
- Pipeline `runner.ts` : famille cartoon (storyboard Claude → voix MiniMax → images clés Nano Banana Pro edit → clips Wan 2.5 / Kling 2.5 → montage ffmpeg) et famille whiteboard (moteur collage `src/lib/collage/`, HyperFrames rendu local).
- Crédits : ledger en dollars, solde, blocage à solde vide (HTTP 402), métering de chaque appel (`api_calls`), marge admin, recharge manuelle, page Admin (solde, marge, modèle de chat, productions, relevé des appels).
- Adaptateurs : fal.ai (images, vidéo, TTS MiniMax, détourage Bria, Whisper), Runway (vidéo seule, voie de comparaison), mock et dryrun.
- Cinq recettes (`recipes.ts`) : cartoon flat vector, ink noir, rétro, whiteboard Vox collage, tableau feutre.

Ce qui est mort ou manquant :

- **Les cinq recettes sont obsolètes.** CAM les a jugées datées le 09/09. Les trois concepts validés par Shimon le 04/10 et montrés à CAM le 05/10 (pâte à modeler, motion design Arcane avec logo CAM, super-héros BD) n'existent **que** sous forme de scripts Python manuels exécutés sur l'abonnement Higgsfield (`storage/cam-oct05-v2/`). Aucune de ces trois chaînes ne tourne dans l'app. C'est l'écart principal entre le devis et le repo.
- Pas de chat : le Studio est un formulaire. Pas de pièces jointes ni de références. Pas de page « vidéos produites » côté client (la liste est dans Admin). Pas d'itération par la conversation.
- Pas d'assistant de campagnes (L3).
- Pas de Stripe, pas d'alerte solde bas, pas de recharge automatique, pas de plafonds mensuels, pas de relevé mensuel exportable (L5). Un échec technique n'est pas remboursé : `runner.ts` ne crée jamais d'entrée `adjustment`.
- Pas d'authentification, pas de déploiement : l'app tourne sur le Mac de Shimon avec un Postgres embarqué.
- Pas d'audit Base44, pas d'endpoint entrant (L6). Pas de guide utilisateur (L7).
- Export : le cartoon rend en 1280×720 ou 720×720 selon `canvasFor`, les concepts d'octobre sont en 1080×1920 uniquement. Le devis parle des formats des plateformes : 9:16, 16:9, 1:1 en 1080p.
- La grille tarifaire définitive promise « à la livraison » n'est pas écrite.

## 4. La méthode validée le 4 octobre, à industrialiser

Lis `storage/cam-oct05-v2/BRIEF.md`, puis `concept-1-pate-a-modeler/montage/build.py`, `concept-3-bd-heros/montage/build.py` et `controle.py`, `concept-2-motion-arcane/montage/build.py`, `detecte-flashs.py`, `planche-raccords.py`, `voix/timing.py`, `voix/pace-voice.py`, `voix/recale.py`, `concept-3-bd-heros/pose-embleme.py`, `higgsfield-media.json`.

La chaîne, étape par étape :

1. **Personnages verrouillés** : fiches de référence sur fond gris uniforme (personnage pâte à modeler, personnage Arcane, monstre noir, effigie, héros BD), produites une fois, stockées, jamais régénérées. Ce sont des actifs de la recette, pas de la production.
2. **Storyboard par phrase** : le script est découpé en phrases (14 pour le script test), chaque phrase reçoit un plan avec une image décrite (voir le tableau du BRIEF). Écrit par Claude à partir de la bible de la recette, validé par cases avant toute image.
3. **Une image clé par plan** (Nano Banana Pro 2K, edit avec les références verrouillées). Planche de contrôle, validation, puis seulement animation.
4. **Clips Kling 3.0 Pro**, 5 s, image de début imposée, image de fin imposée pour les transformations (phrase 13 : tableau qui devient smartphone).
5. **Voix** : TTS, puis minutage mot à mot (Whisper), puis `recale.py` (frontières = silences réels, mots étirés au prorata), puis `pace-voice.py` (respirations insérées dans de vrais silences). Chaque début de phrase est vérifié : le minutage brut dérivait jusqu'à 0,9 s.
6. **Montage HyperFrames généré en code** : `build.py` lit `timing.json` et produit `index.html` + `cues.json`. Aucun temps écrit à la main, tout se cale sur les mots. Tout texte à l'écran est en code (titres, sous-titres, étiquette CLAIM, croix rouge, cartouches BD, logo CAM). Les clips sont posés par phrase.
7. **Contrôles automatiques avant de montrer** : planche une image par seconde, une image par sous-titre avec les zones sûres Instagram tracées (rien à droite de x = 940 en 1080×1920, haut 12 %, bas 22 %), planche des raccords autour de chaque transition, détection des flashs (élément visible moins de 0,3 s).
8. **Export** 1080×1920 30 i/s H.264 AAC, puis déclinaisons.

Règles éditoriales qui ne bougent pas (BRIEF du 04/10 et retours de Shimon) :

- La fausse accusation n'apparaît jamais seule : guillemets + étiquette CLAIM.
- La caricature n'existe qu'en train d'être fabriquée par les monstres, jamais seule à l'écran.
- Aucun enfant à l'image, aucun visage réel, aucune arme pointée sur une figure humaine.
- Aucun texte généré par l'IA dans les images : tout texte en code.
- Sous-titres jamais sur un visage, dans les zones sûres. Pas d'étiquettes génériques (« REAL PROPAGANDA POSTER »), pas de mentions en bord de cadre (minutage, titre technique) : « ça fait IA ».
- Bruitages bas et rares. Voix ni précipitée ni robotique, avec respirations.
- Motion design : un seul grand plan qui évolue, rien qui naît dans les dernières images d'un plan, chaque geste du personnage vise un objet à l'écran, expression accordée au propos.
- Le symbole CAM ne sort jamais du générateur d'images (il dessine une étoile fermée) : il est posé en retouche (`pose-embleme.py`) ou en code.

## 5. Décisions verrouillées et hypothèses à faire trancher

Verrouillées (BLUEPRINT) : Next.js 16 + TypeScript strict + Tailwind 4 + Postgres ; cerveau Claude Sonnet 5 via AI SDK, réglé côté admin ; **tous les appels externes passent par `src/lib/providers/`** ; fal.ai par défaut, compte Bina ; montage HyperFrames rendu sur CPU ; crédits en dollars, le client ne voit jamais un token ; Auth.js avant le VPS ; VPS Hetzner dédié à CAM, pas le serveur Bina ; jamais de serveur chinois.

Hypothèses prises pour ce brief, à confirmer par Shimon avant le chantier concerné (tu les lui rappelles en tête de ton premier message) :

- **H1, fournisseur de production** : fal.ai pour tout. Vérifié le 12/10 : `fal-ai/kling-video/v3/pro/image-to-video` existe (start frame, end frame, 5 ou 10 s) et `fal-ai/elevenlabs/tts/eleven-v3` existe (0,10 $ les 1 000 caractères). Higgsfield reste l'outil de conception des fiches de personnages, pas un fournisseur de l'app. Tu vérifies les schémas d'entrée et les prix sur fal.ai avant d'écrire l'adaptateur et tu les reportes dans `pricing.ts`.
- **H2, ordre des recettes** : concept 1 (pâte à modeler) en premier, c'est celui que Sam juge le plus robuste en un seul jet ; concept 3 (super-héros BD) ensuite ; concept 2 (motion design) en dernier, c'est le plus codé et le moins dépendant de la génération. Si CAM tranche autrement à réception des scripts, l'ordre change, pas l'architecture.
- **H3, calendrier** : livraison annoncée au client « dans les deux semaines après le 5 octobre ». Tout ne tiendra pas. Priorité absolue aux chantiers 1 à 4 et 6 à 7 ; les chantiers 5, 8 et 9 sortent en version minimale.
- **H4, hébergement** : VPS Hetzner dédié (CX22 ou CX32 suffit, le rendu HyperFrames est sur CPU), Docker Compose avec Postgres et l'app, stockage des médias sur disque avec sauvegarde, domaine et HTTPS par Caddy.

## 6. Chantiers, dans l'ordre

Un chantier = un plan proposé, un « go » de Shimon, une exécution, un compte rendu, un commit. Pas de run payant (fal.ai ou autre) sans un « go » explicite sur le script, la recette, la voix et le coût estimé.

### Chantier 0 : remise à plat (une heure)

- Commiter les modifications en attente du 22/09 (Runway, collage Fern, blueprint) en un commit `chore:` lisible, sans secret (`git diff --cached` avant).
- `pnpm check:providers` : vérifier que les clés Anthropic et fal répondent.
- Écrire dans `BLUEPRINT.md` une section « État au 12/10 » qui reprend la section 3 de ce brief, et marquer les cinq recettes comme `status: archived` dans le seed.
- Fait quand : le repo est propre, `pnpm build` passe, le blueprint reflète le réel.

### Chantier 1 : moteur de recette « concept » (le cœur, priorité absolue)

Nouveau dossier `src/lib/concept/` qui porte la chaîne de la section 4 en TypeScript, pilotée par une recette :

- `assets.ts` : références verrouillées par recette (chemins sous `public/recipes/<slug>/` ou `storage/recipes/<slug>/`), uploadées une fois vers fal storage et mises en cache.
- `storyboard.ts` : Claude écrit un plan par phrase à partir de la bible et d'un gabarit de découpage (le tableau du BRIEF du 04/10 est le gabarit du concept 1). Sortie typée (zod) : phrase, image décrite, prompt image, prompt mouvement, image de fin ou non, éléments de texte à poser en code.
- `keyframes.ts` : une image par plan, Nano Banana Pro edit avec les références. Planche de contrôle PNG.
- `clips.ts` : Kling 3.0 Pro image-to-video, start frame, end frame optionnelle, 5 s, reprise par plan sur échec, 30 % de retries budgétés.
- `voice.ts` : ElevenLabs via fal, puis Whisper mot à mot, puis portage de `recale.py` et `pace-voice.py` (silences détectés par ffmpeg `silencedetect`, respirations insérées entre phrases, minutage recalé). Sortie : `timing.json` au même format que celui d'octobre (phrases + words + duration).
- `montage.ts` : portage de `build.py` du concept 1 : génération de `index.html` HyperFrames depuis `timing.json`, textes en code, sous-titres dans les zones sûres, croix rouge, étiquette CLAIM, logo CAM, musique et bruitages bas. Rendu local par la CLI HyperFrames (déjà utilisée par `src/lib/collage/compose.ts`, copie ce mécanisme).
- `controls.ts` : portage de `controle.py`, `detecte-flashs.py`, `planche-raccords.py`. Les planches sont écrites dans le dossier du job et exposées par `/api/media/`.
- `export.ts` : 1080×1920 maître, puis 1920×1080 et 1080×1080 par recadrage défini dans la recette (zones de recadrage par plan, pas un crop centré aveugle).
- Dans `runner.ts` : troisième branche `recipe.concept` à côté de cartoon et collage. Chaque appel est métré comme aujourd'hui. Un échec technique après débit crée une entrée `adjustment` qui rembourse (règle du devis, manquante aujourd'hui).
- Le mode `dryrun` écrit la feuille de production complète (prompts exacts, références, durées) sans rien dépenser : c'est ce que tu montres à Shimon avant tout run réel.

Fait quand : en `dryrun`, un job concept 1 sur le script test d'Eyal produit une feuille complète et un `index.html` HyperFrames rendu avec des images de remplacement ; puis, après « go », un run réel sort un MP4 1080×1920 avec les planches de contrôle, coût réel métré et affiché.

### Chantier 2 : les trois recettes CAM et la grille de prix

- `recipes.ts` : trois recettes `cam-clay`, `cam-comic-hero`, `cam-motion-arcane`, chacune avec sa bible (direction artistique, palette, personnages, interdits), ses références verrouillées, son gabarit de découpage, sa voix (Dylan pour 1 et 2, Xavier pour 3, identifiants à retrouver dans ElevenLabs via fal), son habillage HyperFrames.
- Le concept 2 (motion design) est surtout du code : porter `build.py` V4 avec sa grille à 96 BPM, ses ressorts, son logo vectoriel ; les clips du personnage sont courts et détourés. Le concept 3 porte la planche de douze cases avec caméra continue.
- `pricing.ts` : lignes par recette avec les prix fal.ai vérifiés (images, clips Kling 3.0 Pro par seconde, ElevenLabs, Whisper, rendu). Produire le document « grille tarifaire définitive » (markdown en anglais, `docs/pricing-grid.md`) avec le prix client par format aux fourchettes du devis : motion design 3 à 5 $, vidéo standard 8 à 12 $, vidéo premium 30 à 50 $. Tu proposes la marge par recette, Shimon tranche.
- Vignettes des trois recettes dans la bibliothèque.

Fait quand : les trois recettes apparaissent dans la bibliothèque, chacune produit une feuille `dryrun` cohérente, l'estimation affichée tombe dans les fourchettes du devis.

### Chantier 3 : fiabilité de la production

- Reprise d'un job par étape (état persistant par plan dans `jobs.params`, relance d'un seul plan, pas de régénération de ce qui existe).
- File d'exécution : un seul rendu HyperFrames à la fois sur la machine, les appels fal en parallèle bornés.
- Plafonds mensuels et alertes de consommation (réglages admin, blocage propre).
- Relevé mensuel exportable (CSV par mois : productions, coût réel, prix facturé, recharges).
- Mesure du temps automatique de bout en bout affichée dans Admin (la promesse des 30 minutes se prouve avec un chiffre).

Fait quand : un job interrompu à l'étape clips reprend sans redébiter ; le CSV du mois s'exporte ; le temps par job s'affiche.

### Chantier 4 : interface conversationnelle et bibliothèque des vidéos

- Remplacer le formulaire par un chat (AI SDK `useChat`, tables `conversations` et `messages` déjà prévues) qui aboutit toujours à la même sortie : cadrage, estimation, bouton de confirmation. Le mode manuel reste une grille dépliable dans le chat.
- Pièces jointes et références : fichiers (images, PDF), liens, sujets collés ; stockées sous `storage/references/<conversation>/`, résumées par Claude et passées au storyboard comme contexte. Les captures de tweets réels sont un besoin exprimé par CAM le 09/09.
- Itération par le chat sur un job terminé : « change la voix », « refais le plan 7 », « autre fin » ; chaque itération est un nouveau job dérivé, facturé au tarif affiché, qui réutilise tout ce qui n'a pas changé.
- Page « Videos » côté client : toutes les productions, lecture, téléchargement des trois formats, planches de contrôle, coût.
- Suivi temps réel : remplacer le polling par un flux SSE sur `/api/jobs/:id/events`.

Fait quand : un employé fait une vidéo de bout en bout depuis le chat, avec une référence jointe, et demande une variante sans repasser par le formulaire.

### Chantier 5 : assistant de campagnes (version minimale)

- Entrée : un sujet (texte collé, ou plus tard le webhook du chantier 8).
- Sortie : trois propositions de brief prêts à lancer (angle, recette suggérée, format, durée, prix estimé), chacune avec un bouton qui crée le job estimé dans le chat.
- Historique des campagnes passées lu depuis les jobs réussis pour éviter les doublons.

Fait quand : un sujet collé donne trois cartes de brief avec prix, un clic ouvre le cadrage.

### Chantier 6 : compte de production et Stripe

- Stripe Checkout pour les recharges (montants fixes 100, 250, 500 $), webhook signé qui écrit l'entrée `topup`, idempotence.
- Alerte solde bas par email (seuil admin), recharge automatique optionnelle (seuil + montant, carte enregistrée via Stripe Customer).
- Ledger : entrée `topup` de 100 $ offerts à la livraison, libellée.
- Frais Stripe (environ 4,5 %) intégrés dans la marge, pas affichés.

Fait quand : une recharge test en mode Stripe test crédite le solde, l'alerte part, l'auto-recharge se déclenche en test.

### Chantier 7 : comptes utilisateurs et déploiement

- Auth.js, email + mot de passe, deux rôles (client, admin Bina), invitation par email.
- Docker Compose (app, Postgres, Caddy), variables d'environnement documentées dans `.env.example`, script de sauvegarde quotidienne (base + `storage/`).
- Vérifier que le rendu HyperFrames (Chromium headless) tourne sur le VPS ; mesurer le temps de rendu.
- `REPRISE.md` à jour : où vit quoi, comment redéployer.

Fait quand : l'app est en ligne sur le domaine CAM avec HTTPS, un compte client et un compte admin, une production réelle réussie depuis le serveur.

### Chantier 8 : Base44, audit et entrée automatique

- Endpoint `POST /api/inbound/topics` authentifié par jeton, qui reçoit un sujet détecté et crée un brouillon de brief dans le chat (relié au chantier 5).
- Document d'audit en anglais (`docs/base44-audit.md`) : les questions à poser à CAM (webhooks sortants disponibles, format des sujets, authentification), et ce que Bina branche selon les réponses.

Fait quand : un `curl` sur l'endpoint fait apparaître un brief dans l'interface ; le document d'audit est prêt à envoyer.

### Chantier 9 : formation

- Page « Help » dans l'app (anglais) : le parcours en cinq écrans, les formats, le prix, les crédits, quoi faire quand ça échoue.
- Export PDF du guide pour la session de formation.

Fait quand : le guide couvre chaque écran livré, captures incluses.

## 7. Règles de travail

- Un chantier à la fois. Avant chaque chantier : plan en étapes numérotées avec fichiers touchés, puis attente du « go ».
- Aucun appel payant sans « go » explicite de Shimon sur le script, la recette, la voix et le coût estimé. Le mode `dryrun` est ton outil par défaut.
- Aucun appel réseau hors de `src/lib/providers/`. Tout appel est métré.
- Aucun secret dans le repo. `.env` est gitignoré, `.env.example` est à jour. `git diff --cached` avant chaque commit.
- Conventional Commits en anglais (`feat:`, `fix:`, `chore:`, `docs:`). Tu commites à la fin de chaque chantier validé, tu ne pousses que si Shimon le demande.
- `BLUEPRINT.md` est mis à jour à chaque décision prise ou chantier fermé. C'est le document qui fait foi pour la prochaine session.
- Next.js 16 : lire la doc locale avant d'écrire une page ou une route, copier le pattern existant.
- Tests : Vitest sur ce qui est pur (minutage, recalage, découpage en phrases, estimation de prix, recadrages) avant la logique qui dépend du réseau.
- Tu ne redesignes pas ce qui est verrouillé. Si tu penses qu'une décision est mauvaise, tu le dis en une phrase avec ton argument, puis tu attends.
- Tu ne rapportes jamais un chantier comme « fait » sans avoir exécuté le critère « fait quand » et montré la sortie.

## 8. Ta première réponse

1. Confirme ce que tu as lu (fichiers, lignes de commit).
2. Donne ton état des lieux contradictoire : ce que tu confirmes de la section 3, ce que tu infirmes, ce que tu as trouvé en plus.
3. Rappelle les hypothèses H1 à H4 et demande à Shimon de les trancher.
4. Propose le plan détaillé du chantier 0, puis attends « go ».
