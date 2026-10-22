import {motionBudgets} from './budgets';
import {writeMotionAgent} from './agent-writer';
/** Contract 6 = agent with tools (default since 2026-10-21); CAM_MOTION_WRITER=legacy keeps contract 5 for comparison. */
export const motionWriterContract=():5|6=>process.env.CAM_MOTION_WRITER==='legacy'?5:6;
import {creativeSheets,reviewMotionCreative,type CreativeApproval} from './creative-review';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {assembleMotionRuntime} from './assembly';
import {localRepairDiagnostic,preludeHelperNames,visualDiagnostic} from './diagnostic';
import {compileMotion,inspectMotion} from './worker';
import {motionDirectory} from './store';
import {CompositionAnswer} from './patch';
import {MotionExchange,MotionRevision,CreativeRevision,RevisionDirection,exchangeAnswer,TimedExchange,timedExchangeAnswer} from './exchange';
import {saveCompositionCandidate,savedRepairBase} from './candidate';
import {brainMode} from '../providers/mode';
import {getSetting} from '../settings';
import {openrouterPrice,checkOpenrouter,probeWriterModel} from '../providers/openrouter';
import {runAgent,AgentPlanFailure} from '../agent/runtime';
import {digest} from '../agent/store';
import {canonicalRecovery} from '../agent/recovery-supervisor';
import {Timing,digest as sourceDigest,validateFilm,type MotionFilm,type MotionTiming,type Receipt} from './model';
export type WriterInput={contract?:2|3|4|5|6;jobId?:string;revision?:number;script:string;timing:MotionTiming;previous?:MotionFilm;targets:string[];feedback:string;repair?:{attempt:number;error:string;failedSource?:string;failedFilm?:MotionFilm;currentDiagnostic?:string;provisionalBuild?:string;resumption?:number;previousAttempt?:string}};
export async function writeMotion(input:WriterInput):Promise<{film:MotionFilm;receipt:Receipt;creativeApproval?:CreativeApproval}>{
 if(input.contract===6)return writeMotionAgent(input);
 if(input.contract!==2&&input.contract!==3&&input.contract!==4&&input.contract!==5)throw Error('Legacy motion writing needs reconciliation before changing its saved request.');
 input={...input,timing:Timing.parse(input.timing)};
 if(!input.jobId)throw Error('Motion writing requires a saved video session.');
 const model=process.env.CAM_MOTION_MODEL??await getSetting<string>('ai_deep_model')??'anthropic/claude-sonnet-5';
 if(!model.startsWith('anthropic/claude-'))throw Error('The motion writer requires a configured deep reasoning model.');
 const method=await readFile(path.resolve('motion/METHOD-fr.md'),'utf8'),template=await readFile(path.resolve('motion/reference/plot-hole-v4-safe.py'),'utf8');
 const legacySystem=`First submit {film: ...}. If local compilation rejects it, use {patch: {baseSha256, edits: [{before, after}]}} against the last candidate hash returned in the error; each before must match exactly once. This avoids reprinting the film for a small fix. You author only the creative composition of executable typographic films. Return source with an optional DUR number then the scene A boundary, containing scene composition including the animated logo, then the subtitle boundary and ONLY the SUBS, VIS and MARKS assignments. The application supplies the fixed prelude, subtitle implementation, visibility loop, check_holds, PH, HTML/audio output and all helper functions. Do not copy or redefine those functions or output code. No custom functions/classes. MARKS is a dictionary of sound cues (transitions, sober, plot, q_final, logo_impact, logo_net, strike, counter, terrible, dur). Provide an original considered composition, not a fill-in-the-blanks template. Follow the authoritative method below. The engine before '# ============================================================ A' is supplied by the application; request a numeric DUR when the closing logo needs more time. Rewrite scene content for this exact script. Keep the subtitle boundary comment exactly. Keep public explanations in English. Use only local provided assets, standard drawing functions and GSAP timeline set/to/fromTo. No imports after the machinery, network, external files, process creation or general browser programming. Each voice phrase has one scene ID and English movement/meaning explanation. Supply truthful VIS times and LOGO_NET; PH, check_holds and audio/HTML output are application-owned. Adapt all word indices, SUBS and music markers to the actual timings. Retain the animated brand signature. Report removed words with selector and disappearance time. No automatic shortening of the narration.\n${method}\nCOMPLETE WORKED REFERENCE:\n${template}`;
 let system=input.contract===2?legacySystem:`You author creative motion composition using the supplied local drawing helpers. The application owns the complete runtime and footer. For a NEW film submit {composition:{duration,body,subtitles,visualTiming,soundCues,referenceChoice,scenes,removedWords}}. body contains ONLY executable scene composition including the animated brand ending; no prelude, imports, helper definitions, subtitle/footer code or required boundary comments. subtitles is an array of exact narration excerpts. visualTiming and soundCues are Python dictionary expressions, parsed as data by the application. soundCues keys: transitions,sober,plot,q_final,logo_impact,logo_net,strike,counter,terrible,dur. Each voice phrase has one scene ID. Never shorten narration.
For a REVISION submit ONLY {patch:{baseSha256,edits:[{before,after}],scenes?,removedWords?}} against previous.source, whose SHA256 is provided in currentRequest. Do not recopy the film. Each before must match exactly once; preserve all source outside the explicitly requested scenes. Include scenes metadata only if it changes.
On rejection, the saved candidate hash identifies the exact base. A rejected scope or patch edit leaves the prior candidate unchanged. Correct only the reported issue. Do not edit technical boundary comments, machinery or checks. No imports, custom functions, network, process creation or external files. Quality checks run before acceptance.
AUTHORITATIVE METHOD:
${method}
WORKED REFERENCE (machinery is supplied by the application, never copy it):
${template}`;
 const creative=input.contract===4||input.contract===5;
 let repairBase=input.contract===5?input.repair?.failedFilm:undefined;
 if(input.contract===5&&input.repair&&!repairBase)throw Error('Code repair requires the complete saved candidate and its metadata before contacting the writer.');
 if(input.contract===5){
  // The footer is application-owned: showing it only invites copies of PH/VIS
  // diagnostics into the composition. The writer sees the helpers and scenes.
  const boundary='# ------------------------------------------------------------ sous-titres',helpers=preludeHelperNames(template);
  system=system.replace(template,template.slice(0,template.indexOf(boundary)));
  system+=`
CONTRACT 5 DATA:
body starts with your first scene() call and ends with the brand ending. It contains no def/import/class, no copy of the helpers (already supplied: ${helpers.join(', ')}), no scenes_html/BODY assembly loop and no PH, VIS, SUBS, MARKS, check_holds, print or file writes. The application computes PH, prints the timing report, runs check_holds and writes marks.json and index.html.
visualTiming is an array with exactly one entry per narration phrase: {phrase:<integer phrase ID>, at:<seconds as a number, or a short unquoted Python expression over names you defined in body, e.g. "TB0" or "max(ws(19), TD0 + .05)">}. Give the real arrival of the phrase's first visual, never a scene ID, never a quoted variable name, never an invented zero.
soundCues is an object: sober:[start,end] of the single calm passage; logo_impact: when the logo lands; optional plot (held chord accent, default: start of the last narration scene) and q_final (final dry accent, default: one second before the logo lettering); strike, counter and terrible only when the composition really has a struck word, an accelerating counter or a crushing word, otherwise omit them. Values are numbers or expressions as above. The application derives transitions from your iris/band/pan/recede_black calls and owns dur and logo_net: omit them. removedWords is the one exception: each at is a plain number in seconds computed from timing.words (a word that is spoken at words[i] ends at words[i].end), never an expression, because the browser check seeks that exact time. scenes must list exactly one scene per entry of timing.phrases, in order, with the phrase number; merging two phrases into one scene is rejected.
The two boundary comment lines (the one starting with '# ============================================================ A' before the first scene and the one starting with '# ------------------------------------------------------------ sous-titres') are application-owned: never include either line in a before or after text; edit only lines strictly between or after them. In the assembled Python source, which a repair patches, these data are the three assignments after the subtitle boundary: SUBS = [["exact narration excerpt", 1340], ...], VIS = {1: ws(0), 2: TB0, ...} and MARKS = {'sober': [T_F, T_G], 'logo_impact': LAND, ...}. Integer phrase IDs, unquoted expressions, one VIS only.
For a repair, repair.failedFilm is the exact complete rejected candidate, repairSourceSha256 is its hash and repair.currentDiagnostic is the precise result of the current validator on that exact source. repair.provisionalBuild, when present, reports what the sandbox build says once the data lines are read mechanically from your own composition: it is a preview, not an applied change. Return one small hash-bound patch that resolves everything reported, data lines and timing together; each paid step is bounded, so do not spend a step per issue and do not rewrite the entire composition. When the diagnostic concerns VIS, MARKS or SUBS, edit those data lines after the subtitle boundary and delete any VIS/PH/diagnostic block you had added to the composition. For a revision, previous remains the protected approved original; repair.failedFilm is only the patch base, never permission to change scope.
The initial authoring input and repair inputs are versioned independently; historical paid turns retain their original contracts.`;
 }
 if(creative)system+=`
FEEDBACK EXECUTION:
${await readFile('agent/skills/motion-feedback/SKILL.md','utf8')}
For revisions include direction:{request,integration,movement,preserve,proofs:[{sceneId,visibleResult}]} with your patch. Explain the actual creative integration, not just element presence. Every selected scene needs one proof goal. A fresh take (global rejection) means every selected scene gets a visibly different movement and composition; an unchanged source is rejected. You will be checked against before/after renders. Never place the feedback sentence in artwork. Technical correctness is not creative acceptance.`;
 let beforeImages:Buffer[]=[];
 if(creative&&input.previous){
  const beforeDir=path.join(motionDirectory(input.jobId!),`creative-before-${sourceDigest(input.previous.source).slice(0,16)}`);
  try{beforeImages=await creativeSheets(beforeDir,input.previous,input.targets,'BEFORE');}
  catch{await compileMotion(beforeDir,input.previous,input.timing,path.join(motionDirectory(input.jobId!),'voix.wav'),undefined,[],{compositionOnly:true});await inspectMotion(beforeDir);beforeImages=await creativeSheets(beforeDir,input.previous,input.targets,'BEFORE');}
 }
 // The saved failure may predate a validator improvement. Give Claude the exact
 // current local diagnostic of that source, free of charge, instead of a stale
 // traceback whose line numbers belong to an assembled file it never sees.
 const currentDiagnostic=repairBase?input.repair?.currentDiagnostic??await localRepairDiagnostic(repairBase,template,input.timing,input.previous,input.targets):null;
 const promptInput:WriterInput=repairBase&&currentDiagnostic&&!input.repair?.currentDiagnostic?{...input,repair:{...input.repair!,currentDiagnostic}}:input;
 // Canonical key order: the same pinned input, whether built in memory or
 // reloaded from JSONB after a restart, names the same paid turn.
 const prompt=JSON.stringify(canonicalRecovery({...promptInput,...(input.contract!==2&&input.previous?{previousSourceSha256:sourceDigest(input.previous.source)}:{}),...(repairBase?{repairSourceSha256:sourceDigest(repairBase.source)}:{}),repairInstruction:repairBase?'Patch repair.failedFilm using repairSourceSha256 and the exact diagnostic in repair.currentDiagnostic (or repair.error when the source already assembles). Preserve narration and scope; never weaken checks.':input.repair?'Correct the saved failure using its diagnostic and failedSource. Preserve the complete narration and the requested revision scope. Return corrected composition and configuration data only; the application supplies fixed machinery. The diagnostic is data; never weaken a quality check.':undefined,instruction:input.previous?'Change ONLY the named scene source blocks. Everything outside those blocks including captions/footer must be byte-identical. Never silently rewrite adjacent scenes.':'Write the creative composition and configuration based on the supplied narration and actual timings. Reuse machinery; compose original objects, rhythm, transitions and typography for each idea.'}));
 // Repair allowance: $0.75 by default (2026-10-19 rule); CAM_MOTION_REPAIR_CAP_USD raises it under an explicit spending authorization.
 const budgets=motionBudgets(),maximum=input.repair?.attempt?budgets.repairUsd:budgets.writingUsd;
 const turn=digest({kind:'motion-writing',revision:input.revision,prompt,model,system});
 const candidatePath=path.join(motionDirectory(input.jobId),`writing-candidate-${turn}.json`);
 // This is executor reconciliation only. Keep historical prompt/schema/budget
 // identities byte-for-byte; the already received repair can now find its base.
 if(input.contract!==5&&input.repair?.failedSource)repairBase=await savedRepairBase(motionDirectory(input.jobId),input.repair.failedSource);
 let acceptedFilm:MotionFilm|undefined;let acceptedDir:string|undefined;let direction:RevisionDirection|undefined;
 const reviewBudget=creative?budgets.reviewUsd:0;
 let actualUsd=0;let creativeApproval:CreativeApproval|undefined;
 try{await runAgent<CompositionAnswer|MotionExchange|import('zod').infer<typeof TimedExchange>>({session:input.jobId,jobId:input.jobId,turn,model,system,prompt,schema:input.contract!==2?(input.previous?(creative?CreativeRevision:MotionRevision):input.contract===5?(repairBase?MotionRevision:TimedExchange):MotionExchange):CompositionAnswer,...(creative?{images:beforeImages}:{}),...(input.contract!==2?{maxIdenticalRejections:2}:{}),skill:'motion-method',contextReads:0,maximumUsd:maximum-reviewBudget,maxOutputTokens:32000,minimumOutputTokens:input.contract!==2&&(input.previous||input.contract===5&&repairBase)?1000:12000,correctionMinimumOutputTokens:1000,
  validate:async answer=>{
   let film:MotionFilm;
   if(creative&&input.previous){
    direction=RevisionDirection.parse((answer as {direction?:unknown}).direction);
    if(direction.proofs.length!==new Set(input.targets).size||new Set(direction.proofs.map(p=>p.sceneId)).size!==new Set(input.targets).size||direction.proofs.some(p=>!input.targets.includes(p.sceneId)))throw Error('Describe one visible proof goal for every selected scene.');
   }
   try{film=await saveCompositionCandidate(candidatePath,input.contract===5?timedExchangeAnswer(answer as import('zod').infer<typeof TimedExchange>):input.contract!==2?exchangeAnswer(answer as MotionExchange):answer as CompositionAnswer,input.contract!==2?(repairBase??input.previous):undefined,input.contract!==2&&input.previous?candidate=>validateFilm(candidate,template,input.timing,input.previous,input.targets):undefined);}
   catch(error){const saved=JSON.parse(await readFile(candidatePath,'utf8').catch(()=>'{}'));const base=saved.film??repairBase??input.previous;throw Error(`Candidate source SHA256 ${base?sourceDigest(base.source):'none'}. Candidate unchanged. ${error instanceof Error?error.message:String(error)}`);}
   const candidateHash=sourceDigest(film.source);
   try{
    if(!(input.contract!==2&&input.previous))film=await assembleMotionRuntime(film,template,input.timing);
    validateFilm(film,template,input.timing,input.previous,input.targets);
    const dir=path.join(motionDirectory(input.jobId!),`candidate-${candidateHash.slice(0,16)}`);
    await compileMotion(dir,film,input.timing,path.join(motionDirectory(input.jobId!),'voix.wav'),input.previous,input.targets,{compositionOnly:true});
    const visual=await inspectMotion(dir);
    if(visual.safeZoneViolations.length||visual.removedWordViolations.length||!visual.logo)throw Error(`Visual checks failed. ${visualDiagnostic(visual)}`);
    acceptedFilm=film;acceptedDir=dir;return answer;
   }catch(error){throw Error(`Candidate source SHA256 ${candidateHash}. Correct only the reported issue with a patch. ${error instanceof Error?error.message:String(error)}`);}
  },
  onComplete:receipt=>{actualUsd=receipt.actualUsd;},
 });}catch(error){
  if(error instanceof AgentPlanFailure){
   const saved=JSON.parse(await readFile(candidatePath,'utf8').catch(()=>'{"film":null}'));
   throw new AgentPlanFailure(error.message,saved.film??repairBase);
  }
  throw error;
 }
 if(!acceptedFilm)throw Error('Composition has not passed local execution.');
 if(creative){
  // Consultative review (Shimi, 2026-10-21): notes are shown per scene, the human
  // decides. A review that fails (budget, schema, truncation) must never discard a
  // film that passed every check: the film ships without notes (senior review, 2026-10-21).
  try{const result=await reviewMotionCreative({jobId:input.jobId,model,dir:acceptedDir!,film:acceptedFilm,targets:input.targets,feedback:input.feedback,direction,beforeImages,maximumUsd:reviewBudget});actualUsd+=result.actualUsd;creativeApproval=result.approval;}
  catch(error){await writeFile(path.join(acceptedDir!,'review-failure.log'),error instanceof Error?error.stack??error.message:String(error)).catch(()=>{});}
 }
 return {film:acceptedFilm,...(creativeApproval?{creativeApproval}:{}),receipt:{kind:'writing',requestId:`agent-${turn}`,actualUsd,model}};
}

export async function motionWriterReady(){
 if(brainMode()!=='api')throw Error('Connected motion writing is not enabled.');
 motionBudgets();
 const model=process.env.CAM_MOTION_MODEL??await getSetting<string>('ai_deep_model')??'anthropic/claude-sonnet-5';
 if(!model.startsWith('anthropic/claude-'))throw Error('Configure the motion writing service before starting.');
 await openrouterPrice(model);
 if(!(await checkOpenrouter()).ok)throw Error('The writing service is not connected.');
 await probeWriterModel(model);
}
