/** Motion writer as an agent with tools (Shimi, 2026-10-21: "the software is a
 * wrapper; Claude makes the film exactly as it would in Claude Code").
 *
 * The model works on ONE file, build.py, the same file a human author edits:
 * the application prelude (locked), the scene composition (the model's), the
 * subtitle footer (locked, generated from the narration) and a small data block
 * (VIS, MARKS, DUR: the model's). It writes, runs the real sandbox build, reads
 * the same diagnostics a human would, fixes, and submits only a film whose last
 * build passed. No patches against hashed candidates, no second representation,
 * no repair supervisor: one bounded turn with a dollar cap and a step cap.
 *
 * Reused as is: the sandbox build and audits (worker.ts), the film validator
 * (model.ts), the per-step ledger and prompt cache (transport.ts), the turn
 * persistence (runtime.ts), the consultative review (creative-review.ts). */
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {runAgent,AgentPlanFailure,type AgentCustomTool} from '../agent/runtime';
import {digest as objectDigest} from '../agent/store';
import {canonicalRecovery} from '../agent/recovery-supervisor';
import {getSetting} from '../settings';
import {motionBudgets} from './budgets';
import {creativeSheets,reviewMotionCreative,type CreativeApproval} from './creative-review';
import {preludeHelperNames} from './diagnostic';
import {Film,Timing,assertChecks,digest,validateFilm,type Checks,type MotionFilm,type MotionTiming,type Receipt} from './model';
import {motionDirectory} from './store';
import {internalAuthoringLimit} from './recovery';
import {compileMotion,inspectMotion,motionSound} from './worker';
import type {WriterInput} from './writer';

export const MARKER='# ============================================================ A';
export const BOUNDARY='# ------------------------------------------------------------ sous-titres';
const DATA_START='# ============================================================ DATA (yours: VIS, MARKS; DUR is the line near the top)';
const DATA_END='# ============================================================ END DATA';

/** Build the dependencies are injectable for tests: the real ones run Python, Chromium and ffmpeg in the sandbox. */
export const agentWriterDependencies={
 build:async(dir:string,film:MotionFilm,timing:MotionTiming,voice:string,previous?:MotionFilm,targets:string[]=[]):Promise<{checks:Checks;audit:{duration:number;scenes:{id:string;start:number;end:number|null}[]}}>=>{
  const compiled=await compileMotion(dir,film,timing,voice,previous,targets);
  const browser=await inspectMotion(dir),sound=await motionSound(dir);
  return {checks:{holds:compiled.audit.holds,offsets:compiled.audit.offsets,...browser,...sound},audit:compiled.audit};
 },
 review:reviewMotionCreative,
 sheets:creativeSheets,
};

/** Words of each phrase, by time: the subtitle groups are built from the
 * recognised words themselves, so the footer's exact matcher always finds them. */
export function phraseWords(timing:MotionTiming){
 return timing.phrases.map((p,i)=>{const next=timing.phrases[i+1]?.start??Infinity;const indexes:number[]=[];timing.words.forEach((w,k)=>{if(w.start>=p.start-.011&&w.start<next-.011)indexes.push(k);});return {phrase:p.phrase,indexes};});
}
function subtitleGroups(timing:MotionTiming){
 const groups:string[]=[];
 for(const {indexes} of phraseWords(timing)){
  let current:string[]=[];
  for(const k of indexes){const word=timing.words[k].word;current.push(word);if(current.length>=6||/[,;:.!?]$/.test(word)&&current.length>=3){groups.push(current.join(' '));current=[];}}
  if(current.length){if(current.length<=2&&groups.length&&groups.at(-1)!.split(' ').length<=5)groups[groups.length-1]+=' '+current.join(' ');else groups.push(current.join(' '));}
 }
 return groups;
}
const py=(s:string)=>JSON.stringify(s).replace(/\\u2019/g,'’');
/** The starting file of a new film: template prelude, empty scene area, generated subtitles and placeholder data. */
export function startingSource(template:string,timing:MotionTiming){
 const prefix=template.slice(0,template.indexOf(MARKER)).replace(/^DUR = .+$/m,`DUR = ${(Math.ceil(timing.duration)+6).toFixed(1)}`);
 const body=`${MARKER} · first scene: replace this comment with your scenes, one scene() per narration phrase, in order, ending with the brand ending\n\n`;
 let footer=template.slice(template.indexOf(BOUNDARY));
 const subs='SUBS = [\n'+subtitleGroups(timing).map(g=>`    (${py(g)}, 1340),`).join('\n')+'\n]\n';
 footer=footer.replace(/SUBS = \[[\s\S]*?\n\]\n/,subs);
 const visStart=footer.indexOf('VIS = {'),visEnd=footer.indexOf('\nprint("phrase',visStart);
 if(visStart<0||visEnd<0)throw Error('The motion template footer has changed; the agent writer needs its VIS report.');
 const vis='VIS = {'+phraseWords(timing).map(({phrase,indexes})=>`${phrase}: ws(${indexes[0]??0})`).join(', ')+'}';
 footer=footer.slice(0,visStart)+`${DATA_START}\n${vis}\nMARKS = {"sober": [0.0, 0.0], "logo_impact": 0.0}\n${DATA_END}`+footer.slice(visEnd);
 const dumpStart=footer.indexOf('json.dump({"transitions"'),dumpEnd=footer.indexOf('ensure_ascii=False)\n',dumpStart);
 if(dumpStart<0||dumpEnd<0)throw Error('The motion template footer has changed; the agent writer needs its marks export.');
 const last='list(SC)[-1]';
 footer=footer.slice(0,dumpStart)+`json.dump({"transitions": [{"t": round(t, 3), "d": d, "technique": l, "de": a, "vers": b} for (t, d, l, a, b) in sorted(TR)], "plot": SC[${last}][0], "q_final": LOGO_NET - 1.0, "logo_net": LOGO_NET, "dur": DUR, **MARKS}, open(P / "marks.json", "w"), indent=1, ensure_ascii=False)\n`+footer.slice(dumpEnd+'ensure_ascii=False)\n'.length);
 return prefix+body+footer;
}
/** For a late phrase, show how its arrival is computed: the VIS entry, then the
 * definition line of every name it uses, two levels deep. The writer then edits
 * the right anchor (a transition floor, a previous scene's last event) instead of
 * unrelated animations (three attempts on 2026-10-21 left the same five phrases late). */
export function explainArrivals(source:string,phrases:number[]){
 const lines=source.split('\n');const vis=lines.findIndex(l=>/^VIS = /.test(l));if(vis<0)return '';
 const entries=new Map<number,string>();for(const m of lines[vis].slice(lines[vis].indexOf('{')+1).matchAll(/(\d+):\s*([^,}]+(?:\([^)]*\)[^,}]*)*)/g))entries.set(Number(m[1]),m[2].trim());
 const define=(name:string)=>{const i=lines.findIndex(l=>new RegExp(`^${name} = `).test(l));return i<0?null:{line:i+1,text:lines[i].trim()};};
 const names=(expr:string)=>[...new Set([...expr.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)].map(m=>m[1]).filter(n=>!['ws','we','max','min','round','sorted'].includes(n)))];
 const out:string[]=[];
 for(const phrase of phrases){const expr=entries.get(phrase);if(!expr)continue;const chain:string[]=[`VIS ${phrase} = ${expr}`];const seen=new Set<string>();
  const walk=(e:string,depth:number)=>{if(depth>3)return;for(const n of names(e)){if(seen.has(n))continue;seen.add(n);const d=define(n);if(d){chain.push(`${d.text} (line ${d.line})`);walk(d.text.slice(d.text.indexOf('=')+1),depth+1);}}};
  walk(expr,1);out.push(chain.join(' ; '));}
 return out.length?` How each late arrival is computed (edit the anchor that makes it late, usually a transition time or the end of the previous scene's last event): ${out.join(' | ')}`:'';
}
export function sceneIds(source:string){
 const body=source.slice(source.indexOf(MARKER),source.indexOf(BOUNDARY));
 return [...body.matchAll(/^[ \t]*scene\([ \t]*(["'])(s[A-Za-z0-9]+)\1[ \t]*,/gm)].map(m=>m[2]);
}
const normalizeDur=(s:string)=>s.replace(/^DUR = .+$/m,'DUR = <duration>');
const lockedFooter=(s:string)=>s.slice(s.indexOf(BOUNDARY)).split('\n').filter(l=>!/^(VIS|MARKS) = /.test(l)).join('\n');
type WorkingState={source:string;referenceChoice?:string;removedWords:MotionFilm['removedWords'];builds:number;lastBuild?:{hash:string;ok:boolean;dir:string;report:string}};

export async function writeMotionAgent(input:WriterInput):Promise<{film:MotionFilm;receipt:Receipt;creativeApproval?:CreativeApproval}>{
 const timing=Timing.parse(input.timing);
 if(!input.jobId)throw Error('Motion writing requires a saved video session.');
 const jobId=input.jobId;
 const model=process.env.CAM_MOTION_MODEL??await getSetting<string>('ai_deep_model')??'anthropic/claude-sonnet-5';
 if(!model.startsWith('anthropic/claude-'))throw Error('Configure Claude supervision before continuing.');
 const template=await readFile(path.resolve('motion/template/build.py'),'utf8');
 const method=(await readFile(path.resolve('motion/METHOD-fr.md'),'utf8')).split(/\n## Le déroulé/)[0];
 const helpers=preludeHelperNames(template);
 const revision=Boolean(input.previous);
 const seed=input.repair?.failedFilm?.source??input.previous?.source??startingSource(template,timing);
 const budgets=motionBudgets(),reviewBudget=budgets.reviewUsd,maximum=(input.repair?.attempt?budgets.repairUsd:budgets.writingUsd)-reviewBudget;
 const phrases=timing.phrases.map(p=>({phrase:p.phrase,text:p.text,start:Number(p.start.toFixed(2)),end:Number(p.end.toFixed(2))}));
 const words=timing.words.map((w,i)=>`${i}:${w.word}@${w.start.toFixed(2)}`).join(' ');
 const system=`You author a typographic motion-design film in Python, exactly as a motion designer would in an editor, by editing ONE file: build.py.
LOCKED: everything before the line starting with "${MARKER}" (the prelude: colours, typography, helpers ${helpers.join(', ')}; only the "DUR = <seconds>" line may change, through set_data) and everything after the line starting with "${BOUNDARY}" except the two data lines VIS = {...} and MARKS = {...} between the DATA markers.
YOURS: the scene area between those two lines (one scene() block per narration phrase, in order, ending with the brand ending that defines LOGO_NET) and the data lines. Never define functions or classes, never import, never reassign P, T, WD, EV, TR, SC.
DATA: VIS maps every phrase ID to the real arrival time expression of that phrase's first visual (a name you defined, ws(i) for a word attack, or max(...) of those), never a scene ID or a string. MARKS = {"sober": [start, end] of the single calm passage, "logo_impact": time the logo lands, optional "strike", "counter", "terrible" when the composition really has them}. DUR must exceed the recording length and leave 2.2 s after LOGO_NET.
TOOLS: read_file shows numbered lines; append_scene adds ONE scene() block at the end of the scene area (use it for every scene, one call each: answers must stay short); replace_scene rewrites one existing scene block by its ID; write_scenes replaces the whole scene area (only for a short area); edit replaces one exact occurrence; set_data sets VIS, MARKS, DUR and the removed words; run_build runs the real build, the browser audit and the sound mix, and returns the exact failures (holds, voice offsets, safe zone, removed words, sound, logo) or a pass report; submit_plan is accepted only after run_build passed on the current file. Work like this: append the scenes one by one (never more than one scene per answer), set the data, run_build, fix precisely what it reports with edit or replace_scene, run again, submit. Keep every answer short: the file is the work, and an answer that exceeds the output limit is discarded.
${revision?`REVISION: the file is the previous version. Change only the scenes listed in currentRequest.targets to satisfy the feedback; the result must differ visibly. VIS and MARKS may be retimed.`:'NEW FILM: the scene area holds a single comment; replace it with the complete composition.'}
AUTHORITATIVE METHOD (the deliverable rules; its workflow section is replaced by the tools above):
${method}
WORKED REFERENCE (same prelude and helpers; its scene area shows the expected craft):
${template}`;
 const prompt=JSON.stringify(canonicalRecovery({kind:'motion-agent',revision:input.revision,script:input.script,phrases,words,recordingDuration:timing.duration,targets:input.targets,feedback:input.feedback,...(input.previous?{previousSourceSha256:digest(input.previous.source)}:{}),seedSha256:digest(seed),...(input.repair?{resumption:{attempt:input.repair.attempt,previousStop:input.repair.error.slice(0,1500),note:'The file is the saved state of the previous attempt. Read it, run_build, continue.'}}:{})}));
 // The turn name carries everything the runtime's identity carries: a changed cap or reasoning limit starts a new turn from the saved file instead of colliding with the old one (live stop 2026-10-21: "This agent turn belongs to different inputs").
 const reasoningMaxTokens=Number(process.env.CAM_MOTION_REASONING_TOKENS??6000),maxSteps=Number(process.env.CAM_MOTION_AGENT_STEPS??40);
 const turn=objectDigest({kind:'motion-agent',revision:input.revision,prompt,model,system,maximum,reasoningMaxTokens,maxSteps});
 const dir=path.join(motionDirectory(jobId),`agent-${turn.slice(0,16)}`);await mkdir(dir,{recursive:true});
 const stateFile=path.join(dir,'state.json');
 let state:WorkingState;
 try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch{state={source:seed,removedWords:input.repair?.failedFilm?.removedWords??input.previous?.removedWords??[],referenceChoice:input.repair?.failedFilm?.referenceChoice??input.previous?.referenceChoice,builds:0};}
 const save=async()=>{await writeFile(path.join(dir,'build.py'),state.source);await writeFile(stateFile+'.tmp',JSON.stringify(state));await rename(stateFile+'.tmp',stateFile);};
 await save();
 const lockedPrefix=normalizeDur(seed.slice(0,seed.indexOf(MARKER))),lockedTail=lockedFooter(seed);
 const guard=(next:string)=>{
  if(!next.includes(MARKER)||!next.includes(BOUNDARY))return 'The two application-owned marker lines must stay.';
  if(normalizeDur(next.slice(0,next.indexOf(MARKER)))!==lockedPrefix)return 'The prelude is locked; only the DUR line may change (use set_data).';
  if(lockedFooter(next)!==lockedTail)return 'The footer after the subtitle boundary is locked except the VIS and MARKS lines (use set_data).';
  return null;
 };
 // Narrative scenes are the first one per phrase; a trailing brand-ending scene() is not a narration scene.
 const narrativeIds=()=>sceneIds(state.source).slice(0,timing.phrases.length);
 const currentFilm=(scenes?:MotionFilm['scenes']):MotionFilm=>{
  const ids=narrativeIds();
  // In a revision, untargeted scenes keep their saved description: the validator compares them with the previous film.
  const known=new Map((input.previous?.scenes??[]).map(sc=>[sc.id,sc]));
  return {source:state.source,referenceChoice:state.referenceChoice??'Validated method, reference film of 5 October',scenes:scenes??ids.map((id,i)=>known.get(id)??({id,phrase:timing.phrases[i]?.phrase??i+1,movement:'pending',meaning:'pending'})),removedWords:state.removedWords};
 };
 const voice=path.join(motionDirectory(jobId),'voix.wav');
 const tools:AgentCustomTool[]=[
  {definition:{type:'function',function:{name:'read_file',description:'Show build.py with line numbers. Up to 300 lines per call.',parameters:{type:'object',properties:{start:{type:'integer',minimum:1},end:{type:'integer',minimum:1}},additionalProperties:false}}},
   run:async args=>{const {start=1,end}=z.object({start:z.number().int().min(1).optional(),end:z.number().int().min(1).optional()}).parse(args);const lines=state.source.split('\n');const last=Math.min(lines.length,end??start+299,start+299);return {lines:lines.slice(start-1,last).map((l,i)=>`${start+i}: ${l}`).join('\n'),total:lines.length};}},
  {definition:{type:'function',function:{name:'write_scenes',description:'Replace the whole scene area (from the "A" marker line up to the subtitle boundary) with your composition. Start with the marker line.',parameters:{type:'object',properties:{body:{type:'string'}},required:['body'],additionalProperties:false}}},
   run:async args=>{let {body}=z.object({body:z.string().min(200)}).parse(args);if(!body.startsWith(MARKER))body=`${MARKER} · composition\n${body}`;if(!body.endsWith('\n'))body+='\n';if(!/^[ \t]*scene\(/m.test(body))return {accepted:false,error:'The scene area must contain scene() blocks.'};const next=state.source.slice(0,state.source.indexOf(MARKER))+body+state.source.slice(state.source.indexOf(BOUNDARY));const problem=guard(next);if(problem)return {accepted:false,error:problem};state.source=next;await save();return {accepted:true,scenes:sceneIds(next),phrases:timing.phrases.length};}},
  {definition:{type:'function',function:{name:'append_scene',description:'Append ONE scene() block (its header comment, scene() call, elements, events, exit transition) at the end of the scene area, before the subtitle boundary. One scene per call.',parameters:{type:'object',properties:{body:{type:'string'}},required:['body'],additionalProperties:false}}},
   run:async args=>{let {body}=z.object({body:z.string().min(40)}).parse(args);if(!body.endsWith('\n'))body+='\n';const calls=[...body.matchAll(/^[ \t]*scene\(/gm)].length;if(calls!==1)return {accepted:false,error:calls===0?'The block must contain exactly one scene() call.':'One scene per call: split this block.'};const start=state.source.indexOf(MARKER),end=state.source.indexOf(BOUNDARY);let area=state.source.slice(start,end);if(/^[ \t]*scene\(/m.test(area)===false)area=`${MARKER} · composition\n`;if(area.includes(body))return {accepted:true,note:'already appended'};const next=state.source.slice(0,start)+area+body+'\n'+state.source.slice(end);const problem=guard(next);if(problem)return {accepted:false,error:problem};state.source=next;await save();return {accepted:true,scenes:sceneIds(next),phrases:timing.phrases.length};}},
  {definition:{type:'function',function:{name:'replace_scene',description:'Replace one existing scene block (from its scene() call to the line before the next scene() call or the subtitle boundary) by a new block for the same ID.',parameters:{type:'object',properties:{id:{type:'string'},body:{type:'string'}},required:['id','body'],additionalProperties:false}}},
   run:async args=>{const parsed=z.object({id:z.string().regex(/^s[A-Za-z0-9]+$/),body:z.string().min(40)}).parse(args);const id=parsed.id;let body=parsed.body;if(!body.endsWith('\n'))body+='\n';const start=state.source.indexOf(MARKER),end=state.source.indexOf(BOUNDARY);const area=state.source.slice(start,end);const heads=[...area.matchAll(/^[ \t]*scene\([ \t]*(["'])(s[A-Za-z0-9]+)\1[ \t]*,/gm)];const k=heads.findIndex(m=>m[2]===id);if(k<0)return {accepted:false,error:`No scene ${id}; existing: ${heads.map(m=>m[2]).join(', ')}.`};const from=area.lastIndexOf('\n',heads[k].index!)+1,to=k+1<heads.length?area.lastIndexOf('\n',heads[k+1].index!)+1:area.length;const replaced=area.slice(0,from)+body+area.slice(to);const next=state.source.slice(0,start)+replaced+state.source.slice(end);if(!sceneIds(next).includes(id))return {accepted:false,error:`The new block must still define scene("${id}", ...).`};const problem=guard(next);if(problem)return {accepted:false,error:problem};state.source=next;await save();return {accepted:true,scenes:sceneIds(next)};}},
  {definition:{type:'function',function:{name:'edit',description:'Replace one exact occurrence of old with new anywhere in your areas.',parameters:{type:'object',properties:{old:{type:'string'},new:{type:'string'}},required:['old','new'],additionalProperties:false}}},
   run:async args=>{const {old,new:replacement}=z.object({old:z.string().min(1),new:z.string()}).parse(args);const count=state.source.split(old).length-1;if(count===0&&replacement&&state.source.split(replacement).length-1===1)return {accepted:true,note:'already applied'};if(count!==1)return {accepted:false,error:count===0?'old matches nothing; read_file and copy the exact text.':`old matches ${count} times; include more context.`};const next=state.source.replace(old,()=>replacement);const problem=guard(next);if(problem)return {accepted:false,error:problem};state.source=next;await save();return {accepted:true};}},
  {definition:{type:'function',function:{name:'set_data',description:'Set the data lines: VIS and MARKS as Python dict literals, DUR in seconds, removedWords as [{selector:"#id", at:seconds}] for words that must be fully invisible from that time.',parameters:{type:'object',properties:{VIS:{type:'string'},MARKS:{type:'string'},DUR:{type:'number'},removedWords:{type:'array',items:{type:'object',properties:{selector:{type:'string'},at:{type:'number'}},required:['selector','at'],additionalProperties:false}}},additionalProperties:false}}},
   run:async args=>{const v=z.object({VIS:z.string().regex(/^\{[\s\S]*\}$/).optional(),MARKS:z.string().regex(/^\{[\s\S]*\}$/).optional(),DUR:z.number().positive().max(180).optional(),removedWords:Film.shape.removedWords.optional()}).parse(args);let next=state.source;const line=(name:string,value:string)=>{const re=new RegExp(`^${name} = .*$`,'m');if(!re.test(next))throw Error(`No ${name} line in this file; use edit.`);next=next.replace(re,()=>`${name} = ${value.replace(/\n/g,' ')}`);};try{if(v.VIS)line('VIS',v.VIS);if(v.MARKS)line('MARKS',v.MARKS);if(v.DUR!==undefined)line('DUR',String(v.DUR));}catch(error){return {accepted:false,error:error instanceof Error?error.message:String(error)};}const problem=guard(next);if(problem)return {accepted:false,error:problem};state.source=next;if(v.removedWords)state.removedWords=v.removedWords;await save();return {accepted:true};}},
  {definition:{type:'function',function:{name:'run_build',description:'Run the real build, the browser audit and the sound mix on the current file. Returns the exact failures to fix, or the pass report.',parameters:{type:'object',properties:{},additionalProperties:false}}},
   run:async()=>{
    const hash=digest(state.source);
    if(state.lastBuild?.hash===hash)return {ok:state.lastBuild.ok,report:state.lastBuild.report,note:'unchanged file, same result'};
    if(/MARKS = \{"sober": \[0\.0, 0\.0\], "logo_impact": 0\.0\}/.test(state.source))return {ok:false,report:'MARKS still holds the placeholder: set sober [start, end] and logo_impact with set_data.'};
    state.builds++;const buildDir=path.join(dir,`build-${hash.slice(0,12)}`);let ok=false,report='';
    try{
     const film=Film.parse(currentFilm());
     const result=await agentWriterDependencies.build(buildDir,film,timing,voice,input.previous,input.targets);
     try{assertChecks(result.checks);ok=true;report=`PASS. Duration ${result.audit.duration} s, ${result.audit.scenes.length} scenes, holds 0, offsets ${JSON.stringify(result.checks.offsets.map(n=>Number(n.toFixed(2))))}, mix ${result.checks.mixLufs.toFixed(1)} LUFS, sfx ${result.checks.sfxBelowVoiceDb.toFixed(1)} dB below voice, logo ${result.checks.logo}.`;}
     catch(error){report=`${error instanceof Error?error.message:String(error)}${explainArrivals(state.source,result.checks.offsets.map((n,i)=>({n,p:timing.phrases[i]?.phrase})).filter(o=>!Number.isFinite(o.n)||Math.abs(o.n)>=.3).map(o=>o.p).filter((p):p is number=>typeof p==='number'))} Details: safe zone ${JSON.stringify(result.checks.safeZoneViolations.slice(0,8))}; removed words ${JSON.stringify(result.checks.removedWordViolations.slice(0,8))}; offsets ${JSON.stringify(result.checks.offsets.map(n=>Number(n.toFixed(2))))}; holds ${result.checks.holds}; mix ${result.checks.mixLufs} LUFS; sfx ${result.checks.sfxBelowVoiceDb} dB below voice; logo ${result.checks.logo}.`;}
    }catch(error){const message=error instanceof Error?error.message:String(error);const late=[...message.matchAll(/phrase (\d+) lands at/g)].map(m=>Number(m[1]));report=(message+(late.length?explainArrivals(state.source,late):'')).slice(0,7000);}
    state.lastBuild={hash,ok,dir:buildDir,report};await save();
    return {ok,report};
   }},
 ];
 const Finish=z.object({referenceChoice:z.string().min(1).max(1000),scenes:z.array(z.object({id:z.string().regex(/^s[A-Za-z0-9]+$/),phrase:z.number().int().positive(),movement:z.string().min(1).max(800),meaning:z.string().min(1).max(800)}).strict()).min(1).max(30)}).strict();
 let accepted:MotionFilm|undefined,acceptedDir:string|undefined,actualUsd=0;
 try{
  await runAgent({session:jobId,jobId,turn,model,system,prompt,schema:Finish,skill:'motion-method',contextReads:0,freeTools:true,maxSteps,tools,maximumUsd:maximum,maxOutputTokens:Number(process.env.CAM_MOTION_STEP_OUTPUT_TOKENS??12000),minimumOutputTokens:1000,reasoningMaxTokens,
   validate:async plan=>{
    const hash=digest(state.source);
    if(!state.lastBuild||state.lastBuild.hash!==hash||!state.lastBuild.ok)throw Error(state.lastBuild?.hash===hash?`The last run_build failed on this file: ${state.lastBuild.report.slice(0,1500)}`:'Run run_build on the current file and make it pass before submitting.');
    const ids=narrativeIds();
    if(plan.scenes.length!==ids.length||plan.scenes.some((s,i)=>s.id!==ids[i]))throw Error(`scenes must list the file's narration scene() blocks in order (one per phrase, the brand ending excluded): ${ids.join(', ')}.`);
    state.referenceChoice=plan.referenceChoice;
    const film=Film.parse(currentFilm(plan.scenes));
    validateFilm(film,template,timing,input.previous,input.targets);
    await mkdir(state.lastBuild.dir,{recursive:true});await writeFile(path.join(state.lastBuild.dir,'film.json'),JSON.stringify(film));
    accepted=film;acceptedDir=state.lastBuild.dir;await save();return plan;
   },
   onComplete:receipt=>{actualUsd=receipt.actualUsd;},
  });
 }catch(error){
  // The saved working file is the candidate: a later attempt resumes from it. An allowance stop
  // (ledger bound or step limit) is such a stop too, not an unknown failure.
  const message=error instanceof Error?error.message:String(error);
  if(error instanceof AgentPlanFailure||internalAuthoringLimit(message))throw new AgentPlanFailure(message,Film.safeParse(currentFilm()).success?currentFilm():undefined);
  throw error;
 }
 if(!accepted||!acceptedDir)throw Error('Composition has not passed local execution.');
 let creativeApproval:CreativeApproval|undefined;
 try{
  let beforeImages:Buffer[]=[];
  if(input.previous){const beforeDir=path.join(motionDirectory(jobId),`creative-before-${digest(input.previous.source).slice(0,16)}`);try{beforeImages=await agentWriterDependencies.sheets(beforeDir,input.previous,input.targets,'BEFORE');}catch{beforeImages=[];}}
  const result=await agentWriterDependencies.review({jobId,model,dir:acceptedDir,film:accepted,targets:input.targets,feedback:input.feedback,beforeImages,maximumUsd:reviewBudget});
  actualUsd+=result.actualUsd;creativeApproval=result.approval;
 }catch(error){await writeFile(path.join(acceptedDir,'review-failure.log'),error instanceof Error?error.stack??error.message:String(error)).catch(()=>{});}
 return {film:accepted,...(creativeApproval?{creativeApproval}:{}),receipt:{kind:'writing',requestId:`agent-${turn}`,actualUsd,model}};
}
