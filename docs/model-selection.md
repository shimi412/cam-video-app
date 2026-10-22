# Production model selection

## Current journey (2026-10-15)

Shimi's corrected order is script planning, image storyboard, human storyboard approval, animation quote, budget approval, voice/animation/finishing. Client screens show neither provider/model names nor supplier credit balances. The first image budget is explicit because API images and OpenRouter reasoning are not free. No full animation reservation precedes the image review.

New and never-approved productions use `storyboardFirst`. Their first quote has `scope: storyboard`: image operations only, no voice/alignment/video quote or permission. Imported storyboard media can yield a genuine zero-cost quote with no fabricated wallet credit. Human approval of the complete storyboard returns without scheduling paid work. A subsequent read-only quote covers the complete production. The customer reservation is replaced with the cumulative total, not added twice. Completed image requests retain their original reservations and are reused.

Already-approved legacy productions retain their original workflow and model. A stale browser cannot approve an old never-approved full-production quote; it must refresh to the storyboard budget.

## Scene routing

Kling 3.0 Pro is preferred for compatible simple actions, including actions requiring both start and end frames. A final frame alone is not classified as a complex transformation. Actual state changes and multiple characters use the qualified Seedance route. Unsupported or ambiguous pricing never means free. This is a conservative rule-based capability policy, not an AI visual quality score.

Kling draft-first uses Standard followed by Pro, with the same approved start/end frames, prompt, action duration and audio disabled. These are two independently billed generations. The final is not an upscale or guaranteed motion-identical continuation of the draft. Seedance through Higgsfield uses a 480p draft and a 1080p continuation with its saved draft ID. Both pause for draft review before finishing. Provider models and technical controls stay out of the client interface.

The planned action duration (`actionSeconds`, or the storyboard `clipSeconds` fallback) drives quote and actual payload. Provider minimum lengths apply. Voice alignment changes montage timing and local holds, not paid source length. There is no blanket 15-second reservation; actions over 15 seconds must be split. The complete recording remains intact.

Kling pricing uses verified API prices in USD per second for each pass. Seedance uses resolution-specific read-only Higgsfield get_cost responses and the configured supplier-credit valuation. Generic token prices are not treated as per-second rates. fal Seedance and MiniMax remain in the comparison but cannot be selected without a compatible, unambiguous price and draft workflow. The explored Hailuo route was not activated.

## Recovery and controls

The quote ID includes its scope, model choices, durations and rates. Once approved, models stay locked on renewal. Quotes expanding from storyboard to production retain all attempted image lines. Approval changes neither image fingerprints nor the visual storyboard target. That target binds script, directions, approved character sheets, image bytes and format, independently of later voice timing and video model choice.

Queue submissions occur once, then poll saved IDs. Unknown outcomes retain their reservations. A failed generation never triggers an unapproved paid replacement. Exact cost receipts are recorded when available; an estimate is not a final invoice. Seedance finalization is repriced before submission and expires seven days after its draft; an already submitted final can still be polled.

Image generation always uses the approved character-sheet bytes for every referenced character. Text, logo, audio fades and montage finishing remain local.

## Validation and limits

Two offline controller rehearsals exercise images, storyboard gate, second budget, narration, draft gate, final, three exports, expired quotes and interrupted requests. One covers Kling start/end frames and one covers Seedance continuation. Network access is blocked; synthetic images and a local test recording replace providers. This verifies orchestration, not real model quality. No paid generation or trial was launched during repairs.

The customer wallet must contain actual purchased or explicitly issued test credit before a positive quote can be approved. The local single-administrator test workspace received an explicit USD 50 internal Bina adjustment for QA, not a purchased-credit entry or external payment. Hosted reference URLs currently require reviewed refresh after their lifetime; a next-day resume may need maintenance before continuing, without resubmitting existing generations.

## References

User's source on cost-aware routing: Dan Kieft, https://www.youtube.com/watch?v=KKfaBVM3Jdg ; referenced selector https://ai-video-model-selector.vercel.app/. This inspired compatibility checks, not blind use of external rankings.

Official contracts checked 2026-10-15:
- https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api
- https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api
- https://fal.ai/models/bytedance/seedance-2.5/image-to-video/api
- https://fal.ai/models/bytedance/seedance-2.5/draft/complete/api
- Higgsfield MCP models_explore and get_cost for seedance_2_5.

Public model-page rates and generic pricing-API rates may differ by audio setting. CAM keeps the API allowance until a setting-specific billing contract is verified rather than inventing a discount.
