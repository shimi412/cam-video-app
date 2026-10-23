# Motion : grille de prix commune, 23 octobre 2026

Décision de Shimi du 23 octobre, 10:45 (journal `docs/motion-contract-repair-2026-10-20.md`) : un seul parcours pour Clay, Motion et Attack, script → estimation de délai et de prix → validation → V1 complète → retours → devis V2 → … → téléchargement. Motion suivait déjà ce parcours depuis le 21 octobre ; ce chantier aligne ses prix et son écran de création. Code : `src/lib/motion/pricing.ts`, `budgets.ts`, `service.ts`, `store.ts`, `state.ts`, `src/app/motion/new/page.tsx`, `src/app/api/motion/route.ts`.

## Prix de la première version

- `firstVersionPriceCents(coût estimé)` de `src/lib/customer-price.ts` : coût jusqu'à 20 $ → 30 $, de 20 à 30 $ → 40 $, au-delà → 50 $. Remplace le prix fixe de 10 $ partout (écran de création, schéma `StartMotion`, devis `motion-v1-0`, réservation du portefeuille).
- Coût fournisseur estimé d'une V1 (`estimateFirstVersionCost`) : allocation d'écriture `CAM_MOTION_WRITING_CAP_USD` + allocation de revue `CAM_MOTION_REVIEW_CAP_USD` + narration (`CAM_MOTION_VOICE_CAP_CREDITS` crédits × `customer_pricing.higgsfieldCreditUsd`, le réglage admin déjà utilisé par Clay et Attack) + alignement local (0 $ : Whisper tourne sur la machine). Les plafonds de retours et de réparation ne font pas partie d'une V1. Ce sont des allocations, pas des dépenses mesurées : chaque étape payée tourne dedans.
- Avec le `.env` courant (écriture 10, revue 1,5, voix 3 crédits à 0,10 $) : 11,80 $ estimés → 30 $.
- L'offre (`motionFirstVersionOffer`) est servie par `GET /api/motion`, affichée avant Start avec le délai (`MOTION_V1_ESTIMATED_MINUTES` = 15, d'après les V1 complètes mesurées les 21 et 22 octobre), renvoyée comme `acceptedPriceUsd` et recalculée à la création : un prix qui a changé entre-temps est refusé avec une phrase client (« The film price is now $X. Review the price before starting. »), jamais recalculé en silence. Le prix accepté et son estimation sont sauvegardés dans l'état (`acceptedPriceUsd`, `firstVersionOffer`) avant toute étape payée.
- Si `customer_pricing` n'est pas configuré dans l'administration, l'écran de création affiche « The film price is not configured yet. Contact support before starting a film. » et Start reste inactif.

## Prix de chaque révision

- `revisionPriceCents(coût estimé)` : coût × 2 arrondi au dollar supérieur, ajouté au prix accepté du film. `revisionAmounts` remplace la formule × 12 des 19 et 21 octobre et supprime le plafond cumulé (`CAM_MOTION_PRICE_CEILING_USD`, 20 $ puis 30 $). La variable reste lue par `motionBudgets()` pour qu'un ancien `.env` valide encore ; rien ne l'utilise.
- Exemples : 0,20 $ estimés → 1 $ ; 1,36 $ → 3 $ ; 8,50 $ → 17 $. La carte client montre toujours le prix supplémentaire, le prix total après correction et la phrase de résumé.
- La limite de trois versions (V1 + deux révisions, `MAX_MOTION_REVISIONS`) est inchangée : elle borne les dossiers `revision-N`, pas le prix.

## Films créés sous les anciens prix

- Un état sauvegardé sans `acceptedPriceUsd` garde l'échelle historique `legacyMotionPrice` (10 $ + 5 $ par correction) ; un état avec un prix accepté garde ce prix exact. Rien n'est réécrit rétroactivement : une révision d'un film à 10 $ coûte son estimation × 2 au-dessus de 10 $.

## Preuves

- `tests/motion-pricing.test.ts` : estimation V1 depuis les allocations et paliers (11,80 $ → 30 $, 24,30 $ → 40 $, 50 $ au-delà), révisions × 2 sans plafond, création refusée si le prix accepté diffère de l'offre puis réservation du bon montant (`motionQuote('id',0,{totalUsd:30})`), prix hérités préservés.
- `tests/motion-budgets.test.ts` : `voiceCredits` rejoint la table unique des bornes (`CAM_MOTION_VOICE_CAP_CREDITS`, défaut 3, maximum 10).
- `tests/motion.test.ts` : échelle historique et limite de versions.
- `scripts/check-motion-journey.ts` : l'écran de création affiche « Ready in about 15 minutes » et « $30 for your first complete version » avec le réglage `higgsfieldCreditUsd` 0,10 injecté dans le schéma isolé ; aucun appel payé.
- `scripts/check-motion-journey.ts` : le film facturé vaut 31 $ (30 $ + 1 $) à la fin du parcours ; `scripts/check-motion-worker-restart.ts` : son attente de phase `board` datait d'avant le parcours unique du 21 octobre (le worker livre en `visuals` depuis), corrigée au passage. Les trois contrôles tournent avec `CAM_MOTION_PYTHON` vers le venv local et sans appel réseau.
