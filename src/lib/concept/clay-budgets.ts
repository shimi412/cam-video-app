/** Clay (collage) spending and model knobs, validated once, env-driven, as
 * motion/budgets.ts. Before 2026-10-21 Clay's director ran under the shared
 * $0.25 assistant cap with a 10,000-token output floor, on the admin model and
 * with Motion's effort knob: on Fable pricing that is unaffordable before the
 * first call, and one validator rejection costs the whole Start. */
import {AGENT_TURN_MAX_USD} from '../motion/budgets';
const read=(name:string,fallback:number,max=AGENT_TURN_MAX_USD)=>{
 const raw=process.env[name];const value=raw===undefined||raw===''?fallback:Number(raw);
 if(!Number.isFinite(value)||value<=0||value>max)throw Error(`Clay budget ${name} must be a number between 0 and ${max} (got "${raw}").`);
 return value;
};
export function clayBudgets(){
 const effort=process.env.CAM_CLAY_EFFORT?.trim();
 return {
  /** One semantic direction or feedback turn of the director. */
  directionUsd:read('CAM_CLAY_DIRECTION_CAP_USD',1.5),
  /** Smaller typed turns: finishing interpretation, recovery, audio decisions. */
  assistantUsd:read('CAM_CLAY_ASSISTANT_CAP_USD',.5),
  effort:(effort==='low'||effort==='high'?effort:'medium') as 'low'|'medium'|'high',
  /** Single journey (Shimi, 2026-10-23): estimated AI direction, review and supervision spend of a complete first
   * version, added to the media estimate before the price tiers. An estimate before fees, never a customer price. */
  firstVersionAllowanceUsd:read('CAM_CLAY_V1_ALLOWANCE_USD',2.5),
  /** Estimated feedback interpretation and review spend of one client revision, added to its additional media cost. */
  revisionAllowanceUsd:read('CAM_CLAY_REVISION_ALLOWANCE_USD',.5),
 };
}
/** The Clay director model: CAM_CLAY_MODEL, else the admin setting, else Sonnet 5. */
export function clayModelFromSetting(setting:string|undefined,fallback:string){return process.env.CAM_CLAY_MODEL?.trim()||setting||fallback;}
