# Client delivery checklist

Updated 2026-10-14. The connected local workspace is now available at `http://127.0.0.1:3108/` through `pnpm connected` or `demarrer-cam-connecte.command`. The real administrator account was created by Shimi, who chose the password and signed in. The earlier offline presentation on 3107 remains a separate fallback.

Shimi requested a functioning product and explicitly authorized the first guided paid test on 2026-10-14 after reviewing its costs. Hosting remains deferred until CAM's monthly payment is in place. No trial, credit purchase, hosting order or external message was initiated.

First live test: production `2b0df353-688e-4d7c-b5aa-6a31cd4b2f21`, three scenes, vertical English narration beginning “Before sharing a claim”. Claude planning completed with $0.0077 confirmed. Shimi approved the media estimate of $7.75 plus 0.45 Higgsfield credit. One Bram request completed and its 7.6-second recording is normalized and saved. No second voice request was submitted. fal rejected upload initiation with HTTP 403, explicitly reporting exhausted balance, so synchronization, images and animations have not started. The film is unfinished; voice listening and approval are pending. Resume the existing production after funding fal, refreshing the quote if expired, without regenerating Bram.

The real test exposed an unrecognized Higgsfield audio CDN and an unhelpful upload error. The exact returned CloudFront distribution is now accepted (other distributions remain rejected). Explicit upload-initiation rejections are resumable, with a clear empty-balance message; uncertain responses and interrupted uploads stay blocked. The previous upload checkpoint was reconciled under the job lock using the explicit 403 evidence. Targeted transport/delivery checks: 37 tests, TypeScript and lint pass. These checks themselves are offline.

| Area | Implemented and checked | Remaining validation or scope |
| --- | --- | --- |
| Assistant | OpenRouter key saved privately by Shimi and verified read-only; automatic DeepSeek / Claude routing, selected image and PDF input, proposed narration and revisions, durable requests and shared monthly budget | Actual model response quality and native PDF output on a paid user request |
| Scene planning | Claude directions from the exact narration; editable scenes, movement, characters and titles before approval | Editorial acceptance of generated directions |
| Bram production | Actual provider adapters, current quote, explicit budget approval, one real Bram recording recovered by its existing request ID, voice and per-scene reviews, word timing, montage, resume and quote renewal | Voice approval and real synchronization/images/animation/render once fal balance is available |
| Recovery and budget | Requests persisted before submission, accepted IDs reused after lost polls, unknown submissions blocked, stale quotes/reviews rejected, refreshed remaining budget preserves previous work | A provider submission with no returned ID requires investigation; no automatic retry. Expired hosted references and failed provider jobs may need a new version |
| Costs | OpenRouter actual receipts; shared monthly AI limit; separate fal USD and Higgsfield-credit reservations; media workspace ceiling $100 plus 100 Higgsfield credits, with a separate approval per film | Current fal key returns 403 for billing receipts. Higgsfield transaction data cannot reliably attribute one job. Media reservations stay estimates; no invented settled costs or customer debit |
| Accounts | Actual first administrator, credentials and cookies, client/admin roles, invitation links, disabled-session revocation and protected files; HTTP checks on compiled connected app | Invitations are copied as private links; no email service or remote hosting |
| Exports and library | Connected production history, exact audio reuse, local rendering into three 1080p formats, download integrity and recovery | Client review of each final layout |
| Campaigns | Three editable outlines, references, brief conversations and linked video versions | Outlines are rule-based; editorial development uses the assistant in the conversation |
| Other styles / Base44 | Existing historical reference material | Additional recipe integration and authenticated inbound Base44 connector |
| Commercial operations | No paid hosting, subscription or trial started | Stripe/monthly statements, client billing terms and hosting deployment remain separate unfinished delivery scope |

Earlier verification: 141 unit tests; assistant integration with network forbidden; full connected controller with injected provider responses and a local Daniel test voice, including expired quote renewal, edited scene invalidation, lost polling response, completed montage and three download formats. Zero inference/media credit spent in those checks. TypeScript, lint and build passed; compiled connected HTTP account tests passed. A disposable browser fixture successfully retrieved the actual provider quote (read-only) and saved a scene edit that invalidated it; it was removed unapproved. The later live Bram test is recorded above; no completed client film is claimed.

Proof files under `storage/qa`: `cam-assistant-proof.json`, `cam-connected-controller-proof.json`, `cam-access-connected-proof.json`. The older offline proof files remain dated historical checks. Nonfatal Turbopack warnings concern dynamic runtime-storage tracing.

## Account implementation

The deployment contains one dedicated CAM workspace; invited CAM users share its productions. Administrators alone manage users, balances and internal settings. This is not a multi-tenant SaaS.

Auth.js 5.0.0-beta.32 is pinned by the lockfile. Credentials are verified with salted scrypt. JWT sessions last eight hours and check the database session version and disabled flag on each request. Password resets revoke previous sessions without changing the user's role. Invitation secrets are hashed, expire after 48 hours and can be consumed once. Issuing a new invitation invalidates older outstanding links. No public sign-up exists. Roles cannot be supplied by the signing-in client. The last active administrator cannot be disabled through the UI.

Every data route enforces authentication independently of the page proxy. Cookie-authenticated writes require the workspace origin. The local shortcut is restricted to loopback hosts, offline providers and non-production builds. `CAM_AUTH_MODE=required` tests the real account boundary without enabling generation. Media downloads are protected too.

`pnpm db:migrate` applies additive, checksummed SQL migrations transactionally. `pnpm test:access` creates temporary test accounts, starts a separate loopback server with required authentication, checks the real HTTP sign-in/cookies, permissions, session revocation, invitations and cross-origin rejection, then removes those fixtures. No email or provider request is sent. Proof: `storage/qa/cam-access-proof.json`.

Implementation references: [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials), [role-based access](https://authjs.dev/guides/role-based-access-control). Installation alone does not validate a production deployment.

## Local workspace verification

`pnpm test:workspace` checks the saved conversation/campaign flow against PostgreSQL with all fetch calls forbidden. Identical concurrent messages and draft requests produce one result; changed retries are rejected; new versions cannot mutate their source. Image decoding, content-hash verification, PDF download-only headers and link validation are checked. Reference files are local context for a human, not automatically extracted or treated as verified sources. No uploaded document is sent to a provider. Proof: `storage/qa/cam-workspace-proof.json`.

Final local checks on 2026-10-13: 108 unit tests, workspace integration, real HTTP account integration, TypeScript, lint and production build passed. Browser walkthrough: campaign → brief → conversation → note/reference → Studio draft → reload, with no paid action. Demo campaign `d662470b-a942-412d-9c68-5f625995d11d`, conversation `a690d876-fd66-4e0f-bf81-0b3a077a4f07`, draft `3a2c03a8-7701-434e-b887-d6854c4c5844`. Screenshots: `storage/qa/cam-campaigns-2026-10-13.png` and `cam-conversation-2026-10-13.png`. Nonfatal Turbopack storage-tracing warnings remain; no client deployment or final Bram recording is claimed.

## First-version verification on October 14

119 unit tests, TypeScript, lint, workspace integration and the final production build pass. The usual nonfatal runtime-media tracing warnings remain.

- `pnpm test:installation`: an empty PostgreSQL database gets every application table. A repeated migration/seed preserves a saved conversation. An invalid migration rolls back completely, changed applied migrations are refused, and no initial credit is invented. Production rejects demo credits. Proof: `storage/qa/cam-installation-proof.json`.
- `pnpm test:exports`: actual 1080×1920, 1080×1080 and 1920×1080 videos; unchanged source MP4 and WAV; captions preserved; duplicate starts blocked; interrupted work reused; modified inputs and corrupt downloads detected/rebuilt. Historical-layout fitting also passes. No API call/ledger movement. Proof: `storage/qa/cam-format-exports-proof.json`.
- `pnpm test:access:production`: real `next start` server, credentials/cookies, admin/client separation, protected media/exports, invitation and session-revocation checks. Proof: `storage/qa/cam-access-production-proof.json`.
- Browser: saved imported-recording production `ce602807-a807-4cf9-954d-e77f3fd64d7c` → prepare three downloads → download square MP4 → reload. Download measured as H.264/AAC, 1080×1080, 5.267 s. Screenshot: `storage/qa/cam-three-formats-2026-10-14.png`.
- Historical CAM demo `d12073dd-3f4b-4d0f-883e-57c609210e19` also has three completed downloads, preserving the Dylan recording. Screenshot: `storage/qa/cam-demo-downloads-2026-10-14.png`.
- Local installation preflight passes; a real first administrator is still required. Source/media packages exclude credentials, the development database, uploads and QA logs. Only the 15 pinned historical source files accompany the code. They retain the Dylan identity.

See `docs/deployment.md` for installation, backup/restore and the remaining server acceptance steps. Docker is absent from the development Mac; packaging is not evidence of a working remote deployment.
