import {VIDEO_JOURNEY} from "@/lib/concept/review-stages";
/** Single journey (2026-10-23): one estimate, one unattended production, the client's review of each complete version, download. */
export const SINGLE_JOURNEY_STEPS=["Estimate","Production","Your review","Download"] as const;
export function VideoJourney({step,steps=VIDEO_JOURNEY,hint="First approve the images and movements. Sound, editing and subtitles have their own review before download."}:{step:number;steps?:readonly string[];hint?:string}){
 return <nav aria-label="Your video journey" className="rounded-xl border border-accent/30 bg-surface p-4 space-y-3"><h2 className="font-semibold">Your video journey</h2><ol className={`grid grid-cols-2 gap-2 ${steps.length===4?"sm:grid-cols-4":"sm:grid-cols-5"}`}>{steps.map((label,i)=><li key={label} aria-current={i===step?"step":undefined} className={`rounded-lg p-2 text-sm ${i===step?"bg-accent text-white font-semibold":"bg-background text-muted"}`}><span className="block text-xs mb-1">{i<step?"✓":i+1}</span>{label}</li>)}</ol><p className="text-sm text-muted">{hint}</p></nav>;
}
