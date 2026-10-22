import {z} from "zod";
import { AIResponseError } from "./ai-response";
/** Public production errors must not reveal schemas, model IDs or provider replies. */
export function productionError(error:unknown):string {
 if(error instanceof Error&&error.message.startsWith("Final review: "))return error.message;
 if(error instanceof AIResponseError)return error.failure.code === "incomplete"
  ? "The scene plan was interrupted before it finished. Your script is unchanged. No images or animations were started, and no automatic retry was made. Contact support before trying again."
  : "The scene plan could not be validated. Your script is unchanged. No images or animations were started, and no automatic retry was made. Contact support before trying again.";
 if(error instanceof z.ZodError)return "Some scenes could not be prepared correctly. Your script is unchanged. No images or animations were generated. Contact support before trying again.";
 const message=error instanceof Error?error.message:"";
 if(message.includes("already sent")||message.includes("unconfirmed"))return "This preparation was already submitted, but its result could not be confirmed. It has not been sent again. Contact support to recover it.";
 if(message.includes("$0.25")||message.includes("request budget"))return "This script exceeds the preparation budget. Try a shorter script or contact support.";
 if(message.includes("monthly")&&message.includes("budget"))return "The workspace preparation budget has been reached. Contact your administrator.";
 if(message.includes("character sheet"))return "A character in this video still needs an approved character sheet. Review the characters before generating scenes.";
 if(message.includes("numbering")||message.includes("Presenter text"))return "The scene plan needs correction before production. Your script is unchanged and no automatic retry was made. Contact support.";
 return "We could not finish preparing your video. Your script is unchanged. No automatic retry was made. Contact support before trying again.";
}
