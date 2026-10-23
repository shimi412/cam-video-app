import path from 'node:path';
import {supervisedStep,RecoveryStepError} from '@/lib/agent/recovery-step';
import { customerPricingReady, customerQuote, walletTotals, customerPricing } from "@/lib/customer-wallet";
import { clayBudgets } from "@/lib/concept/clay-budgets";
import { SINGLE_JOURNEY, estimatedMinutes } from "@/lib/concept/single-journey";
import { firstVersionPriceCents } from "@/lib/customer-price";
import { planConcept } from "@/lib/concept/storyboard";
import type { ProductionParams } from "@/lib/brain";
import { initializeStoryboardLaunch } from "@/lib/concept/storyboard-launch-service";
import { verifyStoryboardLaunch, assertStoryboardLaunchQuote, type StoryboardLaunchReceipt } from "@/lib/concept/storyboard-launch";
import { liveView, updateLiveProduction } from "@/lib/concept/live-production";
import { productionError } from "@/lib/production-error";
import { actorFor, withAccess } from "@/lib/access";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { db, pool, schema } from "@/db";
import { directSemanticConcept } from "@/lib/concept/ai-direction";
import { assertCamConfigured } from "@/lib/providers/live-policy";
import { withBrainRequest } from "@/lib/providers/brain";
import { frameProduction } from "@/lib/brain-llm";
import { estimateProduction } from "@/lib/pricing";
import { getBalanceUsd } from "@/lib/credits";
import { getMarginMultiplier, getSetting } from "@/lib/settings";
import { probeWriterModel } from "@/lib/providers/openrouter";
import { clayModelFromSetting } from "@/lib/concept/clay-budgets";
import { DEEP_MODEL } from "@/lib/ai-routing";
import { getActiveRecipe, activeRecipes, RecipeUnavailableError } from "@/lib/recipes";
import { providerMode, isSimulation } from "@/lib/providers/mode";
import { eq, sql } from "drizzle-orm";
import { assertExistingSelection, existingParams, verifyExistingAssets, existingMediaSummary } from "@/lib/concept/existing";
import { prepareConcept } from "@/lib/concept/preparation";
import { smallJson } from "@/lib/http";
/** Part of the Start recovery key: bump it when the director contract or validator changes, so a fix buys a fresh checkpoint instead of a dead end. */
const DIRECTION_VERSION="2026-10-21c";
import { conversationExists } from "@/lib/workspace";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  conversationId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  storyboardLaunchToken: z.string().min(1).max(12000).optional(),
  parentJobId: z.uuid().optional(),
  script: z.string().min(40, "Script too short: paste the full script from your monitoring app.").max(6000),
  mode: z.enum(["auto", "manual"]),
  previewSource: z.enum(["planning", "existing"]).default("planning"),
  overrides: z
    .object({
      templateSlug: z
        .string()
        .refine((s) => Boolean(getActiveRecipe(s)), "This video model is unavailable")
        .optional(),
      tone: z.enum(["serious", "energetic", "calm"]).optional(),
      tier: z.enum(["standard", "premium"]).optional(),
      voiceId: z.string().optional(),
      aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
    })
    .optional(),
});

async function handlePOST(request: Request) {
  if (activeRecipes().length === 0) {
    return Response.json({ error: new RecipeUnavailableError().message }, { status: 409 });
  }
  const parsed = bodySchema.safeParse(await smallJson(request).catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const submit = (assertOwned = () => {}) => handleSubmission(request, parsed.data, assertOwned);
  if (!parsed.data.requestId) return submit();
  // Serialize the full Start action, including paid reasoning before job creation.
  // A distinct session lock leaves the production worker's own job lock free.
  const client = await pool.connect(), key = `cam-production-launch:${parsed.data.requestId}`;
  let locked = false;
  let connectionError: Error | undefined;
  const onError = (error: Error) => { connectionError = error; };
  const assertOwned = () => { if (connectionError) throw connectionError; };
  client.on("error", onError);
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [key])).rows[0].locked;
    if (!locked) return Response.json({ error: "This video is already being prepared. Please wait before retrying.", code: "STORYBOARD_LAUNCH_IN_PROGRESS" }, { status: 409 });
    return await submit(assertOwned);
  } finally {
    let unlockError: Error | undefined;
    try { if (locked && !connectionError) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]); }
    catch (error) { unlockError = error instanceof Error ? error : new Error("Could not release the Start lock."); throw error; }
    finally { client.removeListener("error", onError); client.release(connectionError ?? unlockError); }
  }
}

async function handleSubmission(request: Request, data: z.infer<typeof bodySchema>, assertOwned: () => void) {
  assertOwned();
  const { script, mode, overrides, previewSource, conversationId, requestId, parentJobId, storyboardLaunchToken } = data;
  const identity = { ...data }; delete identity.storyboardLaunchToken;
  const requestHash = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  const tokenHash = storyboardLaunchToken ? createHash("sha256").update(storyboardLaunchToken).digest("hex") : undefined;
  const reply = async (job: typeof schema.jobs.$inferSelect, replayed = false) => {
    const saved = job.params as Record<string, unknown>;
    if (saved.originRequestHash !== requestHash) return Response.json({ error: "This request identifier was already used. Reload before submitting a changed request." }, { status: 409 });
    if (job.deletedAt) return Response.json({ error: "This video was removed. Start a new video." }, { status: 404 });
    let advance = false;
    if (saved.live === true) {
      const actor = await actorFor(request);
      if (!actor || actor.local || saved.originActorId !== actor.id) return Response.json({ error: "This production request belongs to another session. Start a new video." }, { status: 409 });
      if (saved.journey === SINGLE_JOURNEY) {
        // Single journey (Shimi, 2026-10-23): the analysed script has ONE estimate, delay and price of the complete
        // first version; approving it reserves that price and launches production. A replay refreshes an expired
        // estimate without repeating the paid analysis; an approved film is simply reopened.
        try {
          const estimate = await singleVersionEstimate(job.id, actor.id, job.script, saved, assertOwned);
          if (!estimate) return Response.json({ jobId: job.id, journey: SINGLE_JOURNEY, approved: true, replayed }, { status: 202 });
          await db.update(schema.jobs).set({ error: null }).where(eq(schema.jobs.id, job.id));
          return Response.json({ jobId: job.id, journey: SINGLE_JOURNEY, approved: false, estimate, replayed });
        } catch (error) {
          const message = error instanceof RecoveryStepError ? error.message : "Your script is saved, but its estimate could not be prepared. Retry this same video or contact support.";
          await db.update(schema.jobs).set({ error: message }).where(eq(schema.jobs.id, job.id));
          return Response.json({ error: message, jobId: job.id, replayed }, { status: 409 });
        }
      }
      let launch = saved.storyboardLaunch as { receipt: StoryboardLaunchReceipt; actorId: string; acceptedAt: number; tokenHash: string } | undefined;
      if (launch) {
        if (launch.actorId !== actor.id || launch.receipt.actorId !== actor.id) return Response.json({ error: "This preparation approval belongs to another account." }, { status: 403 });
        let repriceRequired = false;
        try {
          if (tokenHash !== launch.tokenHash) {
            const current = await liveView(job.id);
            if (current.approved || current.renewing || current.finished || current.review || current.requests.length || current.phase !== "quote" || (current.quote && current.quote.scope !== "storyboard")) {
              return Response.json({ error: "Storyboard preparation already started. Reopen this video to continue from its saved progress.", jobId: job.id, replayed }, { status: 409 });
            }
            // A new deliberate Start click may accept a refreshed preparation
            // price for this saved script. Paid reasoning is never repeated.
            repriceRequired = true;
            if (!storyboardLaunchToken) throw new Error("Refresh the preparation price before retrying.");
            const receipt = verifyStoryboardLaunch(storyboardLaunchToken, { script, mode, overrides, previewSource }, actor.id);
            launch = { receipt, actorId: actor.id, acceptedAt: Date.now(), tokenHash: tokenHash! };
            assertOwned();
            await db.update(schema.jobs).set({ params: { ...saved, storyboardLaunch: launch } }).where(eq(schema.jobs.id, job.id));
            repriceRequired = false;
            await updateLiveProduction(job.id, { action: "quote" }, actor.id);
          }
          const result = await initializeStoryboardLaunch({ jobId: job.id, actorId: actor.id, receipt: launch.receipt }, {
            view: id => { assertOwned(); return liveView(id); },
            quote: (id, actorId) => { assertOwned(); return updateLiveProduction(id, { action: "quote" }, actorId); },
            customerQuote: (id, quote) => { assertOwned(); return customerQuote(id, quote); },
            approve: (id, quote, actorId) => { assertOwned(); return updateLiveProduction(id, { action: "approve", ...quote }, actorId); },
            validate: (receipt, quote, price) => {
              try { assertStoryboardLaunchQuote(receipt, quote, price, { acceptedAt: launch!.acceptedAt }); }
              catch (error) { repriceRequired = true; throw error; }
            },
          });
          advance = result.advance;
          await db.update(schema.jobs).set({ error: null }).where(eq(schema.jobs.id, job.id));
        } catch (error) {
          if(repriceRequired && saved.editorialPlan){
            // The meaning-led plan may differ from the provisional allowance.
            // Keep its exact saved inputs and show the actual image price; never
            // repeat analysis or silently authorize an increased image budget.
            const current=await liveView(job.id);
            if(current.quote?.scope==="storyboard"&&!current.approved&&!current.requests.length){
              await db.update(schema.jobs).set({error:null}).where(eq(schema.jobs.id,job.id));
              return Response.json({...saved.draft as Record<string,unknown>,jobId:job.id,preparation:saved.preparation,preparationPriceUpdated:true,replayed});
            }
          }
          const message = repriceRequired
            ? "The preparation price has changed. Review the updated price, then start again; your script is saved."
            : error instanceof Error && error.message.includes("Not enough available")
            ? "Not enough available balance. Open My credits to recharge, then retry this video."
            : "Your script is saved, but storyboard preparation could not start. Retry this same video or contact support.";
          await db.update(schema.jobs).set({ error: message }).where(eq(schema.jobs.id, job.id));
          return Response.json({ error: message, jobId: job.id, replayed, ...(repriceRequired ? { code: "STORYBOARD_LAUNCH_REPRICE_REQUIRED" } : {}) }, { status: 409 });
        }
      }
    }
    // This callback only follows the original authenticated Start POST or its
    // identical replay. GET/reload never creates a launch authorization.
    assertOwned();
    return Response.json({ ...(saved.draft as Record<string, unknown>), jobId: job.id, preparation: saved.preparation, ...(replayed ? { replayed: true } : {}) }, { status: advance ? 202 : 200 });
  };
  if (requestId) { const [existing] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, requestId)); if (existing) return reply(existing, true); }
  if (conversationId && !await conversationExists(conversationId)) return Response.json({ error: "Conversation not found." }, { status: 404 });
  if (parentJobId) {
    const [parent] = await db.select({ conversationId: schema.jobs.conversationId }).from(schema.jobs).where(eq(schema.jobs.id, parentJobId));
    if (!conversationId || parent?.conversationId !== conversationId) return Response.json({ error: "The source video must belong to this conversation." }, { status: 400 });
  }
  if (previewSource === "existing") {
    try {
      assertExistingSelection(script, { templateSlug: overrides?.templateSlug ?? "cam-clay", aspectRatio: overrides?.aspectRatio ?? "9:16" });
      await verifyExistingAssets();
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Existing media unavailable." }, { status: 409 }); }
  }
  if (!isSimulation() && process.env.CAM_LIVE_ENABLED !== "1" && (overrides?.templateSlug ? getActiveRecipe(overrides.templateSlug)?.concept?.previewOnly : activeRecipes().every((r) => r.concept?.previewOnly))) {
    return Response.json({ error: "CAM Clay is currently available for free previews only. Final production is being prepared." }, { status: 409 });
  }
  if (!isSimulation()) {
    try { assertCamConfigured(); } catch { return Response.json({error:"Open the connected CAM workspace to prepare a production."},{status:409}); }
    if (!requestId) return Response.json({error:"A production request identifier is required."},{status:400});
  }
  if(!isSimulation()&&!await customerPricingReady())return Response.json({error:"Bina must activate CAM credit pricing before you start a new video. Nothing has been charged."},{status:409});
  // New Clay films follow the single journey when the workspace prices by the 2026-10-23 grid; the choice is saved with the job.
  const single = !isSimulation() && previewSource === "planning" && (await customerPricing())?.mode === "tiers-v2";
  let launch: { receipt: StoryboardLaunchReceipt; actorId: string; acceptedAt: number; tokenHash: string } | undefined;
  let originActorId: string | undefined;
  if (!isSimulation()) {
    const actor = await actorFor(request);
    if (!actor || actor.local) return Response.json({ error: "Sign in to the connected workspace before producing." }, { status: 401 });
    originActorId = actor.id;
    if (single) {
      // The estimate comes after the analysis; the analysis itself is an internal allowance of the version. Do not
      // analyse for a wallet that could not approve even the lowest tier.
      const wallet = await walletTotals();
      if (Math.round(wallet.available * 100) < firstVersionPriceCents(0)) return Response.json({ error: `Your available balance is below the minimum video price of $${firstVersionPriceCents(0) / 100}. Open My credits to recharge, then start your video.` }, { status: 409 });
    } else if (previewSource === "planning") {
      try {
        if (!storyboardLaunchToken) throw new Error("Refresh the storyboard preparation price before starting.");
        const receipt = verifyStoryboardLaunch(storyboardLaunchToken, { script, mode, overrides, previewSource }, actor.id);
        const wallet = await walletTotals();
        if (Math.round(wallet.available * 100) < receipt.maxCustomerCents) return Response.json({ error: "Not enough available balance to prepare this storyboard. Open My credits to recharge." }, { status: 409 });
        launch = { receipt, actorId: actor.id, acceptedAt: Date.now(), tokenHash: tokenHash! };
      } catch (error) {
        const expired = error instanceof Error && /expired/i.test(error.message);
        return Response.json({ error: "The preparation price changed or expired. Refresh it before starting; nothing has been generated.", code: expired ? "STORYBOARD_LAUNCH_EXPIRED" : "STORYBOARD_LAUNCH_CHANGED" }, { status: 409 });
      }
    }
  }
  // Probe the director model for real before any paid step (2026-10-21, as Motion): an account restriction,
  // a refused tool_choice or an unreachable model surfaces here with the provider's own reason.
  if (!isSimulation() && previewSource === "planning") {
    try { await probeWriterModel(clayModelFromSetting(await getSetting<string>("ai_deep_model"), DEEP_MODEL)); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "The production director is unavailable." }, { status: 409 }); }
  }
  const jobId = requestId ?? randomUUID();
  const step=<T,>(stage:string,execute:()=>Promise<T>)=>supervisedStep({jobId,category:'clay',stage,inputs:{script,mode,overrides,previewSource,directionVersion:DIRECTION_VERSION},directory:path.resolve('storage/concepts',jobId,'live'),assertOwned:async()=>assertOwned(),execute});
  let framing;
  assertOwned();
  try { framing = await step("initial-direction",()=>withBrainRequest({ requestId: jobId, conversationId }, () => frameProduction(script, mode, overrides))); }
  catch (error) { return Response.json({ error: error instanceof RecoveryStepError?error.message:productionError(error) }, { status: 400 }); }
  const { analysis, brain } = framing;
  let params = previewSource === "existing" ? existingParams(framing.params) : { ...framing.params, previewSource };
  if (previewSource === "existing") {
    analysis.durationSeconds = params.durationSeconds;
    analysis.reason = "Reuse the existing CAM film with its recorded narration and 12 animated clips. Local montage, no new generation.";
  }
  const recipe = getActiveRecipe(params.templateSlug)!;
  if (recipe.concept && previewSource === "planning") params.productionMethod = "whimsical-v1";
  assertOwned();
  if (!isSimulation() && recipe.concept && previewSource === "planning") {
    try { params = await step("semantic-direction",()=>withBrainRequest({requestId:jobId,conversationId}, () => directSemanticConcept(script,params,recipe))); }
    catch(error) { return Response.json({error:error instanceof RecoveryStepError?error.message:productionError(error)},{status:409}); }
  }
  // After the semantic direction (which returns the director's params): the journey is saved with the job.
  if (single && recipe.concept) params = { ...params, journey: SINGLE_JOURNEY } as ProductionParams & { journey?: string };
  let preparation = null;
  if (recipe.concept && previewSource === "planning") {
    try { preparation = await step("preparation",()=>prepareConcept(script, params, recipe, jobId)); }
    catch (error) { return Response.json({ error: error instanceof RecoveryStepError?error.message:productionError(error) }, { status: 409 }); }
    params.durationSeconds = preparation.durationSeconds;
    analysis.durationSeconds = preparation.durationSeconds;
  }
  const marginMultiplier = await getMarginMultiplier();
  const estimate = estimateProduction(params, marginMultiplier);
  const balance = await getBalanceUsd();

  const [template] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.slug, params.templateSlug));

  const created = await db.transaction(async (tx) => {
    assertOwned();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${jobId}, 0))`);
    const [existing] = await tx.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (existing) return { job: existing, replayed: true };
    const conversation = conversationId ? { id: conversationId } : (await tx.insert(schema.conversations).values({ mode, executionMode:providerMode(), title:data.title ?? script.split(/\s+/).slice(0,7).join(" ").slice(0,64) }).returning())[0];
    const draft = {
      conversationId: conversation.id, analysis, params,
      template: template ? { slug: template.slug, name: template.name, description: recipe.description } : null,
      estimate, balance, brain, simulation: isSimulation(),
      media: previewSource === "existing" ? existingMediaSummary() : null,
      canConfirm: isSimulation() || (!estimate.unpriced?.length && balance >= estimate.totalBilledUsd),
    };
    await tx.insert(schema.messages).values({ conversationId: conversation.id, role: "user", content: { type: "script", text: script, parentJobId } });
    const [job] = await tx.insert(schema.jobs).values({
      id: jobId, conversationId: conversation.id, templateId: template?.id, status: "estimated", script, title: data.title ?? null,
      params: { ...params, live: !isSimulation() && Boolean(recipe.concept), executionMode: providerMode(), preparation, draft, originRequestHash: requestHash, originActorId, storyboardLaunch: launch, parentJobId },
      estimateUsd: !isSimulation()&&recipe.concept ? null : estimate.totalBilledUsd.toFixed(2),
    }).returning();
    await tx.insert(schema.messages).values({ conversationId: conversation.id, role: "assistant", content: { type: "framing", jobId: job.id, analysis, params, estimate } });
    return { job, replayed: false };
  });
  return reply(created.job, created.replayed);
}

/** The single estimate of a complete first version: delay from the plan's scene count, price from the grid on the
 * whole estimated supplier cost (images with character sheets and end images, voice, alignment, clips, local
 * finishing, AI allowances). Null once the client approved. Read-only price fetches; no generation. */
async function singleVersionEstimate(jobId: string, actorId: string, script: string, saved: Record<string, unknown>, assertOwned: () => void) {
  assertOwned();
  let view = await liveView(jobId);
  if (view.approved || view.finished) return null;
  if (!view.quote || view.quote.scope !== "production" || view.quote.expiresAt <= Date.now()) {
    await updateLiveProduction(jobId, { action: "quote" }, actorId);
    assertOwned();
    view = await liveView(jobId);
  }
  if (!view.quote || view.quote.scope !== "production") throw new RecoveryStepError("The estimate of your video is unavailable. Your script is saved.");
  const customer = await customerQuote(jobId, view.quote, { allowanceUsd: clayBudgets().firstVersionAllowanceUsd });
  if (!customer) throw new RecoveryStepError("Pricing is unavailable. Your script is saved.");
  const params = saved as unknown as ProductionParams;
  const sceneCount = planConcept(script, getActiveRecipe(params.templateSlug)!, params.aspectRatio, params.sceneDirections, params.sceneNarrations).shots.length;
  const wallet = await walletTotals();
  return { quote: view.quote.id, customerQuote: customer.id, amountCents: customer.amountCents, expiresAt: Math.min(customer.expiresAt, view.quote.expiresAt), minutes: estimatedMinutes(sceneCount), sceneCount, availableCents: Math.round(wallet.available * 100) };
}

export const POST = withAccess(handlePOST);
