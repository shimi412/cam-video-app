/** Every Motion spending bound in one place, validated once. The writer, the
 * review, the feedback interpretation and the creation preflight read the same
 * values, so a cap that the runtime would refuse stops a film at creation with
 * a clear message, never after the paid voice step (live failure 2026-10-21:
 * CAM_MOTION_WRITING_CAP_USD=8 passed the env but a hardcoded guard of $3 in
 * the writer blocked "Test FABLE" after its recording). */
export const AGENT_TURN_MAX_USD=12;
const read=(name:string,fallback:number,max=AGENT_TURN_MAX_USD)=>{
 const raw=process.env[name];const value=raw===undefined||raw===''?fallback:Number(raw);
 if(!Number.isFinite(value)||value<=0||value>max)throw Error(`Motion budget ${name} must be a number between 0 and ${max} (got "${raw}").`);
 return value;
};
export function motionBudgets(){
 return {
  writingUsd:read('CAM_MOTION_WRITING_CAP_USD',2),
  repairUsd:read('CAM_MOTION_REPAIR_CAP_USD',.75),
  reviewUsd:read('CAM_MOTION_REVIEW_CAP_USD',.35),
  feedbackUsd:read('CAM_MOTION_FEEDBACK_CAP_USD',.20),
  ceilingUsd:read('CAM_MOTION_PRICE_CEILING_USD',30,1000),
 };
}
