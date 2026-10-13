# BLUEPRINT — cam-video-app

> Décisions verrouillées du projet. À lire avant toute session de code. On ne redesigne pas ce qui est acté ici sans décision explicite de Shimon.
> Fiche projet (contexte client, offre, devis) : `BINA/1 PROJETS/Prospect - Automatisation medias IA (Base44)/`.

## Le produit en une phrase

Application conversationnelle pour CAM (Combat Antisemitism Movement) : un employé colle un script produit par leur app Base44, l'assistant cadre la demande, affiche le prix estimé, attend la confirmation, puis la pipeline produit une vidéo prête à publier en moins de 30 minutes. Bina ne fait ni l'idée, ni le message, ni le script.

## Décisions verrouillées (cadrage du 2026-08-20)

| Sujet | Décision |
|---|---|
| Phase actuelle | 100 % local sur le Mac de Shimon. VPS client Hetzner dédié plus tard. |
| Stack | Next.js 16 (App Router), TypeScript strict, Tailwind 4, shadcn/ui, Postgres (embedded-postgres en local). |
| Cerveau du chat | Claude Sonnet 5 (`claude-sonnet-5`) via API Anthropic, compte Bina. Passé par le AI SDK : changer de modèle = une ligne de config admin. Jamais exposé au client. Remplace la décision « open source » du 19/08 (coût projeté 15 à 45 $/mois à pleine cadence, contrainte inutile). Jamais de serveur chinois. |
| Génération médias | fal.ai (compte Bina), branché le 2026-08-20 (`src/lib/providers/fal.ts`) : keyframes Nano Banana Pro 2K (0,15 $/image, `/edit` avec image de référence pour la cohérence), clips Wan 2.5 image-to-video 720p (0,10 $/s, standard) / Kling 2.5 Turbo Pro (0,35 $ les 5 s, premium), voix off MiniMax Speech-02 HD (0,10 $/1000 caractères). Prix vérifiés sur fal.ai le 20/08, repris tels quels dans le métering. |
| Moteur de clips | fal.ai par défaut. **Voie de comparaison ouverte le 2026-09-22 : `VIDEO_PROVIDER=runway`** surcharge le seul slot vidéo (`src/lib/providers/runway.ts`), le reste restant sur fal — Runway n'a ni TTS, ni détourage, ni transcription. Runway côté API est un routeur (wan3, gen4.5, veo3.1, seedance2_5), facturé en crédits à 0,01 $, modèles réglés par `RUNWAY_VIDEO_STANDARD` / `RUNWAY_VIDEO_PREMIUM`. Non activé par défaut : `pnpm compare:video` chiffre l'écart avant toute bascule. Origine : veille, pas une demande client. |
| Montage | HyperFrames, rendu local sur CPU (gratuit). Tout texte à l'écran passe par HyperFrames, jamais incrusté dans les images générées. |
| Modèles de vidéos | Bibliothèque de recettes enregistrées. Deux au lancement : **Cartoon** (1-2 personnages stylisés, voix off, pas de lip-sync) et **Whiteboard** (éducatif, dessiné à la main en motion graphics, façon collage Vox). Une recette = style figé + prompts types + pipeline + habillage + sous-titres. Un nouveau modèle = une nouvelle recette, pas un développement. |
| Modes | **Automatique** : l'app choisit le modèle et les paramètres depuis le script. **Manuel** : l'employé choisit le modèle et règle la grille (ton, format, voix off). Dans les deux cas : estimation de prix affichée, confirmation obligatoire avant lancement. |
| Crédits | Compteur en dollars, métering de chaque appel API (coût réel + marge = prix client), blocage propre à solde vide. Recharges à la main côté admin en local ; Stripe en phase finale. Échec technique non décompté, itération créative facturée. Le client voit des dollars, jamais de tokens. |
| Modes d'exécution | Tous les appels externes passent par des adaptateurs. **Décision Shimon du 2026-08-20 : fin de la phase de test interne, on teste en conditions réelles.** Défaut local = `PROVIDER_MODE=fal` + `BRAIN_MODE=api`. Autres valeurs gardées pour le développement : `PROVIDER_MODE` `mock` (placeholders), `dryrun` (placeholders + feuille de production) ; `BRAIN_MODE` `mock` (heuristique), `cli` (CLI Claude Code, abonnement de Shimon, jamais livré). Le modèle du cerveau vient du réglage admin `chat_model` (défaut `claude-sonnet-5`). `pnpm check:providers` vérifie les deux clés sans dépense média. |
| Comptes utilisateurs | Pas de login en local. Auth.js (email + mot de passe, auto-hébergé) avant le VPS. |
| Entrée du script | Collé à la main dans le chat. Branchement direct Base44 après audit de leur app (conditionnel au devis). |
| Repo | `BINA/REPOS/cam-video-app`, GitHub privé shimi412. Secrets dans `.env` jamais commité. |

## Architecture

```
src/
├── app/                  # Pages Next.js (chat, admin)
├── db/                   # Drizzle : schéma + client
└── lib/
    ├── providers/        # Adaptateurs vers l'extérieur (la seule porte de sortie)
    │   ├── types.ts      # Interfaces ImageGen, VideoGen, TTS + coûts
    │   ├── mock.ts       # Fournisseurs factices (dev)
    │   └── fal.ts        # Fournisseur réel fal.ai (défaut)
    ├── credits.ts        # Ledger, solde, blocage, marge
    └── pricing.ts        # Estimation avant lancement, grille par recette
scripts/
├── db.ts                 # Démarrage/arrêt du Postgres embarqué (.pg-data/)
└── seed.ts               # Recettes Cartoon + Whiteboard, crédits de dev
storage/                  # Médias générés en local (gitignoré)
```

Règle d'or : **aucun appel réseau externe hors de `src/lib/providers/`**. C'est ce qui rend le mode simulation étanche et le métering exhaustif.

## Schéma de données (v1)

- `templates` : les modèles de vidéos (slug, nom, recette JSON, statut).
- `conversations` / `messages` : le fil du chat.
- `jobs` : une production (script, template, params, statut draft → estimated → confirmed → running → succeeded/failed, estimation, coût final, chemin de sortie).
- `api_calls` : le métering — chaque appel externe loggé avec fournisseur, type, coût réel USD, crédits facturés.
- `credit_ledger` : mouvements de crédits (recharge, consommation, ajustement). Le solde est la somme.
- `settings` : configuration admin (modèle de chat, multiplicateurs de marge, plafonds).

## Chantiers

1. **Fondations** (✅ 2026-08-20) : repo, Next.js, Postgres embarqué, schéma, adaptateurs mock, seed.
2. **Le chat** (V1 simulée ✅ 2026-08-20, cadrage API Claude branché ✅ 2026-08-20 via AI SDK, `BRAIN_MODE=api`) : page Studio avec modes auto/manuel, estimation + confirmation. Reste : conversation libre derrière la même sortie (`resolveParams`).
3. **La pipeline** (V1 simulée ✅ 2026-08-20, fal.ai réel branché ✅ 2026-08-20) : `src/lib/runner.ts`. Deux moteurs :
   - **Cartoon** (famille cartoon) : storyboard Claude (`director.ts`) + bible de style, keyframe maître puis références (Nano Banana Pro edit), clips Wan 5 s calés sur la voix par plan, montage ffmpeg. Pas encore retravaillé après le verdict qualité.
   - **Collage** (famille whiteboard, ✅ v1 le 2026-08-20) : `src/lib/collage/` : partition par phrase écrite par Claude (`score.ts`, événements ancrés sur les mots), éléments générés + détourés (`providers.cutout` = Nano Banana Pro + Bria), timestamps mot à mot (`providers.transcribe` = Whisper), composition HyperFrames générée (`compose.ts`) et rendue localement (CPU), sous-titres karaoké. Première vidéo réelle 60 s produite (2,81 $ réels). **Verdict Shimon 20/08 soir : bonne direction mais pas au niveau** : zones de sécurité ignorées, composition au hasard, sous-titres mal césurés, recyclage des mêmes images (interdit : chaque plan reçoit des éléments neufs, variantes regénérées), rythme lent, entrées toutes identiques.
   - **Chantier en cours (process en 3 étapes validé le 20/08)** : (1) bibliothèques ✅ `layouts.ts` (10 gabarits + safe zones par format + bande des mots-clés, validés sur planche), `backgrounds.ts` (8 plaques de fond partielles, 7 placements), `textstyles.ts` (8 traitements de texte), `assets.ts` (rognage sharp) ; reste : `motions.ts` (20 à 30 presets entrées/sorties/transformations/caméra + anti-répétition), `captions.ts` (une phrase = un bloc, 2 lignes équilibrées), `audit.ts` (safe zones, densité, variété, sous-titres) ; (2) partition refondue : gabarit + chorégraphie + plaque + styles de texte par phrase, éléments neufs, rythme cible 1 événement / 1 à 1,3 s, test à blanc + planche 1 image/s ; (3) run réel seulement si l'audit passe, brouillon d'abord. Outil : `pnpm tsx scripts/mockup-layouts.ts 9:16` (planche de gabarits).
   - Ensuite : bruitages papier/feutre + nappe musicale, même moteur sur la recette tableau feutre, run cartoon.
4. **Crédits et admin** (V1 ✅ 2026-08-20) : ledger, métering, blocage à solde vide, page admin (recharge, marge, relevés). Reste : plafonds mensuels + alertes.
5. Ensuite (hors local) : assistant de campagnes, Auth.js, Stripe, VPS.

Le POC pour Eyal (2 vidéos test, mêmes formats) se produit à la main avec les skills existants, en parallèle de l'app. Ses réglages calibrent les recettes du chantier 3.

## Commandes

```bash
pnpm db:start      # démarre le Postgres embarqué (.pg-data/)
pnpm db:push       # applique le schéma Drizzle
pnpm db:seed       # recettes + crédits de dev
pnpm dev           # lance l'app
pnpm db:stop       # arrête Postgres

pnpm check:providers   # valide les clés Anthropic, fal et Runway sans dépense média
pnpm compare:video 30 5 0.3   # coût des clips par moteur (durée, plan, taux de retries), zéro appel
```


## État au 12/10/2026 : reprise du logiciel

Cette section actualise l'état historique du 20/08. Les choix de stack restent applicables. Reprise autorisée par Shimon le 12/10, puis autonomie accordée pour la remise en état.

### Situation constatée

- Base Git initiale : `1977fd9`. Changements existants (Runway, collage, démonstrations et brief) sauvegardés dans `b81af6d`, sans génération payante ni push.
- Le Studio est encore un formulaire. Pas encore de conversation libre, pièces jointes, itérations ciblées ni bibliothèque des productions côté client.
- Les cinq recettes d'août sont retirées du catalogue de production. Les trois concepts d'octobre existent dans `storage/cam-oct05-v2/` sous forme de productions accompagnées et de scripts manuels. Ils ne sont pas intégrés au moteur de l'application.
- Les scripts de voix et de montage d'octobre contiennent le texte d'Eyal, des numéros de cases et des pauses spécifiques. Ils sont des références de résultat et des fixtures à généraliser, pas un moteur générique à traduire tel quel. Le dossier `storage/` reste ignoré par Git ; les sources utiles et les actifs verrouillés doivent être pérennisés lors du chantier concept.
- Restent à livrer : assistant de campagnes, Stripe et auto-recharge, alertes, plafonds mensuels, relevé exportable, comptes utilisateurs, serveur CAM dédié, audit Base44, guide, export des trois formats en 1080p et grille de prix définitive.
- Le devis mentionne quatre semaines depuis la signature. Les notes de suivi calculent aussi un délai depuis l'acompte et citent l'engagement après la revue du 05/10. Aucun nouveau calendrier client n'est acté par cette reprise.

### Chantier 0 : remise en état

- Compilation réparée : durée Kling typée et validée dans l'utilitaire R&D, suppression des `any` concernés. Contrôle de code limité aux sources, sans analyser les bibliothèques générées de `storage/`.
- Politique d'exécution centralisée dans `src/lib/providers/mode.ts`. `mock` et `dryrun` bloquent les appels du cerveau (API et CLI), même avec clés et `BRAIN_MODE=api`. Les adaptateurs médias réels refusent aussi les appels directs en simulation. Un mode inconnu échoue explicitement ; `PROVIDER_MODE=mock` prime sur l'ancien `MOCK_MODE=false`.
- Appels du cerveau déplacés dans `src/lib/providers/brain.ts`. Le suivi exhaustif de leurs coûts réels reste à construire ; cette remise en état ne le prétend pas achevé.
- Simulation : aucun débit, aucun remboursement compensatoire, coûts réels et montants facturés à zéro. Coûts hypothétiques conservés séparément pour contrôle. La commande `pnpm dryrun` vérifie ces invariants et un double lancement concurrent.
- Correction du diagnostic initial : les échecs avant le débit final n'étaient déjà pas facturés. Le débit et le passage à `succeeded` sont désormais dans une transaction unique. Les doubles confirmations et exécutions du même job utilisent une prise en charge atomique. La réservation de solde entre jobs distincts reste à faire.
- Mode de production enregistré dans chaque nouveau job et recontrôlé au lancement. Une estimation créée dans un autre mode doit être refaite.
- Recettes archivées dans le seed et la source. Elles sont refusées à la sélection, au cadrage et à la confirmation, même avec une ancienne base non reseedée. Exception réservée à la CLI de test hors ligne. Le Studio et la bibliothèque indiquent la préparation des nouveaux styles.
- `pnpm check:providers` ne réalise plus de complétion payante et retourne un code d'échec si un contrôle échoue. Anthropic : accès au modèle confirmé. fal : upload de contrôle refusé HTTP 403 avec restriction de crédits signalée. Aucun crédit ajouté, aucune génération réelle testée.
- Vérification : tests Vitest des frontières de simulation, du catalogue et des diagnostics ; compilation et lint ; production complète de remplacement en 9:16. Le rendu réussi, ses écritures de coûts et son absence de mouvements de crédit sont vérifiés en base.

### Corrections à appliquer au chantier concept

- Un premier parcours pâte à modeler complet, testé sur plusieurs scripts, avant de décliner BD puis motion. Dépendances à intégrer d'emblée : reprise durable par plan, identifiants fournisseur conservés avant l'attente, limite d'appels simultanés, réservation du budget et plafond accepté par le client.
- La voix pilote les durées ; ne pas imposer cinq secondes à une narration plus longue. Kling 3 Pro accepte de 3 à 15 secondes selon le schéma consulté le 12/10. Audio natif désactivé lorsque la voix off est séparée.
- Tarifs vérifiés le 12/10 : Kling 3 Pro sans audio 0,112 $/s ; Eleven v3 0,10 $/1 000 caractères. Les coûts totaux incluent images, transcription, cerveau, tentatives et rendu. Aucune grille commerciale définitive validée ici. Sources : https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video et https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3.
- Contradiction éditoriale du brief : le BRIEF initial impose l'étiquette CLAIM ; le montage final du concept 1 et la note de production du 04/10 consignent son retrait demandé par Shimon, avec guillemets et barre rouge. Préserver la contextualisation explicite de l'accusation et appliquer le dernier retour au lieu de réintroduire l'étiquette silencieusement.
- Les contrôles techniques (flashs, sous-titres, zones sûres) ne prouvent pas seuls la qualité éditoriale ou l'absence de visages sous les sous-titres. Conserver une validation visuelle.
- Le modèle de serveur CAM sera choisi après mesure du rendu ; aucun achat ou déploiement engagé. Les essais payants gardent leur validation spécifique : script, recette, voix et coût estimé.

### Chantier 1, premier jalon local du 12/10 : aperçu concept Clay

L'autonomie donnée par Shimon autorise la suite du développement local. Elle ne transforme pas les vérifications gratuites en autorisation de production payante. Le chantier 0 est enregistré dans `288b773`, après la sauvegarde de l'existant `b81af6d`.

- `cam-clay` est proposée dans le Studio en aperçu gratuit seulement. Le serveur refuse le cadrage payant, la confirmation réelle et l'appel direct au moteur concept avant tout appel fournisseur. La bibliothèque signale explicitement cet état.
- Références d'octobre copiées dans `public/recipes/cam-clay/`, empreintes SHA-256 vérifiées à chaque travail : narrateur, monstre, effigie et logo CAM. Aucun nouvel actif généré ni envoyé à un fournisseur.
- Nouveau module `concept/` : plans typés, conservation des mots, découpage sans perte, durées de clips dimensionnées sur la narration estimée, image finale de transformation, prompts et références dans la feuille de production. Le script d'Eyal conserve ses 14 segments validés. Un autre script reçoit des scènes de remplacement neutres explicitement identifiées ; le storyboard créatif Claude n'est pas encore branché.
- Montage HTML HyperFrames local avec sous-titres, guillemets et barre rouge pour le premier titre du script d'Eyal. Son de remplacement silencieux. Minutage estimatif, et fonctions pures de détection de silences / insertion temporelle de respirations testées ; le recalage de la voix réelle reste à intégrer.
- Export du format choisi : 1080 × 1920, 1920 × 1080 ou 1080 × 1080, 30 i/s, H.264 + AAC. Composition recalculée pour chaque format ; pas de recadrage aveugle. Les trois exports simultanés d'un même travail restent à faire.
- Contrôles : ordre des mots, durée des sous-titres, vérification HyperFrames runtime / placement / contraste, dimensions / fréquence / codecs / durée via ffprobe, planches des plans et des raccords. Ils ne remplacent pas le contrôle éditorial, la détection de visages ni un détecteur complet de flashs. Les avertissements HyperFrames d'organisation des pistes sont présents, sans erreur de rendu.
- Une file de rendu en mémoire limite ce moteur à un rendu à la fois par processus. Ce n'est pas encore la file durable multi-processus exigée pour le serveur.
- Tarifs de préparation : Nano Banana Pro 2K 0,15 $/image, Kling 3 Pro sans audio 0,112 $/s, Eleven v3 0,10 $/1 000 caractères, réserve de 30 % pour tentatives et provision de 1 $ pour cerveau / transcription / montage. Deux images par plan sont réservées au devis provisoire, même si le plan final n'a pas besoin d'image de fin. La provision n'est pas un tarif fournisseur et la grille commerciale définitive reste à valider. Sources : https://fal.ai/nano-banana-pro ; https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video ; https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3.
- **Correction de voix** : `storage/cam-oct05-v2/voix/timing-dylan.json` identifie la démo comme « Dylan (Higgsfield seed_audio, speech_rate 30) ». Le brief présume une voix ElevenLabs à retrouver ; cette équivalence n'est pas prouvée. Ne pas inventer un identifiant ni présenter une autre voix comme identique.
- HyperFrames installé et figé en 0.8.91, version disponible et déjà présente sur le Mac. La dernière 0.8.150 renvoie 404 au téléchargement ; le contrôle d'usage n'existe pas en 0.8.91, usage inconnu. GSAP 3.14.2 local, aucune bibliothèque CDN dans ce moteur, télémétrie et recherche de mises à jour désactivées pour les rendus. `storage/` et `.pg-data/` exclus du paquet de déploiement.

Preuves exécutées :

- Eyal 9:16 : job `9925a6d4-4e3e-4931-af3c-4301be6bf41c`, 58,35 s, terminé en 101 s, un seul rendu malgré deux appels concurrents, zéro débit et zéro tentative fetch externe du processus applicatif.
- Nouveau script 16:9 : job `591dd4ad-f3fd-4c17-be68-7f211fd2a761`, terminé en 21 s, mêmes invariants.
- Nouveau script 1:1 : job `7a1c21f0-4982-4fa6-8d2a-a5de02df0fb9`, lancé depuis le navigateur par cadrage puis confirmation gratuite ; vidéo, feuille et contrôles affichés, solde inchangé.
- 13 tests Vitest passent ; lint et build passent. Les planches ont été inspectées visuellement. Sorties sous `storage/concepts/<job>/` et `storage/outputs/<job>.mp4`.

**Ce jalon ne clôt pas le chantier 1 complet.** Restent le pipeline réel (Claude, images, clips, voix/transcription et alignement), ses validations par étape, la reprise persistante, le plafond de facturation, les contrôles éditoriaux et le test payant approuvé. Les recettes BD/motion, le chat et les références utilisateur, les paiements, les comptes, l'hébergement et les autres livrables du devis ne sont pas livrés.

### Chantier 1, deuxième jalon du 12/10 : personnages et voix existants

Shimon demande de poursuivre en autonomie sans dépenser de crédits fal.ai. Ce jalon ne réalise aucun appel de génération, quel que soit le fournisseur.

- Nouveau parcours explicite « Load CAM example » dans le Studio : reconstruction locale du film Clay à partir des 12 clips existants, de la voix Dylan et du script correspondant. Estimation et montant facturé : 0 $. Le mode de préparation de nouveaux scripts reste disponible séparément, avec images de remplacement et son silencieux.
- 15 fichiers source, soit 65,4 Mo, inscrits dans un manifeste versionné avec leurs empreintes. Ils restent dans le stockage local non commité. Vérification avant cadrage et après copie dans chaque dossier de production autonome. Un fichier absent ou remplacé bloque ce parcours avec un message explicite, sans téléchargement ni génération de secours.
- Voix effectivement intégrée : `voix-dylan-v3-respire.wav`, Dylan Seed Audio, avec les pauses déjà préparées. Son PCM correspond à `montage/assets/narration.wav`. Le fichier de minutage provient de `timing-dylan-v3-respire-recale.json`, et non de l'ancienne prise rapide mentionnée au premier jalon. Les frontières de phrases restent inchangées ; trois mots de durée nulle sont redistribués dans leur intervalle parlé précédent. Le minutage mot à mot reste une estimation guidée par les silences, pas un nouvel alignement forcé.
- 14 phrases sur 12 plans, ajustement de vitesse des images uniquement, sans dépassement des médias. Voix à sa vitesse d'origine. Sortie de contrôle de 52,25 s, 1080 × 1920, H.264 / AAC / 30 i/s. Cette version intègre uniquement la voix, pas l'ancien mix musique/bruitages.
- Chaque mot prononcé est sous-titré, y compris les lignes déjà reprises en titre et la fin complète « like it's a legitimate question ». Contrôle d'une image par sous-titre et des deux côtés de chaque raccord. Après inspection, déplacement des sous-titres des plans 3, 6 et 12 pour dégager les visages. Export SRT et VTT ; enregistrement vocal et provenance accessibles depuis le résultat.
- Réutilisation limitée au script exact (espaces et apostrophes typographiques tolérés), à Clay et au format 9:16. Les mêmes restrictions sont appliquées côté serveur, y compris au lancement direct. Aucun identifiant ElevenLabs équivalent à Dylan n'est inventé.
- Lecture audio/vidéo avec réponses HTTP partielles pour avancer dans le fichier ; refus des plages invalides et des liens symboliques sortant du stockage. Le Studio retrouve le dernier travail confirmé dans le même navigateur après rechargement. Cette restauration de l'écran ne remplace pas une file de travaux durable en cas d'arrêt du serveur.
- Build sans avertissement, lint et 22 tests réussis : script/format/mode incompatibles, empreintes, mots conservés, minutage, durées des clips, prix nul et plages HTTP notamment.

Preuves :

- CLI hors ligne, job `884013f5-853e-4952-b9d4-36fe31c741c7` : 207 s, un seul rendu malgré deux appels concurrents, zéro tentative fetch du processus applicatif, aucune dépense ni écriture de crédit.
- Parcours navigateur après correction des sous-titres, job `e4d5f51a-38e3-47a4-b4cc-74d8e953c50a` : 130 s, terminé, estimation 0 $, facturation 0 $, une seule opération de rendu local à coût nul. Solde inchangé à 96,19 $. Lecture et navigation dans la vidéo vérifiées ; résultat retrouvé après rechargement.
- Piste exportée comparée à la voix source en PCM mono 8 kHz : corrélation 0,99926 sur 50,65 s à décalage nul. Volume moyen −22,3 dB, crête −1,3 dB. Les planches finales de sous-titres et de raccords ont été relues. `visualApproval: false` reste conservé : l'inspection technique ne constitue pas une nouvelle validation client.

**Limite du jalon :** le logiciel remonte maintenant un film à partir de médias existants. Produire de nouvelles scènes et faire dire un nouveau texte à la voix approuvée nécessitent encore les adaptateurs réels, les validations éditoriales, la reprise durable, les limites de coûts puis un essai payant expressément autorisé. Aucun de ces éléments n'est déclaré livré par la démonstration locale.


### Chantier 1, troisième jalon du 13/10 : préparation lisible et reprise locale

- Cadrage d’un nouveau texte : découpage visible avant confirmation, narration conservée, durées estimées cohérentes avec l’aperçu, références des personnages et statut explicite de la voix encore à choisir. Ce dossier de préparation est conservé avec le job et retrouve sa place après rechargement. Aucun accord de génération n’est inféré.
- Reprise manuelle des aperçus Clay interrompus ou en échec, par « Resume free preview ». Le serveur et le navigateur doivent retrouver le même stockage et la même base. Reprise refusée en mode payant, après changement de mode ou pour une recette archivée.
- Verrou PostgreSQL par job, partagé entre processus, conservé pendant le travail. Les écritures du job utilisent la connexion qui détient le verrou. Le suivi d’avancement lit `pg_locks` sans verrouiller : correction d’une collision observée pendant le test navigateur. La reprise repasse en file avant la réponse HTTP, ce qui évite que le navigateur s’arrête sur l’ancien état d’échec. Grâce de cinq secondes pour un job nouvellement confirmé.
- Dossiers isolés par tentative ; montage achevé sauvegardé avec empreintes de la composition, des médias et du MP4. Il est réutilisé si intact, sinon recalculé localement. Les contrôles sont toujours rejoués. Les étapes de préparation peu coûteuses sont recalculées ; il ne s’agit pas encore d’une reprise payante plan par plan avec identifiants fournisseur.
- Prix affichés : l’unité des animations est maintenant nommée « seconds » pour éviter de confondre secondes facturées et nombre de plans. La grille reste provisoire.

Vérifications du 13/10 :

- `pnpm test:recovery` : arrêt forcé d’un processus après le montage, puis deux demandes concurrentes ; job `c0b00965-0d85-4d6b-b541-0187d8c8a010`, deux tentatives au total, montage réutilisé, une seule opération de rendu comptabilisée, aucun débit. Preuve `storage/qa/cam-recovery-proof.json`.
- Navigateur, job `7756d914-e2d9-46ce-8db3-cd2be9e91b9d` : nouveau texte préparé en 16:9, arrêt brutal du serveur pendant la production, détection de l’interruption après redémarrage et reprise. Une simulation supplémentaire d’échec après rendu a vérifié le bouton jusqu’au résultat récupéré sans rechargement manuel.
- Régression du film existant : job `d12073dd-3f4b-4d0f-883e-57c609210e19`, 95 s pour reconstruire personnages et voix, un seul rendu malgré deux appels concurrents, aucun appel fetch externe du processus applicatif, zéro dépense et zéro débit.
- Tests unitaires, lint et build vérifiés. Captures du parcours dans `storage/qa/cam-preparation-2026-10-13.png` et `storage/qa/cam-recovery-2026-10-13.png`.

Limites maintenues : narration d’un nouveau texte avec une voix approuvée, scènes créatives et images finales, adaptateurs payants avec reprise des requêtes, réservation du budget et plafonds. Pas de génération payante, de push ni de déploiement pendant ce jalon.

### Chantier 1, quatrième jalon du 13/10 : scènes importées et voix de test locale

Nouvelle consigne de Shimon : poursuivre les scènes et la voix en autonomie, toujours sans crédits fal.ai. Aucun appel payant, tous fournisseurs confondus.

- Un nouveau script peut maintenant être lu par une voix de test installée sur le Mac : Daniel en anglais, Thomas en français, Carmit en hébreu. L'interface les présente comme des voix de test ; elles ne remplacent pas la validation de la voix finale CAM et ne sont jamais présentées comme Dylan. Aucun téléchargement ni repli distant. Anglais et français vérifiés jusqu'au MP4 ; hébreu proposé si disponible, mais prononciation et mise en page non revues.
- Chaque phrase reçoit son propre enregistrement. Ses durées mesurées pilotent les scènes ; les respirations internes sont conservées, avec pauses entre phrases. Les positions des mots et des sous-titres restent approximatives. WAV et minutage sont sauvegardés ensemble avec empreintes : correction d'une variation de durée observée entre deux synthèses Mac du même texte, qui empêchait de récupérer un montage terminé.
- Avant confirmation, chaque scène accepte une image PNG/JPEG/WebP ou un clip MP4 local. Import, remplacement et retrait depuis le Studio, sauvegarde immédiate et restauration du brouillon après rechargement. Le texte n'est pas réécrit. Les scènes sans média gardent un visuel explicitement provisoire.
- Limites appliquées côté serveur : 32 Mo par fichier et corps multipart borné, images fixes de 24 mégapixels maximum, clips de 0,2 à 60 s jusqu'à 4K. Décodage des octets, identifiants de stockage générés, normalisation en PNG ou H.264/30 i/s, retrait de la piste son et des métadonnées des clips, refus du SVG et des fichiers invalides. Empreinte SHA-256 revérifiée au montage. Anciennes versions importées conservées localement après remplacement ; nettoyage à prévoir avant hébergement.
- Le cadrage des médias est conservé sans recadrage automatique. Un clip trop long est raccourci ; un clip trop court fige sa dernière image. La vitesse de la voix et des images reste inchangée. Pas de prétention de mise en scène IA nouvelle : ce jalon monte des fichiers existants sur un texte nouveau.
- Édition et confirmation partagent le verrou du job. Une production confirmée ne peut plus recevoir de médias ni changer de voix. Les routes d'import et de sélection de voix sont fermées en mode payant.
- Résultat : MP4, lecteur et WAV de la voix de test, SRT/VTT, provenance des médias, minutages et planches de contrôle. L'écoute est accessible dans le Studio.

Vérifications :

- `pnpm test:local-media`, job `f825bd74-811f-4cc0-93eb-b885daa615a6` : image, clip avec piste sonore supprimée et scène provisoire ; voix anglaise de 12,861 s, volume moyen −19,9 dB. Doublon d'exécution refusé, montage et WAV identique récupérés après interruption simulée, zéro tentative fetch du processus applicatif, zéro coût réel et zéro écriture de crédit. Preuve : `storage/qa/cam-local-media-proof.json`.
- Navigateur, job `12c8e3a6-4856-4142-851e-560ef5de3491` : texte de démonstration français, narrateur et logo existants, un clip CAM importé, Thomas. Trois médias conservés après rechargement avant confirmation ; MP4 de 14,43 s lisible, sans erreur du lecteur, voix présente. C'est une démonstration technique d'import, pas un nouveau film éditorial CAM.
- 35 tests unitaires réussis ; compilation et lint vérifiés. Captures de préparation et de résultat dans `storage/qa/cam-scenes-voix-*-2026-10-13.png`.

Suite : voix finale approuvée pour les nouveaux textes, choix éditoriaux et génération des nouvelles images/animations, adaptateurs avec requêtes persistantes, budget réservé et plafonné. Ces travaux restent ouverts ; aucune génération payante, aucun push ni déploiement dans ce jalon.


## Jalon du 13 octobre 2026 : scènes proposées automatiquement et Dylan identifié

- Les nouveaux textes reçoivent des mises en scène déterministes selon des indices anglais/français : source, contexte, diffusion, fabrication, histoire, communauté, question. Un sujet non reconnu garde un présentateur neutre. C'est un brouillon éditorial à relire, sans appel LLM et sans génération d'image. Le script demeure mot pour mot inchangé.
- Éditeur de scène dans le Studio : description, mouvement, références, image de fin éventuelle et titre ajouté au montage. Enregistrement sous le verrou du job, restauration du brouillon, interdiction après confirmation. Un formulaire non enregistré bloque le lancement. Les titres sont échappés dans le HTML du montage.
- Voix : identifiant Dylan retrouvé dans le manifeste historique et confirmé par `list_voices` Higgsfield en lecture seule le 13/10 : `b847bc29-f184-583a-8ad9-d1f1e16d1a60`, preset `seed_audio`. Le lecteur expose l'enregistrement d'origine avec contrôle d'empreinte et plages HTTP. Le candidat préparé reprend `speech_rate=22` du manifeste de la version retenue, avec WAV 48 kHz ; les pauses locales du film ne sont pas garanties par ce seul réglage. Identité confirmée, nouvelle lecture et rythme à valider. Le tarif ElevenLabs a été retiré du devis Clay : voix à chiffrer, sous-total provisoire hors voix. Aucun appel audio lancé.
- Dossier JSON de génération téléchargeable avant lancement, puis snapshot figé par tentative : voix, images Nano Banana Pro 2K avec toutes les références ordonnées, images de fin prenant l'image initiale en référence, clips Kling 3 Pro avec son désactivé. Les médias importés sont réutilisés. Les durées restent provisoires et les scènes dépassant 15 s sont signalées à découper. Les URL distantes restent des liaisons à résoudre ; aucun fichier envoyé aux fournisseurs.
- Répétition locale de la chaîne avec une file simulée, intégrée à chaque aperçu : dépendances, schémas des requêtes, journal par empreinte, reprise du même identifiant après coupure de suivi, arrêt si la soumission a une issue inconnue. Une modification d'image invalide les clips dépendants. Le journal est protégé par le verrou existant du job et refusé en mode production. Aucun résultat simulé ne remplace une image ou une voix réelle.
- Limite : les transports payants, l'envoi des médias, l'alignement de la voix définitive, les validations attachées aux empreintes, les réservations de budget et la réconciliation réelle restent à brancher avant activation. La répétition simulée ne valide ni la qualité créative ni le comportement d'un fournisseur en production.
- Vérifications : 42 tests unitaires ; parcours navigateur avec édition puis rechargement, lancement bloqué pendant l'édition, voix originale lisible (50,654542 s, lecteur sans erreur). Test d'intégration enrichi : correction d'une scène sans changer la narration, image de fin préparée, import image/clip, voix locale anglaise, rendu puis reprise identique, zéro requête externe et zéro débit. Preuve visuelle `storage/qa/cam-generation-dylan-2026-10-13.png` ; preuve du rendu `storage/qa/cam-local-media-proof.json`. La contrainte sans crédits fal.ai reste en vigueur.


## Jalon du 13 octobre 2026 : Bram choisi et adaptateurs de génération

- **Décision de Shimi : Bram pour les nouveaux films CAM.** Cette sélection remplace Dylan comme cible. Le film historique, son manifeste et ses résultats gardent Dylan. Les brouillons non confirmés se mettent à jour au rechargement sans réécrire leurs scènes.
- Catalogue Higgsfield vérifié en lecture seule : preset Bram `549ff70a-3ee7-4f04-a4d9-89a24fab7709`. Échantillon public de 17 s lisible dans le Studio. Requête préparée `text2speech_v2`, variante `elevenlabs`, une lecture. Précontrôle de devis uniquement sur une phrase générique : 0,15 crédit Higgsfield, aucun job. Ce chiffre n'est ni un prix USD ni le devis d'un script CAM. Compatibilité réelle du moteur, nouvelle lecture et rythme à valider ; aucun réglage de vitesse Dylan repris.
- Adaptateurs fal REST pour Nano Banana/Kling et MCP Higgsfield pour Bram : envoi, validation de l'accusé de réception, suivi par identifiant, extraction des URLs et refus des réponses incohérentes. Un POST fal sans relance automatique. Les réponses de devis, offres d'abonnement, erreurs et identifiants multiples ne sont pas assimilés à une génération acceptée. Aucun essai ni abonnement activé automatiquement.
- Le journal existant protège maintenant ces adaptateurs pendant la répétition locale : reçu avant soumission, identifiant durable, reprise du suivi, réutilisation du résultat, arrêt après une réponse perdue. La répétition du moteur utilise ces contrats avec des services factices. Les faux médias restent hors du montage.
- Connexion réseau préparée dans `src/lib/providers/cam.ts`, SDK MCP 1.32.1. Verrou CAM constant avant connexion, lecture des secrets et chaque appel réel ; fermé même avec `PROVIDER_MODE=fal`. Aucun jeton Higgsfield du connecteur local copié dans l'application. Aucun appel de génération payant exécuté.
- Restent à brancher : transfert des références et résultats, normalisation des médias générés, alignement de la vraie lecture Bram, validation liée aux empreintes des fichiers, réservation et mesure des coûts, réconciliation des demandes ambiguës. Les adaptateurs seuls ne rendent pas la production prête.
- Vérifications : 58 tests, lint, TypeScript et build réussis. Intégration locale `243762ef-cad6-4043-aa46-17e27c38d2c9` : 12,861 s, Daniel, deux médias importés, montage puis reprise avec voix identique, zéro tentative fetch applicative, zéro écriture de crédits, 0 $ facturé. Lecteur Bram vérifié dans le navigateur : 17 s, état prêt, aucune erreur. Preuve visuelle `storage/qa/cam-generation-bram-2026-10-13.png`.


## Jalon du 13 octobre 2026 : fichiers, budget et synchronisation Bram

- Transfert des références par empreinte et journal persistant : réutilisation des URL acquittées, contrôle d'expiration, arrêt après un envoi incertain. Adaptateur fal CDN v3 avec initialisation puis PUT ; clé limitée au serveur fal, aucune redirection ni relance automatique. Verrou réel inchangé, aucune référence envoyée pendant le développement.
- Réception des résultats : flux borné, décodage réel, image/clip normalisés, métadonnées et son des clips retirés. Audio unique audible, mono/stéréo, 0,2 à 600 s et 64 Mo maximum ; WAV mono 48 kHz sans modifier vitesse ou pauses. Empreintes source et fichier normalisé sauvegardées, cache contrôlé avant réutilisation. Un défaut de fichier ne relance jamais sa génération.
- Budget : devis complet et approbation liés au plan, aux opérations et à une échéance. Dollars fal et crédits Higgsfield séparés, calcul entier. Réservation globale sérialisée par transaction/verrou PostgreSQL, plafond de compte et plafond de production. Réservation marquée avant tentative ; issue inconnue ou échec garde le montant réservé. Coût réel accompagné d'une preuve, règlement idempotent, dépassement enregistré en entier et blocage des envois suivants. Seules les opérations jamais tentées peuvent libérer leur réservation. Les contrôles de simulation utilisent des montants fictifs, sans mouvement sur les crédits du client.
- Synchronisation : demande Whisper mot à mot ajoutée après la voix, diarisation désactivée, devis séparé encore manquant. Aucun appel de transcription lancé. Adaptateur avec identifiant persistant et reprise du suivi. Contrôle strict de tous les mots, des chevauchements, de la durée et des empreintes audio/script. Les sous-titres gardent la ponctuation du script. Validation liée au fichier et au minutage exacts ; toute modification invalide les animations et leur devis, même à durée arrondie identique. Les scènes de plus de 15 s restent bloquées pour découpage.
- Intégration locale : chaque aperçu produit un rapport de budget fictif. Avec une voix Mac, il vérifie aussi les transferts de fichiers locaux et la synchronisation, puis expose le dossier de génération recalculé. Le minutage mot à mot de cette répétition reste estimé. Les fichiers de contrôle ne remplacent jamais les scènes par de faux médias générés ; Bram n'est pas présenté comme enregistré ou approuvé.
- Vérifications : 76 tests, lint, TypeScript et compilation sans avertissement de traçage réussis. Intégration `b478eaa6-6e3f-4deb-95a3-3fa83e7ad8c4` : 12,861 s avec Daniel, deux médias importés ; concurrence réelle entre deux réservations PostgreSQL, réception d'un clip avec retrait du son, montage puis reprise avec fichiers et voix identiques, aucun nouveau transfert à la reprise. Zéro tentative fetch applicative, zéro écriture de crédits, 0 $ facturé. Parcours navigateur `31527145-d10e-4fc3-a989-8f2b30bf720d` : aperçu de 8,4 s réussi et liens vers les deux nouveaux rapports. Preuve `storage/qa/cam-delivery-budget-sync-2026-10-13.png`.
- Avant toute activation payante : obtenir de vrais devis complets et leurs preuves de coût, une autorisation explicite de dépense, une nouvelle lecture Bram et ses validations, les images validées, puis vérifier les réponses et fichiers réellement produits. L'opérateur doit pouvoir réconcilier une soumission incertaine. Aucun essai payant, aucune consommation fal.ai ou Higgsfield, aucun push ni déploiement dans ce jalon.

## Jalon du 13 octobre 2026 : validation des images et demandes interrompues

- Chaque visuel importé peut être approuvé ou refusé dans le Studio. Motif obligatoire au refus ; historique conservé, confirmations répétées idempotentes. La validation porte sur le fichier normalisé exact, la production, la scène et sa narration, le format et les références. Une modification la rend périmée ; un onglet ancien ne peut pas approuver le nouveau fichier. Verrou partagé et vérification des octets avant confirmation. Les scènes sans média gardent leur aperçu provisoire. Les anciennes productions confirmées conservent leur état.
- Rapport `visual-review.json` exporté avec les nouveaux aperçus. Résolveur de futures images clés testé : octets vérifiés, empreinte du transfert, opération d'origine, validation du départ puis de la fin liée à ce départ. Ce résolveur est prêt comme brique ; le parcours de revue des résultats réellement générés reste à brancher lors de l'activation autorisée. Une validation d'image n'autorise ni dépense ni lecture Bram.
- Les nouveaux journaux de requêtes lient production, opération, modèle, transport et empreinte de la charge envoyée. Écritures atomiques synchronisées sur disque. Le fournisseur simulé conserve un reçu d'acceptation distinct avant de rendre sa réponse. En cas de réponse perdue, la vérification de ce reçu restaure seulement l'identifiant d'origine ; la reprise suit cet identifiant. Aucun nouvel envoi, aucune libération du budget tenté. Absence de preuve, preuve incompatible ou échec terminal : blocage maintenu. Les anciens reçus ambigus sans liaison restent bloqués pour investigation.
- Écran de récupération et route `/api/jobs/[id]/requests`, mode local uniquement. Le client fournit seulement l'empreinte recherchée ; aucune URL, identité de remplacement ou fausse sortie acceptée. La reprise est bloquée dans le Studio et côté serveur tant qu'une requête reste incertaine ou échouée. Les appels réels restent derrière le verrou inconditionnel ; la preuve fournisseur réelle et ses coûts ne sont pas implémentés par la simulation.
- Correction révélée par les contrôles du rendu : fond opaque sous les titres, qui pouvaient être illisibles sur un média importé sombre.
- Vérifications : **82 tests**, lint, TypeScript et build réussis. `pnpm test:review-recovery`, production `902f75fa-0e69-4161-b973-12e7f0130e0b` : refus, validation périmée, remplacement, onglet obsolète, doublon de validation, reprise bloquée avant preuve, budget inchangé, un seul envoi simulé et montage final réussi. Test Daniel/image/clip `32627f85-9014-4b98-b0fb-05a6f51438b5` de 12,861 s réussi avec récupération identique. Zéro fetch applicatif, zéro mouvement de crédits et 0 $ facturé dans les deux intégrations.
- Parcours navigateur `bc17a1b1-4bfc-403b-8394-10a6ddcaee73` : import de mire marquée OFFLINE TEST, refus, validation, modification du titre rendant la validation périmée, nouvelle validation ; interruption simulée puis reçu retrouvé et aperçu de 4,6 s terminé. Preuves : `storage/qa/cam-image-review-2026-10-13.png`, `cam-request-recovery-2026-10-13.png` et `cam-review-recovery-proof.json`.
- Aucun crédit fal.ai ou Higgsfield consommé, aucun essai payant. Bram reste choisi, sans nouvelle lecture produite. Prochaines étapes sans dépense : revue par étapes des futures images générées, preuves de coût et dossier d'autorisation complet. La vérification en conditions réelles attend toujours une autorisation explicite sur script, style, voix et budget.
