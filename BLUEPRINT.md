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
