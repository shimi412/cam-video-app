/** Only failures known to precede an HTTP connection can permit a fresh POST.
 * Socket resets, response timeouts and aborts are ambiguous and are never retried. */
export class SubmissionNotSentError extends Error {}
/** The provider refused the submission itself (bad request, credentials, balance, policy): definitive, nothing was generated. */
export class SubmissionRejectedError extends Error {constructor(public status:number,message:string){super(message);}}
/** Read-only transport failure. Never use this to retry a generation POST. */
export class RetryableReadError extends Error {}
export function connectionNotEstablished(error:unknown):boolean {
 const codes=new Set(["ENOTFOUND","EAI_AGAIN","ECONNREFUSED","UND_ERR_CONNECT_TIMEOUT"]);
 if(!error||typeof error!=="object")return false;
 const e=error as {code?:unknown;cause?:unknown;errors?:unknown[]};
 if(typeof e.code==="string"&&codes.has(e.code))return true;
 if(e.errors?.length)return e.errors.every(connectionNotEstablished);
 return e.cause!==undefined&&connectionNotEstablished(e.cause);
}
/** One transport attempt. The persisted Claude supervisor decides whether to read again. */
export async function providerFetch(input:string|URL,init:RequestInit,fetcher:typeof fetch=fetch):Promise<Response>{
 const read=(init.method??"GET")==="GET";
 try{
  const result=await fetcher(input,{...init,signal:init.signal??AbortSignal.timeout(20000)});
  if(read&&[408,429,500,502,503,504].includes(result.status)){
   await result.body?.cancel();throw new RetryableReadError(`Saved result read returned HTTP ${result.status}.`);
  }
  return result;
 }catch(error){
  if(!read){if(connectionNotEstablished(error))throw new SubmissionNotSentError("The connection could not be established. No request was sent.",{cause:error});throw error;}
  if(error instanceof RetryableReadError)throw error;
  throw new RetryableReadError("The saved result could not be read yet.",{cause:error});
 }
}
