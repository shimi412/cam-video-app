import {VIDEO_JOURNEY} from "@/lib/concept/review-stages";
/** Single journey (2026-10-23): one estimate, one unattended production, the client's review of each complete version, download. */
export const SINGLE_JOURNEY_STEPS=["Estimate","Production","Your review","Download"] as const;
/** Connected dots (UI pass of 2026-10-25): done = green with a check, active = blue with a breathing halo, upcoming = outlined.
 * Each step reads as "✓ Label" or "N Label" so the page text keeps naming the journey. */
export function VideoJourney({step,steps=VIDEO_JOURNEY,hint="First approve the images and movements. Sound, editing and subtitles have their own review before download."}:{step:number;steps?:readonly string[];hint?:string}){
 return <nav aria-label="Your video journey" className="card space-y-3">
  <h2 className="section-title">Your video journey</h2>
  <ol className="journey">{steps.map((label,i)=>{const state=i<step?"done":i===step?"active":"upcoming";return <li key={label} aria-current={i===step?"step":undefined} className={`step ${state}`}><span className="dot">{i<step?"✓":i+1}</span>{" "}<span className="lbl">{label}</span><span className="bar" aria-hidden="true"/></li>;})}</ol>
  <p className="text-sm text-muted">{hint}</p>
 </nav>;
}
