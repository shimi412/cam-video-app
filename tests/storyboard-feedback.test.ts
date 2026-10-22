import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyStoryboardFeedback, recordSceneComment, applySceneComment, applyGlobalStoryboardComment, combinedStoryboardEdits, mergeStoryboardEdits, assertStoryboardCommentsResolved, applyImageRevisions, localStoryboardChange, revisionRequestsNewCast, revisionRequestsActionChange, storyboardFeedbackScenes } from "../src/lib/concept/storyboard-feedback";
import { applyStoryboardEdits, storyboardReviewContent, type StoryboardPanel } from "../src/lib/concept/storyboard-review";
import { sceneCompositionLayout } from "../src/lib/concept/composition-layout";
import { graphicLayersSvg } from "../src/lib/concept/graphic-layers";
import { planConcept } from "../src/lib/concept/storyboard";
import { getRecipe } from "../src/lib/recipes";
import { placeholderTiming } from "../src/lib/concept/timing";
import { writeMontage } from "../src/lib/concept/montage";
import { generationPlan } from "../src/lib/concept/generation-plan";
import { resolveParams } from "../src/lib/brain";

const script="Check the original source before sharing. Read the full passage before deciding.";
const board=()=>planConcept(script,getRecipe("cam-clay")!,"9:16");
const panel:StoryboardPanel={scene:1,narration:"A Muslim, a Jew, and a Christian walk into a hospital.",meaning:"Three faiths share a hospital",startScene:"Narrator in a hospital",endScene:null,motion:"One welcoming gesture",actionSeconds:4,overlay:null};
const note="Rajoute un symbole musulman, juif et chrétien en motion design autour du personnage.";

it("saves per-scene comments independently, blocks approval until applied or withdrawn",()=>{
 const saved=recordSceneComment(emptyStoryboardFeedback(),1,note,"human");
 expect(saved.comments[1].status).toBe("pending");expect(saved.edits).toEqual({});
 expect(()=>assertStoryboardCommentsResolved(saved)).toThrow(/Resolve/);
 const applied=applySceneComment(saved,panel);
 expect(applied.comments[1].status).toBe("applied");expect(()=>assertStoryboardCommentsResolved(applied)).not.toThrow();
 expect(applied.edits[1].graphicLayers?.map(l=>l.symbol)).toEqual(["crescent","star-of-david","cross"]);
 expect(applied.edits[2]).toBeUndefined();
});
it("does not pretend camera or additional action corrections were applied as symbols",()=>{
 for(const text of ["Change the camera angle and lighting"]){
  expect(localStoryboardChange(text,panel).edit).toBeNull();
  expect(applySceneComment(recordSceneComment(emptyStoryboardFeedback(),1,text,"human"),panel).comments[1].status).toBe("needs-image-revision");
 }
});
it("requires an approved character sheet before requesting a new cast member",()=>{
 expect(revisionRequestsNewCast("Ajoute un médecin à côté du personnage")).toBe(true);
 expect(revisionRequestsNewCast(note)).toBe(false);
 expect(revisionRequestsNewCast("Ajoute deux médecins et un symbole")).toBe(true);
 expect(applySceneComment(recordSceneComment(emptyStoryboardFeedback(),1,"Add a doctor beside the presenter","human"),panel).comments[1].status).toBe("needs-image-revision");
});
it("shares local graphics with montage, changes human review identity but preserves image generation requests",async()=>{
 const current=board(),params=resolveParams(script,"auto").params, timing=placeholderTiming(current.shots.map(s=>s.narration));
 const refs=[{id:"narrator",url:"/sheet.png",sha256:"a".repeat(64),characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-15"}}];
 const before=generationPlan(script,params,current,timing,refs);
 const panels=[{...panel}];const reviewBefore=storyboardReviewContent(structuredClone(panels),"9:16");
 const feedback=applySceneComment(recordSceneComment(emptyStoryboardFeedback(),1,note,"human"),panel);
 applyStoryboardEdits(current,panels,feedback.edits);
 expect(storyboardReviewContent(panels,"9:16")).not.toEqual(reviewBefore);
 const after=generationPlan(script,params,current,timing,refs);
 expect(after.operations.filter(o=>o.kind==="image")).toEqual(before.operations.filter(o=>o.kind==="image"));
 const root=await mkdtemp(path.join(os.tmpdir(),"cam-local-symbols-"));
 try{
  await writeMontage(root,current,timing,"9:16",{}, {brandEnding:false});
  const html=await readFile(path.join(root,"index.html"),"utf8");
  expect(html).toContain(graphicLayersSvg(current.shots[0].graphicLayers!,1080,1920,"graphic-0",Boolean(current.shots[0].overlay)));
  expect(html).toContain('tl.fromTo("#graphic-0-0"');expect(html).toContain('id="graphics-0"');
 }finally{await rm(root,{recursive:true,force:true});}
});
it("binds an image revision only to its selected scene and preserves script and other scenes",()=>{
 const original=board(), revised=structuredClone(original),params=resolveParams(script,"auto").params,timing=placeholderTiming(original.shots.map(s=>s.narration));
 const refs=[{id:"narrator",url:"/sheet.png",sha256:"a".repeat(64),characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-15"}}];
 applyImageRevisions(revised,{1:{note:"Show a low camera angle and cooler light",attempt:1}});
 const before=generationPlan(script,params,original,timing,refs),after=generationPlan(script,params,revised,timing,refs);
 expect(revised.shots[0].imagePrompt).toContain("low camera angle");expect(revised.shots[0].narration).toBe(original.shots[0].narration);
 expect(revised.shots[1]).toEqual(original.shots[1]);
 expect(after.operations.find(o=>o.id==="scene-1-start")?.fingerprint).not.toBe(before.operations.find(o=>o.id==="scene-1-start")?.fingerprint);
 expect(after.operations.find(o=>o.id==="scene-2-start")).toEqual(before.operations.find(o=>o.id==="scene-2-start"));
});
it("escapes symbol labels and supports exact local text updates",()=>{
 expect(graphicLayersSvg([{kind:"symbol",symbol:"cross",position:"top-center",label:"<script>bad</script>"}],1080,1920)).not.toContain("<script>");
 expect(localStoryboardChange('Remplace le texte par «Vivre ensemble»',panel).edit).toEqual({overlay:"Vivre ensemble",visualMode:"metaphor"});
 expect(localStoryboardChange("Supprime le texte",panel).edit).toEqual({overlay:null,visualMode:"metaphor"});
});

it("separates symbol and title regions in portrait, square and landscape compositions",()=>{
 for(const [width,height] of [[1080,1920],[1080,1080],[1920,1080]]){
  const graphics=[{kind:"symbol" as const,symbol:"cross" as const,position:"top-center" as const}];
  const layout=sceneCompositionLayout("A Muslim, a Jew, and a Christian walk into a hospital",graphics,width,height);
  const size=Math.min(width*.17,height*.13);
  expect(height*.08+size*.74).toBeLessThan(height*layout.textTop);
  expect(height*(layout.textTop+layout.textHeight)).toBeLessThan(height*.64-size*.58);
  expect(graphicLayersSvg(graphics,width,height,"preview",true)).toContain(`translate(${width*.5-size/2} ${height*.08-size/2})`);
 }
});

it("handles ordinary English symbol placement locally and blocks unplanned physical action changes",()=>{
 expect(localStoryboardChange("Add Muslim, Jewish and Christian symbols around him",panel).edit?.graphicLayers).toHaveLength(3);
 expect(localStoryboardChange("Add Muslim, Jewish and Christian symbols above his head",panel).edit?.graphicLayers?.every(layer=>layer.position.startsWith("top-"))).toBe(true);
 for(const text of ["Make him unroll a scroll",`${note} Fais danser le personnage.`,"Add Muslim Jewish Christian symbols and make the character dance"]){
  expect(revisionRequestsActionChange(text)).toBe(true);
  expect(applySceneComment(recordSceneComment(emptyStoryboardFeedback(),1,text,"human"),panel).comments[1].status).toBe("needs-action-plan");
 }
 expect(revisionRequestsActionChange("Use a low camera angle and cool lighting")).toBe(false);
});

it("recognizes French and English global clay requests only for editable graphic layers",()=>{
 const panels=[{...panel,graphicLayers:[{kind:"symbol" as const,symbol:"cross" as const,position:"top-center" as const}]}];
 for(const text of ["Toutes les pastilles en pâte à modeler", "Make all floating symbols look like clay."]){
  const feedback=applyGlobalStoryboardComment(emptyStoryboardFeedback(),panels,text,"human");
  expect(feedback.globalComment).toMatchObject({status:"applied",scenes:[1]});
  expect(feedback.globalEdits).toEqual({});expect(feedback.imageRevisions).toEqual({});
 }
 expect(applyGlobalStoryboardComment(emptyStoryboardFeedback(),panels,"Make all floating symbols look like clay and change the background","human").globalComment?.status).toBe("needs-image-revision");
 expect(applyGlobalStoryboardComment(emptyStoryboardFeedback(),[panel],"Toutes les pastilles en pâte à modeler","human").globalComment).toMatchObject({status:"applied",scenes:[1]});
});

it("merges global graphic changes for rendering without overwriting scene-specific corrections",async()=>{
 const current=board(),panels=current.shots.map(shot=>({...panel,scene:shot.index,overlay:shot.overlay}));
 const feedback=applyGlobalStoryboardComment(emptyStoryboardFeedback(),panels,'Change the title to "Context matters"',"human");
 applyStoryboardEdits(current,panels,combinedStoryboardEdits(feedback));
 expect(current.shots.every(shot=>shot.overlay==="Context matters")).toBe(true);
 const local=applySceneComment(recordSceneComment(feedback,1,'Change the title to "Scene one"',"human"),panels[0]);
 const combined=combinedStoryboardEdits(local);expect(combined[1].overlay).toBe("Scene one");expect(combined[2].overlay).toBe("Context matters");
 const conflict=applyGlobalStoryboardComment(local,panels,'Change the title to "New global title"',"human");
 expect(conflict.globalComment?.status).toBe("pending");expect(conflict.comments).toEqual(local.comments);
 expect(()=>assertStoryboardCommentsResolved(conflict)).toThrow(/video-wide/);
 const root=await mkdtemp(path.join(os.tmpdir(),"cam-global-title-"));
 try{
  await writeMontage(root,current,placeholderTiming(current.shots.map(shot=>shot.narration)),"9:16",{}, {brandEnding:false});
  const html=await readFile(path.join(root,"index.html"),"utf8");expect(html.match(/Context matters/g)?.length).toBeGreaterThanOrEqual(2);
 }finally{await rm(root,{recursive:true,force:true});}
});

it("preserves an approved scene revision when applying an additional global image direction",()=>{
 const current=board();
 applyImageRevisions(current,{1:{note:"Use a low camera angle",globalNote:"Use cooler lighting",attempt:2},2:{note:"",globalNote:"Use cooler lighting",attempt:1}});
 expect(current.shots[0].imagePrompt).toContain("Scene-specific visual direction: Use a low camera angle");
 expect(current.shots.every(shot=>shot.imagePrompt.includes("Video-wide visual direction: Use cooler lighting"))).toBe(true);
 expect(current.shots[1].imagePrompt).not.toContain("Use a low camera angle");
});


it("restricts shared feedback to named or selected scenes and rejects conflicting scope",()=>{
 const available=[1,2,3,4,5,6,7,8];
 for(const text of ["Sur les cases 6 et 7 : une balance", "Scenes 6 and 7: show a balance", "Plans 6 à 7 : changer le décor"]){
  expect(storyboardFeedbackScenes(text,available)).toEqual([6,7]);
 }
 expect(storyboardFeedbackScenes("Scenes 2 through 4: cooler lighting",available)).toEqual([2,3,4]);
 expect(storyboardFeedbackScenes("Scenes 2 through 4, and 6: cooler lighting",available)).toEqual([2,3,4,6]);
 expect(storyboardFeedbackScenes("Use cooler lighting",available)).toEqual(available);
 expect(storyboardFeedbackScenes("Use cooler lighting",available,[7,6,6])).toEqual([6,7]);
 expect(()=>storyboardFeedbackScenes("Scenes 6 and 7",available,[6])).toThrow(/outside/);
 expect(()=>storyboardFeedbackScenes("Scene 9",available)).toThrow(/existing/);
 expect(()=>storyboardFeedbackScenes("Scene 7 to 6",available)).toThrow(/range/);
 const feedback=recordSceneComment(emptyStoryboardFeedback(),1,"Keep this camera","human");
 const applied=applyGlobalStoryboardComment(feedback,available.map(scene=>({...panel,scene})),"Cases 6 et 7 : personnage devant une balance comparant les deux pays","human");
 expect(applied.globalComment).toMatchObject({scenes:[6,7],status:"needs-image-revision"});
 expect(applied.comments).toEqual(feedback.comments);expect(applied.imageRevisions).toEqual({});
});

it("does not disguise a structural re-cut request as an image redraw",()=>{
 const feedback=applyGlobalStoryboardComment(emptyStoryboardFeedback(),[{...panel,scene:6},{...panel,scene:7}],"Fusionne les cases 6 et 7 en une seule", "human");
 expect(feedback.globalComment?.status).toBe("needs-action-plan");expect(feedback.imageRevisions).toEqual({});
 expect(()=>assertStoryboardCommentsResolved(feedback)).toThrow();
});

it("removes the reported floating layers locally even with the original spelling, preserving image inputs",()=>{
 const current=board(),before=structuredClone(current.shots[0]);
 const p={...panel,graphicLayers:[{kind:"symbol" as const,symbol:"globe" as const,position:"top-center" as const},{kind:"symbol" as const,symbol:"people" as const,position:"middle-right" as const}]};
 for(const text of ["Enlève les pastilles flotantes","Enlève les pastilles flottantes","Remove the floating badges"]){
  const feedback=applySceneComment(recordSceneComment(emptyStoryboardFeedback(),1,text,"human"),p);
  expect(feedback.comments[1].status).toBe("applied");
  applyStoryboardEdits(current,[p],feedback.edits);
  expect(current.shots[0].graphicLayers).toEqual([]);
  expect(current.shots[0].imagePrompt).toBe(before.imagePrompt);
  expect(feedback.imageRevisions).toEqual({});
  p.graphicLayers=[{kind:"symbol",symbol:"globe",position:"top-center"}];
 }
 expect(localStoryboardChange("Enlève les pastilles et change la lumière",p).edit).toBeNull();
 expect(localStoryboardChange("Enlève les pastilles flottantes",{...p,graphicLayers:[]}).edit).toBeNull(); // baked pixels need an actual redraw
});

it("renders narration typography without the presenter or literal feedback, at zero media requests",async()=>{
 const narration="Don't be a victim of propaganda.",current=planConcept(narration,getRecipe("cam-clay")!,"9:16");
 const p={...panel,narration};
 const note="Je vreux juste une animation de texte ici, pas besoin du personnage";
 const feedback=applySceneComment(recordSceneComment(emptyStoryboardFeedback(),1,note,"human"),p);
 expect(feedback.comments[1].status).toBe("applied");
 expect(feedback.edits[1]).toEqual({textOnly:true,overlay:narration,visualMode:"presenter-text",graphicLayers:[]});
 const original=current.shots[0].imagePrompt;
 applyStoryboardEdits(current,[p],feedback.edits);
 expect(current.shots[0].imagePrompt).toBe(original);
 const params={...resolveParams(narration,"auto").params,productionMethod:"whimsical-v1" as const};
 const timing=placeholderTiming([narration]);
 const refs=[{id:"narrator",url:"/sheet.png",sha256:"a".repeat(64),characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-15"}}];
 expect(generationPlan(narration,params,current,timing,refs).operations.filter(o=>o.kind==="video")).toEqual([]);
 const root=await mkdtemp(path.join(os.tmpdir(),"cam-text-only-"));
 try{
  await writeMontage(root,current,timing,"9:16",{1:{kind:"image",file:"incorrect-feedback-image.png",heldSeconds:5}},{brandEnding:false});
  const html=await readFile(path.join(root,"index.html"),"utf8");
  expect(html).not.toContain("incorrect-feedback-image.png");expect(html).not.toContain(note);
  expect(html).toContain("propaganda.");expect(html).toContain('tl.fromTo("#presenter-word-0-');
  expect(html).not.toContain('id="graphics-0"');
 }finally{await rm(root,{recursive:true,force:true});}
});

it("keeps unsupported text-animation directions pending rather than printing them in a redraw",()=>{
 const feedback=applySceneComment(recordSceneComment(emptyStoryboardFeedback(),1,"Je veux une animation de texte en forme de fusée et change la durée","human"),panel);
 expect(feedback.comments[1].status).toBe("needs-action-plan");expect(feedback.edits).toEqual({});
});

it("new image correction instructions explicitly forbid rendering feedback as text without rewriting legacy requests",()=>{
 const old=board(),fresh=board(),note="Change the camera angle";
 applyImageRevisions(old,{1:{note,attempt:1,animationContract:2}});
 applyImageRevisions(fresh,{1:{note,attempt:1,animationContract:2,instructionContract:3}});
 expect(old.shots[0].imagePrompt).toContain("Viewer-requested revision");
 expect(fresh.shots[0].imagePrompt).toContain("EDIT INSTRUCTIONS (never visible text)");
 expect(fresh.shots[0].imagePrompt).toContain("Never print, translate or paraphrase");
 expect(fresh.shots[0].overlay).not.toBe(note);
});

it("keeps approved scene fields through successive film corrections and honors explicit removals",()=>{
 const original={1:{overlay:"Keep this title",graphicLayers:panel.graphicLayers??[]},2:{textOnly:true,overlay:"Original narration"}};
 const moved=mergeStoryboardEdits(original,{1:{motion:"Turn the globe",textOnly:false,visualMode:"metaphor"}});
 expect(moved[1]).toMatchObject({...original[1],motion:"Turn the globe"});
 expect(moved[2]).toEqual(original[2]);
 const removed=mergeStoryboardEdits(moved,{1:{overlay:null,graphicLayers:[]}});
 expect(removed[1]).toMatchObject({overlay:null,graphicLayers:[],motion:"Turn the globe",textOnly:false});
 expect(original[1].overlay).toBe("Keep this title");
});
