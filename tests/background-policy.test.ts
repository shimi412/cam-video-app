import {expect,it} from "vitest";
import {backgroundMayRun,backgroundAfterAttempt,requestedBackground} from "../src/lib/concept/background-policy";
const view={approved:true,finished:false,renewing:false,needsProductionBudget:false,review:null,error:null,status:"pending",requests:[]};
it("never adopts historical jobs, even when already approved",()=>{expect(backgroundMayRun(undefined,view)).toBe(false);});
it("restarts authorized work without browser actions but stops at each human gate",()=>{
 const state={...requestedBackground(),kick:false};
 expect(backgroundMayRun(state,view)).toBe(true);
 for(const change of [{approved:false},{finished:true},{renewing:true},{needsProductionBudget:true},{review:{stage:"storyboard"}},{review:{stage:"draft-film"}},{review:{stage:"finishing-film"}},{status:"rejected"}])expect(backgroundMayRun(state,{...view,...change})).toBe(false);
});
it("a newly accepted edit can replace the previous review, including after a crash before starting",()=>{
 expect(backgroundMayRun(requestedBackground(),{...view,review:{stage:"storyboard"}})).toBe(true);
 expect(backgroundMayRun(requestedBackground(),{...view,review:{stage:"storyboard"},renewing:true})).toBe(false);
});
const decided=()=>{const state=requestedBackground();state.supervision!.current={key:'saved',status:'decided',used:false,input:{jobId:'id',category:'clay',workKey:'work',stage:'render',error:'network',requests:[],facts:{},allowed:['retry-saved'],attempt:1},decision:{action:'retry-saved',reason:'Retry reading the saved result.'}};return state;};
it("requires a persisted Claude decision and refuses uncertain or exhausted work",()=>{
 expect(backgroundMayRun(requestedBackground(),{...view,error:"network"})).toBe(false);
 expect(backgroundMayRun(decided(),{...view,error:"any diagnostic"})).toBe(true);
 const state=decided();state.supervision!.exhausted=true;expect(backgroundMayRun(state,{...view,error:"network"})).toBe(false);
 expect(backgroundMayRun(decided(),{...view,error:"network",requests:[{state:"submitting",requestId:null}]})).toBe(false);
});

it("keeps polling accepted storyboard revisions while retaining old panels, then stops for review",()=>{
 const state={...requestedBackground(),kick:false};
 expect(backgroundMayRun(state,{...view,review:{stage:"storyboard"},storyboardPending:[2,8]})).toBe(true);
 expect(backgroundMayRun(state,{...view,review:{stage:"storyboard"},storyboardPending:[]})).toBe(false);
 expect(backgroundMayRun(state,{...view,status:"awaiting-review",review:{stage:"storyboard"},storyboardPending:[2]})).toBe(false);
 expect(backgroundMayRun(state,{...view,review:{stage:"draft-film"},storyboardPending:[2]})).toBe(false);
});

it("retains an authorized edit across a connection outage before replacing its old review",()=>{
 const failed=backgroundAfterAttempt(decided(),"network",0);
 const old={...view,review:{stage:"storyboard"},error:"network"};
 expect(backgroundMayRun(failed,old,failed.nextAt)).toBe(true);
 expect(backgroundMayRun({...failed,kick:false},old,failed.nextAt)).toBe(false);
 expect(backgroundMayRun({...failed,supervision:{...failed.supervision!,exhausted:true}},old,failed.nextAt)).toBe(false);
});
