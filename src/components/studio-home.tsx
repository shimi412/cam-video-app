"use client";
import {useState} from "react";
import {CategoryCard} from "@/components/category-card";
import {ComicStartForm,CATEGORY_COPY,type FilmCategory} from "@/components/comic-start-form";
const CARDS:{key:FilmCategory;title:string;line:string;image:string;tone:"clay"|"motion"|"attack"}[]=[
 {key:"clay",title:"Clay animation",line:"A narrator in a warm clay studio.",image:"/categories/clay.png",tone:"clay"},
 {key:"motion",title:"Motion design",line:"Words and shapes in motion.",image:"/categories/motion.png",tone:"motion"},
 {key:"comics",title:"Attack video",line:"Comics panels, bold and fast.",image:"/categories/attack.png",tone:"attack"},
];
/** Shimi, 2026-10-26: choosing a format locks it on the home page (a marked box confirms the choice) and the
 * creation form below uses it. Without a choice the form stays disabled with a hint. */
export function StudioHome(){
 const [category,setCategory]=useState<FilmCategory|null>(null);
 function choose(key:FilmCategory){setCategory(key);}
 return <div className="space-y-6">
  <div className="space-y-4">
   <div><p className="kicker">Step 1 · Your video</p><h1 className="page-title">Create a video</h1><p className="text-muted mt-2">Choose a format, paste your script, add reference images if you have some. You get one estimate, delay and price; approve it and your complete film is produced.</p></div>
   <nav aria-label="Video category" className="cats">{CARDS.map(c=><CategoryCard key={c.key} title={c.title} line={c.line} image={c.image} tone={c.tone} selected={category===c.key} onSelect={()=>choose(c.key)}/>)}</nav>
   {category?<div role="status" className="rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{background:"var(--accent)",color:"#fff"}}><p><span aria-hidden="true">✓ </span><b>{CATEGORY_COPY[category].kicker}</b> selected. Your choice is saved for this video.</p><button type="button" className="btn btn-sm" style={{background:"rgba(255,255,255,.18)",color:"#fff"}} onClick={()=>setCategory(null)}>Change format</button></div>
   :<p role="status" className="rounded-xl px-5 py-4 text-sm" style={{background:"var(--accent-soft)"}}>Pick one of the three formats above. Your choice will be confirmed here.</p>}
  </div>
  <ComicStartForm category={category} heading={false}/>
 </div>;
}
