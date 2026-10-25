"use client";
import {useEffect,useRef,useState} from "react";
/** Dark pill sliding from the bottom, hidden again after 1.8 s. The parent owns the message and clears it in `onHide`. */
export function Toast({message,onHide,duration=1800}:{message:string|null;onHide:()=>void;duration?:number}){
 const [on,setOn]=useState(false);
 const hide=useRef(onHide);
 useEffect(()=>{hide.current=onHide;},[onHide]);
 useEffect(()=>{
  if(!message)return;
  const raise=setTimeout(()=>setOn(true),10);
  const lower=setTimeout(()=>setOn(false),duration);
  const done=setTimeout(()=>hide.current(),duration+250);
  return()=>{clearTimeout(raise);clearTimeout(lower);clearTimeout(done);};
 },[message,duration]);
 if(!message)return null;
 return <div role="status" aria-live="polite" className={`toast${on?" on":""}`}>✓ {message}</div>;
}
