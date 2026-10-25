"use client";
import Link from "next/link";
import {useState} from "react";
/** Home page category (UI pass of 2026-10-25): an illustration on top, a title, one line. The selected one carries
 * the accent halo and no link, the others link to their creation screen. A missing illustration shows a soft gradient. */
export function CategoryCard({title,line,image,tone,href,selected=false}:{title:string;line:string;image:string;tone:"clay"|"motion"|"attack";href?:string;selected?:boolean}){
 const [failed,setFailed]=useState(false);
 const body=<>
  <div className={`ill${failed?` ill-${tone}`:""}`} aria-hidden="true">{!failed&&(
   // eslint-disable-next-line @next/next/no-img-element
   <img src={image} alt="" onError={()=>setFailed(true)}/>
  )}</div>
  <h3>{title}</h3><p>{line}</p>
 </>;
 const className=`cat${selected?" on":""}`;
 return href?<Link href={href} className={className}>{body}</Link>:<div className={className} aria-current={selected?"page":undefined}>{body}</div>;
}
