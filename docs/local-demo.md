# Démonstration CAM sur le Mac

Décision du 14 octobre 2026 : présenter la première version en local. Attendre la mise en place du paiement mensuel de CAM avant de commander l'hébergement. Aucun serveur Hetzner acheté ; seul le projet vide CAM existe.

## Ouvrir et arrêter

Double-cliquer sur `demarrer-cam.command` dans le dépôt, ou dans le dossier `cam-demo` du Bureau. Garder la fenêtre Terminal ouverte. Le navigateur ouvre `http://127.0.0.1:3107/productions`.

Pour arrêter, revenir dans cette fenêtre et faire Ctrl+C. Pour reprendre après un redémarrage du Mac, double-cliquer à nouveau. Les dossiers de la démonstration sont conservés. Un deuxième lancement ouvre la démonstration existante. Il ne lance pas deux serveurs et ne ferme aucun autre logiciel.

Le lanceur emploie une base locale séparée `cam_local_demo` et reprend seulement le film historique terminé. Aucun compte réel, crédit, dossier de travail ni essai technique n'est copié. Les vidéos restent dans le dossier CAM existant : ne pas déplacer ou effacer `storage/` avant la présentation. `pnpm demo:prepare` contrôle à nouveau les fichiers sans ouvrir le logiciel.

## Parcours de cinq minutes

1. **Productions** : ouvrir le film exemple, lancer la lecture, puis montrer les téléchargements vertical, carré et horizontal déjà prêts. Ce film utilise les médias existants et la voix Dylan.
2. **Conversations** : créer un dossier, ajouter le texte fourni par CAM et une référence. Montrer que les notes restent sauvegardées après rechargement.
3. **Studio** : préparer ce texte, montrer les scènes, le choix des personnages, les imports et les validations. Bram est la voix prévue pour les nouvelles productions ; aucune nouvelle lecture Bram n'est fournie.
4. **Campaigns** : montrer la préparation de trois briefs modifiables et l'ouverture de leur dossier. Ce sont des trames locales à retravailler.
5. Revenir au film terminé pour conclure avec le résultat concret. Les rendus peuvent être montrés sans attendre un nouveau calcul pendant la réunion.

Phrase de présentation : « Voici la première version : nous pouvons préparer les dossiers, revoir les scènes et la voix, et récupérer les vidéos dans les trois formats. Aujourd'hui, je vous la montre sur mon ordinateur avec un film existant. L'hébergement et les nouvelles générations seront activés après la mise en place de l'abonnement. »

## Limites à annoncer simplement

Cette présentation fonctionne sur le Mac uniquement. Elle n'est pas un accès client en ligne. La conversation IA libre, l'analyse automatique des PDF et les nouvelles générations sont désactivées. Une voix de test du Mac ou un enregistrement importé peut être utilisé pour un nouvel aperçu. Le film exemple ne doit pas être présenté comme une génération réalisée pendant la réunion, ni comme un enregistrement Bram.

Le lanceur force les modes de simulation et vide les clés fournisseurs dans le processus lancé, même si des clés sont présentes dans le dossier de développement. Il n'achète ni hébergement ni crédits et n'envoie aucune invitation. Les extraits publics du catalogue vocal nécessitent Internet quand on les écoute ; leur lecture n'est pas nécessaire au parcours ci-dessus.

En cas d'imprévu avec le navigateur, les trois MP4 déjà préparés restent disponibles dans `storage/exports/d12073dd-3f4b-4d0f-883e-57c609210e19/`. Le film vertical et les deux autres formats sont aussi accessibles depuis le guide de présentation livré sur le Bureau.
