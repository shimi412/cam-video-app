# Attack (comics) sans intervention, 21 octobre 2026

Objectif : un client lance un film Attack depuis l'interface et arrive au téléchargement sans qu'un ingénieur intervienne, avec les garde-fous que Motion a reçus le 21 octobre. Les quatre validations humaines restent : storyboard, prix vidéo, film complet, finitions. Aucun appel payant n'a été fait pour ce chantier ; tout est vérifié hors ligne.

## Ce qui a changé, et pourquoi

| # | Avant | Maintenant | Fichiers |
|---|---|---|---|
| 1 | Alignement Whisper strict, aucun écrêtage, mot doublé fatal, `paceRecording` en échec sur une fin énergique ; alignement après les images | Mêmes tolérances que Motion (`collapseRepeatedTokens`, `clampWordTimings`, `sourceTailPolicy:'preserve-for-review'`), cache Whisper lié à source/script/modèle, fin énergique signalée à l'écoute. La voix est alignée **avant** toute image : un écart coûte la voix seule | `src/lib/comics/voice.ts` (`alignTokens` pur, testé), `service.ts` |
| 2 | Inspection d'image bloquante : `s.images` partiel, alignement jamais lancé, révision en échec « Panel timing missing » | Inspection consultative, mise en cache par fichier (`s.inspections`), notes par case dans la planche et la revue du film ; `s.images` et `s.clips` toujours remplis | `inspection.ts`, `model.ts` (`panelNotes`, `reviewNotes`), `page.tsx` |
| 3 | `SystemExit` au build pour un titre court (il faut ~1,42 s de case) | Titre prolongé à travers la transition jusqu'avant le titre suivant, ou retiré ; chaque réparation dans `checks.titleRepairs`, affichée au client. Sous-titres plafonnés à deux lignes (34 caractères à 52 px, 52 à 44 px) pour tenir la zone sûre | `comics/runtime/build.py`, `render.ts` |
| 4 | Un clip en défaut gelait tous les clips ; une révision repayait les clips acceptés | Inspection de clip consultative ; tout clip terminé est gardé ; un clip identique d'une révision antérieure est réutilisé par son empreinte (`reusableClip`, `adoptReusableClips`) ; un échec confirmé mène directement à l'offre de remplacement | `pricing.ts`, `service.ts` |
| 5 | `retry-saved` lié à l'expiration du devis (15 min) ; `priceComic` comptait deux fois les opérations en vol | Une reprise d'un travail approuvé n'exige plus de devis frais (l'approbation lie les plafonds) ; seules les requêtes jamais envoyées sont chiffrées | `service.ts` (`budgetValid`), `pricing.ts` |
| 6 | Soumission restée `sending` à vie après un timeout ou un `isError` | `isError` = refus définitif (`failed`, remplacement proposé) ; timeout = rapprochement par `show_generations` (une seule tâche non revendiquée au même prompt est adoptée, plusieurs = superviseur, aucune après 3 essais et 10 min = échec confirmé). Préréglage décliné dynamiquement, `adjustments` refusés avant soumission, `ip_detected` terminal, `use_unlim:false` partout, statut inconnu = lecture ambiguë | `provider.ts` |
| 7 | Revue de livraison bloquante | Consultative comme Motion : notes dans `deliveryNotes`, l'approbation du client libère le téléchargement ; une panne du service de revue (pas un verdict) garde l'approbation en attente | `service.ts` |
| 8 | Toute erreur passait par le superviseur payant | Arrêts typés `ComicStop` (validateur, contrôles du build, alignement, prix changé, échec confirmé) affichés tels quels, sans diagnostic ; `AIHttpTransient` relancé sur minuterie (5 fois, 90 s × n) ; le superviseur reste pour les états ambigus | `errors.ts`, `service.ts` (`failComic`) |
| 9 | Plafonds codés en dur | `src/lib/comics/budgets.ts` (`comicsBudgets()`, variables `CAM_COMICS_*`), validé au Start avec une sonde réelle du modèle directeur (`probeWriterModel`, environ 0,002 $) | `budgets.ts`, `director.ts` (`comicsReady`) |
| 10 | Détecteur d'éclairs final bloquant | Entrées de titres exclues par construction ; autres candidats = notes avec deux images de preuve, montrées à l'approbation visuelle. Le remplacement d'un clip à éclairs par l'image approuvée est consigné dans `checks.stillFallbacks` et transmis à la revue de livraison | `render.ts`, `flash-check.py` inchangé |
| 11 | Cas caméra `if c == 5` propre à Gazalighting | Supprimé | `build.py` |

Contrôle de solde Higgsfield au Start : non fait. Aucun transport Clay n'appelle ni n'analyse l'outil `balance` (il n'est qu'autorisé dans `providers/cam.ts`) ; inventer son schéma de réponse aurait été une supposition.

Compatibilité : tous les nouveaux champs d'état sont optionnels (`inspections`, `stop`, `transientRetries`, `audioReview`, `deliveryNotes`, champs d'`Operation`), les empreintes de requêtes sont inchangées (`use_unlim` et le préréglage décliné sont ajoutés à l'envoi, pas aux paramètres hachés).

## Preuves

- Tests unitaires comics : 37 verts (`tests/comics.test.ts`, `tests/comics-service.test.ts`, `tests/comics-director.test.ts`, nouveau `tests/comics-unattended.test.ts`).
- `build.py` exécuté hors ligne sur la référence Gazalighting (0 réparation, 0 élément trop bref, 59,15 s) puis avec deux cases raccourcies (0,5 s et 1,2 s) : deux titres retirés et consignés, aucun arrêt.
- Parcours navigateur hors ligne `scripts/check-comics-journey.ts` : PASS (0 appel externe, 0 appel payant, 1 décision de reprise injectée, 3 builds réels, film 59,15 s, -16,4 LUFS, zones sûres vides, 0 éclair final, case 1 en image approuvée consignée dans `stillFallbacks`, téléchargement 27,7 Mo). Preuve : `storage/qa/comics_qa_bb0ccb6a71a640f28854e5ecc8c60b91/proof.json`.

## Ce qui manque encore pour la qualité (pas pour l'enchaînement)

- **Vocabulaire du lettrage BD** : le build ne pose que titres et cartouches de sous-titres. Onomatopées, accusation barrée, tampon, éclat rouge du film du 4 octobre n'existent pas comme opérations typées que Claude pourrait choisir par case.
- **Retouche d'emblème** : l'inspection signale un emblème faux, rien ne le corrige. `comics/template/tools/pose-embleme.py` reste manuel ; la méthode (image fixe retouchée animée par la caméra quand l'emblème est lisible) n'est pas automatisée.
- **Sous-titre contre visage** : la zone sûre est vérifiée, pas la superposition avec un visage ou l'objet de l'action (`sub-pos.json` du film du 4 octobre). Il faut une position de sous-titre par case, choisie sur l'image.
- Un clip définitivement échoué demande toujours un prix de remplacement approuvé par le client ; l'alternative « image approuvée + caméra BD » (déjà utilisée pour les éclairs) serait une décision produit de Shimi.
- Les notes d'inspection ne déclenchent aucune correction : c'est le client qui décide. La qualité artistique d'une génération réelle reste à juger sur un vrai film.
