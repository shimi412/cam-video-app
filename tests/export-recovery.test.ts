import {expect,it,vi} from "vitest";
vi.mock("@/db",()=>({db:{},schema:{}}));
vi.mock("../src/lib/job-lock",()=>({acquireJobLock:vi.fn(),jobWorkerActive:vi.fn()}));
import {exportCanResume,type FormatExports} from "../src/lib/format-exports";
it("resumes only explicitly queued or durable interrupted exports, never failed or legacy running jobs",()=>{
 const state:FormatExports={status:"queued",requestedAt:new Date().toISOString(),files:[]};
 expect(exportCanResume(state)).toBe(true);
 expect(exportCanResume({...state,status:"running"})).toBe(false);
 expect(exportCanResume({...state,status:"running",backgroundManaged:true})).toBe(true);
 expect(exportCanResume({...state,status:"failed",backgroundManaged:true})).toBe(false);
 expect(exportCanResume({...state,status:"complete",backgroundManaged:true})).toBe(false);
 expect(exportCanResume(undefined)).toBe(false);
});
