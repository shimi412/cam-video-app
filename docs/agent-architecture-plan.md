# CAM persistent agent implementation, 2026-10-19

Requested: one durable conversation per video, approved shared CAM memory, project skills, tool feedback, preserved human/budget gates. No paid verification or live production edits.

## Implementation

1. Persist agent sessions/turns/tool messages and shared-memory proposals in PostgreSQL. Serialize per video; retain uncertain requests without resubmission.
2. Introduce a bounded Claude tool loop using the existing OpenRouter connection and request ledger. Tools read only explicitly packaged CAM skills, approved memory and this video's context, propose memory, and submit validated plans. Existing execution controllers remain the authorized media tools; their results enter the same session.
3. Connect initial direction, storyboard/film/finishing feedback and motion writing. Reuse legacy paid receipts before changing request contracts. No private workspace filesystem access.
4. Add administrator review of shared-memory proposals; approval binds exact content/version. Pending or rejected proposals never become guidance. Per-video notes never become shared rules automatically.
5. Test multi-turn sessions, tool results, skill access, cross-video isolation, memory approval, restart/idempotency, budget limits and existing browser journeys with model/provider responses injected. Document the actual boundaries.

## Acceptance

- A later turn reads the same video's earlier decisions and execution observations.
- A second video sees approved shared guidance, never another video's comments.
- Claude can select a packaged skill and inspect tool results before producing a plan.
- Validation errors are returned as tool results within the authorized bounded reasoning turn; failed/uncertain external requests are never blindly retried.
- Lock feedback still only saves; Apply all starts reasoning. Price and human review gates remain binding.
- No production data migration rewrites media, quotes, approvals or provider request identities.

## Design choice

Use the existing Claude/OpenRouter API connection with native tool calls, not the local user's Claude subscription or unrestricted shell. An Agent SDK backend can later implement the same interface; it is not required to introduce persistent sessions and tool loops. Keep the current per-analysis ceiling across the complete tool loop, not once per iteration. The shared knowledge package is explicitly allowlisted and deployable; private ALEF memory is excluded.

## Verified implementation, 2026-10-19

- 606 tests in 82 files pass; lint and TypeScript pass.
- The PostgreSQL/admin-API rehearsal proves two isolated sessions, a single inference under concurrent submissions, exact-version administrator approval, exclusion of pending/retired memory and replay after reopening persisted state. Evidence: `storage/qa/agent-memory-proof.json`.
- Clay and Motion browser journeys pass with zero external and paid calls. Clay additionally closes the browser and restarts the web server while authorized work survives. Motion has not received that restart guarantee.
- Attack’s real UI/controller/database/render journey completes the whole-film and finishing gates, downloads the approved bytes and explicitly saves to My videos. It closes the browser during rendering and applies two locked panel notes as one batch. See `comics/ACCEPTANCE-fr.md` for evidence and limits.
- Additive migrations 015 and 016 installed locally. All 80 pre-existing job rows retained the same SHA-256 snapshot before and after migration; no queued production was eligible to run. Connected web and worker started through the existing supervisor. No distant server was deployed.
- No live Claude inference or image/video/audio generation was used in acceptance. The agent-loop tests inject native tool responses at the transport boundary. A successful local test does not prove future provider output quality.
