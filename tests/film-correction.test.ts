import {expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {correctionScenes,filmCorrectionRevisions} from "../src/lib/concept/film-correction";
import {prepareCast} from "../src/lib/concept/cast-preparation";
const comment={id:randomUUID(),target:"a".repeat(64),text:"Keep both characters the same cartoon style, no new carpet or bending over.",seconds:24.2,actor:"human",at:new Date().toISOString()};
it("maps a timed comment to only its scene and respects scene boundaries",()=>{
 const timeline={fps:30,scenes:[{scene:5,startFrame:600,endFrame:720},{scene:6,startFrame:720,endFrame:900}]};
 expect(correctionScenes(comment,timeline)).toEqual([6]);expect(correctionScenes({...comment,seconds:24},timeline)).toEqual([6]);
 expect(()=>correctionScenes({...comment,seconds:null},timeline)).toThrow(/At current time/);
 expect(correctionScenes({...comment,seconds:null,text:"Change the first frame"},timeline)).toEqual([5]);
 expect(correctionScenes({...comment,seconds:null,text:"Change scene 6"},timeline)).toEqual([6]);
 expect(correctionScenes({...comment,seconds:null,text:"Change all scenes"},timeline)).toEqual([5,6]);
 expect(()=>correctionScenes({...comment,seconds:31},timeline)).toThrow(/ending/);
});
it("replaces mismatched cast references only for the corrected scene and retains earlier requests",()=>{
 const cast=prepareCast("Show two soldiers together",6);cast.characters[1].identity="Longer oval face, chestnut hair";
 const previous={6:{note:"Show two soldiers together",attempt:2,cast},5:{note:"Cool daylight",attempt:1}};
 const before=JSON.stringify(previous),result=filmCorrectionRevisions(comment,[6],previous,{"scene-6-start":2});
 expect(Object.keys(result)).toEqual(["6"]);expect(result[6].attempt).toBe(3);expect(result[6].animationContract).toBe(2);
 expect(result[6].cast?.styleContract).toBe(2);expect(result[6].cast?.characters[1].identity).toContain("Soft rounded face");
 expect(result[6].cast?.characters[0].id).not.toBe(cast.characters[0].id);expect(result[6].note).toContain(comment.text);
 expect(JSON.stringify(previous)).toBe(before);
});
it("does not pretend an unsupported sound correction is an image correction",()=>{
 expect(()=>filmCorrectionRevisions({...comment,text:"Reduce music volume"},[6],{},{})).toThrow(/Audio and subtitle/);
});
