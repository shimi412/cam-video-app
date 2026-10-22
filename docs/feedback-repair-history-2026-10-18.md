# Historical diagnostic, superseded by the Claude director integration

### Diagnostic and first local repair (before the follow-up above)

Shimi stopped test f343774f-13b8-42ae-8cf2-eb80f9608975 and authorized repairs without paid generation. Two saved notes revealed distinct faults: removing floating badges regenerated the background while preserving local layers; a request for text animation was copied into an image prompt as visible wording.

- New initial plans have no automatic badge layers, both in director normalization and deterministic suggestions. Runtime editorial memory r6 states the same rule. Religious symbols requested for an earlier film are not a global design rule.
- Exact saved notes, including the typos « Enlève les pastilles flotantes » and « Je vreux juste une animation de texte ici, pas besoin du personnage », now resolve locally. Removal clears only graphic layers; text-only uses the narration, hides old image/video pixels and animates locally. Existing files and unrelated scenes are preserved. Unrecognized text-animation requests remain unresolved instead of being sold as image redraws.
- New image revision instructionContract=3 distinguishes editing instructions from visible lettering. Historical paid payloads remain unchanged. This prompt boundary is not a guarantee of future generated pixel quality; human storyboard review remains required.
- Image preparation retains its original direction evidence across local composition changes. The revised storyboard binds the new composition; resume must not submit a duplicate image because a local text/graphic edit changed a hash.
- Evidence: 544 tests across 74 files pass, TypeScript and changed-file ESLint pass. scripts/check-saved-feedback.ts replays the actual two notes in an isolated database, with 39 source JSON files unchanged and zero external/pricing calls. CAM_TEST_TEXT_ONLY=1 scripts/check-whimsical-production.ts renders a complete simulated film, reuses images on resume, makes zero video-model requests for the text-only scene and preserves the other scene during an explicit simulated revision. All provider calls in this repair's rehearsals are blocked or simulated.
- At the time of the diagnostic, Clay feedback processing was bounded TypeScript rules, not Claude; the follow-up integration above replaces this on the connected path. Claude Sonnet 5 is the configured default initial director; Nano Banana Pro edits images; ElevenLabs/Bram supplies Clay narration; Whisper aligns; code chooses Kling/Seedance/local animation. Motion-in-code is a separate path where Claude does revise the code. No automatic vision model checks whether arbitrary feedback was obeyed in generated pixels.
- Internal explanatory board: https://whimsical.com/4P7us9wnGGWh3wo2kjRNV6 . It documents the actual implementation and its limits, not an intended architecture disguised as an existing one.



### Earlier reliability integration

Initially prepared in an isolated copy while Shimi tested, then integrated after his explicit request to stop testing and install it. Test 05 and its approved requests stay unchanged; only a future explicit client action may resume it.

- Central recovery classification is shared by display and controller: recoverable connection failures, expired budget, confirmed failed scene, uncertain submission and unknown error have different actions. Unknown errors no longer offer an ineffective blind Resume.
- Accepted-result polling persists backoff and at most three exhausted read attempts across worker restarts. Every attempt uses the original request ID. Ambiguous submissions, malformed result bodies and definitive failures are never silently resubmitted.
- Confirmed failed draft/native-preview operations are isolated while other approved drafts finish. All completed receipts and media remain unchanged. A partial film cannot reach human approval. Replacement still requires a separately approved price and retains original cost history.
- Candidate checks: 526 tests / 70 files, TypeScript and changed-file ESLint passed; failed-middle-scene recovery and the complete real UI/controller journey through three downloads passed with injected providers and zero external/paid calls.
- Verification and deployment limits are recorded in `docs/reliability-plan.md`. An independent supervised worker is now integrated for connected Clay media and format exports. Explicit durable work intent is required; historical paused jobs are never auto-adopted. Browser closure and process restart proofs use injected providers. They do not establish supplier uptime or human visual acceptance; the separate motion execution path is outside this restart guarantee.



## 2026-10-18 — Devis de remplacement Whimsical, Test 05

- Après reprise par Shimi, les brouillons 1 et 2 ont un reçu fournisseur `failed`, et le devis a expiré. Le bouton proposait une récupération que `quoteDraftFallback` limitait à `draft-first` : le parcours réellement sauvegardé est `whimsical`. Les précédents tests de reprise et de panne ne couvraient pas cette combinaison. Ne pas assimiler une preuve de redémarrage à une preuve de tous les chemins de remplacement.
- Le remplacement Whimsical conserve les tentatives échouées et propose un seul clip natif par plan, réutilisé après validation du film entier. Les deux échecs techniques admissibles sont inclus dans une même offre à valider. Les prix non encore engagés sont actualisés ; les requêtes déjà tentées gardent leurs montants. Aucun remboursement fournisseur n’est inventé.
- Actualiser l’offre avant son approbation conserve ses nouveaux modèles et l’historique des brouillons retirés. Une requête finale déjà tentée, un refus de modération ou une soumission incertaine ne peut pas passer dans ce remplacement. La durée approuvée ne change pas.
- Répétition sur une copie de Test 05 dans une base isolée : devis des deux plans, actualisation avant approbation, acceptation exacte, anciens échecs marqués remplacés, 64 fichiers source inchangés. Aucun worker lancé, aucun appel externe. Preuve : `storage/qa/saved-replacement-proof.json`. Vérification : 538 tests sur 74 fichiers, TypeScript réussi.

- Tarifs réels consultés en lecture seule : une nouvelle offre globale de 33 $ est préparée sur Test 05, incluant les plans 1 et 2. Ce total inclut les coûts historiques conservés, ce n’est pas un supplément de 33 $. Seule l’offre en attente change ; ancien devis approuvé, approbation, reçus et fichiers terminés inchangés. Aucun budget accepté par l’agent ni aucune génération payante. Preuve : `storage/qa/cam-draft-fallback-proof.json`.
- Montage de régression Whimsical réussi : échec volontaire du plan central, poursuite des autres, remplacement ciblé, film entier rendu et clips natifs réutilisés après validation sans seconde génération. Réseau interdit et médias simulés. Preuve : `storage/qa/whimsical-replacement-film-proof.json`. TypeScript, 538 tests et lint ciblé réussis. Serveur local redémarré ; l’offre en attente empêche toute reprise avant validation du client.



## Feedback interaction repair, 2026-10-15

Apply change now posts the current trimmed comment in one locked server action. The separate Save comment button is removed. A scene greys and shows an animated spinner plus real elapsed time while processing or awaiting its image update; interruption stops the spinner and keeps its prior image and feedback. Polling cannot overwrite the newer result. A stable job component key preserves other scene drafts when the storyboard target changes.

The whole-video feedback panel persists a separate global comment and affected scene numbers. Supported local graphics/title changes apply across the storyboard; scene-specific edits retain priority and conflicts stay unresolved. Whole-board image revisions quote the actual planned images, bind the exact global comment, preserve unrelated individual comments and require explicit price approval. Scene and global prices are shown next to their feedback. Editing a displayed comment prevents approval of its obsolete offer.

Non-text graphics now share a procedural clay renderer between storyboard and montage: raised rounded symbols, textured warm medallions and soft shadows. Its version is included in illustrated storyboard review hashes. Existing pending review targets are recomputed on read without writes and accepted once under lock; old visual approval cannot authorize the changed rendering. Symbols baked into original generated pixels are not removed by this change.

Verification: 374 tests in 53 files passed, including 21 actual React interaction/page tests. The injected-provider connected-controller check completed feedback, image replacement, animation, montage and exports with zero network calls, zero paid calls and zero credits spent. Browser verification on preserved test 477ccc3f-bb61-4c9b-9164-f945972660bd confirmed that Apply handles the existing scene-6 comment and that the global clay instruction is applied to nine scenes containing graphics. No image revision or quote was queued; original images and all scene comments were retained.

The missing two-soldiers workflow identified during this repair is addressed by the scene-cast preparation below. The previous needs-character-sheet state is recoverable by applying the same saved comment again.


