"use client";
import { useEffect, useRef, useState } from "react";
import { PACKS, TYPICAL, MONTHLY_INCLUDED_CREDITS, toCredits, fmtCredits } from "@/lib/credits-display";
type Data={balance:number;available:number;reserved:number;paymentsAvailable:boolean;testMode:boolean};
export default function Credits(){const [data,setData]=useState<Data|null>(null),[amount,setAmount]=useState("300"),[busy,setBusy]=useState(false),[error,setError]=useState("");const attempt=useRef<{id:string;amountCents:number}|null>(null);useEffect(()=>{const load=()=>fetch("/api/credits").then(async r=>{if(!r.ok)throw Error("Could not load credits.");setData(await r.json());}).catch(e=>setError(e.message));void load();const timer=setInterval(()=>void load(),10000);return()=>clearInterval(timer);},[]);
 async function topup(usd:number){setBusy(true);setError("");try{const amountCents=Math.round(usd*100);if(attempt.current?.amountCents!==amountCents)attempt.current={id:crypto.randomUUID(),amountCents};const r=await fetch("/api/credits/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(attempt.current)});const result=await r.json();if(!r.ok)throw Error(result.error);const target=new URL(result.url);if(target.protocol!=="https:"||target.hostname!=="checkout.stripe.com")throw Error("Invalid checkout address.");window.location.assign(target.href);}catch(e){setError(e instanceof Error?e.message:"Checkout unavailable.");setBusy(false);}}
 const credits=data?toCredits(data.available):null,videos=credits===null?null:Math.floor(credits/TYPICAL.video),changes=credits===null?null:Math.floor(credits/TYPICAL.change);
 const custom=Number(amount)||0;
 // Shimi, 2026-10-26: balance, packs with bonus credits and what they buy, nothing else on this page.
 return <section className="space-y-8">
  <div><p className="kicker">Balance</p><h1 className="page-title">My credits</h1></div>
  {error&&<p role="alert" className="text-danger">{error}</p>}
  {data&&<>
  <div className="card p-6 md:p-8 flex flex-wrap items-end justify-between gap-6" style={{background:"linear-gradient(135deg,var(--accent-deep),var(--accent))",color:"#fff"}}>
   <div><p className="text-sm opacity-80">Available credits</p><p className="font-semibold leading-none mt-2" style={{fontSize:"clamp(44px,6vw,72px)"}}>{fmtCredits(credits!)}</p></div>
   <div className="text-sm md:text-right opacity-90 space-y-1"><p>About <b>{videos}</b> {videos===1?"video":"videos"} or <b>{changes}</b> rounds of changes</p><p className="opacity-75">A video from {TYPICAL.motion} credits · changes from {TYPICAL.change} credits</p></div>
  </div>
  <div><h2 className="section-title">Recharge</h2><p className="text-muted mt-1">Bigger packs come with bonus credits.</p></div>
  <div className="grid md:grid-cols-3 gap-5">
   {PACKS.map(p=><div key={p.usd} className={`card p-6 flex flex-col gap-4 relative ${"popular" in p&&p.popular?"ring-2":""}`} style={"popular" in p&&p.popular?{boxShadow:"0 0 0 2px var(--accent)"}:undefined}>
    {"popular" in p&&p.popular&&<span className="pill absolute -top-3 left-6" style={{background:"var(--accent)",color:"#fff"}}>Recommended</span>}
    <div><p className="kicker">{p.name}</p><p className="text-4xl font-semibold mt-2">{fmtCredits(p.credits)} <span className="text-base font-normal text-muted">credits</span></p>{p.bonus>0&&<p className="text-sm mt-1" style={{color:"var(--accent)"}}>+{p.bonus}% bonus credits included</p>}</div>
    <ul className="text-sm text-muted space-y-1 flex-1"><li>≈ {Math.floor(p.credits/TYPICAL.video)} videos</li><li>≈ {Math.floor(p.credits/TYPICAL.change)} rounds of changes</li><li>{fmtCredits(Math.round(p.credits/p.usd*100))} credits per $100</li></ul>
    <button disabled={busy||!data.paymentsAvailable} onClick={()=>void topup(p.usd)} className={`btn ${"popular" in p&&p.popular?"btn-primary":"btn-secondary"} w-full`}>{busy?"Opening checkout…":`Buy for $${p.usd}`}</button>
   </div>)}
  </div>
  <form onSubmit={e=>{e.preventDefault();void topup(custom);}} className="card p-5 flex flex-wrap items-end gap-4">
   <label className="block text-sm flex-1 min-w-48">Custom amount (USD)<input type="number" min="10" max="1000" step="1" required value={amount} onChange={e=>setAmount(e.target.value)} className="input block mt-2"/></label>
   <p className="text-sm text-muted pb-3">= {fmtCredits(toCredits(custom))} credits</p>
   <button disabled={busy||!data.paymentsAvailable||custom<10} className="btn btn-secondary">Top up</button>
   {!data.paymentsAvailable&&<p className="text-xs text-muted w-full">Online recharges open soon.</p>}
  </form>
  <div className="card p-5 flex flex-wrap items-center justify-between gap-4" style={{background:"var(--accent-soft)"}}><div><p className="font-semibold">{fmtCredits(MONTHLY_INCLUDED_CREDITS)} credits included every month</p><p className="text-sm text-muted">Added automatically with your plan, on top of your recharges.</p></div><p className="text-sm text-muted">Each version is charged when it is delivered. Help support never uses your credits.</p></div>
  </>}
 </section>;
}
