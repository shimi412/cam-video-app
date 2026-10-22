import {CamQuoteSchema,type CamQuote} from "../providers/cam-pricing";
import {HF_SEEDANCE,KLING_PRO,KLING_STANDARD} from "./model-selection";
import {imageAttempt,imageBase,recoverableRequest,type ImageRetries} from "./image-recovery";
import {sha256} from "./checkpoints";

type Receipt={fingerprint:string;state:string;requestId?:string;failureReason?:string;binding?:{operation:string;model:string}};
/** A priced alternative for one confirmed failed draft. Never submits, rewrites
 * old receipts, refunds unverified spending or changes an approved image. */
export function quoteDraftFallback(previous:CamQuote,current:CamQuote,failed:Receipt,receipts:Receipt[],retries:ImageRetries){
 const operation=failed.binding?.operation??"",base=imageBase(operation),scene=Number(base.split("-")[1]);
 if(!/^scene-\d+-draft$/.test(base)||failed.binding?.model!==HF_SEEDANCE||!recoverableRequest(failed,retries))throw new Error("No confirmed failed draft can use this alternative.");
 const workflow=previous.selection?.workflow,native=workflow==="whimsical";
 if(previous.plan!==current.plan||previous.scope!=="production"||current.scope!=="production"||!["draft-first","whimsical"].includes(workflow??"")||current.selection?.workflow!==workflow)throw new Error("The replacement must preserve the approved production.");
 const finalId=`scene-${scene}-clip`,attempt=imageAttempt(operation)+1;
 if(attempt>10||receipts.some(r=>imageBase(r.binding?.operation??"")===finalId&&r.state!=="not-sent"))throw new Error("This scene already has a final request; preserve it before changing its route.");
 const oldDraft=previous.lines.find(l=>l.id===operation),oldFinal=previous.lines.find(l=>l.id===finalId);
 const draft=current.lines.find(l=>l.id===base),final=current.lines.find(l=>l.id===finalId);
 if(!oldDraft||!oldFinal||!final||final.model!==KLING_PRO||final.kind!=="video"||final.unit!=="usd"||final.billing!=="seconds"||final.seconds!==oldFinal.seconds||final.seconds!==oldDraft.seconds||(!native&&(!draft||draft.model!==KLING_STANDARD||draft.kind!=="video"||draft.unit!=="usd"||draft.billing!=="seconds"||draft.seconds!==oldDraft.seconds))||(native&&Boolean(draft)))throw new Error("No matching duration and price for the alternative animation route.");
 const nextId=`${base}-retry-${attempt}`;
 if(previous.lines.some(l=>l.id===nextId))throw new Error("This replacement allowance already exists.");
 // Everything outside this unsubmitted final and new draft is byte-for-byte
 // preserved, including the cost of every failed request (refund unverified).
 const lines=previous.lines.map(l=>l.id===finalId?final:l);
 if(!native)lines.push({...draft!,id:nextId,description:"Alternative draft attempt; original request history retained"});
 const selected=current.selection!.scenes.find(s=>s.operation===finalId);
 if(!selected||selected.selected!==KLING_PRO)throw new Error("Alternative route selection missing.");
 const selection={...previous.selection!,scenes:previous.selection!.scenes.map(s=>s.operation===finalId?{...selected,reason:"Explicitly priced alternative after a confirmed technical draft failure."}:s)};
 const draftRecoveries=[...(previous.draftRecoveries??[]),{scene,attempt,failedRequestId:failed.requestId!,failedFingerprint:failed.fingerprint}];
 const caps={usd:0,"higgsfield-credit":0};for(const line of lines)caps[line.unit]+=line.maximum;
 const content={...previous,id:undefined,createdAt:current.createdAt,expiresAt:current.expiresAt,lines,caps,selection,draftRecoveries};
 return {quote:CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))}),retries:{...retries,[base]:attempt}};
}
