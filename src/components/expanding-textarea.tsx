"use client";
import {useLayoutEffect,useRef,type TextareaHTMLAttributes} from "react";
/** Keep prose readable without horizontal scrolling or an inner scrollbar. */
export function ExpandingTextarea(props:TextareaHTMLAttributes<HTMLTextAreaElement>){
 const ref=useRef<HTMLTextAreaElement>(null);
 const fit=()=>{const el=ref.current;if(!el||!el.clientWidth)return;el.style.height="auto";el.style.height=`${el.scrollHeight+2}px`;};
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  fit();let width=el.clientWidth;
  const observer=new ResizeObserver(()=>{if(el.clientWidth!==width){width=el.clientWidth;fit();}});
  observer.observe(el);const details=el.closest("details");details?.addEventListener("toggle",fit);
  return()=>{observer.disconnect();details?.removeEventListener("toggle",fit);};
 },[]);
 return <textarea {...props} ref={ref} rows={props.rows??2} style={{...props.style,overflow:"hidden",resize:"none",overflowWrap:"anywhere"}} onInput={event=>{fit();props.onInput?.(event);}}/>;
}
