import type { GraphicLayer } from "./types";
/** A shared safe title region leaves a separate band for upper symbols. */
export function sceneCompositionLayout(text:string|null|undefined,layers:GraphicLayer[]|undefined,width:number,height:number){
 const upperSymbols=Boolean(layers?.some(layer=>layer.position.startsWith("top-")));
 const textTop=upperSymbols?.18:.12, textHeight=upperSymbols?.20:.25;
 const paddingX=width*.022,paddingY=height*.009;
 const availableWidth=width*.76-paddingX*2,availableHeight=height*textHeight-paddingY*2;
 let fontSize=Math.min(78,width*.067);
 while(fontSize>18&&Math.ceil((text?.length??0)*fontSize*.62/availableWidth)*fontSize*1.16>availableHeight)fontSize--;
 return {textTop,textHeight,fontSize,paddingX,paddingY};
}
