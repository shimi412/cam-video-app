"use client";
import Link from "next/link";
import {useState} from "react";
/** Home page category (UI pass of 2026-10-25): an illustration on top, a title, one line. The selected one carries
 * the accent halo and no link, the others link to their creation screen. A missing illustration shows a soft gradient. */
export function CategoryCard({title,line,image,tone,href,selected=false,onSelect}:{title:string;line:string;image:string;tone:"clay"|"motion"|"attack";href?:string;selected?:boolean;onSelect?:()=>void}){
 const [failed,setFailed]=useState(false);
 const body=<>
  <div className={`ill${failed?` ill-${tone}`:""}`} aria-hidden="true">{!failed&&(
   // eslint-disable-next-line @next/next/no-img-element
   <img src={image} alt="" onError={()=>setFailed(true)}/>
  )}</div>
  <h3>{title}</h3><p>{line}</p>
 </>;
 const className=`cat${selected?" on":""}`;
 // Shimi, 2026-10-26: on the home page a card locks the choice in place (button), it no longer navigates.
 if(onSelect)return <button type="button" onClick={onSelect} className={className+" text-left w-full"} aria-pressed={selected}>{body}</button>;
 return href?<Link href={href} className={className}>{body}</Link>:<div className={className} aria-current={selected?"page":undefined}>{body}</div>;
}
