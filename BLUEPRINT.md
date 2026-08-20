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
| Génération médias | fal.ai (compte Bina) : keyframes Nano Banana, clips Wan 2.5 (standard) / Veo-Kling (premium), voix off via les TTS de fal.ai (MiniMax/Kokoro, qualité à valider au POC contre la référence ElevenLabs). |
| Montage | HyperFrames, rendu local sur CPU (gratuit). Tout texte à l'écran passe par HyperFrames, jamais incrusté dans les images générées. |
| Modèles de vidéos | Bibliothèque de recettes enregistrées. Deux au lancement : **Cartoon** (1-2 personnages stylisés, voix off, pas de lip-sync) et **Whiteboard** (éducatif, dessiné à la main en motion graphics, façon collage Vox). Une recette = style figé + prompts types + pipeline + habillage + sous-titres. Un nouveau modèle = une nouvelle recette, pas un développement. |
| Modes | **Automatique** : l'app choisit le modèle et les paramètres depuis le script. **Manuel** : l'employé choisit le modèle et règle la grille (ton, format, voix off). Dans les deux cas : estimation de prix affichée, confirmation obligatoire avant lancement. |
| Crédits | Compteur en dollars, métering de chaque appel API (coût réel + marge = prix client), blocage propre à solde vide. Recharges à la main côté admin en local ; Stripe en phase finale. Échec technique non décompté, itération créative facturée. Le client voit des dollars, jamais de tokens. |
| Mode simulation | Par défaut en local (`MOCK_MODE=true`). Tous les appels externes passent par des adaptateurs ; les fournisseurs factices renvoient des médias placeholder et des coûts simulés réalistes. Zéro dépense API tant qu'on ne bascule pas. |
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
    │   ├── mock.ts       # Fournisseurs factices (défaut en local)
    │   └── fal.ts        # Fournisseur réel fal.ai (chantier 3)
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
2. **Le chat** (V1 simulée ✅ 2026-08-20) : page Studio avec modes auto/manuel, estimation + confirmation. Le cadrage est déterministe (`src/lib/brain.ts`) ; reste à brancher : conversation libre Sonnet 5 via AI SDK derrière la même sortie (`resolveParams`), dès que la clé Anthropic existe.
3. **La pipeline** (V1 simulée ✅ 2026-08-20) : `src/lib/runner.ts`, bout en bout avec les mocks + montage ffmpeg. Reste à brancher : fournisseur fal.ai réel (`src/lib/providers/fal.ts`), habillage HyperFrames complet, sous-titres.
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
```
