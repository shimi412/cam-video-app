# Production reliability, integrated 2026-10-18

Shimi stopped his test and authorized integration, without paid generation. The earlier isolated candidate is now applied. Test 05 stays paused; startup never adopts legacy jobs.

## What changed

- Shared failure classification in the UI and controller. Only known recoverable reads offer Resume; expired quotes require pricing, definitive scene failures need separately approved replacements, ambiguous submissions need reconciliation.
- Accepted-result polling retries on the original ID with bounded persisted backoff. Generation submission is never blindly repeated. Completed assets and reservations survive restarts.
- Independent approved drafts continue after a definitively failed draft. A partial film cannot be assembled or approved. Failed scenes need an explicit priced replacement.
- Explicit work intent is atomically saved in the production checkpoint under the PostgreSQL job lock before HTTP acknowledgement. Browser GET polling only displays progress. Next after callbacks no longer run connected media production.
- An independent worker scans durable intents and rechecks all human gates under the lock. It retains pending storyboard panels while polling their authorized replacements, but stops at the completed storyboard, budget, visual-film and finishing reviews.
- The connected launcher and production start script supervise web and worker independently. A dead child restarts; restarting the application reloads work from disk and PostgreSQL. Existing paused jobs with no intent stay paused.
- Connected format-export requests are durable in PostgreSQL. Interrupted local renders resume under the job lock and reuse verified completed exports. Failed renders remain visible for explicit recovery instead of spinning indefinitely.

## Evidence

- 536 unit tests / 74 files pass, including worker gates, preserved retry bounds, supervisor child restarts, uncertain submissions and export recovery policy.
- TypeScript and targeted ESLint checks pass.
- `storage/qa/worker-restart-proof.json`: actual SIGKILL after provider acceptance, competing processes serialized by PostgreSQL, original request ID reused after restart, exactly one injected submit. SIGKILL during an unconfirmed submit stays blocked. No paid calls.
- `storage/qa/client-journey-proof.json`: real UI/controller, isolated database/wallet, injected director/media, external fetch denied. Close the entire browser and stop the web server during authorized generation; the independent loop reaches complete-film review and stops there. Reopen/restart and continue through finishing, explicit final approval, save and three formats.
- `scripts/check-full-film-preview.ts`: failed middle scene, independent later scene succeeds, existing receipts unchanged, no partial-film review, explicit replacement then complete assembled preview.
- Actual connected runtime on 3108: SIGKILL of the web listener caused its supervised restart while the worker PID stayed unchanged; SIGKILL of the worker caused a separate restart. Login returned HTTP 200 afterward. All 17 saved Test 05 files retained their SHA-256 hashes. Evidence: `storage/qa/reliability-2026-10-18/activation-proof.json`.

## Operating boundaries

Use `pnpm connected` locally or the supervised production start script. Both PostgreSQL and storage must persist. A machine that is off performs no work; its app services must return to resume. The supervisor handles child failure, not loss of the physical machine or its disks. No cron, cloud deployment or paid infrastructure was created.

This implementation covers the connected Clay production from its saved authorized work intent through finishing and exports. The initial synchronous paid planning step is not automatically replayed. The separate motion execution path requires its own durable-worker integration and restart proof. Offline orchestration proofs are not proof of supplier uptime, artistic quality, or a successful real client film. Unknown provider acceptance is deliberately reconciled rather than resubmitted.
