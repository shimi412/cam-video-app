# Archive de mémoire projet

Section conservée intégralement lors de la passation du 20 octobre 2026.

## 2026-10-18 — Second blocage Start : états finaux manquants

- Le nouveau clic avait créé `59f74d40-26e7-438a-a407-181c95b3523d` (Test 04). Contrairement au précédent essai, son plan décrivait deux transformations réelles, scènes 2 et 6, mais sans `endScene`. Le contrôle physique refusait donc le devis avant tout appel média. Le premier correctif ne couvrait pas ce cas ; le même message client générique masquait une cause différente.
- Les nouveaux plans sémantiques complètent désormais une image finale manquante à partir de l'action exacte déjà écrite par le directeur, sans nouvelle analyse payante ni modification du découpage. La consigne de sortie du directeur exige également cet état final. Les images ajoutées sont comptées, jamais offertes ou doublées par défaut ; les plafonds de lancement et la validation du storyboard restent applicables.
- Une reprise peut compléter un plan enregistré uniquement s'il n'existe encore ni devis, ni approbation, ni décision, ni requête média. Les paramètres sont relus depuis PostgreSQL après sauvegarde avant calcul du hash : l'ordre des clés JSONB ne doit pas invalider le devis entre préparation et approbation. Les directions d'origine sont conservées dans `endpointCompletion`.
- Reproduction réussie sur une copie isolée du véritable essai : scènes 2 et 6 complétées, onze images au total dont une fiche interne, initialisation et reprise sans double réservation. Le script `scripts/check-saved-storyboard-start.ts` vérifie narration conservée, hash stable à l'approbation et essai source inchangé. Preuve `storage/qa/saved-storyboard-start-proof.json`.
- Lecture seule du tarif fal également réussie : un GET de tarification, onze images à 0,15 $, soit 1,65 $ fournisseur. Aucun POST de génération, aucune modification de l'essai source, aucun worker lancé. Ce coût fournisseur ne constitue pas un prix client.
- Vérification : 485 tests sur 67 fichiers, TypeScript et lint réussis. La reprise de données réelles utilise des prix injectés et interdit le réseau ; elle établit la correction du blocage, pas la qualité des futures images.
- Le requestId de lancement actuel vit dans la page. Une reprise sans rechargement conserve cette identité et l'analyse enregistrée ; ne pas promettre cette réutilisation après un rafraîchissement ou un nouveau script.

- Parcours navigateur complet après ce second correctif : réussi jusqu’au téléchargement et aux trois formats (`storage/qa/client-journey-proof.json`, 2026-10-18T11:04:06.510Z). Contrôleur et interface réels, base isolée, réponses fournisseur simulées, zéro appel externe et zéro appel payant.

