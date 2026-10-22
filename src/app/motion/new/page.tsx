'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {WorkProgress} from '@/components/work-progress';
export default function MotionStart(){
 const router=useRouter(),request=useRef<string|null>(null);const [script,setScript]=useState(''),[title,setTitle]=useState(''),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="max-w-3xl mx-auto space-y-6"><Link href="/" className="text-accent">← Video categories</Link><h1 className="text-3xl font-semibold">Create a motion design video</h1><p>Turn your script into animated typography, objects and transitions.</p><ol className="flex flex-wrap gap-4 text-sm"><li>1. Animated storyboard</li><li>2. Complete film visuals</li><li>3. Sound, editing & subtitles</li><li>4. Download</li></ol>
 <form className="space-y-5" onSubmit={async e=>{e.preventDefault();if(busy||!accepted)return;setBusy(true);setError('');request.current??=crypto.randomUUID();try{const response=await fetch('/api/motion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script,title,requestId:request.current,acceptedPriceUsd:10})});const data=await response.json();if(!response.ok)throw Error(data.error);router.push(`/motion/${data.id}`);}catch(e){setError(e instanceof Error?e.message:'Could not start this film.');setBusy(false);}}}>
 <label className="block">Video title<input required maxLength={80} disabled={busy} value={title} onChange={e=>{request.current=null;setTitle(e.target.value);}} className="block w-full p-3 mt-2 border border-line rounded-xl bg-surface"/></label>
 <label className="block">Your script<textarea required minLength={10} maxLength={12000} rows={10} disabled={busy} value={script} onChange={e=>{request.current=null;setScript(e.target.value);}} className="block w-full p-3 mt-2 border border-line rounded-xl bg-surface"/></label>
 <section className="p-5 border border-line rounded-xl space-y-3"><h2 className="text-2xl font-semibold">$10 for your film</h2><p>Includes recording, animated storyboard, complete preview, finishing and download.</p><label className="flex gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy}/>I accept the $10 price.</label></section>
 <button disabled={busy||!accepted} className="rounded-xl bg-accent text-white px-6 py-3 disabled:opacity-50">Start my motion video</button>
 </form>{busy&&<WorkProgress title="Preparing your motion video" description="Your script is saved before work begins."/>}{error&&<p role="alert" className="text-red-600">{error}</p>}</div>;
}
