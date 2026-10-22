/** Every Attack spending bound and retry limit in one place, modelled on
 * motion/budgets.ts. The director, inspections, pricing provision, provider
 * gateway and worker read these values; Start validates them before any paid
 * step so a misconfigured cap stops a film at creation, never mid-production. */
const read=(name:string,fallback:number,max:number,integer=false)=>{
 const raw=process.env[name];const value=raw===undefined||raw===''?fallback:Number(raw);
 if(!Number.isFinite(value)||value<=0||value>max||integer&&!Number.isInteger(value))throw Error(`Attack budget ${name} must be a ${integer?'whole ':''}number between 0 and ${max} (got "${raw}").`);
 return value;
};
export function comicsBudgets(){
 return {
  directionUsd:read('CAM_COMICS_DIRECTION_CAP_USD',.5,5), // 12 steps on Sonnet 5 at about $0.03 each (live 2026-10-22: 8 steps, $0.21, two validator corrections)
  finishingUsd:read('CAM_COMICS_FINISHING_CAP_USD',.25,2),
  inspectionUsd:read('CAM_COMICS_INSPECTION_CAP_USD',.25,2),
  transientRetries:read('CAM_COMICS_TRANSIENT_RETRIES',5,10,true),
  transientDelayMs:read('CAM_COMICS_TRANSIENT_DELAY_MS',90_000,3_600_000,true),
  mcpTimeoutMs:read('CAM_COMICS_MCP_TIMEOUT_MS',30_000,300_000,true),
  downloadMaxBytes:read('CAM_COMICS_DOWNLOAD_MAX_BYTES',150*1024*1024,1024*1024*1024,true),
  quoteMinutes:read('CAM_COMICS_QUOTE_MINUTES',15,24*60,true),
  reconcileAfterMs:read('CAM_COMICS_RECONCILE_AFTER_MS',10*60_000,3_600_000,true),
  reconcileAttempts:read('CAM_COMICS_RECONCILE_ATTEMPTS',3,10,true),
 };
}
export type ComicsBudgets=ReturnType<typeof comicsBudgets>;
/** Director/inspection model: `CAM_COMICS_MODEL` wins (as `CAM_CLAY_MODEL` for Clay),
 * else the admin `ai_deep_model` setting, else the routing default. */
export function comicsModelFromSetting(setting:string|null|undefined,fallback:string){return process.env.CAM_COMICS_MODEL?.trim()||setting||fallback;}
