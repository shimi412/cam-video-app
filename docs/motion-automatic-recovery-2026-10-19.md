# Motion : récupération automatique, 19 octobre 2026

## Demande et comportement

Shimi demande que le logiciel diagnostique ses erreurs, affiche une progression et essaie de les résoudre sans lui demander de relancer chaque étape. Le parcours Motion dispose maintenant d'un worker indépendant du navigateur. Les tâches explicitement acceptées sont persistées avant réponse à l'interface. Un redémarrage reprend le même travail sous verrou PostgreSQL ; les anciennes productions bloquées ne sont pas adoptées automatiquement.

Une erreur d'exécution est enregistrée puis présentée à Claude avec l'état de l'étape. Claude peut choisir la reprise des résultats sauvegardés, la correction du code de composition, ou un arrêt explicite si aucune opération disponible ne résout le problème. Le code corrigé repasse les contrôles identiques. Les validations humaines et le périmètre des retours restent obligatoires.

L'interface affiche « Please wait » pendant cette récupération. Une préparation bloquée reste à l'étape storyboard ; elle n'allume plus Download. Le bouton de reprise disparaît quand une soumission indéterminée nécessite une réconciliation.

## Limites de dépense et d'exécution

Trois diagnostics au maximum par travail accepté, chacun plafonné à 0,25 $, et deux corrections de code au maximum, chacune plafonnée à 0,75 $. Les compteurs et les versions sont persistés. Ces opérations de raisonnement sont couvertes par le prix Motion accepté ; elles ne créent pas une nouvelle facturation client. Le plafond de l'écriture initiale reste distinct (2 $ par défaut, 3 $ maximum configuré).

Aucune nouvelle image, vidéo ou voix n'est soumise par le diagnostic. Les résultats déjà reçus sont réutilisés ; une issue de soumission inconnue ne permet jamais une deuxième soumission. Un échec durable ou un budget épuisé arrête les essais et présente un état honnête, plutôt qu'une attente infinie. Cette intégration ne prétend pas réparer arbitrairement l'infrastructure ou toutes les pannes de fournisseurs.

## Cas réel Test MD 01

La voix sauvegardée a un niveau de -46,98 dB dans ses dernières 20 ms. Le contrôle précédent exigeait moins de -50 dB et bloquait la chaîne, bien que la transcription locale corresponde à tous les mots du script. La préparation Motion conserve désormais les échantillons et les mots, ajoute 0,2 seconde de silence à la piste dérivée et porte une note d'écoute vers les finitions. Elle ne prétend pas reconstruire un phonème manquant. Une transcription incomplète ou des horodatages hors enregistrement restent refusés.

Le fichier brut reste intact. Le cache de transcription est lié à l'empreinte du fichier, au script et au modèle local. Une reprise possédant déjà son fichier audio complet n'ouvre pas de connexion fournisseur.

## Vérification

- Copie du fichier réel traitée avec le réseau désactivé : `storage/qa/motion-recovery-2026-10-19/saved-audio-proof.json`.
- Arrêt brutal d'un processus worker et reprise en base isolée : `worker-restart-proof.json` dans le même dossier. L'appel d'écriture n'est pas répété et le storyboard attend son approbation.
- Tests de service : diagnostic sauvegardé avant appel, reprise après sérialisation, préservation de la voix et du code précédent, correction ciblée, budget/issue inconnue protégés, borne persistante et étapes d'interface.
- La recette navigateur Motion utilise désormais le worker indépendant et quitte la page pendant le premier rendu.

La validation du film réel reste humaine. Les résultats finaux du test en cours sont consignés après l'exécution, sans confondre une reprise réussie avec une livraison approuvée.

## Routage Claude et boucle de raisonnement

Le test réel a aussi rencontré un rejet HTTP 404. Le transport imposait `parallel_tool_calls=false` tout en exigeant la prise en charge de tous les paramètres, alors qu'aucun endpoint du modèle configuré ne publiait ce paramètre. Il est retiré. Le moteur garde un seul appel d'outil exécuté par tour, les mêmes plafonds de prix, le refus de collecte des données et l'absence de fallback implicite. Les erreurs conservent désormais un diagnostic borné. Un rejet définitif de routage se distingue d'une réponse inconnue : une version corrigée du transport peut le reprendre sous verrou, avec historique et réservation initiale. Une issue réseau inconnue reste non rejouable.

Le premier tour réel qui a atteint Claude a consommé six lectures de contexte sans soumettre de film (0,548996 $). La boucle est corrigée : les nouveaux tours disposent de huit étapes maximum, toujours sous leur plafond monétaire initial ; après deux lectures, l'appel impose `submit_plan`, laissant les étapes suivantes à la correction des validations. Ce n'est pas une dépense client supplémentaire.

Les identités des nouvelles demandes utilisent un encodage canonique qui résiste au réordonnancement JSONB. Les tours historiques gardent leur ancien protocole jusqu'à réconciliation. Le minutage Motion est normalisé par son schéma avant identification du tour. Pour ce test, la conversation déjà payée a été conservée après comparaison sémantique des entrées ; ses six lectures et leur coût n'ont pas été effacés.

Preuves : 623 tests sur 84 fichiers, vérification TypeScript et lint réussis ; parcours Motion complet avec fermeture de page réussi ; parcours Clay complet réussi sans appel externe. Les preuves de transport couvrent rejet connu, issue inconnue, réservation plafonnée et identité stable après réordonnancement.

Les réponses longues de code disposent de quinze minutes de transport, indépendamment de la page ouverte. Le plafond de jetons et le budget restent inchangés. Une expiration avec issue inconnue reste protégée contre la double soumission.

Le code fixe du gabarit est assemblé localement depuis la référence approuvée, avec une durée couvrant la voix et la signature finale. Il n'est plus demandé au modèle de recopier à l'identique commentaires et espaces dans cette partie. Le corps des scènes reste sa composition. Le validateur de périmètre et l'observateur Python restent actifs. Une réponse sauvegardée rejetée est réévaluée après correction locale ; son coût et son contenu sont conservés. Les erreurs de scènes indiquent les phrases et identifiants concernés au prochain diagnostic.

Le test réel a révélé un second gaspillage : l'écriture lisait un historique contenant d'anciens scripts complets, et la méthode était répétée dans le même contexte. Le transport transmet des extraits signalés de l'historique et déduplique la méthode identique. Le code complet et les réponses originales restent en base. Pour une réparation Motion, seule la partie variable du code est répétée ; la machinerie fixe est déjà fournie par la référence. L'écriture Motion exige le plan dès le premier appel, sans lecture de contexte superflue ; les autres agents gardent jusqu'à deux lectures. Les plafonds monétaires ne sont pas augmentés.
