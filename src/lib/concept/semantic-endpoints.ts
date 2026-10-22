import type { ProductionParams } from "../brain";
import { DirectionSchema, type SceneDirection } from "./types";
import { changesState } from "./physical-direction";

/** Missing endpoints use the director's own action, without inventing a new
 * action or paying for another analysis. Both frames still require storyboard
 * approval. Call only for new semantic plans or untouched saved launches. */
export function completeSemanticEndpoint(direction: SceneDirection): SceneDirection {
  if (direction.endScene || !changesState(direction)) return direction;
  return DirectionSchema.parse({...direction, stateChange:true,
    actionSeconds:Math.max(4,direction.actionSeconds??4),
    endScene:`One final still after the following action has fully completed: ${direction.motion} Show only its resulting held state, not a sequence of movements or multiple panels. Use the starting image for the exact characters, objects, camera and lighting. Preserve all unchanged details. Do not add any event, object, quantity or outcome beyond this specified action.`,
  });
}

export function completeUnstartedSemanticEndpoints(params: ProductionParams) {
  if(params.editorialPlan?.version!=="semantic-ideas-v1"||!params.sceneDirections)return {params,scenes:[] as number[]};
  const scenes:number[]=[],directions={...params.sceneDirections};
  for(const [key,direction] of Object.entries(directions)){
    if(params.sceneMedia?.[Number(key)])continue;
    const completed=completeSemanticEndpoint(direction);
    if(completed!==direction){directions[key]=completed;scenes.push(Number(key));}
  }
  return {params:scenes.length?{...params,sceneDirections:directions,concept:params.concept?{...params.concept,imageCount:params.concept.imageCount+scenes.length}:undefined}:params,scenes};
}
