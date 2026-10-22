# Intégration Attack et agent persistant, 19 octobre 2026

## Ce qui est intégré

Troisième catégorie **Attack video**, accessible depuis l'accueil, avec son espace `/comics/new` puis `/comics/[id]`. La catégorie utilise les services d'authentification, de crédits et de traitement en arrière-plan du logiciel. Ses productions et leurs fichiers restent séparés des catégories Clay et Motion.

Le parcours contient : préparation tarifée avant Start, planche d'images, retours globaux et par case verrouillés, traitement groupé, approbation exacte du storyboard, devis vidéo, tous les plans assemblés, validation visuelle du film entier, finitions séparées, approbation finale et téléchargement. My videos reçoit uniquement les films explicitement sauvegardés.

Claude produit un plan typé à partir de la méthode comics. Le validateur conserve chaque mot de la narration, son ordre et les cases hors du périmètre demandé. Le héros est limité à un tiers des cases et à une seule apparition en entier. Les titres proviennent de la narration ; le feedback est une instruction. Les prompts reprennent les références et formules verrouillées. La voix par défaut est Harrison. Aucun nom de fournisseur ou de modèle n'est présenté dans les écrans client.

Le rendu reprend la planche géante, la caméra, les cartouches, les polices et la signature de la référence. Il est piloté par le minutage réel de la voix. Les originaux de référence et les productions de Shimi restent intacts.

## Architecture Claude

Une session persistante par vidéo en PostgreSQL, avec requêtes, réponses d'outils, plans validés et résultats d'exécution. Claude dispose de ressources CAM explicitement autorisées et peut consulter l'historique de cette vidéo. La mémoire partagée contient uniquement les propositions approuvées par un administrateur. La page `/admin/memory` permet d'approuver, rejeter ou retirer une règle, avec contrôle de version et provenance.

La connexion utilise les appels d'outils natifs de Claude via le fournisseur API déjà utilisé par l'application. Il s'agit d'un agent avec contexte persistant et exécution contrôlée, pas d'une identité garantie avec l'application claude.ai. Il ne dispose pas d'un shell libre ni des fichiers privés du second cerveau. Les décisions validées sont exécutées par les contrôleurs du logiciel, qui conservent les autorisations et les reçus.

## Choix et corrections vérifiées

- Les champs JSON sont hachés dans un ordre canonique : un aller-retour en base ne doit jamais invalider un devis inchangé.
- Lock feedback enregistre seulement. Apply all feedback analyse le lot, conserve les cases intactes, puis demande le prix de la seule dépense supplémentaire. Les retours de finition restent disponibles à l'étape suivante.
- Chaque soumission payante a une identité sauvegardée avant l'appel. Une issue inconnue bloque une nouvelle soumission. Les résultats terminés sont vérifiés par leur empreinte. Un échec confirmé conserve les autres plans et propose un remplacement explicitement tarifé.
- Le contrôle visuel inspecte réellement les images et des échantillons des clips. Un emblème incorrect, du texte généré ou une action imprévue bloque la présentation et signale la case. L'inspection échantillonnée ne garantit pas chaque image d'une génération future.
- Deux éclairs de moins de 0,8 seconde sont présents dans le premier clip source de la référence. Le détecteur intégré couvre les 24 images de cette fenêtre, contrairement aux 8 images de l'ancien outil. Le rendu de recette utilise pour ce plan l'image approuvée avec le mouvement de caméra BD ; cette adaptation locale est affichée au client. Le clip payé reste conservé. Aucun seuil n'a été abaissé pour passer le contrôle.
- La comparaison des images encodées garde une similarité minimale de 0,96, avec une tolérance temporelle maximale d'une image à 30 i/s pour le décodage vidéo. Les captures attendent la composition du navigateur après le seek. Les contrôles Motion restent inchangés.
- Les finitions actuellement exécutables sont le niveau de musique et l'affichage des sous-titres. Les autres demandes restent explicites et non appliquées, avec leur raison ; elles ne sont pas transformées en texte visible ou déclarées réalisées.

## Prix et limites

Devis client en dollars entiers avec la politique tarifaire configurée. Le devis conserve le coût fournisseur prévu pour chaque opération et une provision plafonnée pour les inspections à venir. Les coûts Claude reçus sont inscrits dans `api_calls`. Les crédits fournisseurs obtenus par lecture de prix sont des estimations de facturation, pas des reçus comptables réconciliés. Aucun coût réel d'une génération non effectuée n'est inventé.

L'écoute comparée de nouvelles voix demande une offre et un accord distincts ; aucun échantillon payant n'est généré spontanément. L'outil historique de retouche d'emblème est conservé ; la détection et le blocage d'un défaut sont intégrés, pas un placement automatique fiable de cet emblème sur toutes les poses.

Le moteur de rendu isolé est vérifié sur le Mac. Un déploiement Linux nécessite son worker de rendu isolé ; le code refuse une exécution non isolée. Aucun serveur CAM distant n'a été déployé pendant ce chantier.

## Preuves

Les preuves finales et chemins de recette sont ajoutés après l'exécution complète des suites. Les tests injectent les réponses de modèles et les médias de référence aux frontières payantes, tout en exécutant les vrais contrôleurs, la base, l'interface et le rendu. La qualité artistique de nouvelles générations et l'acceptation visuelle de Shimi restent à valider humainement.
