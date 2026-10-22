# Intégration motion design CAM, 18 octobre 2026

## Ce qui est intégré

Le client choisit « Motion design » depuis l’accueil, saisit son script et accepte
un prix de 10 $. Le logiciel prépare la voix et son minutage, fait écrire les
scènes, contrôle le résultat et rend le film en code. Aucun moteur de génération
d’images ou de vidéos n’intervient dans cette catégorie.

Le parcours présente une planche de dix scènes pour la référence : extrait animé,
phrase, mouvement, sens, Oui/Non et commentaire. Un retour peut viser une scène
ou l’ensemble. Le prix de 5 $ est présenté avant l’application d’une correction,
avec deux corrections maximum et un total plafonné à 20 $. Les scènes non
sélectionnées restent identiques. Le film entier est ensuite revu pour ses visuels,
puis séparément pour le son, le montage et les sous-titres. Le téléchargement ne
s’ouvre qu’après validation du fichier final exact. L’enregistrement dans
« My videos » reste volontaire.

## Choix techniques

- Catégorie séparée : la production clay et les demandes déjà acceptées conservent
  leurs contrats. Le motion concerne ici le film entier, avec une écriture et
  une comptabilité propres, plutôt qu’un simple effet sur une scène clay.
  Routes `/motion/new`, `/motion/[id]`, table `motion_runs`.
- Planche animée : le mouvement du mot et le raccord doivent pouvoir être vus,
  ce qu’une image fixe ne permet pas. La revue du film entier contrôle ensuite
  l’enchaînement ; les finitions ont leur propre accord.
- Corrections ciblées : les blocs non demandés sont conservés pour éviter qu’un
  retour remette en cause des scènes déjà approuvées.
- Écriture : modèle Claude et effort configurables, avec la méthode complète,
  le code original et les temps réels. La machinerie est protégée ; les scènes
  sont réellement écrites pour le script.
- Exécution : Python et rendu local HyperFrames 0.8.91, dans un dossier privé par
  révision. Seatbelt limite les fichiers et le réseau ; le Python généré ne peut
  pas créer de sous-processus. Le navigateur client reçoit des MP4, jamais le
  Python ou le JavaScript générés.
- Reprise : identifiants de requêtes persistés, verrou de travail, heartbeat et
  absence de relance payante automatique. Une réponse fournisseur incertaine
  demande une réconciliation avant une nouvelle dépense.
- Comptabilité : réservation du prix client puis débit unique à l’achèvement.
  Coûts API d’écriture et reçus de voix sont séparés. Un coût de voix non fourni
  par le fournisseur reste inconnu ; son devis en crédits n’est pas présenté
  comme une facture en dollars. Le prix fixe de 10 $, puis deux corrections
  possibles à 5 $, garde des montants entiers et un plafond explicite de 20 $.

## Référence corrigée avec accord de Shimi

Le code original reproduit exactement le SHA-256 de son HTML :

`661c98e3234a622a1b28d0a8a3e453c6133ba73ac8c17b3861869d0e17bcb592`

Il présentait trois débordements dans deux scènes : scène C, lettre T à x = 111
et lettre E à droite = 949 ; scène G, « MAKE IT MAKE SENSE. » de x = 105 à 1039.
La zone demandée va de x = 120 à 940.

Shimi a autorisé le 18 octobre 2026 la correction de ces seuls cadrages dans une
nouvelle version. L’original est intact. `reference/plot-hole-v4-safe.py` change
uniquement les deux largeurs de composition et devient l’exemple envoyé au
moteur d’écriture. Son HTML est verrouillé par ce SHA-256 :

`4a5a204661f2c11b10162e0aa5ac031d0345be696eca6b0855acaf088843b595`

La répétition vérifie l’identité de ce nouvel HTML et l’absence de débordement.
Elle vérifie aussi que l’original échoue au contrôle attendu. Aucun contrôle
n’a été désactivé pour faire passer une référence.

La vérification des MP4 a révélé une substitution de police au rendu : le
contrôle HTML affichait Archivo, mais la politique de sécurité bloquait les
polices intégrées par HyperFrames. Le défaut est corrigé en autorisant les
polices intégrées uniquement dans la règle des polices. Une comparaison des
images encodées avec la composition inspectée bloque désormais le film si
leur similarité SSIM descend sous 0,96. Les dix scènes sont échantillonnées ;
ce contrôle ne prétend pas inspecter chaque pixel de chaque image du film.

## Périmètre de la preuve

La répétition utilise la voix existante, un faux transport d’écriture et un vrai
rendu local dans une base jetable. Elle ne prouve pas la qualité artistique d’une
réponse future du modèle, ni une nouvelle lecture de voix en conditions payantes.
Les métadonnées publiques de la voix Dylan et du moteur ElevenLabs ont été
vérifiées en lecture seule le 18 octobre 2026 ; aucune génération n’a été soumise.

Les finitions disponibles dans cette version règlent le niveau de musique et
l’activation des sous-titres, avec nouvel aperçu avant accord. La revue de montage
porte sur le film complet ; elle n’est pas un éditeur vidéo libre ni une promesse
d’interprétation automatique de toute demande de montage.

Le worker actuel est macOS. Un déploiement Linux exige un worker conteneurisé
équivalent ; aucun repli sans isolation n’est activé. Aucune mise en production,
aucune migration de vidéo existante, aucune dépense fournisseur n’a été effectuée.

## Mesures et critères d’acceptation

- Référence originale : HTML identique ; les débordements attendus sont détectés.
- Référence corrigée avec accord : HTML identique au nouveau hash ; zéro violation
  de tenue, de zone sûre et de mot retiré ; signature CAM visible.
- Écart voix/image maximal : 0,291 s. Bruitages : 16,2 dB sous la voix.
  Mix mesuré : −17 LUFS.
- Comparaison des dix scènes encodées : minimum SSIM 0,9706, seuil 0,96.
  Le MP4 à police incorrecte est rejeté à 0,911.
- Authentification et propriété, refus du téléchargement prématuré, protection
  des scènes non sélectionnées et rejet d’une approbation obsolète sont exercés.
- Aucun nom de modèle ou de fournisseur dans les pages client testées.
- `pnpm test` : 473 tests réussis, 66 fichiers.
- `pnpm lint` et `pnpm exec tsc --noEmit` : réussis.
- `pnpm test:motion-journey` : réussi jusqu’au téléchargement, après une vraie
  correction de la scène 2 et une modification des finitions. Réservation et débit
  de 15 $ vérifiés dans le portefeuille jetable, aucun paiement réel.
- `pnpm test:client-journey` : réussi, parcours clay et trois exports préservés.
- MP4 final contrôlé : 1080 × 1920, 30 images/s, 46,2 s, piste audio présente.
- Zéro appel externe et zéro génération payante dans les deux répétitions.

Les comptes rendus de parcours sont dans `storage/qa/motion-journey-proof.json`
et `storage/qa/client-journey-proof.json`. Ils distinguent explicitement les
réponses IA simulées et le rendu local réel. Le dossier pointé par la preuve
motion contient le storyboard, l’écran de finition, les mesures et le MP4.
Le film de référence corrigé est également conservé dans
`storage/qa/motion-safe-reference/preview.mp4`.

## Avant de déclarer le produit accepté

La validation artistique de Shimi sur le rendu et un essai de la chaîne fournisseur
réelle restent nécessaires. Ils ne sont pas remplacés par un test automatisé.
Le test payant n’a pas été lancé, conformément au brief. Le déploiement Linux
reste conditionné à la mise en place du worker isolé décrit plus haut.



Les journaux définitifs et copies des preuves sont regroupés dans
`storage/qa/motion-verification/`, avec `summary.json`.
Dossier de la dernière répétition motion :
`storage/qa/motion_qa_96a761e759d1403cacbf8002e11f6152/`.
