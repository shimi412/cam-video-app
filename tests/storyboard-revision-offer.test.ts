import {describe,it,expect} from 'vitest';
import {revisionOfferMatches} from '../src/lib/concept/live-production';
import {sha256,canonicalJson} from '../src/lib/concept/checkpoints';
import {emptyStoryboardFeedback} from '../src/lib/concept/storyboard-feedback';
/** Live refusal 2026-10-22 ("This scene comment changed"): the compiled hash was taken on the in-memory
 * revisions, the saved file was read back through zod, which reorders keys, and the hashes differed. */
describe('storyboard revision offer identity',()=>{
 const revisions={'4':{note:'A clearer scene.',cast:{brief:'same narrator'},attempt:1},'5':{note:'A fresh shot.',attempt:1}};
 const reordered={'4':{note:'A clearer scene.',attempt:1,cast:{brief:'same narrator'}},'5':{attempt:1,note:'A fresh shot.'}};
 const feedback=()=>({...emptyStoryboardFeedback(),comments:{'4':{text:'Pas clair.',actor:'a',at:'2026-10-22T07:30:39.997Z',status:'revision-quoted' as const,message:'Included in the feedback batch.'},'5':{text:'Déjà vu.',actor:'a',at:'2026-10-22T07:31:08.264Z',status:'revision-quoted' as const,message:'Included in the feedback batch.'}},pendingImageRevisions:reordered as never});
 const state=(compiledHash:string)=>({pendingRevision:{scope:'batch' as const,compiledHash,scene:4,scenes:[4,5],notes:{'4':'Pas clair.','5':'Déjà vu.'},noteHash:'x'.repeat(64),attempt:1,target:'t'.repeat(64)},pendingRetries:{'scene-4-start':1,'scene-5-start':1}}) as never;
 it('matches a canonical hash whatever the key order after a zod or JSONB round trip',()=>{
  expect(revisionOfferMatches(state(sha256(canonicalJson(revisions))),feedback())).toBe(true);
 });
 it('still matches a legacy hash through the saved file order, and refuses a changed revision',()=>{
  const legacy=sha256(JSON.stringify(revisions));
  expect(revisionOfferMatches(state(legacy),feedback())).toBe(false);
  expect(revisionOfferMatches(state(legacy),feedback(),revisions)).toBe(true);
  const changed={...revisions,'5':{note:'Another shot.',attempt:1}};
  expect(revisionOfferMatches(state(sha256(canonicalJson(revisions))),{...feedback(),pendingImageRevisions:changed as never},changed)).toBe(false);
 });
});
