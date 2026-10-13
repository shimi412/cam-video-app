# Client delivery checklist

Updated 2026-10-13. Development proceeds autonomously. No provider credits, paid trials, external messages or deployment are part of the current checks.

| Area | Verified locally | Still required for client delivery |
| --- | --- | --- |
| CAM Clay production | Imported scenes/audio, review, exact audio reuse, captions, rendering and recovery; simulated generation chain | New Bram reading and approved final visuals; actual provider outputs, quotes, cost evidence and reconciliation |
| Accounts | Auth.js credentials; invited clients/admins; session revocation; persistent attempt limits; authenticated media/routes | First real administrator and users; invitation email delivery and production configuration |
| Production library | Search, statuses, draft/result links and downloads | Client acceptance and complete multi-format export |
| Conversation | Script framing stored as conversation/messages | Conversational workflow, attachments and derived jobs |
| Campaigns | Not yet integrated | Saved briefs and links to production |
| Account and budget | Metering, ledger, provider-budget reservations, simulation isolation | Monthly statements/caps and payment workflow |
| Stripe | Not activated | Test-mode implementation and credentials, then separately authorized live configuration |
| Other CAM styles | Historical reference films exist | Recipe integration and final editorial acceptance |
| Base44 | No inbound connector active | Authenticated inbound brief endpoint and source application audit |
| Hosting | Local only | Deployment package, backups, dedicated CAM environment and final server render check |
| Training | In-app local workflow help | Guide covering the finished client screens and training session |

## Account implementation

The deployment contains one dedicated CAM workspace; invited CAM users share its productions. Administrators alone manage users, balances and internal settings. This is not a multi-tenant SaaS.

Auth.js 5.0.0-beta.32 is pinned by the lockfile. Credentials are verified with salted scrypt. JWT sessions last eight hours and check the database session version and disabled flag on each request. Password resets revoke previous sessions without changing the user's role. Invitation secrets are hashed, expire after 48 hours and can be consumed once. Issuing a new invitation invalidates older outstanding links. No public sign-up exists. Roles cannot be supplied by the signing-in client. The last active administrator cannot be disabled through the UI.

Every data route enforces authentication independently of the page proxy. Cookie-authenticated writes require the workspace origin. The local shortcut is restricted to loopback hosts, offline providers and non-production builds. `CAM_AUTH_MODE=required` tests the real account boundary without enabling generation. Media downloads are protected too.

`pnpm db:migrate` applies additive, checksummed SQL migrations transactionally. `pnpm test:access` creates temporary test accounts, starts a separate loopback server with required authentication, checks the real HTTP sign-in/cookies, permissions, session revocation, invitations and cross-origin rejection, then removes those fixtures. No email or provider request is sent. Proof: `storage/qa/cam-access-proof.json`.

Implementation references: [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials), [role-based access](https://authjs.dev/guides/role-based-access-control). Installation alone does not validate a production deployment.
