import {expect,it} from "vitest";
import {productionStatus} from "../src/lib/production-status";
const base={approved:true,finished:false,renewing:false,error:null,phase:"voice-alignment",review:null,requests:[]};
it("keeps progress independent of the transient worker lock",()=>{
 const idle={...base,busy:false},busy={...base,busy:true};
 expect(productionStatus(idle)).toEqual(productionStatus(busy));
 expect(productionStatus(idle).running).toBe(true);
});
it("offers analysis for legacy interruptions, never raw errors or an automatic retry",()=>{
 for(const request of [{state:'submitting',requestId:null},{state:'failed',requestId:'saved'}]){
 const s=productionStatus({...base,error:'raw network error',requests:[request]});expect(s.canResume).toBe(true);expect(s.running).toBe(false);expect(s.message).toContain('analyse');expect(s.message).not.toContain('raw network');
 }
});
it("shows Claude's persisted decision instead of classifying error strings",()=>{
 const failureAnalysis={action:'needs-attention' as const,message:'The saved recording omits a required word. Review the original audio.',pending:false};
 expect(productionStatus({...base,error:'network',failureAnalysis})).toMatchObject({canResume:false,message:failureAnalysis.message});
 expect(productionStatus({...base,error:'anything',failureAnalysis:{...failureAnalysis,action:'review-budget'}})).toMatchObject({canResume:false,canUpdateBudget:true});
});
it("shows automatic analysis as progress, without a competing resume",()=>{
 expect(productionStatus({...base,error:'network',automaticRecovery:true})).toMatchObject({running:true,canResume:false,title:'Recovering your saved work'});
});
