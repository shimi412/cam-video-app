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
