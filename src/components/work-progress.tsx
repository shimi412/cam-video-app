"use client";
import {useEffect,useState} from "react";
export type WorkStage={label:string;state:"done"|"now"|"next"};
/** Indeterminate feedback follows the real request lifetime, never simulated stages. A caller that knows where the
 * production stands passes `progress` (0..1), the `stages` chips and `remainingMinutes`; otherwise the bar slides. */
export function WorkProgress({title="Preparing your scenes",description="CAM is turning your script into a scene plan. Keep this page open; the result will appear here.",remainingMinutes,progress,stages}:{title?:string;description?:string;remainingMinutes?:number|null;progress?:number|null;stages?:WorkStage[]}){
 const [takingLonger,setTakingLonger]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setTakingLonger(true),30000);return()=>clearTimeout(timer);},[]);
 const timed=typeof remainingMinutes==="number"&&Number.isFinite(remainingMinutes);
 const determinate=typeof progress==="number"&&Number.isFinite(progress);
 const percent=determinate?Math.round(Math.min(1,Math.max(0,progress))*100):null;
 const big=timed?(remainingMinutes<=0?"Almost there":`About ${Math.max(1,Math.round(remainingMinutes))} min left`):`${title}…`;
 return <div role="status" aria-live="polite" aria-atomic="true" className="card prog appear">
  <div><p className="big">{big}</p><p className="sub">{timed?`${title} · ${description}`:description}</p></div>
  <div className="track" aria-hidden="true">{determinate?<div className="fill" style={{width:`${percent}%`}}/>:<div className="fill indeterminate"/>}</div>
  {stages&&stages.length>0&&<ul className="chips" aria-label="Production stages">{stages.map(stage=><li key={stage.label} className={`chip${stage.state==="done"?" done":stage.state==="now"?" now":""}`}>{stage.label}</li>)}</ul>}
  {takingLonger&&<p className="text-sm text-muted mt-3">Still waiting for the result. Longer scripts can take more time. There is no need to click again.</p>}
 </div>;
}
