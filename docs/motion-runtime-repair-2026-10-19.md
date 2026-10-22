# Réparation du moteur Motion, 19 octobre 2026

## Cause confirmée

Le test `ae7b8699-8e43-40a0-a4ef-c272f59c6ae2` avait sa voix complète. Deux réponses de Claude avaient été acceptées avant exécution, puis rejetées par le compilateur : `find` modifié, puis `find_sub` inconnu. Seul le préambule était assemblé par l'application ; le pied technique restait recopié par le modèle. Une troisième réponse avait aussi inclus les deux plans de signature parmi les phrases. L'appel suivant s'était arrêté avant soumission sur un budget restant de 0,37 $. L'écran ne distinguait pas ces causes.

## Correction intégrée

- Le contrat d'écriture 2 demande la composition et trois configurations (`SUBS`, `VIS`, `MARKS`). L'application fournit le préambule ET les fonctions, sous-titres, contrôles et export HTML du pied technique. L'assembleur utilise un arbre syntaxique Python, sans exécuter les données reçues. Il accepte les anciennes réponses complètes pour récupération locale, en remplaçant leur pied technique. Aucune nouvelle fonction libre ou permission réseau n'est admise.
- La validation du plan devient asynchrone. Compilation réelle dans le bac à sable puis inspection navigateur se font avant acceptation de la réponse. Les défauts de code, de repères temporels et de lisibilité reviennent dans le même tour Claude, avec leurs détails utiles. Le profil système du bac à sable ne pollue plus le diagnostic.
- Après un rejet, Claude peut fournir des changements précis liés au SHA-256 de sa dernière source. Chaque remplacement doit correspondre exactement une fois. Une seule écriture atomique conserve le changement et son résultat ; une reprise réutilise le résultat sans appliquer deux fois la correction.
- Le minimum de sortie devient plus petit pour une correction courte ; les plafonds monétaires et les huit étapes restent inchangés. Pas de budget remis à zéro, pas de suppression des validations humaines. Les entrées de l'auteur sont persistées avant transport. Une ancienne opération payante ne change pas silencieusement de contrat.
- La signature doit rester visible au moins 2,2 secondes avant la fin du film. Les autres seuils de qualité sont conservés.

## Récupération effective du test

La dernière réponse déjà reçue a été récupérée localement, sans autre appel à Claude ou à un fournisseur. Les deux plans de signature restent dans le film mais sortent de la liste des phrases. Les erreurs de repères de mots, d'appel de fonction, de synchronisation, de cadrage et de durée du logo ont été corrigées dans cette composition. Ces corrections propres au film ne deviennent pas des règles éditoriales globales.

Résultat : 40,3 secondes, 11 phrases et 11 cases, 0 violation de tenue, écarts voix/visuels entre -0,1 et +0,07 seconde, aucune violation de zone sûre ou de retrait de mot, logo présent, bruitages 17,4 dB sous la voix et mix -17,1 LUFS. Le rendu encodé a passé la comparaison avec les images contrôlées. La voix, les prix, les réservations client et les reçus fournisseurs sont inchangés. Zéro nouvel appel payant.

La production est revenue à `board`, sans vote ni approbation inventée, avec aperçu complet et extraits de chaque scène. La source précédente et les erreurs sont archivées dans `revision-0-before-local-repair-20261019`. L'événement de réparation locale est ajouté à la session du film, sans réécriture des anciens tours de Claude.

Preuve : `storage/qa/motion-repair-2026-10-19/recovery-proof.json`, contrôles, comparaison du rendu, planche contact et état avant réparation dans le même dossier. Le serveur web reste actif ; le worker est rechargé séparément.

## Vérifications et limites

Les tests couvrent le pied technique remplacé même si un ancien modèle renomme un helper, le rejet des fonctions créatives arbitraires et des configurations exécutables, les changements liés à une empreinte exacte, la reprise atomique et le retour d'erreurs de compilation asynchrones dans le même tour sous son budget initial. Les parcours navigateur utilisent une base jetable et des transports simulés, sans dépenses.

Cette preuve établit la récupération de ce test et le fonctionnement local du nouveau contrat. Elle ne garantit ni la qualité artistique de toute future réponse de Claude, ni l'absence de toute panne fournisseur. La validation visuelle de Shimi reste nécessaire. Le test précédent `a249184c` n'a pas été relancé dans cette réparation.
