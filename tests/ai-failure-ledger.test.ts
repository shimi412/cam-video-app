import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),release:vi.fn()}));
vi.mock("../src/db",()=>({pool:{connect:async()=>mocks,query:mocks.query}}));
import {recordFailedAI,reserveAI,replayAI} from "../src/lib/ai-usage";
import {AIResponseError,type AIResponseFailure} from "../src/lib/ai-response";
const failure:AIResponseFailure={kind:"ai-response-failure-v1",code:"incomplete",finishReason:"length",receipt:{model:"fixture",actualUsd:.069814,usage:{inputTokens:6257,outputTokens:5730,requestId:"remote-id"}}};
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue({rows:[],rowCount:1});});
it("records the exact billed failure once and never fabricates a successful plan",async()=>{
 await recordFailedAI({id:"local-id",failure});
 const calls=mocks.query.mock.calls;
 const update=calls.find(([sql])=>sql.startsWith("UPDATE"))!;
 expect(update[0]).toContain("actual_usd IS NULL");expect(update[0]).toContain("state='uncertain'");
 expect(update[1][0]).toBe(.069814);expect(JSON.parse(update[1][1])).toEqual(failure);
 const insert=calls.find(([sql])=>sql.startsWith("INSERT INTO api_calls"))!;
 expect(insert[1][3]).toBe("0.06981400");expect(JSON.parse(insert[1][4])).toMatchObject({outcome:"incomplete",usage:{requestId:"remote-id"}});
 expect(calls.at(-1)![0]).toBe("COMMIT");expect(mocks.release).toHaveBeenCalledOnce();
});
it("does not duplicate an already recorded charge",async()=>{
 mocks.query.mockResolvedValue({rows:[],rowCount:0});await recordFailedAI({id:"local-id",failure});
 expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
});
it("replays the known error without submitting or reserving a second paid call",async()=>{
 mocks.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT *")?[{input_hash:"same",state:"uncertain",result:failure}]:[],rowCount:1}));
 await expect(reserveAI({id:"local-id",hash:"same",purpose:"production-planning"})).rejects.toBeInstanceOf(AIResponseError);
 expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
 expect(mocks.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
});

it("reads completed receipts without reserving and rejects unconfirmed or mismatched receipts",async()=>{
 mocks.query.mockResolvedValue({rows:[{input_hash:"same",state:"complete",result:{scene:"saved"}}]});
 expect(await replayAI({id:"saved",hash:"same"})).toEqual({result:{scene:"saved"}});
 await expect(replayAI({id:"saved",hash:"different"})).rejects.toThrow(/different inputs/);
 mocks.query.mockResolvedValue({rows:[{input_hash:"same",state:"submitted"}]});
 await expect(replayAI({id:"saved",hash:"same"})).rejects.toThrow(/not be sent twice/);
 expect(mocks.query.mock.calls.every(([sql])=>sql.startsWith("SELECT"))).toBe(true);
});

it('reclaims only a definitively rejected request after a changed transport, once under lock',async()=>{
 const prior={input_hash:'same',state:'uncertain',maximum_usd:.2,result:{kind:'ai-http-rejection-v1',status:404,detail:'No endpoints',wireVersion:'v1',attempts:1}};
 mocks.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT *')?[prior]:[],rowCount:1}));
 await expect(replayAI({id:'saved',hash:'same',retryRejectedVersion:'v1'})).rejects.toThrow('No endpoints');
 expect(await replayAI({id:'saved',hash:'same',retryRejectedVersion:'v2'})).toBeNull();
 expect(await reserveAI({id:'saved',hash:'same',purpose:'cam-agent-step',maximumUsd:.2,retryRejectedVersion:'v2'})).toEqual({replayed:false});
 const update=mocks.query.mock.calls.find(([sql])=>sql.startsWith('UPDATE'))!;expect(JSON.parse(update[1][1])).toMatchObject({kind:'ai-http-inflight-v1',attempts:2,history:[prior.result]});
 prior.state='submitted';prior.result.kind='ai-http-inflight-v1';await expect(replayAI({id:'saved',hash:'same',retryRejectedVersion:'v2'})).rejects.toThrow('not be sent twice');
});
it('does not reclaim unknown, over-budget, or exhausted routing attempts',async()=>{
 const prior={input_hash:'same',state:'uncertain',maximum_usd:.1,result:{kind:'ai-http-rejection-v1',status:404,detail:'No endpoints',wireVersion:'v1',attempts:3}};
 mocks.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT *')?[prior]:[],rowCount:1}));
 await expect(replayAI({id:'saved',hash:'same',retryRejectedVersion:'v2'})).rejects.toThrow('No endpoints');
 prior.result.attempts=1;
 await expect(reserveAI({id:'saved',hash:'same',purpose:'cam-agent-step',maximumUsd:.2,retryRejectedVersion:'v2'})).rejects.toThrow('original spending');expect(mocks.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});
