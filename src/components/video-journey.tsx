import {VIDEO_JOURNEY} from "@/lib/concept/review-stages";
export function VideoJourney({step}:{step:number}){
 return <nav aria-label="Your video journey" className="rounded-xl border border-accent/30 bg-surface p-4 space-y-3"><h2 className="font-semibold">Your video journey</h2><ol className="grid grid-cols-2 sm:grid-cols-5 gap-2">{VIDEO_JOURNEY.map((label,i)=><li key={label} aria-current={i===step?"step":undefined} className={`rounded-lg p-2 text-sm ${i===step?"bg-accent text-white font-semibold":"bg-background text-muted"}`}><span className="block text-xs mb-1">{i<step?"✓":i+1}</span>{label}</li>)}</ol><p className="text-sm text-muted">First approve the images and movements. Sound, editing and subtitles have their own review before download.</p></nav>;
}
