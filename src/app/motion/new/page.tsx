'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {WorkProgress} from '@/components/work-progress';
type Offer={priceUsd:number;estimatedMinutes:number};
/** Creation screen: title, narration, the estimated delay and the first-version price, then Start
 * (Shimi, 2026-10-18 and 2026-10-23). The price comes from the server offer and is sent back as the
 * accepted price; creation refuses a price that changed in between. */
export default function MotionStart(){
 const router=useRouter(),request=useRef<string|null>(null);const [script,setScript]=useState(''),[title,setTitle]=useState(''),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[offer,setOffer]=useState<Offer|null>(null),[offerError,setOfferError]=useState('');
 useEffect(()=>{let cancelled=false;void fetch('/api/motion').then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);if(!cancelled)setOffer(data);}).catch(e=>{if(!cancelled)setOfferError(e instanceof Error?e.message:'The film price is unavailable right now.');});return ()=>{cancelled=true;};},[]);
 return <div className="max-w-3xl mx-auto space-y-6"><Link href="/" className="text-accent">← Video categories</Link><h1 className="text-3xl font-semibold">Create a motion design video</h1><p>Turn your script into animated typography, objects and transitions.</p><ol className="flex flex-wrap gap-4 text-sm"><li>1. Your complete film</li><li>2. Your feedback, next version</li><li>3. Sound, editing & subtitles</li><li>4. Download</li></ol>
 <form className="space-y-5" onSubmit={async e=>{e.preventDefault();if(busy||!accepted||!offer)return;setBusy(true);setError('');request.current??=crypto.randomUUID();try{const response=await fetch('/api/motion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script,title,requestId:request.current,acceptedPriceUsd:offer.priceUsd})});const data=await response.json();if(!response.ok)throw Error(data.error);router.push(`/motion/${data.id}`);}catch(e){setError(e instanceof Error?e.message:'Could not start this film.');setBusy(false);}}}>
 <label className="block">Video title<input required maxLength={80} disabled={busy} value={title} onChange={e=>{request.current=null;setTitle(e.target.value);}} className="block w-full p-3 mt-2 border border-line rounded-xl bg-surface"/></label>
 <label className="block">Your script<textarea required minLength={10} maxLength={12000} rows={10} disabled={busy} value={script} onChange={e=>{request.current=null;setScript(e.target.value);}} className="block w-full p-3 mt-2 border border-line rounded-xl bg-surface"/></label>
 <section className="p-5 border border-line rounded-xl space-y-3" aria-live="polite">{offer?<><h2 className="text-2xl font-semibold">${offer.priceUsd} for your first complete version</h2><p>Ready in about {offer.estimatedMinutes} minutes.</p><p>Includes recording, the complete animated film, finishing and download.</p><label className="flex gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy}/>I accept the ${offer.priceUsd} price.</label></>:offerError?<p role="alert" className="text-red-600">{offerError}</p>:<p className="text-muted">Estimating the delay and the price of your film…</p>}</section>
 <button disabled={busy||!accepted||!offer} className="rounded-xl bg-accent text-white px-6 py-3 disabled:opacity-50">Start my motion video</button>
 </form>{busy&&<WorkProgress title="Preparing your motion video" description="Your script is saved before work begins."/>}{error&&<p role="alert" className="text-red-600">{error}</p>}</div>;
}
