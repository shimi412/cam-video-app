/** Two-route rehearsal with generated calibration cards and local voice only. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,readFile,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {pool} from "../src/db";
import {resolveParams} from "../src/lib/brain";
import {getRecipe} from "../src/lib/recipes";
import {planConcept} from "../src/lib/concept/storyboard";
import {localNarration} from "../src/lib/concept/local-voice";
import {productionFixture} from "../src/lib/concept/production-rehearsal";
import {advanceProductionFlow,renderProductionFlow} from "../src/lib/concept/production-flow";
import {requestReceipts} from "../src/lib/concept/request-journal";
import {KLING_PRO} from "../src/lib/concept/model-selection";
const textOnly=process.env.CAM_TEST_TEXT_ONLY==="1";
process.env.PROVIDER_MODE="dryrun";process.env.BRAIN_MODE="mock";
let network=0;globalThis.fetch=async()=>{network++;throw new Error("Network forbidden");};
const id=randomUUID(),directory=path.join(process.cwd(),"storage/qa",`whimsical-${id}`),assertOwned=async()=>{};
async function main(){try{
 const script="Check the source. Read the full passage.", {params}=resolveParams(script,"auto",{aspectRatio:"16:9"});
 params.productionMethod="whimsical-v1";
 params.sceneDirections={
  1:{scene:"The clay guide points at a small open book.",motion:"One gentle pointing gesture.",references:["narrator"],endScene:null,overlay:null,strike:false,visualMode:"metaphor",actionSeconds:3},
  2:{scene:"The clay guide beside a clear title area.",motion:"The words appear above the guide.",references:["narrator"],endScene:null,overlay:"Read the full passage.",strike:false,visualMode:"presenter-text",actionSeconds:3},
 };
 if(textOnly)params.sceneDirections[2].visualMode="metaphor";
 const recipe=getRecipe(params.templateSlug)!,board=planConcept(script,recipe,params.aspectRatio);
 await mkdir(path.join(directory,"assets"),{recursive:true});
 const timing=await localNarration(directory,board.shots.map(s=>s.narration),"local-en");
 const fixture=await productionFixture({jobId:id,directory,script,params,recipe,timing,voiceFile:path.join(directory,"assets/narration.wav"),assertOwned});
 fixture.services.reviewPolicy="storyboard-first";fixture.services.videoWorkflow="whimsical";fixture.services.videoModels={"scene-1-clip":KLING_PRO,...(textOnly?{"scene-2-clip":KLING_PRO}:{})};
 const advance=()=>advanceProductionFlow(fixture.flow);
 let state=await advance();assert.equal(state.review?.stage,"script");await fixture.decide(state.review!);
 state=await advance();assert.equal(state.review?.stage,"storyboard");
 if(textOnly){fixture.services.storyboardEdits={2:{textOnly:true,visualMode:"presenter-text",overlay:"Read the full passage.",graphicLayers:[]}};state=await advance();assert.equal(state.review?.stage,"storyboard");assert.equal(state.review!.storyboard![1].textOnly,true);}
 await fixture.decide(state.review!);
 state=await advance();assert.equal(state.review?.stage,"draft-film");
 const receipts=await requestReceipts(path.join(directory,"requests"));
 assert.equal(receipts.filter(r=>r.binding?.operation.includes("-clip")).length,1);
 assert(!receipts.some(r=>r.binding?.operation.includes("-draft")));
 const initialSubmissions=fixture.stats.submissions;
 if(textOnly){
  fixture.services.completedInputs=Object.fromEntries(receipts.filter(r=>r.state==="complete"&&r.binding).map(r=>[r.binding!.operation,r.binding!.payloadSha256]));
  fixture.services.reuseOnly=true;
  fixture.services.storyboardEdits={...fixture.services.storyboardEdits,1:{overlay:"Check the source.",graphicLayers:[]}};
  state=await advance();assert.equal(state.review?.stage,"storyboard");await fixture.decide(state.review!);
  state=await advance();assert.equal(state.review?.stage,"draft-film");assert.equal(fixture.stats.submissions,initialSubmissions);
  fixture.services.reuseOnly=false;
 }

 fixture.services.completedInputs=Object.fromEntries(receipts.filter(r=>r.state==="complete"&&r.binding).map(r=>[r.binding!.operation,r.binding!.payloadSha256]));
 fixture.services.imageRevisions={"1":{note:"Use a closer camera angle",attempt:1,animationContract:2}};
 fixture.services.imageRetries={"scene-1-start":1,"scene-1-clip":1};
 state=await advance();assert.equal(state.review?.stage,"storyboard");assert.equal(fixture.stats.submissions,initialSubmissions+1);
 await fixture.decide(state.review!);state=await advance();assert.equal(state.review?.stage,"draft-film");assert.equal(fixture.stats.submissions,initialSubmissions+2);
 const revised=await requestReceipts(path.join(directory,"requests"));assert.equal(revised.filter(r=>r.binding?.operation==="scene-2-start").length,1);
 const before=fixture.stats.submissions;await fixture.decide(state.review!);
 state=await advance();assert.equal(state.status,"ready-to-render");assert.equal(fixture.stats.submissions,before);
 assert.equal(Object.keys(state.render!.media).length,2);
 const originalPacket=JSON.stringify(state.render);
 const rendered=await renderProductionFlow(state.render!,path.join(directory,"finishing"),path.join(directory,"checkpoints"),assertOwned,{hideTitles:false,reason:"Offline client settings test",reviewedBy:"fixture",captions:false,musicLevel:"quiet",ending:"last-frame"});
 assert.equal(fixture.stats.submissions,before);assert.equal(JSON.stringify(state.render),originalPacket);
 const cues=JSON.parse(await readFile(path.join(directory,"finishing/cues.json"),"utf8"));assert.equal(cues.captions.length,0);
 const audio=JSON.parse(await readFile(path.join(directory,"finishing/audio-finishing.json"),"utf8"));assert.equal(audio.musicLevel,"quiet");
 assert((await readFile(rendered.output)).length>1000);assert.equal(network,0);
 if(textOnly){const html=await readFile(path.join(directory,"finishing/index.html"),"utf8");assert(!html.includes('src="'+state.render!.media[2].id+'"'));assert(state.render!.board.shots[1].textOnly);assert(html.includes('id="presenter-title-1"'));}
 const proof={textOnly,status:"passed",initialKlingRequests:1,explicitRevisionKlingRequests:1,localTextVideoRequests:0,localFilmCorrectionReusesAllMedia:textOnly,correctionPreservesOtherScene:true,noRegenerationAfterVisualApproval:true,finishingReusesApprovedMedia:true,subtitleSettingApplied:true,musicSettingApplied:true,networkCalls:0,paidCalls:0};
 await writeFile(textOnly?"storage/qa/text-only-film-proof.json":"storage/qa/cam-whimsical-proof.json",JSON.stringify(proof,null,2));console.log(proof);
}finally{await pool.query("DELETE FROM settings WHERE key=$1",[`cam-budget:simulation:rehearsal-${id}`]);await pool.end();await rm(directory,{recursive:true,force:true});await rm(path.join(process.cwd(),"storage/imports",id),{recursive:true,force:true});}}
main().catch(error=>{console.error(error);process.exitCode=1;});
