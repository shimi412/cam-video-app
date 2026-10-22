# Motion integration plan · 2026-10-18

## Decisions

1. A separate `Motion design` film category and `/motion/[id]` workspace. Clay and its accepted requests remain unchanged. Code-only scenes do not call image or video generators.
2. The first review is an animated board: complete low-resolution film plus one clip per voice phrase, movement and meaning, explicit Yes/No and feedback. Then whole-film visual approval, then separate sound/editing/subtitle approval, then download. Every approval is bound to the current revision. Human approval is never inferred from a successful render.
3. The writer receives METHOD-fr.md, the complete reference builder and real word timings. A configurable Claude model/effort writes Python scene code; fixed machinery is checked byte-for-byte. Execution runs in a private revision directory, without credentials or network, under an OS sandbox. Unsupported platforms fail closed. No generated HTML is served to the user's browser. Rendering is serialized and isolated too.
4. A revision request names scene IDs; untargeted source blocks must be byte-identical. Retiming or global changes require an explicit global request. Previous media and approvals remain historical; new revision invalidates downstream approvals. No automatic paid retries.
5. Client price: $10 initial, $5 per requested revision, total at most $20. Show price and reserve wallet funds before any supplier call. Supplier receipts are stored separately; unknown costs remain unknown. Finishing and download are included. Two paid revisions maximum; further work requires an explicit new commercial decision.

## Work stages

- Baseline: existing tests, lint, client journey. Exclude vendored GSAP from lint, without editing it.
- Runtime: typed motion state, durable revisions, scoped writer contract, sandbox, reference assets, checks and render pipeline. Test reference HTML identity and negative checks without any supplier credentials.
- Product: category entry, durable job ownership, wallet reservation, background processing, animated board with local/global feedback and price, whole-film review, separate finishing, exact-file download. Friendly status/errors with technical evidence kept internal.
- Evidence: isolated browser journey with fixture voice/timings/writer, real local render, all human gates, failed checks, scoped revision, no external calls. After each stage run `pnpm test`, `pnpm lint`, `pnpm test:client-journey`.
- Handoff: update MEMORY.md and report the acceptance results, remaining deployment requirements and the need for Shimi's visual acceptance.

## Risks and boundaries

- The supplied voice scripts contain Plot Hole-specific word indices and local paths: they cannot silently process arbitrary scripts. Production voice alignment must use generic phrase/silence timing.
- Generated Python and JavaScript are untrusted. Syntax checks are not a security boundary. The worker must deny host project files, secrets and external networking. Local assets and installed runtime libraries are read-only.
- `check_holds` covers registered foreground events; it alone does not prove visual quality. Evidence must distinguish numeric checks, rendered-frame checks and human acceptance.
- Reference equivalence means identical generated HTML, not identical compressed MP4 bytes. Keep reference files unchanged.
- No paid API call, no alteration of existing client jobs, no restart of the user's local test server during implementation.

## Approved reference adjustment

On 2026-10-18 Shimi approved correcting only the two safe-area framings while
retaining the original. `reference/plot-hole-v4-safe.py` is the new worked example,
with a separate golden HTML hash. Both reference identities are tested. Encoded
video is also compared with inspected frames, since an HTML-only font check did
not catch a bundler/CSP font substitution. No quality gate was relaxed.
