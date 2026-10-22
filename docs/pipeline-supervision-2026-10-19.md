# Supervision des reprises techniques par Claude

Demande de Shimi, 19 octobre 2026 : terminer les anciennes reprises techniques sur les trois catégories, sans génération payante pendant l'intégration.

## Chemins exécutés

- Clay et Attack transmettent l'erreur, les reçus, le budget approuvé, les retours conservés et les tentatives précédentes à la session Claude de cette vidéo. Motion utilise le même journal de décision et conserve son outil de réparation de code.
- Une décision typée choisit la reprise du travail enregistré, la vérification locale de narration, la réparation Motion, la préparation d'un prix, un remplacement explicitement chiffré, ou une investigation avec motif précis. Le code vérifie la disponibilité des outils, les validations humaines et l'identité des requêtes.
- Le moteur enregistre l'entrée avant l'analyse et la décision avant exécution. Une analyse interrompue retrouve la même identité, même après réordonnancement des clés JSONB. Trois décisions maximum par travail ; les dépenses d'analyse restent plafonnées par requête. Les échecs ne créent pas de nouvelle identité pour contourner une limite.
- Les lectures HTTP ne se relancent plus silencieusement. Leur erreur remonte dès la première tentative. Reprise sur l'identifiant accepté, avec le compteur et le délai sauvegardés. Aucun renvoi d'une soumission dont l'issue est inconnue.
- La direction initiale, les devis, l'interprétation des retours et les exports locaux passent également par la supervision de leurs erreurs. Ce mécanisme enveloppe uniquement des lectures ou tours Claude persistés, jamais les paiements, validations humaines ou soumissions de médias.
- Un décalage de transcription peut être vérifié localement sur la voix existante, après la décision Claude correspondante. Les mots et les fichiers sources restent inchangés.
- Les actions affichées suivent la décision enregistrée. Un ancien dossier en pause est analysé sur reprise explicite ; le worker n'adopte pas automatiquement les anciennes productions.

## Correction d'isolation trouvée pendant le parcours réel

L'ancien worker pouvait réécrire le checkpoint d'un UUID présent sur disque mais absent de sa base, notamment un dossier de répétition isolée. La vérification d'appartenance précède désormais toute mutation et toute observation dans le `finally`. Test dédié de conservation exacte des octets.

## Vérification

Les preuves de cette intégration sont regroupées dans `storage/qa/pipeline-supervision-2026-10-19/`. Le rapport `report.json` précise les résultats et chemins de preuve : 669 tests dans 93 fichiers, TypeScript et lint réussis ; parcours complets Clay, Motion et Attack jusqu’au téléchargement ; redémarrage brutal des workers Clay et Motion. Les fichiers et reçus de coût du test client existant ont été comparés avant/après et sont identiques. Le worker local a été rechargé après vérification de l’absence de production en cours.

Les tests injectent les réponses Claude/fournisseurs aux frontières externes, exécutent les validateurs, contrôleurs, bases isolées, interfaces et rendus locaux. Le parcours Clay injecte une panne avant soumission ; Attack une panne de rendu après réception des clips. Ils vérifient une seule reprise et aucune double soumission. Motion vérifie également une analyse interrompue et un arrêt brutal du worker après écriture.

## Limites explicites

Cette intégration ne transforme pas le logiciel en terminal Claude libre. Les opérations de réparation disponibles sont explicites. Une pièce manquante, une soumission inconnue, une erreur déterministe sans outil de correction ou une analyse indisponible restent visibles et conservées, sans fausse promesse de réussite. Les protections de dépense et les validations humaines restent appliquées. Les tests hors ligne prouvent le parcours et la conservation des états ; ils ne constituent pas une validation esthétique d'une nouvelle génération Claude. Aucun ancien film client n'a été régénéré pour cette vérification.
