import {CamQuoteSchema,type CamQuote} from "../providers/cam-pricing";
import {KLING_PRO} from "./model-selection";
import {sha256} from "./checkpoints";
export type ImageRetries=Record<string,number>;
export const imageBase=(operation:string)=>operation.replace(/-retry-\d+$/,"");
export const imageAttempt=(operation:string)=>Number(operation.match(/-retry-(\d+)$/)?.[1]??0);
export function supersededImage(operation:string,retries:ImageRetries){return /^scene-\d+-(start|end|draft|clip)(-retry-\d+)?$/.test(operation)&&imageAttempt(operation)<(retries[imageBase(operation)]??0);}
/** Preserve the original cost even when its outcome is unknown. Recovery is an
 * additional quoted image or failed draft, never a refund or an unapproved retry. */
export function withImageRecovery(quote:CamQuote,retries:ImageRetries):CamQuote{
 const lines=[...quote.lines];
 for(const [operation,count] of Object.entries(retries)){
  const original=quote.lines.find(l=>l.id===operation&&(l.kind==="image"||l.kind==="video"));
  if(!/^scene-\d+-(start|end|draft|clip)$/.test(operation)||!Number.isInteger(count)||count<1||count>10)throw new Error("Invalid recovery quote.");
  // A native replacement retires the failed draft; no second paid clip is needed.
  if(operation.endsWith("-draft")&&quote.selection?.workflow==="whimsical"&&quote.selection.scenes.some(s=>s.operation===operation.replace(/-draft$/,"-clip")&&s.selected===KLING_PRO))continue;
  if(!original)throw new Error("Invalid recovery quote.");
  // A failed Seedance continuation replaced natively (2026-10-23) runs under the scene's own Kling line: that attempt needs no second paid clip.
  for(let attempt=1;attempt<=count;attempt++)if(!(operation.endsWith("-clip")&&quote.draftRecoveries?.some(r=>r.operation===operation&&r.attempt===attempt)))lines.push({...original,id:`${operation}-retry-${attempt}`,description:"Replacement attempt; previous cost remains reserved"});
 }
 const caps={usd:0,"higgsfield-credit":0};for(const line of lines)caps[line.unit]+=line.maximum;
 const content={...quote,id:undefined,lines,caps};
 return CamQuoteSchema.parse({...content,id:sha256(JSON.stringify(content))});
}

/** Only definitive technical video failures can be replaced. An unknown video
 * submission or a moderation rejection is never an automatic retry candidate. */
export function recoverableRequest(receipt:{state:string;requestId?:string;failureReason?:string;binding?:{operation:string}},retries:ImageRetries){
 const operation=receipt.binding?.operation??"";
 if(supersededImage(operation,retries))return false;
 if(/^scene-\d+-(start|end)(-retry-\d+)?$/.test(operation))return receipt.state==="submitting"&&!receipt.requestId||receipt.state==="failed";
 return /^scene-\d+-(draft|clip)(-retry-\d+)?$/.test(operation)&&receipt.state==="failed"&&Boolean(receipt.requestId)&&["failed","canceled"].includes(receipt.failureReason??"");
}

/** Single journey (Shimi, 2026-10-23): no provider failure reaches the client. A refusal at
 * submission (no request id, reason saved) or a failed accepted request, whatever its reason,
 * is a definitive video failure replaced internally, bounded by the approved price. */
export function definitiveVideoFailure(receipt:{state:string;requestId?:string;failureReason?:string;binding?:{operation:string}},retries:ImageRetries){
 const operation=receipt.binding?.operation??"";
 if(supersededImage(operation,retries)||!/^scene-\d+-(draft|clip)(-retry-\d+)?$/.test(operation)||receipt.state!=="failed")return false;
 return Boolean(receipt.requestId||receipt.failureReason);
}
